import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNotifications } from '@/contexts/NotificationContext';

// Hard-code the PIN here as a constant (based on your info)
const API_PIN = '3311';

interface Account {
  id_compte: number;
  id_entite: number;
  email: string;
  name: string | null;
  prenom: string | null;
  certicode: string | null;
  is_suspended: number;
  created_at: string;
  profile_id: number | null;
  permissions: AccountPermission[];
  producer_name?: string | null;
}
interface AccountPermission {
  page_id: number;
  page_name?: string;
  read: boolean;
  write: boolean;
  hide: boolean;
  apercu?: boolean;
  upload?: boolean;
  delete_file?: boolean;
  create_folder?: boolean;
}
interface Profile {
  id_profile: number;
  role: string | null;
  is_suspended: number;
  id_entite: number | null;
  company_name: string | null;
}
interface Page {
  page_id: number;
  page_name: string;
}
interface Company {
  id_entite: number;
  raison_socialle: string;
}
const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api`;
const Comptes: React.FC = () => {
  const { addNotification } = useNotifications();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [prenom, setPrenom] = useState('');
  const [idProducteur, setIdProducteur] = useState<number | ''>('');
  const [profileId, setProfileId] = useState<number | ''>('');
  const [selectedPageId, setSelectedPageId] = useState<number | ''>('');
  const [tempPermissions, setTempPermissions] = useState<Partial<AccountPermission>>({
    read: false,
    write: false,
    hide: false,
    apercu: false,
    upload: false,
    delete_file: false,
    create_folder: false,
  });
  const [configuredPermissions, setConfiguredPermissions] = useState<AccountPermission[]>([]);
  const [editingPermId, setEditingPermId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [suspending, setSuspending] = useState<number | null>(null);
  const [isInitialFetch, setIsInitialFetch] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Account | 'raison_socialle' | 'profile' | null;
    direction: 'ASC' | 'DESC' | null;
  }>({
    key: null,
    direction: null,
  });
  const [idCompte, setIdCompte] = useState<number | null>(null);
  const [userIdProducteur, setUserIdProducteur] = useState<number | null>(null);
  const [userProducerName, setUserProducerName] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<Account | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [managedEntityIds, setManagedEntityIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEntity, setFilterEntity] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const modalRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const parentKeywords = ['EDI', 'Produits', 'Paramètres'];
  const isSpecialUser = useMemo(() => {
    return userIdProducteur === 111 || userIdProducteur === 999;
  }, [userIdProducteur]);
  const isAdminUser = useMemo(() => {
    if (isSpecialUser) return true;
    if (!userAccount?.profile_id) return false;
    const profile = profiles.find((p) => p.id_profile === userAccount.profile_id);
    if (!profile) return false;
    const roleLower = profile.role?.toLowerCase() || '';
    const adminKeywords = ['superviseur', 'admin'];
    return adminKeywords.some((kw) => roleLower.includes(kw));
  }, [isSpecialUser, userAccount, profiles]);
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.id_compte) {
          setIdCompte(parsedUser.id_compte);
        } else {
          addNotification('Utilisateur non authentifié, id_compte manquant', 'error');
        }
        if (parsedUser.id_entite) {
          setUserIdProducteur(parsedUser.id_entite);
        }
        if (parsedUser.producer_name) {
          setUserProducerName(parsedUser.producer_name);
        }
      } catch (err) {
        addNotification('Erreur lors du chargement de l\'utilisateur', 'error');
      }
    } else {
      addNotification('Aucun utilisateur connecté', 'error');
    }
  }, [addNotification]);
  const fetchUserAccount = useCallback(async () => {
    if (!idCompte) return;
    try {
      const res = await axios.get<Account>(`${API_BASE_URL}/comptes/${idCompte}`, { withCredentials: true });
      setUserAccount(res.data);
    } catch (error: any) {
      addNotification('Erreur lors du chargement du compte utilisateur', 'error');
    }
  }, [idCompte, addNotification]);
  useEffect(() => {
    if (idCompte && !userAccount) {
      fetchUserAccount();
    }
  }, [idCompte, userAccount, fetchUserAccount]);
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await axios.get<Profile[]>(`${API_BASE_URL}/profiles`, { withCredentials: true });
      setProfiles(res.data);
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Échec de la récupération des profils', 'error');
    }
  }, [addNotification]);
  const fetchCompanies = useCallback(async () => {
    try {
      const res = await axios.get<Company[]>(`${API_BASE_URL}/companies`, { 
        withCredentials: true,
        headers: { 'x-api-pin': API_PIN } // Add PIN header here
      });
      setCompanies(res.data);
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Échec de la récupération des entreprises', 'error');
    }
  }, [addNotification]);
  const fetchPages = useCallback(async () => {
    try {
      const res = await axios.get<Page[]>(`${API_BASE_URL}/pages`, { withCredentials: true });
      setPages(res.data);
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Échec de la récupération des pages', 'error');
    }
  }, [addNotification]);
  const fetchManagedEntities = useCallback(async () => {
    try {
      const res = await axios.get<Company[]>(`${API_BASE_URL}/companies`, {
        headers: { 'x-api-pin': API_PIN }, // Use defined PIN and consistent header key
        withCredentials: true,
      });
      setManagedEntityIds(res.data.map((c) => c.id_entite));
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Échec de la récupération des entités', 'error');
    }
  }, [addNotification]);
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get<Account[]>(`${API_BASE_URL}/comptes`, { 
        withCredentials: true,
        headers: { 'x-api-pin': API_PIN } // Already hard-coded, but using constant for consistency
      });

      let filteredAccounts = res.data;

      if (userIdProducteur === 111 || userIdProducteur === 999) {
        // Special user - no filters
      } else {
        filteredAccounts = filteredAccounts.filter((account) => {
          if (!account.profile_id) return true;
          const profile = profiles.find((p) => p.id_profile === account.profile_id);
          return profile && profile.is_suspended === 0;
        });

        if (userIdProducteur) {
          filteredAccounts = filteredAccounts.filter((account) => account.id_entite === userIdProducteur);
        } else {
          filteredAccounts = filteredAccounts.filter((account) => account.id_compte === idCompte);
        }
      }

      setAccounts(filteredAccounts);
      setDataLoaded(true);
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Échec de la récupération des comptes', 'error');
    } finally {
      setLoading(false);
    }
  }, [profiles, addNotification, isSpecialUser, userIdProducteur, idCompte, managedEntityIds, isAdminUser]);
  useEffect(() => {
    if (isInitialFetch) {
      const fetches = [fetchProfiles(), fetchCompanies(), fetchPages()];
      if (userIdProducteur === 999) {
        fetches.push(fetchManagedEntities());
      }
      Promise.all(fetches)
        .then(() => {
          setIsInitialFetch(false);
        })
        .catch(() => {
          addNotification('Échec du chargement initial des données', 'error');
        });
    }
  }, [fetchProfiles, fetchCompanies, fetchPages, fetchManagedEntities, isInitialFetch, addNotification, userIdProducteur]);
  useEffect(() => {
    if (!isInitialFetch && profiles.length > 0 && !dataLoaded) {
      fetchAccounts();
    }
  }, [fetchAccounts, isInitialFetch, profiles, dataLoaded]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(null);
        setMenuPosition(null);
      }
    };
    if (modalOpen || actionMenuOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modalOpen, actionMenuOpen]);
  const resetForm = () => {
    setEmail('');
    setName('');
    setPrenom('');
    setIdProducteur('');
    setProfileId('');
    setCustomRole('');
    setUseCustomPermissions(false);
    setSelectedPageId('');
    setTempPermissions({
      read: false,
      write: false,
      hide: false,
      apercu: false,
      upload: false,
      delete_file: false,
      create_folder: false,
    });
    setConfiguredPermissions([]);
    setEditingPermId(null);
  };
  const openNewModal = () => {
    setEditingAccount(null);
    resetForm();
    if (!isSpecialUser && userIdProducteur) {
      setIdProducteur(userIdProducteur);
    }
    setTimeout(() => setModalOpen(true), 100);
  };
  const openEditModal = async (account: Account) => {
    setEditingAccount(account);
    setEmail(account.email);
    setName(account.name || '');
    setPrenom(account.prenom || '');
    setIdProducteur(account.id_entite);
    setProfileId(account.profile_id || '');
    const profile = profiles.find((p) => p.id_profile === account.profile_id);
    const isCustom = !!profile?.role?.startsWith('Custom');
    setUseCustomPermissions(isCustom);
    setCustomRole(isCustom ? profile.role || '' : '');
    if (isCustom) {
      try {
        const res = await axios.get<AccountPermission[]>(
          `${API_BASE_URL}/account-permissions/${account.id_compte}`,
          { withCredentials: true }
        );
        const perms = res.data.map((perm) => ({
          page_id: perm.page_id,
          page_name: pages.find((page) => page.page_id === perm.page_id)?.page_name || '',
          read: !!perm.read,
          write: !!perm.write,
          hide: !!perm.hide,
          apercu: !!perm.apercu,
          upload: !!perm.upload,
          delete_file: !!perm.delete_file,
          create_folder: !!perm.create_folder,
        }));
        setConfiguredPermissions(perms);
      } catch (error: any) {
        addNotification(error.response?.data?.error || 'Échec de la récupération des permissions du compte', 'error');
      }
    } else {
      setConfiguredPermissions([]);
    }
    setModalOpen(true);
  };
  const handleTempPermissionChange = (field: keyof AccountPermission) => {
    setTempPermissions((prev) => ({ ...prev, [field]: !prev[field] }));
  };
  const applyPagePermissions = () => {
    if (!selectedPageId) return;
    const page = pages.find((p) => p.page_id === Number(selectedPageId));
    if (!page) return;
    const isMedia = page.page_name.toLowerCase() === 'media';
    const newPerm: AccountPermission = {
      page_id: page.page_id,
      page_name: page.page_name,
      read: !!tempPermissions.read,
      write: !!tempPermissions.write,
      hide: !!tempPermissions.hide,
    };
    if (isMedia) {
      newPerm.apercu = !!tempPermissions.apercu;
      newPerm.upload = !!tempPermissions.upload;
      newPerm.delete_file = !!tempPermissions.delete_file;
      newPerm.create_folder = !!tempPermissions.create_folder;
    }
    setConfiguredPermissions((prev) => {
      const updated = prev.filter((p) => p.page_id !== page.page_id);
      return [...updated, newPerm];
    });
    setTempPermissions({
      read: false,
      write: false,
      hide: false,
      apercu: false,
      upload: false,
      delete_file: false,
      create_folder: false,
    });
    setSelectedPageId('');
    setEditingPermId(null);
  };
  const startEditingPerm = (perm: AccountPermission) => {
    setEditingPermId(perm.page_id);
    setSelectedPageId(perm.page_id);
    setTempPermissions({
      read: perm.read,
      write: perm.write,
      hide: perm.hide,
      apercu: perm.apercu || false,
      upload: perm.upload || false,
      delete_file: perm.delete_file || false,
      create_folder: perm.create_folder || false,
    });
  };
  const cancelEditingPerm = () => {
    setEditingPermId(null);
    setSelectedPageId('');
    setTempPermissions({
      read: false,
      write: false,
      hide: false,
      apercu: false,
      upload: false,
      delete_file: false,
      create_folder: false,
    });
  };
  const removeConfiguredPermission = (pageId: number) => {
    setConfiguredPermissions((prev) => prev.filter((p) => p.page_id !== pageId));
  };
  const handleSelectAllPermissions = () => {
    const allPerms = pages.map((page) => {
      const isMedia = page.page_name.toLowerCase() === 'media';
      return {
        page_id: page.page_id,
        page_name: page.page_name,
        read: true,
        write: true,
        hide: false,
        ...(isMedia && {
          apercu: true,
          upload: true,
          delete_file: true,
          create_folder: true,
        }),
      };
    });
    setConfiguredPermissions(allPerms);
  };
  const handleCustomPermissionsChange = (checked: boolean) => {
    setUseCustomPermissions(checked);
    if (checked) {
      setProfileId('');
    } else {
      setProfileId('');
      setCustomRole('');
      setConfiguredPermissions([]);
    }
  };
  const handleProfileChange = (value: string) => {
    setProfileId(value ? Number(value) : '');
    if (value) {
      setUseCustomPermissions(false);
      setCustomRole('');
      setConfiguredPermissions([]);
    }
  };
  const handleEntityChange = (value: string) => {
    if (isSpecialUser) {
      setIdProducteur(value ? Number(value) : '');
    }
  };
  const generateRandomPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };
  const handleSendConnectionInfo = async (account: Account) => {
    try {
      const newPassword = generateRandomPassword();
      await axios.post(
        `${API_BASE_URL}/send-connection-info`,
        { email: account.email, password: newPassword },
        { withCredentials: true }
      );
      await axios.put(
        `${API_BASE_URL}/comptes/${account.id_compte}`,
        {
          email: account.email,
          password: newPassword,
          id_entite: account.id_entite || 1,
          profile_id: account.profile_id || 8,
        },
        { withCredentials: true }
      );
      addNotification('Fiche de connexion envoyée avec succès', 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || "Erreur lors de l'envoi de la fiche de connexion", 'error');
    }
  };
  const handleSubmit = async () => {
    if (!email) {
      addNotification("L'email est requis", 'error');
      return;
    }
    if (useCustomPermissions && !customRole.trim()) {
      addNotification('Le nom du profil personnalisé est requis', 'error');
      return;
    }
    if (useCustomPermissions && configuredPermissions.length === 0) {
      addNotification('Veuillez définir au moins une permission personnalisée', 'error');
      return;
    }
    const payload = {
      id_entite: idProducteur || 1,
      email,
      name: name || null,
      prenom: prenom || null,
      profile_id: useCustomPermissions ? null : profileId || 8,
      useCustomPermissions,
      ...(useCustomPermissions && { role: customRole.trim() }),
      ...(useCustomPermissions && {
        permissions: configuredPermissions.map((p) => ({
          page_id: p.page_id,
          read: p.read ? 1 : 0,
          write: p.write ? 1 : 0,
          hide: p.hide ? 1 : 0,
          ...(p.page_name?.toLowerCase() === 'media' && {
            apercu: p.apercu ? 1 : 0,
            upload: p.upload ? 1 : 0,
            delete_file: p.delete_file ? 1 : 0,
            create_folder: p.create_folder ? 1 : 0,
          }),
        })),
      }),
    };
    try {
      if (editingAccount) {
        await axios.put(`${API_BASE_URL}/comptes/${editingAccount.id_compte}`, payload, {
          withCredentials: true,
        });
        addNotification('Compte mis à jour avec succès', 'success');
      } else {
        await axios.post(`${API_BASE_URL}/comptes`, payload, { withCredentials: true });
        addNotification('Compte créé avec succès', 'success');
      }
      setModalOpen(false);
      fetchAccounts();
      fetchProfiles();
    } catch (error: any) {
      addNotification(`${error.response?.data?.error || 'Erreur lors de la sauvegarde'}${error.response?.data?.details ? `: ${error.response.data.details}` : ''}`, 'error');
    }
  };
  const handleSuspend = async (id: number, isSuspended: number) => {
    try {
      setSuspending(id);
      await axios.patch(
        `${API_BASE_URL}/comptes/${id}/suspend`,
        { is_suspended: isSuspended ? 0 : 1 },
        { withCredentials: true }
      );
      addNotification(`Compte ${isSuspended ? 'réactivé' : 'suspendu'} avec succès`, 'success');
      fetchAccounts();
    } catch (error: any) {
      addNotification(error.response?.data?.error || 'Erreur de suspension', 'error');
    } finally {
      setSuspending(null);
    }
  };
  const handleActionButtonClick = (accountId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    buttonRefs.current.set(accountId, button);
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let menuLeft = rect.left;
    if (menuLeft + menuWidth > viewportWidth) {
      menuLeft = rect.right - menuWidth;
    }
    if (menuLeft < 0) {
      menuLeft = 8;
    }
    let menuTop = rect.bottom + 4;
    if (menuTop + menuHeight > viewportHeight) {
      menuTop = rect.top - menuHeight - 4;
    }
    if (menuTop < 0) {
      menuTop = 8;
    }
    setMenuPosition({ top: menuTop, left: menuLeft });
    setActionMenuOpen(actionMenuOpen === accountId ? null : accountId);
  };
  const handleSort = (key: keyof Account | 'raison_socialle' | 'profile') => {
    setSortConfig((prev) => {
      const isSameKey = prev.key === key;
      const direction = isSameKey && prev.direction === 'ASC' ? 'DESC' : 'ASC';
      setAccounts((prevAccounts) => {
        const sortedAccounts = [...prevAccounts];
        sortedAccounts.sort((a, b) => {
          let aValue: any;
          let bValue: any;
          if (key === 'raison_socialle') {
            aValue = companies.find((c) => c.id_entite === a.id_entite)?.raison_socialle || '';
            bValue = companies.find((c) => c.id_entite === b.id_entite)?.raison_socialle || '';
          } else if (key === 'is_suspended') {
            aValue = a[key] ? 'Suspendue' : 'Actif';
            bValue = b[key] ? 'Suspendue' : 'Actif';
          } else if (key === 'profile') {
            const aProfile = profiles.find((p) => p.id_profile === a.profile_id);
            const bProfile = profiles.find((p) => p.id_profile === b.profile_id);
            aValue = aProfile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : aProfile?.role || 'N/A';
            bValue = bProfile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : bProfile?.role || 'N/A';
          } else if (key === 'name') {
            aValue = ((a.name || '') + ' ' + (a.prenom || '')).trim();
            bValue = ((b.name || '') + ' ' + (b.prenom || '')).trim();
          } else if (key === 'prenom') {
            aValue = a.prenom || '';
            bValue = b.prenom || '';
          } else {
            aValue = a[key] || '';
            bValue = b[key] || '';
          }
          if (aValue === '' && bValue !== '') return 1;
          if (bValue === '' && aValue !== '') return -1;
          if (aValue === '' && bValue === '') return 0;
          if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }
          const compare = (x: any, y: any) => {
            if (x < y) return direction === 'ASC' ? -1 : 1;
            if (x > y) return direction === 'ASC' ? 1 : -1;
            return 0;
          };
          return compare(aValue, bValue);
        });
        return sortedAccounts;
      });
      return { key, direction };
    });
  };
  const currentEntityId = useMemo(() => {
    let entityId: number | null = editingAccount?.id_entite ?? null;
    if (!entityId && idProducteur) {
      entityId = Number(idProducteur);
    }
    if (entityId === 0) entityId = null;
    return entityId;
  }, [editingAccount, idProducteur]);
  const filteredProfilesForSelect = useMemo(() => {
    if (!profiles.length) return [];

    // Always show GLOBAL profiles (id_entite === null)
    const global = profiles.filter(p => p.id_entite === null && p.is_suspended === 0);

    // Show entity-specific profiles
    const entityId = Number(currentEntityId || userIdProducteur || 0);
    const entityProfiles = profiles.filter(
      p => p.is_suspended === 0 && p.id_entite === entityId
    );

    return [...global, ...entityProfiles];
  }, [profiles, currentEntityId, userIdProducteur]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        account.email.toLowerCase().includes(searchLower) ||
        (account.name || '').toLowerCase().includes(searchLower) ||
        (account.prenom || '').toLowerCase().includes(searchLower) ||
        (companies.find((c) => c.id_entite === account.id_entite)?.raison_socialle || '').toLowerCase().includes(searchLower) ||
        (profiles.find((p) => p.id_profile === account.profile_id)?.role || '').toLowerCase().includes(searchLower);

      const matchesEntity = filterEntity === 'all' || account.id_entite === filterEntity;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && !account.is_suspended) ||
        (filterStatus === 'suspended' && !!account.is_suspended);

      return matchesSearch && matchesEntity && matchesStatus;
    });
  }, [accounts, searchQuery, filterEntity, filterStatus, companies, profiles]);

  return (
    <div className="min-h-screen ">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <nav className="flex items-center space-x-2 text-sm mb-6">
          <span className="text-blue-500 font-medium">Paramètres / </span>
          <span className="text-blue-500 font-medium">Comptes</span>
        </nav>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
              <button
                onClick={openNewModal}
                className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors w-full md:w-auto"
              >
                Ajouter
              </button>
            </div>
            <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 mb-4">
              <input
                type="text"
                placeholder="Rechercher par email, nom, prénom, entité ou profil..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              />
              <select
                value={filterEntity}
                onChange={(e) => setFilterEntity(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              >
                <option value="all">Toutes les entités</option>
                {companies.map((company) => (
                  <option key={company.id_entite} value={company.id_entite}>
                    {company.raison_socialle}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'suspended')}
                className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              >
                <option value="all">Tous les statuts</option>
                <option value="active">Actif</option>
                <option value="suspended">Suspendue</option>
              </select>
            </div>
            {loading ? (
              <p className="text-center text-gray-600 text-sm">Chargement des comptes...</p>
            ) : filteredAccounts.length === 0 ? (
              <p className="text-center text-gray-600 text-sm">Aucun compte disponible</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-max">
                  <thead className="bg-blue-950 text-white text-xs md:text-sm font-medium">
                    <tr>
                      <th
                        className="p-2 md:p-4 text-center cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('profile')}
                      >
                        Nom Profil
                        {sortConfig.key === 'profile' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th
                        className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('email')}
                      >
                        Email
                        {sortConfig.key === 'email' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th
                        className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('name')}
                      >
                        Nom
                        {sortConfig.key === 'name' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th
                        className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('prenom')}
                      >
                        Prénom
                        {sortConfig.key === 'prenom' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th
                        className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('raison_socialle')}
                      >
                        Entité
                        {sortConfig.key === 'raison_socialle' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th
                        className="p-2 md:p-4 text-center cursor-pointer hover:bg-blue-800 transition-colors"
                        onClick={() => handleSort('is_suspended')}
                      >
                        Statut
                        {sortConfig.key === 'is_suspended' && (
                          <span className="ml-1 text-white font-bold">
                            {sortConfig.direction === 'ASC' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                      <th className="p-2 md:p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account, index) => {
                      const profile = profiles.find((p) => p.id_profile === account.profile_id);
                      const roleDisplay = profile?.role?.startsWith('Custom') ? 'Permissions personnalisées' : profile?.role || 'N/A';
                      return (
                        <tr
                          key={account.id_compte}
                          className={`${account.is_suspended
                            ? 'bg-gray-200'
                            : index % 2 === 0
                            ? 'bg-white'
                            : 'bg-gray-50'
                          } hover:bg-blue-50 transition-colors text-xs md:text-sm`}
                        >
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center whitespace-normal break-words">
                            {roleDisplay}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">
                            {account.email}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">
                            {account.name || 'N/A'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">
                            {account.prenom || 'N/A'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">
                            {companies.find((c) => c.id_entite === account.id_entite)
                              ?.raison_socialle || account.producer_name || 'N/A'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center whitespace-normal break-words">
                            {account.is_suspended ? 'Suspendue' : 'Actif'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center">
                            <button
                              onClick={(e) => handleActionButtonClick(account.id_compte, e)}
                              className={`px-2 md:px-3 py-1 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-base md:text-lg font-medium ${
                                suspending === account.id_compte ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                              disabled={suspending === account.id_compte}
                              aria-label={`Ouvrir le menu d'actions pour le compte ${account.id_compte}`}
                              aria-expanded={actionMenuOpen === account.id_compte}
                            >
                              {suspending === account.id_compte ? 'En cours...' : '☰'}
                            </button>
                            {actionMenuOpen === account.id_compte && menuPosition && (
                              <div
                                ref={actionMenuRef}
                                className="fixed z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-xl"
                                style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                                role="menu"
                              >
                                <button
                                  onClick={() => openEditModal(account)}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => handleSuspend(account.id_compte, account.is_suspended)}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  {account.is_suspended ? 'Réactiver' : 'Suspendre'}
                                </button>
                                <button
                                  onClick={() => handleSendConnectionInfo(account)}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Envoyer fiche connexion
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div
              ref={modalRef}
              className="bg-white rounded-xl p-8 w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-custom shadow-2xl ring-1 ring-gray-200"
            >
              <h2 className="text-2xl font-semibold mb-6 text-blue-950">
                {editingAccount ? 'Modifier le compte' : 'Nouveau compte'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Entité</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={idProducteur}
                    onChange={(e) => handleEntityChange(e.target.value)}
                    disabled={!isSpecialUser}
                  >
                    <option value="">Sélectionner une entité (par défaut: ID 1)</option>
                    {companies.map((company) => (
                      <option key={company.id_entite} value={company.id_entite}>
                        {company.raison_socialle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Entrez le courriel"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Nom</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Entrez votre nom"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Prénom</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Entrez votre prenom"
                  />
                </div>
              </div>
              <label className="block mb-2 text-sm font-medium text-gray-700">Profil</label>
              <select
                className="w-full border border-gray-200 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                value={profileId}
                onChange={(e) => handleProfileChange(e.target.value)}
                disabled={useCustomPermissions}
              >
                <option value="">Sélectionner un profil (par défaut: ID 8)</option>
                {filteredProfilesForSelect.map((profile) => (
                  <option key={profile.id_profile} value={profile.id_profile}>
                    {profile.role || `Profil ${profile.id_profile}`} {profile.id_entite ? `(Spécifique à ${profile.company_name})` : '(Global)'}
                  </option>
                ))}
              </select>
              <label className="flex items-center mb-6">
                <input
                  type="checkbox"
                  checked={useCustomPermissions}
                  onChange={(e) => handleCustomPermissionsChange(e.target.checked)}
                  className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                />
                <span className="ml-2 text-sm text-gray-700">Utiliser des permissions personnalisées</span>
              </label>
              {useCustomPermissions && (
                <>
                  <label className="block mb-2 text-sm font-medium text-gray-700">Nom du Profil Personnalisé</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="Entrez le nom du profil"
                    required
                  />
                  <p className="text-sm text-gray-600 mb-6">
                    Pour ajouter des permissions personnalisées : Sélectionnez une page dans la liste déroulante, cochez les permissions souhaitées, cliquez sur 'Appliquer', puis sélectionnez une autre page si nécessaire. Répétez pour chaque page.
                  </p>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Permissions personnalisées
                  </label>
                  <button
                    onClick={handleSelectAllPermissions}
                    className="mb-6 px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
                  >
                    Sélectionner toutes les pages et permissions (Lire/Écrire)
                  </button>
                  <div className="mb-6">
                    <select
                      value={selectedPageId}
                      onChange={(e) => setSelectedPageId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border border-gray-200 rounded-lg p-3 mb-3 focus:ring-2 focus:ring-blue-950 focus:border-blue-950 shadow-sm"
                    >
                      <option value="">Sélectionner une page</option>
                      {pages.map((page) => (
                        <option key={page.page_id} value={page.page_id}>
                          {page.page_name}
                        </option>
                      ))}
                    </select>
                    {selectedPageId && (
                      <div className="mb-4 pl-0 sm:pl-2 bg-gray-50 p-4 rounded-lg shadow-sm">
                        <h4 className="text-sm font-medium mb-3 text-gray-800">Permissions pour {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name}</h4>
                        {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name.toLowerCase() === 'media' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.apercu}
                                onChange={() => handleTempPermissionChange('apercu')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Aperçu</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.upload}
                                onChange={() => handleTempPermissionChange('upload')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Upload</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.delete_file}
                                onChange={() => handleTempPermissionChange('delete_file')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Supprimer fichier</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.create_folder}
                                onChange={() => handleTempPermissionChange('create_folder')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Créer dossier</span>
                            </label>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.read}
                                onChange={() => handleTempPermissionChange('read')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Lire</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.write}
                                onChange={() => handleTempPermissionChange('write')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Éditer</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={!!tempPermissions.hide}
                                onChange={() => handleTempPermissionChange('hide')}
                                className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                              />
                              <span className="ml-2 text-sm text-gray-700">Masquer</span>
                            </label>
                          </div>
                        )}
                        <div className="flex space-x-3 mt-4">
                          <button
                            onClick={applyPagePermissions}
                            className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
                          >
                            Appliquer
                          </button>
                          <button
                            onClick={cancelEditingPerm}
                            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-6">
                      <h3 className="text-base font-medium mb-3 text-gray-800">Permissions configurées</h3>
                      {configuredPermissions.length === 0 ? (
                        <p className="text-sm text-gray-500">Aucune permission ajoutée pour le moment.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {configuredPermissions.map((perm) => {
                            const activePermissions: string[] = [];
                            if (perm.read) activePermissions.push('Lire');
                            if (perm.write) activePermissions.push('Éditer');
                            if (perm.hide) activePermissions.push('Masquer');
                            if (perm.apercu) activePermissions.push('Aperçu');
                            if (perm.upload) activePermissions.push('Upload');
                            if (perm.delete_file) activePermissions.push('Supprimer fichier');
                            if (perm.create_folder) activePermissions.push('Créer dossier');
                            return (
                              <div key={perm.page_id} className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="font-medium text-gray-800">{perm.page_name}</span>
                                  <div className="space-x-2">
                                    <button onClick={() => startEditingPerm(perm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                                      Modifier
                                    </button>
                                    <button onClick={() => removeConfiguredPermission(perm.page_id)} className="text-red-600 hover:text-red-800 text-sm font-medium">
                                      Supprimer
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {activePermissions.length > 0 ? activePermissions.map((p) => (
                                    <span key={p} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {p}
                                    </span>
                                  )) : <span className="text-sm text-gray-500">Aucune</span>}
                                </div>
                                {editingPermId === perm.page_id && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    {perm.page_name?.toLowerCase() === 'media' ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.apercu}
                                            onChange={() => handleTempPermissionChange('apercu')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Aperçu</span>
                                        </label>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.upload}
                                            onChange={() => handleTempPermissionChange('upload')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Upload</span>
                                        </label>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.delete_file}
                                            onChange={() => handleTempPermissionChange('delete_file')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Supprimer fichier</span>
                                        </label>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.create_folder}
                                            onChange={() => handleTempPermissionChange('create_folder')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Créer dossier</span>
                                        </label>
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.read}
                                            onChange={() => handleTempPermissionChange('read')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Lire</span>
                                        </label>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.write}
                                            onChange={() => handleTempPermissionChange('write')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Éditer</span>
                                        </label>
                                        <label className="flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={!!tempPermissions.hide}
                                            onChange={() => handleTempPermissionChange('hide')}
                                            className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950"
                                          />
                                          <span className="ml-2 text-sm text-gray-700">Masquer</span>
                                        </label>
                                      </div>
                                    )}
                                    <div className="flex space-x-3 mt-4">
                                      <button
                                        onClick={applyPagePermissions}
                                        className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium"
                                      >
                                        Appliquer
                                      </button>
                                      <button
                                        onClick={cancelEditingPerm}
                                        className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-end space-x-4 mt-6">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-6 py-3 bg-blue-950 text-white rounded-lg hover:bg-blue-800 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={
                    !email ||
                    (useCustomPermissions && !customRole.trim()) ||
                    (useCustomPermissions && configuredPermissions.length === 0)
                  }
                >
                  {editingAccount ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default Comptes;