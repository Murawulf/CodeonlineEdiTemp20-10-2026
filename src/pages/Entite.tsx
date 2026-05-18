import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
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
};

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
  const typeOptions = [
    { value: "1", label: "Entreprise privée produits & services" },
    { value: "2", label: "Entreprise privée ingénierie & services" },
    { value: "3", label: "Entreprise privée transport logistique & stockage" },
    { value: "4", label: "Entreprise publique transport logistique & stockage" },
    { value: "5", label: "Entreprise publique produits & services" },
    { value: "6", label: "Entreprise publique ingénierie & services" },
    { value: "7", label: "Autre institution publique d’appui à l’exportation" },
    { value: "8", label: "Banque" },
    { value: "9", label: "Douane" },
    { value: "10", label: "Assurance" },
  ];
  const paysList = [{ isoNumeric: '788', libelle: 'Tunisie' }];

  const [searchRegion, setSearchRegion] = useState('');
  const [searchDelegation, setSearchDelegation] = useState('');
  const [searchSegment, setSearchSegment] = useState('');
  const [searchType, setSearchType] = useState('');
  const [searchText, setSearchText] = useState('');

  const [isRegionOpen, setIsRegionOpen] = useState(false);
  const [isDelegationOpen, setIsDelegationOpen] = useState(false);
  const [isSegmentOpen, setIsSegmentOpen] = useState(false);
  const [isTypeOpen, setIsTypeOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [basicEditingCompany, setBasicEditingCompany] = useState<Company | null>(null);
  const [isBasicModalOpen, setIsBasicModalOpen] = useState(false);
  const [modalSegments, setModalSegments] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);

  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Cascading dropdown states for modal
  const [modalRegions, setModalRegions] = useState<{ region: string }[]>([]);
  const [modalDelegations, setModalDelegations] = useState<{ delegation: string }[]>([]);
  const [modalLocalites, setModalLocalites] = useState<{ localite: string; code_postal: string }[]>([]);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
  const [sitesExpanded, setSitesExpanded] = useState<boolean>(true); // true = ouvert par défaut
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
  const delegationRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
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
  const initialShowAll = true;
  const initialUser = { id_entite: 123 };

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
    // Automatically load sites if not already loaded
    if (!sitesMap[id_entite]) {
      fetchSites(id_entite);
    }
  }
};
  const fetchCompanies = async () => {
    try {
      const response = await api.get(`/api/companies`, {
        withCredentials: true,
        params: { region: searchRegion, segment: searchSegment, delegation: searchDelegation, type: searchType },
      });
      setCompanies(response.data || []);
    } catch (err) {
      console.error('Fetch companies error:', err);
      debouncedAddNotification('Échec du chargement des entités', 'error');
    }
  };

  const fetchSegments = async () => {
    try {
      const response = await api.get(`/api/segments`, {
        withCredentials: true,
      });
      setSegments(response.data || []);
    } catch (err) {
      console.error('Fetch segments error:', err);
      debouncedAddNotification('Échec du chargement des segments', 'error');
    }
  };


  const fetchDelegations = async (region: string) => {
    if (!region) {
      setDelegations([]);
      return;
    }
    try {
      const res = await fetch(`/api/delegation?region=${encodeURIComponent(region)}`);
      const data = await res.json();
      setDelegations(data);
      setSearchDelegation('');
    } catch (err) {
      console.error('Error fetching delegations:', err);
    }
  };

  const fetchModalRegions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/regions`);
      if (!res.ok) throw new Error('Failed regions');
      const data = await res.json();
      setModalRegions(data);
    } catch (err) {
      console.error('fetchModalRegions error:', err);
    }
  };

  const fetchModalDelegations = async (region: string) => {
    if (!region) {
      setModalDelegations([]);
      setModalLocalites([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/delegation?region=${encodeURIComponent(region)}`);
      if (!res.ok) throw new Error('Failed delegations');
      const data = await res.json();
      setModalDelegations(data);
      setModalLocalites([]);
    } catch (err) {
      console.error('fetchModalDelegations error:', err);
    }
  };

  const fetchModalLocalites = async (delegation: string) => {
    if (!delegation) {
      setModalLocalites([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/localite?delegation=${encodeURIComponent(delegation)}`);
      if (!res.ok) throw new Error('Failed localites');
      const data = await res.json();
      setModalLocalites(data);
    } catch (err) {
      console.error('fetchModalLocalites error:', err);
    }
  };

  const fetchSites = async (id_entite: number) => {
    try {
      const response = await api.get(`/api/sites/${id_entite}`, {
        withCredentials: true,
      });
      const sites = response.data || [];
      setSitesMap(prev => ({ ...prev, [id_entite]: sites }));
      return sites;
    } catch (err) {
      console.error('Fetch sites error:', err);
      return [];
    }
  };

  const baseCompanies = initialShowAll
    ? companies.filter(c => ![111, 999].includes(c.id_entite))
    : companies.filter(c => c.id_entite === initialUser?.id_entite && ![111, 999].includes(c.id_entite));

  const filteredCompanies = baseCompanies.filter(company =>
    company.raison_socialle.toLowerCase().includes(searchText.toLowerCase()) ||
    (company.personne_contact || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (company.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleCreateSupervisorProfile = async (company: Company) => {
    if (!canWrite) return;
    try {
      await api.post(
        `/api/create-supervisor-profile`,
        { id_entite: company.id_entite, raison_socialle: company.raison_socialle },
        { withCredentials: true }
      );
      setIsActionOpen(null);
      debouncedAddNotification('Profil superviseur créé', 'success');
    } catch (error: any) {
      debouncedAddNotification('Échec création profil superviseur', 'error');
    }
  };

  const handleRegionSelect = (region: string) => {
    setSearchRegion(region);
    setSearchDelegation('');
    fetchDelegations(region);
    setIsRegionOpen(false);
    setCurrentPage(1);
  };

  const handleSegmentSelect = (segment: string) => {
    setSearchSegment(segment);
    setIsSegmentOpen(false);
    setCurrentPage(1);
  };

  const handleDelegationSelect = (delegation: string) => {
    setSearchDelegation(delegation);
    setIsDelegationOpen(false);
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
      id_entite: 0,
      raison_socialle: '',
      identifiant_national: '',
      personne_contact: '',
      email: '',
      tel_mobile: '',
      telephone: '',
      type_prod: 0,
      date_create: today,
      segments: [],
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
    if (!basicEditingCompany.raison_socialle?.trim()) {
      debouncedAddNotification("Raison sociale requise", "error");
      return;
    }
    if (!basicEditingCompany.identifiant_national?.trim()) {
      debouncedAddNotification("Identifiant national requis", "error");
      return;
    }
    if (!basicEditingCompany.personne_contact?.trim()) {
      debouncedAddNotification("Personne de contact requise", "error");
      return;
    }
    const typeVal = Number(basicEditingCompany.type_prod || 0);
    if (typeVal === 0) {
      debouncedAddNotification("Type d'opérateur requis", "error");
      return;
    }

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

      debouncedAddNotification("Entité créée. Complétez les informations.", "success");
      setIsBasicModalOpen(false);
      await fetchCompanies();
      setCurrentPage(1);

      const createdResponse = await api.get(`/api/companies/${newId}`, {
        withCredentials: true,
      });
      const created = createdResponse.data;
      if (created) {
        setEditingCompany(created);
        setModalSegments(created.segments || []);
        setIsModalOpen(true);
      }
    } catch (err: any) {
      debouncedAddNotification(`Erreur création: ${err.response?.data?.error || err.message}`, "error");
    }
  };

  const handleAddMultiple = () => {
    if (!canWrite) return;
    setIsImportModalOpen(true);
    setIsMainActionOpen(false);
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
    const response = await axios.get(`${API_BASE_URL}/api/companies/template`, {
      responseType: "blob",
      withCredentials: true,
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

 const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setIsLoading(true);

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

    if (!json || json.length < 1) {
      debouncedAddNotification("Fichier Excel vide ou mal formé", "error");
      setIsLoading(false);
      return;
    }

    const headerRow = (json[0] || []).map(h => (h || "").toString().trim());
    const entities: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < json.length; i++) {
      const row = json[i];
      if (!row || row.every((c: any) => !c)) continue;

      try {
        const entity: any = {};

        headerRow.forEach((hRaw, idx) => {
          if (!hRaw) return;
          const key = hRaw.replace("*", "").trim();
          let val = row[idx];
          if (typeof val === "string") val = val.trim();
          if (val !== undefined && val !== null && val !== "") entity[key] = val;
        });

        // Fix old/new key names
        if (entity.raison_socialle && !entity.raison_sociale) {
          entity.raison_sociale = entity.raison_socialle;
          delete entity.raison_socialle;
        }
        if (entity.type_prod && !entity.type_operateur) {
          entity.type_operateur = entity.type_prod;
          delete entity.type_prod;
        }

        // Numbers
        ["nb_fp", "inscription"].forEach(k => {
          if (entity[k] !== undefined) entity[k] = Number(entity[k]);
        });

        // Dropdown mappings
        let typeField = entity.type_operateur || entity.type_prod;
        if (typeField !== undefined) {
          const inputStr = String(typeField).trim();
          const inputLower = inputStr.toLowerCase();
          const found = typeOptions.find(
            t => t.label.toLowerCase() === inputLower || t.value === inputStr
          );
          entity.type_prod = found ? Number(found.value) : 1; // Default to 1 if no match
        } else {
          entity.type_prod = 1; // Default if missing
        }

        // For pays
        if (entity.pays !== undefined) {
          const inputStr = String(entity.pays).trim();
          const inputLower = inputStr.toLowerCase();
          let found = paysList.find(
            p => p.libelle.toLowerCase() === inputLower || p.isoNumeric === inputStr
          );
          if (!found && inputStr.includes(' ')) {
            const parts = inputStr.split(' ');
            const possibleCode = parts[0];
            const possibleLib = parts.slice(1).join(' ').toLowerCase();
            found = paysList.find(
              p => p.isoNumeric === possibleCode && p.libelle.toLowerCase() === possibleLib
            );
          }
          entity.pays = found ? found.isoNumeric : inputStr;
        }

        // For region
        if (entity.region !== undefined) {
          const inputStr = String(entity.region).trim();
          const inputLower = inputStr.toLowerCase();
          const found = regions.find(r => r.region.toLowerCase() === inputLower);
          entity.region = found ? found.region : inputStr;
        }

        // Segments (1–4)
        const segNames = [entity.segment1, entity.segment2, entity.segment3, entity.segment4]
          .filter(Boolean)
          .map(s => String(s).trim());
        const segCodes: string[] = [];
        for (const name of segNames) {
          let codeCandidate = name;
          let found = segments.find((s: Segment) => s.code === codeCandidate || s.libelle === name);
          if (!found && name.includes(' ')) {
            const parts = name.split(' ');
            codeCandidate = parts[0];
            const lib = parts.slice(1).join(' ');
            found = segments.find((s: Segment) => s.code === codeCandidate && s.libelle === lib);
          }
          if (found) {
            segCodes.push(found.code);
          } else {
            errors.push(`Ligne ${i + 1}: Segment non trouvé - ${name}`);
          }
        }
        entity.segments = segCodes.slice(0, 4);
        delete entity.segment1;
        delete entity.segment2;
        delete entity.segment3;
        delete entity.segment4;

        if (!entity.status_ent) entity.status_ent = "E";

        const missing = [];
        if (!entity.raison_sociale) missing.push("raison_sociale");
        if (!entity.identifiant_national) missing.push("identifiant_national");
        if (!entity.personne_contact) missing.push("personne_contact");
        if (entity.type_prod === 0) missing.push("type_prod"); // Only if still 0, but we set to 1
        if (missing.length) {
          errors.push(`Ligne ${i + 1}: champs manquants (${missing.join(", ")})`);
          continue;
        }

        entities.push(entity);
      } catch (err: any) {
        errors.push(`Ligne ${i + 1}: Erreur de traitement - ${err.message}`);
      }
    }

    if (entities.length === 0) {
      debouncedAddNotification(
        errors.length ? `Aucune entité valide trouvée (${errors.length} erreurs)` : "Aucune donnée trouvée dans le fichier",
        "error"
      );
      if (errors.length) {
        debouncedAddNotification(errors.join('\n'), "error");
      }
      console.warn("Import errors:", errors);
      setIsLoading(false);
      return;
    }

    const response = await axios.post(`${API_BASE_URL}/api/companies/import`, { entities }, { withCredentials: true });

    debouncedAddNotification(`${response.data.added} entités ajoutées avec succès`, "success");

    if (response.data.errors?.length) {
      const errorDetails = response.data.errors.map((err: any) => `${err.raison_socialle || 'Inconnu'}: ${err.message}`).join('\n');
      debouncedAddNotification(`Erreurs lors de l'import:\n${errorDetails}`, "error");
      console.warn("Backend import warnings:", response.data.errors);
    }

    await fetchCompanies();
    setCurrentPage(1);
    setIsImportModalOpen(false);
  } catch (err: any) {
    console.error("Import error:", err);
    debouncedAddNotification(`Échec de l'import: ${err?.message || err}`, "error");
  } finally {
    setIsLoading(false);
  }
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
      if (company.delegation) {
        await fetchModalLocalites(company.delegation);
      }
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
      await api.patch(`/api/companies/${id}/field`, { field, value }, {
        withCredentials: true,
      });
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

    if (!editingCompany.raison_socialle?.trim()) {
      debouncedAddNotification('Raison sociale requise', 'error');
      return;
    }
    if (!editingCompany.identifiant_national?.trim()) {
      debouncedAddNotification('Identifiant national requis', 'error');
      return;
    }
    if (!editingCompany.personne_contact?.trim()) {
      debouncedAddNotification('Personne de contact requise', 'error');
      return;
    }
    if (editingCompany.type_prod === 0) {
      debouncedAddNotification('Type opérateur requis', 'error');
      return;
    }

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
        response = await api.put(
          `/api/companies/${editingCompany.id_entite}`,
          formData,
          {
            withCredentials: true,
            headers: { 'Content-Type': 'multipart/form-data' },
          }
        );
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

  const handleDeleteCompany = async (id: number) => {
    if (!canWrite) return;
    if (!window.confirm('Confirmer suppression ?')) return;

    try {
      await api.delete(`/api/companies/${id}`, { withCredentials: true });
      setCompanies(companies.filter(c => c.id_entite !== id));
      setIsActionOpen(null);
      debouncedAddNotification('Entité supprimée', 'success');
    } catch (error: any) {
      debouncedAddNotification('Échec suppression', 'error');
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

  const handleSort = (key: keyof Company) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);

    const sorted = [...companies].sort((a, b) => {
      let aVal: any = a[key];
      let bVal: any = b[key];
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction === 'ascending'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return direction === 'ascending' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    setCompanies(sorted);
  };

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
        {lineCount > 5 && <span className="text-blue-600 text-xs">... voir plus</span>}
      </div>
    );
  };

  const shouldShowDescriptions = (company: Company) => [2, 6].includes(company.type_prod);

  const totalColumns = 9 + (canWrite ? 1 : 0);

const openSiteModal = (site?: Site) => {
  if (!selectedCompany) return;

  const newSite: Site = site ?? {
    id_site: 0,
    id_entite: selectedCompany.id_entite,
    nom_site: '',
    gln: null,
    adresse: null,
    region: null,
    delegation: null,
    localite: null,
    code_postal: null,
    principal: editingSites.length === 0 ? 1 : 0,
    created_at: null,
  };

  setEditingSite(newSite);
  setIsSiteModalOpen(true);

  // Load cascading data for site modal
  fetchModalRegions().then(() => {
    if (newSite.region) {
      fetchModalDelegations(newSite.region).then(() => {
        if (newSite.delegation) {
          fetchModalLocalites(newSite.delegation);
        }
      });
    }
  });
};
  const handleSaveSite = async () => {
    if (!editingSite || !selectedCompany) return;
    try {
      let updated: Site[];
      if (editingSite.id_site === 0) {
        const res = await api.post(`/api/sites`, editingSite, {
          withCredentials: true,
        });
        updated = [...editingSites, res.data];
      } else {
        await api.put(`/api/sites/${editingSite.id_site}`, editingSite, {
          withCredentials: true,
        });
        updated = editingSites.map(s => s.id_site === editingSite.id_site ? { ...editingSite } : s);
      }

      if (editingSite.principal === 1) {
        updated = updated.map(s => ({
          ...s,
          principal: s.id_site === editingSite.id_site ? 1 : 0
        }));
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
      await api.delete(`/api/sites/${id_site}`, {
        withCredentials: true,
      });
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
      await api.put(`/api/sites/${selectedCompany.id_entite}/set-primary/${id_site}`, {}, {
        withCredentials: true,
      });
      const updated = editingSites.map(s => ({
        ...s,
        principal: s.id_site === id_site ? 1 : 0
      }));
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

  const convertDate = (date: string | null) => date ? date.split('T')[0] : '';

  const getLogoUrl = (logo: string | null) => logo ? `${API_BASE_URL}/images/logo_entite/${logo}` : '';

  const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = '/placeholder-logo.png';
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setPreviewLogo(URL.createObjectURL(file));
    }
  };

  const handleLogoDelete = () => {
    setPreviewLogo(null);
    setLogoFile(null);
  };

  useEffect(() => {
    fetchCompanies();
    fetchSegments();
  }, [searchRegion, searchSegment, searchDelegation, searchType]);

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


  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Entité</span>
      </nav>

      <style>{`
        .logo-img { width: 40px; height: 40px; object-fit: contain; border-radius: 4px; cursor: pointer; }
        .ql-container { font-size: 0.875rem; }
        .ql-editor { min-height: 150px; }
        .action-dropdown { position: fixed !important; z-index: 9999 !important; }
        .loader {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          width: 40px; height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        table { table-layout: auto; width: 100%; }
        td, th { word-break: break-word; white-space: normal; }
      `}</style>

      <div className="container mx-auto p-6">
        {/* FILTER ROW */}
{/* FILTER + ACTION BAR */}
<div className="bg-white p-4 rounded shadow-sm mb-6 relative">
  <div className="grid grid-cols-6 gap-4 items-end">

    {/* TYPE */}
    <div className="relative" ref={typeRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Type d'opérateur</label>
      <button
        type="button"
        className="h-10 w-full px-3 border-2 border-gray-400 rounded-md bg-white text-sm flex justify-between items-center hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        onClick={(e) => {
          const next = !isTypeOpen;
          setIsTypeOpen(next);
          if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
          setIsRegionOpen(false);
          setIsSegmentOpen(false);
          setIsDelegationOpen(false);
        }}
      >
        <span className="truncate">
          {searchType
            ? typeOptions.find(t => t.value === searchType)?.label || searchType
            : 'Choisir un type'}
        </span>
        <span className="text-blue-950 text-xs">{isTypeOpen ? '▲' : '▼'}</span>
      </button>

      {isTypeOpen && filterDropdownPos && (
        <div className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-auto divide-y divide-gray-100"
          style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: filterDropdownPos.width }}>
          <div
            className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
            onClick={() => handleTypeSelect('')}
          >
            Tous les types
          </div>
          {typeOptions.map(t => (
            <div
              key={t.value}
              className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={() => handleTypeSelect(t.value)}
            >
              {t.label}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* REGION - modern listbox style */}
    <div className="relative" ref={regionRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
      <button
        type="button"
        className="h-10 w-full px-3 border-2 border-gray-400 rounded-md bg-white text-sm flex justify-between items-center hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        onClick={(e) => {
          if (modalRegions.length === 0) {
            fetchModalRegions();
          }
          const next = !isRegionOpen;
          setIsRegionOpen(next);
          if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
          setIsTypeOpen(false);
          setIsSegmentOpen(false);
          setIsDelegationOpen(false);
        }}
      >
        <span className="truncate">
          {searchRegion || 'Choisir une région'}
        </span>
        <span className="text-blue-950 text-xs">{isRegionOpen ? '▲' : '▼'}</span>
      </button>

      {isRegionOpen && filterDropdownPos && (
        <div className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-auto divide-y divide-gray-100"
          style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: filterDropdownPos.width }}>
          <div
            className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer font-medium text-gray-700"
            onClick={() => handleRegionSelect('')}
          >
            Toutes les régions
          </div>
          {modalRegions.map(r => (
            <div
              key={r.region}
              className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={() => handleRegionSelect(r.region)}
            >
              {r.region}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* DELEGATION - same modern style */}
    <div className="relative" ref={delegationRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Délégation</label>
      <button
        type="button"
        className="h-10 w-full px-3 border-2 border-gray-400 rounded-md bg-white text-sm flex justify-between items-center hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        onClick={(e) => {
          if (searchRegion && modalDelegations.length === 0) {
            fetchModalDelegations(searchRegion);
          }
          const next = !isDelegationOpen;
          setIsDelegationOpen(next);
          if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
          setIsTypeOpen(false);
          setIsRegionOpen(false);
          setIsSegmentOpen(false);
        }}
      >
        <span className="truncate">
          {searchDelegation || 'Choisir une délégation'}
        </span>
        <span className="text-blue-950 text-xs">{isDelegationOpen ? '▲' : '▼'}</span>
      </button>

      {isDelegationOpen && filterDropdownPos && (
        <div className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-auto divide-y divide-gray-100"
          style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: filterDropdownPos.width }}>
          <div
            className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer font-medium text-gray-700"
            onClick={() => handleDelegationSelect('')}
          >
            Toutes les délégations
          </div>
          {modalDelegations.map(d => (
            <div
              key={d.delegation}
              className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={() => handleDelegationSelect(d.delegation)}
            >
              {d.delegation}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* SEGMENT */}
    <div className="relative" ref={segmentRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Segment</label>
      <button
        type="button"
        className="h-10 w-full px-3 border-2 border-gray-400 rounded-md bg-white text-sm flex justify-between items-center hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        onClick={(e) => {
          const next = !isSegmentOpen;
          setIsSegmentOpen(next);
          if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
          setIsTypeOpen(false);
          setIsRegionOpen(false);
          setIsDelegationOpen(false);
        }}
      >
        <span className="truncate">
          {searchSegment
            ? segments.find(s => s.code === searchSegment)?.libelle || searchSegment
            : 'Choisir un segment'}
        </span>
        <span className="text-blue-950 text-xs">{isSegmentOpen ? '▲' : '▼'}</span>
      </button>

      {isSegmentOpen && filterDropdownPos && (
        <div className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-auto divide-y divide-gray-100"
          style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: filterDropdownPos.width }}>
          <div
            className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer font-medium text-gray-700"
            onClick={() => handleSegmentSelect('')}
          >
            Tous les segments
          </div>
          {segments.map(s => (
            <div
              key={s.code}
              className="px-3 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={() => handleSegmentSelect(s.code)}
            >
              {s.libelle}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* SEARCH */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Rechercher</label>
      <input
        type="text"
        placeholder="Raison sociale, contact, email..."
        value={searchText}
        onChange={e => {
          setSearchText(e.target.value);
          setCurrentPage(1);
        }}
        className="h-10 w-full px-3 border-2 border-gray-400 rounded-md text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
      />
    </div>

    {/* ACTIONS */}
    {canWrite && (
      <div className="relative">
        <label className="block text-sm text-transparent mb-1">.</label>
        <button
          type="button"
          className="h-10 w-full bg-blue-950 text-white rounded-md hover:bg-blue-800 flex items-center justify-center gap-2 transition font-medium"
          onClick={() => setIsMainActionOpen(prev => !prev)}
        >
          Actions <span className="text-xs">{isMainActionOpen ? '▲' : '▼'}</span>
        </button>

        {isMainActionOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
            <div
              className="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={handleAddCompany}
            >
              Ajouter entité
            </div>
            <div
              className="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={handleAddMultiple}
            >
              Ajouter plusieurs
            </div>
            <div
              className="px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer"
              onClick={handleExport}
            >
              Exporter
            </div>
          </div>
        )}
      </div>
    )}
  </div>
</div>

  {/* TABLE CONTROLS */}
<div className="w-full flex flex-col md:flex-row items-center justify-between mb-4 p-4 bg-white rounded shadow">
  {/* Items per page */}
  <div className="flex items-center space-x-2 mb-2 md:mb-0">
    <span className="text-sm text-gray-700">Afficher</span>
    <select
      value={itemsPerPage}
      onChange={e => {
        setItemsPerPage(Number(e.target.value));
        setCurrentPage(1);
      }}
      className="p-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      <option value={10}>10</option>
      <option value={25}>25</option>
      <option value={50}>50</option>
    </select>
    <span className="text-sm text-gray-700">par page</span>
  </div>

  {/* Pagination buttons */}
  <div className="flex items-center space-x-3">
    <button
      className="px-3 py-1 bg-blue-950 text-white rounded hover:bg-blue-800 disabled:opacity-50 transition-colors"
      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
      disabled={currentPage === 1}
    >
      Précédent
    </button>
    <span className="text-sm text-gray-700">
      Page {currentPage} sur {Math.max(1, Math.ceil(filteredCompanies.length / itemsPerPage))}
    </span>
    <button
      className="px-3 py-1 bg-blue-950 text-white rounded hover:bg-blue-800 disabled:opacity-50 transition-colors"
      onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(filteredCompanies.length / itemsPerPage)))}
      disabled={currentPage >= Math.ceil(filteredCompanies.length / itemsPerPage)}
    >
      Suivant
    </button>
  </div>
</div>


     {/* MAIN TABLE */}
<div className="overflow-x-auto bg-white rounded shadow" ref={tableRef}>
  <table className="min-w-full divide-y divide-gray-200 text-sm">
    <thead className="bg-blue-950 text-white sticky top-0 z-10">
      <tr>
        {/* Logo */}
        <th className="p-3 text-center w-14">Logo</th>

        {/* Raison sociale */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('raison_socialle')}>
          Raison sociale
        </th>

        {/* Type */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('type_prod')}>
          Type
        </th>

        {/* Contact */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('personne_contact')}>
          Contact
        </th>

        {/* Email */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('email')}>
          Email
        </th>

        {/* Mobile */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('tel_mobile')}>
          Mobile
        </th>

        {/* Région */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('region')}>
          Région
        </th>

        {/* Ville */}
        <th className="p-3 text-left cursor-pointer" onClick={() => handleSort('city')}>
          Ville
        </th>

        {/* Expand */}
        <th className="p-3 w-10 text-center"></th>

        {/* Statut + Actions */}
        {canWrite && (
          <th className="p-3 text-center whitespace-nowrap">Statut / Actions</th>
        )}
      </tr>
    </thead>

    <tbody className="divide-y divide-gray-200">
      {paginatedCompanies.map(company => (
        <React.Fragment key={company.id_entite}>
          <tr className="hover:bg-slate-50 transition-colors duration-150">
            {/* Logo */}
            <td className="p-3 text-center">
              {company.logo ? (
                <img
                  src={getLogoUrl(company.logo)}
                  alt="Logo"
                  className="logo-img mx-auto cursor-pointer"
                  onClick={() => openLogoModal(getLogoUrl(company.logo))}
                  onError={handleLogoError}
                />
              ) : '—'}
            </td>

            {/* Raison sociale */}
            <td className="p-3 align-top font-medium text-gray-900">
              {editingField?.id === company.id_entite && editingField.field === 'raison_socialle' ? (
                <input
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'raison_socialle', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : (
                company.raison_socialle
              )}
            </td>

            {/* Type */}
            <td className="p-3 align-top text-sm text-gray-700">{typeOptions.find(t => t.value === String(company.type_prod))?.label || '—'}</td>

            {/* Contact */}
            <td className="p-3 align-top">
              {editingField?.id === company.id_entite && editingField.field === 'personne_contact' ? (
                <input
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'personne_contact', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : company.personne_contact || '—'}
            </td>

            {/* Email */}
            <td className="p-3 align-top break-all">
              {editingField?.id === company.id_entite && editingField.field === 'email' ? (
                <input
                  type="email"
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'email', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : company.email || '—'}
            </td>

            {/* Mobile */}
            <td className="p-3 align-top">
              {editingField?.id === company.id_entite && editingField.field === 'tel_mobile' ? (
                <input
                  type="tel"
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'tel_mobile', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : company.tel_mobile || '—'}
            </td>

            {/* Région */}
            <td className="p-3 align-top">
              {editingField?.id === company.id_entite && editingField.field === 'region' ? (
                <input
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'region', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : company.region || '—'}
            </td>

            {/* Ville */}
            <td className="p-3 align-top">
              {editingField?.id === company.id_entite && editingField.field === 'city' ? (
                <input
                  value={editingField.value}
                  onChange={e => setEditingField({ ...editingField, value: e.target.value })}
                  onBlur={() => handleEditField(company.id_entite, 'city', editingField.value)}
                  className="w-full border rounded px-2 py-1"
                  autoFocus
                />
              ) : company.city || '—'}
            </td>

            {/* Expand button */}
            <td className="p-3 align-top text-center">
              <button
                onClick={() => toggleRow(company.id_entite)}
                className="hover:bg-gray-100 p-1 rounded-full transition-colors"
              >
                {expandedRow === company.id_entite ? (
                  <ChevronUpIcon className="h-5 w-5 text-gray-700" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5 text-gray-700" />
                )}
              </button>
            </td>

            {/* Statut + Actions */}
            {canWrite && (
              <td className="p-3 align-top text-center relative">
                <div className="flex flex-col items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    company.status_ent === 'A' ? 'bg-green-100 text-green-700' :
                    company.status_ent === 'E' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {company.status_ent === 'A' ? 'Actif' : company.status_ent === 'E' ? 'En attente' : 'Inactif'}
                  </span>
                  <button
                    data-action-btn
                    className="text-blue-950 text-xl leading-none hover:text-blue-700"
                    onClick={e => toggleActionDropdown(company.id_entite, e)}
                  >
                    ≡
                  </button>
                </div>

                {isActionOpen === company.id_entite && dropdownPosition && (
                  <div
                    className="action-dropdown bg-white border border-gray-300 rounded shadow-lg py-1 text-sm min-w-[160px]"
                    style={{
                      position: 'fixed',
                      top: dropdownPosition.top,
                      left: dropdownPosition.left,
                      zIndex: 9999
                    }}
                  >
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleEditCompany(company)}
                    >
                      Modifier
                    </div>
                    {shouldShowDescriptions(company) && (
                      <div
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => openSelectLangModal(company)}
                      >
                        Modifier description
                      </div>
                    )}
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleOpenSitesManagement(company)}
                    >
                      Gérer sites
                    </div>
                    <div
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => handleCreateSupervisorProfile(company)}
                    >
                      Créer admin
                    </div>
                    {company.email && (
                      <div
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => handleSendConnection(company.email)}
                      >
                        Envoyer connexion
                      </div>
                    )}
                    <div
                      className="px-4 py-2 text-red-600 hover:bg-red-50 cursor-pointer"
                      onClick={() => handleDeleteCompany(company.id_entite)}
                    >
                      Supprimer
                    </div>
                  </div>
                )}
              </td>
            )}
          </tr>

          {/* Expanded row */}
          {expandedRow === company.id_entite && (
            <tr>
              <td colSpan={totalColumns} className="p-0 bg-gray-50/70">
                <div className="p-6 space-y-8">

                  {/* SECTION 1 : Informations principales */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-2">Informations REX</h4>
                      <div className="space-y-2 text-sm">
                        <p><strong>Identifiant REX :</strong> {company.identifiant_rex || '—'}</p>
                        <p><strong>Date enreg. :</strong> {company.date_enregistrement_rex || '—'}</p>
                        <p><strong>Début validité :</strong> {company.debut_validite_rex || '—'}</p>
                        <p><strong>Fin validité :</strong> {company.fin_validite_rex || '—'}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-2">Informations générales</h4>
                      <div className="space-y-2 text-sm">
                        <p><strong>Identifiant national :</strong> {company.identifiant_national || '—'}</p>
                        <p><strong>Date création :</strong> {company.date_create || '—'}</p>
                        <p><strong>Pays :</strong> {paysList.find(p => p.isoNumeric === company.pays)?.libelle || '—'}</p>
                        <p><strong>Type :</strong> {typeOptions.find(t => t.value === String(company.type_prod))?.label || '—'}</p>
                        <p><strong>Statut :</strong> {
                          company.status_ent === 'A' ? 'Actif' :
                          company.status_ent === 'E' ? 'En attente' : 'Inactif'
                        }</p>
                        <div>
                          <strong>Segments :</strong>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {company.segments?.length > 0
                              ? company.segments.map(code => {
                                  const label = segments.find(s => s.code === code)?.libelle;
                                  return label ? (
                                    <span key={code} className="inline-block bg-blue-50 text-blue-800 text-xs px-2 py-0.5 rounded-full">{label}</span>
                                  ) : null;
                                })
                              : <span className="text-gray-500">—</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-2">Coordonnées & Localisation</h4>
                      <div className="space-y-2 text-sm">
                        <p><strong>Adresse :</strong> {company.adresse || '—'}</p>
                        <p><strong>Région :</strong> {company.region || '—'}</p>
                        <p><strong>Délégation :</strong> {company.delegation || '—'}</p>
                        <p><strong>Localité :</strong> {company.localite || '—'}</p>
                        <p><strong>Code postal :</strong> {company.postalCode || '—'}</p>
                        <p><strong>Tél fixe :</strong> {company.telephone || '—'}</p>
                        <p><strong>Mobile :</strong> {company.tel_mobile || '—'}</p>
                        <p><strong>Fax :</strong> {company.fax || '—'}</p>
                        <p><strong>Site web :</strong> {company.site ? (
                          <a 
                            href={company.site.startsWith('http') ? company.site : `https://${company.site}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {company.site}
                          </a>
                        ) : '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2 : Descriptions */}
                  {shouldShowDescriptions(company) && (
                    <div className="pt-4 border-t border-gray-200">
                      <h3 className="font-semibold text-lg mb-4">Descriptions</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h5 className="font-medium mb-2 text-blue-900">Français</h5>
                          {renderFormattedText(company.titre_fr, company.id_entite, 'fr', 'Description FR')}
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h5 className="font-medium mb-2 text-blue-900">Arabe</h5>
                          {renderFormattedText(company.titre_ar, company.id_entite, 'ar', 'Description AR')}
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h5 className="font-medium mb-2 text-blue-900">Anglais</h5>
                          {renderFormattedText(company.titre_en, company.id_entite, 'en', 'Description EN')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECTION 3 : Sites */}
                  <div className="pt-4 border-t border-gray-200">
                    <div 
                      className="flex items-center justify-between cursor-pointer bg-white p-4 rounded-lg shadow-sm border border-gray-300 hover:border-blue-400 transition-colors"
                      onClick={() => setSitesExpanded(prev => !prev)}
                    >
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg text-gray-800">Sites de</h3>
                          <span className="font-semibold text-gray-700">
        {company.raison_socialle}
      </span>
                        <span className="text-sm text-gray-500">({sitesMap[company.id_entite]?.length || 0})</span>
                      </div>
                      {sitesExpanded ? (
                        <ChevronUpIcon className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                      )}
                    </div>

                    {sitesExpanded && (
                      <div className="mt-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                        {sitesMap[company.id_entite] ? (
                          sitesMap[company.id_entite].length > 0 ? (
                            <div className="divide-y divide-gray-100">
                              {sitesMap[company.id_entite].map(site => (
                                <div 
                                  key={site.id_site}
                                  className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-start"
                                >
                                  <div>
                                    <p className="font-medium text-gray-900">{site.nom_site}</p>
                                    {site.principal === 1 && (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 mt-1">
                                        Principal
                                      </span>
                                    )}
                                    <p className="mt-1 text-sm text-gray-600">{site.adresse || '—'}</p>
                                    <p className="mt-1 text-sm text-gray-500">{site.localite || '—'} {site.code_postal || ''} • {site.region || '—'}</p>
                                    {site.gln && <p className="mt-1 text-xs text-gray-500">GLN : {site.gln}</p>}
                                  </div>

                                  {canWrite && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSitesManagement(company);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                    >
                                      Modifier
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center text-gray-500">
                              Aucun site enregistré pour cette entité
                            </div>
                          )
                        ) : (
                          <div className="p-8 flex justify-center">
                            <div className="loader h-8 w-8" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      ))}
    </tbody>
  </table>
</div>


        {/* ─── BASIC CREATE MODAL ──────────────────────────────────────── */}
        {isBasicModalOpen && basicEditingCompany && (
          <Draggable handle=".drag-handle">
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-2xl max-h-[90vh] overflow-y-auto scroll-smooth" ref={modalRef}>
                <div className="drag-handle bg-blue-950 text-white p-4 flex justify-between items-center cursor-move">
                  <h2 className="text-lg font-semibold">Nouvelle entité — informations de base</h2>
                  <button onClick={() => setIsBasicModalOpen(false)}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6 grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Raison sociale *</label>
                    <input
                      type="text"
                      value={basicEditingCompany.raison_socialle || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, raison_socialle: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant national *</label>
                    <input
                      type="text"
                      value={basicEditingCompany.identifiant_national || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, identifiant_national: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personne de contact *</label>
                    <input
                      type="text"
                      value={basicEditingCompany.personne_contact || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, personne_contact: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={basicEditingCompany.email || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, email: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                    <input
                      type="text"
                      value={basicEditingCompany.telephone || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, telephone: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                    <input
                      type="text"
                      value={basicEditingCompany.tel_mobile || ''}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, tel_mobile: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type d'opérateur *</label>
                    <select
                      value={String(basicEditingCompany.type_prod || 0)}
                      onChange={e => setBasicEditingCompany(c => c ? { ...c, type_prod: Number(e.target.value) } : null)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="0">Sélectionner...</option>
                      {typeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Segments (max. 4)</label>
                    <div className="grid grid-cols-2 gap-3">
                      {segments.map(s => (
                        <label key={s.code} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={modalSegments.includes(s.code)}
                            onChange={() => {
                              setModalSegments(prev => {
                                if (prev.includes(s.code)) return prev.filter(c => c !== s.code);
                                if (prev.length >= 4) {
                                  debouncedAddNotification('Maximum 4 segments', 'error');
                                  return prev;
                                }
                                return [...prev, s.code];
                              });
                            }}
                            className="h-4 w-4 text-blue-600 rounded"
                          />
                          <span className="text-sm">{s.libelle}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-4">
                  <button
                    onClick={() => setIsBasicModalOpen(false)}
                    className="px-5 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveBasicCompany}
                    className="px-5 py-2 bg-blue-950 text-white rounded hover:bg-blue-800"
                  >
                    Enregistrer & compléter
                  </button>
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── FULL EDIT / CREATE MODAL ───────────────────────────────── */}
        {isModalOpen && editingCompany && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-6xl max-h-[92vh] overflow-y-auto scroll-smooth" ref={modalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-xl">
                  <h2 className="text-xl font-semibold">
                    {editingCompany.id_entite === 0 ? 'Créer entité' : 'Modifier entité'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)}>
                    <XMarkIcon className="h-7 w-7" />
                  </button>
                </div>

                <div className="p-6 grid grid-cols-2 gap-6">
                  {/* Logo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                    {previewLogo ? (
                      <div className="relative inline-block">
                        <img
                          src={previewLogo}
                          alt="Logo"
                          className="h-20 w-20 object-contain rounded border"
                          onClick={() => openLogoModal(previewLogo)}
                          onError={handleLogoError}
                        />
                        <button
                          onClick={handleLogoDelete}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    )}
                  </div>

                  {/* Raison sociale */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Raison sociale *</label>
                    <input
                      type="text"
                      value={editingCompany.raison_socialle}
                      onChange={e => setEditingCompany(c => c ? { ...c, raison_socialle: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Identifiant national */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant national *</label>
                    <input
                      type="text"
                      value={editingCompany.identifiant_national || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, identifiant_national: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Personne de contact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personne de contact *</label>
                    <input
                      type="text"
                      value={editingCompany.personne_contact || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, personne_contact: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Type opérateur */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type d'opérateur *</label>
                    <select
                      value={String(editingCompany.type_prod)}
                      onChange={e => setEditingCompany(c => c ? { ...c, type_prod: Number(e.target.value) } : null)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="0">Sélectionner...</option>
                      {typeOptions.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Statut */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
                    <select
                      value={editingCompany.status_ent || 'E'}
                      onChange={e => setEditingCompany(c => c ? { ...c, status_ent: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="E">En attente</option>
                      <option value="A">Actif</option>
                      <option value="I">Inactif</option>
                    </select>
                  </div>

                  {/* Identifiant REX */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant REX</label>
                    <input
                      type="text"
                      value={editingCompany.identifiant_rex || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, identifiant_rex: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Dates REX */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date enregistrement REX</label>
                    <input
                      type="date"
                      value={editingCompany.date_enregistrement_rex || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, date_enregistrement_rex: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Début validité REX</label>
                    <input
                      type="date"
                      value={editingCompany.debut_validite_rex || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, debut_validite_rex: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fin validité REX</label>
                    <input
                      type="date"
                      value={editingCompany.fin_validite_rex || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, fin_validite_rex: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Date création (read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de création</label>
                    <input
                      type="date"
                      value={editingCompany.date_create || new Date().toISOString().split('T')[0]}
                      readOnly
                      className="w-full border rounded px-3 py-2 bg-gray-100"
                    />
                  </div>

                  {/* Pays */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pays</label>
                    <select
                      value={editingCompany.pays || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, pays: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Sélectionner...</option>
                      {paysList.map(p => (
                        <option key={p.isoNumeric} value={p.isoNumeric}>{p.libelle}</option>
                      ))}
                    </select>
                  </div>

                  {/* Site / Service / Email / Phones / Fax */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Site web</label>
                    <input
                      type="text"
                      value={editingCompany.site || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, site: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                    <input
                      type="text"
                      value={editingCompany.service || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, service: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editingCompany.email || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, email: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone mobile</label>
                    <input
                      type="tel"
                      value={editingCompany.tel_mobile || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, tel_mobile: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone fixe</label>
                    <input
                      type="tel"
                      value={editingCompany.telephone || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, telephone: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fax</label>
                    <input
                      type="text"
                      value={editingCompany.fax || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, fax: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* ─── LOCATION CASCADE ─────────────────────────────────────── */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
                    <select
                      value={editingCompany.region || ''}
                      onChange={async (e) => {
                        const region = e.target.value;
                        setEditingCompany(prev => prev ? {
                          ...prev,
                          region,
                          delegation: '',
                          localite: '',
                          postalCode: ''
                        } : null);
                        await fetchModalDelegations(region);
                      }}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">— Sélectionner —</option>
                      {modalRegions.map(r => (
                        <option key={r.region} value={r.region}>
                          {r.region}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Délégation</label>
                    <select
                      value={editingCompany.delegation || ''}
                      onChange={async (e) => {
                        const delegation = e.target.value;
                        setEditingCompany(prev => prev ? {
                          ...prev,
                          delegation,
                          localite: '',
                          postalCode: ''
                        } : null);
                        await fetchModalLocalites(delegation);
                      }}
                      disabled={!editingCompany?.region}
                      className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">— Sélectionner —</option>
                      {modalDelegations.map(d => (
                        <option key={d.delegation} value={d.delegation}>
                          {d.delegation}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Localité</label>
                    <select
                      value={editingCompany.localite || ''}
                      onChange={(e) => {
                        const localite = e.target.value;
                        const match = modalLocalites.find(l => l.localite === localite);
                        setEditingCompany(prev => prev ? {
                          ...prev,
                          localite,
                          postalCode: match?.code_postal || ''
                        } : null);
                      }}
                      disabled={!editingCompany?.delegation}
                      className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">— Sélectionner —</option>
                      {modalLocalites.map(l => (
                        <option key={l.localite} value={l.localite}>
                          {l.localite}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
                    <input
                      type="text"
                      value={editingCompany.postalCode || ''}
                      readOnly
                      className="w-full border rounded px-3 py-2 bg-gray-100 cursor-not-allowed"
                    />
                  </div>

                  {/* Adresse */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresse complète</label>
                    <input
                      type="text"
                      value={editingCompany.adresse || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, adresse: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Dates abonnement / échéance */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date d'abonnement</label>
                    <input
                      type="date"
                      value={editingCompany.date_abonnement || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, date_abonnement: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date d'échéance</label>
                    <input
                      type="date"
                      value={editingCompany.date_echeance || ''}
                      onChange={e => setEditingCompany(c => c ? { ...c, date_echeance: e.target.value } : null)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  {/* Segments */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Segments d'activité (max 4)</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {segments.map(s => (
                        <label key={s.code} className="flex items-center gap-2  p-2 rounded border">
                          <input
                            type="checkbox"
                            checked={modalSegments.includes(s.code)}
                            onChange={() => {
                              setModalSegments(prev => {
                                if (prev.includes(s.code)) return prev.filter(c => c !== s.code);
                                if (prev.length >= 4) {
                                  debouncedAddNotification('4 segments maximum', 'error');
                                  return prev;
                                }
                                return [...prev, s.code];
                              });
                            }}
                            className="h-4 w-4 text-blue-600 rounded"
                          />
                          <span className="text-sm">{s.libelle}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-4">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveCompany}
                    className="px-6 py-2.5 bg-blue-950 text-white rounded-lg hover:bg-blue-800"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── IMPORT MODAL ────────────────────────────────────────────── */}
        {isImportModalOpen && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-lg p-6" ref={importModalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-lg">
                  <h2 className="text-lg font-semibold">Importer plusieurs entités</h2>
                  <button onClick={() => setIsImportModalOpen(false)}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-6">
                  <button
                    onClick={downloadTemplate}
                    className="w-full py-3 bg-blue-950 text-white rounded-lg hover:bg-blue-800 mb-6"
                  >
                    Télécharger le modèle Excel
                  </button>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="import-file"
                    />
                    <label
                      htmlFor="import-file"
                      className="cursor-pointer block"
                    >
                      <div className="text-gray-600 mb-2">Cliquez ici ou glissez-déposez</div>
                      <div className="text-sm text-gray-500">Fichier .xlsx ou .xls</div>
                    </label>
                  </div>

                  {isLoading && (
                    <div className="flex justify-center mt-6">
                      <div className="loader"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── LOGO ZOOM MODAL ─────────────────────────────────────────── */}
        {isLogoModalOpen && selectedLogo && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" ref={logoModalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-lg">
                  <h2 className="text-lg font-semibold">Logo de l'entité</h2>
                  <button onClick={() => setIsLogoModalOpen(false)}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="p-6">
                  <img src={selectedLogo} alt="Logo agrandi" className="max-w-full h-auto mx-auto" />
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── LANGUAGE SELECTION MODAL ────────────────────────────────── */}
        {isSelectLangModalOpen && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-md p-6" ref={selectLangModalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-lg">
                  <h2 className="text-lg font-semibold">Choisir la langue</h2>
                  <button onClick={() => setIsSelectLangModalOpen(false)}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="py-8 px-6 flex flex-col gap-4">
                  <button
                    onClick={() => openEditTitleModal('fr')}
                    className="py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-900 font-medium"
                  >
                    Français
                  </button>
                  <button
                    onClick={() => openEditTitleModal('ar')}
                    className="py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-900 font-medium"
                  >
                    Arabe
                  </button>
                  <button
                    onClick={() => openEditTitleModal('en')}
                    className="py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-900 font-medium"
                  >
                    Anglais
                  </button>
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── TITLE EDITOR (ReactQuill) ───────────────────────────────── */}
        {isEditTitleModalOpen && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" ref={editTitleModalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move">
                  <h2 className="text-lg font-semibold">
                    Édition — {selectedLang === 'fr' ? 'Français' : selectedLang === 'ar' ? 'Arabe' : 'Anglais'}
                  </h2>
                  <button onClick={() => setIsEditTitleModalOpen(false)}>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="flex-1 p-6">
                  <ReactQuill
                    theme="snow"
                    value={editTitle}
                    onChange={setEditTitle}
                    modules={quillModules}
                    className="h-[420px] bg-white"
                  />
                </div>

                <div className="p-6 border-t flex justify-end gap-4">
                  <button
                    onClick={() => setIsEditTitleModalOpen(false)}
                    className="px-6 py-2.5 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleTitleUpdate}
                    className="px-6 py-2.5 bg-blue-950 text-white rounded-lg hover:bg-blue-800"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* ─── TEXT PREVIEW MODAL ──────────────────────────────────────── */}
        {isTextModalOpen && (
          <Draggable handle=".modal-handle">
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-y-auto scroll-smooth" ref={textModalRef}>
                <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-xl">
                  <h2 className="text-xl font-semibold">{selectedTextTitle}</h2>
                  <button onClick={() => setIsTextModalOpen(false)}>
                    <XMarkIcon className="h-7 w-7" />
                  </button>
                </div>
                <div className="p-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: selectedText || '<p>Aucun contenu</p>' }} />
              </div>
            </div>
          </Draggable>
        )}

       {/* ─── SITES MANAGEMENT MODAL ─────────────────────────────────── */}
{isSitesManagementModalOpen && selectedCompany && (
  <Draggable handle=".modal-handle">
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto scroll-smooth"
        ref={sitesManagementModalRef}
      >
        {/* Header */}
        <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-xl">
          <div>
            <h2 className="text-xl font-semibold">
              Gestion des sites
            </h2>
            <p className="text-sm text-blue-100 mt-0.5">
              Pour l'entité : <span className="font-medium">{selectedCompany.raison_socialle}</span>
            </p>
          </div>

          <button onClick={() => setIsSitesManagementModalOpen(false)}>
            <XMarkIcon className="h-7 w-7" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <button
            onClick={() => openSiteModal()}
            className="mb-6 px-5 py-2.5 bg-blue-950 text-white rounded-lg hover:bg-blue-800 transition"
          >
            + Ajouter un site
          </button>

          {editingSites.length === 0 ? (
            <p className="text-gray-500 text-center py-10">
              Aucun site enregistré pour cette entité
            </p>
          ) : (
            <div className="space-y-4">
              {editingSites.map(site => (
                <div
                  key={site.id_site}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-lg flex items-center gap-3">
                        {site.nom_site}
                        {site.principal === 1 && (
                          <span className="inline-block px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                            Principal
                          </span>
                        )}
                      </h4>

                      <p className="text-sm text-gray-600 mt-1">
                        {site.adresse || '—'} • {site.localite || '—'} {site.code_postal || ''}
                      </p>

                      {site.gln && (
                        <p className="text-sm text-gray-500 mt-1">
                          GLN : {site.gln}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => openSiteModal(site)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Modifier
                      </button>

                      <button
                        onClick={() => handleDeleteSite(site.id_site)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Supprimer
                      </button>

                      {site.principal !== 1 && (
                        <button
                          onClick={() => handleSetPrimarySite(site.id_site)}
                          className="text-green-600 hover:text-green-800 font-medium"
                        >
                          Définir principal
                        </button>
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


      {/* ─── SINGLE SITE ADD/EDIT MODAL ──────────────────────────────── */}
{isSiteModalOpen && editingSite && (
  <Draggable handle=".modal-handle">
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-3xl max-h-[90vh] overflow-y-auto scroll-smooth"
        ref={modalRef}
      >
        {/* Header */}
        <div className="modal-handle bg-blue-950 text-white px-6 py-4 flex justify-between items-center cursor-move rounded-t-xl">
          <div>
            <h2 className="text-xl font-semibold">
              {editingSite.id_site === 0 ? 'Nouveau site' : 'Modifier site'}
            </h2>
            <p className="text-sm text-blue-100 mt-0.5">
              Pour l'entité : <span className="font-medium">{selectedCompany?.raison_socialle}</span>
            </p>
          </div>

          <button onClick={() => setIsSiteModalOpen(false)}>
            <XMarkIcon className="h-7 w-7" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 grid grid-cols-2 gap-6">

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du site *
            </label>
            <input
              type="text"
              value={editingSite.nom_site || ''}
              onChange={e =>
                setEditingSite(s => s ? { ...s, nom_site: e.target.value } : null)
              }
              className="w-full border rounded px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GLN</label>
            <input
              type="text"
              value={editingSite.gln || ''}
              onChange={e =>
                setEditingSite(s => s ? { ...s, gln: e.target.value } : null)
              }
              className="w-full border rounded px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input
              type="text"
              value={editingSite.adresse || ''}
              onChange={e =>
                setEditingSite(s => s ? { ...s, adresse: e.target.value } : null)
              }
              className="w-full border rounded px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Région */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
            <select
              value={editingSite.region || ''}
              onChange={(e) => {
                const newRegion = e.target.value || null;
                setEditingSite(prev => prev ? {
                  ...prev,
                  region: newRegion,
                  delegation: null,
                  localite: null,
                  code_postal: null
                } : null);

                if (newRegion) {
                  fetchModalDelegations(newRegion);
                } else {
                  setModalDelegations([]);
                  setModalLocalites([]);
                }
              }}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Sélectionner une région</option>
              {modalRegions.map(r => (
                <option key={r.region} value={r.region}>
                  {r.region}
                </option>
              ))}
            </select>
          </div>

          {/* Délégation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Délégation</label>
            <select
              value={editingSite.delegation || ''}
              onChange={(e) => {
                const newDelegation = e.target.value || null;
                setEditingSite(prev => prev ? {
                  ...prev,
                  delegation: newDelegation,
                  localite: null,
                  code_postal: null
                } : null);

                if (newDelegation) {
                  fetchModalLocalites(newDelegation);
                } else {
                  setModalLocalites([]);
                }
              }}
              disabled={!editingSite?.region}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Sélectionner une délégation</option>
              {modalDelegations.map(d => (
                <option key={d.delegation} value={d.delegation}>
                  {d.delegation}
                </option>
              ))}
            </select>
          </div>

          {/* Localité */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Localité</label>
            <select
              value={editingSite.localite || ''}
              onChange={(e) => {
                const selectedLocalite = e.target.value || null;
                const found = modalLocalites.find(l => l.localite === selectedLocalite);

                setEditingSite(prev => prev ? {
                  ...prev,
                  localite: selectedLocalite,
                  code_postal: found ? found.code_postal : null
                } : null);
              }}
              disabled={!editingSite?.delegation}
              className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Sélectionner une localité</option>
              {modalLocalites.map(l => (
                <option key={l.localite} value={l.localite}>
                  {l.localite}
                </option>
              ))}
            </select>
          </div>

          {/* Code postal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
            <input
              type="text"
              value={editingSite.code_postal || ''}
              readOnly
              className="w-full p-2 border border-gray-300 rounded-md text-sm bg-gray-100 cursor-not-allowed"
            />
          </div>

          {/* Principal */}
          <div className="col-span-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={editingSite.principal === 1}
                onChange={e =>
                  setEditingSite(s => s ? { ...s, principal: e.target.checked ? 1 : 0 } : null)
                }
                className="h-5 w-5 text-blue-600 rounded"
              />
              <span className="text-gray-700 font-medium">Site principal</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-4">
          <button
            onClick={() => setIsSiteModalOpen(false)}
            className="px-6 py-2.5 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>

          <button
            onClick={handleSaveSite}
            className="px-6 py-2.5 bg-blue-950 text-white rounded-lg hover:bg-blue-800"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  </Draggable>
)}

        <style>{`
  .logo-img { width: 36px; height: 36px; object-fit: contain; border-radius: 4px; cursor: pointer; }
  .ql-container { font-size: 0.875rem; }
  .ql-editor { min-height: 150px; }
  .action-dropdown { position: fixed !important; z-index: 9999 !important; }
  .loader { ... } /* garde ton loader */

  table {
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.5rem 0.75rem;           /* moins de padding → gain de place */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;                /* empêche le retour à la ligne */
  }

  td {
    max-width: 0;                       /* force le respect des largeurs */
  }

  /* Optionnel : permet un peu de scroll si vraiment trop petit, mais fluide */
  .overflow-x-auto {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`}</style>
      </div>
      
    </div>
    
  );
};

export default Entite;