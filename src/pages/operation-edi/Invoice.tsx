import React, { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Eye, 
  Send, 
  ArrowLeft,
  Check,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { useSettings } from "@/contexts/SettingsContext";

// --- Types ---
interface Invoice {
  id: number;
  invoic_number: string;
  date_facture: string;
  buyer_gln: string;
  total_ht: number;
  total_ttc: number;
  status: string;
  currency: string;
}

interface InvoiceLine {
  line_number: number;
  gtin: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_amount: number;
}

// Helper to create API instance
const createApiInstance = (baseURL: string, pin: string = "3311") => axios.create({
  baseURL,
  headers: { "x-api-pin": pin, "Content-Type": "application/json" },
});

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

const Invoices: React.FC = () => {
  const { settings, getApiUrl } = useSettings();
  const currentUser = getCurrentUser();
  
  const API_BASE_URL = getApiUrl() + "/api"; // Adjusting for existing logic which appends /api sometimes
  const API_PIN = (localStorage.getItem('pin') || settings.API_PIN || "3311") as string;

  const createApi = () => createApiInstance(API_BASE_URL, API_PIN);
  
  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Order Selection State
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Create Form State
  const [newInvoice, setNewInvoice] = useState({
    invoic_number: `INV${Date.now()}`,
    date_facture: format(new Date(), "yyyy-MM-dd"),
    buyer_gln: "",
    order_reference: "",
    id_order: "",
    desadv_reference: "",
    currency: "EUR",
    lines: [] as InvoiceLine[]
  });

  useEffect(() => {
    loadInvoices();
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const api = createApi();
      // Fetch incoming orders (where we are the seller)
      const res = await api.get("/orders/incoming", { 
        headers: { "x-entite-id": currentUser.id_entite } 
      });
      setAvailableOrders(res.data.orders || []);
    } catch (err) {
      console.error("Error loading orders:", err);
    }
  };

  const handleSelectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    if (!orderId) return;

    try {
      const api = createApi();
      // Fetch full order details
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data;

      // Populate invoice from order
      setNewInvoice(prev => ({
        ...prev,
        id_order: order.id_order,
        buyer_gln: order.acheteur_gln || "",
        order_reference: order.num_order || order.num_commande || "",
        desadv_reference: order.desadvNumber || "",
        currency: order.currency || "EUR",
        lines: order.lines?.map((l: any, idx: number) => ({
          line_number: idx + 1,
          gtin: l.gtin,
          description: l.libelle,
          quantity: l.qty,
          unit_price: l.price || 0,
          tax_rate: 20, // Default tax rate
          line_amount: (l.qty * (l.price || 0))
        })) || []
      }));
    } catch (err) {
      console.error("Error fetching order details:", err);
      toast({ title: "Erreur", description: "Impossible de récupérer les détails de la commande", variant: "destructive" });
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const api = createApi();
      const res = await api.get("/invoices");
      setInvoices(res.data);
    } catch (err) {
      console.error("Error loading invoices:", err);
      toast({ title: "Erreur", description: "Impossible de charger les factures.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async () => {
    try {
      const api = createApi();
      const payload = {
        ...newInvoice,
        seller_gln: currentUser.gln || "6191907700002", // Fallback
        total_ht: newInvoice.lines.reduce((s, l) => s + l.line_amount, 0),
        total_tax: newInvoice.lines.reduce((s, l) => s + (l.line_amount * l.tax_rate / 100), 0),
        total_ttc: newInvoice.lines.reduce((s, l) => s + (l.line_amount * (1 + l.tax_rate / 100)), 0)
      };
      
      await api.post("/invoices", payload);
      toast({ title: "Succès", description: "Facture créée avec succès" });
      setShowCreateModal(false);
      loadInvoices();
    } catch (err) {
      console.error("Error creating invoice:", err);
      toast({ title: "Erreur", description: "Échec de la création", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette facture ?")) return;
    try {
      const api = createApi();
      await api.delete(`/invoices/${id}`);
      toast({ title: "Succès", description: "Facture supprimée" });
      loadInvoices();
    } catch (err) {
      console.error("Error deleting invoice:", err);
      toast({ title: "Erreur", description: "Échec de la suppression", variant: "destructive" });
    }
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    if (invoice.status === 'SENT') {
      toast({ title: "Déjà envoyé", description: "Cette facture a déjà été transmise.", variant: "default" });
      return;
    }
    
    if (!confirm(`Envoyer la facture ${invoice.invoic_number} via EDI ?`)) return;

    setIsSending(true);
    try {
      const api = createApi();
      await api.post(`/invoices/${invoice.id}/send`);
      toast({ 
        title: "Envoyé avec succès", 
        description: `La facture ${invoice.invoic_number} a été transmise (INVOIC).`,
        className: "bg-green-600 text-white" 
      });
      loadInvoices();
    } catch (err) {
      console.error("Error sending invoice:", err);
      toast({ title: "Erreur", description: "Échec de l'envoi EDI", variant: "destructive" });
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
            <FileText className="h-8 w-8 text-blue-600" />
            Facturation (INVOIC)
          </h1>
          <p className="text-gray-500">Gérez vos factures sortantes et générez les messages EDI INVOIC.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 gap-2">
          <Plus size={18} /> Nouvelle Facture
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Factures Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucune facture trouvée.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 uppercase font-medium">
                  <tr>
                    <th className="p-3">N° Facture</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Client (GLN)</th>
                    <th className="p-3">Montant TTC</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="p-3 font-medium">{inv.invoic_number}</td>
                      <td className="p-3">{new Date(inv.date_facture).toLocaleDateString()}</td>
                      <td className="p-3 font-mono text-xs">{inv.buyer_gln}</td>
                      <td className="p-3 font-bold">{inv.total_ttc?.toFixed(2)} {inv.currency}</td>
                      <td className="p-3">
                        <Badge variant={inv.status === 'SENT' ? 'default' : 'secondary'}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right flex justify-end gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="Voir">
                          <Eye size={16} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" title="Envoyer EDI" onClick={() => handleSendInvoice(inv)}>
                          <Send size={16} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" title="Supprimer" onClick={() => handleDelete(inv.id)}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creation Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer une nouvelle facture</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Order Selection */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-2">
              <Label className="mb-2 block text-blue-900">Importer depuis une commande (Optionnel)</Label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedOrderId}
                onChange={(e) => handleSelectOrder(e.target.value)}
              >
                <option value="">-- Sélectionner une commande --</option>
                {availableOrders.map(o => (
                  <option key={o.id_order} value={o.id_order}>
                    {o.num_order} - {o.buyer_name} ({new Date(o.date_reception).toLocaleDateString()}) - {o.statut}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Numéro Facture</Label>
                <Input 
                  value={newInvoice.invoic_number} 
                  onChange={e => setNewInvoice({...newInvoice, invoic_number: e.target.value})} 
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input 
                  type="date"
                  value={newInvoice.date_facture} 
                  onChange={e => setNewInvoice({...newInvoice, date_facture: e.target.value})} 
                />
              </div>
            </div>
            <div>
              <Label>Client GLN</Label>
              <Input 
                value={newInvoice.buyer_gln} 
                onChange={e => setNewInvoice({...newInvoice, buyer_gln: e.target.value})} 
                placeholder="619..." 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Référence Commande</Label>
                <Input 
                  value={newInvoice.order_reference} 
                  onChange={e => setNewInvoice({...newInvoice, order_reference: e.target.value})} 
                />
              </div>
               <div>
                <Label>Devise</Label>
                <Input 
                  value={newInvoice.currency} 
                  onChange={e => setNewInvoice({...newInvoice, currency: e.target.value})} 
                />
              </div>
            </div>
            
            {/* Lines Preview */}
            <div className="mt-4">
              <Label>Lignes de facture ({newInvoice.lines.length})</Label>
              <div className="border rounded-md mt-2 max-h-[200px] overflow-y-auto bg-gray-50">
                {newInvoice.lines.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    Aucune ligne. Sélectionnez une commande ou ajoutez manuellement.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Article</th>
                        <th className="p-2 text-right">Qté</th>
                        <th className="p-2 text-right">Prix U.</th>
                        <th className="p-2 text-right">Total HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {newInvoice.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="p-2">
                            <div className="font-medium">{line.description}</div>
                            <div className="text-gray-500">{line.gtin}</div>
                          </td>
                          <td className="p-2 text-right">{line.quantity}</td>
                          <td className="p-2 text-right">{line.unit_price.toFixed(2)}</td>
                          <td className="p-2 text-right font-medium">{line.line_amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end mt-2 gap-4 text-sm font-medium">
                 <div>Total HT: {newInvoice.lines.reduce((s, l) => s + l.line_amount, 0).toFixed(2)} {newInvoice.currency}</div>
                 <div>TVA (20%): {newInvoice.lines.reduce((s, l) => s + (l.line_amount * 0.2), 0).toFixed(2)} {newInvoice.currency}</div>
                 <div className="text-blue-600">Total TTC: {newInvoice.lines.reduce((s, l) => s + (l.line_amount * 1.2), 0).toFixed(2)} {newInvoice.currency}</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Annuler</Button>
            <Button onClick={handleCreateInvoice}>Créer Brouillon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
