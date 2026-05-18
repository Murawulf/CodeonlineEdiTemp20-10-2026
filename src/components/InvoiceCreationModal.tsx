import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Send,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Building2,
  CalendarDays,
  Coins,
  Receipt,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  line_number: number;
  gtin: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_amount: number;
  tax_amount: number;
  gross_amount: number;
}

export interface InvoiceFormData {
  invoic_number: string;
  type_code: string;
  date_facture: string;
  date_echeance: string;
  buyer_gln: string;
  buyer_name: string;
  seller_gln: string;
  seller_name: string;
  delivery_gln: string;
  order_reference: string;
  desadv_reference: string;
  id_order: number | string | null;
  currency: string;
  payment_terms: string;
  note: string;
  lines: InvoiceLineItem[];
}

interface InvoiceCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: InvoiceFormData, sendImmediately: boolean) => Promise<void>;
  order: any;
  currentUser: any;
}

// ── GS1 Constants ──────────────────────────────────────────────────────

const INVOICE_TYPE_CODES = [
  { value: "380", label: "380 - Facture commerciale" },
  { value: "381", label: "381 - Avoir / Note de crédit" },
  { value: "383", label: "383 - Note de débit" },
  { value: "386", label: "386 - Facture pro-forma" },
  { value: "389", label: "389 - Facture auto-facturée" },
];

const CURRENCIES = [
  { value: "TND", label: "TND - Dinar tunisien", symbol: "د.ت" },
  { value: "EUR", label: "EUR - Euro", symbol: "€" },
  { value: "USD", label: "USD - Dollar US", symbol: "$" },
  { value: "XOF", label: "XOF - Franc CFA", symbol: "Fr" },
  { value: "GBP", label: "GBP - Livre sterling", symbol: "£" },
];

const TAX_RATES = [0, 7, 13, 19, 20];

const PAYMENT_TERMS = [
  { value: "immediate", label: "Paiement immédiat" },
  { value: "net15", label: "Net 15 jours" },
  { value: "net30", label: "Net 30 jours" },
  { value: "net45", label: "Net 45 jours" },
  { value: "net60", label: "Net 60 jours" },
  { value: "net90", label: "Net 90 jours" },
  { value: "eom", label: "Fin de mois" },
];

// ── Helpers ────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `INV-${y}${m}-${seq}`;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function validateGLN(gln: string): boolean {
  if (!gln) return false;
  // GS1 GLN can be 13-digit numeric (EAN-13) or alphanumeric identifiers
  return gln.length >= 2;
}

function validateGTIN(gtin: string): boolean {
  if (!gtin) return false;
  // GS1 GTIN can be 8, 12, 13, or 14 digits
  const numericOnly = gtin.replace(/\D/g, "");
  return [8, 12, 13, 14].includes(numericOnly.length);
}

function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.value === code)?.symbol || code;
}

function getDueDateFromTerms(invoiceDate: Date, terms: string): Date {
  const daysMap: Record<string, number> = {
    immediate: 0,
    net15: 15,
    net30: 30,
    net45: 45,
    net60: 60,
    net90: 90,
    eom: 30,
  };
  return addDays(invoiceDate, daysMap[terms] || 30);
}

// ── Component ──────────────────────────────────────────────────────────

export default function InvoiceCreationModal({
  isOpen,
  onClose,
  onSubmit,
  order,
  currentUser,
}: InvoiceCreationModalProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    header: true,
    parties: true,
    references: false,
    lines: true,
    totals: true,
    notes: false,
  });

  const [formData, setFormData] = useState<InvoiceFormData>({
    invoic_number: "",
    type_code: "380",
    date_facture: formatDate(new Date()),
    date_echeance: formatDate(addDays(new Date(), 30)),
    buyer_gln: "",
    buyer_name: "",
    seller_gln: "",
    seller_name: "",
    delivery_gln: "",
    order_reference: "",
    desadv_reference: "",
    id_order: null,
    currency: "TND",
    payment_terms: "net30",
    note: "",
    lines: [],
  });

  // ── Initialize from Order ──────────────────────────────────────────
  useEffect(() => {
    if (!order || !isOpen) return;

    const sellerGln = currentUser?.gln || order.fournisseur_gln || order.supplier_gln || "";
    const sellerName = currentUser?.raison_socialle || currentUser?.nom || currentUser?.name || order.seller_name || order.fournisseur_name || "";
    const buyerGln = order.acheteur_gln || order.buyer_gln || order.Acheteur || "";
    const buyerName = order.buyer_name || order.buyerName || order.acheteur_name || "";
    const deliveryGln = order.lieu_livraison_gln || buyerGln;
    const orderRef = order.num_order || order.num_commande || "";
    const currency = order.monnaie || order.currency || "TND";

    // Map order lines to invoice lines
    const lines: InvoiceLineItem[] = (order.lines || []).map(
      (line: any, idx: number) => {
        const qty = parseFloat(line.confirmed_qty || line.confirmedQty || line.qty || 0);
        const price = parseFloat(line.confirmed_price || line.confirmedPrice || line.price || line.prix || 0);
        const lineAmount = qty * price;
        const taxRate = 19; // Default Tunisian VAT
        const taxAmount = lineAmount * (taxRate / 100);

        return {
          line_number: idx + 1,
          gtin: line.gtin || "",
          description: line.libelle || line.description || `Article ${idx + 1}`,
          quantity: qty,
          unit_price: price,
          tax_rate: taxRate,
          line_amount: lineAmount,
          tax_amount: taxAmount,
          gross_amount: lineAmount + taxAmount,
        };
      }
    );

    setFormData({
      invoic_number: generateInvoiceNumber(),
      type_code: "380",
      date_facture: formatDate(new Date()),
      date_echeance: formatDate(addDays(new Date(), 30)),
      buyer_gln: buyerGln,
      buyer_name: buyerName,
      seller_gln: sellerGln,
      seller_name: sellerName,
      delivery_gln: deliveryGln,
      order_reference: orderRef,
      desadv_reference: order.desadvNumber || "",
      id_order: order.id_order || null,
      currency,
      payment_terms: "net30",
      note: "",
      lines,
    });

    setValidationErrors([]);
  }, [order, isOpen, currentUser]);

  // ── Computed Totals ────────────────────────────────────────────────
  const totals = useMemo(() => {
    const totalHT = formData.lines.reduce((s, l) => s + l.line_amount, 0);
    const totalTax = formData.lines.reduce((s, l) => s + l.tax_amount, 0);
    const totalTTC = totalHT + totalTax;

    // Tax breakdown by rate
    const taxBreakdown: Record<number, { base: number; tax: number }> = {};
    formData.lines.forEach((l) => {
      if (!taxBreakdown[l.tax_rate]) {
        taxBreakdown[l.tax_rate] = { base: 0, tax: 0 };
      }
      taxBreakdown[l.tax_rate].base += l.line_amount;
      taxBreakdown[l.tax_rate].tax += l.tax_amount;
    });

    return { totalHT, totalTax, totalTTC, taxBreakdown };
  }, [formData.lines]);

  // ── Section Toggle ─────────────────────────────────────────────────
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ── Line Handlers ──────────────────────────────────────────────────
  const updateLine = useCallback(
    (index: number, field: keyof InvoiceLineItem, value: string | number) => {
      setFormData((prev) => {
        const lines = [...prev.lines];
        const line = { ...lines[index], [field]: value };

        // Recalculate amounts when qty, price, or tax changes
        if (field === "quantity" || field === "unit_price" || field === "tax_rate") {
          const qty = field === "quantity" ? Number(value) : line.quantity;
          const price = field === "unit_price" ? Number(value) : line.unit_price;
          const taxRate = field === "tax_rate" ? Number(value) : line.tax_rate;
          line.line_amount = qty * price;
          line.tax_amount = line.line_amount * (taxRate / 100);
          line.gross_amount = line.line_amount + line.tax_amount;
        }

        lines[index] = line;
        return { ...prev, lines };
      });
    },
    []
  );

  const addLine = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          line_number: prev.lines.length + 1,
          gtin: "",
          description: "",
          quantity: 1,
          unit_price: 0,
          tax_rate: 19,
          line_amount: 0,
          tax_amount: 0,
          gross_amount: 0,
        },
      ],
    }));
  }, []);

  const removeLine = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines
        .filter((_, i) => i !== index)
        .map((l, i) => ({ ...l, line_number: i + 1 })),
    }));
  }, []);

  // ── Payment Terms → Due Date ───────────────────────────────────────
  const handlePaymentTermsChange = (terms: string) => {
    const invoiceDate = new Date(formData.date_facture);
    const dueDate = getDueDateFromTerms(invoiceDate, terms);
    setFormData((prev) => ({
      ...prev,
      payment_terms: terms,
      date_echeance: formatDate(dueDate),
    }));
  };

  // ── Validation (GS1 INVOIC rules) ─────────────────────────────────
  const validate = (): string[] => {
    const errors: string[] = [];

    if (!formData.invoic_number.trim()) errors.push("Le numéro de facture est obligatoire (BGM)");
    if (!formData.date_facture) errors.push("La date de facture est obligatoire (DTM+137)");
    if (!validateGLN(formData.buyer_gln)) errors.push("Le GLN acheteur est invalide (NAD+BY)");
    if (!validateGLN(formData.seller_gln)) errors.push("Le GLN vendeur est invalide (NAD+SU)");
    if (formData.lines.length === 0) errors.push("Au moins une ligne article est requise (LIN)");

    formData.lines.forEach((line, i) => {
      if (!line.gtin || !validateGTIN(line.gtin)) {
        errors.push(`Ligne ${i + 1}: GTIN invalide "${line.gtin}" (format GS1: 8/12/13/14 chiffres)`);
      }
      if (line.quantity <= 0) errors.push(`Ligne ${i + 1}: La quantité doit être > 0 (QTY)`);
      if (line.unit_price < 0) errors.push(`Ligne ${i + 1}: Le prix unitaire ne peut pas être négatif (PRI)`);
    });

    return errors;
  };

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (sendImmediately: boolean) => {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData, sendImmediately);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!order) return null;

  const currencySymbol = getCurrencySymbol(formData.currency);

  // ── Section Header Component ───────────────────────────────────────
  const SectionHeader = ({
    icon: Icon,
    title,
    sectionKey,
    badge,
  }: {
    icon: any;
    title: string;
    sectionKey: keyof typeof expandedSections;
    badge?: string;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-950/5 to-transparent border border-gray-200 rounded-lg hover:from-blue-950/10 transition-all"
    >
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-blue-600" />
        <span className="font-semibold text-blue-950 text-sm">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      {expandedSections[sectionKey] ? (
        <ChevronUp size={16} className="text-gray-400" />
      ) : (
        <ChevronDown size={16} className="text-gray-400" />
      )}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-950 to-blue-800 text-white px-6 py-4 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg text-white">
              <Receipt size={24} />
              Créer une Facture (INVOIC)
              <Badge className="bg-white/20 text-white border-white/30 text-xs ml-2">
                GS1 EANCOM
              </Badge>
            </DialogTitle>
            <p className="text-blue-200 text-sm mt-1">
              Commande source : <span className="font-mono font-bold text-white">{order.num_order || order.num_commande}</span>
              {order.buyer_name && (
                <span className="ml-2">— {order.buyer_name}</span>
              )}
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* ── Validation Errors ─────────────────────────── */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-red-800 text-sm">Erreurs de validation GS1</p>
                  <ul className="mt-1 text-sm text-red-700 list-disc list-inside space-y-0.5">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ── Section: Header / Document ────────────────── */}
          <SectionHeader icon={FileText} title="Document" sectionKey="header" badge={formData.type_code} />
          {expandedSections.header && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-1">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">N° Facture *</Label>
                <Input
                  value={formData.invoic_number}
                  onChange={(e) => setFormData((p) => ({ ...p, invoic_number: e.target.value }))}
                  placeholder="INV-2603-XXXX"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Type (BGM)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.type_code}
                  onChange={(e) => setFormData((p) => ({ ...p, type_code: e.target.value }))}
                >
                  {INVOICE_TYPE_CODES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Date Facture (DTM+137) *</Label>
                <Input
                  type="date"
                  value={formData.date_facture}
                  onChange={(e) => setFormData((p) => ({ ...p, date_facture: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Devise (CUX)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.currency}
                  onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── Section: Parties ──────────────────────────── */}
          <SectionHeader icon={Building2} title="Parties (NAD)" sectionKey="parties" />
          {expandedSections.parties && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-1">
              {/* Seller */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-blue-600 text-white text-xs">SU</Badge>
                  <span className="font-semibold text-blue-950 text-sm">Vendeur (NAD+SU)</span>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">GLN Vendeur *</Label>
                  <Input
                    value={formData.seller_gln}
                    onChange={(e) => setFormData((p) => ({ ...p, seller_gln: e.target.value }))}
                    placeholder="GLN 13 chiffres"
                    className={`font-mono ${formData.seller_gln && !validateGLN(formData.seller_gln) ? "border-red-300 bg-red-50" : ""}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Raison sociale</Label>
                  <Input
                    value={formData.seller_name}
                    onChange={(e) => setFormData((p) => ({ ...p, seller_name: e.target.value }))}
                    placeholder="Nom du vendeur"
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Buyer */}
              <div className="bg-orange-50/60 border border-orange-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-orange-500 text-white text-xs">BY</Badge>
                  <span className="font-semibold text-blue-950 text-sm">Acheteur (NAD+BY)</span>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">GLN Acheteur *</Label>
                  <Input
                    value={formData.buyer_gln}
                    onChange={(e) => setFormData((p) => ({ ...p, buyer_gln: e.target.value }))}
                    placeholder="GLN 13 chiffres"
                    className={`font-mono ${formData.buyer_gln && !validateGLN(formData.buyer_gln) ? "border-red-300 bg-red-50" : ""}`}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Raison sociale</Label>
                  <Input
                    value={formData.buyer_name}
                    onChange={(e) => setFormData((p) => ({ ...p, buyer_name: e.target.value }))}
                    placeholder="Nom de l'acheteur"
                    className="bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Section: References & Payment ─────────────── */}
          <SectionHeader icon={CalendarDays} title="Références & Paiement" sectionKey="references" />
          {expandedSections.references && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-1">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Réf. Commande (RFF+ON)</Label>
                <Input
                  value={formData.order_reference}
                  onChange={(e) => setFormData((p) => ({ ...p, order_reference: e.target.value }))}
                  placeholder="N° commande"
                  className="font-mono bg-gray-50"
                  readOnly
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Réf. Avis d'expédition (RFF+DQ)</Label>
                <Input
                  value={formData.desadv_reference}
                  onChange={(e) => setFormData((p) => ({ ...p, desadv_reference: e.target.value }))}
                  placeholder="N° DESADV (optionnel)"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">GLN Livraison (NAD+DP)</Label>
                <Input
                  value={formData.delivery_gln}
                  onChange={(e) => setFormData((p) => ({ ...p, delivery_gln: e.target.value }))}
                  placeholder="GLN lieu de livraison"
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Conditions de paiement (PAT)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.payment_terms}
                  onChange={(e) => handlePaymentTermsChange(e.target.value)}
                >
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Date d'échéance (DTM+13)</Label>
                <Input
                  type="date"
                  value={formData.date_echeance}
                  onChange={(e) => setFormData((p) => ({ ...p, date_echeance: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* ── Section: Line Items ───────────────────────── */}
          <SectionHeader
            icon={Package}
            title="Lignes Articles (LIN)"
            sectionKey="lines"
            badge={`${formData.lines.length} ligne${formData.lines.length !== 1 ? "s" : ""}`}
          />
          {expandedSections.lines && (
            <div className="px-1">
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-950/5">
                      <tr>
                        <th className="p-2.5 text-left text-xs font-semibold text-blue-950 w-8">#</th>
                        <th className="p-2.5 text-left text-xs font-semibold text-blue-950 min-w-[130px]">GTIN *</th>
                        <th className="p-2.5 text-left text-xs font-semibold text-blue-950 min-w-[180px]">Désignation</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-blue-950 w-20">Qté</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-blue-950 w-24">Prix U.</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-blue-950 w-20">TVA %</th>
                        <th className="p-2.5 text-right text-xs font-semibold text-blue-950 w-24">Montant HT</th>
                        <th className="p-2.5 text-right text-xs font-semibold text-blue-950 w-24">Montant TTC</th>
                        <th className="p-2.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {formData.lines.map((line, idx) => {
                        const gtinValid = !line.gtin || validateGTIN(line.gtin);
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50 group">
                            <td className="p-2 text-center text-xs text-gray-400 font-mono">
                              {line.line_number}
                            </td>
                            <td className="p-2">
                              <Input
                                value={line.gtin}
                                onChange={(e) => updateLine(idx, "gtin", e.target.value)}
                                className={`h-8 text-xs font-mono ${!gtinValid ? "border-red-300 bg-red-50" : ""}`}
                                placeholder="3456789012345"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={line.description}
                                onChange={(e) => updateLine(idx, "description", e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Description article"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs text-center"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_price}
                                onChange={(e) => updateLine(idx, "unit_price", parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs text-center"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={line.tax_rate}
                                onChange={(e) => updateLine(idx, "tax_rate", parseFloat(e.target.value))}
                              >
                                {TAX_RATES.map((r) => (
                                  <option key={r} value={r}>
                                    {r}%
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-right text-xs font-medium font-mono">
                              {line.line_amount.toFixed(2)}
                            </td>
                            <td className="p-2 text-right text-xs font-bold font-mono text-blue-700">
                              {line.gross_amount.toFixed(2)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                title="Supprimer la ligne"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {formData.lines.length === 0 && (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    Aucune ligne. Cliquez sur "Ajouter une ligne" pour commencer.
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="mt-3 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Plus size={14} /> Ajouter une ligne
              </Button>
            </div>
          )}

          {/* ── Section: Totals ───────────────────────────── */}
          <SectionHeader icon={Coins} title="Totaux (MOA)" sectionKey="totals" />
          {expandedSections.totals && (
            <div className="px-1">
              <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 border border-gray-200 rounded-lg p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Tax Breakdown */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Détail TVA (TAX+7+VAT)
                    </h4>
                    <div className="space-y-1.5">
                      {Object.entries(totals.taxBreakdown).map(([rate, data]) => (
                        <div key={rate} className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            TVA {rate}% sur {data.base.toFixed(2)} {currencySymbol}
                          </span>
                          <span className="font-medium font-mono">
                            {data.tax.toFixed(2)} {currencySymbol}
                          </span>
                        </div>
                      ))}
                      {Object.keys(totals.taxBreakdown).length === 0 && (
                        <p className="text-gray-400 text-sm italic">Aucune ligne</p>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="space-y-2.5 text-right">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total HT (MOA+79)</span>
                      <span className="font-medium font-mono text-base">
                        {totals.totalHT.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total TVA (MOA+176)</span>
                      <span className="font-medium font-mono text-base">
                        {totals.totalTax.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                    <div className="border-t border-gray-300 pt-2.5 mt-2.5">
                      <div className="flex justify-between">
                        <span className="font-semibold text-blue-950">Total TTC (MOA+128)</span>
                        <span className="font-bold font-mono text-xl text-blue-700">
                          {totals.totalTTC.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Section: Notes ────────────────────────────── */}
          <SectionHeader icon={Info} title="Notes (FTX)" sectionKey="notes" />
          {expandedSections.notes && (
            <div className="px-1">
              <Textarea
                placeholder="Informations supplémentaires pour la facture (optionnel)..."
                value={formData.note}
                onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                rows={3}
              />
            </div>
          )}

          {/* ── GS1 Compliance Indicator ──────────────────── */}
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-gray-500">
            <CheckCircle2 size={14} className="text-green-500" />
            <span>
              Ce formulaire génère un message <strong>INVOIC D:96A:UN:EAN008</strong> conforme aux
              standards GS1 EANCOM. Les segments BGM, DTM, NAD, CUX, LIN, QTY, PRI, MOA, TAX, UNS
              et CNT seront automatiquement inclus.
            </span>
          </div>
        </div>

        {/* ── Footer Actions ──────────────────────────────── */}
        <DialogFooter className="sticky bottom-0 bg-white border-t px-6 py-4 flex-col sm:flex-row gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className="sm:mr-auto">
            Annuler
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className="gap-2"
          >
            <Save size={16} />
            {isSubmitting ? "Enregistrement..." : "Enregistrer brouillon"}
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Send size={16} />
            {isSubmitting ? "Envoi en cours..." : "Créer & Envoyer (EDI)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
