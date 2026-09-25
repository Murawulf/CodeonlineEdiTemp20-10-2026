import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, EnvelopeIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
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
  import_burkina_faso?: number;
  import_cote_ivoire?: number;
  import_gambie?: number;
  import_guinee?: number;
  import_libye?: number;
  import_mali?: number;
  import_senegal?: number;
};

// ── Destinations: same 7 countries, but split by flow (export / import) ──
// just like the "flux" filter on the enquête screen — pick export, import,
// or both, then tick whichever countries matter.
type FlowType = 'export' | 'import';

type BaseDestKey =
  | 'burkina_faso'
  | 'cote_ivoire'
  | 'gambie'
  | 'guinee'
  | 'libye'
  | 'mali'
  | 'senegal';

type DestinationKey = `${FlowType}_${BaseDestKey}`;

const FLOW_TYPES: { key: FlowType; label: string }[] = [
  { key: 'export', label: 'Export' },
  { key: 'import', label: 'Import' },
];

const BASE_DESTINATIONS: { key: BaseDestKey; label: string }[] = [
  { key: 'burkina_faso', label: 'Burkina Faso' },
  { key: 'cote_ivoire', label: "Côte d'Ivoire" },
  { key: 'gambie', label: 'Gambie' },
  { key: 'guinee', label: 'Guinée' },
  { key: 'libye', label: 'Libye' },
  { key: 'mali', label: 'Mali' },
  { key: 'senegal', label: 'Sénégal' },
];

const destField = (flow: FlowType, base: BaseDestKey): DestinationKey => `${flow}_${base}`;

// Every (flow × country) combination the company actually has flagged, in
// display order — used for both the compact row badges and the full list.
const getCompanyDestinations = (company: Company, flows: FlowType[] = ['export', 'import']) =>
  flows.flatMap(flow =>
    BASE_DESTINATIONS
      .filter(d => Number(company[destField(flow, d.key)]) === 1)
      .map(d => ({ flow, base: d.key, label: d.label, field: destField(flow, d.key) }))
  );

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

// ════════════════════════════════════════════════════════════════════════════
// ENVOI MAIL (Outlook) — every entité gets its OWN Outlook message, opened on
// the user's PC via a mailto: link: To = that entité only, subject + body already
// filled in and personalised with its raison sociale. The user just clicks
// "Envoyer" in Outlook. No server / SMTP involved.
// ════════════════════════════════════════════════════════════════════════════
type MailRecipient = {
  id_entite: number;
  raison_socialle: string;
  personne_contact: string;
  emails: string[];
  sci: boolean;
};

const EMAIL_RE = /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-zA-Z]{2,}$/;

// An Entite.email cell can hold several addresses ("a@x.tn; b@x.tn", "a@x.tn / b@x.tn").
// All of them belong to the SAME entité, so they all go in that entité's own To:.
const parseEmails = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  const seen = new Set<string>();
  return String(raw)
    .split(/[;,\s/|]+/)
    .map(e => e.trim().replace(/^mailto:/i, '').replace(/^[<(]+|[>).]+$/g, ''))
    .filter(e => EMAIL_RE.test(e))
    .filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

const escapeHtml = (v: string) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const htmlHasText = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

// Quill writes alignment / indentation as CSS classes; email clients need inline styles.
const inlineQuillClasses = (html: string) =>
  html
    .replace(/class="ql-align-(center|right|justify)"/g, (_m, a) => `style="text-align:${a}"`)
    .replace(/class="ql-indent-(\d+)"/g, (_m, n) => `style="padding-left:${Number(n) * 3}em"`)
    .replace(/class="ql-size-small"/g, 'style="font-size:0.75em"')
    .replace(/class="ql-size-large"/g, 'style="font-size:1.5em"')
    .replace(/class="ql-size-huge"/g, 'style="font-size:2.5em"');

const renderMailTemplate = (
  bodyHtml: string,
  r: { raison_socialle: string; personne_contact?: string },
  link: string,
) => {
  const linkHtml = link
    ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="display:inline-block;margin:12px 0;background:#172554;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:bold">Répondre au questionnaire</a>`
    : '';
  return inlineQuillClasses(bodyHtml)
    .replace(/\{raison_sociale\}/g, escapeHtml((r.raison_socialle || '').trim()))
    .replace(/\{personne_contact\}/g, escapeHtml((r.personne_contact || '').trim()))
    .replace(/\{lien_questionnaire\}/g, linkHtml)
    .replace(/<p>\s*<\/p>/g, ''); // e.g. the questionnaire line when no link is set
};

const renderMailSubject = (subject: string, r: { raison_socialle: string; personne_contact?: string }) =>
  subject
    .replace(/\{raison_sociale\}/g, (r.raison_socialle || '').trim())
    .replace(/\{personne_contact\}/g, (r.personne_contact || '').trim());

const DEFAULT_MAIL_SUBJECT =
  "Enquête CEPEX — Transport de vos marchandises vers l'Afrique subsaharienne";

// Content of "Projet mailing - Enquête de transport sur l'Afrique (revue).docx".
// {raison_sociale} is replaced by each entité's own raison sociale at send time.
const DEFAULT_MAIL_BODY = [
  '<p><strong>A l’attention de M. Le Directeur Général de la Société {raison_sociale},</strong></p>',
  '<p><br></p>',
  '<p>Dans le cadre des efforts entrepris par le CEPEX, notamment les actions visant à mieux accompagner les entreprises tunisiennes exportatrices en vue de consolider le positionnement de nos exportations sur le marché de l’Afrique subsaharienne, d’un côté, et de renforcer la compétitivité de nos produits, biens et services, sur ce marché en améliorant leur accessibilités et pénétrations sur le continent, une étude est lancée par nos services afin de recueillir votre retour d’expérience concernant les conditions et les contraintes liées au transport de vos marchandises.</p>',
  '<p><br></p>',
  '<p>À cet effet, nous vous invitons à répondre à un questionnaire portant notamment sur :</p>',
  '<ul>',
  '<li>Vos besoins en matière de transport maritime et aérien vers l’Afrique subsaharienne ;</li>',
  '<li>Les difficultés et contraintes que vous rencontrez dans l’acheminement de vos marchandises ;</li>',
  '<li>Les coûts, délais et fréquences des liaisons disponibles ;</li>',
  '<li>Les difficultés liées aux formalités, à la logistique, au transit ou à la livraison ;</li>',
  '<li>Vos attentes et suggestions pour améliorer les solutions de transport et faciliter vos opérations d’exportation.</li>',
  '</ul>',
  '<p>{lien_questionnaire}</p>',
  '<p>Votre contribution est essentielle pour nous permettre d’identifier les principaux obstacles rencontrés par les exportateurs tunisiens et de dégager des pistes d’amélioration adaptées à leurs besoins, et ce, à travers des solutions totalement digitalisées.</p>',
  '<p><br></p>',
  '<p>Nous vous remercions par avance de bien vouloir consacrer quelques minutes à ce questionnaire et de nous faire part, de votre expérience et de vos attentes et ce <strong><u>avant le 30 Septembre 2026</u></strong>.</p>',
  '<p><br></p>',
  '<p>Nous vous remercions pour votre précieuse collaboration et restons à votre disposition pour toute information complémentaire.</p>',
  '<p><br></p>',
  '<p><strong>Cordialement,</strong></p>',
].join('');

const MAIL_PREF_PREFIX = 'entite.mailing.';
const loadMailPref = (key: string, fallback: string): string => {
  try {
    const v = localStorage.getItem(MAIL_PREF_PREFIX + key);
    return v !== null ? v : fallback;
  } catch { return fallback; }
};
const saveMailPref = (key: string, value: string) => {
  try { localStorage.setItem(MAIL_PREF_PREFIX + key, value); } catch { /* storage unavailable — ignore */ }
};

const mailQuillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
};

// Plain-text version of the (personalised) HTML body — what goes into the
// mailto: body, since mailto can only carry plain text.
const htmlToPlainText = (html: string) =>
  html
    .replace(/\r?\n/g, '')
    .replace(/<p[^>]*>\s*<br\s*\/?>\s*<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '   • ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Personalised body, as plain text. The questionnaire link is written out as a
// URL (Outlook turns it into a clickable link automatically).
const renderMailText = (bodyHtml: string, r: { raison_socialle: string; personne_contact?: string }, link: string) =>
  htmlToPlainText(
    bodyHtml
      .replace(/\{raison_sociale\}/g, escapeHtml((r.raison_socialle || '').trim()))
      .replace(/\{personne_contact\}/g, escapeHtml((r.personne_contact || '').trim()))
      .replace(/<p>\s*\{lien_questionnaire\}\s*<\/p>/g, link ? `<p>Lien du questionnaire : ${escapeHtml(link)}</p>` : '')
      .replace(/\{lien_questionnaire\}/g, link ? escapeHtml(link) : '')
  );

// mailto: for ONE entité. Several addresses of the same entité are separated
// with ";" (what Outlook expects). Line breaks must be CRLF.
const buildMailto = (emails: string[], subject: string, textBody: string) =>
  `mailto:${emails.join(';')}` +
  `?subject=${encodeURIComponent(subject)}` +
  `&body=${encodeURIComponent(textBody.replace(/\n/g, '\r\n'))}`;

// Put the FORMATTED message (bold, underline, bullets) on the clipboard, so a
// Ctrl+V in Outlook gives the exact Word layout. Rich clipboard API first,
// then the old execCommand fallback (works on plain http too).
const copyRichToClipboard = async (html: string, text: string): Promise<boolean> => {
  try {
    const CI = (window as any).ClipboardItem;
    if (navigator.clipboard && CI && window.isSecureContext) {
      await navigator.clipboard.write([
        new CI({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    el.innerHTML = html;
    el.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;white-space:normal';
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges();
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
};

// Opens the user's default mail app (Outlook) with the prepared message.
const openMailto = (url: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Remembers which entités were already opened in Outlook (per browser), so the
// user can close the window and resume later without emailing anyone twice.
const MAIL_OPENED_KEY = 'entite.mailing.opened';
const loadOpenedIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(MAIL_OPENED_KEY);
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<number>(); }
};
const saveOpenedIds = (ids: Set<number>) => {
  try { localStorage.setItem(MAIL_OPENED_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
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
  // Empty array = "no restriction on this axis" (mirrors every other
  // multi-select filter here). searchFlowTypes empty = export AND import
  // both considered; searchDestinations empty = all 7 countries considered.
  const [searchFlowTypes, setSearchFlowTypes] = useState<FlowType[]>([]);
  const [searchDestinations, setSearchDestinations] = useState<BaseDestKey[]>([]);
  const [searchType, setSearchType] = useState('');
  const [searchText, setSearchText] = useState('');
  // SCI filter: '' = tous, 'oui' = SCI only, 'non' = non-SCI only.
  const [searchSci, setSearchSci] = useState<'' | 'oui' | 'non'>('');

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

  // Sequence guard: region/délégation/type are filtered server-side, so switching
  // them quickly fires several requests. Only the LATEST response is allowed to
  // land — otherwise a slow, older response could overwrite the list with rows
  // that don't match the filters currently shown (and then get exported).
  const fetchSeqRef = useRef(0);
  const fetchCompanies = async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const response = await api.get(`/api/companies`, {
        withCredentials: true,
        params: { region: searchRegion, delegation: searchDelegation, type: searchType },
      });
      if (seq !== fetchSeqRef.current) return; // a newer request superseded this one
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

    // Flux (export/import) × Destination, both multi-select. Empty selection
    // on either axis means "no restriction on that axis" — e.g. ticking only
    // "Import" + "Libye" matches a company that imports FROM Libye, ticking
    // both Export and Import + "Libye" matches either direction.
    const effectiveFlows: FlowType[] = searchFlowTypes.length ? searchFlowTypes : ['export', 'import'];
    const effectiveDests: BaseDestKey[] = searchDestinations.length ? searchDestinations : BASE_DESTINATIONS.map(d => d.key);
    const matchesDestination =
      (searchFlowTypes.length === 0 && searchDestinations.length === 0) ||
      effectiveFlows.some(flow => effectiveDests.some(base => Number(company[destField(flow, base)]) === 1));

    const isSciCompany = Number(company.sci) === 1;
    const matchesSci =
      searchSci === '' ||
      (searchSci === 'oui' && isSciCompany) ||
      (searchSci === 'non' && !isSciCompany);

    return matchesText && matchesSegment && matchesDestination && matchesSci;
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

  const toggleFlowType = (key: FlowType) => {
    setSearchFlowTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setCurrentPage(1);
  };

  const toggleDestinationValue = (key: BaseDestKey) => {
    setSearchDestinations(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setCurrentPage(1);
  };

  const toggleAllDestinations = () => {
    setSearchDestinations(prev =>
      prev.length === BASE_DESTINATIONS.length ? [] : BASE_DESTINATIONS.map(d => d.key)
    );
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

  // The selection is ALWAYS read through the current filters. Whatever was
  // ticked earlier but is now hidden by a filter never leaks into an export or
  // a mailing — this was the "I filter, select all, and get every entité" bug.
  const selectedInView = filteredCompanies.filter(c => selectedIds.has(c.id_entite));

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

  // "Tout sélectionner" = every entité matching the CURRENT filters (all pages), nothing else.
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredCompanies.map(c => c.id_entite)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Changing any structural filter starts a fresh selection, so the counter
  // always describes exactly what is on screen. (Typing in the search box
  // doesn't reset it — the selection is still intersected with it above.)
  const structuralFilterKey = JSON.stringify([searchSegments, searchFlowTypes, searchDestinations, searchSci, searchRegion, searchDelegation, searchType]);
  useEffect(() => {
    setSelectedIds(new Set());
  }, [structuralFilterKey]);

  // What the export / mailing buttons act on:
  //   • some rows ticked  → exactly those (still limited to the current filters)
  //   • nothing ticked    → every entité matching the current filters
  const actionTargets = selectedInView.length > 0 ? selectedInView : filteredCompanies;
  const actionScope: 'selection' | 'filtre' = selectedInView.length > 0 ? 'selection' : 'filtre';

  const destinationsLabel = (company: Company, flow: FlowType) =>
    BASE_DESTINATIONS
      .filter(d => Number(company[destField(flow, d.key)]) === 1)
      .map(d => d.label)
      .join(', ');

  const typeLabel = (company: Company) =>
    typeOptions.find(t => t.value === String(company.type_prod))?.label || '';

  // Human-readable list of the filters currently applied (also used for the
  // chips above the table and the "Filtres" sheet of the Excel export).
  const getActiveFilters = (): { key: string; label: string; value: string; clear: () => void }[] => {
    const list: { key: string; label: string; value: string; clear: () => void }[] = [];
    if (searchType) {
      list.push({
        key: 'type', label: "Type d'opérateur",
        value: typeOptions.find(t => t.value === searchType)?.label || searchType,
        clear: () => { setSearchType(''); setCurrentPage(1); },
      });
    }
    if (searchSci) {
      list.push({
        key: 'sci', label: 'SCI', value: searchSci === 'oui' ? 'Oui' : 'Non',
        clear: () => { setSearchSci(''); setCurrentPage(1); },
      });
    }
    if (searchFlowTypes.length) {
      list.push({
        key: 'flux', label: 'Flux',
        value: searchFlowTypes.map(f => FLOW_TYPES.find(x => x.key === f)?.label || f).join(' + '),
        clear: () => { setSearchFlowTypes([]); setCurrentPage(1); },
      });
    }
    if (searchDestinations.length) {
      list.push({
        key: 'dest', label: 'Destination',
        value: searchDestinations.map(k => BASE_DESTINATIONS.find(d => d.key === k)?.label || k).join(', '),
        clear: () => { setSearchDestinations([]); setCurrentPage(1); },
      });
    }
    if (searchSegments.length) {
      list.push({
        key: 'seg', label: 'Segment',
        value: searchSegments.map(code => segments.find(s => s.code === code)?.libelle || code).join(', '),
        clear: () => { setSearchSegments([]); setCurrentPage(1); },
      });
    }
    if (searchRegion) {
      list.push({
        key: 'region', label: 'Région / Délégation',
        value: searchDelegation ? `${searchRegion} › ${searchDelegation}` : searchRegion,
        clear: clearRegionDelegation,
      });
    }
    if (searchText.trim()) {
      list.push({
        key: 'text', label: 'Recherche', value: `“${searchText.trim()}”`,
        clear: () => { setSearchText(''); setCurrentPage(1); },
      });
    }
    return list;
  };

  const resetAllFilters = () => {
    setSearchType('');
    setSearchSci('');
    setSearchFlowTypes([]);
    setSearchDestinations([]);
    setSearchSegments([]);
    setSearchText('');
    setSearchRegion('');
    setSearchDelegation('');
    setRegionDelExpanded('');
    setCurrentPage(1);
  };

  // Short, filesystem-safe suffix describing the filters, e.g. "SCI-oui_export_libye-mali".
  const filterFileSuffix = () => {
    const parts: string[] = [];
    if (searchSci) parts.push(`SCI-${searchSci}`);
    if (searchFlowTypes.length) parts.push(searchFlowTypes.join('-'));
    if (searchDestinations.length) parts.push(searchDestinations.map(k => k.replace(/_/g, '')).join('-'));
    if (searchRegion) parts.push(searchRegion);
    if (actionScope === 'selection') parts.push('selection');
    const slug = parts.join('_')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 80);
    return slug ? `_${slug}` : '';
  };

  const appendFiltersSheet = (wb: XLSX.WorkBook, count: number) => {
    const filters = getActiveFilters();
    const rows: (string | number)[][] = [
      ['Export des entités'],
      [],
      ['Date', new Date().toLocaleString('fr-FR')],
      ['Périmètre', actionScope === 'selection' ? 'Lignes sélectionnées (dans les filtres actifs)' : 'Toutes les entités correspondant aux filtres'],
      ["Nombre d'entités", count],
      [],
      ['Filtre', 'Valeur'],
      ...(filters.length ? filters.map(f => [f.label, f.value]) : [['—', 'Aucun filtre (toutes les entités)']]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Filtres');
  };

  // ── Export contacts (Excel) — exactly what the filters / selection show ──
  const handleExportContacts = () => {
    const targets = actionTargets;
    if (targets.length === 0) {
      window.alert('Aucune entité ne correspond aux filtres actuels — rien à exporter.');
      return;
    }

    const exportData = targets.map((company) => ({
      'Raison sociale': company.raison_socialle || '',
      'SCI': Number(company.sci) === 1 ? 'Oui' : 'Non',
      'Personne contact': company.personne_contact || '',
      'Email': company.email || '',
      'Mobile': company.tel_mobile || '',
      'Téléphone fixe': company.telephone || '',
      'Export vers': destinationsLabel(company, 'export'),
      'Import depuis': destinationsLabel(company, 'import'),
      "Type d'opérateur": typeLabel(company),
      'Identifiant national': company.identifiant_national || '',
      'Région': company.region || '',
      'Délégation': company.delegation || '',
      'Ville': company.city || '',
      'Adresse': company.adresse || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 36 }, { wch: 7 }, { wch: 24 }, { wch: 32 }, { wch: 16 },
      { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 34 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 34 },
    ];
    // Excel filter arrows on the header row, so the file can be re-filtered too.
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    appendFiltersSheet(wb, targets.length);
    XLSX.writeFile(wb, `contacts${filterFileSuffix()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setIsMainActionOpen(false);
    debouncedAddNotification(`${targets.length} contact(s) exporté(s)`, 'success');
  };

  // ── Full export (all columns) — same perimeter as above ──
  const handleExport = () => {
    const targets = actionTargets;
    if (targets.length === 0) {
      window.alert('Aucune entité ne correspond aux filtres actuels — rien à exporter.');
      return;
    }
    const exportData = targets.map((company) => {
      const segmentsData = company.segments?.slice(0, 4) || [];
      return {
        id_entite: company.id_entite,
        raison_socialle: company.raison_socialle,
        sci: Number(company.sci) === 1 ? 'Oui' : 'Non',
        personne_contact: company.personne_contact || '',
        email: company.email || '',
        tel_mobile: company.tel_mobile || '',
        telephone: company.telephone || '',
        export_vers: destinationsLabel(company, 'export'),
        import_depuis: destinationsLabel(company, 'import'),
        identifiant_rex: company.identifiant_rex || '',
        date_enregistrement_rex: company.date_enregistrement_rex || '',
        debut_validite_rex: company.debut_validite_rex || '',
        fin_validite_rex: company.fin_validite_rex || '',
        etat: company.etat || '',
        identifiant_national: company.identifiant_national || '',
        date_create: company.date_create || '',
        pays: paysList.find(p => p.isoNumeric === company.pays)?.libelle || company.pays || '',
        site: company.site || '',
        service: company.service || '',
        fax: company.fax || '',
        adresse: company.adresse || '',
        region: company.region || '',
        delegation: company.delegation || '',
        city: company.city || '',
        localite: company.localite || '',
        postalCode: company.postalCode || '',
        type_operateur: typeLabel(company),
        date_abonnement: company.date_abonnement || '',
        date_echeance: company.date_echeance || '',
        nb_fp: company.nb_fp,
        inscription: company.inscription,
        status_ent: company.status_ent,
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
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entites');
    appendFiltersSheet(wb, targets.length);
    XLSX.writeFile(wb, `entites_export${filterFileSuffix()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    addNotification('Exportation réussie', 'success');
    setIsMainActionOpen(false);
  };

  // ════════════════════════════════════════════════════════════════════════
  // ── ENVOI MAIL via Outlook — one personalised message per entité
  // ════════════════════════════════════════════════════════════════════════
  // Each click opens ONE new Outlook message (mailto:) addressed to ONE entité,
  // subject + body pre-filled and personalised with its raison sociale, so no
  // entité ever sees another. The user checks it and presses "Envoyer" in
  // Outlook, then clicks "Suivant" here. Browsers only allow one mail window
  // per click, hence the one-by-one flow (with progress remembered).
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [mailSubject, setMailSubject] = useState(() => loadMailPref('subject', DEFAULT_MAIL_SUBJECT));
  const [mailBody, setMailBody] = useState(() => loadMailPref('body', DEFAULT_MAIL_BODY));
  const [mailLink, setMailLink] = useState(() => loadMailPref('link', ''));
  const [mailRecipients, setMailRecipients] = useState<MailRecipient[]>([]);
  const [mailPreviewId, setMailPreviewId] = useState<number | null>(null);
  const [mailTab, setMailTab] = useState<'message' | 'envoi' | 'apercu'>('message');
  const [mailInfo, setMailInfo] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mailOpened, setMailOpened] = useState<Set<number>>(() => loadOpenedIds());
  const [mailLastOpenedId, setMailLastOpenedId] = useState<number | null>(null);
  const quillRef = useRef<ReactQuill | null>(null);

  // Remember the last template in this browser.
  useEffect(() => { saveMailPref('subject', mailSubject); }, [mailSubject]);
  useEffect(() => { saveMailPref('body', mailBody); }, [mailBody]);
  useEffect(() => { saveMailPref('link', mailLink); }, [mailLink]);
  useEffect(() => { saveOpenedIds(mailOpened); }, [mailOpened]);

  const openMailModal = () => {
    setIsMainActionOpen(false);
    const recipients: MailRecipient[] = actionTargets.map(c => ({
      id_entite: c.id_entite,
      raison_socialle: c.raison_socialle || '',
      personne_contact: c.personne_contact || '',
      emails: parseEmails(c.email),
      sci: Number(c.sci) === 1,
    }));
    if (recipients.length === 0) {
      window.alert('Aucune entité ne correspond aux filtres actuels.');
      return;
    }
    setMailRecipients(recipients);
    setMailPreviewId(recipients.find(r => r.emails.length > 0)?.id_entite ?? recipients[0].id_entite);
    setMailTab('message');
    setMailInfo(null);
    setMailLastOpenedId(null);
    setIsMailModalOpen(true);
  };

  const mailSendable = mailRecipients.filter(r => r.emails.length > 0);
  const mailWithoutEmail = mailRecipients.filter(r => r.emails.length === 0);
  const mailOpenedCount = mailSendable.filter(r => mailOpened.has(r.id_entite)).length;
  const mailNext = mailSendable.find(r => !mailOpened.has(r.id_entite)) || null;

  const insertMailToken = (token: string) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) { setMailBody(prev => prev + token); return; }
    const range = editor.getSelection(true);
    const index = range ? range.index : editor.getLength();
    editor.insertText(index, token, 'user');
    editor.setSelection(index + token.length, 0, 'user');
  };

  const validateMailForm = (): string | null => {
    if (!mailSubject.trim()) return "L'objet est obligatoire.";
    if (!htmlHasText(mailBody)) return 'Le message est vide.';
    if (mailLink.trim() && !/^https?:\/\//i.test(mailLink.trim())) return 'Le lien du questionnaire doit commencer par http:// ou https://';
    return null;
  };

  // Open ONE entité's message in Outlook.
  const openInOutlook = (r: MailRecipient) => {
    const err = validateMailForm();
    if (err) { setMailInfo({ type: 'error', text: err }); setMailTab('message'); return; }
    if (r.emails.length === 0) return;

    const link = mailLink.trim();
    const subject = renderMailSubject(mailSubject.trim(), r);
    const text = renderMailText(mailBody, r, link);
    const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${renderMailTemplate(mailBody, r, link)}</div>`;
    const url = buildMailto(r.emails, subject, text);

    // Formatted copy on the clipboard first (needs the page to still have focus),
    // then hand over to Outlook.
    let launched = false;
    const launch = () => { if (launched) return; launched = true; openMailto(url); };
    copyRichToClipboard(html, text).finally(launch);
    setTimeout(launch, 400);

    setMailOpened(prev => { const next = new Set(prev); next.add(r.id_entite); return next; });
    setMailLastOpenedId(r.id_entite);
    setMailPreviewId(r.id_entite);
    setMailInfo({
      type: 'success',
      text: `Message ouvert dans Outlook pour « ${r.raison_socialle} » (${r.emails.join(', ')}). Vérifiez puis cliquez sur Envoyer dans Outlook.`,
    });
  };

  const openNextInOutlook = () => {
    if (mailNext) openInOutlook(mailNext);
  };

  const resetMailProgress = () => {
    if (!window.confirm('Remettre à zéro le suivi (toutes les entités redeviennent « à envoyer ») ?')) return;
    setMailOpened(prev => {
      const next = new Set(prev);
      mailRecipients.forEach(r => next.delete(r.id_entite));
      return next;
    });
    setMailLastOpenedId(null);
    setMailInfo(null);
  };

  const mailPreviewRecipient = mailRecipients.find(r => r.id_entite === mailPreviewId) || mailRecipients[0];
  const mailPreviewHtml = mailPreviewRecipient
    ? renderMailTemplate(mailBody, mailPreviewRecipient, mailLink.trim())
    : '';

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

/* Filter bar — two tidy rows:
   row 1 (top)   : search (wide) ………………… Actions
   row 2 (bottom): every filter in an even, responsive grid (never cut off) */
.ent-filters {
  display: flex; flex-direction: column-reverse; gap: 14px;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
  background: var(--surface3);
}
.ent-filters-left {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 12px; align-items: end; min-width: 0;
}
.ent-filters-left .ent-filter-group { min-width: 0; }
.ent-filters-left .ent-filter-btn { width: 100%; min-width: 0 !important; }
.ent-filters-left .ent-seg-toggle { width: 100%; }
.ent-filters-left .ent-seg-toggle button { flex: 1; }
.ent-filters-right {
  display: flex; gap: 10px; align-items: flex-end; min-width: 0;
  padding-bottom: 14px; border-bottom: 1px dashed var(--border);
}
.ent-search-group { flex: 1 1 auto; max-width: 560px; min-width: 0; }
.ent-actions-group { margin-left: auto; }

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
  padding: 10px 24px; gap: 12px; flex-wrap: wrap;
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

/* ── SCI segmented toggle ── */
.ent-seg-toggle {
  display: inline-flex; height: 38px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px; padding: 3px; gap: 2px;
}
.ent-seg-toggle button {
  border: none; background: transparent; color: var(--text2);
  font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 0 12px;
  border-radius: 6px; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.ent-seg-toggle button:hover { color: var(--accent); }
.ent-seg-toggle button.active { background: var(--accent); color: var(--accent-text); font-weight: 600; }

/* ── Active filter chips ── */
.ent-active-filters {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 10px 24px; border-bottom: 1px solid var(--border); background: var(--surface);
}
.ent-active-filters-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin-right: 4px;
}
.ent-filter-chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 360px;
  padding: 3px 4px 3px 10px; border-radius: 999px; font-size: 12px;
  background: rgba(23,37,84,0.06); border: 1px solid rgba(23,37,84,0.18); color: var(--accent);
}
.ent-filter-chip-k { color: var(--muted); }
.ent-filter-chip-v { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-filter-chip button {
  border: none; background: transparent; color: var(--muted); cursor: pointer;
  width: 18px; height: 18px; border-radius: 50%; line-height: 16px; font-size: 14px;
}
.ent-filter-chip button:hover { background: rgba(23,37,84,0.12); color: var(--accent); }

.ent-link-btn {
  background: none; border: none; color: var(--accent); cursor: pointer;
  font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif; padding: 0;
}
.ent-link-btn.muted { color: var(--muted); font-weight: 500; }
.ent-link-btn:hover { text-decoration: underline; }

.ent-selection-pill {
  display: flex; align-items: center; gap: 10px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px;
}

/* ── Bulk actions (export / envoi mail) ── */
.ent-bulk-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ent-bulk-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
  border-radius: 8px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent);
  font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}
.ent-bulk-btn:hover:not(:disabled) { background: rgba(23,37,84,0.06); }
.ent-bulk-btn.primary { background: var(--accent); color: var(--accent-text); }
.ent-bulk-btn.primary:hover:not(:disabled) { opacity: 0.88; background: var(--accent); }
.ent-bulk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ent-bulk-count {
  display: inline-block; min-width: 20px; padding: 0 6px; border-radius: 999px;
  font-size: 11px; line-height: 18px; text-align: center;
  background: rgba(23,37,84,0.1); color: inherit;
}
.ent-bulk-btn.primary .ent-bulk-count { background: rgba(255,255,255,0.22); }
.ent-bulk-scope { font-size: 11px; color: var(--muted); }

/* ── Envoi mail modal ── */
.ent-mail-tabs { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.ent-mail-tabs button {
  border: none; background: none; padding: 12px 14px; font-size: 13px; cursor: pointer;
  color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px;
  font-family: 'DM Sans', sans-serif; display: inline-flex; align-items: center; gap: 6px;
}
.ent-mail-tabs button.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.ent-tab-warn { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: rgba(224,80,80,0.12); color: #c0392b; }
.ent-mail-banner { margin: 12px 24px 0; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
.ent-mail-banner.success { background: rgba(58,143,110,0.12); color: #2e7d5b; border: 1px solid rgba(58,143,110,0.3); }
.ent-mail-banner.error { background: rgba(224,80,80,0.1); color: #b83232; border: 1px solid rgba(224,80,80,0.3); }
.ent-token-btn {
  border: 1px dashed var(--accent); background: rgba(23,37,84,0.04); color: var(--accent);
  border-radius: 6px; font-size: 11px; padding: 3px 8px; cursor: pointer; font-family: 'DM Sans', sans-serif;
}
.ent-token-btn:hover { background: rgba(23,37,84,0.1); }
.ent-mail-editor .ql-editor { min-height: 300px; max-height: 44vh; overflow-y: auto; background: #fff; font-size: 14px; line-height: 1.5; }
.ent-mail-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; margin: 10px 0 12px; }
.ent-mail-stats .ok { color: #2e7d5b; font-weight: 600; }
.ent-mail-stats .ko { color: #b83232; font-weight: 600; }
.ent-mail-stats .skip { color: var(--muted); font-weight: 600; }
.ent-progress { height: 8px; background: var(--surface3); border-radius: 999px; overflow: hidden; }
.ent-progress > div { height: 100%; background: var(--accent); transition: width 0.4s ease; }
.ent-mail-list { border: 1px solid var(--border); border-radius: 8px; max-height: 42vh; overflow-y: auto; }
.ent-mail-row {
  display: grid; grid-template-columns: 16px minmax(0, 1.2fr) minmax(0, 1fr) auto; align-items: center; gap: 10px;
  padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px;
}
label.ent-mail-row { grid-template-columns: 16px minmax(0, 1.2fr) minmax(0, 1fr); }
.ent-mail-row:last-child { border-bottom: none; }
.ent-mail-row .name { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-mail-row .addr { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-mail-row .state { font-size: 11px; color: var(--muted); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ent-mail-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
.ent-mail-row.sent .ent-mail-dot { background: #3a8f6e; }
.ent-mail-row.sent .state { color: #2e7d5b; }
.ent-mail-row.failed .ent-mail-dot { background: #e05050; }
.ent-mail-row.failed .state, label.ent-mail-row.failed .addr { color: #b83232; }
.ent-mail-row.skipped { opacity: 0.55; }
.ent-sci-mini { margin-left: 6px; font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(212,163,42,0.15); color: #b8871a; font-weight: 700; }
.ent-mail-preview { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.ent-mail-preview-head { background: var(--surface2); padding: 12px 16px; font-size: 12px; color: var(--text2); display: grid; gap: 4px; border-bottom: 1px solid var(--border); }
.ent-mail-preview-head span { color: var(--muted); display: inline-block; min-width: 82px; }
.ent-mail-preview-head em { color: var(--muted); font-size: 11px; }
.ent-mail-preview-body {
  padding: 20px 24px; background: #fff; max-height: 52vh; overflow-y: auto;
  font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #222; text-align: justify;
}
.ent-mail-preview-body p { margin: 0; }
.ent-mail-preview-body ul { list-style: disc; padding-left: 2.2em; margin: 6px 0; }
.ent-mail-preview-body ol { list-style: decimal; padding-left: 2.2em; margin: 6px 0; }
.ent-mail-preview-body a { color: #172554; }
.ent-outlook-steps {
  display: grid; gap: 8px; padding: 14px 16px; border-radius: 10px;
  background: var(--surface2); border: 1px solid var(--border); font-size: 13px; color: var(--text2);
}
.ent-outlook-steps b {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; margin-right: 8px;
}
.ent-outlook-steps .tip { font-size: 12px; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 8px; }
.ent-outlook-steps kbd {
  font-family: inherit; font-size: 11px; padding: 0 5px; border: 1px solid var(--border);
  border-bottom-width: 2px; border-radius: 4px; background: #fff;
}
.ent-row-outlook-btn {
  border: 1px solid var(--accent); background: var(--accent); color: #fff; border-radius: 6px;
  font-size: 11px; font-weight: 600; padding: 4px 10px; cursor: pointer; white-space: nowrap;
  font-family: 'DM Sans', sans-serif;
}
.ent-row-outlook-btn:hover { opacity: 0.88; }
.ent-row-outlook-btn.done { background: transparent; color: #2e7d5b; border-color: rgba(58,143,110,0.4); }
.ent-mail-row.next { background: rgba(23,37,84,0.05); }
.ent-mail-row.last { box-shadow: inset 3px 0 0 #3a8f6e; }
.ent-mail-row .state { max-width: none; overflow: visible; }
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

        {/* DESTINATION — flux (export/import) + les 7 pays, comme sur l'enquête flux */}
        <div className="ent-filter-group" ref={destinationRef}>
          <span className="ent-filter-label">Destination</span>
          <button
            type="button"
            className={`ent-filter-btn ${(searchFlowTypes.length || searchDestinations.length) ? 'active' : ''}`}
            onClick={(e) => {
              const next = !isDestinationOpen;
              setIsDestinationOpen(next);
              if (next) setFilterDropdownPos(getDropdownPos(e.currentTarget));
              setIsTypeOpen(false); setIsRegionOpen(false); setIsSegmentOpen(false);
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {(() => {
                const flowLabel = searchFlowTypes.length === 0
                  ? null
                  : searchFlowTypes.length === FLOW_TYPES.length
                    ? 'Export + Import'
                    : FLOW_TYPES.find(f => f.key === searchFlowTypes[0])?.label;
                const destLabel = searchDestinations.length === 0
                  ? null
                  : searchDestinations.length === 1
                    ? BASE_DESTINATIONS.find(d => d.key === searchDestinations[0])?.label
                    : `${searchDestinations.length} destinations`;
                if (!flowLabel && !destLabel) return 'Toutes les destinations';
                return [flowLabel, destLabel].filter(Boolean).join(' · ');
              })()}
            </span>
            <ChevronDownIcon className={`ent-chevron ${isDestinationOpen ? 'open' : ''}`} />
          </button>
          {isDestinationOpen && filterDropdownPos && (
            <div className="ent-filter-dropdown" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left, width: Math.max(filterDropdownPos.width, 240) }}>
              {/* Flux: Export / Import — tick either, or both */}
              <div style={{ padding: '8px 14px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600 }}>
                Flux
              </div>
              {FLOW_TYPES.map(f => (
                <label key={f.key} className="ent-filter-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={searchFlowTypes.includes(f.key)}
                    onChange={() => toggleFlowType(f.key)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <span>{f.label}</span>
                </label>
              ))}

              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

              <div style={{ padding: '4px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600 }}>
                Pays
              </div>
              <label className="ent-filter-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={searchDestinations.length === BASE_DESTINATIONS.length}
                  ref={el => { if (el) el.indeterminate = searchDestinations.length > 0 && searchDestinations.length < BASE_DESTINATIONS.length; }}
                  onChange={toggleAllDestinations}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                />
                <span>Tout sélectionner</span>
              </label>
              {BASE_DESTINATIONS.map(d => (
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
                  onClick={() => { setSearchFlowTypes([]); setSearchDestinations([]); setCurrentPage(1); }}
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

        {/* SCI — Tous / Oui / Non */}
        <div className="ent-filter-group">
          <span className="ent-filter-label">SCI</span>
          <div className="ent-seg-toggle" role="group" aria-label="Filtre SCI">
            {([['', 'Tous'], ['oui', 'Oui'], ['non', 'Non']] as const).map(([value, label]) => (
              <button
                key={value || 'all'}
                type="button"
                className={searchSci === value ? 'active' : ''}
                aria-pressed={searchSci === value}
                onClick={() => { setSearchSci(value); setCurrentPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* RÉGION / DÉLÉGATION — combined: pick a région, its délégations expand right underneath */}
        <div className="ent-filter-group" ref={regionRef}>
          <span className="ent-filter-label">Région / Délégation</span>
          <button
            type="button"
            className={`ent-filter-btn ${searchRegion ? 'active' : ''}`}
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
        <div className="ent-filter-group ent-search-group">
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
          <div className="ent-filter-group ent-actions-group" style={{ position: 'relative' }} ref={mainActionRef}>
            <span className="ent-filter-label" style={{ opacity: 0 }}>.</span>
            <button type="button" className="ent-action-btn" onClick={() => setIsMainActionOpen(prev => !prev)}>
              Actions <ChevronDownIcon className={`ent-chevron ${isMainActionOpen ? 'open' : ''}`} style={{ color: 'rgba(255,255,255,0.85)' }} />
            </button>
            {isMainActionOpen && (
              <div className="ent-main-action-dropdown">
                <div className="ent-main-action-item" onClick={handleAddCompany}>+ Ajouter entité</div>
                <div className="ent-main-action-item" onClick={handleAddMultiple}>↑ Importer plusieurs</div>
                <div className="ent-main-action-item" onClick={handleExportContacts}>↓ Exporter contacts ({actionTargets.length})</div>
                <div className="ent-main-action-item" onClick={handleExport}>↓ Exporter toutes les colonnes ({actionTargets.length})</div>
                <div className="ent-main-action-item" onClick={openMailModal}>✉ Envoi mail via Outlook ({actionTargets.length})</div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── ACTIVE FILTERS (chips) ─────────────────────────────────────────── */}
      {(() => {
        const active = getActiveFilters();
        if (active.length === 0) return null;
        return (
          <div className="ent-active-filters">
            <span className="ent-active-filters-label">Filtres actifs</span>
            {active.map(f => (
              <span key={f.key} className="ent-filter-chip" title={`${f.label} : ${f.value}`}>
                <span className="ent-filter-chip-k">{f.label}</span>
                <span className="ent-filter-chip-v">{f.value}</span>
                <button type="button" onClick={f.clear} aria-label={`Retirer le filtre ${f.label}`}>×</button>
              </span>
            ))}
            <button type="button" className="ent-link-btn" onClick={resetAllFilters}>Tout effacer</button>
          </div>
        );
      })()}

      {/* ── RESULTS BAR ─────────────────────────────────────────────────────── */}
      <div className="ent-results-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><strong>{filteredCompanies.length.toLocaleString('fr')}</strong>‎  résultat{filteredCompanies.length > 1 ? 's' : ''}</div>

          {selectedInView.length > 0 && (
            <div className="ent-selection-pill">
              <span style={{ fontWeight: 600, color: 'var(--text2)' }}>
                {selectedInView.length} sélectionné{selectedInView.length > 1 ? 's' : ''}
              </span>
              {selectedInView.length < filteredCompanies.length && (
                <button type="button" className="ent-link-btn" onClick={selectAllFiltered}>
                  Tout sélectionner ({filteredCompanies.length})
                </button>
              )}
              <button type="button" className="ent-link-btn muted" onClick={clearSelection}>
                Désélectionner
              </button>
            </div>
          )}

          {/* One-click actions on exactly what is shown (selection ∩ filters, or all filtered rows) */}
          <div className="ent-bulk-actions">
            <button
              type="button"
              className="ent-bulk-btn"
              onClick={handleExportContacts}
              disabled={actionTargets.length === 0}
              title={actionScope === 'selection'
                ? 'Exporter les entités sélectionnées (Excel)'
                : 'Exporter toutes les entités correspondant aux filtres (Excel)'}
            >
              <ArrowDownTrayIcon style={{ width: 15, height: 15 }} />
              Exporter Excel
              <span className="ent-bulk-count">{actionTargets.length}</span>
            </button>
            <button
              type="button"
              className="ent-bulk-btn primary"
              onClick={openMailModal}
              disabled={actionTargets.length === 0}
              title={actionScope === 'selection'
                ? 'Ouvrir dans Outlook un email personnalisé pour chaque entité sélectionnée'
                : 'Ouvrir dans Outlook un email personnalisé pour chaque entité filtrée'}
            >
              <EnvelopeIcon style={{ width: 15, height: 15 }} />
              Envoi mail
              <span className="ent-bulk-count">{actionTargets.length}</span>
            </button>
            <span className="ent-bulk-scope">
              {actionScope === 'selection' ? 'sur la sélection' : (getActiveFilters().length ? 'sur les résultats filtrés' : 'sur toutes les entités')}
            </span>
          </div>
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
              <th style={{ width: 200 }}>Destinations</th>
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

                  {/* Destinations (export + import) — swapped out of the collapsible so it's visible without expanding */}
                  <td onClick={e => e.stopPropagation()}>
                    {(() => {
                      const dests = getCompanyDestinations(company);
                      if (dests.length === 0) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 180, alignItems: 'center' }}>
                          {dests.slice(0, 2).map(d => (
                            <span
                              key={d.field}
                              className="ent-pill"
                              style={
                                d.flow === 'export'
                                  ? { background: 'rgba(23,37,84,0.08)', color: 'var(--accent)', borderColor: 'rgba(23,37,84,0.22)', maxWidth: 100 }
                                  : { background: 'rgba(184,110,42,0.10)', color: '#b86e2a', borderColor: 'rgba(184,110,42,0.3)', maxWidth: 100 }
                              }
                              title={`${d.flow === 'export' ? 'Export' : 'Import'} · ${d.label}`}
                            >
                              {d.flow === 'export' ? '↑' : '↓'} {d.label}
                            </span>
                          ))}
                          {dests.length > 2 && (
                            <button
                              type="button"
                              className="ent-view-more"
                              onClick={(e) => { e.stopPropagation(); toggleRow(company.id_entite); }}
                              title="Voir toutes les destinations"
                            >
                              +{dests.length - 2} · voir plus
                            </button>
                          )}
                        </div>
                      );
                    })()}
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

                        {/* Destinations — full list, untruncated, split Export / Import so the direction is unambiguous */}
                        {getCompanyDestinations(company).length > 0 && (
                          <>
                            <hr className="ent-expand-divider" />
                            <div>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>
                                Destinations ({getCompanyDestinations(company).length})
                              </div>
                              {(['export', 'import'] as FlowType[]).map(flow => {
                                const items = getCompanyDestinations(company, [flow]);
                                if (items.length === 0) return null;
                                return (
                                  <div key={flow} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: flow === 'export' ? 'var(--accent)' : '#b86e2a', marginBottom: 4 }}>
                                      {flow === 'export' ? 'Export' : 'Import'}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                      {items.map(d => (
                                        <span
                                          key={d.field}
                                          className="ent-pill"
                                          style={
                                            flow === 'export'
                                              ? { background: 'rgba(23,37,84,0.08)', color: 'var(--accent)', borderColor: 'rgba(23,37,84,0.22)' }
                                              : { background: 'rgba(184,110,42,0.10)', color: '#b86e2a', borderColor: 'rgba(184,110,42,0.3)' }
                                          }
                                        >
                                          {d.label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
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


      {/* ─── ENVOI MAIL MODAL (Outlook) ─────────────────────────────────────── */}
      {isMailModalOpen && (
        <div className="ent-modal-overlay">
          <div className="ent-modal" style={{ '--modal-max': '920px' } as React.CSSProperties}>
            <div className="ent-modal-header" style={{ cursor: 'default' }}>
              <div>
                <div className="ent-modal-title">Envoi mail via Outlook</div>
                <div className="ent-modal-subtitle">
                  {mailSendable.length} entité{mailSendable.length > 1 ? 's' : ''} · un message Outlook séparé par entité, personnalisé avec sa raison sociale
                </div>
              </div>
              <button className="ent-modal-close" onClick={() => setIsMailModalOpen(false)} title="Fermer">
                <XMarkIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div className="ent-mail-tabs">
              <button className={mailTab === 'message' ? 'active' : ''} onClick={() => setMailTab('message')}>1. Message</button>
              <button className={mailTab === 'apercu' ? 'active' : ''} onClick={() => setMailTab('apercu')}>2. Aperçu</button>
              <button className={mailTab === 'envoi' ? 'active' : ''} onClick={() => setMailTab('envoi')}>
                3. Envoi Outlook <span className="ent-bulk-count">{mailOpenedCount}/{mailSendable.length}</span>
                {mailWithoutEmail.length > 0 && <span className="ent-tab-warn" title="Entités sans email valide">{mailWithoutEmail.length} sans email</span>}
              </button>
            </div>

            {mailInfo && (
              <div className={`ent-mail-banner ${mailInfo.type}`}>{mailInfo.text}</div>
            )}

            <div className="ent-modal-body">
              {mailTab === 'message' && (
                <div className="ent-form-grid">
                  <div className="ent-form-field span-2">
                    <div style={modalLabelStyle}>Objet</div>
                    <input className={modalInput} style={modalInputStyle} value={mailSubject} onChange={e => setMailSubject(e.target.value)} />
                  </div>
                  <div className="ent-form-field span-2">
                    <div style={modalLabelStyle}>Lien du questionnaire (optionnel)</div>
                    <input className={modalInput} style={modalInputStyle} value={mailLink} onChange={e => setMailLink(e.target.value)} placeholder="https://…" />
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Inséré à l'emplacement de <code>{'{lien_questionnaire}'}</code>. Laissez vide pour ne rien afficher.
                    </div>
                  </div>
                  <div className="ent-form-field span-2">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={modalLabelStyle}>Message</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Insérer :</span>
                        <button type="button" className="ent-token-btn" onClick={() => insertMailToken('{raison_sociale}')}>Raison sociale</button>
                        <button type="button" className="ent-token-btn" onClick={() => insertMailToken('{personne_contact}')}>Personne contact</button>
                        <button type="button" className="ent-token-btn" onClick={() => insertMailToken('{lien_questionnaire}')}>Lien questionnaire</button>
                        <button
                          type="button"
                          className="ent-link-btn muted"
                          onClick={() => {
                            if (window.confirm('Remettre le texte du document Word (vos modifications seront perdues) ?')) {
                              setMailBody(DEFAULT_MAIL_BODY);
                              setMailSubject(DEFAULT_MAIL_SUBJECT);
                            }
                          }}
                        >
                          Réinitialiser le modèle
                        </button>
                      </div>
                    </div>
                    <div className="ent-mail-editor">
                      <ReactQuill ref={quillRef} theme="snow" value={mailBody} onChange={setMailBody} modules={mailQuillModules} />
                    </div>
                  </div>
                </div>
              )}

              {mailTab === 'apercu' && mailPreviewRecipient && (
                <>
                  <div className="ent-form-field" style={{ marginBottom: 12 }}>
                    <div style={modalLabelStyle}>Aperçu pour</div>
                    <select
                      className={modalInput}
                      style={modalSelectStyle}
                      value={mailPreviewRecipient.id_entite}
                      onChange={e => setMailPreviewId(Number(e.target.value))}
                    >
                      {mailRecipients.map(r => (
                        <option key={r.id_entite} value={r.id_entite}>
                          {r.raison_socialle}{r.emails.length ? '' : ' (sans email)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ent-mail-preview">
                    <div className="ent-mail-preview-head">
                      <div><span>À :</span> {mailPreviewRecipient.emails.join('; ') || '—'} <em>(seul destinataire)</em></div>
                      <div><span>Objet :</span> <strong>{renderMailSubject(mailSubject, mailPreviewRecipient)}</strong></div>
                    </div>
                    <div className="ent-mail-preview-body" dangerouslySetInnerHTML={{ __html: mailPreviewHtml }} />
                  </div>
                </>
              )}

              {mailTab === 'envoi' && (
                <>
                  <div className="ent-outlook-steps">
                    <div><b>1</b> Cliquez sur <strong>« Ouvrir dans Outlook »</strong> : un nouveau message s'ouvre, déjà adressé à l'entité, avec l'objet et le texte personnalisés.</div>
                    <div><b>2</b> Vérifiez et cliquez sur <strong>Envoyer</strong> dans Outlook.</div>
                    <div><b>3</b> Revenez ici et passez à l'entité suivante. La progression est mémorisée.</div>
                    <div className="tip">
                      Astuce : la version <strong>mise en forme</strong> (gras, souligné, puces) est aussi copiée automatiquement.
                      Pour l'avoir dans Outlook : cliquez dans le corps du message, <kbd>Ctrl</kbd>+<kbd>A</kbd> puis <kbd>Ctrl</kbd>+<kbd>V</kbd>.
                      (Même chose si le texte apparaît incomplet.)
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {mailOpenedCount} / {mailSendable.length} ouvert{mailOpenedCount > 1 ? 's' : ''} dans Outlook
                    </div>
                    <button type="button" className="ent-link-btn muted" onClick={resetMailProgress}>Réinitialiser le suivi</button>
                  </div>
                  <div className="ent-progress">
                    <div style={{ width: `${mailSendable.length ? Math.round((mailOpenedCount / mailSendable.length) * 100) : 0}%` }} />
                  </div>

                  <div className="ent-mail-list" style={{ marginTop: 12, maxHeight: '42vh' }}>
                    {mailRecipients.map(r => {
                      const hasEmail = r.emails.length > 0;
                      const opened = mailOpened.has(r.id_entite);
                      const isNext = mailNext?.id_entite === r.id_entite;
                      return (
                        <div
                          key={r.id_entite}
                          className={`ent-mail-row ${!hasEmail ? 'failed' : opened ? 'sent' : 'pending'} ${isNext ? 'next' : ''} ${mailLastOpenedId === r.id_entite ? 'last' : ''}`}
                        >
                          <span className="ent-mail-dot" />
                          <span className="name">
                            {r.raison_socialle}
                            {r.sci && <span className="ent-sci-mini">SCI</span>}
                          </span>
                          <span className="addr">{hasEmail ? r.emails.join('; ') : 'Aucune adresse email valide'}</span>
                          <span className="state">
                            {hasEmail && (
                              <button
                                type="button"
                                className={`ent-row-outlook-btn ${opened ? 'done' : ''}`}
                                onClick={() => openInOutlook(r)}
                                title={opened ? 'Déjà ouvert — rouvrir dans Outlook' : 'Ouvrir ce message dans Outlook'}
                              >
                                {opened ? '✓ Ouvert · rouvrir' : 'Ouvrir dans Outlook'}
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="ent-modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {mailTab !== 'envoi'
                  ? 'Outlook doit être votre application mail par défaut.'
                  : mailNext ? `Suivant : ${mailNext.raison_socialle}` : (mailSendable.length ? 'Tous les messages ont été ouverts ✓' : '')}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="ent-btn-secondary" onClick={() => setIsMailModalOpen(false)}>Fermer</button>
                {mailTab !== 'envoi' ? (
                  <button className="ent-btn-primary" onClick={() => {
                    const err = validateMailForm();
                    if (err) { setMailInfo({ type: 'error', text: err }); setMailTab('message'); return; }
                    setMailInfo(null);
                    setMailTab(mailTab === 'message' ? 'apercu' : 'envoi');
                  }}>
                    Continuer →
                  </button>
                ) : (
                  <button
                    className="ent-btn-primary"
                    disabled={!mailNext}
                    onClick={openNextInOutlook}
                    style={{ opacity: mailNext ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    <EnvelopeIcon style={{ width: 16, height: 16 }} />
                    {mailNext
                      ? `Ouvrir dans Outlook (${mailOpenedCount + 1}/${mailSendable.length})`
                      : 'Terminé'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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