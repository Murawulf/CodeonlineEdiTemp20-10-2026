import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useApi } from '../hooks/useApi';
import { useLocalApiUrl } from '../contexts/SettingsContext';

type Company = {
  id_entite: number;
  raison_socialle: string;
  identifiant_national: string;
  personne_contact: string;
  email: string | null;
  tel_mobile: string | null;
  telephone: string | null;
  type_prod: number;
  date_create: string;
  segments: string[];
  identifiant_rex?: string;
  date_enregistrement_rex?: string;
  debut_validite_rex?: string;
  fin_validite_rex?: string;
  etat?: string;
  pays?: string;
  site?: string;
  service?: string;
  fax?: string;
  adresse?: string;
  region?: string;
  city?: string;
  localite?: string;
  postalCode?: string;
  date_abonnement?: string;
  date_echeance?: string;
  pwd?: string;
  nb_fp?: number;
  inscription?: number;
  status_ent?: string;
  delegation?: string;
  titre_fr?: string;
  titre_ar?: string;
  titre_en?: string;
  logo?: string | null;
  // ── Newly added columns (importateurs/exportateurs import) ──
  sci?: number;
  destinations?: string | null;
  export_burkina_faso?: number;
  export_cote_ivoire?: number;
  export_gambie?: number;
  export_guinee?: number;
  export_libye?: number;
  export_mali?: number;
  export_senegal?: number;
};

type DestinationKey =
  | 'export_burkina_faso'
  | 'export_cote_ivoire'
  | 'export_gambie'
  | 'export_guinee'
  | 'export_libye'
  | 'export_mali'
  | 'export_senegal';

const DESTINATION_OPTIONS: { key: DestinationKey; label: string }[] = [
  { key: 'export_burkina_faso', label: 'Burkina Faso' },
  { key: 'export_cote_ivoire', label: "Côte d'Ivoire" },
  { key: 'export_gambie', label: 'Gambie' },
  { key: 'export_guinee', label: 'Guinée' },
  { key: 'export_libye', label: 'Libye' },
  { key: 'export_mali', label: 'Mali' },
  { key: 'export_senegal', label: 'Sénégal' },
];

type Segment = { code: string; libelle: string };

type Site = {
  id_site: number;
  id_entite: number;
  nom_site: string;
  gln: string | null;
  adresse: string | null;
  region: string | null;
  delegation: string | null;
  localite: string | null;
  code_postal: string | null;
  principal: number;
  created_at: string | null;
};

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ header: 1 }, { header: 2 }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ direction: 'rtl' }],
    [{ size: ['small', false, 'large', 'huge'] }],
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    [{ color: [] }, { background: [] }],
    [{ font: [] }],
    [{ align: [] }],
    ['clean'],
  ],
};

const Entite = () => {
  const api = useApi();
  const API_BASE_URL = useLocalApiUrl();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [delegations, setDelegations] = useState<{ delegation: string }[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [paysList, setPaysList] = useState<{ isoNumeric: string; libelle: string }[]>([]);
  const typeOptions = [
    { value: "1", label: "Entreprise privée produits & services" },
    { value: "2", label: "Entreprise privée ingénierie & services" },
    { value: "3", label: "Entreprise privée transport logistique & stockage" },
    { value: "4", label: "Entreprise publique transport logistique & stockage" },
    { value: "5", label: "Entreprise publique produits & services" },
    { value: "6", label: "Entreprise publique ingénierie & services" },
    { value: "7", label: "Autre institution publique d'appui à l'exportation" },
    { value: "8", label: "Banque" },
    { value: "9", label: "Douane" },
    { value: "10", label: "Assurance" },
  ];
const fetchPaysList = async () => {
    try {
      const response = await api.get(`/api/pays`, { withCredentials: true });
      setPaysList(response.data || []);
    } catch (err) {
      console.error('Fetch pays error:', err);
      debouncedAddNotification('Échec du chargement des pays', 'error');
    }
  };

  const [searchRegion, setSearchRegion] = useState('');
  const [searchDelegation, setSearchDelegation] = useState('');
  const [searchSegments, setSearchSegments] = useState<string[]>([]);
  const [searchDestinations, setSearchDestinations] = useState<DestinationKey[]>([]);
  const [searchType, setSearchType] = useState('');
  const [searchText, setSearchText] = useState('');

  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [regionDelExpanded, setRegionDelExpanded] = useState('');
  const [isSegmentOpen, setIsSegmentOpen] = useState(false);
  const [isDestinationOpen, setIsDestinationOpen] = useState(false);
  const [isTypeOpen, setIsTypeOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // ── Mass selection for contact export ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [basicEditingCompany, setBasicEditingCompany] = useState<Company | null>(null);
  const [isBasicModalOpen, setIsBasicModalOpen] = useState(false);
  const [modalSegments, setModalSegments] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [modalRegions, setModalRegions] = useState<{ region: string }[]>([]);
  const [modalDelegations, setModalDelegations] = useState<{ delegation: string }[]>([]);
  const [modalLocalites, setModalLocalites] = useState<{ localite: string; code_postal: string }[]>([]);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importResult, setImportResult] = useState<{
    added: number;
    frontErrors: { line: number; raison: string; reason: string }[];
    backErrors: { raison_socialle: string; message: string }[];
    failedRows: any[][];
    headers: string[];
  } | null>(null);

  const [isSelectLangModalOpen, setIsSelectLangModalOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'fr' | 'ar' | 'en' | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isEditTitleModalOpen, setIsEditTitleModalOpen] = useState(false);

  const [selectedText, setSelectedText] = useState('');
  const [selectedTextTitle, setSelectedTextTitle] = useState('');
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);

  const [selectedLogo, setSelectedLogo] = useState<string | null>(null);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  const [editingField, setEditingField] = useState<{ id: number; field: string; value: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Company; direction: 'ascending' | 'descending' } | null>(null);

  const [isActionOpen, setIsActionOpen] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sitesExpanded, setSitesExpanded] = useState<boolean>(true);
  const [sitesMap, setSitesMap] = useState<{ [key: number]: Site[] }>({});
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [editingSites, setEditingSites] = useState<Site[]>([]);
  const [isSitesManagementModalOpen, setIsSitesManagementModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);

  const [isMainActionOpen, setIsMainActionOpen] = useState(false);
  const [filterDropdownPos, setFilterDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const typeRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const destinationRef = useRef<HTMLDivElement>(null);
  const filtersBarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const importModalRef = useRef<HTMLDivElement>(null);
  const logoModalRef = useRef<HTMLDivElement>(null);
  const selectLangModalRef = useRef<HTMLDivElement>(null);
  const editTitleModalRef = useRef<HTMLDivElement>(null);
  const textModalRef = useRef<HTMLDivElement>(null);
  const sitesManagementModalRef = useRef<HTMLDivElement>(null);
  const mainActionRef = useRef<HTMLDivElement>(null);

  const canWrite = true;

  // ── CURRENT USER'S id_entite ────────────────────────────────────────────
  // Previously hardcoded as `{ id_entite: 123 }` — never wired to the real
  // logged-in account, which is why privileged users saw nothing and
  // everyone else's own-entity filter was meaningless.
  //
  // Source of truth, in priority order (mirrors how the rest of the app
  // already resolves the current user, e.g. the "Fetching all comptes for
  // id_compte..." / "Found id_entite: ..." logic run elsewhere on login):
  //   1. The user object your login flow stores in localStorage/sessionStorage
  //      (POST /api/login already returns id_entite directly in its JSON, so
  //      if that whole response — or a user object built from it — is what
  //      gets persisted, it's already there with zero extra requests).
  //   2. Fallback: call GET /api/comptes (JWT-scoped server-side) and match
  //      the row for the current id_compte, exactly like the rest of the app
  //      does.
  const getStoredUser = (): any | null => {
    try {
      const raw =
        localStorage.getItem('user') ||
        sessionStorage.getItem('user') ||
        localStorage.getItem('currentUser') ||
        sessionStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('Failed to read stored user:', err);
      return null;
    }
  };

  const [initialUser, setInitialUser] = useState<{ id_entite: number | null }>({ id_entite: null });
  const [userResolved, setUserResolved] = useState(false);

  useEffect(() => {
    const resolveCurrentEntite = async () => {
      const storedUser = getStoredUser();
      const storedIdEntite = storedUser?.id_entite;

      // 1. Already present on the stored user object — use it directly.
      if (storedIdEntite !== undefined && storedIdEntite !== null && storedIdEntite !== '') {
        setInitialUser({ id_entite: Number(storedIdEntite) });
        setUserResolved(true);
        return;
      }

      // 2. Fall back to resolving it via /api/comptes, same as the rest of the app.
      const idCompte = storedUser?.id_compte ?? storedUser?.idCompte ?? storedUser?.id ?? null;
      if (!idCompte) {
        console.error('Entite.tsx: could not determine current id_compte from stored user — treating as non-privileged.');
        setUserResolved(true);
        return;
      }

      try {
        const res = await api.get('/api/comptes', { withCredentials: true });
        const match = (res.data || []).find((c: any) => Number(c.id_compte) === Number(idCompte));
        setInitialUser({ id_entite: match?.id_entite != null ? Number(match.id_entite) : null });
      } catch (err) {
        console.error('Entite.tsx: failed to resolve current user entite via /api/comptes:', err);
      } finally {
        setUserResolved(true);
      }
    };
    resolveCurrentEntite();
  }, []);

  // Fail CLOSED while resolving, or if resolution never found an id_entite:
  // scoped to nothing rather than accidentally showing everything.
  const isPrivilegedEntite = initialUser?.id_entite === 111 || initialUser?.id_entite === 999;
  const initialShowAll = isPrivilegedEntite;

  const debouncedAddNotification = (msg: string, type: 'success' | 'error') => console.log(msg, type);
  const addNotification = (msg: string, type: 'success' | 'error') => console.log(msg, type);

  const getDropdownPos = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left, width: rect.width };
  };

  const toggleRow = (id_entite: number) => {
    if (expandedRow === id_entite) {
      setExpandedRow(null);
    } else {
      setExpandedRow(id_entite);
      if (!sitesMap[id_entite]) {
        fetchSites(id_entite);
      }
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await api.get(`/api/companies`, {
        withCredentials: true,
        params: { region: searchRegion, delegation: searchDelegation, type: searchType },
      });
      setCompanies(response.data || []);
    } catch (err) {
      console.error('Fetch companies error:', err);
      debouncedAddNotification('Échec du chargement des entités', 'error');
    }
  };

  const fetchSegments = async () => {
    try {
      const response = await api.get(`/api/segments`, { withCredentials: true });
      setSegments(response.data || []);
    } catch (err) {
      console.error('Fetch segments error:', err);
      debouncedAddNotification('Échec du chargement des segments', 'error');
    }
  };

  const fetchDelegations = async (region: string) => {
    if (!region) { setDelegations([]); return; }
    try {
      const res = await api.get(`/api/delegation`, { params: { region }, withCredentials: true });
      setDelegations(res.data || []);
      setSearchDelegation('');
    } catch (err) { console.error('Error fetching delegations:', err); }
  };

  const fetchModalRegions = async () => {
    try {
      const res = await api.get(`/api/regions`, { withCredentials: true });
      setModalRegions(res.data || []);
    } catch (err) { console.error('fetchModalRegions error:', err); }
  };

  const fetchModalDelegations = async (region: string) => {
    if (!region) { setModalDelegations([]); setModalLocalites([]); return; }
    try {
      const res = await api.get(`/api/delegation`, { params: { region }, withCredentials: true });
      setModalDelegations(res.data || []);
      setModalLocalites([]);
    } catch (err) { console.error('fetchModalDelegations error:', err); }
  };

  const fetchModalLocalites = async (delegation: string) => {
    if (!delegation) { setModalLocalites([]); return; }
    try {
      const res = await api.get(`/api/localite`, { params: { delegation }, withCredentials: true });
      setModalLocalites(res.data || []);
    } catch (err) { console.error('fetchModalLocalites error:', err); }
  };

  const fetchSites = async (id_entite: number) => {
    try {
      const response = await api.get(`/api/sites/${id_entite}`, { withCredentials: true });
      const sites = response.data || [];
      setSitesMap(prev => ({ ...prev, [id_entite]: sites }));
      return sites;
    } catch (err) {
      console.error('Fetch sites error:', err);
      return [];
    }
  };

  // Users belonging to entite 111 or 999 see every entite (except the two admin placeholders).
  // Everyone else only ever sees their own entite.
  const baseCompanies = initialShowAll
    ? companies.filter(c => ![111, 999].includes(c.id_entite) && c.etat !== 'archivé')
    : companies.filter(c => c.id_entite === initialUser?.id_entite && c.etat !== 'archivé');
  const filteredCompanies = baseCompanies.filter(company => {
    const matchesText =
      company.raison_socialle.toLowerCase().includes(searchText.toLowerCase()) ||
      (company.personne_contact || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (company.email || '').toLowerCase().includes(searchText.toLowerCase());

    // Multi-select: a company matches if it has AT LEAST ONE of the checked segments.
    const matchesSegment =
      searchSegments.length === 0 ||
      (company.segments || []).some(code => searchSegments.includes(code));

    // Multi-select: a company matches if it exports to AT LEAST ONE of the checked destinations.
    const matchesDestination =
      searchDestinations.length === 0 ||
      searchDestinations.some(key => Number(company[key]) === 1);

    return matchesText && matchesSegment && matchesDestination;
  }).sort((a, b) => (Number(b.sci) === 1 ? 1 : 0) - (Number(a.sci) === 1 ? 1 : 0)); // SCI entities always float to the top, stable otherwise

  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleCreateSupervisorProfile = async (company: Company) => {
    if (!canWrite) return;
    try {
      await api.post(`/api/create-supervisor-profile`, { id_entite: company.id_entite, raison_socialle: company.raison_socialle }, { withCredentials: true });
      setIsActionOpen(null);
      debouncedAddNotification('Profil superviseur créé', 'success');
    } catch (error: any) {
      debouncedAddNotification('Échec création profil superviseur', 'error');
    }
  };

  // Clicking a region in the combined Région/Délégation dropdown selects that
  // region and expands its délégations inline underneath, in the same list.
  // Clicking it again while already expanded just collapses the sub-list.
  const handleRegionPick = (region: string) => {
    const willExpand = regionDelExpanded !== region;
    setSearchRegion(region);
    setSearchDelegation('');
    setCurrentPage(1);
    if (willExpand) {
      setRegionDelExpanded(region);
      fetchDelegations(region);
    } else {
      setRegionDelExpanded('');
    }
  };

  const handleDelegationPick = (delegation: string) => {
    setSearchDelegation(delegation);
    setIsRegionOpen(false);
    setCurrentPage(1);
  };

  const clearRegionDelegation = () => {
    setSearchRegion('');
    setSearchDelegation('');
    setRegionDelExpanded('');
    setIsRegionOpen(false);
    setCurrentPage(1);
  };

  // Segment & Destination are multi-select: toggle membership, dropdown stays open.
  const toggleSegmentValue = (code: string) => {
    setSearchSegments(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    setCurrentPage(1);
  };

  const toggleDestinationValue = (key: DestinationKey) => {
    setSearchDestinations(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setCurrentPage(1);
  };

  const handleTypeSelect = (type: string) => {
    setSearchType(type);
    setIsTypeOpen(false);
    setCurrentPage(1);
  };

  const handleAddCompany = async () => {
    if (!canWrite) return;
    const today = new Date().toISOString().split('T')[0];
    setBasicEditingCompany({
      id_entite: 0, raison_socialle: '', identifiant_national: '',
      personne_contact: '', email: '', tel_mobile: '', telephone: '',
      type_prod: 0, date_create: today, segments: [],
    });
    setIsBasicModalOpen(true);
    setModalSegments([]);
    setLogoFile(null);
    setPreviewLogo(null);
    setIsMainActionOpen(false);
    await fetchModalRegions();
  };

  const handleSaveBasicCompany = async () => {
    if (!basicEditingCompany) return;
    if (!basicEditingCompany.raison_socialle?.trim()) { debouncedAddNotification("Raison sociale requise", "error"); return; }
    if (!basicEditingCompany.identifiant_national?.trim()) { debouncedAddNotification("Identifiant national requis", "error"); return; }
    if (!basicEditingCompany.personne_contact?.trim()) { debouncedAddNotification("Personne de contact requise", "error"); return; }
    const typeVal = Number(basicEditingCompany.type_prod || 0);
    if (typeVal === 0) { debouncedAddNotification("Type d'opérateur requis", "error"); return; }

    try {
      const formData = new FormData();
      formData.append("raison_socialle", basicEditingCompany.raison_socialle.trim());
      formData.append("identifiant_national", basicEditingCompany.identifiant_national.trim());
      formData.append("personne_contact", basicEditingCompany.personne_contact.trim());
      formData.append("type_prod", String(typeVal));
      formData.append("email", basicEditingCompany.email || "");
      formData.append("tel_mobile", basicEditingCompany.tel_mobile || "");
      formData.append("telephone", basicEditingCompany.telephone || "");
      formData.append("service", "");
      formData.append("pays", String(basicEditingCompany.pays || 788));
      formData.append("adresse", basicEditingCompany.adresse || "");
      formData.append("region", basicEditingCompany.region || "");
      formData.append("city", basicEditingCompany.city || "");
      formData.append("localite", basicEditingCompany.localite || "");
      formData.append("postalCode", basicEditingCompany.postalCode || "");
      formData.append("titre_fr", basicEditingCompany.titre_fr || "");
      formData.append("titre_ar", basicEditingCompany.titre_ar || "");
      formData.append("titre_en", basicEditingCompany.titre_en || "");
      formData.append("delegation", basicEditingCompany.delegation || "");

      const response = await api.post(`/api/companies`, formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" }
      });

      const newId = response.data?.id_entite;
      if (!newId) throw new Error("No id_entite returned");

      debouncedAddNotification("Entité créée avec succès", "success");
      setIsBasicModalOpen(false);
      setCurrentPage(1);

      const createdResponse = await api.get(`/api/companies/${newId}`, { withCredentials: true });
      const created = createdResponse.data;

      if (created) {
        // Prepend locally so the new entity appears first in the table,
        // instead of refetching the whole list (which would re-sort it alphabetically).
        setCompanies(prev => [created, ...prev.filter(c => c.id_entite !== created.id_entite)]);

        window.alert("Veuillez compléter les détails de votre entité");

        setEditingCompany(created);
        setModalSegments(created.segments || []);
        setIsModalOpen(true);
      } else {
        // Fallback: if for some reason we couldn't refetch the created entity, refresh the list normally.
        await fetchCompanies();
      }
    } catch (err: any) {
      debouncedAddNotification(`Erreur création: ${err.response?.data?.error || err.message}`, "error");
    }
  };

  const handleAddMultiple = () => {
    if (!canWrite) return;
    setIsImportModalOpen(true);
    setIsMainActionOpen(false);
    if (modalRegions.length === 0) fetchModalRegions();
  };

  // ── Mass selection helpers ──
  const toggleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllPageSelected = paginatedCompanies.length > 0 && paginatedCompanies.every(c => selectedIds.has(c.id_entite));
  const isSomePageSelected = paginatedCompanies.some(c => selectedIds.has(c.id_entite));

  const toggleSelectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        paginatedCompanies.forEach(c => next.delete(c.id_entite));
      } else {
        paginatedCompanies.forEach(c => next.add(c.id_entite));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredCompanies.map(c => c.id_entite)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleExportContacts = () => {
    const selectedCompanies = companies.filter(c => selectedIds.has(c.id_entite));
    if (selectedCompanies.length === 0) {
      debouncedAddNotification('Aucune entité sélectionnée', 'error');
      return;
    }
    const exportData = selectedCompanies.map((company) => ({
      'Raison sociale': company.raison_socialle,
      'Identifiant national': company.identifiant_national || '',
      'Personne contact': company.personne_contact || '',
      'Email': company.email || '',
      'Téléphone mobile': company.tel_mobile || '',
      'Téléphone fixe': company.telephone || '',
      'Fax': company.fax || '',
      'Adresse': company.adresse || '',
      'Région': company.region || '',
      'Délégation': company.delegation || '',
      'Ville': company.city || '',
      'Localité': company.localite || '',
      'Code postal': company.postalCode || '',
      'Pays': paysList.find(p => p.isoNumeric === company.pays)?.libelle || company.pays || '',
      'Site': company.site || '',
      'Service': company.service || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 26 }, { wch: 16 },
      { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    XLSX.writeFile(wb, `contacts_selection_${new Date().toISOString().slice(0, 10)}.xlsx`);
    debouncedAddNotification(`${selectedCompanies.length} contact(s) exporté(s)`, 'success');
  };

  const handleExport = () => {
    const exportData = filteredCompanies.map((company) => {
      const segmentsData = company.segments?.slice(0, 4) || [];
      return {
        id_entite: company.id_entite,
        identifiant_rex: company.identifiant_rex || '',
        date_enregistrement_rex: company.date_enregistrement_rex || '',
        debut_validite_rex: company.debut_validite_rex || '',
        fin_validite_rex: company.fin_validite_rex || '',
        etat: company.etat || '',
        raison_socialle: company.raison_socialle,
        identifiant_national: company.identifiant_national || '',
        date_create: company.date_create || '',
        pays: paysList.find(p => p.isoNumeric === company.pays)?.libelle || company.pays || '',
        site: company.site || '',
        personne_contact: company.personne_contact || '',
        service: company.service || '',
        email: company.email || '',
        tel_mobile: company.tel_mobile || '',
        telephone: company.telephone || '',
        fax: company.fax || '',
        adresse: company.adresse || '',
        region: company.region || '',
        city: company.city || '',
        localite: company.localite || '',
        postalCode: company.postalCode || '',
        type_operateur: typeOptions.find(t => t.value === company.type_prod.toString())?.label || '',
        date_abonnement: company.date_abonnement || '',
        date_echeance: company.date_echeance || '',
        pwd: company.pwd,
        nb_fp: company.nb_fp,
        inscription: company.inscription,
        status_ent: company.status_ent,
        delegation: company.delegation || '',
        titre_fr: company.titre_fr || '',
        titre_ar: company.titre_ar || '',
        titre_en: company.titre_en || '',
        logo: company.logo || '',
        segment1: segments.find(s => s.code === segmentsData[0])?.libelle || '',
        segment2: segments.find(s => s.code === segmentsData[1])?.libelle || '',
        segment3: segments.find(s => s.code === segmentsData[2])?.libelle || '',
        segment4: segments.find(s => s.code === segmentsData[3])?.libelle || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entites');
    XLSX.writeFile(wb, 'entites_export.xlsx');
    addNotification('Exportation réussie', 'success');
    setIsMainActionOpen(false);
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const response = await axios.get(`${API_BASE_URL}/api/companies/template`, {
        responseType: "blob",
        withCredentials: true,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "modele_entites_complet.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      addNotification("Modèle Excel téléchargé avec succès", "success");
    } catch (error) {
      console.error("Erreur téléchargement modèle:", error);
      addNotification("Erreur lors du téléchargement du modèle Excel", "error");
    }
  };

 const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setImportResult(null);
    setImportFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets['Entites'] || wb.Sheets[wb.SheetNames.find(n => !n.startsWith('_')) || wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

      if (!json || json.length < 2) {
        setImportResult({ added: 0, frontErrors: [{ line: 0, raison: '—', reason: 'Fichier vide ou mal formé' }], backErrors: [], failedRows: [], headers: [] });
        setIsLoading(false);
        return;
      }

      const HEADER_KEY_MAP: Record<string, string> = {
        'Raison Sociale': 'raison_socialle',
        'Identifiant National': 'identifiant_national',
        'Personne Contact': 'personne_contact',
        'Type Producteur': 'type_prod',
        'Email': 'email',
        'Tél Mobile': 'tel_mobile',
        'Téléphone': 'telephone',
        'Fax': 'fax',
        'Adresse': 'adresse',
        'Région': 'region',
        'Délégation': 'delegation',
        'Ville': 'city',
        'Localité': 'localite',
        'Code Postal': 'postalCode',
        'Pays': 'pays',
        'Site Web': 'site',
        'Service': 'service',
        'État': 'etat',
        'Identifiant REX': 'identifiant_rex',
        'Date Enregistrement REX': 'date_enregistrement_rex',
        'Début Validité REX': 'debut_validite_rex',
        'Fin Validité REX': 'fin_validite_rex',
        'Date Abonnement': 'date_abonnement',
        'Date Échéance': 'date_echeance',
        'Nb FP': 'nb_fp',
        'Inscription': 'inscription',
        'Statut Entité': 'status_ent',
        'Titre FR': 'titre_fr',
        'Titre AR': 'titre_ar',
        'Titre EN': 'titre_en',
        'Segment 1': 'segment1',
        'Segment 2': 'segment2',
        'Segment 3': 'segment3',
        'Segment 4': 'segment4',
      };

      const cleanKey = (h: any): string => {
        const label = (h || "").toString()
          .replace(/\s*\*\s*/g, '')
          .replace(/\s*▼\s*/g, '')
          .replace(/\s*\?\s*/g, '')
          .trim();
        return HEADER_KEY_MAP[label] || label;
      };

      const rawHeaders: string[] = (json[0] || []).map((h: any) => (h || "").toString().trim());
      const headerRow: string[] = rawHeaders.map(cleanKey);
      const entities: any[] = [];
      const frontErrors: { line: number; raison: string; reason: string }[] = [];
      const failedRawRows: any[][] = [];

      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.every((c: any) => c === null || c === undefined || c === "")) continue;

        try {
          const entity: any = {};
          headerRow.forEach((key: string, idx: number) => {
            if (!key) return;
            let val = row[idx];
            if (typeof val === "string") val = val.trim();
            if (val !== undefined && val !== null && val !== "") entity[key] = val;
          });

          const rsVal = entity["raison_socialle"] || entity["raison_sociale"] || entity["Raison Sociale"] || null;
          delete entity["raison_sociale"];
          delete entity["Raison Sociale"];
          if (rsVal) entity.raison_socialle = String(rsVal).trim();

          ["nb_fp", "inscription"].forEach(k => { if (entity[k] !== undefined) entity[k] = Number(entity[k]) || 0; });

          if (entity.type_prod !== undefined) {
            const raw = String(entity.type_prod).trim();
            const code = raw.includes(" - ") ? raw.split(" - ")[0].trim() : raw;
            entity.type_prod = Number(code) > 0 ? Number(code) : 1;
          } else { entity.type_prod = 1; }

          if (entity.pays !== undefined) {
            const raw = String(entity.pays).trim();
            const code = raw.includes(" - ") ? raw.split(" - ")[0].trim() : raw;
            const label = raw.includes(" - ") ? raw.split(" - ").slice(1).join(" - ").toLowerCase() : raw.toLowerCase();
            const found = paysList.find((p: any) => p.isoNumeric === code || p.libelle?.toLowerCase() === label);
            entity.pays = found ? found.isoNumeric : code;
          }

          if (entity.region !== undefined) {
            const raw = String(entity.region).trim();
            const found = modalRegions.find((r: any) => r.region?.toLowerCase() === raw.toLowerCase());
            entity.region = found ? found.region : raw;
          }

          if (entity.status_ent !== undefined) {
            const raw = String(entity.status_ent).trim();
            entity.status_ent = raw.includes(" - ") ? raw.split(" - ")[0].trim() : raw || "E";
          } else { entity.status_ent = "E"; }

          const segRaw = [entity.segment1, entity.segment2, entity.segment3, entity.segment4]
            .filter(Boolean).map((s: any) => String(s).trim());
          const segCodes: string[] = [];
          for (const name of segRaw) {
            const code = name.includes(" - ") ? name.split(" - ")[0].trim() : name;
            const found = segments.find((s: Segment) => s.code === code || s.code === name || s.libelle === name);
            if (found) segCodes.push(found.code);
            else if (code) segCodes.push(code);
          }
          entity.segments = segCodes.slice(0, 4);
          delete entity.segment1; delete entity.segment2; delete entity.segment3; delete entity.segment4;

          const missing: string[] = [];
          if (!entity.raison_socialle) missing.push("Raison Sociale");
          if (!entity.identifiant_national) missing.push("Identifiant National");
          if (!entity.personne_contact) missing.push("Personne Contact");
          if (missing.length) {
            frontErrors.push({ line: i + 1, raison: entity.raison_socialle || '—', reason: `Champs manquants: ${missing.join(", ")}` });
            failedRawRows.push(row);
            continue;
          }

          entities.push(entity);
        } catch (err: any) {
          frontErrors.push({ line: i + 1, raison: '—', reason: `Erreur parsing: ${err.message}` });
          failedRawRows.push(row);
        }
      }

      let added = 0;
      let backErrors: { raison_socialle: string; message: string }[] = [];

      if (entities.length > 0) {
        const response = await axios.post(`${API_BASE_URL}/api/companies/import`, { entities }, { withCredentials: true });
        added = response.data.added || 0;
        backErrors = response.data.errors || [];

        for (const be of backErrors) {
          const idx = entities.findIndex(e =>
            (e.raison_socialle || '').toLowerCase() === (be.raison_socialle || '').toLowerCase()
          );
          if (idx !== -1) {
            const origRowIdx = (() => {
              let count = 0;
              for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.every((c: any) => !c)) continue;
                if (count === idx + frontErrors.filter(fe => { return true; }).length) return i;
                count++;
              }
              return -1;
            })();
            if (origRowIdx !== -1) failedRawRows.push(json[origRowIdx]);
          }
        }

        await fetchCompanies();
        setCurrentPage(1);
      }

      setImportResult({ added, frontErrors, backErrors, failedRows: failedRawRows, headers: rawHeaders });
    } catch (err: any) {
      console.error("Import error:", err);
      setImportResult({
        added: 0,
        frontErrors: [{ line: 0, raison: '—', reason: `Erreur serveur: ${err?.message || err}` }],
        backErrors: [],
        failedRows: [],
        headers: [],
      });
    } finally {
      setIsLoading(false);
    }
  };
  const downloadFailedRows = () => {
    if (!importResult || importResult.failedRows.length === 0) return;
    const wbOut = XLSX.utils.book_new();
    const sheetData = [importResult.headers, ...importResult.failedRows];
    const wsOut = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wbOut, wsOut, 'Echecs');
    XLSX.writeFile(wbOut, `echecs_import_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleEditCompany = async (company: Company) => {
    if (!canWrite) return;
    setEditingCompany({
      ...company,
      date_create: convertDate(company.date_create),
      date_abonnement: convertDate(company.date_abonnement),
      date_echeance: convertDate(company.date_echeance),
      date_enregistrement_rex: convertDate(company.date_enregistrement_rex),
      debut_validite_rex: convertDate(company.debut_validite_rex),
      fin_validite_rex: convertDate(company.fin_validite_rex),
    });
    setModalSegments(company.segments?.slice(0, 4) || []);
    setLogoFile(null);
    setPreviewLogo(company.logo ? `${API_BASE_URL}/images/logo_entite/${company.logo}` : null);
    await fetchModalRegions();
    if (company.region) {
      await fetchModalDelegations(company.region);
      if (company.delegation) await fetchModalLocalites(company.delegation);
    }
    setIsModalOpen(true);
    setIsActionOpen(null);
  };

  const openSelectLangModal = (company: Company) => {
    if (!canWrite) return;
    setEditingCompany(company);
    setIsSelectLangModalOpen(true);
    setIsActionOpen(null);
  };

  const openEditTitleModal = (lang: 'fr' | 'ar' | 'en') => {
    if (!editingCompany) return;
    setSelectedLang(lang);
    setEditTitle(editingCompany[`titre_${lang}`] || '');
    setIsSelectLangModalOpen(false);
    setIsEditTitleModalOpen(true);
  };

  const openTextModal = (text: string, title: string) => {
    setSelectedText(text);
    setSelectedTextTitle(title);
    setIsTextModalOpen(true);
  };

  const openLogoModal = (logo: string) => {
    setSelectedLogo(logo);
    setIsLogoModalOpen(true);
  };

  const handleEditField = async (id: number, field: string, value: string | null) => {
    if (!canWrite) return;
    try {
      await api.patch(`/api/companies/${id}/field`, { field, value }, { withCredentials: true });
      setCompanies(companies.map(c => c.id_entite === id ? { ...c, [field]: value } : c));
      setEditingField(null);
      debouncedAddNotification(`${field} mis à jour`, 'success');
    } catch (error: any) {
      debouncedAddNotification(`Échec mise à jour ${field}`, 'error');
    }
  };

  const handleTitleUpdate = async () => {
    if (!editingCompany || !selectedLang) return;
    if (!canWrite) return;
    try {
      const updatedCompany = { ...editingCompany, [`titre_${selectedLang}`]: editTitle };
      const formData = new FormData();
      Object.entries(updatedCompany).forEach(([key, val]) => {
        if (val !== null && val !== undefined) formData.append(key, val.toString());
      });
      await api.put(`/api/companies/${editingCompany.id_entite}`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCompanies(companies.map(c => c.id_entite === editingCompany.id_entite ? updatedCompany : c));
      debouncedAddNotification(`Titre ${selectedLang.toUpperCase()} mis à jour`, 'success');
      setIsEditTitleModalOpen(false);
      setSelectedLang(null);
      setEditTitle('');
      await fetchCompanies();
    } catch (error: any) {
      debouncedAddNotification(`Échec mise à jour titre ${selectedLang?.toUpperCase()}`, 'error');
    }
  };

  const handleSaveCompany = async () => {
    if (!editingCompany) return;
    if (!editingCompany.raison_socialle?.trim()) { debouncedAddNotification('Raison sociale requise', 'error'); return; }
    if (!editingCompany.identifiant_national?.trim()) { debouncedAddNotification('Identifiant national requis', 'error'); return; }
    if (!editingCompany.personne_contact?.trim()) { debouncedAddNotification('Personne de contact requise', 'error'); return; }
    if (editingCompany.type_prod === 0) { debouncedAddNotification('Type opérateur requis', 'error'); return; }

    try {
      const formData = new FormData();
      const safeAppend = (key: string, value: any) => {
        if (value == null) return;
        const trimmed = String(value).trim();
        if (trimmed) formData.append(key, trimmed);
      };

      formData.append('raison_socialle', editingCompany.raison_socialle.trim());
      formData.append('identifiant_national', editingCompany.identifiant_national.trim());
      formData.append('personne_contact', editingCompany.personne_contact.trim());
      formData.append('type_prod', editingCompany.type_prod.toString());
      formData.append('status_ent', editingCompany.status_ent || 'E');

      safeAppend('identifiant_rex', editingCompany.identifiant_rex);
      safeAppend('date_enregistrement_rex', editingCompany.date_enregistrement_rex);
      safeAppend('debut_validite_rex', editingCompany.debut_validite_rex);
      safeAppend('fin_validite_rex', editingCompany.fin_validite_rex);
      safeAppend('etat', editingCompany.etat);
      safeAppend('pays', editingCompany.pays);
      safeAppend('site', editingCompany.site);
      safeAppend('service', editingCompany.service);
      safeAppend('email', editingCompany.email);
      safeAppend('tel_mobile', editingCompany.tel_mobile);
      safeAppend('telephone', editingCompany.telephone);
      safeAppend('fax', editingCompany.fax);
      safeAppend('adresse', editingCompany.adresse);
      safeAppend('region', editingCompany.region);
      safeAppend('city', editingCompany.city || editingCompany.delegation);
      safeAppend('localite', editingCompany.localite);
      safeAppend('postalCode', editingCompany.postalCode);
      safeAppend('date_abonnement', editingCompany.date_abonnement);
      safeAppend('date_echeance', editingCompany.date_echeance);
      safeAppend('pwd', editingCompany.pwd);
      safeAppend('nb_fp', editingCompany.nb_fp);
      safeAppend('inscription', editingCompany.inscription);
      safeAppend('delegation', editingCompany.delegation);
      safeAppend('titre_fr', editingCompany.titre_fr);
      safeAppend('titre_ar', editingCompany.titre_ar);
      safeAppend('titre_en', editingCompany.titre_en);

      formData.append('segments', JSON.stringify(modalSegments));
      if (logoFile) formData.append('logo', logoFile);

      let response;
      if (editingCompany.id_entite === 0) {
        response = await api.post(`/api/companies`, formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const newId = response.data.id_entite;
        if (!newId) throw new Error('No id_entite');
        const newCompany: Company = {
          ...editingCompany,
          id_entite: newId,
          date_create: new Date().toISOString().split('T')[0],
          logo: logoFile ? URL.createObjectURL(logoFile) : null,
          segments: modalSegments,
        };
        setCompanies(prev => [newCompany, ...prev]);
        await fetchCompanies();
        setCurrentPage(1);
        debouncedAddNotification('Entité créée', 'success');
      } else {
        response = await api.put(`/api/companies/${editingCompany.id_entite}`, formData, {
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setCompanies(prev =>
          prev.map(c => c.id_entite === editingCompany.id_entite ? { ...editingCompany, ...response.data } : c)
        );
        debouncedAddNotification('Entité mise à jour', 'success');
      }

      setIsModalOpen(false);
      setLogoFile(null);
      setPreviewLogo(null);
      setModalSegments([]);
      setEditingCompany(null);
    } catch (error: any) {
      debouncedAddNotification(`Échec sauvegarde: ${error.response?.data?.error || error.message}`, 'error');
    }
  };

  const handleArchiveCompany = async (id: number) => {
    if (!canWrite) return;
    if (!window.confirm('Confirmer archivage ?')) return;
    try {
      await api.put(`/api/companies/${id}/archive`, { etat: 'archivé' }, { withCredentials: true });
      setCompanies(companies.filter(c => c.id_entite !== id));
      setIsActionOpen(null);
      debouncedAddNotification('Entité archivée', 'success');
    } catch (error: any) {
      debouncedAddNotification('Échec archivage', 'error');
    }
  };

  const handleSendConnection = async (email: string) => {
    if (!canWrite) return;
    try {
      await api.post(`/api/send-connection`, { email }, { withCredentials: true });
      setIsActionOpen(null);
      debouncedAddNotification('Fiche connexion envoyée', 'success');
    } catch (error: any) {
      debouncedAddNotification('Échec envoi fiche', 'error');
    }
  };

  const applySort = (key: keyof Company, direction: 'ascending' | 'descending') => {
    setSortConfig({ key, direction });
    setCurrentPage(1);
    const sorted = [...companies].sort((a, b) => {
      let aVal: any = a[key];
      let bVal: any = b[key];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'ascending' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return direction === 'ascending' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    setCompanies(sorted);
  };

  const handleSort = (key: keyof Company) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig?.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    applySort(key, direction);
  };

  // Small segmented ↑ / ↓ control shown on each sortable column header.
  const SortToggle = ({ column }: { column: keyof Company }) => (
    <span className="ent-sort-toggle" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={sortConfig?.key === column && sortConfig.direction === 'ascending' ? 'active' : ''}
        onClick={() => applySort(column, 'ascending')}
        title="Ordre croissant"
      >
        ↑
      </button>
      <button
        type="button"
        className={sortConfig?.key === column && sortConfig.direction === 'descending' ? 'active' : ''}
        onClick={() => applySort(column, 'descending')}
        title="Ordre décroissant"
      >
        ↓
      </button>
    </span>
  );

  const toggleActionDropdown = (id: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const dropdownWidth = 160;
    let left = rect.right - dropdownWidth;
    let top = rect.bottom + 4;
    if (left < 10) left = 10;
    if (left + dropdownWidth > window.innerWidth) left = window.innerWidth - dropdownWidth - 10;
    if (top + 220 > window.innerHeight) top = rect.top - 220;
    setDropdownPosition({ top, left });
    setIsActionOpen(isActionOpen === id ? null : id);
  };

  const renderFormattedText = (text: string | null, companyId: number, lang: string, title: string) => {
    const div = document.createElement('div');
    div.innerHTML = text || '';
    const lineCount = div.innerText.split('\n').length;
    return (
      <div
        className={`max-h-16 overflow-y-auto text-sm ${lineCount > 5 ? 'cursor-pointer' : ''}`}
        onClick={() => canWrite && lineCount > 5 && openTextModal(text || '', title)}
      >
        <div dangerouslySetInnerHTML={{ __html: text || 'N/A' }} />
        {lineCount > 5 && <span style={{ color: 'var(--accent)' }} className="text-xs">... voir plus</span>}
      </div>
    );
  };

  const shouldShowDescriptions = (company: Company) => [2, 6].includes(company.type_prod);

  const totalColumns = 12 + (canWrite ? 1 : 0); // +1 vs before: new "Segments" column, +1 again: new "SCI" column, +1 again: selection checkbox column

  const openSiteModal = (site?: Site) => {
    if (!selectedCompany) return;
    const newSite: Site = site ?? {
      id_site: 0, id_entite: selectedCompany.id_entite, nom_site: '', gln: null,
      adresse: null, region: null, delegation: null, localite: null, code_postal: null,
      principal: editingSites.length === 0 ? 1 : 0, created_at: null,
    };
    setEditingSite(newSite);
    setIsSiteModalOpen(true);
    fetchModalRegions().then(() => {
      if (newSite.region) {
        fetchModalDelegations(newSite.region).then(() => {
          if (newSite.delegation) fetchModalLocalites(newSite.delegation);
        });
      }
    });
  };

  const handleSaveSite = async () => {
    if (!editingSite || !selectedCompany) return;
    try {
      let updated: Site[];
      if (editingSite.id_site === 0) {
        const res = await api.post(`/api/sites`, editingSite, { withCredentials: true });
        updated = [...editingSites, res.data];
      } else {
        await api.put(`/api/sites/${editingSite.id_site}`, editingSite, { withCredentials: true });
        updated = editingSites.map(s => s.id_site === editingSite.id_site ? { ...editingSite } : s);
      }
      if (editingSite.principal === 1) {
        updated = updated.map(s => ({ ...s, principal: s.id_site === editingSite.id_site ? 1 : 0 }));
      }
      setEditingSites(updated);
      setSitesMap(prev => ({ ...prev, [selectedCompany.id_entite]: updated }));
      setIsSiteModalOpen(false);
      debouncedAddNotification('Site sauvegardé', 'success');
    } catch (err) {
      debouncedAddNotification('Échec sauvegarde site', 'error');
    }
  };

  const handleDeleteSite = async (id_site: number) => {
    if (!selectedCompany) return;
    try {
      await api.delete(`/api/sites/${id_site}`, { withCredentials: true });
      const updated = editingSites.filter(s => s.id_site !== id_site);
      setEditingSites(updated);
      setSitesMap(prev => ({ ...prev, [selectedCompany.id_entite]: updated }));
      debouncedAddNotification('Site supprimé', 'success');
    } catch (err) {
      debouncedAddNotification('Échec suppression site', 'error');
    }
  };

  const handleSetPrimarySite = async (id_site: number) => {
    if (!selectedCompany) return;
    try {
      await api.put(`/api/sites/${selectedCompany.id_entite}/set-primary/${id_site}`, {}, { withCredentials: true });
      const updated = editingSites.map(s => ({ ...s, principal: s.id_site === id_site ? 1 : 0 }));
      setEditingSites(updated);
      setSitesMap(prev => ({ ...prev, [selectedCompany.id_entite]: updated }));
      debouncedAddNotification('Site principal défini', 'success');
    } catch (err) {
      debouncedAddNotification('Échec définition principal', 'error');
    }
  };

  const handleOpenSitesManagement = async (company: Company) => {
    if (!canWrite) return;
    setSelectedCompany(company);
    await fetchSites(company.id_entite);
    setEditingSites(sitesMap[company.id_entite] || []);
    setIsSitesManagementModalOpen(true);
    setIsActionOpen(null);
  };

  const convertDate = (date: string | null | undefined) => date ? date.split('T')[0] : '';

  const getLogoUrl = (logo: string | null) => logo ? `${API_BASE_URL}/images/logo_entite/${logo}` : '';

  const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = '/placeholder-logo.png';
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setLogoFile(file); setPreviewLogo(URL.createObjectURL(file)); }
  };

  const handleLogoDelete = () => { setPreviewLogo(null); setLogoFile(null); };

  useEffect(() => {
    fetchCompanies();
    fetchSegments();
    fetchPaysList();
  }, [searchRegion, searchDelegation, searchType]);

  useEffect(() => {
    const handleClickOutsideFilters = (e: MouseEvent) => {
      if (filtersBarRef.current && !filtersBarRef.current.contains(e.target as Node)) {
        setIsTypeOpen(false);
        setIsRegionOpen(false);
        setIsSegmentOpen(false);
        setIsDestinationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideFilters);
    return () => document.removeEventListener('mousedown', handleClickOutsideFilters);
  }, []);

  useEffect(() => {
    if (isActionOpen === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-dropdown') && !target.closest('[data-action-btn]')) {
        setIsActionOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActionOpen]);

  // ─── SHARED MODAL INPUT STYLE ────────────────────────────────────────────
  const modalInput = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition";
  const modalInputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' } as React.CSSProperties;
  const modalLabelStyle = { fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 };
  const modalSelectStyle = { ...modalInputStyle, appearance: 'none' as const };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── GLOBAL STYLES ─────────────────────────────────────────────────── */}
      <style>{`
     @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

:root {
  --bg: #ffffff;
  --surface: #ffffff;
  --surface2: #f8fafc;
  --surface3: #f1f5f9;

  --border: #e2e8f0;

  --accent: #172554;
  --accent-text: #ffffff;

  --text: #0f172a;
  --text2: #334155;
  --muted: #64748b;

  --danger: #dc2626;

  --pill-bg: #eff6ff;



  --header-border: #cbd5e1;
  --header-bg: #eef2f9;

  --expand-bg: #f8fafc;

  --shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'DM Sans', sans-serif; font-size: 14px; }

.ent-header {
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
  padding: 20px 32px 16px;
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow);
  position: sticky;
  top: 0;
  z-index: 10;
  overflow: visible;
}

.ent-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #93c5fd;
  margin-bottom: 14px;
}

.ent-breadcrumb span {
  color: #93c5fd;
  font-weight: 500;
}

.ent-breadcrumb .sep {
  color: rgba(255, 255, 255, 0.3);
}

.ent-title {
  font-family: 'Syne', sans-serif;
  font-size: 20px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--text); line-height: 1.2;
}

.ent-filters {
  display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;
  justify-content: space-between;
  padding: 18px 32px; border-bottom: 1px solid var(--border);
  background: var(--surface3);
}
.ent-filters-left {
  display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;
  flex: 1 1 auto; min-width: 0;
}
.ent-filters-right {
  display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;
  flex-shrink: 0;
}

.ent-filter-group { display: flex; flex-direction: column; gap: 4px; }
.ent-filter-label {
  font-size: 10px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap;
}

.ent-filter-btn {
  height: 38px; min-width: 160px; padding: 0 12px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text2); font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  cursor: pointer; transition: border-color 0.15s, color 0.15s, box-shadow 0.15s; white-space: nowrap;
}
.ent-filter-btn:hover, .ent-filter-btn.active { border-color: var(--accent); color: var(--accent); }
.ent-filter-btn.active { box-shadow: 0 0 0 3px rgba(23,37,84,0.08); }

.ent-filter-input {
  height: 38px; padding: 0 12px 0 36px;
  background: #eff6ff; border: 1.5px solid var(--accent);
  border-radius: 8px; color: var(--text); font-size: 13px;
  font-family: 'DM Sans', sans-serif; outline: none; min-width: 200px;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.ent-filter-input::placeholder { color: #64748b; }
.ent-filter-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(23,37,84,0.15); }

.ent-filter-dropdown {
  position: fixed; z-index: 9999;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; box-shadow: var(--shadow);
  max-height: 260px; overflow-y: auto;
}
.ent-filter-dropdown-item {
  padding: 9px 14px; font-size: 13px; color: var(--text2);
  cursor: pointer; transition: background 0.1s, color 0.1s;
  border-bottom: 1px solid var(--border);
}
.ent-filter-dropdown-item:last-child { border-bottom: none; }
.ent-filter-dropdown-item:hover { background: var(--surface2); color: var(--accent); }

/* chevron on filter buttons — smooth rotate instead of flipping glyphs */
.ent-chevron {
  width: 13px; height: 13px; color: var(--muted); flex-shrink: 0;
  transition: transform 0.22s cubic-bezier(.4,0,.2,1), color 0.15s;
}
.ent-chevron.open { transform: rotate(180deg); }
.ent-filter-btn.active .ent-chevron, .ent-filter-btn:hover .ent-chevron { color: var(--accent); }

/* dropdown entrance animation */
@keyframes entDropIn {
  from { opacity: 0; transform: translateY(-6px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.ent-filter-dropdown { animation: entDropIn .16s cubic-bezier(.16,1,.3,1); transform-origin: top center; }

/* nested delegation accordion — slides open smoothly */
@keyframes entSlideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.ent-sub-accordion { animation: entSlideDown .18s ease-out; }

/* segment picker — two per row, indented checkboxes */
.ent-segment-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; padding: 6px;
}
.ent-segment-grid label.ent-filter-dropdown-item {
  border-bottom: none; border-radius: 7px; padding: 8px 10px 8px 8px;
  margin: 0;
}
.ent-segment-grid label.ent-filter-dropdown-item span {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* asc / desc segmented toggle on sortable table headers */
.ent-sort-toggle {
  display: inline-flex; margin-left: 7px; border-radius: 5px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.32); vertical-align: middle;
}
.ent-sort-toggle button {
  border: none; background: transparent; padding: 3px 6px; font-size: 9px;
  line-height: 1; cursor: pointer; color: rgba(255,255,255,0.5);
  transition: background 0.15s, color 0.15s; display: flex; align-items: center;
}
.ent-sort-toggle button + button { border-left: 1px solid rgba(255,255,255,0.32); }
.ent-sort-toggle button.active { background: rgba(255,255,255,0.24); color: #fff; }
.ent-sort-toggle button:hover { color: #fff; }

.ent-action-btn {
  height: 36px; padding: 0 16px;
  background: var(--accent); color: var(--accent-text);
  border: none; border-radius: 8px;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center; gap: 6px;
  white-space: nowrap;
}
.ent-action-btn:hover { opacity: 0.88; }

.ent-results-bar {
  padding: 10px 32px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: var(--surface3); font-size: 12px; color: var(--muted);
}
.ent-results-bar strong { color: var(--accent); font-weight: 600; }

.ent-table-wrap {
  overflow-x: auto;
  overflow-y: visible;
  padding: 16px 32px 32px;
}
.ent-table {
  width: 100%; border-collapse: separate; border-spacing: 0 3px; min-width: 900px;
}

.ent-table thead tr th {
  padding: 10px 12px; text-align: left;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.09em; white-space: nowrap; user-select: none;
  cursor: pointer;
  background: var(--accent); color: var(--accent-text);
}
.ent-table thead tr th:first-child { border-radius: 8px 0 0 8px; }
.ent-table thead tr th:last-child { border-radius: 0 8px 8px 0; }
.ent-table thead tr th:hover { color: var(--accent-text); background: #22346b; }

.ent-table tbody tr {
  background: var(--surface); cursor: pointer; transition: background 0.12s;
}
.ent-table tbody tr:hover { background: var(--surface2); }
.ent-table tbody tr.expanded { background: var(--surface2); }

.ent-table tbody td {
  padding: 11px 12px; vertical-align: middle;
  border-top: 1px solid transparent; border-bottom: 1px solid transparent;
  transition: border-color 0.12s; font-size: 13px;
}
.ent-table tbody tr:hover td,
.ent-table tbody tr.expanded td { border-color: var(--border); }

.ent-table tbody tr td:first-child {
  border-left: 3px solid transparent;
  border-radius: 8px 0 0 8px; transition: border-color 0.12s;
}
.ent-table tbody tr:hover td:first-child,
.ent-table tbody tr.expanded td:first-child { border-left-color: var(--accent); }
.ent-table tbody tr td:last-child { border-radius: 0 8px 8px 0; }

.ent-company-name {
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
  color: var(--text); line-height: 1.3;
}

.ent-pill {
  display: inline-block; padding: 2px 8px; border-radius: 20px;
  font-size: 11px; font-weight: 500;
  background: var(--pill-bg); color: var(--text2); border: 1px solid var(--border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;
}
.ent-pill.seg {
  background: rgba(58,143,110,0.12); color: #4db890; border-color: rgba(58,143,110,0.28);
}
.ent-pill.status-a {
  background: rgba(58,143,110,0.12); color: #4db890; border-color: rgba(58,143,110,0.3);
}
.ent-pill.status-e {
  background: rgba(23, 37, 84, 0.08);
  color: #172554;
  border-color: rgba(23, 37, 84, 0.2);
}
.ent-pill.status-i {
  background: rgba(122,128,144,0.12); color: var(--muted); border-color: rgba(122,128,144,0.3);
}

/* SCI column value — plain Oui / Non, no badge */
.ent-sci-value {
  font-size: 12px; font-weight: 600;
}
.ent-sci-value.oui { color: #d4a32a; }
.ent-sci-value.non { color: var(--muted); font-weight: 500; }

/* SCI group header — shown once above the contiguous block of SCI entities */
.ent-sci-group-header td {
  padding: 10px 12px 8px !important;
  border-bottom: none !important;
  background: transparent;
}
.ent-sci-group-label {
  display: flex; align-items: center; gap: 9px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(212,163,42,0.10);
  border: 1px solid rgba(212,163,42,0.3);
  width: fit-content;
}
.ent-sci-group-badge {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 9px; border-radius: 6px;
  font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
  background: rgba(212,163,42,0.18); color: #d4a32a; border: 1px solid rgba(212,163,42,0.4);
  white-space: nowrap;
}
.ent-sci-group-text {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: 0.02em; color: #b8901f;
}

/* Rows belonging to the SCI group — subtle indent + accent so membership reads without repeating the label */
tr.ent-row-sci {
  border-left: 2px solid rgba(212,163,42,0.35);
}
tr.ent-row-sci td:first-child {
  padding-left: 14px;
}

/* Destinations "view more" affordance */
.ent-view-more {
  background: none; border: none; cursor: pointer;
  color: var(--accent); font-size: 11px; font-weight: 600;
  padding: 2px 4px; white-space: nowrap; text-decoration: underline;
  text-underline-offset: 2px;
}
.ent-view-more:hover { opacity: 0.8; }

.ent-expand-content {
  background: var(--expand-bg); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px 22px; margin-bottom: 4px;
}
.ent-expand-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px 20px; margin-bottom: 16px;
}
.ent-expand-section h4 {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--muted); margin-bottom: 5px; font-weight: 600;
}
.ent-expand-section p { font-size: 13px; color: var(--text); line-height: 1.5; }
.ent-expand-section a { font-size: 13px; color: var(--accent); text-decoration: none; }
.ent-expand-section a:hover { text-decoration: underline; }
.ent-expand-divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }

.ent-pagination {
  display: flex; justify-content: center; align-items: center;
  gap: 5px; padding: 16px 32px 28px; flex-wrap: wrap;
  border-top: 1px solid var(--border);
}
.ent-page-btn {
  width: 34px; height: 34px; border-radius: 7px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--muted); font-family: 'DM Sans', sans-serif; font-size: 13px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.ent-page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.ent-page-btn.active { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
.ent-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.ent-page-info { font-size: 12px; color: var(--muted); padding: 0 6px; }

.action-dropdown {
  position: fixed !important;
  z-index: 99999 !important;
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 10px !important;
  box-shadow: var(--shadow) !important;
  overflow: visible !important;
}
.action-dropdown-item {
  padding: 10px 16px; font-size: 13px; color: var(--text2);
  cursor: pointer; transition: background 0.1s, color 0.1s;
  border-bottom: 1px solid var(--border);
}
.action-dropdown-item:last-child { border-bottom: none; }
.action-dropdown-item:hover { background: var(--surface2); color: var(--accent); }
.action-dropdown-item.danger:hover { color: var(--danger); background: rgba(224,80,80,0.08); }

.ent-main-action-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 99999;
  overflow: visible;
}
.ent-main-action-item {
  padding: 11px 16px; font-size: 13px; color: var(--text2);
  cursor: pointer; transition: background 0.1s, color 0.1s;
  border-bottom: 1px solid var(--border);
}
.ent-main-action-item:last-child { border-bottom: none; }
.ent-main-action-item:hover { background: var(--surface2); color: var(--accent); }

.ent-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999 !important;
  padding: 16px;
  overflow: visible;
}
.ent-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.15);
  overflow: visible;
  width: 90vw;
  max-width: var(--modal-max, 640px);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100000;
}
.ent-modal-header {
  background: var(--header-bg); border-bottom: 1px solid var(--border);
  padding: 18px 24px; display: flex; justify-content: space-between; align-items: center;
  cursor: move; flex-shrink: 0;
}
.ent-modal-title {
  font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700;
  color: var(--text); letter-spacing: -0.01em;
}
.ent-modal-subtitle { font-size: 11px; color: var(--muted); margin-top: 2px; }
.ent-modal-close {
  background: none; border: none; color: var(--muted); cursor: pointer;
  display: flex; align-items: center; transition: color 0.15s; padding: 4px;
}
.ent-modal-close:hover { color: var(--accent); }
.ent-modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.ent-modal-footer {
  padding: 16px 24px; border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
}

.ent-btn-secondary {
  padding: 8px 20px; border-radius: 8px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text2); font-family: 'DM Sans', sans-serif; font-size: 13px;
  cursor: pointer; transition: all 0.15s;
}
.ent-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

.ent-btn-primary {
  padding: 8px 20px; border-radius: 8px;
  background: var(--accent); border: none; color: var(--accent-text);
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.ent-btn-primary:hover { opacity: 0.88; }

.ent-btn-danger {
  padding: 8px 20px; border-radius: 8px;
  background: transparent; border: 1px solid var(--danger);
  color: var(--danger); font-family: 'DM Sans', sans-serif; font-size: 13px;
  cursor: pointer; transition: all 0.15s;
}
.ent-btn-danger:hover { background: rgba(224,80,80,0.1); }

.ent-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.ent-form-grid.cols-1 { grid-template-columns: 1fr; }
.ent-form-field { display: flex; flex-direction: column; gap: 4px; }
.ent-form-field.span-2 { grid-column: span 2; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }

.logo-img { width: 36px; height: 36px; object-fit: contain; border-radius: 4px; cursor: pointer; }
.ql-container { font-size: 0.875rem; }
.ql-editor { min-height: 150px; background: var(--surface2); color: var(--text); }
.ql-toolbar { background: var(--surface); border-color: var(--border) !important; }
.ql-container.ql-snow { border-color: var(--border) !important; }
      `}</style>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
           <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Entités</span>
        
      </nav>
      

      {/* ── CONTENT CARD (filters + table + pagination) ───────────────────────── */}
      <div className="mx-4 md:mx-6 my-4 bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">

      {/* ── FILTER BAR ──────────────────────────────────────────────────────── */}
      <div className="ent-filters" ref={filtersBarRef}>
        <div className="ent-filters-left">
        {/* TYPE D'OPÉRATEUR */}
        <div className="ent-filter-group" ref={typeRef}>
          <span className="ent-filter-label">Type d'opérateur</span>
          <button
            type="button"
            className={`ent-filter-btn ${searchType ? 'active' : ''}`}
            style={{ minWidth: 200 }}
            onClick={(e) => {
              const next = !isTypeOpen;
              setIsTypeOpen(next);
              if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
              setIsRegionOpen(false); setIsSegmentOpen(false); setIsDestinationOpen(false);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {searchType ? typeOptions.find(t => t.value === searchType)?.label || searchType : 'Tous les types'}
            </span>
            <ChevronDownIcon className={`ent-chevron ${isTypeOpen ? 'open' : ''}`} />
          </button>
          {isTypeOpen && filterDropdownPos && (
            <div className="ent-filter-dropdown" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: Math.max(filterDropdownPos.width, 220) }}>
              <div className="ent-filter-dropdown-item" onClick={() => handleTypeSelect('')} style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tous les types</div>
              {typeOptions.map(t => (
                <div key={t.value} className="ent-filter-dropdown-item" onClick={() => handleTypeSelect(t.value)}>{t.label}</div>
              ))}
            </div>
          )}
        </div>

        {/* SEGMENT — multi-select */}
        <div className="ent-filter-group" ref={segmentRef}>
          <span className="ent-filter-label">Segment</span>
          <button
            type="button"
            className={`ent-filter-btn ${searchSegments.length ? 'active' : ''}`}
            onClick={(e) => {
              const next = !isSegmentOpen;
              setIsSegmentOpen(next);
              if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
              setIsTypeOpen(false); setIsRegionOpen(false); setIsDestinationOpen(false);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {searchSegments.length === 0
                ? 'Tous les segments'
                : searchSegments.length === 1
                  ? (segments.find(s => s.code === searchSegments[0])?.libelle || searchSegments[0])
                  : `${searchSegments.length} segments sélectionnés`}
            </span>
            <ChevronDownIcon className={`ent-chevron ${isSegmentOpen ? 'open' : ''}`} />
          </button>
          {isSegmentOpen && filterDropdownPos && (
            <div
              className="ent-filter-dropdown"
              style={{
                top: filterDropdownPos.top,
                left: Math.min(filterDropdownPos.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 420),
                width: 400,
              }}
            >
              <div className="ent-segment-grid">
                {segments.map(s => (
                  <label key={s.code} className="ent-filter-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={searchSegments.includes(s.code)}
                      onChange={() => toggleSegmentValue(s.code)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                    />
                    <span>{s.libelle}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                <span
                  onClick={() => { setSearchSegments([]); setCurrentPage(1); }}
                  style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}
                >
                  Réinitialiser
                </span>
                <span
                  onClick={() => setIsSegmentOpen(false)}
                  style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Fermer
                </span>
              </div>
            </div>
          )}
        </div>

        {/* DESTINATION — multi-select, the 7 export countries added from the importateurs/exportateurs list */}
        <div className="ent-filter-group" ref={destinationRef}>
          <span className="ent-filter-label">Destination</span>
          <button
            type="button"
            className={`ent-filter-btn ${searchDestinations.length ? 'active' : ''}`}
            onClick={(e) => {
              const next = !isDestinationOpen;
              setIsDestinationOpen(next);
              if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
              setIsTypeOpen(false); setIsRegionOpen(false); setIsSegmentOpen(false);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {searchDestinations.length === 0
                ? 'Toutes les destinations'
                : searchDestinations.length === 1
                  ? DESTINATION_OPTIONS.find(d => d.key === searchDestinations[0])?.label
                  : `${searchDestinations.length} destinations sélectionnées`}
            </span>
            <ChevronDownIcon className={`ent-chevron ${isDestinationOpen ? 'open' : ''}`} />
          </button>
          {isDestinationOpen && filterDropdownPos && (
            <div className="ent-filter-dropdown" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: Math.max(filterDropdownPos.width, 220) }}>
              {DESTINATION_OPTIONS.map(d => (
                <label key={d.key} className="ent-filter-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={searchDestinations.includes(d.key)}
                    onChange={() => toggleDestinationValue(d.key)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                <span
                  onClick={() => { setSearchDestinations([]); setCurrentPage(1); }}
                  style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}
                >
                  Réinitialiser
                </span>
                <span
                  onClick={() => setIsDestinationOpen(false)}
                  style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Fermer
                </span>
              </div>
            </div>
          )}
        </div>

        {/* RÉGION / DÉLÉGATION — combined: pick a région, its délégations expand right underneath */}
        <div className="ent-filter-group" ref={regionRef}>
          <span className="ent-filter-label">Région / Délégation</span>
          <button
            type="button"
            className={`ent-filter-btn ${searchRegion ? 'active' : ''}`}
            style={{ minWidth: 220 }}
            onClick={(e) => {
              if (modalRegions.length === 0) fetchModalRegions();
              const next = !isRegionOpen;
              setIsRegionOpen(next);
              if (next) {
                setFilterDropdownPos(getDropdownPos(e.currentTarget));
                setRegionDelExpanded(searchRegion || '');
                if (searchRegion) fetchDelegations(searchRegion);
              }
              setIsTypeOpen(false); setIsSegmentOpen(false); setIsDestinationOpen(false);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {searchRegion ? (searchDelegation ? `${searchRegion} › ${searchDelegation}` : searchRegion) : 'Toutes les régions'}
            </span>
            <ChevronDownIcon className={`ent-chevron ${isRegionOpen ? 'open' : ''}`} />
          </button>
          {isRegionOpen && filterDropdownPos && (
            <div className="ent-filter-dropdown" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: Math.max(filterDropdownPos.width, 260) }}>
              <div
                className="ent-filter-dropdown-item"
                onClick={clearRegionDelegation}
                style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}
              >
                Toutes les régions
              </div>
              {modalRegions.map(r => (
                <div key={r.region}>
                  <div
                    className="ent-filter-dropdown-item"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontWeight: searchRegion === r.region ? 600 : 400,
                      color: searchRegion === r.region ? 'var(--accent)' : 'var(--text2)',
                    }}
                    onClick={() => handleRegionPick(r.region)}
                  >
                    <span>{r.region}</span>
                    <ChevronDownIcon
                      className={`ent-chevron ${regionDelExpanded === r.region ? 'open' : ''}`}
                      style={{ width: 12, height: 12, transform: regionDelExpanded === r.region ? 'rotate(180deg)' : 'rotate(-90deg)' }}
                    />
                  </div>
                  {regionDelExpanded === r.region && (
                    <div className="ent-sub-accordion" style={{ background: 'var(--surface2)' }}>
                      <div
                        className="ent-filter-dropdown-item"
                        style={{ paddingLeft: 30, fontSize: 12, color: 'var(--muted)' }}
                        onClick={() => handleDelegationPick('')}
                      >
                        Toutes les délégations
                      </div>
                      {delegations.length === 0 ? (
                        <div style={{ padding: '9px 14px 9px 30px', fontSize: 12, color: 'var(--muted)' }}>Aucune délégation</div>
                      ) : (
                        delegations.map(d => (
                          <div
                            key={d.delegation}
                            className="ent-filter-dropdown-item"
                            style={{
                              paddingLeft: 30, fontSize: 12,
                              fontWeight: searchDelegation === d.delegation ? 600 : 400,
                              color: searchDelegation === d.delegation ? 'var(--accent)' : 'var(--text2)',
                            }}
                            onClick={() => handleDelegationPick(d.delegation)}
                          >
                            {d.delegation}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        {/* ── right-hand cluster: search sits right beside the actions button ── */}
        <div className="ent-filters-right">
        <div className="ent-filter-group" style={{ width: 260 }}>
          <span className="ent-filter-label">Rechercher</span>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlassIcon style={{ width: 15, height: 15, color: 'var(--accent)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Raison sociale, contact, email…"
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
              className="ent-filter-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* ACTIONS */}
        {canWrite && (
          <div className="ent-filter-group" style={{ position: 'relative' }} ref={mainActionRef}>
            <span className="ent-filter-label" style={{ opacity: 0 }}>.</span>
            <button type="button" className="ent-action-btn" onClick={() => setIsMainActionOpen(prev => !prev)}>
              Actions <ChevronDownIcon className={`ent-chevron ${isMainActionOpen ? 'open' : ''}`} style={{ color: 'rgba(255,255,255,0.85)' }} />
            </button>
            {isMainActionOpen && (
              <div className="ent-main-action-dropdown">
                <div className="ent-main-action-item" onClick={handleAddCompany}>+ Ajouter entité</div>
                <div className="ent-main-action-item" onClick={handleAddMultiple}>↑ Importer plusieurs</div>
                <div className="ent-main-action-item" onClick={handleExport}>↓ Exporter</div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── RESULTS BAR ─────────────────────────────────────────────────────── */}
      <div className="ent-results-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div><strong>{filteredCompanies.length.toLocaleString('fr')}</strong>‎  résultats</div>

          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={handleExportContacts}
                className="ent-btn-primary"
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                ↓ Exporter contacts
              </button>
              {selectedIds.size < filteredCompanies.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  Tout sélectionner ({filteredCompanies.length})
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
              >
                Désélectionner
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Afficher</span>
          <select
            value={itemsPerPage}
            onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', padding: '4px 10px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>par page</span>
        </div>
      </div>

      {/* ── MAIN TABLE ──────────────────────────────────────────────────────── */}
      <div className="ent-table-wrap" ref={tableRef}>
        <table className="ent-table">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  ref={el => { if (el) el.indeterminate = !isAllPageSelected && isSomePageSelected; }}
                  onChange={toggleSelectAllOnPage}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                  title="Sélectionner tout sur cette page"
                />
              </th>
              <th style={{ width: 52 }}>Logo</th>
              <th style={{ width: 160 }}>Segments</th>
              <th onClick={() => handleSort('raison_socialle')}>Raison sociale<SortToggle column="raison_socialle" /></th>
              <th onClick={() => handleSort('sci')} style={{ width: 84, textAlign: 'center' }}>SCI<SortToggle column="sci" /></th>
              <th style={{ width: 180 }}>Destinations</th>
              <th onClick={() => handleSort('personne_contact')}>Contact<SortToggle column="personne_contact" /></th>
              <th onClick={() => handleSort('email')}>Email<SortToggle column="email" /></th>
              <th onClick={() => handleSort('tel_mobile')}>Mobile<SortToggle column="tel_mobile" /></th>
              <th onClick={() => handleSort('region')}>Région<SortToggle column="region" /></th>
              <th onClick={() => handleSort('city')}>Ville<SortToggle column="city" /></th>
              <th style={{ width: 40 }}></th>
              {canWrite && <th style={{ width: 120, textAlign: 'center' }}>Statut / Actions</th>}
            </tr>
          </thead>

          <tbody>
            {!userResolved ? (
              <tr>
                <td colSpan={totalColumns} style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 15 }}>
                  Chargement…
                </td>
              </tr>
            ) : paginatedCompanies.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 15 }}>
                  Aucune entité ne correspond à ces critères
                </td>
              </tr>
            ) : paginatedCompanies.map((company, index) => {
              const isSci = Number(company.sci) === 1;
              const prevIsSci = index > 0 && Number(paginatedCompanies[index - 1].sci) === 1;
              const isSciGroupStart = isSci && !prevIsSci;
              let sciGroupCount = 0;
              if (isSciGroupStart) {
                for (let i = index; i < paginatedCompanies.length && Number(paginatedCompanies[i].sci) === 1; i++) sciGroupCount++;
              }

              return (
              <React.Fragment key={company.id_entite}>
                {isSciGroupStart && (
                  <tr className="ent-sci-group-header">
                    <td colSpan={totalColumns}>
                      <div className="ent-sci-group-label">
                        <span className="ent-sci-group-badge">SCI</span>
                        <span className="ent-sci-group-text">
                          Groupement SCI — {sciGroupCount} entité{sciGroupCount > 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                <tr
                  className={[
                    expandedRow === company.id_entite ? 'expanded' : '',
                    isSci ? 'ent-row-sci' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleRow(company.id_entite)}
                >
                  {/* Selection checkbox */}
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id_entite)}
                      onChange={() => toggleSelectOne(company.id_entite)}
                      style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                    />
                  </td>

                  {/* Logo */}
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {company.logo ? (
                      <img
                        src={getLogoUrl(company.logo)}
                        alt="Logo"
                        className="logo-img"
                        style={{ margin: '0 auto' }}
                        onClick={() => openLogoModal(getLogoUrl(company.logo))}
                        onError={handleLogoError}
                      />
                    ) : (
                      <div style={{ width: 36, height: 36, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 12, color: 'var(--muted)', border: '1px solid var(--border)' }}>
                        {company.raison_socialle.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </td>

                  {/* Segments — shown right before Raison sociale so the entity's activity segments are visible at a glance */}
                  <td>
                    {company.segments?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 150 }}>
                        {company.segments.slice(0, 2).map(code => {
                          const label = segments.find(s => s.code === code)?.libelle;
                          return label ? <span key={code} className="ent-pill seg" style={{ maxWidth: 90 }} title={label}>{label}</span> : null;
                        })}
                        {company.segments.length > 2 && (
                          <span
                            className="ent-pill"
                            title={company.segments.slice(2).map(code => segments.find(s => s.code === code)?.libelle || code).join(', ')}
                          >
                            +{company.segments.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Raison sociale */}
                  <td onClick={e => editingField?.id === company.id_entite && e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'raison_socialle' ? (
                      <input
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'raison_socialle', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : (
                      <span className="ent-company-name">
                        {company.raison_socialle}
                      </span>
                    )}
                  </td>

                  {/* SCI — plain Oui / Non. The visual highlight + grouping now lives once, above the group. */}
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <span className={Number(company.sci) === 1 ? 'ent-sci-value oui' : 'ent-sci-value non'}>
                      {Number(company.sci) === 1 ? 'Oui' : 'Non'}
                    </span>
                  </td>

                  {/* Destinations (export) — swapped out of the collapsible so it's visible without expanding */}
                  <td onClick={e => e.stopPropagation()}>
                    {DESTINATION_OPTIONS.some(d => Number(company[d.key]) === 1) ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 170, alignItems: 'center' }}>
                        {DESTINATION_OPTIONS.filter(d => Number(company[d.key]) === 1).slice(0, 2).map(d => (
                          <span key={d.key} className="ent-pill" style={{ background: 'rgba(23,37,84,0.08)', color: 'var(--accent)', borderColor: 'rgba(23,37,84,0.22)', maxWidth: 90 }} title={d.label}>
                            {d.label}
                          </span>
                        ))}
                        {DESTINATION_OPTIONS.filter(d => Number(company[d.key]) === 1).length > 2 && (
                          <button
                            type="button"
                            className="ent-view-more"
                            onClick={(e) => { e.stopPropagation(); toggleRow(company.id_entite); }}
                            title="Voir toutes les destinations"
                          >
                            +{DESTINATION_OPTIONS.filter(d => Number(company[d.key]) === 1).length - 2} · voir plus
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Contact */}
                  <td style={{ color: 'var(--text2)', fontSize: 12 }} onClick={e => editingField?.id === company.id_entite && e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'personne_contact' ? (
                      <input
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'personne_contact', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : company.personne_contact || '—'}
                  </td>

                  {/* Email */}
                  <td style={{ color: 'var(--text2)', fontSize: 12, wordBreak: 'break-all' }} onClick={e => e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'email' ? (
                      <input
                        type="email"
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'email', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : company.email ? (
                      <a href={`mailto:${company.email}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}
                        onClick={e => e.stopPropagation()}>
                        {company.email.length > 28 ? company.email.slice(0, 28) + '…' : company.email}
                      </a>
                    ) : '—'}
                  </td>

                  {/* Mobile */}
                  <td style={{ color: 'var(--text2)', fontSize: 12 }} onClick={e => editingField?.id === company.id_entite && e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'tel_mobile' ? (
                      <input
                        type="tel"
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'tel_mobile', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : company.tel_mobile ? (
                      <a href={`tel:${company.tel_mobile}`} style={{ color: 'var(--text2)', textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>{company.tel_mobile}</a>
                    ) : '—'}
                  </td>

                  {/* Région */}
                  <td style={{ color: 'var(--text2)', fontSize: 12 }} onClick={e => editingField?.id === company.id_entite && e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'region' ? (
                      <input
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'region', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : company.region || '—'}
                  </td>

                  {/* Ville */}
                  <td style={{ color: 'var(--text2)', fontSize: 12 }} onClick={e => editingField?.id === company.id_entite && e.stopPropagation()}>
                    {editingField?.id === company.id_entite && editingField.field === 'city' ? (
                      <input
                        value={editingField.value}
                        onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                        onBlur={() => handleEditField(company.id_entite, 'city', editingField.value)}
                        style={{ ...modalInputStyle, width: '100%', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                        autoFocus
                      />
                    ) : company.city || '—'}
                  </td>

                  {/* Expand */}
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleRow(company.id_entite)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 4, transition: 'color 0.15s' }}
                    >
                      {expandedRow === company.id_entite
                        ? <ChevronUpIcon style={{ width: 16, height: 16 }} />
                        : <ChevronDownIcon style={{ width: 16, height: 16 }} />
                      }
                    </button>
                  </td>

                  {/* Statut + Actions */}
                  {canWrite && (
                    <td style={{ textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span className={`ent-pill ${company.status_ent === 'A' ? 'status-a' : company.status_ent === 'E' ? 'status-e' : 'status-i'}`}>
                          {company.status_ent === 'A' ? 'Actif' : company.status_ent === 'E' ? 'En attente' : 'Inactif'}
                        </span>
                        <button
                          data-action-btn
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2, transition: 'color 0.15s' }}
                          onClick={e => toggleActionDropdown(company.id_entite, e)}
                        >
                          ≡
                        </button>
                      </div>

                      {isActionOpen === company.id_entite && dropdownPosition && (
                        <div
                          className="action-dropdown"
                          style={{ position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 9999, minWidth: 160 }}
                        >
                          <div className="action-dropdown-item" onClick={() => handleEditCompany(company)}>Modifier</div>
                          {shouldShowDescriptions(company) && (
                            <div className="action-dropdown-item" onClick={() => openSelectLangModal(company)}>Modifier description</div>
                          )}
                          <div className="action-dropdown-item" onClick={() => handleOpenSitesManagement(company)}>Gérer sites</div>
                          <div className="action-dropdown-item" onClick={() => handleCreateSupervisorProfile(company)}>Créer admin</div>
                          {company.email && (
                            <div className="action-dropdown-item" onClick={() => handleSendConnection(company.email!)}>Envoyer connexion</div>
                          )}
                        <div className="action-dropdown-item danger" style={{ color: 'var(--danger)' }} onClick={() => handleArchiveCompany(company.id_entite)}>Archiver</div>     </div>
                      )}
                    </td>
                  )}
                </tr>

                {/* ── EXPANDED ROW ─────────────────────────────────────────── */}
                {expandedRow === company.id_entite && (
                  <tr>
                    <td colSpan={totalColumns} style={{ padding: '0 12px 6px' }}>
                      <div className="ent-expand-content">
                        {/* Info Grid */}
                        <div className="ent-expand-grid">
                          <div className="ent-expand-section">
                            <h4>Identifiant national</h4>
                            <p>{company.identifiant_national || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Date création</h4>
                            <p>{company.date_create || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Pays</h4>
                            <p>{paysList.find(p => p.isoNumeric === company.pays)?.libelle || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Statut</h4>
                            <p>{company.status_ent === 'A' ? 'Actif' : company.status_ent === 'E' ? 'En attente' : 'Inactif'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Identifiant REX</h4>
                            <p>{company.identifiant_rex || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Date enreg. REX</h4>
                            <p>{company.date_enregistrement_rex || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Début validité REX</h4>
                            <p>{company.debut_validite_rex || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Fin validité REX</h4>
                            <p>{company.fin_validite_rex || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Adresse</h4>
                            <p>{company.adresse || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Délégation</h4>
                            <p>{company.delegation || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Localité</h4>
                            <p>{company.localite || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Code postal</h4>
                            <p>{company.postalCode || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Tél fixe</h4>
                            <p>{company.telephone ? <a href={`tel:${company.telephone}`}>{company.telephone}</a> : '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Fax</h4>
                            <p>{company.fax || '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Site web</h4>
                            <p>{company.site ? (
                              <a href={company.site.startsWith('http') ? company.site : `https://${company.site}`} target="_blank" rel="noopener noreferrer">{company.site}</a>
                            ) : '—'}</p>
                          </div>
                          <div className="ent-expand-section">
                            <h4>Type</h4>
                            <p>{typeOptions.find(t => t.value === String(company.type_prod))?.label || '—'}</p>
                          </div>
                        </div>

                        {/* Segments */}
                        {company.segments?.length > 0 && (
                          <>
                            <hr className="ent-expand-divider" />
                            <div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Segments d'activité</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {company.segments.map(code => {
                                  const label = segments.find(s => s.code === code)?.libelle;
                                  return label ? <span key={code} className="ent-pill seg">{label}</span> : null;
                                })}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Destinations — full list, untruncated, so the rest of the destinations can be read */}
                        {DESTINATION_OPTIONS.some(d => Number(company[d.key]) === 1) && (
                          <>
                            <hr className="ent-expand-divider" />
                            <div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
                                Destinations ({DESTINATION_OPTIONS.filter(d => Number(company[d.key]) === 1).length})
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {DESTINATION_OPTIONS.filter(d => Number(company[d.key]) === 1).map(d => (
                                  <span key={d.key} className="ent-pill" style={{ background: 'rgba(23,37,84,0.08)', color: 'var(--accent)', borderColor: 'rgba(23,37,84,0.22)' }}>
                                    {d.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Descriptions */}
                        {shouldShowDescriptions(company) && (
                          <>
                            <hr className="ent-expand-divider" />
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>Descriptions</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                              {(['fr', 'ar', 'en'] as const).map(lang => (
                                <div key={lang} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>
                                    {lang === 'fr' ? 'Français' : lang === 'ar' ? 'Arabe' : 'Anglais'}
                                  </div>
                                  {renderFormattedText(company[`titre_${lang}`] || null, company.id_entite, lang, `Description ${lang.toUpperCase()}`)}
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Sites */}
                        <hr className="ent-expand-divider" />
                        <div
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', transition: 'border-color 0.15s' }}
                          onClick={() => setSitesExpanded(prev => !prev)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                              Sites de {company.raison_socialle}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>
                              {sitesMap[company.id_entite]?.length || 0}
                            </span>
                          </div>
                          {sitesExpanded
                            ? <ChevronUpIcon style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                            : <ChevronDownIcon style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                          }
                        </div>

                        {sitesExpanded && (
                          <div style={{ marginTop: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                            {sitesMap[company.id_entite] ? (
                              sitesMap[company.id_entite].length > 0 ? (
                                <div>
                                  {sitesMap[company.id_entite].map((site, idx) => (
                                    <div
                                      key={site.id_site}
                                      style={{ padding: '12px 16px', borderBottom: idx < sitesMap[company.id_entite].length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', transition: 'background 0.1s' }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{site.nom_site}</span>
                                          {site.principal === 1 && (
                                            <span style={{ background: 'rgba(58,143,110,0.12)', color: '#4db890', border: '1px solid rgba(58,143,110,0.3)', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>Principal</span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{site.adresse || '—'} · {site.localite || '—'} {site.code_postal || ''}</div>
                                        {site.gln && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>GLN : {site.gln}</div>}
                                      </div>
                                      {canWrite && (
                                        <button
                                          onClick={e => { e.stopPropagation(); handleOpenSitesManagement(company); }}
                                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '2px 6px' }}
                                        >
                                          Modifier
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                                  Aucun site enregistré pour cette entité
                                </div>
                              )
                            ) : (
                              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
                                <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── PAGINATION ──────────────────────────────────────────────────────── */}
      <div className="ent-pagination">
        <button className="ent-page-btn" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</button>
        <button className="ent-page-btn" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>‹</button>
        {(() => {
          const total = Math.max(1, Math.ceil(filteredCompanies.length / itemsPerPage));
          const delta = 2;
          const range: number[] = [];
          for (let i = Math.max(1, currentPage - delta); i <= Math.min(total, currentPage + delta); i++) range.push(i);
          return range.map(p => (
            <button key={p} className={`ent-page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => setCurrentPage(p)}>{p}</button>
          ));
        })()}
        <button className="ent-page-btn" onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(filteredCompanies.length / itemsPerPage)))} disabled={currentPage >= Math.ceil(filteredCompanies.length / itemsPerPage)}>›</button>
        <button className="ent-page-btn" onClick={() => setCurrentPage(Math.ceil(filteredCompanies.length / itemsPerPage))} disabled={currentPage >= Math.ceil(filteredCompanies.length / itemsPerPage)}>»</button>
        <span className="ent-page-info">Page {currentPage} / {Math.max(1, Math.ceil(filteredCompanies.length / itemsPerPage))}</span>
      </div>

      </div>
      {/* end content card */}


      {/* ─── BASIC CREATE MODAL ──────────────────────────────────────────────── */}
      {isBasicModalOpen && basicEditingCompany && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '680px' } as React.CSSProperties} ref={modalRef}>
              <div className="ent-modal-header modal-handle">
                <div>
                  <div className="ent-modal-title">Nouvelle entité</div>
                  <div className="ent-modal-subtitle">Informations de base</div>
                </div>
                <button className="ent-modal-close" onClick={() => setIsBasicModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>

              <div className="ent-modal-body">
                <div className="ent-form-grid">
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Raison sociale *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={basicEditingCompany.raison_socialle || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, raison_socialle: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Identifiant national *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={basicEditingCompany.identifiant_national || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, identifiant_national: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Personne de contact *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={basicEditingCompany.personne_contact || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, personne_contact: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Email</label>
                    <input style={modalInputStyle} className={modalInput} type="email" value={basicEditingCompany.email || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, email: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Téléphone</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={basicEditingCompany.telephone || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, telephone: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Mobile</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={basicEditingCompany.tel_mobile || ''} onChange={e => setBasicEditingCompany(c => c ? { ...c, tel_mobile: e.target.value } : null)} />
                  </div>
                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Type d'opérateur *</label>
                    <select style={modalSelectStyle} className={modalInput} value={String(basicEditingCompany.type_prod || 0)} onChange={e => setBasicEditingCompany(c => c ? { ...c, type_prod: Number(e.target.value) } : null)}>
                      <option value="0">Sélectionner…</option>
                      {typeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Segments (max. 4)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {segments.map(s => (
                        <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: modalSegments.includes(s.code) ? 'rgba(232,200,72,0.08)' : 'var(--surface2)', border: `1px solid ${modalSegments.includes(s.code) ? 'rgba(232,200,72,0.3)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
                          <input
                            type="checkbox"
                            checked={modalSegments.includes(s.code)}
                            onChange={() => {
                              setModalSegments(prev => {
                                if (prev.includes(s.code)) return prev.filter(c => c !== s.code);
                                if (prev.length >= 4) { debouncedAddNotification('Maximum 4 segments', 'error'); return prev; }
                                return [...prev, s.code];
                              });
                            }}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.libelle}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ent-modal-footer">
                <button className="ent-btn-secondary" onClick={() => setIsBasicModalOpen(false)}>Annuler</button>
                <button className="ent-btn-primary" onClick={handleSaveBasicCompany}>Enregistrer & compléter</button>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── FULL EDIT / CREATE MODAL ─────────────────────────────────────────── */}
      {isModalOpen && editingCompany && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '1100px' } as React.CSSProperties} ref={modalRef}>
              <div className="ent-modal-header modal-handle">
                <div>
                  <div className="ent-modal-title">{editingCompany.id_entite === 0 ? 'Créer entité' : 'Modifier entité'}</div>
                  {editingCompany.raison_socialle && <div className="ent-modal-subtitle">{editingCompany.raison_socialle}</div>}
                </div>
                <button className="ent-modal-close" onClick={() => setIsModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>

              <div className="ent-modal-body">
                <div className="ent-form-grid">

                  {/* Logo */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Logo</label>
                    {previewLogo ? (
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={previewLogo} alt="Logo" style={{ height: 72, width: 72, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openLogoModal(previewLogo)} onError={handleLogoError} />
                        <button onClick={handleLogoDelete} style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={handleLogoFileChange} style={{ fontSize: 12, color: 'var(--text2)' }} />
                    )}
                  </div>

                  {/* Raison sociale */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Raison sociale *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.raison_socialle} onChange={e => setEditingCompany(c => c ? { ...c, raison_socialle: e.target.value } : null)} />
                  </div>

                  {/* Identifiant national */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Identifiant national *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.identifiant_national || ''} onChange={e => setEditingCompany(c => c ? { ...c, identifiant_national: e.target.value } : null)} />
                  </div>

                  {/* Personne de contact */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Personne de contact *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.personne_contact || ''} onChange={e => setEditingCompany(c => c ? { ...c, personne_contact: e.target.value } : null)} />
                  </div>

                  {/* Type opérateur */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Type d'opérateur *</label>
                    <select style={modalSelectStyle} className={modalInput} value={String(editingCompany.type_prod)} onChange={e => setEditingCompany(c => c ? { ...c, type_prod: Number(e.target.value) } : null)}>
                      <option value="0">Sélectionner…</option>
                      {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Statut */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Statut</label>
                    <select style={modalSelectStyle} className={modalInput} value={editingCompany.status_ent || 'E'} onChange={e => setEditingCompany(c => c ? { ...c, status_ent: e.target.value } : null)}>
                      <option value="E">En attente</option>
                      <option value="A">Actif</option>
                      <option value="I">Inactif</option>
                    </select>
                  </div>

                  {/* Identifiant REX */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Identifiant REX</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.identifiant_rex || ''} onChange={e => setEditingCompany(c => c ? { ...c, identifiant_rex: e.target.value } : null)} />
                  </div>

                  {/* Date enregistrement REX */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Date enregistrement REX</label>
                    <input style={modalInputStyle} className={modalInput} type="date" value={editingCompany.date_enregistrement_rex || ''} onChange={e => setEditingCompany(c => c ? { ...c, date_enregistrement_rex: e.target.value } : null)} />
                  </div>

                  {/* Début validité REX */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Début validité REX</label>
                    <input style={modalInputStyle} className={modalInput} type="date" value={editingCompany.debut_validite_rex || ''} onChange={e => setEditingCompany(c => c ? { ...c, debut_validite_rex: e.target.value } : null)} />
                  </div>

                  {/* Fin validité REX */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Fin validité REX</label>
                    <input style={modalInputStyle} className={modalInput} type="date" value={editingCompany.fin_validite_rex || ''} onChange={e => setEditingCompany(c => c ? { ...c, fin_validite_rex: e.target.value } : null)} />
                  </div>

                  {/* Date création */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Date de création</label>
                    <input style={{ ...modalInputStyle, opacity: 0.6, cursor: 'not-allowed' }} className={modalInput} type="date" value={editingCompany.date_create || new Date().toISOString().split('T')[0]} readOnly />
                  </div>

                  {/* Pays */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Pays</label>
                    <select style={modalSelectStyle} className={modalInput} value={editingCompany.pays || ''} onChange={e => setEditingCompany(c => c ? { ...c, pays: e.target.value } : null)}>
                      <option value="">Sélectionner…</option>
                      {paysList.map(p => <option key={p.isoNumeric} value={p.isoNumeric}>{p.libelle}</option>)}
                    </select>
                  </div>

                  {/* Site web */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Site web</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.site || ''} onChange={e => setEditingCompany(c => c ? { ...c, site: e.target.value } : null)} />
                  </div>

                  {/* Service */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Service</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.service || ''} onChange={e => setEditingCompany(c => c ? { ...c, service: e.target.value } : null)} />
                  </div>

                  {/* Email */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Email</label>
                    <input style={modalInputStyle} className={modalInput} type="email" value={editingCompany.email || ''} onChange={e => setEditingCompany(c => c ? { ...c, email: e.target.value } : null)} />
                  </div>

                  {/* Tel mobile */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Téléphone mobile</label>
                    <input style={modalInputStyle} className={modalInput} type="tel" value={editingCompany.tel_mobile || ''} onChange={e => setEditingCompany(c => c ? { ...c, tel_mobile: e.target.value } : null)} />
                  </div>

                  {/* Telephone fixe */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Téléphone fixe</label>
                    <input style={modalInputStyle} className={modalInput} type="tel" value={editingCompany.telephone || ''} onChange={e => setEditingCompany(c => c ? { ...c, telephone: e.target.value } : null)} />
                  </div>

                  {/* Fax */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Fax</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.fax || ''} onChange={e => setEditingCompany(c => c ? { ...c, fax: e.target.value } : null)} />
                  </div>

                  {/* Région */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Région</label>
                    <select style={modalSelectStyle} className={modalInput} value={editingCompany.region || ''}
                      onChange={async (e) => {
                        const region = e.target.value;
                        setEditingCompany(prev => prev ? { ...prev, region, delegation: '', localite: '', postalCode: '' } : null);
                        await fetchModalDelegations(region);
                      }}>
                      <option value="">— Sélectionner —</option>
                      {modalRegions.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                    </select>
                  </div>

                  {/* Délégation */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Délégation</label>
                    <select style={{ ...modalSelectStyle, opacity: editingCompany?.region ? 1 : 0.5, cursor: editingCompany?.region ? 'pointer' : 'not-allowed' }} className={modalInput} value={editingCompany.delegation || ''}
                      disabled={!editingCompany?.region}
                      onChange={async (e) => {
                        const delegation = e.target.value;
                        setEditingCompany(prev => prev ? { ...prev, delegation, localite: '', postalCode: '' } : null);
                        await fetchModalLocalites(delegation);
                      }}>
                      <option value="">— Sélectionner —</option>
                      {modalDelegations.map(d => <option key={d.delegation} value={d.delegation}>{d.delegation}</option>)}
                    </select>
                  </div>

                  {/* Localité */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Localité</label>
                    <select style={{ ...modalSelectStyle, opacity: editingCompany?.delegation ? 1 : 0.5, cursor: editingCompany?.delegation ? 'pointer' : 'not-allowed' }} className={modalInput} value={editingCompany.localite || ''}
                      disabled={!editingCompany?.delegation}
                      onChange={(e) => {
                        const localite = e.target.value;
                        const match = modalLocalites.find(l => l.localite === localite);
                        setEditingCompany(prev => prev ? { ...prev, localite, postalCode: match?.code_postal || '' } : null);
                      }}>
                      <option value="">— Sélectionner —</option>
                      {modalLocalites.map(l => <option key={l.localite} value={l.localite}>{l.localite}</option>)}
                    </select>
                  </div>

                  {/* Code postal */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Code postal</label>
                    <input style={{ ...modalInputStyle, opacity: 0.6, cursor: 'not-allowed' }} className={modalInput} type="text" value={editingCompany.postalCode || ''} readOnly />
                  </div>

                  {/* Adresse */}
                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Adresse complète</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingCompany.adresse || ''} onChange={e => setEditingCompany(c => c ? { ...c, adresse: e.target.value } : null)} />
                  </div>

                  {/* Date abonnement */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Date d'abonnement</label>
                    <input style={modalInputStyle} className={modalInput} type="date" value={editingCompany.date_abonnement || ''} onChange={e => setEditingCompany(c => c ? { ...c, date_abonnement: e.target.value } : null)} />
                  </div>

                  {/* Date échéance */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Date d'échéance</label>
                    <input style={modalInputStyle} className={modalInput} type="date" value={editingCompany.date_echeance || ''} onChange={e => setEditingCompany(c => c ? { ...c, date_echeance: e.target.value } : null)} />
                  </div>

                  {/* Segments */}
                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Segments d'activité (max. 4)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                      {segments.map(s => (
                        <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: modalSegments.includes(s.code) ? 'rgba(232,200,72,0.08)' : 'var(--surface2)', border: `1px solid ${modalSegments.includes(s.code) ? 'rgba(232,200,72,0.3)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
                          <input
                            type="checkbox"
                            checked={modalSegments.includes(s.code)}
                            onChange={() => {
                              setModalSegments(prev => {
                                if (prev.includes(s.code)) return prev.filter(c => c !== s.code);
                                if (prev.length >= 4) { debouncedAddNotification('4 segments maximum', 'error'); return prev; }
                                return [...prev, s.code];
                              });
                            }}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.libelle}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ent-modal-footer">
                <button className="ent-btn-secondary" onClick={() => setIsModalOpen(false)}>Annuler</button>
                <button className="ent-btn-primary" onClick={handleSaveCompany}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── IMPORT MODAL ─────────────────────────────────────────────────────── */}
      {isImportModalOpen && (
        <Draggable handle=".modal-handle" disabled={!!importResult}>
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '560px' } as React.CSSProperties} ref={importModalRef}>
              <div className="ent-modal-header modal-handle">
                <div className="ent-modal-title">Importer des entités</div>
                <button className="ent-modal-close" onClick={() => { setIsImportModalOpen(false); setImportResult(null); setImportFileName(''); }}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>

              <div className="ent-modal-body">
                {/* Step 1: upload UI */}
                {!importResult && !isLoading && (
                  <>
                    <button
                      onClick={downloadTemplate}
                      style={{ width: '100%', padding: '12px 0', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 20 }}
                    >
                      ⬇ Télécharger le modèle Excel
                    </button>

                    <input type="file" accept=".xlsx,.xls" id="import-file"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
                      style={{ display: 'none' }} />

                    <label
                      htmlFor="import-file"
                      style={{ display: 'block', cursor: 'pointer' }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget.querySelector('.drop-zone') as HTMLElement)?.style && ((e.currentTarget.querySelector('.drop-zone') as HTMLElement).style.borderColor = 'var(--accent)'); }}
                      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget.querySelector('.drop-zone') as HTMLElement)?.style && ((e.currentTarget.querySelector('.drop-zone') as HTMLElement).style.borderColor = 'var(--border)'); }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (!file) return;
                        if (!file.name.match(/\.(xlsx|xls)$/i)) { alert("Fichier invalide — .xlsx ou .xls requis"); return; }
                        handleFileUpload(file);
                      }}
                    >
                      <div className="drop-zone" style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 40, textAlign: 'center', transition: 'border-color 0.15s, background 0.15s' }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                        <div style={{ color: 'var(--text2)', fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Cliquez ici ou glissez-déposez votre fichier</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>.xlsx ou .xls accepté</div>
                      </div>
                    </label>
                  </>
                )}

                {/* Step 2: loading */}
                {isLoading && (
                  <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ color: 'var(--text2)', fontWeight: 500 }}>Import en cours…</div>
                    {importFileName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{importFileName}</div>}
                  </div>
                )}

                {/* Step 3: result */}
                {importResult && !isLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', gap: 12, background: importResult.added > 0 ? 'rgba(58,143,110,0.1)' : 'rgba(224,80,80,0.1)', border: `1px solid ${importResult.added > 0 ? 'rgba(58,143,110,0.3)' : 'rgba(224,80,80,0.3)'}` }}>
                      <span style={{ fontSize: 24 }}>{importResult.added > 0 ? '✅' : '❌'}</span>
                      <div>
                        <div style={{ fontWeight: 600, color: importResult.added > 0 ? '#4db890' : 'var(--danger)', fontSize: 13 }}>
                          {importResult.added} entité{importResult.added !== 1 ? 's' : ''} importée{importResult.added !== 1 ? 's' : ''} avec succès
                        </div>
                        {(importResult.frontErrors.length + importResult.backErrors.length) > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
                            {importResult.frontErrors.length + importResult.backErrors.length} ligne{(importResult.frontErrors.length + importResult.backErrors.length) !== 1 ? 's' : ''} échouée{(importResult.frontErrors.length + importResult.backErrors.length) !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {(importResult.frontErrors.length + importResult.backErrors.length) > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Détail des erreurs</div>
                        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)' }}>
                              <tr>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', width: 60 }}>Ligne</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Entité</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Raison</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importResult.frontErrors.map((e, i) => (
                                <tr key={`fe-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(224,80,80,0.05)' }}>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>{e.line || '—'}</td>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.raison}</td>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--danger)' }}>{e.reason}</td>
                                </tr>
                              ))}
                              {importResult.backErrors.map((e, i) => (
                                <tr key={`be-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(232,200,72,0.05)' }}>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>—</td>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.raison_socialle}</td>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#e8c848' }}>{e.message}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {importResult.failedRows.length > 0 && (
                      <button
                        onClick={downloadFailedRows}
                        style={{ width: '100%', padding: '10px 0', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
                      >
                        ⬇ Télécharger les lignes échouées ({importResult.failedRows.length}) pour correction
                      </button>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => { setImportResult(null); setImportFileName(''); }} className="ent-btn-secondary" style={{ flex: 1 }}>↩ Importer un autre</button>
                      <button onClick={() => { setIsImportModalOpen(false); setImportResult(null); setImportFileName(''); }} className="ent-btn-primary" style={{ flex: 1 }}>Fermer</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── LOGO ZOOM MODAL ──────────────────────────────────────────────────── */}
      {isLogoModalOpen && selectedLogo && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '800px' } as React.CSSProperties} ref={logoModalRef}>
              <div className="ent-modal-header modal-handle">
                <div className="ent-modal-title">Logo de l'entité</div>
                <button className="ent-modal-close" onClick={() => setIsLogoModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>
              <div className="ent-modal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <img src={selectedLogo} alt="Logo agrandi" style={{ maxWidth: '100%', height: 'auto' }} />
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── LANGUAGE SELECTION MODAL ──────────────────────────────────────────── */}
      {isSelectLangModalOpen && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '440px' } as React.CSSProperties} ref={selectLangModalRef}>
              <div className="ent-modal-header modal-handle">
                <div className="ent-modal-title">Choisir la langue</div>
                <button className="ent-modal-close" onClick={() => setIsSelectLangModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>
              <div className="ent-modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(['fr', 'ar', 'en'] as const).map((lang, i) => (
                    <button key={lang} onClick={() => openEditTitleModal(lang)}
                      style={{ padding: '14px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; }}
                    >
                      {['🇫🇷 Français', '🇸🇦 Arabe', '🇬🇧 Anglais'][i]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── TITLE EDITOR (ReactQuill) ──────────────────────────────────────────── */}
      {isEditTitleModalOpen && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '900px' } as React.CSSProperties} ref={editTitleModalRef}>
              <div className="ent-modal-header modal-handle">
                <div>
                  <div className="ent-modal-title">Édition — {selectedLang === 'fr' ? 'Français' : selectedLang === 'ar' ? 'Arabe' : 'Anglais'}</div>
                </div>
                <button className="ent-modal-close" onClick={() => setIsEditTitleModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>
              <div className="ent-modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ReactQuill theme="snow" value={editTitle} onChange={setEditTitle} modules={quillModules} style={{ flex: 1 }} className="h-[420px]" />
              </div>
              <div className="ent-modal-footer">
                <button className="ent-btn-secondary" onClick={() => setIsEditTitleModalOpen(false)}>Annuler</button>
                <button className="ent-btn-primary" onClick={handleTitleUpdate}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── TEXT PREVIEW MODAL ──────────────────────────────────────────────────── */}
      {isTextModalOpen && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '1000px' } as React.CSSProperties} ref={textModalRef}>
              <div className="ent-modal-header modal-handle">
                <div className="ent-modal-title">{selectedTextTitle}</div>
                <button className="ent-modal-close" onClick={() => setIsTextModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>
              <div className="ent-modal-body prose max-w-none" style={{ color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: selectedText || '<p>Aucun contenu</p>' }} />
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── SITES MANAGEMENT MODAL ──────────────────────────────────────────────── */}
      {isSitesManagementModalOpen && selectedCompany && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '900px' } as React.CSSProperties} ref={sitesManagementModalRef}>
              <div className="ent-modal-header modal-handle">
                <div>
                  <div className="ent-modal-title">Gestion des sites</div>
                  <div className="ent-modal-subtitle">{selectedCompany.raison_socialle}</div>
                </div>
                <button className="ent-modal-close" onClick={() => setIsSitesManagementModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>

              <div className="ent-modal-body">
                <button onClick={() => openSiteModal()} className="ent-btn-primary" style={{ marginBottom: 20 }}>+ Ajouter un site</button>

                {editingSites.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Aucun site enregistré pour cette entité
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {editingSites.map(site => (
                      <div key={site.id_site} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', background: 'var(--surface)', transition: 'border-color 0.15s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{site.nom_site}</span>
                              {site.principal === 1 && (
                                <span style={{ background: 'rgba(58,143,110,0.12)', color: '#4db890', border: '1px solid rgba(58,143,110,0.3)', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>Principal</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{site.adresse || '—'} · {site.localite || '—'} {site.code_postal || ''}</div>
                            {site.gln && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>GLN : {site.gln}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <button onClick={() => openSiteModal(site)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Modifier</button>
                            <button onClick={() => handleDeleteSite(site.id_site)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Supprimer</button>
                            {site.principal !== 1 && (
                              <button onClick={() => handleSetPrimarySite(site.id_site)} style={{ background: 'none', border: 'none', color: '#4db890', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Définir principal</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Draggable>
      )}

      {/* ─── SINGLE SITE ADD/EDIT MODAL ─────────────────────────────────────────── */}
      {isSiteModalOpen && editingSite && (
        <Draggable handle=".modal-handle">
          <div className="ent-modal-overlay">
            <div className="ent-modal" style={{ '--modal-max': '720px' } as React.CSSProperties} ref={modalRef}>
              <div className="ent-modal-header modal-handle">
                <div>
                  <div className="ent-modal-title">{editingSite.id_site === 0 ? 'Nouveau site' : 'Modifier site'}</div>
                  <div className="ent-modal-subtitle">{selectedCompany?.raison_socialle}</div>
                </div>
                <button className="ent-modal-close" onClick={() => setIsSiteModalOpen(false)}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
              </div>

              <div className="ent-modal-body">
                <div className="ent-form-grid">
                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Nom du site *</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingSite.nom_site || ''} onChange={e => setEditingSite(s => s ? { ...s, nom_site: e.target.value } : null)} />
                  </div>

                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>GLN</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingSite.gln || ''} onChange={e => setEditingSite(s => s ? { ...s, gln: e.target.value } : null)} />
                  </div>

                  <div className="ent-form-field span-2">
                    <label style={modalLabelStyle}>Adresse</label>
                    <input style={modalInputStyle} className={modalInput} type="text" value={editingSite.adresse || ''} onChange={e => setEditingSite(s => s ? { ...s, adresse: e.target.value } : null)} />
                  </div>

                  {/* Région */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Région</label>
                    <select style={modalSelectStyle} className={modalInput} value={editingSite.region || ''}
                      onChange={(e) => {
                        const newRegion = e.target.value || null;
                        setEditingSite(prev => prev ? { ...prev, region: newRegion, delegation: null, localite: null, code_postal: null } : null);
                        if (newRegion) fetchModalDelegations(newRegion);
                        else { setModalDelegations([]); setModalLocalites([]); }
                      }}>
                      <option value="">Sélectionner une région</option>
                      {modalRegions.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
                    </select>
                  </div>

                  {/* Délégation */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Délégation</label>
                    <select style={{ ...modalSelectStyle, opacity: editingSite?.region ? 1 : 0.5 }} className={modalInput} value={editingSite.delegation || ''}
                      disabled={!editingSite?.region}
                      onChange={(e) => {
                        const newDelegation = e.target.value || null;
                        setEditingSite(prev => prev ? { ...prev, delegation: newDelegation, localite: null, code_postal: null } : null);
                        if (newDelegation) fetchModalLocalites(newDelegation);
                        else setModalLocalites([]);
                      }}>
                      <option value="">Sélectionner une délégation</option>
                      {modalDelegations.map(d => <option key={d.delegation} value={d.delegation}>{d.delegation}</option>)}
                    </select>
                  </div>

                  {/* Localité */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Localité</label>
                    <select style={{ ...modalSelectStyle, opacity: editingSite?.delegation ? 1 : 0.5 }} className={modalInput} value={editingSite.localite || ''}
                      disabled={!editingSite?.delegation}
                      onChange={(e) => {
                        const selectedLocalite = e.target.value || null;
                        const found = modalLocalites.find(l => l.localite === selectedLocalite);
                        setEditingSite(prev => prev ? { ...prev, localite: selectedLocalite, code_postal: found ? found.code_postal : null } : null);
                      }}>
                      <option value="">Sélectionner une localité</option>
                      {modalLocalites.map(l => <option key={l.localite} value={l.localite}>{l.localite}</option>)}
                    </select>
                  </div>

                  {/* Code postal */}
                  <div className="ent-form-field">
                    <label style={modalLabelStyle}>Code postal</label>
                    <input style={{ ...modalInputStyle, opacity: 0.6, cursor: 'not-allowed' }} className={modalInput} type="text" value={editingSite.code_postal || ''} readOnly />
                  </div>

                  {/* Principal */}
                  <div className="ent-form-field span-2">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <input
                        type="checkbox"
                        checked={editingSite.principal === 1}
                        onChange={e => setEditingSite(s => s ? { ...s, principal: e.target.checked ? 1 : 0 } : null)}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>Site principal</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="ent-modal-footer">
                <button className="ent-btn-secondary" onClick={() => setIsSiteModalOpen(false)}>Annuler</button>
                <button className="ent-btn-primary" onClick={handleSaveSite}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Draggable>
      )}

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Entite;