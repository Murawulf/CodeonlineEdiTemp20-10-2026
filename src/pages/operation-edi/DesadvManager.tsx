import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { createApiInstance } from "@/hooks/useApi";
import {
  Truck, Package, Send, Barcode, Tag, Eye, ArrowLeft,
  Search, RefreshCw, CheckCircle, XCircle, Clock, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { useSettings } from "@/contexts/SettingsContext";
import LabelingManager from "../../components/LabelingManager";
import MarkingManager from "../../components/MarkingManager";

// --- Types ---
interface DesadvRecord {
  id: number;
  desadv_number: string;
  original_order_number: string | null;
  buyer_gln: string;
  seller_gln: string;
  delivery_gln: string | null;
  shipping_date: string | null;
  delivery_date: string | null;
  total_packages: number;
  total_weight: number | null;
  status: string;
  direction: string;
  created_at: string;
}

interface PackageRecord {
  id: number;
  id_desadv: number;
  sscc: string;
  package_type: string;
  weight: number | null;
  tracking_number: string | null;
}

interface LineRecord {
  id: number;
  id_desadv: number;
  id_package: number | null;
  line_number: number;
  gtin: string;
  libelle: string | null;
  qty_dispatched: number;
  qty_ordered: number | null;
  batch_number: string | null;
  expiry_date: string | null;
}

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  DRAFT: { color: "bg-gray-100 text-gray-700 border-gray-200", icon: <FileText size={14} />, label: "Brouillon" },
  GENERATED: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: <FileText size={14} />, label: "Généré" },
  SENT: { color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle size={14} />, label: "Envoyé" },
  PENDING: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock size={14} />, label: "En attente" },
  RECEIVED: { color: "bg-purple-100 text-purple-700 border-purple-200", icon: <Package size={14} />, label: "Reçu" },
  PROCESSED: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle size={14} />, label: "Traité" },
  ERROR: { color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle size={14} />, label: "Erreur" },
  ACKNOWLEDGED: { color: "bg-green-100 text-green-800 border-green-300", icon: <CheckCircle size={14} />, label: "Acquitté" },
  REJECTED: { color: "bg-red-100 text-red-800 border-red-300", icon: <XCircle size={14} />, label: "Rejeté" },
};

export default function DesadvManager(): JSX.Element {
  const { settings, getLocalApiUrl, getServerUrl, getCurrentCountryInfo } = useSettings();
  const currentCountryInfo = getCurrentCountryInfo();
  const DEFAULT_BACKEND_URL = getLocalApiUrl();

  const [activeTab, setActiveTab] = useState("outbound");
  const [desadvList, setDesadvList] = useState<DesadvRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDesadv, setSelectedDesadv] = useState<DesadvRecord | null>(null);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [lines, setLines] = useState<LineRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const api = useMemo(() => createApiInstance(DEFAULT_BACKEND_URL), [DEFAULT_BACKEND_URL]);

  // Fetch DESADV list
  const fetchDesadvList = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/edi/desadv?direction=${activeTab === "outbound" ? "OUTBOUND" : "INBOUND"}`);
      setDesadvList(res.data.data || res.data || []);
    } catch (err: any) {
      // Fallback: query transmissions table
      try {
        const res = await api.get(`/api/edi/transmissions?type=DESADV&direction=${activeTab === "outbound" ? "OUTBOUND" : "INBOUND"}`);
        setDesadvList(res.data.data || []);
      } catch {
        console.error("Error fetching DESADV list:", err);
        toast({ title: "Erreur", description: "Impossible de charger les DESADV", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDesadvList();
  }, [activeTab]);

  // Fetch DESADV detail (packages + lines)
  const fetchDesadvDetail = async (desadv: DesadvRecord) => {
    setSelectedDesadv(desadv);
    setLoadingDetail(true);
    try {
      const [pkgRes, lineRes] = await Promise.all([
        api.get(`/api/edi/desadv/${desadv.id}/packages`).catch(() => ({ data: { data: [] } })),
        api.get(`/api/edi/desadv/${desadv.id}/lines`).catch(() => ({ data: { data: [] } })),
      ]);
      setPackages(pkgRes.data.data || pkgRes.data || []);
      setLines(lineRes.data.data || lineRes.data || []);
    } catch (err) {
      console.error("Error fetching DESADV detail:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filtered list
  const filteredList = desadvList.filter(d => {
    const term = searchTerm.toLowerCase();
    return (
      (d.desadv_number || "").toLowerCase().includes(term) ||
      (d.original_order_number || "").toLowerCase().includes(term) ||
      (d.buyer_gln || "").includes(term) ||
      (d.seller_gln || "").includes(term)
    );
  });

  const getStatusBadge = (status: string) => {
    const cfg = statusConfig[status] || statusConfig.DRAFT;
    return (
      <Badge variant="outline" className={`${cfg.color} flex items-center gap-1`}>
        {cfg.icon} {cfg.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 backdrop-blur-sm p-4 md:p-6 space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-blue-950 flex items-center gap-2">
            <Truck className="h-8 w-8 text-blue-600" />
            Gestion DESADV — Étiquetage & Marquage
          </h1>
          <p className="text-gray-500">
            Suivi des avis d'expédition, étiquetage logistique GS1-128 et marquage produit
          </p>
        </div>
        <div className="flex gap-2">
          <MarkingManager apiUrl={DEFAULT_BACKEND_URL} />
          <Button onClick={() => window.location.href = "/operation-edi/shipments"} className="bg-blue-600 hover:bg-blue-700">
            <Send className="mr-2 h-4 w-4" />
            Nouvelle Expédition
          </Button>
        </div>
      </div>

      {/* Detail View */}
      {selectedDesadv ? (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => { setSelectedDesadv(null); setPackages([]); setLines([]); }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la liste
          </Button>

          {/* DESADV Header */}
          <Card className="border-blue-100">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    DESADV {selectedDesadv.desadv_number}
                  </CardTitle>
                  <CardDescription>
                    {selectedDesadv.direction === "OUTBOUND" ? "Expédié" : "Reçu"} le{" "}
                    {new Date(selectedDesadv.created_at).toLocaleString("fr-FR")}
                  </CardDescription>
                </div>
                {getStatusBadge(selectedDesadv.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Commande</p>
                  <p className="font-mono font-bold">{selectedDesadv.original_order_number || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Acheteur (GLN)</p>
                  <p className="font-mono text-sm">{selectedDesadv.buyer_gln || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vendeur (GLN)</p>
                  <p className="font-mono text-sm">{selectedDesadv.seller_gln || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Livraison (GLN)</p>
                  <p className="font-mono text-sm">{selectedDesadv.delivery_gln || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date expédition</p>
                  <p className="font-medium">{selectedDesadv.shipping_date ? new Date(selectedDesadv.shipping_date).toLocaleDateString("fr-FR") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date livraison estimée</p>
                  <p className="font-medium">{selectedDesadv.delivery_date ? new Date(selectedDesadv.delivery_date).toLocaleDateString("fr-FR") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total colis</p>
                  <p className="font-bold text-lg">{selectedDesadv.total_packages || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Poids total</p>
                  <p className="font-bold text-lg">{selectedDesadv.total_weight ? `${selectedDesadv.total_weight} kg` : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Packages */}
          <Card className="border-purple-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                Colis & SSCC ({packages.length})
              </CardTitle>
              <CardDescription>Unités logistiques avec identification SSCC</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDetail ? (
                <div className="text-center py-4 text-gray-500">Chargement...</div>
              ) : packages.length === 0 ? (
                <div className="text-center py-4 text-gray-400">Aucun colis trouvé</div>
              ) : (
                <div className="space-y-3">
                  {packages.map((pkg) => {
                    const pkgLines = lines.filter(l => l.id_package === pkg.id);
                    return (
                      <div key={pkg.id} className="border rounded-lg p-4 bg-purple-50/50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Barcode className="h-4 w-4 text-purple-600" />
                              <span className="font-mono font-bold text-purple-900">(00) {pkg.sscc}</span>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                              <span>Type: <strong>{pkg.package_type === "PX" ? "Palette" : "Carton"}</strong></span>
                              {pkg.weight && <span>Poids: <strong>{pkg.weight} kg</strong></span>}
                              {pkg.tracking_number && <span>Tracking: <strong>{pkg.tracking_number}</strong></span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <LabelingManager
                              sscc={pkg.sscc}
                              packageData={{ type: pkg.package_type, weight: pkg.weight || 0 }}
                              shipmentData={{
                                sender: { name: "Expéditeur", gln: selectedDesadv.seller_gln },
                                receiver: { name: "Destinataire", gln: selectedDesadv.buyer_gln },
                                carrier: undefined,
                                dateExpedition: selectedDesadv.shipping_date || ""
                              }}
                              items={pkgLines.map(l => ({
                                gtin: l.gtin,
                                quantity: l.qty_dispatched,
                                description: l.libelle || undefined,
                                batchNumber: l.batch_number || undefined,
                                expiryDate: l.expiry_date || undefined,
                              }))}
                              apiUrl={DEFAULT_BACKEND_URL}
                            />
                          </div>
                        </div>

                        {/* Items in this package */}
                        {pkgLines.length > 0 && (
                          <div className="border rounded overflow-hidden bg-white">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="text-left p-2 text-xs">N°</th>
                                  <th className="text-left p-2 text-xs">GTIN</th>
                                  <th className="text-left p-2 text-xs">Description</th>
                                  <th className="text-right p-2 text-xs">Qté exp.</th>
                                  <th className="text-right p-2 text-xs">Qté cmd.</th>
                                  <th className="text-left p-2 text-xs">Lot</th>
                                  <th className="text-left p-2 text-xs">DLC</th>
                                  <th className="text-center p-2 text-xs">Marquage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pkgLines.map((line) => (
                                  <tr key={line.id} className="border-t hover:bg-gray-50">
                                    <td className="p-2">{line.line_number}</td>
                                    <td className="p-2 font-mono text-xs">{line.gtin}</td>
                                    <td className="p-2 text-sm">{line.libelle || "—"}</td>
                                    <td className="p-2 text-right font-bold">{line.qty_dispatched}</td>
                                    <td className="p-2 text-right text-gray-500">{line.qty_ordered || "—"}</td>
                                    <td className="p-2">
                                      {line.batch_number ? (
                                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                                          {line.batch_number}
                                        </Badge>
                                      ) : "—"}
                                    </td>
                                    <td className="p-2 text-xs">
                                      {line.expiry_date ? new Date(line.expiry_date).toLocaleDateString("fr-FR") : "—"}
                                    </td>
                                    <td className="p-2 text-center">
                                      <MarkingManager
                                        apiUrl={DEFAULT_BACKEND_URL}
                                        initialGtin={line.gtin}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unpackaged Lines */}
          {lines.filter(l => !l.id_package).length > 0 && (
            <Card className="border-gray-200">
              <CardHeader>
                <CardTitle>Lignes sans colis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-2 text-xs">N°</th>
                        <th className="text-left p-2 text-xs">GTIN</th>
                        <th className="text-left p-2 text-xs">Description</th>
                        <th className="text-right p-2 text-xs">Qté exp.</th>
                        <th className="text-left p-2 text-xs">Lot</th>
                        <th className="text-left p-2 text-xs">DLC</th>
                        <th className="text-center p-2 text-xs">Marquage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.filter(l => !l.id_package).map((line) => (
                        <tr key={line.id} className="border-t hover:bg-gray-50">
                          <td className="p-2">{line.line_number}</td>
                          <td className="p-2 font-mono text-xs">{line.gtin}</td>
                          <td className="p-2">{line.libelle || "—"}</td>
                          <td className="p-2 text-right font-bold">{line.qty_dispatched}</td>
                          <td className="p-2">
                            {line.batch_number ? (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                                {line.batch_number}
                              </Badge>
                            ) : "—"}
                          </td>
                          <td className="p-2 text-xs">
                            {line.expiry_date ? new Date(line.expiry_date).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="p-2 text-center">
                            <MarkingManager apiUrl={DEFAULT_BACKEND_URL} initialGtin={line.gtin} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* List View */
        <div className="space-y-4">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex justify-between items-center mb-4">
              <TabsList>
                <TabsTrigger value="outbound" className="flex items-center gap-1">
                  <Send size={14} /> Expédiés
                </TabsTrigger>
                <TabsTrigger value="inbound" className="flex items-center gap-1">
                  <Package size={14} /> Reçus
                </TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button variant="outline" onClick={fetchDesadvList}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            <TabsContent value={activeTab}>
              {loading ? (
                <div className="text-center py-12 text-gray-500">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                  Chargement des DESADV...
                </div>
              ) : filteredList.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Truck className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Aucun DESADV {activeTab === "outbound" ? "expédié" : "reçu"} trouvé</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600">N° DESADV</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600">Commande</th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600">
                          {activeTab === "outbound" ? "Destinataire" : "Expéditeur"}
                        </th>
                        <th className="text-left p-3 text-xs font-semibold text-gray-600">Date expédition</th>
                        <th className="text-center p-3 text-xs font-semibold text-gray-600">Colis</th>
                        <th className="text-center p-3 text-xs font-semibold text-gray-600">Statut</th>
                        <th className="text-right p-3 text-xs font-semibold text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map((desadv) => (
                        <tr key={desadv.id} className="border-t hover:bg-blue-50/50 transition-colors">
                          <td className="p-3 font-mono font-bold text-blue-900">{desadv.desadv_number}</td>
                          <td className="p-3 font-mono text-sm">{desadv.original_order_number || "—"}</td>
                          <td className="p-3 font-mono text-xs text-gray-600">
                            {activeTab === "outbound" ? desadv.buyer_gln : desadv.seller_gln}
                          </td>
                          <td className="p-3 text-sm">
                            {desadv.shipping_date ? new Date(desadv.shipping_date).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline">{desadv.total_packages || 0}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            {getStatusBadge(desadv.status)}
                          </td>
                          <td className="p-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fetchDesadvDetail(desadv)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              Détails
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
