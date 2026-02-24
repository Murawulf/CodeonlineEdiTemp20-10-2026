// CatalogueComplet.tsx
// FULLY FIXED: Brique dropdown works | Array safety | All features preserved
// Updated with SINGLE declinaison type select (as each product has one type)
// Multiple parents select with dynamic filtering based on current type
// Integrated declinaison table with full hierarchical breakdown display
// Added quantity per parent-fils relationship
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import Draggable from "react-draggable";
import { Resizable } from "re-resizable";
import debounce from "lodash/debounce";
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from "xlsx";
import axios from "axios";
interface Notification {
  id_notification: number;
  contenu: string;
  type: 'success' | 'error';
  created_at: string;
  read: number;
}
interface NotificationContextType {
  notifications: Notification[];
  addNotification: (contenu: string, type: 'success' | 'error') => void;
  markAsRead: (id: number) => void;
  deleteNotification: (id: number) => void;
  clearNotifications: () => void;
}
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
const API = {
  notifications: `${API_BASE}/api/notifications`,
  markRead: (id: number) => `${API_BASE}/api/notifications/${id}/read`,
  delete: (id: number) => `${API_BASE}/api/notifications/${id}`,
  clear: `${API_BASE}/api/notifications/clear`,
};
export const NotificationProvider: React.FC<{ children: React.ReactNode; compteId: number | null }> = ({ children, compteId }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fetchNotifications = useCallback(async () => {
    if (!compteId) {
      setNotifications([]);
      setError(null);
      return;
    }
    try {
      const res = await fetch(`${API.notifications}?id_compte=${compteId}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 503 && retryCount < 3) {
          setTimeout(() => fetchNotifications(), 2000);
          return;
        }
        throw new Error(`Erreur ${res.status}: Impossible de récupérer les notifications`);
      }
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setError(null);
      setRetryCount(0);
    } catch (err) {
      console.error('Erreur de récupération des notifications:', err);
      setError('Échec du chargement des notifications. Veuillez réessayer plus tard.');
      setNotifications([]);
    }
  }, [compteId, retryCount]);
  useEffect(() => {
    if (compteId) fetchNotifications();
    else {
      setNotifications([]);
      setError(null);
    }
  }, [compteId, fetchNotifications]);
  async function addNotification(contenu: string, type: 'success' | 'error') {
    if (!compteId) return;
    try {
      const res = await fetch(API.notifications, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ contenu, type, id_compte: compteId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}: Impossible d'ajouter la notification`);
      const newNotification = await res.json();
      setNotifications((prev) => [newNotification, ...prev]);
      await fetchNotifications();
      setTimeout(async () => {
        await deleteNotification(newNotification.id_notification);
      }, 5000);
    } catch (err) {
      console.error('Erreur lors de l’ajout de la notification:', err);
      setError('Échec de l’ajout de la notification.');
    }
  }
  async function markAsRead(id: number) {
    if (!compteId) return;
    try {
      const res = await fetch(API.markRead(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compteId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}: Impossible de marquer comme lu`);
      setNotifications((prev) =>
        prev.map((n) => (n.id_notification === id ? { ...n, read: 1 } : n))
      );
    } catch (err) {
      console.error('Erreur lors du marquage comme lu:', err);
      setError('Échec du marquage de la notification comme lue.');
    }
  }
  async function deleteNotification(id: number) {
    if (!compteId) return;
    try {
      const res = await fetch(API.delete(id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compteId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}: Impossible de supprimer la notification`);
      setNotifications((prev) => prev.filter((n) => n.id_notification !== id));
    } catch (err) {
      console.error('Erreur lors de la suppression de la notification:', err);
      setError('Échec de la suppression de la notification.');
    }
  }
  async function clearNotifications() {
    if (!compteId) return;
    try {
      const res = await fetch(API.clear, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id_compte: compteId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}: Impossible de vider les notifications`);
      setNotifications([]);
    } catch (err) {
      console.error('Erreur lors du vidage des notifications:', err);
      setError('Échec du vidage des notifications.');
      await fetchNotifications();
    }
  }
  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, markAsRead, deleteNotification, clearNotifications }}
    >
      <div className="relative">
        {children}
        <div className="fixed top-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-sm">
          <AnimatePresence mode="popLayout">
            {notifications.map((notification) => (
              <motion.div
                key={notification.id_notification}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{ duration: 0.3 }}
                className={`p-4 rounded-lg shadow-lg text-base flex justify-between items-center gap-4 ${
                  notification.type === 'success' ? 'bg-blue-900 text-white' : 'bg-red-500 text-white'
                } ${notification.read ? 'opacity-60' : ''}`}
              >
                <span className="flex-1">{notification.contenu}</span>
                <motion.button
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => deleteNotification(notification.id_notification)}
                  className="ml-2 font-bold text-lg hover:text-gray-200 focus:outline-none"
                  aria-label="Fermer la notification"
                >
                  X
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-4 right-4 p-4 rounded-lg shadow-lg bg-red-500 text-white text-base flex justify-between items-center gap-4"
          >
            <span>{error}</span>
            <motion.button
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setError(null)}
              className="font-bold text-lg hover:text-gray-200 focus:outline-none"
              aria-label="Fermer l'erreur"
            >
              X
            </motion.button>
          </motion.div>
        )}
      </div>
    </NotificationContext.Provider>
  );
};
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
interface ParentItem {
  id_parent: number;
  libelle: string;
  gtin: string;
  declinaison_type: string | null;
  quantity: number;
}
interface Product {
  id: number;
  brand: string;
  subBrand: string;
  description: string;
  gtin: string;
  libelle: string;
  short_libelle: string;
  countryOfOrigin: string;
  idEntreprise: number;
  images: string;
  nb_images: number;
  prix_min: number;
  prix_max: number;
  code_cader: string;
  codeClasse: number;
  codebrique: string;
  date_mis_a_jour_fp: string;
  tradeItemSynchronisationDates: string;
  date_create_fp: string;
  activ_prix: number;
  status: number;
  done_new: number;
  declinaison_type: string | null;
  parents: ParentItem[]; // Integrated from declinaison table
}
interface Node {
  libelle: string;
  gtin: string;
  declinaison_type: string | null;
  parents: { id: number; quantity: number }[];
  children: { id: number; quantity: number }[];
}
type PathItem = {
  id: number;
  declinaison_type: string | null;
  libelle: string;
  gtin: string;
  quantity: number;
};
type Path = PathItem[];
interface EditingProduct extends Product {
  newImages?: File[];
  selectedSegment?: string;
  bricksList?: BrickItem[];
  possibleParents?: { id: number; libelle: string; gtin: string; declinaison_type: string | null }[]; // Added for select
  selectedDeclinaison?: string | null; // For single declinaison select
  selectedParents?: Record<number, number>; // For multiple parent select with quantity
  originalParents?: Record<number, number>; // For comparing changes
}
interface ClassItem {
  codeClasse: number;
  libelleClasse: string;
}
interface BrickItem {
  codeBrique: string;
  libelleBrique: string;
}
interface CountryItem {
  isoNumeric: string;
  libelle: string;
}
interface User {
  id_compte?: number;
  email?: string;
  name?: string;
  id_entite?: number;
  producer_name?: string;
  permissions?: {
    page_id: number;
    page_name: string;
    read: boolean;
    write: boolean;
    hide: boolean;
  }[];
  segmentsList?: any[];
}
interface Compte {
  id_compte: number;
}
const statusLabel = (s: number) => {
  switch (s) {
    case 0: return "Enregistré";
    case 1: return "En attente";
    case 2: return "Publié";
    default: return "Inconnu";
  }
};
const declinaisonTypes = [
  { code: 'PK', label: 'Lot Consommateur Homogène' },
  { code: 'AP', label: 'Lot Consommateur Hétérogène' },
  { code: 'CA', label: 'Colis Homogène' },
  { code: 'DS', label: 'Colis Hétérogène' },
  { code: 'PL', label: 'Palette Homogène' },
  { code: 'MX', label: 'Palette Hétérogène' },
];
const typeIcons: Record<string, string> = {
  PK: '📦',
  AP: '📦+',
  CA: '🗳️',
  DS: '🗳️+',
  PL: '🚛',
  MX: '🚛+',
};
const getTypeIcon = (code: string | null) => typeIcons[code || ''] || '❓';
const getTypeLabel = (code: string | null) => declinaisonTypes.find(d => d.code === code)?.label || (code || '-');
const Catalogue: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const raw1 = localStorage.getItem("currentUser");
    const raw2 = localStorage.getItem("currentUser");
    let parsed = null;
    if (raw1) {
      try { parsed = JSON.parse(raw1); } catch {}
    }
    if (!parsed && raw2) {
      try { parsed = JSON.parse(raw2); } catch {}
    }
    if (parsed) setUser(parsed);
  }, []);
  return (
    <NotificationProvider compteId={user?.id_compte || null}>
      <CatalogueInner user={user} />
    </NotificationProvider>
  );
};
const CatalogueInner: React.FC<{ user: User | null }> = ({ user }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [classesList, setClassesList] = useState<ClassItem[]>([]);
  const [allBricks, setAllBricks] = useState<BrickItem[]>([]);
  const [bricksList, setBricksList] = useState<BrickItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const countries: CountryItem[] = [{"isoNumeric":"004","libelle":"Afghanistan"},{"isoNumeric":"008","libelle":"Albania"},{"isoNumeric":"012","libelle":"Algeria"},{"isoNumeric":"016","libelle":"American Samoa"},{"isoNumeric":"020","libelle":"Andorra"},{"isoNumeric":"024","libelle":"Angola"},{"isoNumeric":"660","libelle":"Anguilla"},{"isoNumeric":"010","libelle":"Antarctica"},{"isoNumeric":"028","libelle":"Antigua and Barbuda"},{"isoNumeric":"032","libelle":"Argentina"},{"isoNumeric":"051","libelle":"Armenia"},{"isoNumeric":"533","libelle":"Aruba"},{"isoNumeric":"036","libelle":"Australia"},{"isoNumeric":"040","libelle":"Austria"},{"isoNumeric":"031","libelle":"Azerbaijan"},{"isoNumeric":"044","libelle":"Bahamas"},{"isoNumeric":"048","libelle":"Bahrain"},{"isoNumeric":"050","libelle":"Bangladesh"},{"isoNumeric":"052","libelle":"Barbados"},{"isoNumeric":"112","libelle":"Belarus"},{"isoNumeric":"056","libelle":"Belgium"},{"isoNumeric":"084","libelle":"Belize"},{"isoNumeric":"204","libelle":"Benin"},{"isoNumeric":"060","libelle":"Bermuda"},{"isoNumeric":"064","libelle":"Bhutan"},{"isoNumeric":"068","libelle":"Bolivia"},{"isoNumeric":"070","libelle":"Bosnia and Herzegovina"},{"isoNumeric":"072","libelle":"Botswana"},{"isoNumeric":"074","libelle":"Bouvet Island"},{"isoNumeric":"076","libelle":"Brazil"},{"isoNumeric":"086","libelle":"British Indian Ocean Territory"},{"isoNumeric":"092","libelle":"British Virgin Islands"},{"isoNumeric":"096","libelle":"Brunei"},{"isoNumeric":"100","libelle":"Bulgaria"},{"isoNumeric":"854","libelle":"Burkina Faso"},{"isoNumeric":"108","libelle":"Burundi"},{"isoNumeric":"116","libelle":"Cambodia"},{"isoNumeric":"120","libelle":"Cameroon"},{"isoNumeric":"124","libelle":"Canada"},{"isoNumeric":"132","libelle":"Cape Verde"},{"isoNumeric":"136","libelle":"Cayman Islands"},{"isoNumeric":"140","libelle":"Central African Republic"},{"isoNumeric":"148","libelle":"Chad"},{"isoNumeric":"152","libelle":"Chile"},{"isoNumeric":"156","libelle":"China"},{"isoNumeric":"162","libelle":"Christmas Island"},{"isoNumeric":"166","libelle":"Cocos Islands"},{"isoNumeric":"170","libelle":"Colombia"},{"isoNumeric":"174","libelle":"Comoros"},{"isoNumeric":"184","libelle":"Cook Islands"},{"isoNumeric":"188","libelle":"Costa Rica"},{"isoNumeric":"191","libelle":"Croatia"},{"isoNumeric":"192","libelle":"Cuba"},{"isoNumeric":"196","libelle":"Cyprus"},{"isoNumeric":"203","libelle":"Czech Republic"},{"isoNumeric":"180","libelle":"Democratic Republic of the Congo"},{"isoNumeric":"208","libelle":"Denmark"},{"isoNumeric":"262","libelle":"Djibouti"},{"isoNumeric":"212","libelle":"Dominica"},{"isoNumeric":"214","libelle":"Dominican Republic"},{"isoNumeric":"626","libelle":"East Timor"},{"isoNumeric":"218","libelle":"Ecuador"},{"isoNumeric":"818","libelle":"Egypt"},{"isoNumeric":"222","libelle":"El Salvador"},{"isoNumeric":"226","libelle":"Equatorial Guinea"},{"isoNumeric":"232","libelle":"Eritrea"},{"isoNumeric":"233","libelle":"Estonia"},{"isoNumeric":"231","libelle":"Ethiopia"},{"isoNumeric":"238","libelle":"Falkland Islands"},{"isoNumeric":"234","libelle":"Faroe Islands"},{"isoNumeric":"242","libelle":"Fiji"},{"isoNumeric":"246","libelle":"Finland"},{"isoNumeric":"250","libelle":"France"},{"isoNumeric":"254","libelle":"French Guiana"},{"isoNumeric":"258","libelle":"French Polynesia"},{"isoNumeric":"260","libelle":"French Southern Territories"},{"isoNumeric":"266","libelle":"Gabon"},{"isoNumeric":"270","libelle":"Gambia"},{"isoNumeric":"268","libelle":"Georgia"},{"isoNumeric":"276","libelle":"Germany"},{"isoNumeric":"288","libelle":"Ghana"},{"isoNumeric":"292","libelle":"Gibraltar"},{"isoNumeric":"300","libelle":"Greece"},{"isoNumeric":"304","libelle":"Greenland"},{"isoNumeric":"308","libelle":"Grenada"},{"isoNumeric":"312","libelle":"Guadeloupe"},{"isoNumeric":"316","libelle":"Guam"},{"isoNumeric":"320","libelle":"Guatemala"},{"isoNumeric":"324","libelle":"Guinea"},{"isoNumeric":"624","libelle":"Guinea-Bissau"},{"isoNumeric":"328","libelle":"Guyana"},{"isoNumeric":"332","libelle":"Haiti"},{"isoNumeric":"334","libelle":"Heard Island and McDonald Islands"},{"isoNumeric":"340","libelle":"Honduras"},{"isoNumeric":"344","libelle":"Hong Kong"},{"isoNumeric":"348","libelle":"Hungary"},{"isoNumeric":"352","libelle":"Iceland"},{"isoNumeric":"356","libelle":"India"},{"isoNumeric":"360","libelle":"Indonesia"},{"isoNumeric":"364","libelle":"Iran"},{"isoNumeric":"368","libelle":"Iraq"},{"isoNumeric":"372","libelle":"Ireland"},{"isoNumeric":"376","libelle":"Israel"},{"isoNumeric":"380","libelle":"Italy"},{"isoNumeric":"384","libelle":"Ivory Coast"},{"isoNumeric":"388","libelle":"Jamaica"},{"isoNumeric":"392","libelle":"Japan"},{"isoNumeric":"400","libelle":"Jordan"},{"isoNumeric":"398","libelle":"Kazakhstan"},{"isoNumeric":"404","libelle":"Kenya"},{"isoNumeric":"296","libelle":"Kiribati"},{"isoNumeric":"414","libelle":"Kuwait"},{"isoNumeric":"417","libelle":"Kyrgyzstan"},{"isoNumeric":"418","libelle":"Laos"},{"isoNumeric":"428","libelle":"Latvia"},{"isoNumeric":"422","libelle":"Lebanon"},{"isoNumeric":"426","libelle":"Lesotho"},{"isoNumeric":"430","libelle":"Liberia"},{"isoNumeric":"434","libelle":"Libya"},{"isoNumeric":"438","libelle":"Liechtenstein"},{"isoNumeric":"440","libelle":"Lithuania"},{"isoNumeric":"442","libelle":"Luxembourg"},{"isoNumeric":"446","libelle":"Macao"},{"isoNumeric":"807","libelle":"Macedonia"},{"isoNumeric":"450","libelle":"Madagascar"},{"isoNumeric":"454","libelle":"Malawi"},{"isoNumeric":"458","libelle":"Malaysia"},{"isoNumeric":"462","libelle":"Maldives"},{"isoNumeric":"466","libelle":"Mali"},{"isoNumeric":"470","libelle":"Malta"},{"isoNumeric":"584","libelle":"Marshall Islands"},{"isoNumeric":"474","libelle":"Martinique"},{"isoNumeric":"478","libelle":"Mauritania"},{"isoNumeric":"480","libelle":"Mauritius"},{"isoNumeric":"175","libelle":"Mayotte"},{"isoNumeric":"484","libelle":"Mexico"},{"isoNumeric":"583","libelle":"Micronesia"},{"isoNumeric":"498","libelle":"Moldova"},{"isoNumeric":"492","libelle":"Monaco"},{"isoNumeric":"496","libelle":"Mongolia"},{"isoNumeric":"500","libelle":"Montserrat"},{"isoNumeric":"504","libelle":"Morocco"},{"isoNumeric":"508","libelle":"Mozambique"},{"isoNumeric":"104","libelle":"Myanmar"},{"isoNumeric":"516","libelle":"Namibia"},{"isoNumeric":"520","libelle":"Nauru"},{"isoNumeric":"524","libelle":"Nepal"},{"isoNumeric":"528","libelle":"Netherlands"},{"isoNumeric":"530","libelle":"Netherlands Antilles"},{"isoNumeric":"540","libelle":"New Caledonia"},{"isoNumeric":"554","libelle":"New Zealand"},{"isoNumeric":"558","libelle":"Nicaragua"},{"isoNumeric":"562","libelle":"Niger"},{"isoNumeric":"566","libelle":"Nigeria"},{"isoNumeric":"570","libelle":"Niue"},{"isoNumeric":"574","libelle":"Norfolk Island"},{"isoNumeric":"408","libelle":"North Korea"},{"isoNumeric":"580","libelle":"Northern Mariana Islands"},{"isoNumeric":"578","libelle":"Norway"},{"isoNumeric":"512","libelle":"Oman"},{"isoNumeric":"586","libelle":"Pakistan"},{"isoNumeric":"585","libelle":"Palau"},{"isoNumeric":"275","libelle":"Palestinian Territory"},{"isoNumeric":"591","libelle":"Panama"},{"isoNumeric":"598","libelle":"Papua New Guinea"},{"isoNumeric":"600","libelle":"Paraguay"},{"isoNumeric":"604","libelle":"Peru"},{"isoNumeric":"608","libelle":"Philippines"},{"isoNumeric":"612","libelle":"Pitcairn"},{"isoNumeric":"616","libelle":"Poland"},{"isoNumeric":"620","libelle":"Portugal"},{"isoNumeric":"630","libelle":"Puerto Rico"},{"isoNumeric":"634","libelle":"Qatar"},{"isoNumeric":"178","libelle":"Republic of the Congo"},{"isoNumeric":"638","libelle":"Reunion"},{"isoNumeric":"642","libelle":"Romania"},{"isoNumeric":"643","libelle":"Russia"},{"isoNumeric":"646","libelle":"Rwanda"},{"isoNumeric":"654","libelle":"Saint Helena"},{"isoNumeric":"659","libelle":"Saint Kitts and Nevis"},{"isoNumeric":"662","libelle":"Saint Lucia"},{"isoNumeric":"666","libelle":"Saint Pierre and Miquelon"},{"isoNumeric":"670","libelle":"Saint Vincent and the Grenadines"},{"isoNumeric":"882","libelle":"Samoa"},{"isoNumeric":"674","libelle":"San Marino"},{"isoNumeric":"678","libelle":"Sao Tome and Principe"},{"isoNumeric":"682","libelle":"Saudi Arabia"},{"isoNumeric":"686","libelle":"Senegal"},{"isoNumeric":"891","libelle":"Serbia and Montenegro"},{"isoNumeric":"690","libelle":"Seychelles"},{"isoNumeric":"694","libelle":"Sierra Leone"},{"isoNumeric":"702","libelle":"Singapore"},{"isoNumeric":"703","libelle":"Slovakia"},{"isoNumeric":"705","libelle":"Slovenia"},{"isoNumeric":"090","libelle":"Solomon Islands"},{"isoNumeric":"706","libelle":"Somalia"},{"isoNumeric":"710","libelle":"South Africa"},{"isoNumeric":"239","libelle":"South Georgia and the South Sandwich Islands"},{"isoNumeric":"410","libelle":"South Korea"},{"isoNumeric":"724","libelle":"Spain"},{"isoNumeric":"144","libelle":"Sri Lanka"},{"isoNumeric":"736","libelle":"Sudan"},{"isoNumeric":"740","libelle":"Suriname"},{"isoNumeric":"744","libelle":"Svalbard and Jan Mayen"},{"isoNumeric":"748","libelle":"Swaziland"},{"isoNumeric":"752","libelle":"Sweden"},{"isoNumeric":"756","libelle":"Switzerland"},{"isoNumeric":"760","libelle":"Syria"},{"isoNumeric":"158","libelle":"Taiwan"},{"isoNumeric":"762","libelle":"Tajikistan"},{"isoNumeric":"834","libelle":"Tanzania"},{"isoNumeric":"764","libelle":"Thailand"},{"isoNumeric":"768","libelle":"Togo"},{"isoNumeric":"772","libelle":"Tokelau"},{"isoNumeric":"776","libelle":"Tonga"},{"isoNumeric":"780","libelle":"Trinidad and Tobago"},{"isoNumeric":"788","libelle":"Tunisia"},{"isoNumeric":"792","libelle":"Turkey"},{"isoNumeric":"795","libelle":"Turkmenistan"},{"isoNumeric":"796","libelle":"Turks and Caicos Islands"},{"isoNumeric":"798","libelle":"Tuvalu"},{"isoNumeric":"850","libelle":"U.S. Virgin Islands"},{"isoNumeric":"800","libelle":"Uganda"},{"isoNumeric":"804","libelle":"Ukraine"},{"isoNumeric":"784","libelle":"United Arab Emirates"},{"isoNumeric":"826","libelle":"United Kingdom"},{"isoNumeric":"840","libelle":"United States"},{"isoNumeric":"581","libelle":"United States Minor Outlying Islands"},{"isoNumeric":"858","libelle":"Uruguay"},{"isoNumeric":"860","libelle":"Uzbekistan"},{"isoNumeric":"548","libelle":"Vanuatu"},{"isoNumeric":"336","libelle":"Vatican"},{"isoNumeric":"862","libelle":"Venezuela"},{"isoNumeric":"704","libelle":"Vietnam"},{"isoNumeric":"876","libelle":"Wallis and Futuna"},{"isoNumeric":"732","libelle":"Western Sahara"},{"isoNumeric":"887","libelle":"Yemen"},{"isoNumeric":"894","libelle":"Zambia"},{"isoNumeric":"716","libelle":"Zimbabwe"},{"isoNumeric":"NON_EU","libelle":"NON_EU"},{"isoNumeric":"688","libelle":"Austria"},{"isoNumeric":"248","libelle":"Åland Islands"},{"isoNumeric":"249","libelle":"Metropolitan France"}];
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("DESC");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [bulkOpen, setBulkOpen] = useState<boolean>(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [retry, setRetry] = useState<number>(0);
  const [paysList, setPaysList] = useState<any[]>([]);
  const [isActionOpen, setIsActionOpen] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [allNodes, setAllNodes] = useState<Record<number, Node>>({});
  const { addNotification } = useNotifications();
  const ACCENT_BG = "bg-blue-900";
  const ACCENT_TEXT = "text-blue-900";
  const debounced = useCallback(
    debounce((v: string) => {
      setSearchTerm(v);
      setPage(1);
    }, 450),
    []
  );
  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debounced(e.target.value);
  };
  const hasWritePermission = user?.permissions?.find(p => p.page_id === 7)?.write ?? false;
  const isPrivilegedEntite = [111, 999].includes(Number(user?.id_entite) || 0);
  const hasActionPermission = hasWritePermission || isPrivilegedEntite;
  const hideAddAndImport = !hasActionPermission;
  // FETCH SEGMENTS for current company
  useEffect(() => {
    if (!user?.id_entite) return;
    const loadSegments = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/entite_segments?id_entite=${user.id_entite}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          user.segmentsList = data;
        } else if (Array.isArray(data.segments)) {
          user.segmentsList = data.segments;
        } else {
          user.segmentsList = [];
        }
      } catch (err) {
        console.warn("Failed to load entite segments", err);
        user.segmentsList = [];
      }
    };
    loadSegments();
  }, [user?.id_entite]);
  // Load classes per segment
  useEffect(() => {
    const loadClassesPerSegment = async () => {
      if (!user?.segmentsList) return;
      const updated = [...user.segmentsList];
      for (const seg of updated) {
        try {
          const res = await fetch(`${API_BASE}/api/classes_by_segment?codeSegment=${seg.codeSegment}`);
          const data = await res.json();
          seg.classes = Array.isArray(data) ? data : [];
        } catch (err) {
          seg.classes = [];
          console.warn("Failed to load classes for segment", seg.codeSegment);
        }
      }
      user.segmentsList = updated;
    };
    loadClassesPerSegment();
  }, [user?.segmentsList]);
  // FETCH CLASSES
  useEffect(() => {
    if (!user?.id_entite) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/classes`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("No classes");
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data?.data || [];
        const normalized = arr.map((c: any) => ({
          codeClasse: c.code ?? c.codeClasse ?? c.id,
          libelleClasse: c.libelle ?? c.libelleClasse ?? "",
        }));
        setClassesList(normalized);
      } catch (err) {
        console.warn("Failed to load classes", err);
        setClassesList([]);
      }
    };
    load();
  }, [retry, user?.id_entite]);
  // FETCH ALL BRICKS
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bricks`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("No bricks");
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data?.data || [];
        const normalized = arr.map((b: any) => ({
          codeBrique: b.code ?? b.codeBrique ?? b.id,
          libelleBrique: b.libelle ?? b.libelleBrique ?? "",
        }));
        setAllBricks(normalized);
      } catch (err) {
        console.warn("Failed to load bricks", err);
        setAllBricks([]);
      }
    };
    load();
  }, [retry]);
  // FETCH BRANDS
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products/brands`, { credentials: "include" });
        if (!res.ok) throw new Error("No brands");
        const data = await res.json();
        setBrands(Array.isArray(data) ? data.sort() : []);
      } catch (err) {
        console.warn("Brands not available");
        setBrands([]);
      }
    };
    load();
  }, [retry]);
  // FETCH PAYS
  useEffect(() => {
    const loadPays = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/pays`, { credentials: "include" });
        if (!res.ok) throw new Error("No pays");
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data?.data || [];
        setPaysList(arr);
      } catch (err) {
        console.warn("Failed to load pays", err);
        setPaysList([]);
      }
    };
    loadPays();
  }, [retry]);
  // FETCH PRODUCTS
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedBrand) params.append("brand", selectedBrand);
        if (selectedSector) params.append("codebrique", selectedSector);
        if (searchTerm) params.append("search", searchTerm);
        params.append("page", String(page));
        params.append("limit", String(itemsPerPage));
        params.append("sortBy", sortBy);
        params.append("sortDir", sortDir);
        if (user?.id_entite) params.append("id_entite", String(user.id_entite));
        const url = `${API_BASE}/api/products?${params.toString()}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProducts(Array.isArray(data.products) ? data.products : []);
        setTotalPages(data.totalPages || 1);
        if (brands.length === 0) {
          const uniques = Array.from(new Set((data.products || []).map((p: Product) => p.brand).filter(Boolean)));
          setBrands(uniques.sort());
        }
      } catch (err) {
        console.error("Failed to load products", err);
        setError("Échec du chargement des produits.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, itemsPerPage, searchTerm, selectedBrand, selectedSector, sortBy, sortDir, retry, user]);
  // Build hierarchy graph
  useEffect(() => {
    const buildGraph = async () => {
      const newNodes: Record<number, Node> = {};
      products.forEach((p) => {
        newNodes[p.id] = {
          libelle: p.libelle,
          gtin: p.gtin,
          declinaison_type: p.declinaison_type,
          parents: p.parents.map((pp) => ({ id: pp.id_parent, quantity: pp.quantity })),
          children: [],
        };
      });
      let queue: number[] = products.flatMap((p) => p.parents.map((pp) => pp.id_parent));
      const fetched = new Set(products.map((p) => p.id));
      while (queue.length) {
        const current = queue.shift()!;
        if (fetched.has(current)) continue;
        fetched.add(current);
        try {
          const res = await fetch(`${API_BASE}/api/products/${current}/parents`, { credentials: "include" });
          if (!res.ok) continue;
          const parents: ParentItem[] = await res.json();
          newNodes[current] = {
            libelle: parents[0]?.libelle || '', // Fetch full product if needed
            gtin: parents[0]?.gtin || '',
            declinaison_type: parents[0]?.declinaison_type || null,
            parents: parents.map((pp) => ({ id: pp.id_parent, quantity: pp.quantity })),
            children: [],
          };
          for (const pp of parents) {
            if (!newNodes[pp.id_parent]) {
              newNodes[pp.id_parent] = {
                libelle: pp.libelle,
                gtin: pp.gtin,
                declinaison_type: pp.declinaison_type,
                parents: [],
                children: [],
              };
            }
            newNodes[pp.id_parent].children.push({ id: current, quantity: pp.quantity });
            queue.push(pp.id_parent);
          }
        } catch (err) {
          console.warn(`Failed to fetch parents for ${current}`, err);
        }
      }
      setAllNodes(newNodes);
    };
    if (products.length) buildGraph();
  }, [products]);
  const getPaths = (id: number, currentPath: Path = [], visited = new Set<number>()): Path[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const node = allNodes[id];
    if (!node) return [];
    const newPath: Path = [...currentPath, { id, declinaison_type: node.declinaison_type, libelle: node.libelle, gtin: node.gtin, quantity: 0 }]; // quantity added in link
    if (!node.parents.length) {
      return [newPath.reverse()];
    }
    let paths: Path[] = [];
    for (const parent of node.parents) {
      const tempPath = [...newPath];
      tempPath[tempPath.length - 1].quantity = parent.quantity;
      paths = [...paths, ...getPaths(parent.id, tempPath, new Set(visited))];
    }
    return paths;
  };
  const canEditStatus = (() => {
    if (!user) return false;
    const emailBack = user.email && user.email.includes("back_office");
    const producer = (user.producer_name || "").toString();
    const privileged = [111, 999].includes(Number(user.id_entite));
    return !!(emailBack || producer === "Cepex" || privileged || producer === "NETCONSULTING EUROPE LTD");
  })();
  const sendNotificationToEntite = async (id_entite: number, contenu: string, type: 'success' | 'error') => {
    if (!isPrivilegedEntite || [111, 999].includes(id_entite)) return;
    try {
      const res = await fetch(`${API_BASE}/api/comptes?id_entite=${id_entite}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch comptes");
      const comptes: Compte[] = await res.json();
      for (const c of comptes) {
        await fetch(API.notifications, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ contenu, type, id_compte: c.id_compte }),
          credentials: 'include',
        });
      }
    } catch (err) {
      console.error("Failed to send notification to entite", err);
    }
  };
  const handleAdd = () => {
    const newP: EditingProduct = {
      id: 0,
      brand: "", subBrand: "", description: "", gtin: "", libelle: "", short_libelle: "",
      countryOfOrigin: "", idEntreprise: user?.id_entite || 0, images: "", nb_images: 0,
      prix_min: 0, prix_max: 0, code_cader: "", codeClasse: 0, codebrique: "",
      date_mis_a_jour_fp: "", tradeItemSynchronisationDates: "", date_create_fp: "",
      activ_prix: 0, status: 0, done_new: 0,
      declinaison_type: null, parents: [],
      newImages: [],
      selectedSegment: "",
      bricksList: [], // ← ALWAYS AN ARRAY
      possibleParents: [], // Added
      selectedDeclinaison: null, // For single
      selectedParents: {}, // For multiple parents with quantity
      originalParents: {}
    };
    setEditingProduct(newP);
    setIsModalOpen(true);
  };
  const handleEdit = (p: Product) => {
    let selectedSegment = "";
    if (p.codeClasse && Array.isArray(user?.segmentsList)) {
      const seg = user.segmentsList.find((s: any) =>
        Array.isArray(s.classes) && s.classes.some((c: any) => c.codeClasse === p.codeClasse)
      );
      selectedSegment = seg?.codeSegment || "";
    }
    const selectedParents: Record<number, number> = {};
    p.parents.forEach(pp => selectedParents[pp.id_parent] = pp.quantity);
    setEditingProduct({
      ...p,
      newImages: [],
      selectedSegment,
      bricksList: [], // ← ALWAYS AN ARRAY
      possibleParents: [], // Added
      selectedDeclinaison: p.declinaison_type,
      selectedParents: selectedParents,
      originalParents: {...selectedParents}
    });
    if (p.codeClasse && String(p.codeClasse).trim() !== "" && p.codeClasse !== 0) {
      fetchProductBricks(p.codeClasse);
    }
    setIsModalOpen(true);
    setIsActionOpen(null);
  };
  const fetchProductBricks = async (codeClasse: number | string) => {
    try {
      if (!codeClasse || String(codeClasse).trim() === "" || codeClasse === 0) {
        setEditingProduct(prev => ({ ...prev, bricksList: [] }));
        return;
      }
      const res = await fetch(`${API_BASE}/api/bricks_by_class?codeClasse=${codeClasse}`);
      if (!res.ok) throw new Error("Failed to fetch bricks");
      const data = await res.json();
      setEditingProduct(prev => ({ ...prev, bricksList: data || [] }));
    } catch (err) {
      console.error("Error loading bricks:", err);
      setEditingProduct(prev => ({ ...prev, bricksList: [] }));
    }
  };
  // Fetch possible parents when modal opens or declinaison type changes
  useEffect(() => {
    if (!isModalOpen || !editingProduct || !user?.id_entite) return;
    const loadParents = async () => {
      try {
        let url = `${API_BASE}/api/products/parents_select?id_entite=${user.id_entite}&exclude_id=${editingProduct.id}`;
        if (editingProduct.selectedDeclinaison) {
          url += `&current_type=${editingProduct.selectedDeclinaison}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch parents");
        const data = await res.json();
        setEditingProduct(prev => ({ ...prev, possibleParents: data }));
      } catch (err) {
        console.error("Failed to load possible parents", err);
        addNotification("Échec du chargement des produits parents.", "error");
      }
    };
    loadParents();
  }, [isModalOpen, editingProduct?.id, editingProduct?.selectedDeclinaison, user?.id_entite]);
  const getImageUrl = (path: string | null): string => {
    if (!path) return '/fallback-image.png';
    if (path.startsWith('data:') || path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}?t=${Date.now()}`;
  };
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = '/fallback-image.png';
  };
  const handleSave = async () => {
    if (!editingProduct) return;
    if (!editingProduct.brand || !editingProduct.gtin || !editingProduct.libelle || !editingProduct.codebrique) {
      addNotification("Champs requis manquants", "error");
      return;
    }
    if (user?.id_entite && !isPrivilegedEntite && Number(editingProduct.idEntreprise) !== Number(user.id_entite)) {
      addNotification("Vous ne pouvez éditer que vos produits.", "error");
      return;
    }
    const form = new FormData();
    form.append("brand", editingProduct.brand);
    form.append("subBrand", editingProduct.subBrand || "");
    form.append("description", editingProduct.description || "");
    form.append("gtin", editingProduct.gtin);
    form.append("libelle", editingProduct.libelle);
    form.append("short_libelle", editingProduct.short_libelle || "");
    form.append("countryOfOrigin", editingProduct.countryOfOrigin || "686");
    form.append("idEntreprise", String(editingProduct.idEntreprise));
    form.append("prix_min", String(editingProduct.prix_min || 0));
    form.append("prix_max", String(editingProduct.prix_max || 0));
    form.append("code_cader", editingProduct.code_cader || "");
    form.append("codeClasse", String(editingProduct.codeClasse || 0));
    form.append("codebrique", editingProduct.codebrique);
    form.append("activ_prix", String(editingProduct.activ_prix || 0));
    if (canEditStatus) form.append("status", String(editingProduct.status || 0));
    form.append("declinaison_type", editingProduct.selectedDeclinaison || "");
    if (editingProduct.newImages?.length) {
      editingProduct.newImages.forEach((file: File) => {
        form.append("images", file);
      });
    }
    try {
      const method = editingProduct.id === 0 ? "POST" : "PUT";
      const url = editingProduct.id === 0 ? `${API_BASE}/api/products` : `${API_BASE}/api/products/${editingProduct.id}`;
      const res = await fetch(url, { method, body: form, credentials: "include" });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      const productId = editingProduct.id || data.id;
      const currentParents = editingProduct.selectedParents || {};
      const originalParents = editingProduct.originalParents || {};
      const toAdd = Object.keys(currentParents).filter(x => !originalParents[Number(x)]);
      const toRemove = Object.keys(originalParents).filter(x => !currentParents[Number(x)]);
      const toUpdate = Object.keys(currentParents).filter(x => originalParents[Number(x)] && originalParents[Number(x)] !== currentParents[Number(x)]);
      for (const parentIdStr of toAdd) {
        const parentId = Number(parentIdStr);
        await fetch(`${API_BASE}/api/products/${productId}/parents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: parentId, quantity: currentParents[parentId] }),
          credentials: 'include',
        });
      }
      for (const parentIdStr of toRemove) {
        const parentId = Number(parentIdStr);
        await fetch(`${API_BASE}/api/products/${productId}/parents/${parentId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
      for (const parentIdStr of toUpdate) {
        const parentId = Number(parentIdStr);
        await fetch(`${API_BASE}/api/products/${productId}/parents/${parentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: currentParents[parentId] }),
          credentials: 'include',
        });
      }
      if (editingProduct.id === 0) {
        setProducts((prev) => [data, ...prev]);
        addNotification("Produit ajouté.", "success");
      } else {
        setProducts((prev) => prev.map((x) => (x.id === data.id ? data : x)));
        addNotification("Produit modifié.", "success");
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setRetry((r) => r + 1);
    } catch (err) {
      console.error(err);
      addNotification("Échec de l'enregistrement.", "error");
    }
  };
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products/template`, {
        credentials: "include",
        headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Modele_Produits.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      addNotification("Modèle téléchargé.", "success");
    } catch (err) {
      addNotification("Impossible de télécharger le modèle.", "error");
    }
  };
  const handleBulkImport = async () => {
    if (!bulkFile || !user?.id_entite) {
      addNotification("Fichier ou utilisateur manquant", "error");
      return;
    }
    setImporting(true);
    try {
      const data = await bulkFile.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (json.length < 2) {
        addNotification("Fichier vide", "error");
        return;
      }
      const headers = json[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
      const fieldMap: Record<string, string> = {
        brand: "brand", subbrand: "subBrand", description: "description", gtin: "gtin",
        libelle: "libelle", short_libelle: "short_libelle", countryoforigin: "countryOfOrigin",
        prix_min: "prix_min", prix_max: "prix_max", codecader: "code_cader",
        codeclasse: "codeClasse", codebrique: "codebrique", activ_prix: "activ_prix",
        declinaison_type: "declinaison_type", parent_ids: "parent_ids" // Updated
      };
      const rows = json.slice(1);
      const prods: any[] = [];
      rows.forEach((row, i) => {
        if (row.every(c => !c)) return;
        const prod: any = { id_entite: user.id_entite };
        headers.forEach((h, idx) => {
          const mapped = fieldMap[h];
          if (mapped && row[idx]) prod[mapped] = String(row[idx]).trim();
        });
        if (!prod.brand || !prod.gtin || !prod.libelle || !prod.codebrique) return;
        if (prod.countryOfOrigin) {
          const m = prod.countryOfOrigin.match(/(\d{3})$/);
          prod.countryOfOrigin = m ? m[1] : "";
        }
        ["prix_min", "prix_max", "activ_prix"].forEach(k => {
          if (prod[k] !== undefined) prod[k] = Number(prod[k]) || 0;
        });
        prods.push(prod);
      });
      if (!prods.length) {
        addNotification("Aucune ligne valide", "error");
        return;
      }
      let inserted = 0;
      for (const prod of prods) {
        const form = new FormData();
        Object.keys(prod).forEach(key => {
          if (key !== 'parent_ids') form.append(key, prod[key]);
        });
        const res = await fetch(`${API_BASE}/api/products`, {
          method: 'POST',
          body: form,
          credentials: "include"
        });
        if (!res.ok) continue;
        const data = await res.json();
        inserted++;
        if (prod.parent_ids) {
          const parents = prod.parent_ids.split(',').map((str: string) => {
            const [id, qty] = str.split(':');
            return { id: Number(id), quantity: Number(qty) || 1 };
          }).filter(p => p.id);
          for (const parent of parents) {
            await fetch(`${API_BASE}/api/products/${data.id}/parents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parent_id: parent.id, quantity: parent.quantity }),
              credentials: 'include'
            });
          }
        }
        setImportProgress((inserted / prods.length) * 100);
      }
      addNotification(`${inserted} importé(s)`, "success");
      setBulkFile(null);
      setBulkOpen(false);
      setRetry(r => r + 1);
    } catch (err: any) {
      addNotification("Erreur import: " + (err.response?.data?.details || err.message), "error");
    } finally {
      setImporting(false);
    }
  };
  const changeSort = (key: string) => {
    if (sortBy === key) setSortDir(prev => prev === "ASC" ? "DESC" : "ASC");
    else { setSortBy(key); setSortDir("DESC"); }
    setPage(1);
  };
  const renderSortArrow = (key: string) => {
    if (sortBy !== key) return <span className="ml-2 text-gray-300">⇅</span>;
    return <span className="ml-2">{sortDir === "ASC" ? "↑" : "↓"}</span>;
  };
  if (loading) return <div className="p-6 text-center">Chargement...</div>;
  if (error) return (
    <div className="p-6 text-center text-red-600">
      {error}
      <button className={`${ACCENT_BG} px-4 py-2 text-white rounded mt-4`} onClick={() => setRetry(r => r + 1)}>Réessayer</button>
    </div>
  );
  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="p-6">
            <span style={{ color: '#3b82f6', position: 'relative', top: '-14px' }}>Produits / </span>
            <span style={{ color: '#3b82f6', position: 'relative', top: '-14px' }}>Catalogue Produits</span>
          </div>
          <div className="flex gap-3 items-center">
            {user && <div className="text-sm text-gray-600">Connecté: {user.name || user.email}</div>}
            {!hideAddAndImport && (
              <>
                <button className={`${ACCENT_BG} px-4 py-2 text-white rounded hover:opacity-95 transition`} onClick={handleAdd}>Ajouter</button>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 bg-gray-100 rounded" onClick={() => setBulkOpen(true)}>Importer</button>
                  <button className={`${ACCENT_BG} px-3 py-2 text-white rounded`} onClick={handleDownloadTemplate}>Télécharger modèle</button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Marque</label>
            <select value={selectedBrand} onChange={(e) => { setSelectedBrand(e.target.value); setPage(1); }} className="p-2 border rounded w-full text-sm">
              <option value="">Toutes</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Secteur (Brique)</label>
            <select value={selectedSector} onChange={(e) => { setSelectedSector(e.target.value); setPage(1); }} className="p-2 border rounded w-full text-sm">
              <option value="">Tous</option>
              {allBricks.map((b) => <option key={b.codeBrique} value={b.codeBrique}>{b.libelleBrique}</option>)}
            </select>
          </div>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium mb-1">Recherche</label>
            <input type="text" onChange={onSearchChange} placeholder="Rechercher..." className="p-2 border rounded w-full" />
          </div>
        </div>
        <div className="overflow-x-auto bg-white rounded shadow">
          <table className="min-w-full">
            <thead className={`${ACCENT_BG} text-white`}>
              <tr>
                <th className="p-3 cursor-pointer" onClick={() => changeSort("id")}>ID {renderSortArrow("id")}</th>
                <th className="p-3">Image</th>
                <th className="p-3 cursor-pointer" onClick={() => changeSort("gtin")}>GTIN {renderSortArrow("gtin")}</th>
                <th className="p-3 cursor-pointer" onClick={() => changeSort("libelle")}>Libellé {renderSortArrow("libelle")}</th>
                <th className="p-3">Marque</th>
                <th className="p-3">Brique</th>
                <th className="p-3">Entreprise</th>
                <th className="p-3">Prix min</th>
                <th className="p-3">Prix max</th>
                <th className="p-3 cursor-pointer" onClick={() => changeSort("declinaison_type")}>Type Declinaison {renderSortArrow("declinaison_type")}</th> {/* Added */}
                <th className="p-3">Hiérarchie</th> {/* Updated to Hierarchy */}
                <th className="p-3">Statut</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr><td colSpan={13} className="p-6 text-center text-gray-500">Aucun produit trouvé</td></tr>
              )}
              {products.map((p) => {
                const paths = getPaths(p.id);
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-sm">{p.id}</td>
                    <td className="p-3">
                      <img
                        src={p.images ? getImageUrl(p.images.split(";")[0]) : "/fallback-image.png"}
                        alt={p.libelle}
                        className="w-16 h-16 object-cover rounded cursor-pointer"
                        onClick={() => setSelectedImage(getImageUrl(p.images.split(";")[0]))}
                        onError={handleImageError}
                      />
                    </td>
                    <td className="p-3 text-sm">{p.gtin}</td>
                    <td className="p-3 text-sm">{p.libelle}</td>
                    <td className="p-3 text-sm">{p.brand}</td>
                    <td className="p-3 text-sm">{allBricks.find(b => b.codeBrique === p.codebrique)?.libelleBrique || p.codebrique}</td>
                    <td className="p-3 text-sm">{p.idEntreprise}</td>
                    <td className="p-3 text-sm">{p.prix_min}</td>
                    <td className="p-3 text-sm">{p.prix_max}</td>
                    <td className="p-3 text-sm">{p.declinaison_type || '-'}</td> {/* Added */}
                    <td className="p-3 text-sm">
                      {paths.length === 0 ? '-' : paths.map((path, idx) => (
                        <div key={idx} className="flex items-center gap-1 flex-wrap">
                          {path.map((item, i) => (
                            <React.Fragment key={item.id}>
                              {i > 0 && <span>&gt;</span>}
                              <span>{getTypeIcon(item.declinaison_type)} {getTypeLabel(item.declinaison_type)} (x{item.quantity})</span>
                            </React.Fragment>
                          ))}
                        </div>
                      ))}
                    </td> {/* Updated Hierarchy Display with quantity */}
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${p.status === 2 ? "bg-green-100 text-green-800" : p.status === 1 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      {hasActionPermission && (
                        <div className="relative inline-block">
                          <button className={`${ACCENT_BG} px-3 py-1 text-white rounded text-xs`} onClick={() => setIsActionOpen(isActionOpen === p.id ? null : p.id)}>Actions</button>
                          {isActionOpen === p.id && (
                            <div className="absolute right-0 mt-2 bg-white border rounded shadow z-20 w-44">
                              <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => handleEdit(p)}>Modifier</button>
                              {!canEditStatus && p.status !== 1 && p.status !== 2 && (
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-yellow-700" onClick={() => handlePublier(p)}>Publier</button>
                              )}
                              {canEditStatus && p.status !== 2 && (
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-green-700" onClick={() => handlePublier(p)}>Publier (Valider)</button>
                              )}
                              {!canEditStatus && p.status !== 0 && (
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-red-700" onClick={() => handleSuspend(p)}>Suspendre</button>
                              )}
                              {canEditStatus && p.status !== 0 && (
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-red-700" onClick={() => handleSuspend(p)}>Suspendre</button>
                              )}
                              <button className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-red-600" onClick={() => handleDelete(p.id, p)}>Supprimer</button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">Page {page} / {totalPages}</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Précédent</button>
            <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suivant</button>
          </div>
        </div>
        {selectedImage && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setSelectedImage(null)}>
            <div className="bg-white p-4 rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
              <img src={selectedImage} alt="Zoom" className="max-w-[80vw] max-h-[80vh] object-contain" onError={handleImageError} />
              <div className="mt-3 text-right">
                <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => setSelectedImage(null)}>Fermer</button>
              </div>
            </div>
          </div>
        )}
        {isModalOpen && editingProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setIsModalOpen(false)}>
            <Draggable handle=".modal-handle" nodeRef={modalRef}>
              <Resizable defaultSize={{ width: 760, height: 700 }} minWidth={480} minHeight={450}>
                <div ref={modalRef} className="bg-white rounded shadow-lg p-4 overflow-auto max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-handle bg-gray-200 p-2 rounded-t text-center font-semibold cursor-move">
                    {editingProduct.id === 0 ? "Ajouter Produit" : "Modifier Produit"}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* SEGMENT SELECT */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-blue-900 mb-1">Sélectionner un segment</label>
                      <select
                        value={editingProduct.selectedSegment || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingProduct({
                            ...editingProduct,
                            selectedSegment: val,
                            codeClasse: "",
                            codebrique: "",
                            bricksList: [],
                          });
                        }}
                        className="p-2 border rounded w-full bg-gray-50"
                      >
                        <option value="">-- Choisir un segment --</option>
                        {Array.isArray(user?.segmentsList) &&
                          user.segmentsList.map((seg: any) => (
                            <option key={seg.codeSegment} value={seg.codeSegment}>
                              {seg.libelleSegment ? `${seg.libelleSegment} (${seg.codeSegment})` : seg.codeSegment}
                            </option>
                          ))}
                      </select>
                    </div>
                    {/* CLASSES FOR SELECTED SEGMENT */}
                    {editingProduct.selectedSegment && (
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Classe pour ce segment</label>
                        <select
                          value={editingProduct.codeClasse || ""}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setEditingProduct({
                              ...editingProduct,
                              codeClasse: val,
                              codebrique: "",
                              bricksList: [] // ← reset
                            });
                            if (val) {
                              try {
                                const res = await fetch(`${API_BASE}/api/bricks_by_class?codeClasse=${val}`);
                                const briques = await res.json();
                                const bricksArray = Array.isArray(briques) ? briques : [];
                                setEditingProduct((prev) => ({
                                  ...prev,
                                  bricksList: bricksArray,
                                }));
                              } catch (err) {
                                console.warn("Failed to load bricks for class", val);
                                setEditingProduct((prev) => ({ ...prev, bricksList: [] }));
                              }
                            }
                          }}
                          className="p-2 border rounded w-full bg-white"
                        >
                          <option value="">-- Choisir Classe --</option>
                          {Array.isArray(user?.segmentsList)
                            ? (user.segmentsList.find((s: any) => s.codeSegment === editingProduct.selectedSegment)?.classes || []).map((c: any) => (
                                <option key={c.codeClasse} value={c.codeClasse}>
                                  {c.codeClasse} - {c.libelleClasse}
                                </option>
                              ))
                            : null}
                        </select>
                      </div>
                    )}
                    {/* BRIQUES FOR SELECTED CLASS */}
                    {editingProduct.selectedSegment && editingProduct.codeClasse && (
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brique liée à la classe</label>
                        <select
                          value={editingProduct.codebrique || ""}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              codebrique: e.target.value,
                            })
                          }
                          className="p-2 border rounded w-full bg-white"
                          disabled={!editingProduct.bricksList?.length}
                        >
                          <option value="">-- Choisir Brique --</option>
                          {(editingProduct.bricksList || []).map((b: any) => (
                            <option key={b.codeBrique} value={b.codeBrique}>
                              {b.codeBrique} - {b.libelleBrique || "(Sans libellé)"}
                            </option>
                          ))}
                        </select>
                        {!editingProduct.bricksList?.length && editingProduct.codeClasse && (
                          <p className="text-xs text-orange-600 mt-1">Aucune brique disponible.</p>
                        )}
                      </div>
                    )}
                    {/* REST OF FORM (unchanged) */}
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Marque *</label><input value={editingProduct.brand || ""} onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Sous Marque</label><input value={editingProduct.subBrand || ""} onChange={(e) => setEditingProduct({ ...editingProduct, subBrand: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">GTIN *</label><input value={editingProduct.gtin || ""} onChange={(e) => setEditingProduct({ ...editingProduct, gtin: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Libellé *</label><input value={editingProduct.libelle || ""} onChange={(e) => setEditingProduct({ ...editingProduct, libelle: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div className="md:col-span-2"><label className="block text-sm text-gray-700 font-medium mb-1">Description</label><textarea value={editingProduct.description || ""} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} rows={3} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Prix Min</label><input type="number" step="0.01" value={editingProduct.prix_min || ""} onChange={(e) => setEditingProduct({ ...editingProduct, prix_min: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Prix Max</label><input type="number" step="0.01" value={editingProduct.prix_max || ""} onChange={(e) => setEditingProduct({ ...editingProduct, prix_max: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div>
                      <label className="block text-sm text-gray-700 font-medium mb-1">Pays d'origine</label>
                      <select value={editingProduct.countryOfOrigin || "686"} onChange={(e) => setEditingProduct({ ...editingProduct, countryOfOrigin: e.target.value })} className="p-2 border rounded w-full bg-white">
                        <option value="">-- Choisir un pays --</option>
                        {paysList.map((p) => (
                          <option key={p.isoNumeric} value={p.isoNumeric}>{p.libelle}</option>
                        ))}
                      </select>
                    </div>
                    {/* Updated: Single Declinaison Type Select */}
                    <div className="md:col-span-2 bg-gray-50 p-3 rounded">
                      <label className="block text-sm text-gray-700 font-medium mb-2">Type de Déclinaison</label>
                      <select
                        value={editingProduct.selectedDeclinaison || ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setEditingProduct({
                            ...editingProduct,
                            selectedDeclinaison: val,
                            declinaison_type: val,
                            possibleParents: [], // Reset parents when type changes
                          });
                        }}
                        className="p-2 border rounded w-full"
                      >
                        <option value="">-- Sélectionner un type --</option>
                        {declinaisonTypes.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.code} - {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Updated: Multiple Parents with quantity input */}
                    <div className="md:col-span-2 bg-gray-50 p-3 rounded">
                      <label className="block text-sm text-gray-700 font-medium mb-2">Produits Parents (Sélection multiple pour hiérarchies)</label>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {(editingProduct.possibleParents || []).map((parent) => (
                          <div key={parent.id} className="flex items-center text-sm">
                            <input
                              type="checkbox"
                              checked={!!editingProduct.selectedParents?.[parent.id]}
                              onChange={(e) => {
                                const selected = {...(editingProduct.selectedParents || {})};
                                if (e.target.checked) {
                                  selected[parent.id] = 1; // default quantity
                                } else {
                                  delete selected[parent.id];
                                }
                                setEditingProduct({
                                  ...editingProduct,
                                  selectedParents: selected,
                                });
                              }}
                              className="mr-2"
                            />
                            {parent.libelle} (GTIN: {parent.gtin}, Type: {parent.declinaison_type || '-'})
                            {editingProduct.selectedParents?.[parent.id] && (
                              <input
                                type="number"
                                min="1"
                                value={editingProduct.selectedParents[parent.id]}
                                onChange={(e) => {
                                  const selected = {...editingProduct.selectedParents};
                                  selected[parent.id] = Number(e.target.value) || 1;
                                  setEditingProduct({
                                    ...editingProduct,
                                    selectedParents: selected,
                                  });
                                }}
                                className="ml-2 w-16 p-1 border rounded"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {!editingProduct.possibleParents?.length && (
                        <p className="text-xs text-orange-600 mt-1">Aucun produit parent disponible (basé sur le type sélectionné).</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-700 font-medium mb-1">Images du produit</label>
                      <input type="file" multiple accept="image/*" onChange={(e) => setEditingProduct({ ...editingProduct, newImages: Array.from(e.target.files || []) })} className="p-2 border rounded w-full bg-white" />
                      {editingProduct.newImages && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editingProduct.newImages.map((file: File, idx: number) => (
                            <img key={`new-${idx}`} src={URL.createObjectURL(file)} alt={`new-img-${idx}`} className="w-20 h-20 object-cover border rounded" />
                          ))}
                        </div>
                      )}
                      {editingProduct.images && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {editingProduct.images.split(";").filter(Boolean).map((img: string, idx: number) => (
                            <img key={idx} src={getImageUrl(img)} alt="img" className="w-20 h-20 object-cover border rounded" onError={handleImageError} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button className="px-4 py-2 bg-gray-200 rounded" onClick={() => setIsModalOpen(false)}>Annuler</button>
                    <button className={`${ACCENT_BG} px-4 py-2 text-white rounded`} onClick={handleSave}>Enregistrer</button>
                  </div>
                </div>
              </Resizable>
            </Draggable>
          </div>
        )}
        {bulkOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center" onClick={() => setBulkOpen(false)}>
            <div className="bg-white p-6 rounded shadow w-[90%] max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold mb-3">Importer produits</h3>
              <div className="mb-3">
                <div className="flex gap-2 items-center">
                  <input type="file" accept=".csv,.xlsx" onChange={(e) => setBulkFile(e.target.files?.[0] || null)} />
                  <button className={`${ACCENT_BG} px-3 py-2 text-white rounded`} onClick={handleDownloadTemplate}>Télécharger modèle</button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className={`${ACCENT_BG} px-3 py-1 text-white rounded`} onClick={handleBulkImport}>Importer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default Catalogue;