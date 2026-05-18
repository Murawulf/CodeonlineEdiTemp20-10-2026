import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNotifications } from '@/contexts/NotificationContext';
import { useApi } from '@/hooks/useApi';

interface Profile {
  id_profile: number;
  role: string | null;
  id_entite: number | null;
  is_suspended: number;
  created_at: string;
  company_name: string | null;
  permissions: Permission[];
  email?: string | null;
  certicode?: string | null;
  created_by_Entite?: number;
}

interface Account {
  id_compte: number;
  id_entite: number;
  email: string;
  name: string | null;
  certicode: string | null;
  is_suspended: number;
  created_at: string;
  id_profile: number | null;
  permissions: Permission[];
}

interface Page {
  page_id: number;
  page_name: string;
}

interface Permission {
  page_id: number;
  page_name: string;
  read: boolean;
  write: boolean;
  hide: boolean;
  apercu?: boolean;
  upload?: boolean;
  delete_file?: boolean;
  create_folder?: boolean;
}

interface Company {
  id_entite: number;
  raison_socialle: string;
}

const Profile: React.FC = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suspendedAccounts, setSuspendedAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState({
    profiles: false,
    pages: false,
    companies: false,
    suspendedAccounts: false,
  });
  const [suspending, setSuspending] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [suspendedAccountsModalOpen, setSuspendedAccountsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [currentTab, setCurrentTab] = useState<'Global' | 'TPO' | 'Entite'>('Global');
  const modalRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const suspendedAccountsModalRef = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState('');
  const [idEntite, setIdEntite] = useState<number | null>(null);
  const [profileType, setProfileType] = useState<'model' | 'company' | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [idCompte, setIdCompte] = useState<number | null>(null);
  const [userProducerName, setUserProducerName] = useState<string | null>(null);
  const [userIdEntite, setUserIdEntite] = useState<number | null>(null);
  const [isNetconsultingUser, setIsNetconsultingUser] = useState(false);
  const [allowEntitySelect, setAllowEntitySelect] = useState(true);
  const [fixedEntity, setFixedEntity] = useState<string | null>(null);

  const netconsultingId = useMemo(() =>
    companies.find(c => c.raison_socialle.toLowerCase() === 'netconsulting europe ltd')?.id_entite,
    [companies]
  );

  const cepexId = 999;

  const netconsultingName = useMemo(() =>
    companies.find(c => c.raison_socialle.toLowerCase() === 'netconsulting europe ltd')?.raison_socialle,
    [companies]
  );

  const cepexName = useMemo(() =>
    companies.find(c => c.id_entite === cepexId)?.raison_socialle || 'Asepex',
    [companies]
  );

  const filteredCompaniesForSelect = useMemo(() =>
    companies.filter(c => c.id_entite !== netconsultingId && c.id_entite !== cepexId),
    [companies, netconsultingId, cepexId]
  );

  const parentKeywords = ['EDI', 'Produits', 'Paramètres'];

  // === USER FROM LOCALSTORAGE ===
  useEffect(() => {
    const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (raw) {
      try {
        const parsedUser = JSON.parse(raw);
        if (parsedUser.id_compte) {
          setIdCompte(parsedUser.id_compte);
        }
        if (parsedUser.id_entite) {
          setUserIdEntite(parsedUser.id_entite);
        }
        if (parsedUser.producer_name) {
          setUserProducerName(parsedUser.producer_name);
          setIsNetconsultingUser(parsedUser.producer_name.toLowerCase() === 'netconsulting europe ltd');
        }
      } catch (err) {
        console.error('Profile: Failed to parse user from localStorage', err);
        addNotification('Erreur de chargement utilisateur', 'error');
      }
    }
  }, [addNotification]);

  // === FETCH PROFILES ===
  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, profiles: true }));
      setError(null);
      const res = await api.get(`/api/profiles`, {
        withCredentials: true,
        timeout: 10000,
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setProfiles(data);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec de la récupération des profils';
      addNotification(msg, 'error');
      setProfiles([]);
    } finally {
      setLoading(prev => ({ ...prev, profiles: false }));
    }
  }, [addNotification]);

  // === FETCH PAGES (CORRIGÉ) ===
  const fetchPages = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, pages: true }));
      setError(null);
      const res = await api.get(`/api/pages`, {
        withCredentials: true,
        timeout: 10000,
      });

      const raw = res.data;
      const data: Page[] = Array.isArray(raw) ? raw : [];
      setPages(data);

      if (data.length > 0) {
        setPermissions(
          data.map((page: Page) => ({
            page_id: page.page_id,
            page_name: page.page_name,
            read: false,
            write: false,
            hide: false,
            ...(page.page_name.toLowerCase() === 'media' ? {
              apercu: false,
              upload: false,
              delete_file: false,
              create_folder: false,
            } : {}),
          }))
        );
      } else {
        setPermissions([]);
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec de la récupération des pages';
      console.error('fetchPages error:', error);
      addNotification(msg, 'error');
      setPages([]);
      setPermissions([]);
    } finally {
      setLoading(prev => ({ ...prev, pages: false }));
    }
  }, [addNotification]);

  // === FETCH COMPANIES ===
  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, companies: true }));
      setError(null);
      const res = await api.get(`/api/companies`, {
        withCredentials: true,
        timeout: 10000,
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setCompanies(data);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec de la récupération des entreprises';
      addNotification(msg, 'error');
      setCompanies([]);
    } finally {
      setLoading(prev => ({ ...prev, companies: false }));
    }
  }, [addNotification]);

  // === FETCH SUSPENDED ACCOUNTS ===
  const fetchSuspendedAccounts = useCallback(async (profileId: number) => {
    try {
      setLoading(prev => ({ ...prev, suspendedAccounts: true }));
      const res = await api.get(`/api/comptes?profile_id=${profileId}&is_suspended=1`, {
        withCredentials: true,
        timeout: 10000,
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setSuspendedAccounts(data);
      setSuspendedAccountsModalOpen(true);
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec de la récupération des comptes suspendus';
      addNotification(msg, 'error');
    } finally {
      setLoading(prev => ({ ...prev, suspendedAccounts: false }));
    }
  }, [addNotification]);

  // === INITIAL FETCH ===
  useEffect(() => {
    fetchProfiles();
    fetchPages();
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === CLICK OUTSIDE MODALS ===
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(null);
        setMenuPosition(null);
      }
      if (suspendedAccountsModalRef.current && !suspendedAccountsModalRef.current.contains(event.target as Node)) {
        setSuspendedAccountsModalOpen(false);
      }
    };
    if (modalOpen || actionMenuOpen !== null || suspendedAccountsModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modalOpen, actionMenuOpen, suspendedAccountsModalOpen]);

  // === RESET FORM ===
  const resetForm = () => {
    setRole('');
    setIdEntite(null);
    setProfileType(null);
    setFixedEntity(null);
    setAllowEntitySelect(true);
    setPermissions(
      pages.map(page => ({
        page_id: page.page_id,
        page_name: page.page_name,
        read: false,
        write: false,
        hide: false,
        ...(page.page_name.toLowerCase() === 'media' ? {
          apercu: false,
          upload: false,
          delete_file: false,
          create_folder: false,
        } : {}),
      }))
    );
  };

  // === OPEN MODAL ===
  const openNewModal = (tab?: string | null) => {
    resetForm();
    setEditingProfile(null);
    if (isNetconsultingUser) {
      if (tab === 'Global' || tab === 'TPO') {
        setProfileType('company');
      } else if (tab === 'Entite') {
        setProfileType('model');
      }
      if (tab === 'Global') {
        setFixedEntity(netconsultingName || '');
        setIdEntite(netconsultingId || null);
        setAllowEntitySelect(false);
      } else if (tab === 'TPO') {
        setFixedEntity(cepexName);
        setIdEntite(cepexId || null);
        setAllowEntitySelect(false);
      } else if (tab === 'Entite') {
        setFixedEntity('Tous');
        setIdEntite(null);
        setAllowEntitySelect(false);
      }
    } else {
      setProfileType(null);
      setFixedEntity(userProducerName || '');
      setIdEntite(userIdEntite || null);
      setAllowEntitySelect(false);
    }
    setModalOpen(true);
  };

  // === PROFILE TYPE CHANGE ===
  const handleProfileTypeChange = (type: 'model' | 'company') => {
    setProfileType(type);
    if (type === 'model') {
      setFixedEntity('Tous');
      setIdEntite(null);
      setAllowEntitySelect(false);
      setCurrentTab('Entite');
    } else {
      if (currentTab === 'TPO') {
        setFixedEntity(cepexName);
        setIdEntite(cepexId || null);
      } else {
        setFixedEntity(netconsultingName || '');
        setIdEntite(netconsultingId || null);
      }
      setAllowEntitySelect(false);
    }
  };

  // === OPEN EDIT MODAL ===
  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setRole(profile.role || '');
    setProfileType(null);
    setIdEntite(profile.id_entite);
    setFixedEntity(profile.company_name || '');
    setAllowEntitySelect(false);
    setPermissions(
      pages.map(page => {
        const perm = profile.permissions.find(p => p.page_id === page.page_id);
        return {
          page_id: page.page_id,
          page_name: page.page_name,
          read: perm ? !!perm.read : false,
          write: perm ? !!perm.write : false,
          hide: perm ? !!perm.hide : false,
          ...(page.page_name.toLowerCase() === 'media' ? {
            apercu: perm ? !!perm.apercu : false,
            upload: perm ? !!perm.upload : false,
            delete_file: perm ? !!perm.delete_file : false,
            create_folder: perm ? !!perm.create_folder : false,
          } : {}),
        };
      })
    );
    setModalOpen(true);
  };

  // === PERMISSION CHANGE ===
  const handlePermissionChange = (pageId: number, field: keyof Permission) => {
    setPermissions(prev => {
      const newPermissions = [...prev];
      const index = newPermissions.findIndex(perm => perm.page_id === pageId);
      if (index === -1) return prev;
      const currentValue = newPermissions[index][field] as boolean;
      const newValue = !currentValue;
      newPermissions[index] = { ...newPermissions[index], [field]: newValue };
      const pageName = newPermissions[index].page_name;
      if (parentKeywords.some(keyword => keyword.toLowerCase() === pageName.toLowerCase())) {
        newPermissions.forEach((perm, i) => {
          if (perm.page_name.toLowerCase().startsWith(pageName.toLowerCase() + '/')) {
            newPermissions[i] = { ...perm, [field]: newValue };
          }
        });
      }
      return newPermissions;
    });
  };

  // === SELECT ALL ===
  const handleSelectAllPermissions = () => {
    setPermissions(prev =>
      prev.map(perm => ({
        ...perm,
        read: true,
        write: true,
        hide: perm.hide,
        ...(perm.page_name.toLowerCase() === 'media' ? {
          apercu: true,
          upload: true,
          delete_file: true,
          create_folder: true,
        } : {}),
      }))
    );
  };

  // === SUBMIT ===
  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!permissions.some(perm =>
      perm.read || perm.write || perm.hide ||
      (perm.page_name.toLowerCase() === 'media' && (perm.apercu || perm.upload || perm.delete_file || perm.create_folder))
    )) {
      addNotification('Au moins une permission doit être définie', 'error');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const createdBy = isNetconsultingUser ? netconsultingId : userIdEntite;
    const profileData = {
      id_entite: idEntite,
      role: role || null,
      created_by_Entite: createdBy,
      permissions: permissions.map(perm => ({
        page_id: perm.page_id,
        read: perm.read ? 1 : 0,
        write: perm.write ? 1 : 0,
        hide: perm.hide ? 1 : 0,
        ...(perm.page_name.toLowerCase() === 'media' ? {
          apercu: perm.apercu ? 1 : 0,
          upload: perm.upload ? 1 : 0,
          delete_file: perm.delete_file ? 1 : 0,
          create_folder: perm.create_folder ? 1 : 0,
        } : {}),
      })),
    };
    try {
      if (editingProfile) {
        await api.put(`/api/profiles/${editingProfile.id_profile}`, profileData, { withCredentials: true });
        addNotification('Profil mis à jour avec succès', 'success');
      } else {
        await api.post(`/api/profiles`, profileData, { withCredentials: true });
        addNotification('Profil créé avec succès', 'success');
      }
      setModalOpen(false);
      fetchProfiles();
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec de l\'enregistrement';
      addNotification(msg, 'error');
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // === SUSPEND / REACTIVATE ===
  const handleSuspend = async (id: number, isSuspended: number) => {
    if (!window.confirm(`Voulez-vous vraiment ${isSuspended ? 'réactiver' : 'suspendre'} ce profil ?`)) return;
    setSuspending(id);
    try {
      await api.patch(`/api/profiles/${id}/suspend`, { is_suspended: isSuspended ? 0 : 1 }, { withCredentials: true });
      addNotification(`Profil ${isSuspended ? 'réactivé' : 'suspendu'}`, 'success');
      fetchProfiles();
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Échec mise à jour statut';
      addNotification(msg, 'error');
    } finally {
      setSuspending(null);
    }
  };

  // === ACTION MENU ===
  const handleActionButtonClick = (profileId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    });
    setActionMenuOpen(actionMenuOpen === profileId ? null : profileId);
  };

  // === GROUP PERMISSIONS ===
  const groupPermissions = (permissions: Permission[]) => {
    const groups: { [key: string]: Permission[] } = {};
    const ungrouped: Permission[] = [];
    permissions.forEach(perm => {
      const pageName = perm.page_name;
      let grouped = false;
      for (const keyword of parentKeywords) {
        if (pageName.toLowerCase() === keyword.toLowerCase()) {
          if (!groups[keyword]) groups[keyword] = [perm];
          else groups[keyword].unshift(perm);
          grouped = true;
          break;
        } else if (pageName.toLowerCase().startsWith(keyword.toLowerCase() + '/')) {
          if (!groups[keyword]) groups[keyword] = [];
          groups[keyword].push(perm);
          grouped = true;
          break;
        }
      }
      if (!grouped) ungrouped.push(perm);
    });
    const groupedPermissions: Permission[] = [];
    parentKeywords.forEach(keyword => {
      if (groups[keyword]) groupedPermissions.push(...groups[keyword]);
    });
    groupedPermissions.push(...ungrouped);
    return groupedPermissions;
  };

  // === FILTERED PROFILES ===
  const filteredProfiles = useMemo(() => {
    if (!isNetconsultingUser) return [];
    const netId = netconsultingId;
    if (!netId) return [];
    return profiles.filter(p => {
      if (currentTab === 'Global') return p.id_entite === netId;
      if (currentTab === 'TPO') return p.id_entite === cepexId;
      if (currentTab === 'Entite') return p.id_entite === null && (p.created_by_Entite === netId || p.created_by_Entite === null);
      return false;
    });
  }, [profiles, currentTab, isNetconsultingUser, netconsultingId, cepexId]);

  const models = useMemo(() => {
    const netId = netconsultingId;
    if (!netId) return profiles.filter(p => p.id_entite === null);
    return profiles.filter(p => p.id_entite === null && (p.created_by_Entite === netId || p.created_by_Entite == null));
  }, [profiles, netconsultingId]);

  const ownProfiles = useMemo(() => {
    if (!userIdEntite) return [];
    return profiles.filter(p => p.id_entite === userIdEntite && p.created_by_Entite === userIdEntite);
  }, [profiles, userIdEntite]);

  const isLoading = loading.profiles || loading.pages || loading.companies;

  // === TABLE COMPONENT ===
  const ProfilesTable = ({ profileList, title, showActions = true }: { profileList: Profile[]; title?: string; showActions?: boolean }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-200 shadow-sm">
        <thead>
          <tr className="bg-blue-950 text-white text-sm font-medium">
            <th className="border border-gray-200 p-3 text-center w-[80px]">ID</th>
            <th className="border border-gray-200 p-3 text-left">Nom Profil</th>
            <th className="border border-gray-200 p-3 text-left">Entité</th>
            <th className="border border-gray-200 p-3 text-center w-[120px]">Statut</th>
            {showActions && <th className="border border-gray-200 p-3 text-center w-[80px]">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {profileList.length === 0 ? (
            <tr>
              <td colSpan={showActions ? 5 : 4} className="border border-gray-200 p-3 text-center text-gray-500">
                Aucun profil disponible
              </td>
            </tr>
          ) : (
            profileList.map((profile, index) => {
              const canManageProfile = isNetconsultingUser || profile.created_by_Entite === userIdEntite;
              const rowClass = `${profile.is_suspended ? 'bg-gray-100' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-200`;
              return (
                <tr key={profile.id_profile} className={rowClass}>
                  <td className="border border-gray-200 p-3 text-center text-sm">{profile.id_profile}</td>
                  <td className="border border-gray-200 p-3 text-left text-sm truncate max-w-[300px]">{profile.role || 'N/A'}</td>
                  <td className="border border-gray-200 p-3 text-left text-sm truncate max-w-[300px]">{profile.company_name || 'Tous'}</td>
                  <td className="border border-gray-200 p-3 text-center text-sm">{profile.is_suspended ? 'Suspendue' : 'Actif'}</td>
                  {showActions && canManageProfile && (
                    <td className="border border-gray-200 p-3 text-center">
                      <button
                        onClick={(e) => handleActionButtonClick(profile.id_profile, e)}
                        className={`px-3 py-1 bg-blue-950 text-white rounded hover:bg-blue-800 text-base ${suspending === profile.id_profile ? 'opacity-50' : ''}`}
                        disabled={suspending === profile.id_profile}
                      >
                        {suspending === profile.id_profile ? '...' : 'Actions'}
                      </button>
                      {actionMenuOpen === profile.id_profile && menuPosition && (
                        <div ref={actionMenuRef} className="fixed z-20 w-48 bg-white border border-gray-200 rounded shadow-lg" style={{ top: menuPosition.top, left: menuPosition.left }}>
                          <button onClick={() => openEditModal(profile)} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">Modifier</button>
                          <button onClick={() => handleSuspend(profile.id_profile, profile.is_suspended)} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">
                            {profile.is_suspended ? 'Réactiver' : 'Suspendre'}
                          </button>
                          <button onClick={() => fetchSuspendedAccounts(profile.id_profile)} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100" disabled={loading.suspendedAccounts}>
                            {loading.suspendedAccounts ? '...' : 'Comptes suspendus'}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const renderSection = (title: string, profileList: Profile[], showActions = true) => (
    <div className="mb-6">
      <h4 className="text-lg font-medium mb-2 text-blue-950">{title}</h4>
      {profileList.length === 0 ? <p className="text-gray-500">Aucun profil disponible</p> : <ProfilesTable profileList={profileList} showActions={showActions} />}
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Paramètres</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Profils</span>
      </nav>
      <div className="p-6">

        <div className="max-w-7xl mx-auto mt-6">
          <div className="flex justify-between items-center mb-4">
            {isNetconsultingUser ? (
              <div className="flex border-b">
                {['Global', 'TPO', 'Entite'].map(tab => (
                  <button
                    key={tab}
                    className={`px-4 py-2 capitalize text-base ${currentTab === tab ? 'border-b-2 border-blue-950 text-blue-950 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => setCurrentTab(tab as 'Global' | 'TPO' | 'Entite')}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex border-b">
                <span className="px-4 py-2 capitalize text-base border-b-2 border-blue-950 text-blue-950 bg-blue-50">Nos Profils</span>
              </div>
            )}
            <button
              onClick={() => openNewModal(isNetconsultingUser ? currentTab : null)}
              className="px-4 py-2 bg-blue-950 text-white rounded hover:bg-blue-800 text-sm font-medium"
              disabled={isLoading}
            >
              Ajouter profil
            </button>
          </div>

          <div className="mt-4 border-2 border-blue-950 rounded-lg p-4 bg-white">
            {isLoading && <p className="text-gray-600">Chargement...</p>}
            {error && (
              <div className="p-6 text-center">
                <p className="text-red-600">{error}</p>
                <button onClick={() => { setError(null); fetchProfiles(); fetchPages(); fetchCompanies(); }} className="mt-2 bg-blue-950 text-white px-4 py-2 rounded hover:bg-blue-800">
                  Réessayer
                </button>
              </div>
            )}
            {!isLoading && !error && (
              <>
                {isNetconsultingUser ? (
                  filteredProfiles.length === 0 ? <p>Aucun profil disponible</p> : <ProfilesTable profileList={filteredProfiles} />
                ) : (
                  <>
                    {renderSection('Modèles Globaux', models, false)}
                    {renderSection('Nos Profils', ownProfiles, true)}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* === MODAL === */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div ref={modalRef} className="bg-white p-6 rounded w-[600px] max-h-[90vh] overflow-auto">
              <h2 className="text-xl font-medium mb-4 text-blue-950">
                {editingProfile ? 'Modifier le profil' : 'Nouveau profil'}
              </h2>

              {isNetconsultingUser && !editingProfile && (
                <div className="flex space-x-4 mb-4">
                  <label className="flex items-center">
                    <input type="radio" name="profileType" checked={profileType === 'model'} onChange={() => handleProfileTypeChange('model')} className="h-4 w-4" />
                    <span className="ml-2">Modèle</span>
                  </label>
                  <label className="flex items-center">
                    <input type="radio" name="profileType" checked={profileType === 'company'} onChange={() => handleProfileTypeChange('company')} className="h-4 w-4" />
                    <span className="ml-2">Profil entreprise</span>
                  </label>
                </div>
              )}

              <label className="block mb-2 font-medium text-gray-700">Entité</label>
              {allowEntitySelect ? (
                <select className="w-full border rounded p-2 mb-4" value={idEntite || ''} onChange={e => setIdEntite(Number(e.target.value) || null)}>
                  <option value="">Sélectionner</option>
                  {filteredCompaniesForSelect.map(c => <option key={c.id_entite} value={c.id_entite}>{c.raison_socialle}</option>)}
                </select>
              ) : (
                <div className="w-full border rounded p-2 mb-4 bg-gray-100">{fixedEntity || 'N/A'}</div>
              )}

              <label className="block mb-2 font-medium text-gray-700">Nom Profil</label>
              <input type="text" className="w-full border rounded p-2 mb-4" value={role} onChange={e => setRole(e.target.value)} placeholder="Optionnel" />

              <label className="block mb-2 font-medium text-gray-700">Permissions</label>
              <button onClick={handleSelectAllPermissions} className="mb-2 bg-blue-950 text-white px-4 py-2 rounded hover:bg-blue-800 text-sm">
                Tout sélectionner
              </button>
              <div className="mb-4">
                {groupPermissions(permissions).map(perm => {
                  const isSubpage = parentKeywords.some(k => perm.page_name.toLowerCase().startsWith(k.toLowerCase() + '/'));
                  const isMedia = perm.page_name.toLowerCase() === 'media';
                  return (
                    <div key={perm.page_id} className={`flex items-center mb-2 ${isSubpage ? 'pl-6 border-l-4 border-blue-500' : ''}`}>
                      <span className="w-1/3 text-sm">{perm.page_name}</span>
                      {isMedia ? (
                        <>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.apercu} onChange={() => handlePermissionChange(perm.page_id, 'apercu')} className="h-4 w-4" /><span className="ml-1 text-sm">Aperçu</span></label>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.upload} onChange={() => handlePermissionChange(perm.page_id, 'upload')} className="h-4 w-4" /><span className="ml-1 text-sm">Upload</span></label>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.delete_file} onChange={() => handlePermissionChange(perm.page_id, 'delete_file')} className="h-4 w-4" /><span className="ml-1 text-sm">Suppr</span></label>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.create_folder} onChange={() => handlePermissionChange(perm.page_id, 'create_folder')} className="h-4 w-4" /><span className="ml-1 text-sm">Dossier</span></label>
                        </>
                      ) : (
                        <>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.read} onChange={() => handlePermissionChange(perm.page_id, 'read')} className="h-4 w-4" /><span className="ml-1 text-sm">Lire</span></label>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.write} onChange={() => handlePermissionChange(perm.page_id, 'write')} className="h-4 w-4" /><span className="ml-1 text-sm">Éditer</span></label>
                          <label className="w-1/6 flex items-center"><input type="checkbox" checked={perm.hide} onChange={() => handlePermissionChange(perm.page_id, 'hide')} className="h-4 w-4" /><span className="ml-1 text-sm">Masquer</span></label>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end space-x-4">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Annuler</button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (isNetconsultingUser && !editingProfile && !profileType)}
                  className={`px-4 py-2 bg-blue-950 text-white rounded ${isSubmitting ? 'opacity-50' : 'hover:bg-blue-800'}`}
                >
                  {isSubmitting ? '...' : editingProfile ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === SUSPENDED ACCOUNTS MODAL === */}
        {suspendedAccountsModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div ref={suspendedAccountsModalRef} className="bg-white p-6 rounded w-[600px] max-h-[90vh] overflow-auto">
              <h2 className="text-xl font-medium mb-4 text-blue-950">Comptes Suspendus</h2>
              {loading.suspendedAccounts ? (
                <p>Chargement...</p>
              ) : suspendedAccounts.length === 0 ? (
                <p>Aucun compte suspendu.</p>
              ) : (
                <table className="w-full border-collapse border border-gray-300">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="border p-2">ID</th>
                      <th className="border p-2">Email</th>
                      <th className="border p-2">Nom</th>
                      <th className="border p-2">Entité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suspendedAccounts.map(acc => (
                      <tr key={acc.id_compte} className="bg-gray-100">
                        <td className="border p-2">{acc.id_compte}</td>
                        <td className="border p-2">{acc.email}</td>
                        <td className="border p-2">{acc.name || 'N/A'}</td>
                        <td className="border p-2">{companies.find(c => c.id_entite === acc.id_entite)?.raison_socialle || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex justify-end mt-4">
                <button onClick={() => setSuspendedAccountsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;