// Orders.tsx - Version COMPLÈTE, PROPRE et PROFESSIONNELLE
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Select from "react-select";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Plus, Search, X, ChevronLeft, ChevronRight, List, ArrowLeft, Info, Image as ImageIcon, FileText, Truck, CheckCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import OrderSummaryModal from "@/components/OrderSummaryModal";
import ProductDetailModal from "@/components/ProductDetailModal";
import OrderProcessingModal from "@/components/OrderProcessingModal";
import InfoTooltip from "@/components/ui/InfoTooltip";
import SafeAcceptModificationsAction from "@/components/edi/AcceptModificationsAction";
import InvoiceCreationModal from "@/components/InvoiceCreationModal";
import type { InvoiceFormData } from "@/components/InvoiceCreationModal";
import { useSettings } from "@/contexts/SettingsContext";
import { createApiInstance } from "@/hooks/useApi";

// TODO request from bdd - table pays
const CURRENCIES = [
  { value: "TND", label: "TND - Dinar tunisien", symbol: "د.ت" },
  { value: "EUR", label: "EUR - Euro", symbol: "€" },
  { value: "USD", label: "USD - Dollar américain", symbol: "$" },
  { value: "XOF", label: "XOF - Franc CFA", symbol: "Fr" },
];

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

const formatDateForEANCOM = (v: string) => {
  if (!v) return "";
  // Supprimer les séparateurs et garder uniquement les chiffres
  let formatted = v.replace(/[-:T.Z]/g, "");
  // Si la date est au format datetime-local (sans secondes), ajouter "00" pour les secondes
  // Format attendu: YYYYMMDDHHMMSS (14 caractères)
  if (formatted.length === 12) {
    formatted += "00"; // Ajouter les secondes
  }
  return formatted.slice(0, 14);
};

export default function Orders(): JSX.Element {
  const navigate = useNavigate();
  const { settings, getLocalApiUrl, getServerUrl, getCurrentCountryInfo, isLoading: isSettingsLoading } = useSettings();
  
  // Construct SERVERS list dynamically from settings
  const SERVERS = useMemo(() => {
    const currentCountryInfo = getCurrentCountryInfo();
    return [
      { id: "all", label: "Tous les serveurs", baseURL: "" }, // Special case handling
      { 
        id: "tunisia", 
        label: currentCountryInfo.id === 'tunisia' ? "Tunisie (Local)" : "Tunisie",
        baseURL: getServerUrl('tunisia')
      },
      { 
        id: "senegal", 
        label: currentCountryInfo.id === 'senegal' ? "Sénégal (Local)" : "Sénégal",
        baseURL: getServerUrl('senegal')
      },
    ];
  }, [getServerUrl, getCurrentCountryInfo]);

  const DEFAULT_BACKEND_URL = getLocalApiUrl();

  // Helper to create API instance for a specific server or default
  const createApi = (baseURL: string) => createApiInstance(baseURL || DEFAULT_BACKEND_URL);

  const currentUser = getCurrentUser();
  const currentEntiteId = currentUser.id_entite || null;
  const currentGLN = currentUser.gln || "6191907700002"; // Fallback test GLN

  const [displayMode, setDisplayMode] = useState<"all" | "received" | "sent" | "new">("all");

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [sentOrdersLocal, setSentOrdersLocal] = useState<any[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Par défaut, sélectionner le serveur du pays courant
  const [selectedServerId, setSelectedServerId] = useState<string>(() => {
    try {
      const hostname = window.location.hostname;
      const isSenegal = hostname.includes('dev.codeonline-edi.net');
      return isSenegal ? "senegal" : "tunisia";
    } catch (e) {
      return "tunisia";
    }
  });

  const [companies, setCompanies] = useState<any[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Segments for filtering suppliers
  const [segments, setSegments] = useState<any[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<any>(null);

  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [numCommande, setNumCommande] = useState("");

  const [dateLivraisonDemandee, setDateLivraisonDemandee] = useState("");
  const [dateLivraisonPlusTard, setDateLivraisonPlusTard] = useState("");
  const [dateLivraisonPlusTot, setDateLivraisonPlusTot] = useState("");

  const [selectedCurrency, setSelectedCurrency] = useState(CURRENCIES[0]);

  const [siteFournisseur, setSiteFournisseur] = useState("");
  const [siteLivraison, setSiteLivraison] = useState("");
  const [fraisProposes, setFraisProposes] = useState("");

  const [articles, setArticles] = useState<string[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [proposedPrice, setProposedPrice] = useState("");
  
  // Ref for quantity input to auto-focus
  const qtyInputRef = React.useRef<HTMLInputElement>(null);

  const isQtyValid = qty !== "" && Number(qty) >= 1 && Number.isInteger(Number(qty));
  const isPriceValid = price !== "" && parseFloat(price) >= 0;
  const isProposedPriceValid = proposedPrice !== "" && parseFloat(proposedPrice) >= 0;
  // Helper function to safely parse dates from the server
  // Dates are stored and returned in server time — display as-is without timezone conversion
  const parseServerDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    // Remove any trailing Z or timezone offset so the browser treats it as local time
    let cleaned = dateStr.replace(' ', 'T');
    if (cleaned.endsWith('Z')) {
      cleaned = cleaned.slice(0, -1);
    }
    // Also remove .000Z suffix
    cleaned = cleaned.replace(/\.\d{3}Z$/, '');
    // Remove any timezone offset like +00:00
    cleaned = cleaned.replace(/[+-]\d{2}:\d{2}$/, '');
    return new Date(cleaned);
  };
  // Determine if price is loaded from DB
  const isPriceLoadedFromDB = selectedProduct && selectedProduct.prix_min;
  // Determine if proposed price is mandatory (when negotiated price is not loaded)
  const isProposedPriceMandatory = !isPriceLoadedFromDB;
  // Validation for adding article: use negotiated price if loaded, else require proposed price
  const canAddArticle = selectedProduct !== null && isQtyValid && (isPriceLoadedFromDB ? isPriceValid : isProposedPriceValid);

  // Modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [orderSummaryData, setOrderSummaryData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Product detail modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<any>(null);

  // Processing Modal State
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [selectedOrderForProcessing, setSelectedOrderForProcessing] = useState<any>(null);
  const [simulateSupplierMode, setSimulateSupplierMode] = useState(false);

  // Invoice Creation Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<any>(null);
  
  // WebSocket connection
  const [socket, setSocket] = useState<Socket | null>(null);

  const [openSections, setOpenSections] = useState({
    commande: true,
    dates: true,
    monnaie: true,
    entite: true,
    transport: true,
    articles: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const generateOrderNumber = () => {
    const p = prefix || (currentUser.nom || "CMD").slice(0, 3).toUpperCase();
    const rand = Math.floor(10000 + Math.random() * 90000);
    const s = suffix || "";
    setNumCommande(`${p}${rand}${s}`);
  };

  useEffect(() => {
    generateOrderNumber();
  }, [prefix, suffix]);

  // Function to load orders (extracted for reuse)
  const loadAllOrders = async () => {
    console.log("\n=== [FRONTEND] Loading Orders - START ===");
    console.log("[LOAD ORDERS] Current User ID (currentEntiteId):", currentEntiteId);
    console.log("[LOAD ORDERS] Current User GLN:", currentGLN);
    setLoadingTables(true);
    const receivedOrders: any[] = [];
    const sentOrders: any[] = [];
    
    // Uniquement interroger le backend local (qui tape dans la table orders)
    const api = createApi(DEFAULT_BACKEND_URL);
    
    // Load received orders
    try {
      const res = await api.get("/api/orders/incoming", { headers: { "x-entite-id": currentEntiteId } });
      console.log(`[LOAD ORDERS] Received orders:`, res.data.orders?.length || 0);
      (res.data.orders || []).forEach((o: any, idx: number) => {
        console.log(`[LOAD ORDERS] Received Order #${idx + 1}:`, {
          id_order: o.id_order,
          num_commande: o.num_commande,
          id_entite_seller: o.id_entite_seller,
          id_entite_buyer: o.id_entite_buyer,
          seller_name: o.seller_name,
          buyer_name: o.buyer_name,
          status: o.status,
          comment: o.comment,
          updated_at: o.updated_at
        });
        receivedOrders.push({ 
          ...o, 
          type: "Reçue", 
          _server: "local",
          montant_ht: o.total_ht,
          comment: o.comment,
          updated_at: o.updated_at,
          buyer_name: o.buyer_name || "-",
          nbr_lin_article: o.lines?.length || 0
        });
      });
    } catch (err: any) {
      console.error(`[FRONTEND] Error loading received orders:`, err);
    }
    
    // Load sent orders
    try {
      const res = await api.get("/api/orders/sent", { headers: { "x-entite-id": currentEntiteId } });
      console.log(`[LOAD ORDERS] Sent orders:`, res.data.orders?.length || 0);
      (res.data.orders || []).forEach((o: any, idx: number) => {
        console.log(`[LOAD ORDERS] Sent Order #${idx + 1}:`, {
          id_order: o.id_order,
          num_commande: o.num_commande,
          id_entite_seller: o.id_entite_seller,
          id_entite_buyer: o.id_entite_buyer,
          seller_name: o.seller_name,
          buyer_name: o.buyer_name,
          status: o.status
        });
        const calculatedAmount = o.lines?.reduce((sum: number, line: any) => sum + (line.prix * line.qty), 0) || 0;
        sentOrders.push({
          ...o,
          type: "Envoyée",
          _server: "local",
          num_order: o.num_commande || o.order_number || o.id_order?.toString() || "",
          numCommande: o.num_commande || o.order_number || o.id_order?.toString() || "",
          date_reception: o.created_at,
          datecommande: o.created_at,
          fournisseur_name: o.seller_name || "Fournisseur",
          buyer_name: o.buyer_name || "Moi", // Ensure buyer_name is passed
          nbr_lin_article: o.lines?.length || 0,
          montant_ht: calculatedAmount > 0 ? calculatedAmount.toFixed(2) : (o.total_ht || "0.00"),
          total_ht: o.total_ht || (calculatedAmount > 0 ? calculatedAmount.toFixed(2) : "0.00"), // Ensure total_ht is set for modal
          monnaie: o.monnaie || o.currency || "TND", // Handle currency field
          statut: o.status || "sent",
          comment: o.comment, // Add comment for sent orders too
          updated_at: o.updated_at // Add updated_at for sent orders too
        });
      });
    } catch (err: any) {
      console.error(`[FRONTEND] Error loading sent orders:`, err);
    }
    
    const allOrdersCombined = [...receivedOrders, ...sentOrders];
    
    // Deduplicate orders by num_commande/num_order and type
    // Prefer orders with more complete data (lines, id_order, total_ht)
    const deduplicatedOrders = allOrdersCombined.reduce((acc: any[], order: any) => {
      const orderKey = `${order.num_commande || order.num_order || order.numCommande}_${order.type}`;
      const existingIndex = acc.findIndex((o: any) => 
        `${o.num_commande || o.num_order || o.numCommande}_${o.type}` === orderKey
      );
      
      if (existingIndex === -1) {
        acc.push(order);
      } else {
        // Compare completeness: prefer order with lines, id_order, and total_ht
        const existing = acc[existingIndex];
        const existingScore = (existing.lines?.length || 0) + (existing.id_order ? 10 : 0) + (existing.total_ht ? 5 : 0);
        const newScore = (order.lines?.length || 0) + (order.id_order ? 10 : 0) + (order.total_ht ? 5 : 0);
        
        if (newScore > existingScore) {
          acc[existingIndex] = order;
        }
      }
      return acc;
    }, []);
    
    deduplicatedOrders.sort((a, b) => parseServerDate(b.date_reception || b.datecommande).getTime() - parseServerDate(a.date_reception || a.datecommande).getTime());
    
    console.log("[LOAD ORDERS] Total orders loaded:", allOrdersCombined.length);
    console.log("[LOAD ORDERS] After deduplication:", deduplicatedOrders.length);
    console.log("[LOAD ORDERS] - Received:", receivedOrders.length);
    console.log("[LOAD ORDERS] - Sent:", sentOrders.length);
    
    setAllOrders(deduplicatedOrders);
    setLoadingTables(false);
    console.log("=== [FRONTEND] Loading Orders - END ===\n");
  };

  // WebSocket connection and event listeners
  useEffect(() => {
    // Connect to WebSocket server
    const socketInstance = io(DEFAULT_BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      query: {
        id_compte: currentUser.id_compte || '',
        id_entite: currentEntiteId || ''
      }
    });

    socketInstance.on('connect', () => {
      console.log('[WebSocket] Connected to server');
    });

    socketInstance.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from server');
    });

    // Listen for order status updates (emitted globally, filter by entity here)
    socketInstance.on('order:status:updated', (data: { orderId: number; status: string; timestamp: string; numCommande?: string; fournisseurName?: string; buyerId?: number; sellerId?: number; comment?: string }) => {
      console.log('[WebSocket] ⚡ Order status updated:', data);
      
      const isBuyer = data.buyerId && Number(data.buyerId) === Number(currentEntiteId);
      const isSeller = data.sellerId && Number(data.sellerId) === Number(currentEntiteId);
      
      if (!isBuyer && !isSeller) {
        console.log('[WebSocket] 🙈 Ignoring order status update (not for our entity)');
        return;
      }
      
      // Update order status in local state immediately
      const updateOrder = (order: any) => {
        if (Number(order.id_order) === Number(data.orderId)) {
          return { 
            ...order, 
            status: data.status, 
            statut: data.status,
            comment: data.comment !== undefined ? data.comment : order.comment,
            fournisseur_name: data.fournisseurName || order.fournisseur_name || order.seller_name || "Fournisseur",
            type: order.type
          };
        }
        return order;
      };
      setAllOrders(prevOrders => prevOrders.map(updateOrder));
      setSentOrdersLocal(prevOrders => prevOrders.map(updateOrder));
      
      // Show toast only to the buyer
      if (isBuyer) {
        toast({
          title: "✅ Commande envoyée",
          description: `La commande ${data.numCommande || `#${data.orderId}`} a été envoyée avec succès`,
        });
      }
      
      // Reload from server to get fresh data
      loadAllOrders();
    });

    // Listen for new incoming orders (supplier side) - reload order list immediately
    socketInstance.on('order:new', (data: { sellerId: number; buyerName: string; numCommande: string; timestamp: string }) => {
      console.log('[WebSocket] 📦 New order received:', data);
      if (data.sellerId && Number(data.sellerId) === Number(currentEntiteId)) {
        console.log('[WebSocket] Reloading orders - new order for our entity');
        loadAllOrders();
      }
    });

    // Listen for new notifications to reload list
    socketInstance.on('notification:new', (data: { notification: any }) => {
      console.log('[WebSocket] 🔔 New notification received:', data);
      
      // Filter: only process notifications for the current user
      if (data.notification.id_compte && Number(data.notification.id_compte) !== Number(currentUser?.id_compte)) {
        console.log('[WebSocket] 🙈 Ignoring notification (not for our user account)');
        return;
      }
      
      // Reload orders for any order-related notification
      const isOrderNotif = (data.notification.link && data.notification.link.includes('/operation-edi/order')) ||
                           (data.notification.contenu && (data.notification.contenu.includes('commande') || data.notification.contenu.includes('Commande')));
      if (isOrderNotif) {
        console.log('[WebSocket] Reloading orders due to order notification...');
        loadAllOrders();
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  useEffect(() => {
    loadAllOrders();
  }, [currentEntiteId, selectedServerId]);

  useEffect(() => {
    if (displayMode !== "new") return;
    const loadCompanies = async () => {
      console.log("\n🔵 [CLIENT] loadCompanies START");
      console.log("[CLIENT] selectedServerId:", selectedServerId);
      console.log("[CLIENT] currentEntiteId:", currentEntiteId);
      
      setLoadingCompanies(true);
      const results: any[] = [];
      
      // Map server IDs to country codes for EDI proxy
      const serverToCountry: Record<string, string> = {
        "senegal": "SN",
        "tunisia": "TN",
        "buyer_node": "BUYER",
        "supplier_node": "SUPPLIER"
      };
      
      if (selectedServerId === "all") {
        console.log("[CLIENT] Loading from ALL servers");
        for (const s of SERVERS.filter(s => s.id !== "all")) {
          const countryCode = serverToCountry[s.id];
          if (!countryCode) {
            console.warn(`[CLIENT] No country code mapped for server: ${s.id}`);
            continue;
          }
          
          const api = createApi(DEFAULT_BACKEND_URL);
          const proxyUrl = `/api/edi/suppliers/${countryCode}`;
          console.log(`[CLIENT] 📡 Calling proxy for ${s.label} (${countryCode}) via ${DEFAULT_BACKEND_URL}${proxyUrl}`);
          
          try {
            const startTime = Date.now();
            const res = await api.get(proxyUrl, { headers: { "x-entite-id": currentEntiteId || undefined } });
            const duration = Date.now() - startTime;
            
            console.log(`[CLIENT] ✅ Response from ${s.label} (${countryCode}) in ${duration}ms:`, {
              status: res.status,
              dataType: Array.isArray(res.data) ? 'array' : typeof res.data,
              count: Array.isArray(res.data) ? res.data.length : 'n/a',
              preview: Array.isArray(res.data) ? res.data.slice(0, 2) : res.data
            });
            
            (res.data?.comptes || res.data || []).forEach((c: any) => results.push({ ...c, _server: s.id }));
          } catch (err: any) {
            console.error(`[CLIENT] ❌ Error loading from ${s.label} (${countryCode}):`, {
              message: err.message,
              status: err.response?.status,
              data: err.response?.data
            });
          }
        }
      } else {
        const server = SERVERS.find(s => s.id === selectedServerId);
        if (server) {
          const countryCode = serverToCountry[server.id];
          if (!countryCode) {
            console.warn(`[CLIENT] No country code mapped for server: ${server.id}`);
            setLoadingCompanies(false);
            return;
          }
          
          const api = createApi(DEFAULT_BACKEND_URL);
          const proxyUrl = `/api/edi/suppliers/${countryCode}`;
          console.log(`[CLIENT] 📡 Calling proxy for ${server.label} (${countryCode}) via ${DEFAULT_BACKEND_URL}${proxyUrl}`);
          
          try {
            const startTime = Date.now();
            const res = await api.get(proxyUrl, { headers: { "x-entite-id": currentEntiteId || undefined } });
            const duration = Date.now() - startTime;
            
            console.log(`[CLIENT] ✅ Response from ${server.label} (${countryCode}) in ${duration}ms:`, {
              status: res.status,
              dataType: Array.isArray(res.data) ? 'array' : typeof res.data,
              count: Array.isArray(res.data) ? res.data.length : 'n/a',
              preview: Array.isArray(res.data) ? res.data.slice(0, 2) : res.data
            });
            
            (res.data?.comptes || res.data || []).forEach((c: any) => results.push({ ...c, _server: server.id }));
          } catch (err: any) {
            console.error(`[CLIENT] ❌ Error loading from ${server.label} (${countryCode}):`, {
              message: err.message,
              status: err.response?.status,
              data: err.response?.data
            });
          }
        }
      }
      
      console.log(`[CLIENT] 🏁 loadCompanies COMPLETE - Total suppliers loaded: ${results.length}`);
      setCompanies(results);
      setLoadingCompanies(false);
    };
    loadCompanies();
  }, [displayMode, selectedServerId, currentEntiteId]);

  // Load segments
  useEffect(() => {
    const loadSegments = async () => {
      setLoadingSegments(true);
      try {
        // Use local backend to fetch segments (they should be standard GPC)
        const api = createApi(DEFAULT_BACKEND_URL);
        const res = await api.get("/api/segments");
        if (Array.isArray(res.data)) {
          setSegments(res.data);
        }
      } catch (err) {
        console.error("Error loading segments:", err);
      } finally {
        setLoadingSegments(false);
      }
    };
    loadSegments();
  }, []);

  const loadProductsForSupplier = async (supplier: any) => {
    console.log("\n🟢 [CLIENT] loadProductsForSupplier START");
    console.log("[CLIENT] Supplier:", { id: supplier.id_entite || supplier.id, name: supplier.raison_socialle, server: supplier._server });
    
    const server = SERVERS.find(s => s.id === supplier._server);
    if (!server) {
      console.warn("[CLIENT] No server found for supplier._server:", supplier._server);
      return;
    }
    
    // Map server IDs to country codes for EDI proxy
    const serverToCountry: Record<string, string> = {
      "senegal": "SN",
      "tunisia": "TN"
    };
    
    const countryCode = serverToCountry[server.id];
    if (!countryCode) {
      console.warn(`[CLIENT] No country code mapped for server: ${server.id}`);
      return;
    }
    
    const supplierId = supplier.id_entite || supplier.id;
    const proxyUrl = `/api/edi/products/${countryCode}`;
    
    console.log(`[CLIENT] 📦 Calling products proxy for ${server.label} (${countryCode}) via ${DEFAULT_BACKEND_URL}${proxyUrl}?id_entite=${supplierId}`);
    
    try {
      const startTime = Date.now();
      const api = createApi(DEFAULT_BACKEND_URL);
      const res = await api.get(proxyUrl, { params: { id_entite: supplierId } });
      const duration = Date.now() - startTime;
      
      const payload = res.data.products || res.data || [];
      
      console.log(`[CLIENT] ✅ Products response from ${server.label} (${countryCode}) in ${duration}ms:`, {
        status: res.status,
        dataType: Array.isArray(payload) ? 'array' : typeof payload,
        productCount: Array.isArray(payload) ? payload.length : 'n/a',
        preview: Array.isArray(payload) ? payload.slice(0, 2) : payload
      });
      
      setProducts(payload.map((p: any) => ({
        ...p,
        id: Number(p.id || p.id_produit || 0),
        gtin: p.gtin || "",
        libelle: p.libelle || p.nom || "",
      })));
      
      console.log(`[CLIENT] 🏁 Products loaded and mapped: ${payload.length} products`);
    } catch (err: any) {
      console.error(`[CLIENT] ❌ Error loading products from ${server.label} (${countryCode}):`, {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      setProducts([]);
      toast({ title: "Erreur", description: "Impossible de charger les produits", variant: "destructive" });
    }
  };

  // Auto-fill Site Fournisseur with supplier GLN

  // Auto-fill Site Livraison with buyer GLN
  useEffect(() => {
    if (currentGLN && !siteLivraison) {
      setSiteLivraison(currentGLN);
    }
  }, [currentGLN]);
  useEffect(() => {
    if (selectedSupplier && selectedSupplier.gln) {
      setSiteFournisseur(selectedSupplier.gln);
    }
  }, [selectedSupplier]);

  // Auto-fill price when product is selected and focus on quantity
  useEffect(() => {
    if (selectedProduct && selectedProduct.prix_min) {
      const priceInCurrency = (selectedProduct.prix_min / 100).toFixed(2);
      setPrice(priceInCurrency);
      setProposedPrice(priceInCurrency);
    }
    
    // Auto-focus on quantity field when product is selected
    if (selectedProduct && qtyInputRef.current) {
      setTimeout(() => {
        qtyInputRef.current?.focus();
      }, 100);
    }
  }, [selectedProduct]);

  const openProductDetail = (product: any) => {
    setSelectedProductForDetail(product);
    setShowProductModal(true);
    // Scroll to position modal in view
    setTimeout(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const addArticleWithPackaging = (packaging: string) => {
    if (!canAddArticle) {
      toast({
        title: "Validation requise",
        description: isPriceLoadedFromDB 
          ? "Quantité (entier ≥ 1) et Prix négocié (≥ 0) obligatoires"
          : "Quantité (entier ≥ 1) et Prix proposé (≥ 0) obligatoires",
        variant: "destructive",
      });
      return;
    }
    // Use negotiated price if loaded, else use proposed price
    const finalPrice = isPriceLoadedFromDB ? price : proposedPrice;
    const articleStr = `${selectedProduct.gtin}!${qty}!${finalPrice}!${packaging}`;
    setArticles(prev => [...prev, articleStr]);
    setSelectedProduct(null);
    setQty("");
    setPrice("");
    setProposedPrice("");
  };

  const removeArticle = (index: number) => {
    setArticles(prev => prev.filter((_, i) => i !== index));
  };

  const isFormValid = numCommande.trim() !== "" && selectedSupplier !== null && articles.length > 0;


  const openSummaryModal = () => {
    console.log("\n=== [openSummaryModal] DÉBUT ===");
    console.log("[openSummaryModal] State des dates:");
    console.log("  - dateLivraisonDemandee:", dateLivraisonDemandee);
    console.log("  - dateLivraisonPlusTot:", dateLivraisonPlusTot);
    console.log("  - dateLivraisonPlusTard:", dateLivraisonPlusTard);

    // Validate basic requirements
    if (!numCommande.trim() || !selectedSupplier || articles.length === 0) {
      toast({
        title: "Validation requise",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive",
      });
      return;
    }

    if (!dateLivraisonDemandee) {
      console.error("[openSummaryModal] ❌ ERREUR: dateLivraisonDemandee est vide!");
      toast({
        title: "Validation requise",
        description: "La date de livraison demandée est obligatoire",
        variant: "destructive",
      });
      return;
    }

    // Prepare articles data
    const validArticles = articles.map(a => {
      const [gtin, q, p, pack] = a.split("!");
      return {
        gtin,
        qty: parseInt(q),
        price: parseFloat(p),
        unit: "PCE",
        libelle: products.find(prod => prod.gtin === gtin)?.libelle || ""
      };
    });

    const deliveryDate = dateLivraisonDemandee;

    // Debug: Log des valeurs des dates
    console.log("=== DEBUG DATES ===");
    console.log("dateLivraisonDemandee:", dateLivraisonDemandee);
    console.log("dateLivraisonPlusTot:", dateLivraisonPlusTot);
    console.log("dateLivraisonPlusTard:", dateLivraisonPlusTard);
    console.log("Après formatage:");
    console.log("dateLivraisonDemandee:", formatDateForEANCOM(dateLivraisonDemandee));
    console.log("dateLivraisonPlusTot:", formatDateForEANCOM(dateLivraisonPlusTot));
    console.log("dateLivraisonPlusTard:", formatDateForEANCOM(dateLivraisonPlusTard));

    // Prepare summary data
    const summaryData = {
      numCommande: numCommande.trim(),
      datecommande: formatDateForEANCOM(new Date().toISOString()),
      datelivraison: formatDateForEANCOM(deliveryDate),
      dateLivraisonDemandee: formatDateForEANCOM(dateLivraisonDemandee),
      dateLivraisonPlusTot: formatDateForEANCOM(dateLivraisonPlusTot),
      dateLivraisonPlusTard: formatDateForEANCOM(dateLivraisonPlusTard),
      fraisTransport: fraisProposes ? parseFloat(fraisProposes) : 0,
      Acheteur: currentGLN,
      fournisseur: selectedSupplier.gln,
      fournisseurName: selectedSupplier.raison_socialle || selectedSupplier.nom || "Fournisseur",
      lieu_livraison_primaire: siteLivraison.trim() || currentGLN,
      monnaie: selectedCurrency.value,
      articles: validArticles,
    };

    console.log("=== SUMMARY DATA ===");
    console.log(JSON.stringify(summaryData, null, 2));

    setOrderSummaryData(summaryData);
    setShowSummaryModal(true);
    // Scroll to position modal in view
    setTimeout(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };
  const submitOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    console.log("\n=== [FRONTEND] submitOrder START ===");
    console.log("[FRONTEND] Selected Supplier:", selectedSupplier);
    console.log("[FRONTEND] Supplier GLN:", selectedSupplier?.gln);
    console.log("[FRONTEND] Current User GLN:", currentGLN);
    console.log("[FRONTEND] Current Entite ID:", currentEntiteId);
    
    // --- 1. Frontend Validation ---
    const errors: string[] = [];

    if (!numCommande.trim()) errors.push("Numéro de commande manquant");
    if (!selectedSupplier) errors.push("Fournisseur non sélectionné");
    else if (!selectedSupplier.gln) {
      console.error("[FRONTEND] ❌ Selected supplier has no GLN:", selectedSupplier);
      errors.push("Le fournisseur sélectionné n'a pas de GLN valide");
    }

    if (articles.length === 0) errors.push("Aucun article dans la commande");

    // Validate Articles
    const validArticles = articles.map(a => {
      const [gtin, q, p, pack] = a.split("!");
      return {
        gtin,
        qty: parseInt(q),
        price: parseFloat(p),
        unit: "PCE", // Default unit
        libelle: products.find(prod => prod.gtin === gtin)?.libelle || ""
      };
    });

    validArticles.forEach(item => {
      if (!item.gtin || item.gtin.length !== 13) errors.push(`GTIN invalide: ${item.gtin}`);
      if (!item.qty || item.qty <= 0) errors.push(`Quantité invalide pour ${item.gtin}`);
      if (item.price < 0) errors.push(`Prix invalide pour ${item.gtin}`);
    });

    if (errors.length > 0) {
      toast({
        title: "Validation échouée",
        description: (
          <ul className="list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        ),
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!dateLivraisonDemandee) {
      toast({
        title: "Validation échouée",
        description: "La date de livraison demandée est obligatoire",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const deliveryDate = dateLivraisonDemandee;

    // --- 2. Payload Construction (JSON) ---
    // Calculate total amount
    const totalAmount = validArticles.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const payload = {
      numCommande: numCommande.trim(),
      datecommande: formatDateForEANCOM(new Date().toISOString()),
      datelivraison: formatDateForEANCOM(deliveryDate),
      dateLivraisonDemandee: formatDateForEANCOM(dateLivraisonDemandee),
      dateLivraisonPlusTot: formatDateForEANCOM(dateLivraisonPlusTot),
      dateLivraisonPlusTard: formatDateForEANCOM(dateLivraisonPlusTard),
      fraisTransport: fraisProposes ? parseFloat(fraisProposes) : 0,
      dateenlevement: "",
      Acheteur: currentGLN,
      fournisseur: selectedSupplier.gln, // Supplier GLN
      fournisseurIdEntite: selectedSupplier.id_entite || selectedSupplier.id, // Supplier id_entite from remote server
      supplierName: selectedSupplier.raison_socialle || selectedSupplier.nom || "Fournisseur", // Add supplier name for persistence
      supplierServer: selectedSupplier._server, // Server where supplier lives (for inter-country EDI routing)
      buyerName: currentUser.raison_socialle || currentUser.nom || "Acheteur", // Add buyer name for inter-country orders
      lieu_livraison_primaire: siteLivraison.trim() || currentGLN,
      facture: "",
      monnaie: selectedCurrency.value,
      currency: selectedCurrency.value,
      total_ht: totalAmount, // Add total amount to be stored in database
      articles: validArticles, // Send as JSON array
    };

    console.log("[FRONTEND] Payload to send:");
    console.log("  - numCommande:", payload.numCommande);
    console.log("  - Acheteur (Buyer GLN):", payload.Acheteur);
    console.log("  - fournisseur (Supplier GLN):", payload.fournisseur);
    console.log("  - fournisseurIdEntite (Supplier ID):", payload.fournisseurIdEntite);
    console.log("  - Articles count:", payload.articles.length);
    console.log("  - Full payload:", JSON.stringify(payload, null, 2));

    // Always send to LOCAL server (buyer's own server)
    // The backend handles EDI routing to the supplier's remote server via supplierServer field
    // Sending to the remote server directly would fail because the buyer doesn't exist there
    console.log("[FRONTEND] Using LOCAL server for order creation (inter-country routing handled by backend)");
    const localSupplierServer = SERVERS.find(s => s.id === selectedSupplier._server);
    console.log("[FRONTEND] Supplier is on server:", localSupplierServer?.label || selectedSupplier._server, "| EDI will be routed by backend");

    try {
      const api = createApi(""); // Empty = DEFAULT_BACKEND_URL = local server
      console.log("[FRONTEND] Sending POST to /api/orders/eancom...");
      const res = await api.post("/api/orders/eancom", payload, {
        headers: { "x-entite-id": currentEntiteId },
      });
      console.log("[FRONTEND] Response received:", res.data);

      if (res.data.success) {
        toast({ title: "Succès", description: "Commande créée avec succès ! Envoi en cours..." });

        const totalAmount = validArticles.reduce((sum, item) => sum + (item.price * item.qty), 0).toFixed(2);

        // Build lines array with product details for modal display
        const orderLines = validArticles.map((item, idx) => {
          const product = products.find(p => p.gtin === item.gtin);
          return {
            line_number: idx + 1,
            gtin: item.gtin,
            libelle: item.libelle || product?.libelle || '',
            qty: item.qty,
            prix: item.price,
            price: item.price,
            images: product?.images || null
          };
        });

        const newSentOrder = {
          id_order: res.data.orderId, // Important pour la mise à jour WebSocket
          num_order: numCommande,
          numCommande: numCommande,
          num_commande: numCommande,
          datecommande: new Date().toISOString(),
          created_at: new Date().toLocaleString('sv').replace(' ', 'T'), // Format: YYYY-MM-DDTHH:mm:ss local time
          date_reception: new Date().toLocaleString('sv').replace(' ', 'T'),
          fournisseur_name: selectedSupplier.raison_socialle || selectedSupplier.nom || "Fournisseur",
          seller_name: selectedSupplier.raison_socialle || selectedSupplier.nom || "Fournisseur",
          id_entite_seller: selectedSupplier.id_entite, // Conserver l'ID pour référence
          id_entite_buyer: currentEntiteId,
          buyer_name: currentUser?.nom || "Acheteur",
          nbr_lin_article: articles.length,
          montant_ht: totalAmount,
          total_ht: totalAmount,
          monnaie: selectedCurrency.value,
          currency: selectedCurrency.value,
          type: "Envoyée",
          statut: "new", // Statut initial "new" en attendant l'envoi par le worker
          status: "new", // Ajouter aussi status pour cohérence
          lines: orderLines, // Include product lines for modal display
        };

        console.log('[FRONTEND] New order created locally:', newSentOrder);
        setSentOrdersLocal(prev => [newSentOrder, ...prev]);

        // Reset Form
        setArticles([]);
        setNumCommande("");
        setSelectedSupplier(null);
        setProducts([]);
        setSelectedProduct(null);
        setQty("");
        setPrice("");
        generateOrderNumber();
        setDisplayMode("sent");
        
        // Close modal only on success
        setShowSummaryModal(false);

        // Refresh orders to show the new one and potential received copy (self-loop)
        setTimeout(() => loadAllOrders(), 1000);
      } else {
        toast({
          title: "Échec envoi",
          description: res.data.error || "Le serveur a refusé la commande",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[FRONTEND] ❌ Order Submit Error:", err);
      console.error("[FRONTEND] Error response:", err.response?.data);
      
      const errorDetails = err.response?.data?.details || err.response?.data?.error || err.message || "Impossible de contacter le serveur";
      const errorHint = err.response?.data?.hint;
      
      toast({
        title: "Erreur réseau",
        description: (
          <div>
            <p>{errorDetails}</p>
            {errorHint && <p className="mt-2 text-sm opacity-80">💡 {errorHint}</p>}
          </div>
        ),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProcessingModal = (order: any, forceEditable = false) => {
    console.log("\n=== [OPEN PROCESSING MODAL] START ===");
    console.log("[MODAL] Current User ID (currentEntiteId):", currentEntiteId);
    console.log("[MODAL] Order Details:", {
      id_order: order.id_order,
      num_order: order.num_order || order.num_commande,
      type: order.type,
      status: order.status,
      statut: order.statut,
      id_entite_seller: order.id_entite_seller,
      id_entite_buyer: order.id_entite_buyer,
      seller_name: order.seller_name || order.fournisseur_name,
      buyer_name: order.buyer_name
    });
    
    // Calculate readonly condition
    const isEnvoyee = order.type === "Envoyée";
    const isNotSeller = String(order.id_entite_seller) !== String(currentEntiteId);
    const willBeReadonly = isEnvoyee && isNotSeller;
    
    console.log("[MODAL] Readonly Calculation:");
    console.log("  - order.type === 'Envoyée'?", isEnvoyee, "(actual type:", order.type, ")");
    console.log("  - order.id_entite_seller:", order.id_entite_seller, "(type:", typeof order.id_entite_seller, ")");
    console.log("  - currentEntiteId:", currentEntiteId, "(type:", typeof currentEntiteId, ")");
    console.log("  - String(order.id_entite_seller) !== String(currentEntiteId)?", isNotSeller);
    console.log("  - forceEditable (Supplier Simulation)?", forceEditable);
    console.log("  - FINAL readonly value:", willBeReadonly && !forceEditable);
    console.log("=== [OPEN PROCESSING MODAL] END ===\n");
    
    setSimulateSupplierMode(forceEditable);
    setSelectedOrderForProcessing(order);
    setShowProcessingModal(true);
  };

  const handleProcessOrder = async (data: any) => {
    console.log("[FRONTEND] Processing order response:", data);
    
    // Find server URL for the seller (us) or buyer? 
    // The response is sent FROM the seller (us) TO the buyer.
    // We are the seller. The order is INCOMING.
    // The endpoint /api/orders/respond is on OUR backend (localhost).
    // Our backend will then send the EDI file to the remote EDI server.
    
    // We need to use one of the configured servers (localhost mostly for backend calls)
    const server = SERVERS.find(s => s.id === "all");
    
    if (!server) return;

    try {
      const api = createApi(server.baseURL);
      const res = await api.post("/api/orders/respond", {
        ...data,
        // Ensure we pass the orderId
        orderId: data.orderId 
      }, {
        headers: { "x-entite-id": currentEntiteId }
      });

      if (res.data.success) {
        toast({ 
          title: "Réponse envoyée", 
          description: `La commande a été traitée avec succès (${data.status}).` 
        });
        
        // Update local state
        setAllOrders(prev => prev.map(o => 
          o.id_order === data.orderId 
            ? { ...o, statut: data.status, status: data.status } 
            : o
        ));
        
        setShowProcessingModal(false);
        setSelectedOrderForProcessing(null);
        loadAllOrders(); // Refresh to ensure sync
      }
    } catch (err: any) {
      console.error("[FRONTEND] Error processing order:", err);
      toast({ 
        title: "Erreur", 
        description: err.response?.data?.error || "Impossible de traiter la commande",
        variant: "destructive"
      });
    }
  };

  // ── Invoice Creation from Order ──────────────────────────────────
  const openInvoiceModal = async (order: any) => {
    // Fetch full order details with lines if not already loaded
    let orderWithLines = order;
    if (!order.lines || order.lines.length === 0) {
      try {
        const api = createApi(DEFAULT_BACKEND_URL);
        const res = await api.get(`/api/orders/${order.id_order}`, {
          headers: { "x-entite-id": currentEntiteId }
        });
        orderWithLines = { ...order, ...res.data, lines: res.data.lines || [] };
      } catch (err) {
        console.error("[INVOICE] Failed to fetch order details:", err);
        orderWithLines = order;
      }
    }
    setSelectedOrderForInvoice(orderWithLines);
    setShowInvoiceModal(true);
  };

  const handleCreateInvoice = async (data: InvoiceFormData, sendImmediately: boolean) => {
    try {
      const api = createApi(DEFAULT_BACKEND_URL);
      const payload = {
        ...data,
        total_ht: data.lines.reduce((s, l) => s + l.line_amount, 0),
        total_tax: data.lines.reduce((s, l) => s + l.tax_amount, 0),
        total_ttc: data.lines.reduce((s, l) => s + l.line_amount + l.tax_amount, 0),
      };

      // 1. Create draft
      const createRes = await api.post("/api/invoices", payload);
      
      if (!createRes.data?.success) {
        throw new Error(createRes.data?.error || "Échec de la création");
      }

      const invoiceId = createRes.data.id;

      // 2. If send immediately, trigger EDI send
      if (sendImmediately && invoiceId) {
        await api.post(`/api/invoices/${invoiceId}/send`);
        toast({
          title: "Facture envoyée",
          description: `La facture ${data.invoic_number} a été créée et transmise via EDI (INVOIC).`,
          className: "bg-green-600 text-white"
        });
      } else {
        toast({
          title: "Brouillon enregistré",
          description: `La facture ${data.invoic_number} a été sauvegardée en brouillon.`
        });
      }

      setShowInvoiceModal(false);
      setSelectedOrderForInvoice(null);
    } catch (err: any) {
      console.error("[INVOICE] Error:", err);
      toast({
        title: "Erreur",
        description: err.response?.data?.error || err.message || "Impossible de créer la facture",
        variant: "destructive"
      });
      throw err; // Re-throw so the modal knows submission failed
    }
  };

  const filteredCompanies = useMemo(() => {
    if (!selectedSegment) return companies;
    return companies.filter(c => {
      // Check if company has the selected segment
      // c.segments is usually an array of strings (codes)
      return Array.isArray(c.segments) && c.segments.includes(selectedSegment.value);
    });
  }, [companies, selectedSegment]);

  const companyOptions = filteredCompanies.map(c => ({
    value: c,
    label: `${c.raison_socialle || c.nom || "Entité"} (${c._server})`,
  }));

  const filteredProducts = products.filter(p =>
    (p.gtin + " " + p.libelle).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fusionner les commandes en évitant les doublons.
  // Priorité aux données serveur (allOrders) car elles contiennent toutes les dates et le lieu de livraison.
  // Les sentOrdersLocal sont gardés uniquement pour les commandes sans id_order (non encore confirmées par le serveur).
  const allAvailableOrders = useMemo(() => {
    const serverIds = new Set(allOrders.map(o => o.id_order).filter(Boolean));
    // Keep only local orders that haven't been confirmed by server yet (no id_order match)
    const onlyLocalPending = sentOrdersLocal.filter(o => !o.id_order || !serverIds.has(o.id_order));
    return [...allOrders, ...onlyLocalPending];
  }, [allOrders, sentOrdersLocal]);

  const filteredOrders = useMemo(() => {
    let orders = allAvailableOrders;
    
    if (displayMode === "received") {
        orders = orders.filter(o => {
            const t = (o.type || "").toLowerCase();
            return t.includes("reçue") || t === "received" || t === "recue";
        });
    }
    if (displayMode === "sent") orders = orders.filter(o => o.type === "Envoyée");

    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime();
      orders = orders.filter(o => parseServerDate(o.date_reception || o.datecommande).getTime() >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      orders = orders.filter(o => parseServerDate(o.date_reception || o.datecommande).getTime() <= to.getTime());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      orders = orders.filter(o => {
        const num = (o.num_order || o.numCommande || "").toLowerCase();
        const entite = (o.type === "Envoyée" ? o.fournisseur_name : o.buyer_name || "").toLowerCase();
        return num.includes(q) || entite.includes(q);
      });
    }

    return orders.sort((a, b) =>
      parseServerDate(b.date_reception || b.datecommande).getTime() - 
      parseServerDate(a.date_reception || a.datecommande).getTime()
    );
  }, [allAvailableOrders, displayMode, filterDateFrom, filterDateTo, searchQuery]);

  const totalItems = filteredOrders.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterDateFrom, filterDateTo, displayMode]);

  const resetFilters = () => {
    setSearchQuery("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
  };

  const getDisplayModeLabel = () => {
    switch (displayMode) {
      case "all": return "Toutes les commandes";
      case "received": return "Commandes Reçues";
      case "sent": return "Commandes Envoyées";
      case "new": return "Nouvelle Commande";
      default: return "Toutes les commandes";
    }
  };

  return (
    <>
      <Toaster />
      <div className="min-h-screen bg-gray-50/50 backdrop-blur-sm p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-medium text-gray-900">Gestion des Commandes</h1>
          </div>

          {displayMode !== "new" ? (
            <>
              {/* Filtres Rapides (Onglets) */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-white/50 p-1 rounded-xl">
                 <div className="flex bg-gray-100/80 p-1 rounded-lg">
                    <button
                      onClick={() => setDisplayMode("all")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        displayMode === "all" ? "bg-white text-blue-950 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Toutes
                    </button>
                    <button
                      onClick={() => setDisplayMode("received")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        displayMode === "received" ? "bg-white text-blue-950 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Reçues
                    </button>
                    <button
                      onClick={() => setDisplayMode("sent")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        displayMode === "sent" ? "bg-white text-blue-950 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Envoyées
                    </button>
                 </div>
                 
                 <Button onClick={() => setDisplayMode("new")} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                    <Plus size={18} /> Nouvelle Commande
                 </Button>
              </div>

              {/* Barre de filtres avancés */}
              <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-5 border border-gray-200 mt-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 max-w-md">
                    <Label className="text-sm font-medium">Recherche</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                      <Input
                        placeholder="N° commande, entité..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Du</Label>
                    <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="mt-1" />
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Au</Label>
                    <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="mt-1" />
                  </div>

                  <div className="flex items-end gap-3 ml-auto">
                    <Button variant="outline" onClick={resetFilters} className="flex items-center gap-2">
                      <X size={16} /> Réinitialiser
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tableau */}
              <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-200 overflow-hidden mt-6">
                <div className="bg-blue-950/95 text-white px-6 py-4">
                  <h2 className="text-lg font-semibold">{getDisplayModeLabel()} ({totalItems})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-50/70 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">N°</th>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">Date</th>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">Entité</th>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">Articles</th>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">Montant</th>
                        <th className="px-6 py-4 text-left font-medium text-blue-950">Statut</th>
                        <th className="px-6 py-4 text-right font-medium text-blue-950">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loadingTables && paginatedOrders.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-12 text-gray-500">Chargement...</td></tr>
                      ) : paginatedOrders.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-12 text-gray-500">Aucune commande trouvée</td></tr>
                      ) : (
                        paginatedOrders.map((order, i) => (
                          <tr 
                            key={i} 
                            className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                            onClick={() => openProcessingModal(order, false)}
                          >
                            <td className="px-6 py-4 font-mono text-sm font-medium">{order.num_order || order.numCommande}</td>
                            <td className="px-6 py-4 text-sm">{parseServerDate(order.date_reception || order.datecommande).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm">{order.type === "Envoyée" ? order.fournisseur_name : order.buyer_name || "-"}</td>
                            <td className="px-6 py-4 text-center text-sm">{order.nbr_lin_article || "-"}</td>
                            <td className="px-6 py-4 text-sm">{order.montant_ht ? `${order.montant_ht} ${order.monnaie || "TND"}` : "-"}</td>
                            <td className="px-6 py-4">
                              {(() => {
                                const status = (order.statut || order.status || "").toLowerCase().trim();
                                let label = status;
                                let className = "bg-gray-100 text-gray-800";

                                if (status === 'new') {
                                  label = "En attente";
                                  className = "bg-yellow-100 text-yellow-800";
                                } else if (status === 'sent') {
                                  label = "Envoyée";
                                  className = "bg-blue-100 text-blue-800";
                                } else if (status === 'received') {
                                  label = "Reçue";
                                  className = "bg-purple-100 text-purple-800";
                                } else if (status === 'accepted') {
                                  label = "Acceptée";
                                  className = "bg-green-100 text-green-800";
                                } else if (status === 'rejected') {
                                  label = "Refusée";
                                  className = "bg-red-100 text-red-800";
                                } else if (status === 'modified') {
                                  label = "Modifiée";
                                  className = "bg-orange-100 text-orange-800";
                                } else if (order.type === "Envoyée") {
                                  label = "Envoyée";
                                  className = "bg-blue-100 text-blue-800";
                                } else if (order.type === "Reçue") {
                                  label = "Reçue";
                                  className = "bg-purple-100 text-purple-800";
                                }

                                return (
                                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${className}`}>
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex gap-2 justify-end items-center">
                                {order.type === "Reçue" ? (
                                  <>
                                    <Button 
                                      size="sm" 
                                      className="bg-blue-600 hover:bg-blue-700 text-white"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openProcessingModal(order);
                                      }}
                                    >
                                      Traiter
                                    </Button>
                                    {['accepted', 'modified', 'shipped'].includes((order.statut || order.status || '').toLowerCase()) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={order.has_invoice ? "text-gray-400 border-gray-200 cursor-not-allowed gap-1" : "text-orange-600 border-orange-200 hover:bg-orange-50 gap-1"}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!order.has_invoice) {
                                            openInvoiceModal(order);
                                          }
                                        }}
                                        disabled={order.has_invoice}
                                        title={order.has_invoice ? "Une facture a déjà été créée pour cette commande" : "Créer une facture pour cette commande"}
                                      >
                                        {order.has_invoice ? <CheckCircle size={14} /> : <FileText size={14} />}
                                        {order.has_invoice ? "Facturée" : "Facturer"}
                                      </Button>
                                    )}
                                    {['accepted', 'modified'].includes((order.statut || order.status || '').toLowerCase()) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-green-600 border-green-200 hover:bg-green-50 gap-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate("/operation-edi/shipments", { state: { orderId: order.id_order } });
                                        }}
                                        title="Créer un avis d'expédition (DESADV)"
                                      >
                                        <Truck size={14} />
                                        Expédier
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openProcessingModal(order, false);
                                    }}
                                    title="Voir les détails"
                                  >
                                    <Info size={16} className="mr-1" />
                                    Détails
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-t">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">Lignes par page :</span>
                      <Select options={[10, 25, 50, 100].map(n => ({ value: n, label: n }))}
                        value={{ value: pageSize, label: pageSize }}
                        onChange={(opt: any) => { setPageSize(opt?.value || 25); setCurrentPage(1); }}
                        className="w-24" />
                    </div>
                    <div className="text-sm text-gray-600">
                      Page {currentPage} sur {totalPages} ({totalItems} commandes)
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        <ChevronLeft size={16} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                        <ChevronRight size={16} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-xl border border-gray-200 p-8 space-y-8">
              <div className="flex items-center justify-between border-b border-gray-200 pb-5">
                <h2 className="text-2xl font-semibold text-blue-950">Nouvelle Commande</h2>
                <Button
                  variant="outline"
                  onClick={() => setDisplayMode("all")}
                  className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
                >
                  <ArrowLeft size={18} />
                  Retour à la liste
                </Button>
              </div>

              {/* 1. Numéro de commande */}
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                  onClick={() => toggleSection("commande")}>
                  Numéro de Commande {openSections.commande ? <ChevronUp /> : <ChevronDown />}
                </button>
                {openSections.commande && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div>
                        <Label>Préfixe</Label>
                        <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="CMD" className="mt-1" />
                      </div>
                      <div>
                        <Label>Numéro complet</Label>
                        <Input value={numCommande} readOnly className="mt-1 bg-gray-100" />
                      </div>
                      <div>
                        <Label>Suffixe</Label>
                        <Input value={suffix} onChange={e => setSuffix(e.target.value.toUpperCase())} placeholder="-2025" className="mt-1" />
                      </div>
                    </div>
                    <Button variant="outline" onClick={generateOrderNumber} className="mt-3">
                      Générer automatiquement
                    </Button>
                  </div>
                )}
              </div>

              {/* 2. Dates */}
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                  onClick={() => toggleSection("dates")}>
                  Dates de Livraison {openSections.dates ? <ChevronUp /> : <ChevronDown />}
                </button>
                {openSections.dates && (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <Label>Date demandée</Label>
                      <input
                        type="date"
                        value={dateLivraisonDemandee ? dateLivraisonDemandee.slice(0, 10) : ""}
                        onChange={e => {
                          const val = e.target.value;
                          const normalized = val ? `${val}T00:00:00` : "";
                          console.log("[Input onChange] dateLivraisonDemandee:", val, "-> normalized:", normalized);
                          setDateLivraisonDemandee(normalized);
                        }}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      />
                    </div>
                    <div>
                      <Label>Au plus tard</Label>
                      <input
                        type="date"
                        value={dateLivraisonPlusTard ? dateLivraisonPlusTard.slice(0, 10) : ""}
                        onChange={e => {
                          const val = e.target.value;
                          const normalized = val ? `${val}T00:00:00` : "";
                          setDateLivraisonPlusTard(normalized);
                        }}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      />
                    </div>
                    <div>
                      <Label>Au plus tôt</Label>
                      <input
                        type="date"
                        value={dateLivraisonPlusTot ? dateLivraisonPlusTot.slice(0, 10) : ""}
                        onChange={e => {
                          const val = e.target.value;
                          const normalized = val ? `${val}T00:00:00` : "";
                          setDateLivraisonPlusTot(normalized);
                        }}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Monnaie */}
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                  onClick={() => toggleSection("monnaie")}>
                  Monnaie {openSections.monnaie ? <ChevronUp /> : <ChevronDown />}
                </button>
                {openSections.monnaie && (
                  <div className="mt-5 w-full md:w-1/2">
                    <Label>Devise</Label>
                    <Select
                      options={CURRENCIES}
                      value={selectedCurrency}
                      onChange={setSelectedCurrency}
                      formatOptionLabel={(opt: any) => (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{opt.symbol}</span>
                          <span>{opt.label}</span>
                        </div>
                      )}
                      isSearchable
                      className="mt-1"
                    />
                  </div>
                )}
              </div>

              {/* 4. Fournisseur & Produits */}
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                  onClick={() => toggleSection("entite")}>
                  Fournisseur & Produits {openSections.entite ? <ChevronUp /> : <ChevronDown />}
                </button>
                {openSections.entite && (
                  <div className="mt-5 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* Segment Filter */}
                      <div>
                        <Label>Filtrer par Segment (GPC)</Label>
                        <Select
                          options={segments.map(s => ({ value: s.code, label: `${s.code} - ${s.libelle}` }))}
                          value={selectedSegment}
                          onChange={setSelectedSegment}
                          isClearable
                          isSearchable
                          placeholder="Tous les segments..."
                          isLoading={loadingSegments}
                          className="mt-1"
                          noOptionsMessage={() => "Aucun segment trouvé"}
                        />
                      </div>

                      <div>
                        <Label>Pays du Fournisseur</Label>
                        <Select
                          options={SERVERS.map(s => ({ value: s.id, label: s.label }))}
                          value={{ value: selectedServerId, label: SERVERS.find(s => s.id === selectedServerId)?.label }}
                          onChange={(opt: any) => setSelectedServerId(opt?.value || "all")}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Fournisseur <span className="text-red-500">*</span></Label>
                        <Select
                          options={companyOptions}
                          onChange={(opt: any) => {
                            setSelectedSupplier(opt?.value || null);
                            if (opt?.value) loadProductsForSupplier(opt.value);
                            else setProducts([]);
                          }}
                          isClearable
                          isSearchable
                          isLoading={loadingCompanies}
                          placeholder={selectedSegment ? `Fournisseurs du segment ${selectedSegment.value}...` : "Rechercher..."}
                          noOptionsMessage={() => selectedSegment ? "Aucun fournisseur dans ce segment" : "Aucun fournisseur trouvé"}
                          className="mt-1"
                          isDisabled={loadingCompanies}
                        />
                      </div>
                    </div>

                    {selectedSupplier && (
                      <>
                        <Input
                          placeholder="Rechercher GTIN ou libellé..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          className="w-full md:w-96"
                        />

                        <div className="border-2 border-dashed border-blue-300/50 rounded-lg p-5 bg-blue-50/20">
                          <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-12 md:col-span-4">
                              <Label>Produit <span className="text-red-500">*</span></Label>
                              <Select
                                options={filteredProducts.map(p => ({ value: p, label: `${p.gtin} - ${p.libelle}` }))}
                                onChange={(opt: any) => setSelectedProduct(opt?.value || null)}
                                value={selectedProduct ? { value: selectedProduct, label: `${selectedProduct.gtin} - ${selectedProduct.libelle}` } : null}
                                placeholder="Choisir produit"
                                isSearchable
                                className="mt-1"
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Label>Quantité <span className="text-red-500">*</span></Label>
                              <Input
                                ref={qtyInputRef}
                                type="number"
                                min="1"
                                step="1"
                                value={qty}
                                onChange={e => setQty(e.target.value)}
                                placeholder="1"
                                className={!isQtyValid && qty !== "" ? "border-red-500" : ""}
                              />
                              {!isQtyValid && qty !== "" && <p className="text-xs text-red-600 mt-1">Entier ≥ 1 requis</p>}
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Label className="flex items-center gap-1">
                                Prix négocié HT ({selectedCurrency.value})
                                <InfoTooltip content="Prix négocié avec le fournisseur" />
                              </Label>
                              {isPriceLoadedFromDB ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={price}
                                  onChange={e => setPrice(e.target.value)}
                                  placeholder="0.00"
                                  className={!isPriceValid && price !== "" ? "border-red-500" : ""}
                                />
                              ) : (
                                <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500">
                                  {price || "0.00"} {selectedCurrency.value}
                                </div>
                              )}
                              {!isPriceValid && price !== "" && <p className="text-xs text-red-600 mt-1">Prix ≥ 0 requis</p>}
                            </div>
                            {/* Prix proposé - toujours éditable */}
                            {selectedProduct && (
                              <div className="col-span-6 md:col-span-2">
                                <Label className="flex items-center gap-1">
                                  Prix proposé ({selectedCurrency.value}) {isProposedPriceMandatory && <span className="text-red-500">*</span>}
                                  <InfoTooltip content="Prix que vous proposez au fournisseur pour négociation" />
                                </Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={proposedPrice}
                                  onChange={e => setProposedPrice(e.target.value)}
                                  placeholder="0.00"
                                  className={!isProposedPriceValid && isProposedPriceMandatory && proposedPrice !== "" ? "border-red-500" : ""}
                                />
                                {!isProposedPriceValid && isProposedPriceMandatory && proposedPrice !== "" && <p className="text-xs text-red-600 mt-1">Prix ≥ 0 requis</p>}
                              </div>
                            )}
                            <div className="col-span-6 md:col-span-2">
                              <Label>Packaging</Label>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" disabled={!canAddArticle} className="w-full mt-1">
                                    {canAddArticle ? "Ajouter →" : "Complétez"}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={() => addArticleWithPackaging("12")}>
                                    Carton de 12 unités
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => addArticleWithPackaging("24")}>
                                    Carton de 24 unités
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto border rounded-md mt-5">
                          <table className="w-full text-sm">
                            <thead className="bg-blue-100 sticky top-0">
                              <tr>
                                <th className="p-2 text-center w-16">Image</th>
                                <th className="p-2 text-left">GTIN</th>
                                <th className="p-2 text-left">Libellé</th>
                                <th className="p-2 text-center w-16">Info</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredProducts.map(p => (
                                <tr key={p.id} className="border-b hover:bg-blue-50 transition-colors">
                                  <td className="p-2 text-center">
                                    <div className="w-12 h-12 mx-auto rounded overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                                      {p.images ? (
                                        <img
                                          src={p.images}
                                          alt={p.libelle}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>';
                                          }}
                                        />
                                      ) : (
                                        <ImageIcon size={24} className="text-gray-400" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-2 font-mono cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.gtin}</td>
                                  <td className="p-2 cursor-pointer" onClick={() => setSelectedProduct(p)}>{p.libelle}</td>
                                  <td className="p-2 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openProductDetail(p);
                                      }}
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                                      title="Voir les détails"
                                    >
                                      <Info size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Articles sélectionnés */}
              {articles.length > 0 && (
                <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                  <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                    onClick={() => toggleSection("articles")}>
                    Articles Sélectionnés ({articles.length}) {openSections.articles ? <ChevronUp /> : <ChevronDown />}
                  </button>
                  {openSections.articles && (
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-blue-100">
                          <tr>
                            <th className="p-2 text-left">GTIN</th>
                            <th className="p-2 text-left">Libellé</th>
                            <th className="p-2 text-left">Qté</th>
                            <th className="p-2 text-left">Prix</th>
                            <th className="p-2 text-left">Packaging</th>
                            <th className="p-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {articles.map((a, i) => {
                            const [gtin, q, pr, pack] = a.split("!");
                            const prod = products.find(p => p.gtin === gtin);
                            return (
                              <tr key={i} className="border-b">
                                <td className="p-2">{gtin}</td>
                                <td className="p-2">{prod?.libelle || "-"}</td>
                                <td className="p-2">{q}</td>
                                <td className="p-2">{pr}</td>
                                <td className="p-2">Carton de {pack}</td>
                                <td className="p-2 text-right">
                                  <button onClick={() => removeArticle(i)} className="text-red-600 hover:text-red-800 text-xs">
                                    Supprimer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 6. Transport */}
              <div className="rounded-lg border border-blue-200/50 bg-blue-50/30 p-6 shadow-sm">
                <button className="w-full flex justify-between items-center text-blue-950 font-semibold text-lg"
                  onClick={() => toggleSection("transport")}>
                  Transport {openSections.transport ? <ChevronUp /> : <ChevronDown />}
                </button>
                {openSections.transport && (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <Label>Site fournisseur</Label>
                      <Input value={siteFournisseur} onChange={e => setSiteFournisseur(e.target.value)} placeholder="GLN ou adresse" className="mt-1" />
                    </div>
                    <div>
                      <Label>Site livraison</Label>
                      <Input value={siteLivraison} onChange={e => setSiteLivraison(e.target.value)} placeholder="GLN ou adresse" className="mt-1" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Frais de transport proposés</Label>
                      <Input type="number" step="0.01" value={fraisProposes} onChange={e => setFraisProposes(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-8 border-t border-gray-200">
                <Button
                  onClick={openSummaryModal}
                  disabled={!isFormValid}
                  size="lg"
                  className={`px-12 py-6 text-lg font-medium rounded-xl shadow-lg transition-all ${isFormValid
                    ? "bg-blue-950 hover:bg-blue-900 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                >
                  Voir le Récapitulatif
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Modal */}
        {orderSummaryData && (
          <OrderSummaryModal
            isOpen={showSummaryModal}
            onClose={() => !isSubmitting && setShowSummaryModal(false)}
            onSubmit={submitOrder}
            isLoading={isSubmitting}
            orderData={orderSummaryData}
          />
        )}

        {/* Product Detail Modal */}
        <ProductDetailModal
          product={selectedProductForDetail}
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          currency={selectedCurrency.value}
        />

        {/* Processing Modal */}
        {showProcessingModal && (() => {
          // Readonly logic: 
          // 1. Sent orders that we don't own (we are not the seller)
          // 2. Orders with status 'sent' or 'accepted' (already processed/finalized)
          const isSentByUs = selectedOrderForProcessing?.type === "Envoyée" && String(selectedOrderForProcessing?.id_entite_seller) !== String(currentEntiteId);
          const isFinalized = ['sent', 'accepted'].includes(selectedOrderForProcessing?.status || selectedOrderForProcessing?.statut);
          const baseReadonly = isSentByUs || isFinalized;
          const finalReadonly = baseReadonly && !simulateSupplierMode;
          
          console.log("🔴 [RENDER] OrderProcessingModal readonly calculation:", {
            type: selectedOrderForProcessing?.type,
            status: selectedOrderForProcessing?.status,
            statut: selectedOrderForProcessing?.statut,
            isEnvoyee: selectedOrderForProcessing?.type === "Envoyée",
            id_entite_seller: selectedOrderForProcessing?.id_entite_seller,
            currentEntiteId: currentEntiteId,
            sellerMatch: String(selectedOrderForProcessing?.id_entite_seller) === String(currentEntiteId),
            isSentByUs: isSentByUs,
            isFinalized: isFinalized,
            simulateSupplierMode: simulateSupplierMode,
            baseReadonly: baseReadonly,
            FINAL_READONLY: finalReadonly
          });
          return null;
        })()}
        <OrderProcessingModal
          key={selectedOrderForProcessing?.id_order || selectedOrderForProcessing?.id || 'proc-modal'}
          isOpen={showProcessingModal}
          onClose={() => {
            setShowProcessingModal(false);
            setSimulateSupplierMode(false); // Reset simulation mode when closing
          }}
          onSubmit={handleProcessOrder}
          order={selectedOrderForProcessing}
          // Readonly if: (1) sent order we don't own, OR (2) order is already finalized (sent/accepted)
          readonly={(() => {
            const isSentByUs = selectedOrderForProcessing?.type === "Envoyée" && String(selectedOrderForProcessing?.id_entite_seller) !== String(currentEntiteId);
            const isFinalized = ['sent', 'accepted'].includes(selectedOrderForProcessing?.status || selectedOrderForProcessing?.statut);
            return (isSentByUs || isFinalized) && !simulateSupplierMode;
          })()}
          currentEntiteId={currentEntiteId}
          onSuccess={loadAllOrders}
          onNavigateToShipment={(order) => {
            setShowProcessingModal(false);
            navigate("/shipments", { state: { orderId: order.id_order } });
          }}
        />

        {/* Invoice Creation Modal */}
        <InvoiceCreationModal
          isOpen={showInvoiceModal}
          onClose={() => {
            setShowInvoiceModal(false);
            setSelectedOrderForInvoice(null);
          }}
          onSubmit={handleCreateInvoice}
          order={selectedOrderForInvoice}
          currentUser={currentUser}
        />
      </div>
    </>
  );
}
