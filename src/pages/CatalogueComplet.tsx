import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import Draggable from "react-draggable";
import { Resizable } from "re-resizable";
import debounce from "lodash/debounce";
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from "xlsx";
import axios from "axios";
import { useLocalApiUrl } from "../contexts/SettingsContext";
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

// ============================================================================
// HIERARCHY OPTIONS - Unité Logistique
// ============================================================================
const HIERARCHY_OPTIONS = {
  PK: { code: "PK", label: "PK - Lot Consommateur Homogène", fields: ["gtin_d", "childTradeItem", "quantityofNextLowerLevelTradeItem", "quantityOfCompleteLayersContainedInATradeItem", "quantityOfTradeItemsContainedInACompleteLayer", "isTradeItemADespatchUnit", "isTradeItemAnInvoiceUnit", "isTradeItemAnOrderableUnit", "isTradeItemAModel", "isTradeItemADivisibleItem", "hasDisplayReadyPackaging", "isTradeItemPackedIrregularly", "compositionDepthValue", "compositionWidthValue", "alimentaryProduct", "TradeItemDisplayDimensions", "contactGLN", "orderingUnitOfMeasure", "invoicingUnitOfMeasure", "packageMarksDietAllergen", "cataloguePriceBasisQuantity", "cataloguePriceBasisUnitOfMeasure", "tradeItemWeight", "tradeItemVolume", "packagingMaterial", "stackingFactor", "maxStackingWeight", "palletLayerQuantity", "type_emballage", "palletTypeCode"] },
  AP: { code: "AP", label: "AP - Lot Consommateur Hétérogène", fields: ["unite_logistique_ap", "unite_facturable_ap", "unite_commandable_ap", "isTradeItemAModel_ap", "isTradeItemADivisibleItem_ap", "hasDisplayReadyPackaging_ap", "isTradeItemPackedIrregularly_ap", "compositionDepthValue_ap", "compositionWidthValue_ap", "alimentaryProduct_ap", "TradeItemDisplayDimensions_ap", "contactGLN_ap", "orderingUnitOfMeasure_ap", "invoicingUnitOfMeasure_ap", "gtin_d_ap", "childTradeItem_ap", "quantityofNextLowerLevelTradeItem_ap", "packageMarksDietAllergen_ap", "tradeItemWeight_ap", "tradeItemVolume_ap", "packagingMaterial_ap", "stackingFactor_ap", "type_emballage", "palletTypeCode"] },
  CA: { code: "CA", label: "CA - Colis Homogène", fields: ["gtin_d_ca", "childTradeItem_ca", "quantityofNextLowerLevelTradeItem_ca", "packagingTypeCode", "palletTypeCode", "quantityOfCompleteLayersContainedInATradeItem_ca", "quantityOfTradeItemsContainedInACompleteLayer_ca", "isTradeItemAConsumerUnit", "unite_facturable_ca", "unite_commandable_ca", "isTradeItemAFullDisplayStand", "hasDisplayReadyPackaging_ca", "isTradeItemPackedIrregularly_ca", "compositionDepthValue_ca", "compositionWidthValue_ca", "alimentaryProduct_ca", "contactGLN_ca", "orderingUnitOfMeasure_ca", "invoicingUnitOfMeasure_ca", "tradeItemWeight_ca", "tradeItemVolume_ca", "packagingMaterial_ca", "maxStackingWeight_ca", "palletLayerQuantity_ca", "type_emballage"] },
  DS: { code: "DS", label: "DS - Colis Hétérogène", fields: ["quantityofNextLowerLevelTradeItem_ds", "packagingTypeCode", "palletTypeCode", "quantityOfCompleteLayersContainedInATradeItem_ds", "quantityOfTradeItemsContainedInACompleteLayer_ds", "unite_facturable_ds", "isTradeItemAFullDisplayStand_ds", "hasDisplayReadyPackaging_ds", "isTradeItemPackedIrregularly_ds", "compositionDepthValue_ds", "compositionWidthValue_ds", "contactGLN_ds", "orderingUnitOfMeasure_ds", "invoicingUnitOfMeasure_ds", "tradeItemWeight_ds", "tradeItemVolume_ds", "packagingMaterial_ds", "maxStackingWeight_ds", "palletLayerQuantity_ds", "type_emballage"] },
  PL: { code: "PL", label: "PL - Palette Homogène", fields: ["gtin_d_pl", "childTradeItem_pl", "quantityofNextLowerLevelTradeItem_pl", "quantityOfCompleteLayersContainedInATradeItem_pl", "quantityOfTradeItemsContainedInACompleteLayer_pl", "isTradeItemAnInvoiceUnit_pl", "isTradeItemAnOrderableUnit_pl", "isTradeItemAFullDisplayStand_pl", "hasDisplayReadyPackaging_pl", "isTradeItemPackedIrregularly_pl", "compositionDepthValue_pl", "compositionWidthValue_pl", "contactGLN_pl", "orderingUnitOfMeasure_pl", "invoicingUnitOfMeasure_pl", "palletTypeCode", "palletLayerQuantity_pl", "tradeItemWeight_pl", "tradeItemVolume_pl", "packagingMaterial_pl", "maxStackingWeight_pl", "stackingFactor_pl", "palletDimensions_pl", "type_emballage"] },
  MX: { code: "MX", label: "MX - Palette Hétérogène", fields: ["gtin_d_mx", "childTradeItem1", "quantityofNextLowerLevelTradeItem1", "childTradeItem2", "quantityofNextLowerLevelTradeItem2", "childTradeItem3", "quantityofNextLowerLevelTradeItem3", "childTradeItem4", "quantityofNextLowerLevelTradeItem4", "quantityOfCompleteLayersContainedInATradeItem_mx", "quantityOfTradeItemsContainedInACompleteLayer_mx", "isTradeItemAnInvoiceUnit_mx", "isTradeItemAFullDisplayStand_mx", "hasDisplayReadyPackaging_mx", "isTradeItemPackedIrregularly_mx", "compositionDepthValue_mx", "compositionWidthValue_mx", "contactGLN_mx", "orderingUnitOfMeasure_mx", "invoicingUnitOfMeasure_mx", "palletTypeCode", "palletLayerQuantity_mx", "tradeItemWeight_mx", "tradeItemVolume_mx", "packagingMaterial_mx", "maxStackingWeight_mx", "stackingFactor_mx", "palletDimensions_mx", "type_emballage"] }
};

const BASE_FIELDS = ["brand", "subBrand", "description", "gtin", "libelle", "short_libelle", "countryOfOrigin", "prix_min", "prix_max", "code_cader", "codeClasse", "codebrique", "activ_prix"];
export const NotificationProvider: React.FC<{ children: React.ReactNode; compteId: number | null }> = ({ children, compteId }) => {
  const API_BASE = useLocalApiUrl();
  const API = useMemo(() => ({
    notifications: `${API_BASE}/api/notifications`,
    markRead: (id: number) => `${API_BASE}/api/notifications/${id}/read`,
    delete: (id: number) => `${API_BASE}/api/notifications/${id}`,
    clear: `${API_BASE}/api/notifications/clear`,
    entiteSegments: `${API_BASE}/api/entite_segments`,
    segmentsAll: `${API_BASE}/api/segments`,
    classesBySegment: `${API_BASE}/api/classes_by_segment`,
    famillesBySegment: `${API_BASE}/api/familles_by_segment`,
    classesByFamille: `${API_BASE}/api/classes_by_famille`,
    bricksByClass: `${API_BASE}/api/bricks_by_class`,
    modelByBrick: `${API_BASE}/api/model_by_brick`,
    rayonsByBrick: `${API_BASE}/api/rayongpc`,
    modelByRayon: `${API_BASE}/api/model_by_rayon`,
    templateDownload: `${API_BASE}/api/products/template-advanced`,
  }), [API_BASE]);
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
      console.error(`Erreur de récupération des notifications:`, err);
      setError(`Échec du chargement des notifications. Veuillez réessayer plus tard.`);
      setNotifications([]);
    }
  }, [compteId, retryCount]);
  useEffect(() => {
    // Don't fetch old notifications on mount - only show new ones created during this session
    if (!compteId) {
      setNotifications([]);
      setError(null);
    }
  }, [compteId]);
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
      setTimeout(async () => {
        await deleteNotification(newNotification.id_notification);
      }, 5000);
    } catch (err) {
      console.error(`Erreur lors de l'ajout de la notification:`, err);
      setError(`Échec de l'ajout de la notification.`);
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
      console.error(`Erreur lors du marquage comme lu:`, err);
      setError(`Échec du marquage de la notification comme lue.`);
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
      console.error(`Erreur lors de la suppression de la notification:`, err);
      setError(`Échec de la suppression de la notification.`);
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
      console.error(`Erreur lors du vidage des notifications:`, err);
      setError(`Échec du vidage des notifications.`);
      await fetchNotifications();
    }
  }
  return (
  <NotificationContext.Provider value={{ notifications, addNotification, markAsRead, deleteNotification, clearNotifications }}>
      <div className="relative min-h-screen bg-slate-50">
        {children}
        <div className="fixed top-6 right-6 z-[100] flex flex-col-reverse gap-3 max-w-sm">
          <AnimatePresence mode="popLayout">
            {notifications.map((notification) => (
              <motion.div
                key={notification.id_notification}
                initial={{ opacity: 0, x: 80, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.95 }}
                className={`p-4 rounded-2xl shadow-2xl text-sm flex gap-4 items-start backdrop-blur-lg border ${
                  notification.type === 'success' 
                    ? 'bg-emerald-600 border-emerald-500 text-white' 
                    : 'bg-red-600 border-red-500 text-white'
                }`}
              >
                <span className="flex-1">{notification.contenu}</span>
                <button
                  onClick={() => deleteNotification(notification.id_notification)}
                  className="text-xl font-bold opacity-75 hover:opacity-100 transition"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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
  declinaison_count?: number;
  declinaison_type: string | null;
  parents: ParentItem[]; // Integrated from declinaison table
  // Mobile-showcase highlight request state — joined in by GET /api/products.
  // null/undefined = never requested.
  highlight_status?: 'pending' | 'approved' | 'rejected' | null;
  highlight_id?: number | null;
}
interface HighlightRequest {
  id: number;
  id_produit: number;
  id_entite: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: number | null;
  requested_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  gtin: string;
  brand: string;
  libelle: string;
  images: string;
  countryOfOrigin: string;
  entite_name: string | null;
  requested_by_email: string | null;
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
const FRENCH_FIELD_LABELS: Record<string, string> = {
  gtin_d: "GTIN enfant",
  childTradeItem: "Article enfant",
  quantityofNextLowerLevelTradeItem: "Quantité niveau inférieur",
  quantityOfCompleteLayersContainedInATradeItem: "Quantité de couches complètes",
  quantityOfTradeItemsContainedInACompleteLayer: "Quantité d'articles par couche",
  isTradeItemADespatchUnit: "Est une unité d'expédition",
  isTradeItemAnInvoiceUnit: "Est une unité de facturation",
  isTradeItemAnOrderableUnit: "Est une unité commandable",
  isTradeItemAModel: "Est un modèle",
  isTradeItemADivisibleItem: "Est un article divisible",
  hasDisplayReadyPackaging: "A un emballage prêt à l'exposition",
  isTradeItemPackedIrregularly: "Est emballé irrégulièrement",
  compositionDepthValue: "Valeur profondeur composition",
  compositionWidthValue: "Valeur largeur composition",
  alimentaryProduct: "Produit alimentaire",
  TradeItemDisplayDimensions: "Dimensions d'affichage article",
  contactGLN: "GLN contact",
  orderingUnitOfMeasure: "Unité mesure commande",
  invoicingUnitOfMeasure: "Unité mesure facturation",
  packageMarksDietAllergen: "Marques emballage régime/allergènes",
  cataloguePriceBasisQuantity: "Quantité base prix catalogue",
  cataloguePriceBasisUnitOfMeasure: "Unité mesure prix catalogue",
  tradeItemWeight: "Poids article",
  tradeItemVolume: "Volume article",
  packagingMaterial: "Matériau emballage",
  stackingFactor: "Facteur empilage",
  maxStackingWeight: "Poids max empilage",
  palletLayerQuantity: "Quantité couches palette",
  type_emballage: "Type emballage",
  palletTypeCode: "Code type palette",
  unite_logistique_ap: "Unité logistique AP",
  unite_facturable_ap: "Unité facturable AP",
  unite_commandable_ap: "Unité commandable AP",
  isTradeItemAModel_ap: "Est un modèle AP",
  isTradeItemADivisibleItem_ap: "Est divisible AP",
  hasDisplayReadyPackaging_ap: "Prêt à l'exposition AP",
  isTradeItemPackedIrregularly_ap: "Emballé irrégulièrement AP",
  compositionDepthValue_ap: "Profondeur composition AP",
  compositionWidthValue_ap: "Largeur composition AP",
  alimentaryProduct_ap: "Produit alimentaire AP",
  TradeItemDisplayDimensions_ap: "Dimensions affichage AP",
  contactGLN_ap: "GLN contact AP",
  orderingUnitOfMeasure_ap: "Unité commande AP",
  invoicingUnitOfMeasure_ap: "Unité facturation AP",
  gtin_d_ap: "GTIN enfant AP",
  childTradeItem_ap: "Article enfant AP",
  quantityofNextLowerLevelTradeItem_ap: "Quantité niveau inférieur AP",
  packageMarksDietAllergen_ap: "Marques régime/allergènes AP",
  tradeItemWeight_ap: "Poids article AP",
  tradeItemVolume_ap: "Volume article AP",
  packagingMaterial_ap: "Matériau emballage AP",
  stackingFactor_ap: "Facteur empilage AP",
  gtin_d_ca: "GTIN enfant CA",
  childTradeItem_ca: "Article enfant CA",
  quantityofNextLowerLevelTradeItem_ca: "Quantité niveau inférieur CA",
  packagingTypeCode: "Code type emballage",
  quantityOfCompleteLayersContainedInATradeItem_ca: "Quantité couches complètes CA",
  quantityOfTradeItemsContainedInACompleteLayer_ca: "Quantité articles par couche CA",
  isTradeItemAConsumerUnit: "Est une unité consommateur",
  unite_facturable_ca: "Unité facturable CA",
  unite_commandable_ca: "Unité commandable CA",
  isTradeItemAFullDisplayStand: "Est un présentoir complet",
  hasDisplayReadyPackaging_ca: "Prêt à l'exposition CA",
  isTradeItemPackedIrregularly_ca: "Emballé irrégulièrement CA",
  compositionDepthValue_ca: "Profondeur composition CA",
  compositionWidthValue_ca: "Largeur composition CA",
  alimentaryProduct_ca: "Produit alimentaire CA",
  contactGLN_ca: "GLN contact CA",
  orderingUnitOfMeasure_ca: "Unité commande CA",
  invoicingUnitOfMeasure_ca: "Unité facturation CA",
  tradeItemWeight_ca: "Poids article CA",
  tradeItemVolume_ca: "Volume article CA",
  packagingMaterial_ca: "Matériau emballage CA",
  maxStackingWeight_ca: "Poids max empilage CA",
  palletLayerQuantity_ca: "Quantité couches palette CA",
  quantityofNextLowerLevelTradeItem_ds: "Quantité niveau inférieur DS",
  quantityOfCompleteLayersContainedInATradeItem_ds: "Quantité couches complètes DS",
  quantityOfTradeItemsContainedInACompleteLayer_ds: "Quantité articles par couche DS",
  unite_facturable_ds: "Unité facturable DS",
  isTradeItemAFullDisplayStand_ds: "Est un présentoir complet DS",
  hasDisplayReadyPackaging_ds: "Prêt à l'exposition DS",
  isTradeItemPackedIrregularly_ds: "Emballé irrégulièrement DS",
  compositionDepthValue_ds: "Profondeur composition DS",
  compositionWidthValue_ds: "Largeur composition DS",
  contactGLN_ds: "GLN contact DS",
  orderingUnitOfMeasure_ds: "Unité commande DS",
  invoicingUnitOfMeasure_ds: "Unité facturation DS",
  tradeItemWeight_ds: "Poids article DS",
  tradeItemVolume_ds: "Volume article DS",
  packagingMaterial_ds: "Matériau emballage DS",
  maxStackingWeight_ds: "Poids max empilage DS",
  palletLayerQuantity_ds: "Quantité couches palette DS",
  gtin_d_pl: "GTIN enfant PL",
  childTradeItem_pl: "Article enfant PL",
  quantityofNextLowerLevelTradeItem_pl: "Quantité niveau inférieur PL",
  quantityOfCompleteLayersContainedInATradeItem_pl: "Quantité couches complètes PL",
  quantityOfTradeItemsContainedInACompleteLayer_pl: "Quantité articles par couche PL",
  isTradeItemAnInvoiceUnit_pl: "Est unité facturation PL",
  isTradeItemAnOrderableUnit_pl: "Est unité commandable PL",
  isTradeItemAFullDisplayStand_pl: "Est présentoir complet PL",
  hasDisplayReadyPackaging_pl: "Prêt à l'exposition PL",
  isTradeItemPackedIrregularly_pl: "Emballé irrégulièrement PL",
  compositionDepthValue_pl: "Profondeur composition PL",
  compositionWidthValue_pl: "Largeur composition PL",
  contactGLN_pl: "GLN contact PL",
  orderingUnitOfMeasure_pl: "Unité commande PL",
  invoicingUnitOfMeasure_pl: "Unité facturation PL",
  palletLayerQuantity_pl: "Quantité couches palette PL",
  tradeItemWeight_pl: "Poids article PL",
  tradeItemVolume_pl: "Volume article PL",
  packagingMaterial_pl: "Matériau emballage PL",
  maxStackingWeight_pl: "Poids max empilage PL",
  stackingFactor_pl: "Facteur empilage PL",
  palletDimensions_pl: "Dimensions palette PL",
  gtin_d_mx: "GTIN enfant MX",
  childTradeItem1: "Article enfant 1",
  quantityofNextLowerLevelTradeItem1: "Quantité niveau inférieur 1",
  childTradeItem2: "Article enfant 2",
  quantityofNextLowerLevelTradeItem2: "Quantité niveau inférieur 2",
  childTradeItem3: "Article enfant 3",
  quantityofNextLowerLevelTradeItem3: "Quantité niveau inférieur 3",
  childTradeItem4: "Article enfant 4",
  quantityofNextLowerLevelTradeItem4: "Quantité niveau inférieur 4",
  quantityOfCompleteLayersContainedInATradeItem_mx: "Quantité couches complètes MX",
  quantityOfTradeItemsContainedInACompleteLayer_mx: "Quantité articles par couche MX",
  isTradeItemAnInvoiceUnit_mx: "Est unité facturation MX",
  isTradeItemAFullDisplayStand_mx: "Est présentoir complet MX",
  hasDisplayReadyPackaging_mx: "Prêt à l'exposition MX",
  isTradeItemPackedIrregularly_mx: "Emballé irrégulièrement MX",
  compositionDepthValue_mx: "Profondeur composition MX",
  compositionWidthValue_mx: "Largeur composition MX",
  contactGLN_mx: "GLN contact MX",
  orderingUnitOfMeasure_mx: "Unité commande MX",
  invoicingUnitOfMeasure_mx: "Unité facturation MX",
  palletLayerQuantity_mx: "Quantité couches palette MX",
  tradeItemWeight_mx: "Poids article MX",
  tradeItemVolume_mx: "Volume article MX",
  packagingMaterial_mx: "Matériau emballage MX",
  maxStackingWeight_mx: "Poids max empilage MX",
  stackingFactor_mx: "Facteur empilage MX",
  palletDimensions_mx: "Dimensions palette MX"
};
const CatalogueComplet: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const raw1 = localStorage.getItem("currentUser");
    const raw2 = localStorage.getItem("user");
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
  const API_BASE = useLocalApiUrl();
  const API = useMemo(() => ({
    notifications: `${API_BASE}/api/notifications`,
    markRead: (id: number) => `${API_BASE}/api/notifications/${id}/read`,
    delete: (id: number) => `${API_BASE}/api/notifications/${id}`,
    clear: `${API_BASE}/api/notifications/clear`,
    entiteSegments: `${API_BASE}/api/entite_segments`,
    segmentsAll: `${API_BASE}/api/segments`,
    classesBySegment: `${API_BASE}/api/classes_by_segment`,
    famillesBySegment: `${API_BASE}/api/familles_by_segment`,
    classesByFamille: `${API_BASE}/api/classes_by_famille`,
    bricksByClass: `${API_BASE}/api/bricks_by_class`,
    modelByBrick: `${API_BASE}/api/model_by_brick`,
    rayonsByBrick: `${API_BASE}/api/rayongpc`,
    modelByRayon: `${API_BASE}/api/model_by_rayon`,
    templateDownload: `${API_BASE}/api/products/template-advanced`,
    // Mobile-showcase "highlight" mechanism (products the entity wants featured
    // on the mobile app's home screen, pending platform-admin approval).
    highlightRequest: (id: number) => `${API_BASE}/api/products/${id}/highlight-request`,
    highlightRequestsList: `${API_BASE}/api/products/highlight-requests`,
    highlightApprove: (id: number) => `${API_BASE}/api/products/highlight-requests/${id}/approve`,
    highlightReject: (id: number) => `${API_BASE}/api/products/highlight-requests/${id}/reject`,
  }), [API_BASE]);
  const [products, setProducts] = useState<Product[]>([]);
  const [classesList, setClassesList] = useState<ClassItem[]>([]);
  const [allBricks, setAllBricks] = useState<BrickItem[]>([]);
  const [bricksList, setBricksList] = useState<BrickItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [entitiesMap, setEntitiesMap] = useState<Record<number, string>>({});
  const countries: CountryItem[] = [{"isoNumeric":"004","libelle":"Afghanistan"},{"isoNumeric":"008","libelle":"Albania"},{"isoNumeric":"012","libelle":"Algeria"},{"isoNumeric":"016","libelle":"American Samoa"},{"isoNumeric":"020","libelle":"Andorra"},{"isoNumeric":"024","libelle":"Angola"},{"isoNumeric":"660","libelle":"Anguilla"},{"isoNumeric":"010","libelle":"Antarctica"},{"isoNumeric":"028","libelle":"Antigua and Barbuda"},{"isoNumeric":"032","libelle":"Argentina"},{"isoNumeric":"051","libelle":"Armenia"},{"isoNumeric":"533","libelle":"Aruba"},{"isoNumeric":"036","libelle":"Australia"},{"isoNumeric":"040","libelle":"Austria"},{"isoNumeric":"031","libelle":"Azerbaijan"},{"isoNumeric":"044","libelle":"Bahamas"},{"isoNumeric":"048","libelle":"Bahrain"},{"isoNumeric":"050","libelle":"Bangladesh"},{"isoNumeric":"052","libelle":"Barbados"},{"isoNumeric":"112","libelle":"Belarus"},{"isoNumeric":"056","libelle":"Belgium"},{"isoNumeric":"084","libelle":"Belize"},{"isoNumeric":"204","libelle":"Benin"},{"isoNumeric":"060","libelle":"Bermuda"},{"isoNumeric":"064","libelle":"Bhutan"},{"isoNumeric":"068","libelle":"Bolivia"},{"isoNumeric":"070","libelle":"Bosnia and Herzegovina"},{"isoNumeric":"072","libelle":"Botswana"},{"isoNumeric":"074","libelle":"Bouvet Island"},{"isoNumeric":"076","libelle":"Brazil"},{"isoNumeric":"086","libelle":"British Indian Ocean Territory"},{"isoNumeric":"092","libelle":"British Virgin Islands"},{"isoNumeric":"096","libelle":"Brunei"},{"isoNumeric":"100","libelle":"Bulgaria"},{"isoNumeric":"854","libelle":"Burkina Faso"},{"isoNumeric":"108","libelle":"Burundi"},{"isoNumeric":"116","libelle":"Cambodia"},{"isoNumeric":"120","libelle":"Cameroon"},{"isoNumeric":"124","libelle":"Canada"},{"isoNumeric":"132","libelle":"Cape Verde"},{"isoNumeric":"136","libelle":"Cayman Islands"},{"isoNumeric":"140","libelle":"Central African Republic"},{"isoNumeric":"148","libelle":"Chad"},{"isoNumeric":"152","libelle":"Chile"},{"isoNumeric":"156","libelle":"China"},{"isoNumeric":"162","libelle":"Christmas Island"},{"isoNumeric":"166","libelle":"Cocos Islands"},{"isoNumeric":"170","libelle":"Colombia"},{"isoNumeric":"174","libelle":"Comoros"},{"isoNumeric":"184","libelle":"Cook Islands"},{"isoNumeric":"188","libelle":"Costa Rica"},{"isoNumeric":"191","libelle":"Croatia"},{"isoNumeric":"192","libelle":"Cuba"},{"isoNumeric":"196","libelle":"Cyprus"},{"isoNumeric":"203","libelle":"Czech Republic"},{"isoNumeric":"180","libelle":"Democratic Republic of the Congo"},{"isoNumeric":"208","libelle":"Denmark"},{"isoNumeric":"262","libelle":"Djibouti"},{"isoNumeric":"212","libelle":"Dominica"},{"isoNumeric":"214","libelle":"Dominican Republic"},{"isoNumeric":"626","libelle":"East Timor"},{"isoNumeric":"218","libelle":"Ecuador"},{"isoNumeric":"818","libelle":"Egypt"},{"isoNumeric":"222","libelle":"El Salvador"},{"isoNumeric":"226","libelle":"Equatorial Guinea"},{"isoNumeric":"232","libelle":"Eritrea"},{"isoNumeric":"233","libelle":"Estonia"},{"isoNumeric":"231","libelle":"Ethiopia"},{"isoNumeric":"238","libelle":"Falkland Islands"},{"isoNumeric":"234","libelle":"Faroe Islands"},{"isoNumeric":"242","libelle":"Fiji"},{"isoNumeric":"246","libelle":"Finland"},{"isoNumeric":"250","libelle":"France"},{"isoNumeric":"254","libelle":"French Guiana"},{"isoNumeric":"258","libelle":"French Polynesia"},{"isoNumeric":"260","libelle":"French Southern Territories"},{"isoNumeric":"266","libelle":"Gabon"},{"isoNumeric":"270","libelle":"Gambia"},{"isoNumeric":"268","libelle":"Georgia"},{"isoNumeric":"276","libelle":"Germany"},{"isoNumeric":"288","libelle":"Ghana"},{"isoNumeric":"292","libelle":"Gibraltar"},{"isoNumeric":"300","libelle":"Greece"},{"isoNumeric":"304","libelle":"Greenland"},{"isoNumeric":"308","libelle":"Grenada"},{"isoNumeric":"312","libelle":"Guadeloupe"},{"isoNumeric":"316","libelle":"Guam"},{"isoNumeric":"320","libelle":"Guatemala"},{"isoNumeric":"324","libelle":"Guinea"},{"isoNumeric":"624","libelle":"Guinea-Bissau"},{"isoNumeric":"328","libelle":"Guyana"},{"isoNumeric":"332","libelle":"Haiti"},{"isoNumeric":"334","libelle":"Heard Island and McDonald Islands"},{"isoNumeric":"340","libelle":"Honduras"},{"isoNumeric":"344","libelle":"Hong Kong"},{"isoNumeric":"348","libelle":"Hungary"},{"isoNumeric":"352","libelle":"Iceland"},{"isoNumeric":"356","libelle":"India"},{"isoNumeric":"360","libelle":"Indonesia"},{"isoNumeric":"364","libelle":"Iran"},{"isoNumeric":"368","libelle":"Iraq"},{"isoNumeric":"372","libelle":"Ireland"},{"isoNumeric":"376","libelle":"Israel"},{"isoNumeric":"380","libelle":"Italy"},{"isoNumeric":"384","libelle":"Ivory Coast"},{"isoNumeric":"388","libelle":"Jamaica"},{"isoNumeric":"392","libelle":"Japan"},{"isoNumeric":"400","libelle":"Jordan"},{"isoNumeric":"398","libelle":"Kazakhstan"},{"isoNumeric":"404","libelle":"Kenya"},{"isoNumeric":"296","libelle":"Kiribati"},{"isoNumeric":"414","libelle":"Kuwait"},{"isoNumeric":"417","libelle":"Kyrgyzstan"},{"isoNumeric":"418","libelle":"Laos"},{"isoNumeric":"428","libelle":"Latvia"},{"isoNumeric":"422","libelle":"Lebanon"},{"isoNumeric":"426","libelle":"Lesotho"},{"isoNumeric":"430","libelle":"Liberia"},{"isoNumeric":"434","libelle":"Libya"},{"isoNumeric":"438","libelle":"Liechtenstein"},{"isoNumeric":"440","libelle":"Lithuania"},{"isoNumeric":"442","libelle":"Luxembourg"},{"isoNumeric":"446","libelle":"Macao"},{"isoNumeric":"807","libelle":"Macedonia"},{"isoNumeric":"450","libelle":"Madagascar"},{"isoNumeric":"454","libelle":"Malawi"},{"isoNumeric":"458","libelle":"Malaysia"},{"isoNumeric":"462","libelle":"Maldives"},{"isoNumeric":"466","libelle":"Mali"},{"isoNumeric":"470","libelle":"Malta"},{"isoNumeric":"584","libelle":"Marshall Islands"},{"isoNumeric":"474","libelle":"Martinique"},{"isoNumeric":"478","libelle":"Mauritania"},{"isoNumeric":"480","libelle":"Mauritius"},{"isoNumeric":"175","libelle":"Mayotte"},{"isoNumeric":"484","libelle":"Mexico"},{"isoNumeric":"583","libelle":"Micronesia"},{"isoNumeric":"498","libelle":"Moldova"},{"isoNumeric":"492","libelle":"Monaco"},{"isoNumeric":"496","libelle":"Mongolia"},{"isoNumeric":"500","libelle":"Montserrat"},{"isoNumeric":"504","libelle":"Morocco"},{"isoNumeric":"508","libelle":"Mozambique"},{"isoNumeric":"104","libelle":"Myanmar"},{"isoNumeric":"516","libelle":"Namibia"},{"isoNumeric":"520","libelle":"Nauru"},{"isoNumeric":"524","libelle":"Nepal"},{"isoNumeric":"528","libelle":"Netherlands"},{"isoNumeric":"530","libelle":"Netherlands Antilles"},{"isoNumeric":"540","libelle":"New Caledonia"},{"isoNumeric":"554","libelle":"New Zealand"},{"isoNumeric":"558","libelle":"Nicaragua"},{"isoNumeric":"562","libelle":"Niger"},{"isoNumeric":"566","libelle":"Nigeria"},{"isoNumeric":"570","libelle":"Niue"},{"isoNumeric":"574","libelle":"Norfolk Island"},{"isoNumeric":"408","libelle":"North Korea"},{"isoNumeric":"580","libelle":"Northern Mariana Islands"},{"isoNumeric":"578","libelle":"Norway"},{"isoNumeric":"512","libelle":"Oman"},{"isoNumeric":"586","libelle":"Pakistan"},{"isoNumeric":"585","libelle":"Palau"},{"isoNumeric":"275","libelle":"Palestinian Territory"},{"isoNumeric":"591","libelle":"Panama"},{"isoNumeric":"598","libelle":"Papua New Guinea"},{"isoNumeric":"600","libelle":"Paraguay"},{"isoNumeric":"604","libelle":"Peru"},{"isoNumeric":"608","libelle":"Philippines"},{"isoNumeric":"612","libelle":"Pitcairn"},{"isoNumeric":"616","libelle":"Poland"},{"isoNumeric":"620","libelle":"Portugal"},{"isoNumeric":"630","libelle":"Puerto Rico"},{"isoNumeric":"634","libelle":"Qatar"},{"isoNumeric":"178","libelle":"Republic of the Congo"},{"isoNumeric":"638","libelle":"Reunion"},{"isoNumeric":"642","libelle":"Romania"},{"isoNumeric":"643","libelle":"Russia"},{"isoNumeric":"646","libelle":"Rwanda"},{"isoNumeric":"654","libelle":"Saint Helena"},{"isoNumeric":"659","libelle":"Saint Kitts and Nevis"},{"isoNumeric":"662","libelle":"Saint Lucia"},{"isoNumeric":"666","libelle":"Saint Pierre and Miquelon"},{"isoNumeric":"670","libelle":"Saint Vincent and the Grenadines"},{"isoNumeric":"882","libelle":"Samoa"},{"isoNumeric":"674","libelle":"San Marino"},{"isoNumeric":"678","libelle":"Sao Tome and Principe"},{"isoNumeric":"682","libelle":"Saudi Arabia"},{"isoNumeric":"686","libelle":"Senegal"},{"isoNumeric":"891","libelle":"Serbia and Montenegro"},{"isoNumeric":"690","libelle":"Seychelles"},{"isoNumeric":"694","libelle":"Sierra Leone"},{"isoNumeric":"702","libelle":"Singapore"},{"isoNumeric":"703","libelle":"Slovakia"},{"isoNumeric":"705","libelle":"Slovenia"},{"isoNumeric":"090","libelle":"Solomon Islands"},{"isoNumeric":"706","libelle":"Somalia"},{"isoNumeric":"710","libelle":"South Africa"},{"isoNumeric":"239","libelle":"South Georgia and the South Sandwich Islands"},{"isoNumeric":"410","libelle":"South Korea"},{"isoNumeric":"724","libelle":"Spain"},{"isoNumeric":"144","libelle":"Sri Lanka"},{"isoNumeric":"736","libelle":"Sudan"},{"isoNumeric":"740","libelle":"Suriname"},{"isoNumeric":"744","libelle":"Svalbard and Jan Mayen"},{"isoNumeric":"748","libelle":"Swaziland"},{"isoNumeric":"752","libelle":"Sweden"},{"isoNumeric":"756","libelle":"Switzerland"},{"isoNumeric":"760","libelle":"Syria"},{"isoNumeric":"158","libelle":"Taiwan"},{"isoNumeric":"762","libelle":"Tajikistan"},{"isoNumeric":"834","libelle":"Tanzania"},{"isoNumeric":"764","libelle":"Thailand"},{"isoNumeric":"768","libelle":"Togo"},{"isoNumeric":"772","libelle":"Tokelau"},{"isoNumeric":"776","libelle":"Tonga"},{"isoNumeric":"780","libelle":"Trinidad and Tobago"},{"isoNumeric":"788","libelle":"Tunisia"},{"isoNumeric":"792","libelle":"Turkey"},{"isoNumeric":"795","libelle":"Turkmenistan"},{"isoNumeric":"796","libelle":"Turks and Caicos Islands"},{"isoNumeric":"798","libelle":"Tuvalu"},{"isoNumeric":"850","libelle":"U.S. Virgin Islands"},{"isoNumeric":"800","libelle":"Uganda"},{"isoNumeric":"804","libelle":"Ukraine"},{"isoNumeric":"784","libelle":"United Arab Emirates"},{"isoNumeric":"826","libelle":"United Kingdom"},{"isoNumeric":"840","libelle":"United States"},{"isoNumeric":"581","libelle":"United States Minor Outlying Islands"},{"isoNumeric":"858","libelle":"Uruguay"},{"isoNumeric":"860","libelle":"Uzbekistan"},{"isoNumeric":"548","libelle":"Vanuatu"},{"isoNumeric":"336","libelle":"Vatican"},{"isoNumeric":"862","libelle":"Venezuela"},{"isoNumeric":"704","libelle":"Vietnam"},{"isoNumeric":"876","libelle":"Wallis and Futuna"},{"isoNumeric":"732","libelle":"Western Sahara"},{"isoNumeric":"887","libelle":"Yemen"},{"isoNumeric":"894","libelle":"Zambia"},{"isoNumeric":"716","libelle":"Zimbabwe"},{"isoNumeric":"NON_EU","libelle":"NON_EU"},{"isoNumeric":"688","libelle":"Austria"},{"isoNumeric":"248","libelle":"Åland Islands"},{"isoNumeric":"249","libelle":"Metropolitan France"}];
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalProducts, setTotalProducts] = useState<number>(0);
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
  const [actionDropdownPos, setActionDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Close the actions dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (isActionOpen === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.product-action-dropdown') && !target.closest('[data-action-btn]')) {
        setIsActionOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActionOpen]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [allNodes, setAllNodes] = useState<Record<number, Node>>({});
  const { addNotification } = useNotifications();

  // ==================== HIGHLIGHT ("mise en avant") STATE ====================
  const [highlightBusyIds, setHighlightBusyIds] = useState<Set<number>>(new Set());
  const [highlightModalOpen, setHighlightModalOpen] = useState<boolean>(false);
  const [highlightRequests, setHighlightRequests] = useState<HighlightRequest[]>([]);
  const [highlightRequestsLoading, setHighlightRequestsLoading] = useState<boolean>(false);
  const [highlightRequestsFilter, setHighlightRequestsFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [highlightReviewBusyId, setHighlightReviewBusyId] = useState<number | null>(null);


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
        const dedup = (arr: any[]) => {
          const seen = new Set();
          return arr.filter((s: any) => {
            const key = s.codeSegment || s.code;
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
        };
        if (Array.isArray(data)) {
          user.segmentsList = dedup(data);
        } else if (Array.isArray(data.segments)) {
          user.segmentsList = dedup(data.segments);
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
  // FETCH ENTITIES
  // Previously called /api/entites — that route doesn't exist on the server
  // (only /api/companies does), so this always failed silently and every
  // row fell back to the "Entité {id}" placeholder. Also switched from raw
  // fetch() to axios: the app's global axios interceptor (set up in App.tsx)
  // attaches the JWT automatically, but native fetch() does not, and the
  // server has no cookie/session auth for `credentials: "include"` to rely on.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/companies`, { withCredentials: true });
        const data = res.data;
        const map: Record<number, string> = {};
        if (Array.isArray(data)) {
          data.forEach((e: any) => {
            map[e.id_entite || e.id] = e.raison_socialle || e.entite_name || e.name || e.raison_sociale || "Inconnu";
          });
        }
        setEntitiesMap(map);
      } catch (err) {
        console.warn("Entities not available", err);
        setEntitiesMap({});
      }
    };
    load();
  }, []);
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
        setTotalProducts(data.total || 0);
        if (brands.length === 0) {
          const uniques = Array.from(new Set((data.products || []).map((p: Product) => p.brand).filter(Boolean))) as string[];
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
          parents: (p.parents || []).map((pp) => ({ id: pp.id_parent, quantity: pp.quantity })),
          children: [],
        };
      });
      let queue: number[] = products.flatMap((p) => (p.parents || []).map((pp) => pp.id_parent));
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
    (p.parents || []).forEach(pp => selectedParents[pp.id_parent] = pp.quantity);
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
  const PLACEHOLDER_IMAGE = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23f3f4f6'/%3E%3Cpath d='M32 12c11 0 20 9 20 20s-9 20-20 20-20-9-20-20 9-20 20-20z' fill='%23e5e7eb'/%3E%3Ccircle cx='32' cy='20' r='3' fill='%23d1d5db'/%3E%3Cpath d='M16 40 L24 30 L32 38 L48 22 L48 48 L16 48 Z' fill='%23d1d5db'/%3E%3C/svg%3E`;
  const getImageUrl = (path: string | null): string => {
    if (!path) return PLACEHOLDER_IMAGE;
    if (path.startsWith('data:') || path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}?t=${Date.now()}`;
  };
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = PLACEHOLDER_IMAGE;
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
  const [templateModal, setTemplateModal] = useState({ open: false, selectedSegment: null as string|null, selectedFamille: null as string|null, selectedClasse: null as any, selectedBrick: null as string|null, selectedRayon: null as string|null, selectedHierarchies: [] as any[], segments: [] as any[], familles: [] as any[], classes: [] as any[], bricks: [] as any[], rayons: [] as any[], modelFields: [] as any[], loading: false, error: null as string|null, activeTab: 'download' as 'download' | 'upload' });
  const [importTemplateFile, setImportTemplateFile] = useState<File | null>(null);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [rapportModal, setRapportModal] = useState<{open:boolean, results:any[], inserted:number, errors:number, total:number, failedFileBase64:string|null, failedFileName:string} | null>(null);

  const handleOpenTemplateModal = useCallback(async () => {
    if (!user?.id_entite) { addNotification("Entité non disponible", "error"); return; }
    setTemplateModal(prev => ({ ...prev, open: true, loading: true, activeTab: 'download' }));
    try {
      let segments = [];
      if ([999, 111].includes(user.id_entite)) {
        const res = await axios.get(`${API.segmentsAll}`);
        const raw = res.data || [];
        const seen = new Set();
        segments = raw.filter((s: any) => {
          const key = s.codeSegment || s.code;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
      } else {
        const res = await axios.get(`${API.entiteSegments}?id_entite=${user.id_entite}`);
        const raw = res.data || [];
        // Deduplicate by codeSegment in case DB has duplicate rows
        const seen = new Set();
        segments = raw.filter((s: any) => {
          const key = s.codeSegment || s.code;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
      }
      setTemplateModal(prev => ({ ...prev, segments, loading: false }));
    } catch (err) { console.error("Segment error:", err); addNotification("Erreur segments", "error"); setTemplateModal(prev => ({ ...prev, loading: false, error: "Impossible de charger les segments" })); }
  }, [user?.id_entite, addNotification]);

  const handleSegmentChange = useCallback(async (codeSegment) => {
    setTemplateModal(prev => ({ ...prev, selectedSegment: codeSegment, selectedFamille: null, selectedClasse: null, selectedBrick: null, familles: [], classes: [], bricks: [], modelFields: [], selectedHierarchies: [], loading: true }));
    try {
      const res = await axios.get(`${API.famillesBySegment}?codeSegment=${codeSegment}`);
      const familles = Array.isArray(res.data) ? res.data : [];
      setTemplateModal(prev => ({ ...prev, familles, loading: false }));
    } catch (err) { console.error("Famille error:", err); addNotification("Erreur familles", "error"); setTemplateModal(prev => ({ ...prev, loading: false })); }
  }, [addNotification]);

  const handleFamilleChange = useCallback(async (codeFamille) => {
    setTemplateModal(prev => ({ ...prev, selectedFamille: codeFamille, selectedClasse: null, selectedBrick: null, classes: [], bricks: [], modelFields: [], selectedHierarchies: [], loading: true }));
    try {
      const res = await axios.get(`${API.classesByFamille}?codeFamille=${codeFamille}`);
      setTemplateModal(prev => ({ ...prev, classes: res.data || [], loading: false }));
    } catch (err) { console.error("Class error:", err); addNotification("Erreur classes", "error"); setTemplateModal(prev => ({ ...prev, loading: false })); }
  }, [addNotification]);

  const handleClassChange = useCallback(async (codeClasse) => {
    setTemplateModal(prev => ({ ...prev, selectedClasse: codeClasse, selectedBrick: null, bricks: [], modelFields: [], selectedHierarchies: [], loading: true }));
    try {
      const res = await axios.get(`${API.bricksByClass}?codeClasse=${codeClasse}`);
      setTemplateModal(prev => ({ ...prev, bricks: res.data || [], loading: false }));
    } catch (err) { console.error("Brick error:", err); addNotification("Erreur briques", "error"); setTemplateModal(prev => ({ ...prev, loading: false })); }
  }, [addNotification]);

  const handleBrickChange = useCallback(async (codeBrique) => {
    setTemplateModal(prev => ({ ...prev, selectedBrick: codeBrique, selectedRayon: null, rayons: [], modelFields: [], selectedHierarchies: [], loading: true }));
    try {
      const res = await axios.get(`${API.rayonsByBrick}?brick_code=${codeBrique}`);
      const rayons = Array.isArray(res.data) ? res.data : [];
      setTemplateModal(prev => ({ ...prev, rayons, loading: false }));
    } catch (err) { console.error("Rayon error:", err); setTemplateModal(prev => ({ ...prev, rayons: [], loading: false })); }
  }, []);

  const handleRayonChange = useCallback(async (rayonCode: string, brickCode: string) => {
    setTemplateModal(prev => ({ ...prev, selectedRayon: rayonCode, modelFields: [], loading: true }));
    // Model key is rayon_code__brick_code (as stored by Generate.js)
    const modelKey = `${rayonCode}__${brickCode}`;
    try {
      const res = await axios.get(`${API.modelByRayon}?rayon_code=${encodeURIComponent(modelKey)}`);
      const fields = res.data?.fields || [];
      setTemplateModal(prev => ({ ...prev, modelFields: fields, loading: false }));
    } catch (err) {
      console.error("Model error:", err);
      setTemplateModal(prev => ({ ...prev, modelFields: [], loading: false }));
    }
  }, []);

  const handleDownloadTemplate = async () => {
    if (!templateModal.selectedBrick) { addNotification("Sélectionnez une brique", "error"); return; }
    if (!templateModal.selectedRayon) { addNotification("Sélectionnez un rayon", "error"); return; }
    const modelKey = `${templateModal.selectedRayon}__${templateModal.selectedBrick}`;
    try {
      setTemplateModal(prev => ({ ...prev, loading: true }));
      const response = await axios.get(API.templateDownload, {
        params: {
          codebrique:   templateModal.selectedBrick,
          rayon_code:   templateModal.selectedRayon,
          model_key:    modelKey,
          codeSegment:  templateModal.selectedSegment  || "",
          codeFamille:  templateModal.selectedFamille  || "",
          codeClasse:   templateModal.selectedClasse   || "",
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Modele_Produits_${templateModal.selectedRayon}_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      addNotification("Modèle téléchargé", "success");
      setTemplateModal(prev => ({ ...prev, open: false, loading: false }));
    } catch (err) { console.error("Template error:", err); addNotification("Erreur template", "error"); setTemplateModal(prev => ({ ...prev, loading: false })); }
  };
  const handleImportTemplate = async () => {
    if (!importTemplateFile) { addNotification("Sélectionnez un fichier", "error"); return; }
    setImportingTemplate(true);
    try {
      const formData = new FormData();
      formData.append("file", importTemplateFile);
      if (user?.id_entite) formData.append("id_entite", String(user.id_entite));
      const res = await fetch(`${API_BASE}/api/products/import-template`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { addNotification(data.error || "Erreur import", "error"); return; }
      setRapportModal({
        open: true,
        results: data.results || [],
        inserted: data.inserted || 0,
        errors: data.errors || 0,
        total: data.total || 0,
        failedFileBase64: data.failedFileBase64 || null,
        failedFileName: data.failedFileName || "Echecs_Import.xlsx",
      });
      setTemplateModal(prev => ({ ...prev, open: false }));
      setImportTemplateFile(null);
      if (data.inserted > 0) setRetry(r => r + 1);
    } catch (err: any) {
      addNotification("Erreur: " + err.message, "error");
    } finally {
      setImportingTemplate(false);
    }
  };

  const handleDownloadFailedFile = () => {
    if (!rapportModal?.failedFileBase64) return;
    const bin = atob(rapportModal.failedFileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", rapportModal.failedFileName);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    URL.revokeObjectURL(url);
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
  const handlePublier = async (p: Product) => {
    try {
      const newStatus = canEditStatus ? 2 : 1;
      const res = await fetch(`${API_BASE}/api/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to publish');
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: newStatus } : x));
      addNotification("Produit publié.", "success");
      setIsActionOpen(null);
    } catch (err) {
      addNotification("Échec de la publication.", "error");
    }
  };
  const handleSuspend = async (p: Product) => {
    try {
      const res = await fetch(`${API_BASE}/api/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 0 }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to suspend');
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: 0 } : x));
      addNotification("Produit suspendu.", "success");
      setIsActionOpen(null);
    } catch (err) {
      addNotification("Échec de la suspension.", "error");
    }
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Confirmer la suppression ?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete');
      setProducts(prev => prev.filter(x => x.id !== id));
      addNotification("Produit supprimé.", "success");
      setIsActionOpen(null);
    } catch (err) {
      addNotification("Échec de la suppression.", "error");
    }
  };

  // ==================== HIGHLIGHT ("mise en avant") HANDLERS ====================
  // Entity side: request / withdraw a highlight on one of its own products.
  const handleRequestHighlight = async (p: Product) => {
    setHighlightBusyIds(prev => new Set(prev).add(p.id));
    try {
      const res = await fetch(API.highlightRequest(p.id), { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, highlight_status: data.status || 'pending', highlight_id: data.id ?? x.highlight_id } : x));
      addNotification("Demande de mise en avant envoyée, en attente d'approbation.", "success");
    } catch (err: any) {
      addNotification(err.message || "Échec de la demande de mise en avant.", "error");
    } finally {
      setHighlightBusyIds(prev => { const s = new Set(prev); s.delete(p.id); return s; });
      setIsActionOpen(null);
    }
  };
  const handleWithdrawHighlight = async (p: Product) => {
    setHighlightBusyIds(prev => new Set(prev).add(p.id));
    try {
      const res = await fetch(API.highlightRequest(p.id), { method: 'DELETE', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, highlight_status: null, highlight_id: null } : x));
      addNotification("Mise en avant retirée.", "success");
    } catch (err: any) {
      addNotification(err.message || "Échec du retrait de la mise en avant.", "error");
    } finally {
      setHighlightBusyIds(prev => { const s = new Set(prev); s.delete(p.id); return s; });
      setIsActionOpen(null);
    }
  };

  // Admin side (999/111 only, gated server-side too): list + approve/reject.
  const loadHighlightRequests = useCallback(async (status: string) => {
    setHighlightRequestsLoading(true);
    try {
      const res = await fetch(`${API.highlightRequestsList}?status=${status}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      setHighlightRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      addNotification("Échec du chargement des demandes de mise en avant.", "error");
      setHighlightRequests([]);
    } finally {
      setHighlightRequestsLoading(false);
    }
  }, [API.highlightRequestsList, addNotification]);
  // Privileged entities see a live pending-count badge without opening the modal.
  useEffect(() => {
    if (isPrivilegedEntite) loadHighlightRequests('pending');
  }, [isPrivilegedEntite]);
  const openHighlightModal = () => {
    setHighlightModalOpen(true);
    setHighlightRequestsFilter('pending');
    loadHighlightRequests('pending');
  };
  const changeHighlightFilter = (status: 'pending' | 'approved' | 'rejected' | 'all') => {
    setHighlightRequestsFilter(status);
    loadHighlightRequests(status);
  };
  const handleApproveHighlight = async (reqId: number) => {
    setHighlightReviewBusyId(reqId);
    try {
      const res = await fetch(API.highlightApprove(reqId), { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Erreur');
      addNotification("Demande approuvée.", "success");
      setHighlightRequests(prev => prev.filter(r => r.id !== reqId));
      setRetry(r => r + 1); // refresh the main table's highlight badges too
    } catch (err) {
      addNotification("Échec de l'approbation.", "error");
    } finally {
      setHighlightReviewBusyId(null);
    }
  };
  const handleRejectHighlight = async (reqId: number) => {
    const reason = window.prompt("Motif du refus (optionnel) :") || undefined;
    setHighlightReviewBusyId(reqId);
    try {
      const res = await fetch(API.highlightReject(reqId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Erreur');
      addNotification("Demande refusée.", "success");
      setHighlightRequests(prev => prev.filter(r => r.id !== reqId));
      setRetry(r => r + 1);
    } catch (err) {
      addNotification("Échec du refus.", "error");
    } finally {
      setHighlightReviewBusyId(null);
    }
  };

  // ==================== STATES POUR DÉCLINAISONS ====================
const [declinaisons, setDeclinaisons] = useState<Record<number, any[]>>({});

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [declinaisonMeta, setDeclinaisonMeta] = useState<any | null>(null);
  const [editingDeclinaison, setEditingDeclinaison] = useState<any>(null);
  const [addingForProduct, setAddingForProduct] = useState<number | null>(null);
  const [newDeclinaison, setNewDeclinaison] = useState<any>({
    hierarchy_code: '', gtin: '', packaging_type: '', pallet_type: '', hierarchy_fields: {}, parent_id: null
  });
const HIERARCHY_LABELS_FR: Record<string, string> = {
  gtin_d: "GTIN du niveau inférieur",
  childTradeItem: "Article enfant",
  quantityofNextLowerLevelTradeItem: "Quantité du niveau inférieur",
  quantityOfCompleteLayersContainedInATradeItem: "Nombre de couches complètes",
  quantityOfTradeItemsContainedInACompleteLayer: "Articles par couche",
  isTradeItemADespatchUnit: "Unité d'expédition",
  isTradeItemAnInvoiceUnit: "Unité de facturation",
  isTradeItemAnOrderableUnit: "Unité commandable",
  isTradeItemAModel: "Article modèle",
  isTradeItemADivisibleItem: "Article divisible",
  hasDisplayReadyPackaging: "Emballage prêt à l'exposition",
  isTradeItemPackedIrregularly: "Conditionnement irrégulier",
  compositionDepthValue: "Profondeur",
  compositionWidthValue: "Largeur",
  alimentaryProduct: "Produit alimentaire",
  TradeItemDisplayDimensions: "Dimensions d'exposition",
  contactGLN: "GLN de contact",
  orderingUnitOfMeasure: "Unité de commande",
  invoicingUnitOfMeasure: "Unité de facturation",
  tradeItemWeight: "Poids",
  tradeItemVolume: "Volume",
  packagingMaterial: "Matériau d'emballage",
  stackingFactor: "Facteur d'empilage",
  maxStackingWeight: "Poids max empilé",
  palletLayerQuantity: "Couches par palette",
  type_emballage: "Type d'emballage",
  palletTypeCode: "Type de palette"
};
  // Charger meta déclinaisons
  useEffect(() => {
    fetch(`${API_BASE}/api/declinaisons/meta`, { credentials: 'include' })
      .then(r => r.json()).then(setDeclinaisonMeta).catch(console.error);
  }, []);
const fetchDeclinaisons = useCallback(async (productId: number) => {
  if (!productId || isNaN(productId)) return;

  try {
    const res = await fetch(`${API_BASE}/api/products/${productId}/declinaisons`, {
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Safety: make sure we always have array
const safeData = Array.isArray(data) ? data : [];

setDeclinaisons(prev => ({
  ...prev,
  [productId]: safeData.map(item => ({
    id: Number(item.id ?? 0),
    id_produit: Number(item.id_produit ?? productId),
    parent_id: item.parent_id != null ? Number(item.parent_id) : null,
    hierarchy_code: item.hierarchy_code || '',
    hierarchy_label: item.hierarchy_label || '', // make sure label exists
    hierarchy_fields: item.hierarchy_fields || {}, // safe fallback
    gtin: item.gtin ?? null,
    packaging_type: item.packaging_type ?? null,
    pallet_type: item.pallet_type ?? null,
    declinaison_type: item.declinaison_type || null, // optional
    quantity: item.quantity ?? 1, // default quantity
  }))
}));

  } catch (err) {
    console.error(`Impossible de charger déclinaisons pour produit ${productId}:`, err);
    addNotification("Échec chargement des déclinaisons", "error");
  }
}, [addNotification]);

const toggleExpand = (id: number) => {
  const productId = Number(id);
  const newSet = new Set(expanded);

  if (newSet.has(productId)) {
    newSet.delete(productId);
  } else {
    newSet.add(productId);
    // Load if not already loaded
    if (!declinaisons[productId]) {
      fetchDeclinaisons(productId);
    }
  }

  setExpanded(newSet);
};
  const resetNewDeclinaison = () => setNewDeclinaison({ hierarchy_code: '', gtin: '', packaging_type: '', pallet_type: '', hierarchy_fields: {}, parent_id: null });
const handleSaveDeclinaison = async (decl: any, isEdit: boolean) => {
  if (!decl.hierarchy_code) {
    addNotification("Type de hiérarchie requis", "error");
    return;
  }

  // Very important: keep reference to product id as NUMBER
  const productId = Number(decl.id_produit);

  if (!productId || isNaN(productId)) {
    addNotification("Erreur interne : ID produit invalide", "error");
    return;
  }

  const url = isEdit 
    ? `${API_BASE}/api/declinaisons/${decl.id}`
    : `${API_BASE}/api/declinaisons`;

  const method = isEdit ? 'PUT' : 'POST';

  const body = {
    id_produit: productId,
    hierarchy_code: decl.hierarchy_code,
    parent_id: decl.parent_id || null,
    gtin: decl.gtin || null,
    packaging_type: decl.packaging_type || null,
    pallet_type: decl.pallet_type || null,
    hierarchy_fields: decl.hierarchy_fields || {}
  };

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erreur ${res.status} - ${errText}`);
    }

    addNotification(isEdit ? "Déclinaison modifiée" : "Déclinaison ajoutée", "success");

    // ────────────────────── CRITICAL FIXES ──────────────────────
    // 1. Refresh data immediately
    await fetchDeclinaisons(productId);

    // 2. Force expand the current product so user sees result right away
    setExpanded(prev => {
      const newSet = new Set(prev);
      newSet.add(productId);
      return newSet;
    });

    // Clean up form
    setEditingDeclinaison(null);
    setAddingForProduct(null);
    resetNewDeclinaison();

  } catch (err: any) {
    console.error("Échec sauvegarde déclinaison:", err);
    addNotification(`Erreur: ${err.message}`, "error");
  }
};
const handleDeleteDeclinaison = async (id: number, productId: number) => {
  if (!confirm("Supprimer cette déclinaison ?")) return;

  try {
    await fetch(
      `${API_BASE}/api/declinaisons/${id}?product=${productId}`,
      {
        method: "DELETE",
        credentials: "include"
      }
    );

    await fetchDeclinaisons(productId);
    addNotification("Déclinaison supprimée", "success");
  } catch (err) {
    console.error(err);
    addNotification("Erreur suppression", "error");
  }
};

  const isBooleanField = (field: string) => field.startsWith('is') || field.startsWith('has');
  const isNumberField = (field: string) => field.toLowerCase().includes('quantity') || field.toLowerCase().includes('value') || field.toLowerCase().includes('weight') || field.toLowerCase().includes('volume') || field.toLowerCase().includes('factor') || field.toLowerCase().includes('dimension');
  if (loading) return <div className="p-6 text-center">Chargement...</div>;
  if (error) return (
    <div className="p-6 text-center text-red-600">
      {error}
      <button className={`${ACCENT_BG} px-4 py-2 text-white rounded mt-4`} onClick={() => setRetry(r => r + 1)}>Réessayer</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Produits</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Catalogue Complet</span>
      </nav>
      <div className="container mx-auto p-6">
             <div className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-4xl font-normal tracking-tight text-slate-900">Fiches Produits</h1>
            <p className="text-slate-500 mt-1.5">Gestion avancée des produits et hiérarchies logistiques</p>
          </div>
          
          <div className="flex items-center gap-3">
            {isPrivilegedEntite && (
              <button
                onClick={openHighlightModal}
                className="relative flex items-center gap-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 px-6 py-3 rounded-2xl font-medium text-amber-800 transition-all"
              >
                🌟 Mises en avant
                {highlightRequests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 shadow">
                    {highlightRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
            {!hideAddAndImport && (
              <>
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  <span className="text-xl">＋</span> Nouveau Produit
                </button>
                <button
                  onClick={handleOpenTemplateModal}
                  className="flex items-center gap-2 border border-slate-300 hover:bg-white px-6 py-3 rounded-2xl font-medium text-slate-700 transition-all"
                >
                  📥 Modèle & Import
                </button>
              </>
            )}
          </div>
        </div>
              <div className="bg-white rounded-3xl shadow border border-slate-100 p-8 mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">       <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Marque</label>
            <select value={selectedBrand} onChange={(e) => { setSelectedBrand(e.target.value); setPage(1); }} className="p-2.5 border border-slate-300 rounded-lg w-full text-xs sm:text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition">
              <option value="">Toutes</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Secteur (Brique)</label>
            <select value={selectedSector} onChange={(e) => { setSelectedSector(e.target.value); setPage(1); }} className="p-2.5 border border-slate-300 rounded-lg w-full text-xs sm:text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition">
              <option value="">Tous</option>
              {allBricks.map((b) => <option key={b.codeBrique} value={b.codeBrique}>{b.libelleBrique}</option>)}
            </select>
          </div>
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Afficher par page</label>
            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }} className="p-2.5 border border-slate-300 rounded-lg w-full text-xs sm:text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition">
              <option value="10">10 produits</option>
              <option value="25">25 produits</option>
              <option value="50">50 produits</option>
            </select>
          </div>
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Recherche</label>
            <input type="text" onChange={onSearchChange} placeholder="Chercher..." className="p-2.5 border border-slate-300 rounded-lg w-full text-xs sm:text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition" />
          </div>
        </div>
               <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
         <table className="min-w-full text-xs sm:text-sm">
  <thead className="bg-blue-900 text-white sticky top-0 z-10">
    <tr>
      <th className="p-4 text-left text-xs font-medium w-20">Image</th>
      
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium" 
          onClick={() => changeSort("gtin")}>
        GTIN {renderSortArrow("gtin")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium" 
          onClick={() => changeSort("libelle")}>
        Libellé {renderSortArrow("libelle")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium" 
          onClick={() => changeSort("brand")}>
        Marque {renderSortArrow("brand")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium hidden md:table-cell" 
          onClick={() => changeSort("codebrique")}>
        Brique {renderSortArrow("codebrique")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium hidden lg:table-cell" 
          onClick={() => changeSort("idEntreprise")}>
        Entreprise {renderSortArrow("idEntreprise")}
      </th>
      <th className="p-4 text-left text-right cursor-pointer hover:bg-blue-800 transition text-xs font-medium" 
          onClick={() => changeSort("prix_min")}>
        Prix {renderSortArrow("prix_min")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium hidden sm:table-cell" 
          onClick={() => changeSort("declinaison_type")}>
        Type {renderSortArrow("declinaison_type")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium hidden lg:table-cell text-center" 
          onClick={() => changeSort("declinaison_count")}>
        Décl. {renderSortArrow("declinaison_count")}
      </th>
      <th className="p-4 text-left cursor-pointer hover:bg-blue-800 transition text-xs font-medium" 
          onClick={() => changeSort("status")}>
        Statut {renderSortArrow("status")}
      </th>
      <th className="p-4 text-center text-xs font-medium w-28">Actions</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-slate-100">
    {products.length === 0 && (
      <tr>
        <td colSpan={11} className="p-12 text-center text-slate-500 text-sm">
          Aucun produit trouvé
        </td>
      </tr>
    )}

    {products.map((p) => (
      <React.Fragment key={p.id}>
        <tr className="group hover:bg-blue-50/70 transition-all duration-200">
          <td className="p-4">
            <div 
              className="w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow-sm hover:ring-blue-300 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setSelectedImage(p.images ? getImageUrl(p.images.split(";")[0]) : PLACEHOLDER_IMAGE)}
            >
              <img
                src={p.images ? getImageUrl(p.images.split(";")[0]) : PLACEHOLDER_IMAGE}
                alt={p.libelle}
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            </div>
          </td>
          <td className="p-4 text-sm font-medium text-slate-800 font-mono tracking-tight truncate">{p.gtin}</td>
          <td className="p-4 text-sm text-slate-900 font-medium leading-tight">{p.libelle}</td>
          <td className="p-4 text-sm text-slate-600">{p.brand}</td>
          <td className="p-4 text-sm text-slate-600 hidden md:table-cell">
            {allBricks.find(b => b.codeBrique === p.codebrique)?.libelleBrique || p.codebrique}
          </td>
          <td className="p-4 text-sm text-slate-600 hidden lg:table-cell truncate">
            {entitiesMap[p.idEntreprise] || `Entité ${p.idEntreprise}`}
          </td>
          <td className="p-4 text-sm text-right font-semibold text-slate-700">
            {p.prix_min} — {p.prix_max}
          </td>
          <td className="p-4 text-sm text-slate-700 hidden sm:table-cell">
            {getTypeIcon(p.declinaison_type)} {p.declinaison_type || '—'}
          </td>
          <td className="p-4 text-sm text-slate-600 hidden lg:table-cell text-center font-medium">
            {declinaisons[p.id]?.length ?? p.declinaison_count ?? 0}
          </td>
          <td className="p-4">
            <div className="flex flex-col gap-1.5 items-start">
              <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold ${
                p.status === 2 ? "bg-emerald-100 text-emerald-700" :
                p.status === 1 ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              }`}>
                {p.status === 2 ? "Validé ✓" : p.status === 1 ? "En attente ⏳" : "Enregistré 📝"}
              </span>
              {p.highlight_status && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${
                  p.highlight_status === 'approved' ? "bg-amber-100 text-amber-800" :
                  p.highlight_status === 'pending' ? "bg-blue-100 text-blue-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {p.highlight_status === 'approved' ? "🌟 Mis en avant" : p.highlight_status === 'pending' ? "⏳ Mise en avant en attente" : "✕ Mise en avant refusée"}
                </span>
              )}
            </div>
          </td>
          <td className="p-4 text-center">
            {hasActionPermission && (
              <div className="relative inline-block">
                <button 
                  data-action-btn
                  className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1"
                  onClick={(e) => {
                    const willOpen = isActionOpen !== p.id;
                    if (willOpen) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const menuWidth = 192; // w-48
                      const estimatedMenuHeight = 190;
                      let left = rect.right - menuWidth;
                      if (left < 10) left = 10;
                      if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
                      let top = rect.bottom + 8;
                      // Flip above the button if there isn't enough room below.
                      if (top + estimatedMenuHeight > window.innerHeight) {
                        top = rect.top - estimatedMenuHeight - 8;
                        if (top < 10) top = 10;
                      }
                      setActionDropdownPos({ top, left });
                    }
                    setIsActionOpen(willOpen ? p.id : null);
                  }}
                >
                  ⋮ Actions
                </button>

                {isActionOpen === p.id && actionDropdownPos && (
                  <div
                    className="product-action-dropdown fixed bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] w-48 py-1 overflow-hidden text-sm"
                    style={{ top: actionDropdownPos.top, left: actionDropdownPos.left }}
                  >
                    <button className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-2" onClick={() => { handleEdit(p); setIsActionOpen(null); }}>
                      ✏️ Modifier
                    </button>
                    {canEditStatus && p.status !== 2 && (
                      <button className="w-full text-left px-4 py-2.5 hover:bg-green-50 flex items-center gap-2" onClick={() => { handlePublier(p); setIsActionOpen(null); }}>
                        ✓ Valider
                      </button>
                    )}
                    {p.status !== 0 && (
                      <button className="w-full text-left px-4 py-2.5 hover:bg-orange-50 flex items-center gap-2" onClick={() => { handleSuspend(p); setIsActionOpen(null); }}>
                        ⏸️ Suspendre
                      </button>
                    )}
                    {(!p.highlight_status || p.highlight_status === 'rejected') && (
                      <button
                        disabled={highlightBusyIds.has(p.id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-amber-50 flex items-center gap-2 disabled:opacity-50"
                        onClick={() => handleRequestHighlight(p)}
                      >
                        🌟 {p.highlight_status === 'rejected' ? "Redemander la mise en avant" : "Demander la mise en avant"}
                      </button>
                    )}
                    {(p.highlight_status === 'pending' || p.highlight_status === 'approved') && (
                      <button
                        disabled={highlightBusyIds.has(p.id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                        onClick={() => handleWithdrawHighlight(p)}
                      >
                        ✕ {p.highlight_status === 'pending' ? "Annuler la demande" : "Retirer de la mise en avant"}
                      </button>
                    )}
                    <button className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 flex items-center gap-2" onClick={() => { handleDelete(p.id); setIsActionOpen(null); }}>
                      🗑️ Supprimer
                    </button>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>

        {/* Expanded Declinaisons with Gérer Hierarchy Button */}
        {expanded.has(p.id) && (
          <tr>
            <td colSpan={11} className="p-0 bg-slate-50 border-t-2 border-blue-200">
              <div className="px-8 py-6">
                <h3 className="font-bold text-lg mb-5 text-slate-900 flex items-center gap-2">
                  📊 Déclinaisons de « {p.libelle} »
                </h3>

                {Array.isArray(declinaisons[p.id]) && declinaisons[p.id].length > 0 ? (
                  declinaisons[p.id].map((d: any) => (
                    <div key={d?.id ?? Math.random()} className="mb-5 p-5 border border-slate-200 rounded-2xl bg-white shadow-sm hover:shadow transition">
                      <div className="font-semibold text-slate-900 mb-2">
                        {d?.hierarchy_label ?? "—"} — GTIN: {d?.gtin ?? "—"}
                      </div>
                      <div className="text-xs text-slate-600 mb-4">
                        📦 {d?.packaging_type ?? "—"} | 🚛 {d?.pallet_type ?? "—"}
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-blue-700 hover:text-blue-800 font-medium">Voir les champs détaillés</summary>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                          {(declinaisonMeta?.hierarchyFields?.[d.hierarchy_code] ?? []).map((field: string) => (
                            <div key={field} className="flex flex-col">
                              <label className="text-xs font-semibold text-slate-600 mb-1.5">
                                {FRENCH_FIELD_LABELS[field] || field.replace(/_/g, " ")}
                              </label>
                              <div className="p-3 bg-slate-50 rounded-xl text-sm">
                                {isBooleanField(field) 
                                  ? (d.hierarchy_fields?.[field] == 1 ? "✓ Oui" : d.hierarchy_fields?.[field] == 0 ? "✗ Non" : "—")
                                  : (d.hierarchy_fields?.[field] ?? "—")
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>

                      <div className="mt-5 flex gap-3">
                        <button onClick={() => setEditingDeclinaison(d)} className="text-blue-700 hover:text-blue-800 font-medium text-sm px-5 py-2 rounded-xl hover:bg-blue-50 transition">
                          ✏️ Modifier
                        </button>
                        <button onClick={() => handleDeleteDeclinaison(d?.id, p.id)} className="text-red-600 hover:text-red-700 font-medium text-sm px-5 py-2 rounded-xl hover:bg-red-50 transition">
                          🗑️ Supprimer
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 py-6 text-center">Aucune déclinaison pour ce produit</div>
                )}

                {/* GÉRER HIÉRARCHIE BUTTON */}
                <button 
                  onClick={() => setAddingForProduct(p.id)} 
                  className="mt-4 bg-blue-900 hover:bg-blue-800 text-white px-6 py-3 rounded-2xl font-semibold flex items-center gap-2 transition shadow-md"
                >
                  ➕ Ajouter une hiérarchie
                </button>

                {/* Add/Edit Declinaison Form */}
                {(addingForProduct === p.id || (editingDeclinaison && editingDeclinaison.id_produit === p.id)) && (
                  <div className="mt-6 p-6 border-2 border-blue-200 rounded-2xl bg-white">
                    {/* Paste your existing declinaison form here if needed */}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    ))}
  </tbody>
</table>
        </div>
        <div className="flex items-center justify-between mt-6 px-2">
          <div className="text-sm font-semibold text-slate-700">
            📄 Page {page} / {totalPages} · {totalProducts.toLocaleString('fr')} produit{totalProducts !== 1 ? 's' : ''} au total
          </div>
          <div className="flex gap-3">
              <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Précédent</button>
              <button className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suivant →</button>
          </div>
        </div>
        {selectedImage && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            <div className="bg-white p-6 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <img src={selectedImage} alt="Zoom" className="max-w-[80vw] max-h-[80vh] object-contain rounded" onError={handleImageError} />
              <div className="mt-4 text-right">
                <button className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-semibold" onClick={() => setSelectedImage(null)}>✕ Fermer</button>
              </div>
            </div>
          </div>
        )}
        {isModalOpen && editingProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setIsModalOpen(false)}>
            <Draggable handle=".modal-handle" nodeRef={modalRef}>
              <Resizable defaultSize={{ width: 760, height: 700 }} minWidth={480} minHeight={450}>
                <div ref={modalRef} className="bg-white rounded shadow-lg p-4 overflow-auto max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-handle bg-slate-50 border-b border-gray-100 p-3 rounded-t text-sm font-semibold text-slate-700 cursor-move text-center">
                    {editingProduct.id === 0 ? "Ajouter Produit" : "Modifier Produit"}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-blue-900 mb-1">Sélectionner un segment</label>
                      <select
                        value={editingProduct.selectedSegment || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingProduct({
                            ...editingProduct,
                            selectedSegment: val,
                            codeClasse: 0,
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
                    {editingProduct.selectedSegment && (
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Classe pour ce segment</label>
                        <select
                          value={editingProduct.codeClasse || ""}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setEditingProduct({
                              ...editingProduct,
                              codeClasse: Number(val) || 0,
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
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Marque *</label><input value={editingProduct.brand || ""} onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Sous Marque</label><input value={editingProduct.subBrand || ""} onChange={(e) => setEditingProduct({ ...editingProduct, subBrand: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">GTIN *</label><input value={editingProduct.gtin || ""} onChange={(e) => setEditingProduct({ ...editingProduct, gtin: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Libellé *</label><input value={editingProduct.libelle || ""} onChange={(e) => setEditingProduct({ ...editingProduct, libelle: e.target.value })} className="p-2 border rounded w-full" /></div>
                    <div className="md:col-span-2"><label className="block text-sm text-gray-700 font-medium mb-1">Description</label><textarea value={editingProduct.description || ""} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} rows={3} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Prix Min</label><input type="number" step="0.01" value={editingProduct.prix_min || ""} onChange={(e) => setEditingProduct({ ...editingProduct, prix_min: parseFloat(e.target.value) || 0 })} className="p-2 border rounded w-full" /></div>
                    <div><label className="block text-sm text-gray-700 font-medium mb-1">Prix Max</label><input type="number" step="0.01" value={editingProduct.prix_max || ""} onChange={(e) => setEditingProduct({ ...editingProduct, prix_max: parseFloat(e.target.value) || 0 })} className="p-2 border rounded w-full" /></div>
                    <div>
                      <label className="block text-sm text-gray-700 font-medium mb-1">Pays d'origine</label>
                      <select value={editingProduct.countryOfOrigin || "686"} onChange={(e) => setEditingProduct({ ...editingProduct, countryOfOrigin: e.target.value })} className="p-2 border rounded w-full bg-white">
                        <option value="">-- Choisir un pays --</option>
                        {paysList.map((p) => (
                          <option key={p.isoNumeric} value={p.isoNumeric}>{p.libelle}</option>
                        ))}
                      </select>
                    </div>
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
                    <div className="md:col-span-2 bg-gray-50 p-3 rounded">
                      <label className="block text-sm text-gray-700 font-medium mb-2">Produits Parents (Sélection multiple pour hiérarchies)</label>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto scroll-smooth">
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
                  <button className={`${ACCENT_BG} px-3 py-2 text-white rounded`} onClick={handleOpenTemplateModal}>Télécharger modèle</button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className={`${ACCENT_BG} px-3 py-1 text-white rounded`} onClick={handleBulkImport}>Importer</button>
              </div>
            </div>
          </div>
        )}



        {/* ========== TEMPLATE MODAL ========== */}
        {templateModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center" onClick={() => setTemplateModal(prev => ({...prev, open: false}))}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-xl shadow-2xl w-[95%] max-w-2xl max-h-[92vh] overflow-y-auto scroll-smooth" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-6 py-4 text-white sticky top-0 z-10 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">Gestion Modèle Produits</h2>
                    <p className="text-blue-200 text-xs mt-0.5">Téléchargez le modèle ou importez un fichier rempli</p>
                  </div>
                  <button onClick={() => setTemplateModal(prev => ({...prev, open: false, selectedSegment: null, selectedFamille: null, selectedClasse: null, selectedBrick: null, selectedRayon: null, rayons: [], modelFields: []}))} className="text-white opacity-70 hover:opacity-100 text-2xl font-bold leading-none">×</button>
                </div>
                {/* Tabs */}
                <div className="flex mt-4 gap-1">
                  <button onClick={() => setTemplateModal(prev => ({...prev, activeTab:'download'}))} className={`px-4 py-1.5 rounded-t text-sm font-semibold transition-all ${templateModal.activeTab==='download' ? 'bg-white text-blue-800' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'}`}>
                    📥 Télécharger modèle
                  </button>
                  <button onClick={() => setTemplateModal(prev => ({...prev, activeTab:'upload'}))} className={`px-4 py-1.5 rounded-t text-sm font-semibold transition-all ${templateModal.activeTab==='upload' ? 'bg-white text-blue-800' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'}`}>
                    📤 Importer fichier rempli
                  </button>
                </div>
              </div>

              {/* ===== TAB: DOWNLOAD ===== */}
              {templateModal.activeTab === 'download' && (
                <div className="p-6 space-y-4">
                  {templateModal.error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{templateModal.error}</div>}
                  <p className="text-sm text-gray-500">Sélectionnez le rayon en 5 étapes. Le modèle contiendra tous les champs obligatoires + optionnels + les 6 niveaux d'unités logistiques + données tarifaires.</p>

                  {/* Row 1: Segment + Famille */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <label className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-2">
                        <span className="bg-blue-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                        Segment
                      </label>
                      <select value={templateModal.selectedSegment || ""} onChange={(e) => handleSegmentChange(e.target.value)} className="w-full p-2.5 border border-blue-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-400" disabled={templateModal.loading}>
                        <option value="">-- Choisir un segment --</option>
                        {[...new Map(templateModal.segments.map((s: any) => [s.codeSegment || s.code, s])).values()].map((seg: any) => <option key={seg.codeSegment || seg.code} value={seg.codeSegment || seg.code}>{seg.codeSegment || seg.code} — {seg.libelleSegment || seg.libelle}</option>)}
                      </select>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <label className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-2">
                        <span className={`${templateModal.selectedSegment ? 'bg-blue-700' : 'bg-gray-300'} text-white rounded-full w-5 h-5 flex items-center justify-center text-xs`}>2</span>
                        Famille
                      </label>
                      <select value={templateModal.selectedFamille || ""} onChange={(e) => handleFamilleChange(e.target.value)} className="w-full p-2.5 border border-blue-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-400" disabled={templateModal.loading || !templateModal.selectedSegment || !templateModal.familles.length}>
                        <option value="">{!templateModal.selectedSegment ? "Choisir un segment d'abord" : templateModal.loading ? "Chargement..." : templateModal.familles.length === 0 ? "Aucune famille" : "-- Choisir une famille --"}</option>
                        {[...new Map(templateModal.familles.map((f: any) => [f.codeFamille, f])).values()].map((f: any) => <option key={f.codeFamille} value={f.codeFamille}>{f.codeFamille} — {f.libelleFamille || f.libelle || "(Sans libellé)"}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Classe + Brique */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <span className={`${templateModal.selectedFamille ? 'bg-blue-700' : 'bg-gray-300'} text-white rounded-full w-5 h-5 flex items-center justify-center text-xs`}>3</span>
                        Classe
                      </label>
                      <select value={templateModal.selectedClasse || ""} onChange={(e) => handleClassChange(Number(e.target.value))} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-400" disabled={templateModal.loading || !templateModal.selectedFamille || !templateModal.classes.length}>
                        <option value="">{!templateModal.selectedFamille ? "Choisir une famille d'abord" : templateModal.loading ? "Chargement..." : "-- Choisir une classe --"}</option>
                        {[...new Map(templateModal.classes.map((c: any) => [c.codeClasse, c])).values()].map((cls: any) => <option key={cls.codeClasse} value={cls.codeClasse}>{cls.codeClasse} — {cls.libelleClasse}</option>)}
                      </select>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <span className={`${templateModal.selectedClasse ? 'bg-blue-700' : 'bg-gray-300'} text-white rounded-full w-5 h-5 flex items-center justify-center text-xs`}>4</span>
                        Brique
                      </label>
                      <select value={templateModal.selectedBrick || ""} onChange={(e) => handleBrickChange(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-400" disabled={templateModal.loading || !templateModal.selectedClasse || !templateModal.bricks.length}>
                        <option value="">{!templateModal.selectedClasse ? "Choisir une classe d'abord" : templateModal.loading ? "Chargement..." : "-- Choisir une brique --"}</option>
                        {[...new Map(templateModal.bricks.map((b: any) => [b.codeBrique, b])).values()].map((brick: any) => <option key={brick.codeBrique} value={brick.codeBrique}>{brick.codeBrique} — {brick.libelleBrique || "(Sans libellé)"}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Rayon — step 5 */}
                  {templateModal.selectedBrick && (
                    <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                      <label className="flex items-center gap-2 text-sm font-bold text-indigo-800 mb-2">
                        <span className={`${templateModal.selectedBrick ? 'bg-indigo-600' : 'bg-gray-300'} text-white rounded-full w-5 h-5 flex items-center justify-center text-xs`}>5</span>
                        Rayon
                        {templateModal.loading && <span className="text-xs text-indigo-400 font-normal ml-1">Chargement...</span>}
                        {!templateModal.loading && templateModal.rayons.length === 0 && (
                          <span className="text-xs text-orange-500 font-normal ml-1">Aucun rayon mappé pour cette brique</span>
                        )}
                      </label>
                      <select
                        value={templateModal.selectedRayon || ""}
                        onChange={(e) => handleRayonChange(e.target.value, templateModal.selectedBrick!)}
                        className="w-full p-2.5 border border-indigo-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-400"
                        disabled={templateModal.loading || !templateModal.rayons.length}
                      >
                        <option value="">{templateModal.loading ? "Chargement des rayons..." : templateModal.rayons.length === 0 ? "Aucun rayon disponible" : "-- Choisir un rayon --"}</option>
                        {templateModal.rayons.map((r: any) => (
                          <option key={r.rayon_code} value={r.rayon_code}>
                            {r.rayon_code}{r.rayon_libelle ? ` — ${r.rayon_libelle}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Ready banner */}
                  {templateModal.selectedRayon && (
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200 flex items-start gap-3">
                      <span className="text-2xl mt-0.5">✅</span>
                      <div>
                        <p className="font-semibold text-green-800 text-sm">Prêt à télécharger</p>
                        <p className="text-green-600 text-xs mt-0.5">
                          Rayon <strong>{templateModal.selectedRayon}</strong> — Brique <strong>{templateModal.selectedBrick}</strong> — champs de base + modèle spécifique + données tarifaires + 6 niveaux UL (PK / AP / CA / DS / PL / MX). Segment, Famille, Classe, Brique et Rayon seront pré-remplis.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== TAB: UPLOAD ===== */}
              {templateModal.activeTab === 'upload' && (
                <div className="p-6 space-y-5">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                    <p className="font-semibold mb-1">📋 Instructions d'import</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-blue-700">
                      <li>Utilisez uniquement le fichier modèle téléchargé depuis cet outil</li>
                      <li>Champs obligatoires : <strong>Marque, GTIN, Libellé Produit, Brique</strong></li>
                      <li>Les champs Unité Logistique (PK, AP, CA, DS, PL, MX) sont optionnels</li>
                      <li>Les colonnes inconnues seront stockées dans les <code>extra_fields</code></li>
                      <li>Un rapport détaillé sera affiché après l'import</li>
                    </ul>
                  </div>

                  <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center bg-blue-50 hover:bg-blue-100 transition-colors">
                    <div className="text-4xl mb-2">📂</div>
                    <p className="text-sm font-semibold text-blue-800 mb-1">Sélectionner votre fichier Excel rempli</p>
                    <p className="text-xs text-blue-500 mb-4">Format accepté : .xlsx (max 20 Mo)</p>
                    <label className="cursor-pointer">
                      <input type="file" accept=".xlsx" className="hidden" onChange={(e) => setImportTemplateFile(e.target.files?.[0] || null)} />
                      <span className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors">
                        Choisir le fichier
                      </span>
                    </label>
                    {importTemplateFile && (
                      <div className="mt-4 flex items-center justify-center gap-2 bg-white border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 font-medium">
                        <span>📄</span>
                        <span>{importTemplateFile.name}</span>
                        <span className="text-blue-400 text-xs">({(importTemplateFile.size / 1024).toFixed(0)} Ko)</span>
                        <button onClick={() => setImportTemplateFile(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">×</button>
                      </div>
                    )}
                  </div>

                  {importTemplateFile && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                      ✅ Fichier prêt. Cliquez sur <strong>Lancer l'import</strong> — un rapport sera généré avec le statut de chaque ligne.
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-between items-center sticky bottom-0 rounded-b-xl border-t">
                <button onClick={() => setTemplateModal(prev => ({...prev, open: false, selectedSegment: null, selectedFamille: null, selectedClasse: null, selectedBrick: null, selectedRayon: null, selectedHierarchies: [], segments: [], familles: [], classes: [], bricks: [], rayons: [], modelFields: [], error: null}))} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm">
                  Fermer
                </button>
                {templateModal.activeTab === 'download' && (
                  <button onClick={handleDownloadTemplate} disabled={!templateModal.selectedRayon || templateModal.loading} className="px-6 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm">
                    {templateModal.loading ? <><span className="animate-spin inline-block">⏳</span> Génération...</> : <>📥 Télécharger le modèle Excel</>}
                  </button>
                )}
                {templateModal.activeTab === 'upload' && (
                  <button onClick={handleImportTemplate} disabled={!importTemplateFile || importingTemplate} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm">
                    {importingTemplate ? <><span className="animate-spin inline-block">⏳</span> Import en cours...</> : <>🚀 Lancer l'import</>}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      {/* Pagination */}
<div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-10 px-4">
  {/* Page info */}
  <div className="text-sm text-slate-500 font-medium">
    Page <span className="text-slate-900 font-semibold">{page}</span> sur{" "}
    <span className="text-slate-900 font-semibold">{totalPages}</span>
    <span className="mx-2 text-slate-300">•</span>
    {products.length} produits
  </div>

  {/* Pagination controls */}
  <div className="flex items-center gap-2">
    <button
      onClick={() => setPage((p) => Math.max(1, p - 1))}
      disabled={page === 1}
      className="
        inline-flex items-center gap-2
        px-4 py-2.5
        rounded-xl
        border border-slate-200
        bg-white
        text-sm font-medium text-slate-700
        shadow-sm
        transition-all duration-200
        hover:bg-slate-50 hover:border-slate-300
        hover:shadow
        disabled:cursor-not-allowed
        disabled:opacity-40
        disabled:hover:bg-white
        disabled:hover:border-slate-200
        disabled:hover:shadow-sm
      "
    >
      <span className="text-base">←</span>
      <span>Précédent</span>
    </button>

    <div
      className="
        min-w-[48px] h-[42px]
        flex items-center justify-center
        rounded-xl
        bg-slate-900
        text-sm font-semibold text-white
        shadow-sm
      "
    >
      {page}
    </div>

    <button
      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
      disabled={page === totalPages}
      className="
        inline-flex items-center gap-2
        px-4 py-2.5
        rounded-xl
        border border-slate-200
        bg-white
        text-sm font-medium text-slate-700
        shadow-sm
        transition-all duration-200
        hover:bg-slate-50 hover:border-slate-300
        hover:shadow
        disabled:cursor-not-allowed
        disabled:opacity-40
        disabled:hover:bg-white
        disabled:hover:border-slate-200
        disabled:hover:shadow-sm
      "
    >
      <span>Suivant</span>
      <span className="text-base">→</span>
    </button>
  </div>
</div>
        {/* ========== RAPPORT MODAL ========== */}
        {rapportModal?.open && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center" onClick={() => setRapportModal(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-xl shadow-2xl w-[95%] max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Rapport header */}
              <div className={`px-6 py-4 rounded-t-xl text-white ${rapportModal.errors === 0 ? 'bg-gradient-to-r from-green-600 to-green-700' : rapportModal.inserted === 0 ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-yellow-500 to-orange-500'}`}>
                <h2 className="text-xl font-bold">Rapport d'Import</h2>
                <div className="flex gap-6 mt-2 text-sm">
                  <span>Total lignes : <strong>{rapportModal.total}</strong></span>
                  <span>✅ Importés : <strong>{rapportModal.inserted}</strong></span>
                  {rapportModal.errors > 0 && <span>❌ Échecs : <strong>{rapportModal.errors}</strong></span>}
                </div>
              </div>

              {/* Summary banner */}
              <div className="px-6 py-3 border-b bg-gray-50">
                {rapportModal.errors === 0 ? (
                  <p className="text-green-700 font-semibold text-sm">🎉 Tous les produits ont été importés avec succès !</p>
                ) : rapportModal.inserted === 0 ? (
                  <p className="text-red-700 font-semibold text-sm">⚠️ Aucun produit importé — veuillez corriger les erreurs et réessayer.</p>
                ) : (
                  <p className="text-orange-700 font-semibold text-sm">⚠️ Import partiel — {rapportModal.inserted} réussi(s), {rapportModal.errors} échec(s). Téléchargez le fichier des lignes en erreur pour les corriger.</p>
                )}
              </div>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
                {rapportModal.results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2 rounded text-sm ${r.status === 'success' ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                    <span className="mt-0.5 flex-shrink-0">{r.status === 'success' ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-700">Ligne {r.row}</span>
                      {r.gtin && <span className="text-gray-500 ml-2">GTIN: {r.gtin}</span>}
                      {r.status === 'success' && r.libelle && <span className="text-green-700 ml-2">— {r.libelle}</span>}
                      {r.status === 'error' && <span className="text-red-700 ml-2 block mt-0.5">{r.error}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-xl flex justify-between items-center">
                <button onClick={() => setRapportModal(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">
                  Fermer
                </button>
                {rapportModal.failedFileBase64 && (
                  <button onClick={handleDownloadFailedFile} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2">
                    📥 Télécharger les lignes en erreur ({rapportModal.errors})
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
        {/* ========== HIGHLIGHT REQUESTS MODAL (admin 999/111 only) ========== */}
        {highlightModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" onClick={() => setHighlightModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 rounded-t-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">🌟 Mises en avant produits</h2>
                  <p className="text-amber-50 text-sm mt-0.5">Approuvez ou refusez les demandes des entités — les produits approuvés apparaissent dans la vitrine de l'app mobile.</p>
                </div>
                <button onClick={() => setHighlightModalOpen(false)} className="text-2xl leading-none hover:opacity-75">✕</button>
              </div>

              <div className="px-6 pt-4 flex gap-2 border-b border-slate-100">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => changeHighlightFilter(s)}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
                      highlightRequestsFilter === s
                        ? "bg-amber-100 text-amber-800 border-b-2 border-amber-500"
                        : "text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {s === 'pending' ? 'En attente' : s === 'approved' ? 'Approuvées' : s === 'rejected' ? 'Refusées' : 'Toutes'}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {highlightRequestsLoading ? (
                  <div className="text-center text-slate-500 py-10">Chargement...</div>
                ) : highlightRequests.length === 0 ? (
                  <div className="text-center text-slate-500 py-10">Aucune demande {highlightRequestsFilter === 'pending' ? 'en attente' : ''} pour le moment.</div>
                ) : (
                  highlightRequests.map((r) => {
                    const firstImage = r.images ? r.images.split(';')[0] : '';
                    return (
                      <div key={r.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl hover:shadow-sm transition">
                        <div className="w-16 h-16 rounded-xl overflow-hidden ring-1 ring-slate-200 flex-shrink-0 bg-slate-50">
                          <img src={getImageUrl(firstImage)} alt={r.libelle} className="w-full h-full object-cover" onError={handleImageError} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{r.libelle}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {r.brand} · GTIN {r.gtin} · <span className="font-medium text-slate-700">{r.entite_name || `Entité ${r.id_entite}`}</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Demandé le {new Date(r.requested_at).toLocaleDateString('fr')} {r.requested_by_email ? `par ${r.requested_by_email}` : ''}
                          </div>
                          {r.status === 'rejected' && r.reject_reason && (
                            <div className="text-xs text-red-600 mt-1">Motif du refus : {r.reject_reason}</div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {r.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                disabled={highlightReviewBusyId === r.id}
                                onClick={() => handleApproveHighlight(r.id)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                              >
                                ✓ Approuver
                              </button>
                              <button
                                disabled={highlightReviewBusyId === r.id}
                                onClick={() => handleRejectHighlight(r.id)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                              >
                                ✕ Refuser
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-semibold ${
                              r.status === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}>
                              {r.status === 'approved' ? "🌟 Approuvée" : "✕ Refusée"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t rounded-b-2xl text-right">
                <button onClick={() => setHighlightModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </div>
    </div>
  );
};
export default CatalogueComplet;