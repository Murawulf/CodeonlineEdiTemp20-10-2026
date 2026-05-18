import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { createApiInstance } from "@/hooks/useApi";
import { useSettings } from "@/contexts/SettingsContext";
import { format } from "date-fns";
import { 
  Box, 
  Truck, 
  Package, 
  ArrowRight, 
  Plus, 
  Trash2, 
  Check, 
  Search, 
  Printer, 
  Send,
  Barcode,
  Info,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import ShippingLabelModal from "../../components/ShippingLabelModal";
import LabelingManager from "../../components/LabelingManager";
import MarkingManager from "../../components/MarkingManager";

// --- Types ---

interface OrderLine {
  id: number; // or string depending on DB
  gtin: string;
  libelle: string;
  qty: number; // Qty ordered/confirmed
  qtyPacked: number; // Qty already assigned to packages
}

interface Order {
  id_order: string;
  num_order: string;
  buyer_name: string;
  buyer_gln: string; // We might need to fetch this or ensure it's in the order object
  date_reception: string;
  lines: OrderLine[];
  // Extra fields for logic
  id_entite: string; // Seller ID
  id_entite_buyer: string;
  lieu_livraison_gln?: string;
  statut?: string; // Status from DB (e.g., 'received', 'accepted', 'shipped')
}

interface PackedItem {
  gtin: string;
  libelle: string;
  quantity: number;
  lineNumber: number;
  batchNumber?: string;
  expiryDate?: string;
}

interface ShipmentPackage {
  id: string; // internal temp ID
  sscc: string;
  type: "CT" | "PX"; // Carton or Pallet
  weight?: number;
  trackingNumber?: string;
  items: PackedItem[];
}

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

export default function Shipments(): JSX.Element {
  const { settings, getLocalApiUrl, getServerUrl, getCurrentCountryInfo } = useSettings();
  const currentCountryInfo = getCurrentCountryInfo();

  // Construct SERVERS list dynamically from settings
  const SERVERS = useMemo(() => [
    { id: "all", label: "Tous les serveurs", baseURL: "" },
    { 
      id: "senegal", 
      label: currentCountryInfo.id === 'senegal' ? "Sénégal (Local)" : "Sénégal",
      baseURL: getServerUrl('senegal')
    },
    { 
      id: "tunisia", 
      label: currentCountryInfo.id === 'tunisia' ? "Tunisie (Local)" : "Tunisie",
      baseURL: getServerUrl('tunisia')
    },
  ], [getServerUrl, currentCountryInfo]);

  const DEFAULT_BACKEND_URL = getLocalApiUrl();

  const createApi = (baseURL: string) => createApiInstance(baseURL || DEFAULT_BACKEND_URL);

  const currentUser = getCurrentUser();
  const currentEntiteId = currentUser.id_entite || null;
  const currentGLN = currentUser.gln || "6191907700002"; // Fallback seller GLN

  // State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Packing State
  const [packages, setPackages] = useState<ShipmentPackage[]>([]);
  const [unpackedItems, setUnpackedItems] = useState<OrderLine[]>([]);
  
  // Transport Details State
  const [transportDetails, setTransportDetails] = useState({
    carrierName: "",
    vehicleId: "",
    driverName: "",
    dateExpedition: format(new Date(), "yyyy-MM-dd"),
    dateDelivery: "",
    trackingNumber: ""
  });

  // UI State
  const [isGeneratingSSCC, setIsGeneratingSSCC] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSSCCModal, setShowSSCCModal] = useState(false);
  const [lastGeneratedSSCC, setLastGeneratedSSCC] = useState("");
  
  // Label Modal State
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [selectedPackageForLabel, setSelectedPackageForLabel] = useState<ShipmentPackage | null>(null);

  // Load Orders (Incoming orders that we need to ship)
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      // Use local server for now
      const api = createApi(DEFAULT_BACKEND_URL); 
      const res = await api.get("/api/orders/incoming", { headers: { "x-entite-id": currentEntiteId } });
      
      // Filter orders? Maybe only 'accepted' ones?
      // For now, take all 'Reçue' orders.
      const mappedOrders = res.data.orders.map((o: any) => ({
        ...o,
        // Ensure lines are loaded (the endpoint usually returns them)
        lines: o.lines || []
      }));
      setOrders(mappedOrders);
    } catch (err) {
      console.error("Error loading orders:", err);
      toast({ title: "Erreur", description: "Impossible de charger les commandes à expédier.", variant: "destructive" });
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    // Initialize unpacked items
    const items = order.lines.map(l => ({
      ...l,
      qtyPacked: 0
    }));
    setUnpackedItems(items);
    setPackages([]);
    setTransportDetails({
      ...transportDetails,
      dateDelivery: order.date_reception ? format(new Date(order.date_reception), "yyyy-MM-dd") : "" // Just a guess
    });
  };

  const generateSSCC = async () => {
    setIsGeneratingSSCC(true);
    try {
      const api = createApi(DEFAULT_BACKEND_URL);
      // Use user's GLN prefix (first 7-9 digits)
      // Fallback to a default if not available
      const prefix = currentGLN ? currentGLN.substring(0, 8) : "61919077";
      const res = await api.get(`/api/utils/sscc?prefix=${prefix}`);
      return res.data.sscc;
    } catch (err) {
      console.error("Error generating SSCC:", err);
      toast({ title: "Erreur", description: "Échec de la génération SSCC", variant: "destructive" });
      return null;
    } finally {
      setIsGeneratingSSCC(false);
    }
  };

  const handleAddPackage = async (type: "CT" | "PX") => {
    const sscc = await generateSSCC();
    if (!sscc) return;

    const newPackage: ShipmentPackage = {
      id: Date.now().toString(),
      sscc,
      type,
      items: [],
      weight: 0
    };

    setPackages([...packages, newPackage]);
    setLastGeneratedSSCC(sscc);
    // Optional: Auto-show label modal
  };

  const handlePackItem = (packageIndex: number, lineIndex: number) => {
    const pkg = packages[packageIndex];
    const item = unpackedItems[lineIndex];

    if (item.qty - item.qtyPacked <= 0) return;

    // Ask for quantity? For now assume 1 or max available
    // Let's keep it simple: Pack 1 unit at a time or All?
    // We'll pack 1 unit for now, or maybe prompt.
    // To simplify UI, let's just pack ALL remaining quantity of this line into the package.
    
    const qtyToPack = item.qty - item.qtyPacked;

    // Update Package
    const updatedPackage = { ...pkg };
    const existingItemInPackage = updatedPackage.items.find(i => i.gtin === item.gtin);
    
    if (existingItemInPackage) {
      existingItemInPackage.quantity += qtyToPack;
    } else {
      updatedPackage.items.push({
        gtin: item.gtin,
        libelle: item.libelle,
        quantity: qtyToPack,
        lineNumber: lineIndex + 1 // Assuming 1-based index
      });
    }

    // Update Packages State
    const newPackages = [...packages];
    newPackages[packageIndex] = updatedPackage;
    setPackages(newPackages);

    // Update Unpacked Items State
    const newUnpacked = [...unpackedItems];
    newUnpacked[lineIndex].qtyPacked += qtyToPack;
    setUnpackedItems(newUnpacked);
  };

  const handleRemovePackage = (index: number) => {
    const pkg = packages[index];
    // Return items to unpacked
    const newUnpacked = [...unpackedItems];
    pkg.items.forEach(pItem => {
      const line = newUnpacked.find(l => l.gtin === pItem.gtin);
      if (line) {
        line.qtyPacked -= pItem.quantity;
      }
    });
    setUnpackedItems(newUnpacked);
    
    const newPackages = packages.filter((_, i) => i !== index);
    setPackages(newPackages);
  };

  const handleSendDESADV = async () => {
    if (!selectedOrder) return;
    if (packages.length === 0) {
      toast({ title: "Attention", description: "Aucun colis créé. Veuillez créer au moins un colis.", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const api = createApi(DEFAULT_BACKEND_URL);
      
      const payload = {
        desadvNumber: `DES${Date.now()}`, // Auto-generate
        orderNumber: selectedOrder.num_order,
        orderId: selectedOrder.id_order,
        buyer: { gln: "6193608600001" }, // TODO: Fetch real buyer GLN from order (fetch Entite details)
        seller: { gln: currentGLN },
        delivery: { gln: selectedOrder.lieu_livraison_gln || "6193608600001" }, // Default to buyer if missing
        dateExpedition: transportDetails.dateExpedition,
        dateDelivery: transportDetails.dateDelivery,
        transport: {
          carrier: transportDetails.carrierName,
          carrierName: transportDetails.carrierName,
          vehicle: transportDetails.vehicleId,
          mode: "30" // Road
        },
        packages: packages.map(p => ({
          sscc: p.sscc,
          type: p.type,
          weight: p.weight,
          items: p.items.map(i => ({
             lineNumber: i.lineNumber,
             gtin: i.gtin,
             description: i.libelle,
             quantity: i.quantity,
             batchNumber: i.batchNumber || null,
             expiryDate: i.expiryDate || null,
          }))
        }))
      };

      console.log("Sending DESADV Payload:", payload);

      const res = await api.post("/api/edi/desadv/send", payload);
      
      if (res.data.success) {
        toast({ 
          title: "Expédition Confirmée", 
          description: `DESADV envoyé avec succès (ID: ${res.data.desadvId})`,
          className: "bg-green-600 text-white"
        });
        // Reset or redirect
        setSelectedOrder(null);
        setPackages([]);
      }
    } catch (err: any) {
      console.error("Error sending DESADV:", err);
      toast({ 
        title: "Erreur", 
        description: err.response?.data?.error || "Échec de l'envoi du DESADV", 
        variant: "destructive" 
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 backdrop-blur-sm p-4 md:p-6 space-y-6">
      <Toaster />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-blue-950 flex items-center gap-2">
            <Truck className="h-8 w-8 text-blue-600" />
            Expéditions (DESADV)
          </h1>
          <p className="text-gray-500">Préparez vos expéditions, générez les SSCC et envoyez les avis d'expédition.</p>
        </div>
      </div>

      {!selectedOrder ? (
        /* --- ORDER SELECTION --- */
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>Sélectionner une commande à expédier</CardTitle>
            <CardDescription>Liste des commandes reçues en attente de traitement logistique</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="text-center py-8">Chargement des commandes...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucune commande reçue trouvée.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.map(order => (
                  <div 
                    key={order.id_order} 
                    onClick={() => handleSelectOrder(order)}
                    className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono font-bold text-blue-900">{order.num_order}</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Reçue</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mb-1">Client: <span className="font-medium text-gray-900">{order.buyer_name}</span></div>
                    <div className="text-sm text-gray-600 mb-3">Date: {new Date(order.date_reception).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400 group-hover:text-blue-600 flex items-center gap-1">
                      {order.lines.length} articles <ArrowRight size={14} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* --- PACKING INTERFACE --- */
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="flex items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
             <Button variant="ghost" onClick={() => setSelectedOrder(null)} size="sm">
               <ArrowLeft size={16} className="mr-2" /> Retour
             </Button>
             <div className="h-8 w-px bg-gray-200"></div>
             <div>
               <div className="text-sm text-gray-500">Commande</div>
               <div className="font-bold font-mono">{selectedOrder.num_order}</div>
             </div>
             <div className="ml-auto flex gap-3">
               <Button onClick={() => handleAddPackage('CT')} variant="outline" disabled={isGeneratingSSCC}>
                 <Package size={16} className="mr-2" /> 
                 {isGeneratingSSCC ? "Génération..." : "Nouveau Carton (SSCC)"}
               </Button>
               <Button onClick={() => handleAddPackage('PX')} variant="outline" disabled={isGeneratingSSCC}>
                 <Box size={16} className="mr-2" /> 
                 {isGeneratingSSCC ? "Génération..." : "Nouvelle Palette (SSCC)"}
               </Button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT: Unpacked Items */}
            <Card className="lg:col-span-1 h-fit">
              <CardHeader className="bg-gray-50 pb-3">
                <CardTitle className="text-sm uppercase text-gray-500">Articles à emballer</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {unpackedItems.map((item, idx) => {
                    const remaining = item.qty - item.qtyPacked;
                    if (remaining <= 0) return null;
                    return (
                      <div key={idx} className="p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start">
                           <div>
                             <div className="font-medium text-sm">{item.libelle}</div>
                             <div className="text-xs text-gray-400 font-mono">{item.gtin}</div>
                           </div>
                           <Badge variant={remaining === 0 ? "outline" : "default"} className={remaining > 0 ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : ""}>
                             x{remaining}
                           </Badge>
                        </div>
                        {/* Quick Add to Latest Package */}
                        {packages.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dashed flex justify-end">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 text-xs text-blue-600"
                              onClick={() => handlePackItem(packages.length - 1, idx)}
                            >
                              Ajouter au dernier colis <ArrowRight size={12} className="ml-1"/>
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unpackedItems.every(i => i.qty - i.qtyPacked <= 0) && (
                    <div className="p-8 text-center text-gray-400">
                      <Check size={48} className="mx-auto mb-2 text-green-200" />
                      <div>Tous les articles sont emballés !</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* RIGHT: Packages */}
            <div className="lg:col-span-2 space-y-4">
              {packages.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
                  <Package size={64} className="mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">Aucun colis créé</p>
                  <p>Commencez par ajouter un carton ou une palette pour y placer des articles.</p>
                </div>
              ) : (
                packages.map((pkg, pkgIdx) => (
                  <Card key={pkg.id} className="border-l-4 border-l-blue-500 overflow-hidden">
                    <div className="bg-gray-50 p-3 flex justify-between items-center border-b">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-1.5 rounded border">
                           {pkg.type === 'PX' ? <Box size={20} className="text-orange-600" /> : <Package size={20} className="text-blue-600" />}
                        </div>
                        <div>
                          <div className="font-mono font-bold text-sm tracking-wide">{pkg.sscc}</div>
                          <div className="text-xs text-gray-500">{pkg.type === 'PX' ? 'Palette' : 'Carton'} • {pkg.items.reduce((s, i) => s + i.quantity, 0)} articles</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemovePackage(pkgIdx)}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-0">
                      {pkg.items.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-400 italic">Vide (Glissez des articles ici ou utilisez "Ajouter")</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50/50 text-xs text-gray-500 uppercase">
                            <tr>
                              <th className="px-3 py-2 text-left">Article</th>
                              <th className="px-3 py-2 text-right">Qté</th>
                              <th className="px-3 py-2 text-left">Lot (Batch)</th>
                              <th className="px-3 py-2 text-left">DLC (Expiry)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {pkg.items.map((pItem, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2">
                                  <div>{pItem.libelle}</div>
                                  <div className="text-xs text-gray-400 font-mono">{pItem.gtin}</div>
                                </td>
                                <td className="px-3 py-2 text-right font-medium">{pItem.quantity}</td>
                                <td className="px-3 py-1">
                                  <Input
                                    className="h-7 text-xs bg-white"
                                    placeholder="LOT..."
                                    value={pItem.batchNumber || ""}
                                    onChange={(e) => {
                                      const newPkgs = [...packages];
                                      newPkgs[pkgIdx].items[i].batchNumber = e.target.value;
                                      setPackages(newPkgs);
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-1">
                                  <Input
                                    type="date"
                                    className="h-7 text-xs bg-white"
                                    value={pItem.expiryDate || ""}
                                    onChange={(e) => {
                                      const newPkgs = [...packages];
                                      newPkgs[pkgIdx].items[i].expiryDate = e.target.value;
                                      setPackages(newPkgs);
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </CardContent>
                    <div className="bg-gray-50 p-3 border-t flex items-center gap-4">
                       <div className="flex-1">
                         <Label className="text-xs">Poids (kg)</Label>
                         <Input 
                           type="number" 
                           className="h-8 mt-1 bg-white" 
                           placeholder="0.00" 
                           value={pkg.weight || ""}
                           onChange={(e) => {
                             const newPkgs = [...packages];
                             newPkgs[pkgIdx].weight = parseFloat(e.target.value);
                             setPackages(newPkgs);
                           }}
                         />
                       </div>
                       <div className="flex-1">
                          <Label className="text-xs">Tracking (Optionnel)</Label>
                          <Input 
                            className="h-8 mt-1 bg-white" 
                            placeholder="N° Suivi"
                            value={pkg.trackingNumber || ""}
                            onChange={(e) => {
                              const newPkgs = [...packages];
                              newPkgs[pkgIdx].trackingNumber = e.target.value;
                              setPackages(newPkgs);
                            }}
                          />
                       </div>
                       <div className="pt-5 flex gap-2">
                          {/* GS1 Label Button (Étiquetage) */}
                          <LabelingManager
                            sscc={pkg.sscc}
                            packageData={{ type: pkg.type, weight: pkg.weight || 0 }}
                            shipmentData={{
                              sender: { name: "Expéditeur", gln: currentGLN },
                              receiver: { name: selectedOrder?.buyer_name || "", gln: selectedOrder?.buyer_gln || "" },
                              carrier: transportDetails.carrierName || undefined,
                              dateExpedition: transportDetails.dateExpedition
                            }}
                            items={pkg.items.map(i => ({
                              gtin: i.gtin,
                              quantity: i.quantity,
                              description: i.libelle,
                              batchNumber: i.batchNumber,
                              expiryDate: i.expiryDate,
                            }))}
                            apiUrl={DEFAULT_BACKEND_URL}
                          />
                          {/* Legacy Label Button */}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="gap-2"
                            onClick={() => {
                              setSelectedPackageForLabel(pkg);
                              setLabelModalOpen(true);
                            }}
                          >
                             <Printer size={14} /> Étiquette simple
                          </Button>
                       </div>
                    </div>
                  </Card>
                ))
              )}
            </div>

          </div>

          {/* Transport Details & Submit */}
          <Card>
            <CardHeader>
              <CardTitle>Détails du Transport</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                   <Label>Transporteur</Label>
                   <Input 
                     value={transportDetails.carrierName} 
                     onChange={e => setTransportDetails({...transportDetails, carrierName: e.target.value})}
                     placeholder="Nom du transporteur" 
                   />
                </div>
                <div>
                   <Label>Véhicule / Immatriculation</Label>
                   <Input 
                     value={transportDetails.vehicleId} 
                     onChange={e => setTransportDetails({...transportDetails, vehicleId: e.target.value})}
                     placeholder="AB-123-CD" 
                   />
                </div>
                <div>
                   <Label>Date Expédition</Label>
                   <Input 
                     type="date" 
                     value={transportDetails.dateExpedition} 
                     onChange={e => setTransportDetails({...transportDetails, dateExpedition: e.target.value})}
                   />
                </div>
                <div>
                   <Label>Date Livraison Estimée</Label>
                   <Input 
                     type="date" 
                     value={transportDetails.dateDelivery} 
                     onChange={e => setTransportDetails({...transportDetails, dateDelivery: e.target.value})}
                   />
                </div>
              </div>
            </CardContent>
            <div className="p-6 bg-gray-50 border-t flex justify-between items-center">
              <div className="text-sm text-gray-500">
                {packages.length} colis • {packages.reduce((acc, p) => acc + (p.items?.length || 0), 0)} lignes
              </div>
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 gap-2" 
                onClick={handleSendDESADV}
                disabled={isSending || packages.length === 0}
              >
                {isSending ? (
                  "Envoi en cours..."
                ) : (
                  <>
                    <Send size={18} /> Générer & Envoyer DESADV
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
      
      {/* Shipping Label Modal */}
      {selectedPackageForLabel && selectedOrder && (
        <ShippingLabelModal
          isOpen={labelModalOpen}
          onClose={() => setLabelModalOpen(false)}
          packageData={selectedPackageForLabel}
          shipmentData={{
            sender: {
              name: "Yutex Sarl99", // Should fetch from currentUser entity details
              gln: currentGLN,
              address: "Zone Industrielle, Tunis"
            },
            receiver: {
              name: selectedOrder.buyer_name,
              gln: selectedOrder.buyer_gln || "6193608600001",
              address: "Adresse Client..."
            },
            carrier: transportDetails.carrierName,
            dateExpedition: transportDetails.dateExpedition
          }}
        />
      )}
    </div>
  );
};
