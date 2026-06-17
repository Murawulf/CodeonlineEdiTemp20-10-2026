import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNotifications } from '@/contexts/NotificationContext';
import { useApi } from '@/hooks/useApi';

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

// ─── HIERARCHY RULE: entity 999 is the top of the tree, 111 sits directly under it ───
// 999 can see every account, including its own.
// 111 can see every account EXCEPT accounts belonging to entity 999.
// Everyone else can only ever see accounts belonging to their own entity.
const TOP_ENTITY_ID = 999;
const SECOND_ENTITY_ID = 111;

const Comptes: React.FC = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { addNotificationRef.current = addNotification; });

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
  }>({ key: null, direction: null });
  const [idCompte, setIdCompte] = useState<number | null>(null);
  const [userIdProducteur, setUserIdProducteur] = useState<number | null>(null);
  const [userProducerName, setUserProducerName] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<Account | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [managedEntityIds, setManagedEntityIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEntity, setFilterEntity] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  // ─── NEW: creation-date range filters ───
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  // Track whether we're currently handling a menu action to prevent outside-click from firing
  const isHandlingMenuAction = useRef(false);

  const parentKeywords = ['EDI', 'Produits', 'Paramètres'];

  // ─── HIERARCHY RULE: who is at the top (999) vs second level (111) ───
  const isTopEntity = useMemo(() => userIdProducteur === TOP_ENTITY_ID, [userIdProducteur]);
  const isSecondEntity = useMemo(() => userIdProducteur === SECOND_ENTITY_ID, [userIdProducteur]);

  const isSpecialUser = useMemo(() => {
    return isSecondEntity || isTopEntity;
  }, [isSecondEntity, isTopEntity]);

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
    const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (raw) {
      try {
        const parsedUser = JSON.parse(raw);
        if (parsedUser.id_compte) setIdCompte(parsedUser.id_compte);
        else addNotificationRef.current('Utilisateur non authentifié, id_compte manquant', 'error');
        if (parsedUser.id_entite) setUserIdProducteur(parsedUser.id_entite);
        if (parsedUser.producer_name) setUserProducerName(parsedUser.producer_name);
      } catch {
        addNotificationRef.current("Erreur lors du chargement de l'utilisateur", 'error');
      }
    } else {
      addNotificationRef.current('Aucun utilisateur connecté', 'error');
    }
  }, []);

  const fetchUserAccount = useCallback(async () => {
    if (!idCompte) return;
    try {
      const res = await api.get<Account>(`/api/comptes/${idCompte}`, { withCredentials: true });
      setUserAccount(res.data);
    } catch {
      addNotificationRef.current('Erreur lors du chargement du compte utilisateur', 'error');
    }
  }, [idCompte]);

  useEffect(() => {
    if (idCompte && !userAccount) fetchUserAccount();
  }, [idCompte, userAccount, fetchUserAccount]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await api.get<Profile[]>(`/api/profiles`, { withCredentials: true });
      setProfiles(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des profils', 'error');
    }
  }, [idCompte]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get<Company[]>(`/api/companies`, { withCredentials: true });
      setCompanies(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des entreprises', 'error');
    }
  }, []);

  const fetchPages = useCallback(async () => {
    try {
      const res = await api.get<Page[]>(`/api/pages`, { withCredentials: true });
      setPages(res.data);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des pages', 'error');
    }
  }, []);

  const fetchManagedEntities = useCallback(async () => {
    try {
      const res = await api.get<Company[]>(`/api/companies`, { withCredentials: true });
      setManagedEntityIds(res.data.map((c) => c.id_entite));
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des entités', 'error');
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<Account[]>(`/api/comptes`, { withCredentials: true });
      let filteredAccounts = res.data;

      // ─── HIERARCHY RULE: visibility of accounts based on entity level ───
      if (userIdProducteur === TOP_ENTITY_ID) {
        // Top of the hierarchy (999): sees absolutely everyone, including its own accounts.
        // No filtering applied.
      } else if (userIdProducteur === SECOND_ENTITY_ID) {
        // Second level (111): sees everyone EXCEPT accounts belonging to entity 999.
        filteredAccounts = filteredAccounts.filter((account) => account.id_entite !== TOP_ENTITY_ID);
      } else {
        // Regular users: only their own entity's accounts, with the suspended-profile filter,
        // and entity 999 is excluded as a defense-in-depth measure (it should never match anyway
        // since these users are filtered down to their own id_entite below).
        filteredAccounts = filteredAccounts.filter((account) => {
          if (!account.profile_id) return true;
          const profile = profiles.find((p) => p.id_profile === account.profile_id);
          return profile && !profile.is_suspended;
        });
        filteredAccounts = filteredAccounts.filter((account) => account.id_entite !== TOP_ENTITY_ID);
        if (userIdProducteur) {
          filteredAccounts = filteredAccounts.filter((account) => account.id_entite === userIdProducteur);
        } else {
          filteredAccounts = filteredAccounts.filter((account) => account.id_compte === idCompte);
        }
      }

      setAccounts(filteredAccounts);
      setDataLoaded(true);
    } catch (error: any) {
      addNotificationRef.current(error.response?.data?.error || 'Échec de la récupération des comptes', 'error');
    } finally {
      setLoading(false);
    }
  }, [profiles, isSpecialUser, userIdProducteur, idCompte, managedEntityIds, isAdminUser]);

  useEffect(() => {
    if (isInitialFetch) {
      const fetches = [fetchProfiles(), fetchCompanies(), fetchPages()];
      if (userIdProducteur === 999) fetches.push(fetchManagedEntities());
      Promise.all(fetches)
        .then(() => setIsInitialFetch(false))
        .catch(() => addNotificationRef.current('Échec du chargement initial des données', 'error'));
    }
  }, [fetchProfiles, fetchCompanies, fetchPages, fetchManagedEntities, isInitialFetch, userIdProducteur]);

  useEffect(() => {
    if (!isInitialFetch && profiles.length > 0 && !dataLoaded) fetchAccounts();
  }, [fetchAccounts, isInitialFetch, profiles, dataLoaded]);

  // ─── FIXED: outside-click handler that respects in-progress menu actions ───
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If we're mid-action, skip closing
      if (isHandlingMenuAction.current) return;

      if (modalOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
      }
      if (actionMenuOpen !== null && actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(null);
        setMenuPosition(null);
      }
    };

    if (modalOpen || actionMenuOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
    setConfiguredPermissions([]);
    setEditingPermId(null);
  };

  const openNewModal = () => {
    setEditingAccount(null);
    resetForm();
    if (!isSpecialUser && userIdProducteur) setIdProducteur(userIdProducteur);
    setModalOpen(true);
  };

  // ─── FIXED: openEditModal closes the menu first, then opens the modal ───
  const openEditModal = async (account: Account) => {
    // Close action menu immediately
    setActionMenuOpen(null);
    setMenuPosition(null);

    setEditingAccount(account);
    setEmail(account.email);
    setName(account.name || '');
    setPrenom(account.prenom || '');
    setIdProducteur(account.id_entite);
    setProfileId(account.profile_id || '');

    const profile = profiles.find((p) => p.id_profile === account.profile_id);
    const isCustom = !!profile?.role?.startsWith('Custom');
    setUseCustomPermissions(isCustom);
    setCustomRole(isCustom ? profile!.role || '' : '');

    if (isCustom) {
      try {
        const res = await api.get<AccountPermission[]>(
          `/api/account-permissions/${account.id_compte}`,
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
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
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
    setTempPermissions({ read: false, write: false, hide: false, apercu: false, upload: false, delete_file: false, create_folder: false });
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
        ...(isMedia && { apercu: true, upload: true, delete_file: true, create_folder: true }),
      };
    });
    setConfiguredPermissions(allPerms);
  };

  const handleCustomPermissionsChange = (checked: boolean) => {
    setUseCustomPermissions(checked);
    if (!checked) {
      setProfileId('');
      setCustomRole('');
      setConfiguredPermissions([]);
    } else {
      setProfileId('');
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
    if (isSpecialUser) setIdProducteur(value ? Number(value) : '');
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

  // ─── Turn the base64 PDF returned by the backend into a local file download ───
  const downloadBase64Pdf = (base64: string, filename: string) => {
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur téléchargement fiche connexion:', err);
      addNotification('Échec du téléchargement local de la fiche', 'error');
    }
  };

  // ─── Shared core: backend always resets the password and emails it on every call
  // (the password is hashed, so there's no way to regenerate the same PDF later
  // without resetting it again). The download itself is controlled separately
  // so "Envoyer" only sends, and "Télécharger" is the only one that saves a local file ───
  const sendConnectionInfoCore = async (account: Account, successMessage: string, shouldDownload: boolean) => {
    setActionMenuOpen(null);
    setMenuPosition(null);

    try {
      const response = await api.post(
        `/api/send-connection-info`,
        { email: account.email },
        { withCredentials: true }
      );

      addNotification(successMessage, 'success');

      if (shouldDownload) {
        const pdfBase64 = response.data?.pdfBase64;
        if (pdfBase64) {
          const safeName = (account.email || 'compte').replace(/[^a-zA-Z0-9_.-]/g, '_');
          downloadBase64Pdf(pdfBase64, `fiche_connexion_${safeName}.pdf`);
        } else {
          addNotification("La fiche n'a pas pu être téléchargée (PDF manquant dans la réponse)", 'error');
        }
      }

      fetchAccounts();
    } catch (error: any) {
      addNotification(
        error.response?.data?.error || "Erreur lors de l'envoi de la fiche de connexion",
        'error'
      );
    }
  };

  const handleSendConnectionInfo = (account: Account) =>
    sendConnectionInfoCore(account, 'Fiche de connexion envoyée avec succès', false);

  const handleDownloadConnectionInfo = (account: Account) =>
    sendConnectionInfoCore(account, 'Fiche de connexion téléchargée avec succès', true);

  const handleSubmit = async () => {
    if (!email) { addNotification("L'email est requis", 'error'); return; }
    if (useCustomPermissions && !customRole.trim()) { addNotification('Le nom du profil personnalisé est requis', 'error'); return; }
    if (useCustomPermissions && configuredPermissions.length === 0) { addNotification('Veuillez définir au moins une permission personnalisée', 'error'); return; }

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
        await api.put(`/api/comptes/${editingAccount.id_compte}`, payload, { withCredentials: true });
        addNotification('Compte mis à jour avec succès', 'success');
      } else {
        await api.post(`/api/comptes`, payload, { withCredentials: true });
        addNotification('Compte créé avec succès', 'success');
      }
      setModalOpen(false);
      fetchAccounts();
      fetchProfiles();
    } catch (error: any) {
      addNotification(
        `${error.response?.data?.error || 'Erreur lors de la sauvegarde'}${error.response?.data?.details ? `: ${error.response.data.details}` : ''}`,
        'error'
      );
    }
  };

  const handleSuspend = async (id: number, isSuspended: number) => {
    // Close action menu
    setActionMenuOpen(null);
    setMenuPosition(null);

    try {
      setSuspending(id);
      await api.patch(
        `/api/comptes/${id}/suspend`,
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

  // ─── FIXED: use mousedown + stopPropagation so the outside-click never fires first ───
  const handleActionButtonClick = (accountId: number, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let menuLeft = rect.left;
    if (menuLeft + menuWidth > viewportWidth) menuLeft = rect.right - menuWidth;
    if (menuLeft < 0) menuLeft = 8;

    let menuTop = rect.bottom + 4;
    if (menuTop + menuHeight > viewportHeight) menuTop = rect.top - menuHeight - 4;
    if (menuTop < 0) menuTop = 8;

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
          } else if (key === 'created_at') {
            // ─── NEW: sort chronologically rather than lexically ───
            const aTime = new Date(a.created_at).getTime();
            const bTime = new Date(b.created_at).getTime();
            aValue = Number.isNaN(aTime) ? 0 : aTime;
            bValue = Number.isNaN(bTime) ? 0 : bTime;
          } else {
            aValue = (a as any)[key] || '';
            bValue = (b as any)[key] || '';
          }
          if (aValue === '' && bValue !== '') return 1;
          if (bValue === '' && aValue !== '') return -1;
          if (aValue === '' && bValue === '') return 0;
          if (typeof aValue === 'string') { aValue = aValue.toLowerCase(); bValue = bValue.toLowerCase(); }
          if (aValue < bValue) return direction === 'ASC' ? -1 : 1;
          if (aValue > bValue) return direction === 'ASC' ? 1 : -1;
          return 0;
        });
        return sortedAccounts;
      });
      return { key, direction };
    });
  };

  const currentEntityId = useMemo(() => {
    let entityId: number | null = editingAccount?.id_entite ?? null;
    if (!entityId && idProducteur) entityId = Number(idProducteur);
    if (entityId === 0) entityId = null;
    return entityId;
  }, [editingAccount, idProducteur]);

  const filteredProfilesForSelect = useMemo(() => {
    if (!profiles.length) return [];
    const global = profiles.filter((p) => p.id_entite === null && !p.is_suspended);
    const entityId = Number(currentEntityId || userIdProducteur || 0);
    const entityProfiles = profiles.filter((p) => !p.is_suspended && p.id_entite === entityId);
    return [...global, ...entityProfiles];
  }, [profiles, currentEntityId, userIdProducteur]);

  // ─── HIERARCHY RULE: entity 999 never appears in entity pickers/dropdowns unless you ARE 999 ───
  // This keeps 111 (and everyone else) from filtering by, or assigning new accounts to, entity 999.
  const visibleCompanies = useMemo(() => {
    if (isTopEntity) return companies;
    return companies.filter((c) => c.id_entite !== TOP_ENTITY_ID);
  }, [companies, isTopEntity]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('fr-FR');
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterEntity('all');
    setFilterStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

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

      // ─── NEW: creation-date range filter ───
      const accountDate = new Date(account.created_at);
      const matchesDateFrom = !filterDateFrom || (!Number.isNaN(accountDate.getTime()) && accountDate >= new Date(filterDateFrom));
      const matchesDateTo = !filterDateTo || (!Number.isNaN(accountDate.getTime()) && accountDate <= new Date(`${filterDateTo}T23:59:59.999`));

      return matchesSearch && matchesEntity && matchesStatus && matchesDateFrom && matchesDateTo;
    });
  }, [accounts, searchQuery, filterEntity, filterStatus, filterDateFrom, filterDateTo, companies, profiles]);

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Paramètres</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Comptes</span>
      </nav>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

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

            {/* ─── NEW: filter bar now includes entity, status, creation-date range, and a reset action ─── */}
            <div className="flex flex-col md:flex-row md:flex-wrap md:items-end gap-4 mb-4">
              <input
                type="text"
                placeholder="Rechercher par email, nom, prénom, entité ou profil..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:flex-1 md:min-w-[220px] border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              />
              <select
                value={filterEntity}
                onChange={(e) => setFilterEntity(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
              >
                <option value="all">Toutes les entités</option>
                {visibleCompanies.map((company) => (
                  <option key={company.id_entite} value={company.id_entite}>{company.raison_socialle}</option>
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
              <div className="w-full md:w-auto">
                <label className="block text-xs font-medium text-gray-500 mb-1">Créé à partir du</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                />
              </div>
              <div className="w-full md:w-auto">
                <label className="block text-xs font-medium text-gray-500 mb-1">Créé jusqu'au</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full md:w-auto border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-950 focus:border-blue-950"
                />
              </div>
              <button
                onClick={resetFilters}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
              >
                Réinitialiser les filtres
              </button>
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
                      <th className="p-2 md:p-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('profile')}>
                        Nom Profil {sortConfig.key === 'profile' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('email')}>
                        Email {sortConfig.key === 'email' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('name')}>
                        Nom {sortConfig.key === 'name' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('prenom')}>
                        Prénom {sortConfig.key === 'prenom' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-left cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('raison_socialle')}>
                        Entité {sortConfig.key === 'raison_socialle' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('created_at')}>
                        Date de création {sortConfig.key === 'created_at' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
                      </th>
                      <th className="p-2 md:p-4 text-center cursor-pointer hover:bg-blue-800 transition-colors" onClick={() => handleSort('is_suspended')}>
                        Statut {sortConfig.key === 'is_suspended' && <span className="ml-1">{sortConfig.direction === 'ASC' ? '↑' : '↓'}</span>}
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
                          className={`${
                            account.is_suspended ? 'bg-gray-200' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          } hover:bg-blue-50 transition-colors text-xs md:text-sm`}
                        >
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center whitespace-normal break-words">{roleDisplay}</td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">{account.email}</td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">{account.name || 'N/A'}</td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">{account.prenom || 'N/A'}</td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-left whitespace-normal break-words">
                            {companies.find((c) => c.id_entite === account.id_entite)?.raison_socialle || account.producer_name || 'N/A'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center whitespace-normal break-words">
                            {formatDate(account.created_at)}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center whitespace-normal break-words">
                            {account.is_suspended ? 'Suspendue' : 'Actif'}
                          </td>
                          <td className="border-t border-gray-200 p-2 md:p-4 text-center relative">
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

                            {/* ─── FIXED: action menu buttons use onMouseDown to fire before the document click ─── */}
                            {actionMenuOpen === account.id_compte && menuPosition && (
                              <div
                                ref={actionMenuRef}
                                className="fixed z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-xl"
                                style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                                role="menu"
                              >
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    openEditModal(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Modifier
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleSuspend(account.id_compte, account.is_suspended);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  {account.is_suspended ? 'Réactiver' : 'Suspendre'}
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleSendConnectionInfo(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Envoyer fiche connexion
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleDownloadConnectionInfo(account);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-100 hover:text-blue-950 transition-colors"
                                  role="menuitem"
                                >
                                  Télécharger fiche connexion
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

        {/* ─── Modal ─── */}
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
                    {visibleCompanies.map((company) => (
                      <option key={company.id_entite} value={company.id_entite}>{company.raison_socialle}</option>
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
                  <label className="block mb-2 text-sm font-medium text-gray-700">Permissions personnalisées</label>
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
                        <option key={page.page_id} value={page.page_id}>{page.page_name}</option>
                      ))}
                    </select>

                    {selectedPageId && (
                      <div className="mb-4 pl-0 sm:pl-2 bg-gray-50 p-4 rounded-lg shadow-sm">
                        <h4 className="text-sm font-medium mb-3 text-gray-800">
                          Permissions pour {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name}
                        </h4>
                        {pages.find((p) => p.page_id === Number(selectedPageId))?.page_name.toLowerCase() === 'media' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(['apercu', 'upload', 'delete_file', 'create_folder'] as const).map((field) => (
                              <label key={field} className="flex items-center">
                                <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                <span className="ml-2 text-sm text-gray-700">
                                  {field === 'apercu' ? 'Aperçu' : field === 'upload' ? 'Upload' : field === 'delete_file' ? 'Supprimer fichier' : 'Créer dossier'}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {(['read', 'write', 'hide'] as const).map((field) => (
                              <label key={field} className="flex items-center">
                                <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                <span className="ml-2 text-sm text-gray-700">
                                  {field === 'read' ? 'Lire' : field === 'write' ? 'Éditer' : 'Masquer'}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="flex space-x-3 mt-4">
                          <button onClick={applyPagePermissions} className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium">Appliquer</button>
                          <button onClick={cancelEditingPerm} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors">Annuler</button>
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
                                    <button onClick={() => startEditingPerm(perm)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Modifier</button>
                                    <button onClick={() => removeConfiguredPermission(perm.page_id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Supprimer</button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {activePermissions.length > 0 ? activePermissions.map((p) => (
                                    <span key={p} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{p}</span>
                                  )) : <span className="text-sm text-gray-500">Aucune</span>}
                                </div>
                                {editingPermId === perm.page_id && (
                                  <div className="mt-4 pt-4 border-t border-gray-200">
                                    {perm.page_name?.toLowerCase() === 'media' ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {(['apercu', 'upload', 'delete_file', 'create_folder'] as const).map((field) => (
                                          <label key={field} className="flex items-center">
                                            <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                            <span className="ml-2 text-sm text-gray-700">
                                              {field === 'apercu' ? 'Aperçu' : field === 'upload' ? 'Upload' : field === 'delete_file' ? 'Supprimer fichier' : 'Créer dossier'}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {(['read', 'write', 'hide'] as const).map((field) => (
                                          <label key={field} className="flex items-center">
                                            <input type="checkbox" checked={!!tempPermissions[field]} onChange={() => handleTempPermissionChange(field)} className="h-4 w-4 text-blue-950 border-gray-300 rounded focus:ring-blue-950" />
                                            <span className="ml-2 text-sm text-gray-700">
                                              {field === 'read' ? 'Lire' : field === 'write' ? 'Éditer' : 'Masquer'}
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex space-x-3 mt-4">
                                      <button onClick={applyPagePermissions} className="px-4 py-2 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm font-medium">Appliquer</button>
                                      <button onClick={cancelEditingPerm} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors">Annuler</button>
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