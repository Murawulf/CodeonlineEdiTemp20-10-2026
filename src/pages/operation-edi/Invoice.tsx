import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { createApiInstance } from "@/hooks/useApi";
import { format } from "date-fns";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Eye, 
  Send, 
  ArrowLeft,
  CheckCircle2,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  XCircle,
  FileMinus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useSettings } from "@/contexts/SettingsContext";

// --- Types ---
interface Invoice {
  id: number;
  invoic_number: string;
  type_code: string;
  date_facture: string;
  date_echeance: string;
  buyer_gln: string;
  seller_gln: string;
  order_reference: string;
  total_ht: number;
  total_tax: number;
  total_ttc: number;
  status: string;
  direction: string;
  currency: string;
  created_at: string;
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

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

// ---------------------------------------------------------------------------
// Status badge — enriched with ACKNOWLEDGED / REJECTED
// ---------------------------------------------------------------------------
const getStatusBadge = (status: string) => {
  const s = (status || "").toUpperCase();

  if (s === "ACKNOWLEDGED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={12} className="text-emerald-500" />
        Envoyée ✓
      </span>
    );
  }
  if (s === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <XCircle size={12} className="text-red-500" />
        Rejetée
      </span>
    );
  }
  if (s === "SENT") {
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Envoyée</Badge>;
  }
  if (s === "PENDING") {
    return <Badge className="bg-amber-400 text-white hover:bg-amber-400">PENDING</Badge>;
  }
  if (s === "RECEIVED" || s === "PROCESSED") {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Reçue</Badge>;
  }
  if (s === "DRAFT") {
    return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Brouillon</Badge>;
  }
  if (s === "ERROR") {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Erreur</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
};

// ---------------------------------------------------------------------------
// Helper — check if a given order already has an acknowledged invoice
// ---------------------------------------------------------------------------
function hasActiveInvoiceForOrder(invoices: Invoice[], orderRef: string): boolean {
  if (!orderRef) return false;
  return invoices.some(
    (inv) =>
      inv.order_reference === orderRef &&
      inv.direction === "OUTBOUND" &&
      (inv.status || "").toUpperCase() !== "REJECTED" &&
      (inv.status || "").toUpperCase() !== "ERROR"
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
const Invoices: React.FC = () => {
  const { settings, getLocalApiUrl } = useSettings();
  const currentUser = getCurrentUser();
  
  const API_BASE_URL = getLocalApiUrl() + "/api";

  const createApi = () => createApiInstance(API_BASE_URL);
  
  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  
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

  // loadInvoices is defined below — we use a ref to always call the latest version
  const loadInvoicesRef = React.useRef<() => Promise<void>>();

  useEffect(() => {
    loadInvoices();
    loadOrders();
    
    // Connect to WebSocket server for real-time updates
    const socketInstance = io(API_BASE_URL.replace('/api', ''), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      query: {
        id_compte: currentUser.id_compte || '',
        id_entite: currentUser.id_entite || ''
      }
    });

    socketInstance.on('connect', () => {
      console.log('[WebSocket Invoice] Connected to server');
    });

    // New inbound invoice received — use ref to avoid stale closure
    socketInstance.on('invoice:new', (data: any) => {
      console.log('[WebSocket Invoice] 📦 New invoice received:', data);
      // Small delay to ensure DB write is committed before we fetch
      setTimeout(() => loadInvoicesRef.current(), 600);
      toast({
        title: "Nouvelle facture reçue",
        description: data.notification || "Une nouvelle facture a été reçue.",
        className: "bg-blue-600 text-white"
      });
    });

    // APERAK / status update — keyed on invoic_number from the worker
    socketInstance.on('invoice:status:updated', (data: any) => {
      console.log('[WebSocket Invoice] ⚡ Invoice status updated:', data);
      const { invoic_number, status, aperakType } = data;

      setInvoices(prev =>
        prev.map(inv =>
          inv.invoic_number === invoic_number || inv.id === data.id
            ? { ...inv, status }
            : inv
        )
      );

      // Also update the currently open detail view if same invoice
      setSelectedInvoice(prev =>
        prev && (prev.invoic_number === invoic_number || prev.id === data.id)
          ? { ...prev, status }
          : prev
      );

      if (aperakType === 'ACK') {
        toast({
          title: "✅ Facture réceptionnée",
          description: `La facture ${invoic_number || ''} a été confirmée par l'acheteur (APERAK ACK).`,
          className: "bg-emerald-600 text-white"
        });
      } else if (aperakType === 'NACK') {
        toast({
          title: "❌ Facture rejetée",
          description: `La facture ${invoic_number || ''} a été rejetée par l'acheteur (APERAK NACK${data.errorCode ? ' — ' + data.errorCode : ''}).`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Statut mis à jour",
          description: `Facture ${invoic_number || ''} : ${status}`,
        });
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [API_BASE_URL]);

  const loadOrders = async () => {
    try {
      const api = createApi();
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
      const res = await api.get(`/orders/${orderId}`);
      const order = res.data;

      setNewInvoice(prev => ({
        ...prev,
        id_order: order.id_order,
        buyer_gln: order.acheteur_gln || order.buyer_gln || "",
        order_reference: order.num_order || order.num_commande || "",
        desadv_reference: order.desadvNumber || "",
        currency: order.currency || "EUR",
        lines: order.lines?.map((l: any, idx: number) => ({
          line_number: idx + 1,
          gtin: l.gtin,
          description: l.libelle,
          quantity: l.qty,
          unit_price: l.price || 0,
          tax_rate: 20,
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
      const res = await api.get("/edi/invoices/list");
      setInvoices(Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error("Error loading invoices:", err);
      toast({ title: "Erreur", description: "Impossible de charger les factures.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Keep the ref always up-to-date
  loadInvoicesRef.current = loadInvoices;


  const loadInvoiceLines = async (invoiceId: number) => {
    setLoadingLines(true);
    try {
      const api = createApi();
      const res = await api.get(`/edi/invoices/${invoiceId}/lines`);
      setInvoiceLines(res.data?.data || []);
    } catch (err) {
      console.error("Error loading invoice lines:", err);
      setInvoiceLines([]);
    } finally {
      setLoadingLines(false);
    }
  };

  const handleCreateInvoice = async () => {
    // Guard: if the selected order already has an active invoice, block creation
    if (newInvoice.order_reference && hasActiveInvoiceForOrder(invoices, newInvoice.order_reference)) {
      toast({
        title: "Création impossible",
        description: `Une facture active existe déjà pour la commande ${newInvoice.order_reference}.`,
        variant: "destructive"
      });
      return;
    }
    try {
      const api = createApi();
      const payload = {
        ...newInvoice,
        seller_gln: currentUser.gln || "6191907700002",
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

  const handleDelete = async (inv: Invoice) => {
    const s = (inv.status || "").toUpperCase();
    if (s !== "DRAFT") {
      toast({
        title: "Suppression impossible",
        description: `La facture ${inv.invoic_number} est en statut "${inv.status}" et ne peut pas être supprimée. Seules les factures en brouillon peuvent être supprimées.`,
        variant: "destructive"
      });
      return;
    }
    if (!confirm(`Supprimer la facture brouillon ${inv.invoic_number} ?`)) return;
    try {
      const api = createApi();
      await api.delete(`/edi/invoices/${inv.id}`);
      toast({ title: "Succès", description: "Facture supprimée" });
      loadInvoices();
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Échec de la suppression";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    }
  };

  const handleSendInvoice = async (invoice: Invoice) => {
    const s = (invoice.status || "").toUpperCase();
    if (s === 'SENT' || s === 'ACKNOWLEDGED') {
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

  const handleViewInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv);
    loadInvoiceLines(inv.id);
  };

  // Filtered invoices by tab and search
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    if (activeTab === "sent") filtered = filtered.filter(i => i.direction === "OUTBOUND");
    else if (activeTab === "received") filtered = filtered.filter(i => i.direction === "INBOUND");
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(i => 
        (i.invoic_number || "").toLowerCase().includes(q) ||
        (i.buyer_gln || "").includes(q) ||
        (i.seller_gln || "").includes(q) ||
        (i.order_reference || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [invoices, activeTab, searchQuery]);

  const countByDirection = useMemo(() => ({
    all: invoices.length,
    sent: invoices.filter(i => i.direction === "OUTBOUND").length,
    received: invoices.filter(i => i.direction === "INBOUND").length,
  }), [invoices]);

  // Determine if "Nouvelle Facture" should be warned (not blocked globally, just for a specific order)
  const canDeleteInvoice = (inv: Invoice) => (inv.status || "").toUpperCase() === "DRAFT";

  // ---------------------------------------------------------------------------
  // Detail view
  // ---------------------------------------------------------------------------
  if (selectedInvoice) {
    const inv = selectedInvoice;
    const isAcknowledged = (inv.status || "").toUpperCase() === "ACKNOWLEDGED";
    return (
      <div className="min-h-screen bg-gray-50/50 p-4 md:p-6 space-y-6">
        <Toaster />
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => { setSelectedInvoice(null); setInvoiceLines([]); }} size="sm">
            <ArrowLeft size={16} className="mr-2" /> Retour
          </Button>
          <div>
            <h1 className="text-xl font-bold text-blue-950">Facture {inv.invoic_number}</h1>
            <p className="text-sm text-gray-500">
              {inv.direction === "INBOUND" ? "Reçue" : "Envoyée"} • {new Date(inv.created_at || inv.date_facture).toLocaleString()}
            </p>
          </div>
          <div className="ml-auto flex gap-2 items-center">
            {inv.direction === "OUTBOUND" && (inv.status || "").toUpperCase() === "DRAFT" && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => handleSendInvoice(inv)}>
                <Send size={14} /> Envoyer EDI
              </Button>
            )}
            {isAcknowledged && (
              <Button size="sm" variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                <FileMinus size={14} /> Créer un avoir
              </Button>
            )}
            {getStatusBadge(inv.status)}
          </div>
        </div>

        {isAcknowledged && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Facture réceptionnée par l'acheteur (APERAK ACK)</p>
              <p className="text-emerald-700">Cette facture a valeur légale confirmée. Aucune nouvelle facture ne peut être émise pour cette commande — seul un avoir (type 381) est possible.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase text-gray-500">Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">N° Facture</span><span className="font-mono font-medium">{inv.invoic_number}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{inv.type_code === "380" ? "Facture commerciale" : inv.type_code === "381" ? "Avoir" : inv.type_code || "380"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date facture</span><span>{inv.date_facture ? new Date(inv.date_facture).toLocaleDateString() : "-"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Échéance</span><span>{inv.date_echeance ? new Date(inv.date_echeance).toLocaleDateString() : "-"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Réf. commande</span><span className="font-mono">{inv.order_reference || "-"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Devise</span><span>{inv.currency || "EUR"}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase text-gray-500">Parties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Vendeur (NAD+SU)</div>
                <div className="font-mono font-medium">{inv.seller_gln || "-"}</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Acheteur (NAD+BY)</div>
                <div className="font-mono font-medium">{inv.buyer_gln || "-"}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase text-gray-500">Lignes Articles ({invoiceLines.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLines ? (
              <div className="text-center py-6 text-gray-400">Chargement...</div>
            ) : invoiceLines.length === 0 ? (
              <div className="text-center py-6 text-gray-400">Aucune ligne</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">#</th>
                        <th className="px-4 py-2 text-left">GTIN</th>
                        <th className="px-4 py-2 text-left">Désignation</th>
                        <th className="px-4 py-2 text-right">Qté</th>
                        <th className="px-4 py-2 text-right">Prix U.</th>
                        <th className="px-4 py-2 text-right">TVA %</th>
                        <th className="px-4 py-2 text-right">Montant HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoiceLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{line.line_number || idx + 1}</td>
                          <td className="px-4 py-2 font-mono text-xs">{line.gtin}</td>
                          <td className="px-4 py-2">{line.description || "-"}</td>
                          <td className="px-4 py-2 text-right">{line.quantity}</td>
                          <td className="px-4 py-2 text-right">{Number(line.unit_price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">{line.tax_rate || 0}%</td>
                          <td className="px-4 py-2 text-right font-medium">{Number(line.line_amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-4 gap-6 text-sm border-t pt-3">
                  <div><span className="text-gray-500 mr-2">Total HT:</span><span className="font-bold">{Number(inv.total_ht || 0).toFixed(2)}</span></div>
                  <div><span className="text-gray-500 mr-2">TVA:</span><span className="font-bold">{Number(inv.total_tax || 0).toFixed(2)}</span></div>
                  <div><span className="text-gray-500 mr-2">Total TTC:</span><span className="font-bold text-blue-600">{Number(inv.total_ttc || 0).toFixed(2)} {inv.currency}</span></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // List view
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50/50 backdrop-blur-sm p-4 md:p-6 space-y-6">
      <Toaster />
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-950 flex items-center gap-2">
            <FileText className="h-8 w-8 text-blue-600" />
            Facturation (INVOIC)
          </h1>
          <p className="text-gray-500">Gérez vos factures envoyées et reçues via EDI INVOIC.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-blue-600 gap-2">
          <Plus size={18} /> Nouvelle Facture
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="all">Toutes ({countByDirection.all})</TabsTrigger>
            <TabsTrigger value="sent">
              <ArrowUpRight size={14} className="mr-1" /> Envoyées ({countByDirection.sent})
            </TabsTrigger>
            <TabsTrigger value="received">
              <ArrowDownLeft size={14} className="mr-1" /> Reçues ({countByDirection.received})
            </TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9 w-64"
              placeholder="Rechercher N°, GLN, réf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Card className="mt-4">
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12">Chargement...</div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucune facture trouvée.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase font-medium text-xs">
                    <tr>
                      <th className="px-4 py-3">Direction</th>
                      <th className="px-4 py-3">N° Facture</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Vendeur</th>
                      <th className="px-4 py-3">Acheteur</th>
                      <th className="px-4 py-3">Réf. Commande</th>
                      <th className="px-4 py-3 text-right">Total TTC</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredInvoices.map((inv) => {
                      const isAck = (inv.status || "").toUpperCase() === "ACKNOWLEDGED";
                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-gray-50 cursor-pointer transition-colors ${isAck ? 'bg-emerald-50/40' : ''}`}
                          onClick={() => handleViewInvoice(inv)}
                        >
                          <td className="px-4 py-3">
                            {inv.direction === "INBOUND" ? (
                              <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-medium">
                                <ArrowDownLeft size={12} /> Reçue
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs font-medium">
                                <ArrowUpRight size={12} /> Envoyée
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium">{inv.invoic_number}</td>
                          <td className="px-4 py-3 text-xs">{inv.date_facture ? new Date(inv.date_facture).toLocaleDateString() : "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{inv.seller_gln || "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{inv.buyer_gln || "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{inv.order_reference || "-"}</td>
                          <td className="px-4 py-3 text-right font-bold">{Number(inv.total_ttc || 0).toFixed(2)} {inv.currency || ""}</td>
                          <td className="px-4 py-3">{getStatusBadge(inv.status)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Voir détails" onClick={() => handleViewInvoice(inv)}>
                                <Eye size={14} />
                              </Button>
                              {/* Send button — only for OUTBOUND + DRAFT */}
                              {inv.direction === "OUTBOUND" && (inv.status || "").toUpperCase() === "DRAFT" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Envoyer EDI" onClick={() => handleSendInvoice(inv)} disabled={isSending}>
                                  <Send size={14} />
                                </Button>
                              )}
                              {/* Delete button — only for DRAFT, otherwise disabled with tooltip */}
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`h-7 w-7 ${canDeleteInvoice(inv) ? 'text-red-500 hover:text-red-700' : 'text-gray-300 cursor-not-allowed'}`}
                                title={canDeleteInvoice(inv) ? "Supprimer" : "Suppression impossible : statut " + inv.status}
                                onClick={() => handleDelete(inv)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

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
                {availableOrders.map(o => {
                  const ackBlocked = hasActiveInvoiceForOrder(invoices, o.num_order || o.num_commande);
                  return (
                    <option key={o.id_order} value={o.id_order} disabled={ackBlocked}>
                      {o.num_order} - {o.buyer_name} ({new Date(o.date_reception).toLocaleDateString()}) - {o.statut}
                      {ackBlocked ? " ⚠️ (Déjà facturée)" : ""}
                    </option>
                  );
                })}
              </select>
              {/* Warning if selected order already has an active invoice */}
              {newInvoice.order_reference && hasActiveInvoiceForOrder(invoices, newInvoice.order_reference) && (
                <div className="mt-2 flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Une facture (brouillon ou envoyée) existe déjà pour cette commande.</span>
                </div>
              )}
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
