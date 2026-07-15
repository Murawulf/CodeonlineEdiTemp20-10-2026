import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocalApiUrl } from "@/contexts/SettingsContext";

// Modèle aligné sur le hub PAESN (edi_transport_orders).
interface TransportOrder {
  ref: string;
  order_ref?: string;
  desadv_ref?: string;
  carrier_code: string;
  country_code: string;
  status: string;
  tracking_number?: string;
  created_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-gray-200 text-gray-800",
  SENT_TO_CARRIER: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-indigo-100 text-indigo-800",
  IN_TRANSIT: "bg-amber-100 text-amber-800",
  DELIVERED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const TransportOrders: React.FC = () => {
  const API_BASE_URL = `${useLocalApiUrl()}/api`;
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [form, setForm] = useState({
    country_code: "384",
    carrier_code: "MOCK01",
    order_ref: "",
    consignor_gln: "6181234567890",
    consignee_gln: "6191234567890",
    packageCount: 1,
    description: "",
  });

  const extract = (data: any): TransportOrder[] =>
    Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/transport`);
      setOrders(extract(res.data));
    } catch (e: any) {
      setMsg(`Erreur chargement: ${e?.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const body = {
        country_code: form.country_code,
        carrier_code: form.carrier_code,
        order_ref: form.order_ref || undefined,
        consignor: { gln: form.consignor_gln },
        consignee: { gln: form.consignee_gln },
        pickup: { gln: form.consignor_gln },
        delivery: { gln: form.consignee_gln },
        goods: [
          {
            packageCount: Number(form.packageCount) || 1,
            packageType: "CT",
            description: form.description || "Ordre de transport",
          },
        ],
      };
      const res = await axios.post(`${API_BASE_URL}/transport/create`, body);
      if (res.data?.success) {
        setMsg(`Créé: ${res.data.ref} (${res.data.status}) — tracking ${res.data.trackingNumber || "-"}`);
        setForm({ ...form, order_ref: "", description: "" });
        fetchOrders();
      } else {
        setMsg(`Échec: ${res.data?.error || "inconnu"}`);
      }
    } catch (e: any) {
      setMsg(`Erreur création: ${e?.response?.data?.error || e.message}`);
    }
  };

  const handleRefresh = async (ref: string) => {
    try {
      await axios.post(`${API_BASE_URL}/transport/${encodeURIComponent(ref)}/refresh`);
      fetchOrders();
    } catch (e: any) {
      setMsg(`Erreur refresh: ${e?.response?.data?.error || e.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Ordres de Transport (IFTMIN)</h1>
        <p className="text-sm text-gray-500">
          Émission et suivi des ordres de transport auprès des transporteurs (via le hub PAESN).
        </p>
      </div>

      <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded border">
        <label className="text-sm">Pays (code)
          <select className="border p-1 w-full rounded" value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}>
            <option value="384">Côte d'Ivoire (384)</option>
            <option value="788">Tunisie (788)</option>
            <option value="686">Sénégal (686)</option>
          </select>
        </label>
        <label className="text-sm">Transporteur
          <input className="border p-1 w-full rounded" value={form.carrier_code}
            onChange={(e) => setForm({ ...form, carrier_code: e.target.value })} placeholder="MOCK01" />
        </label>
        <label className="text-sm">Réf. commande
          <input className="border p-1 w-full rounded" value={form.order_ref}
            onChange={(e) => setForm({ ...form, order_ref: e.target.value })} placeholder="ORD-…" />
        </label>
        <label className="text-sm">Nb colis
          <input type="number" min={1} className="border p-1 w-full rounded" value={form.packageCount}
            onChange={(e) => setForm({ ...form, packageCount: Number(e.target.value) })} />
        </label>
        <label className="text-sm">Expéditeur (GLN)
          <input className="border p-1 w-full rounded" value={form.consignor_gln}
            onChange={(e) => setForm({ ...form, consignor_gln: e.target.value })} />
        </label>
        <label className="text-sm">Destinataire (GLN)
          <input className="border p-1 w-full rounded" value={form.consignee_gln}
            onChange={(e) => setForm({ ...form, consignee_gln: e.target.value })} />
        </label>
        <label className="text-sm col-span-2">Description
          <input className="border p-1 w-full rounded" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Marchandises…" />
        </label>
        <div className="col-span-2 md:col-span-4">
          <button type="submit" className="bg-blue-700 text-white px-4 py-1.5 rounded hover:bg-blue-800">
            Créer l'ordre de transport
          </button>
        </div>
      </form>

      {msg && <div className="text-sm p-2 rounded bg-slate-100 border">{msg}</div>}

      <div className="bg-white rounded border overflow-x-auto">
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="font-semibold">Ordres ({orders.length})</h2>
          <button onClick={fetchOrders} className="text-sm text-blue-700 hover:underline">
            {loading ? "…" : "Rafraîchir la liste"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="p-2">Réf</th>
              <th className="p-2">Transporteur</th>
              <th className="p-2">Statut</th>
              <th className="p-2">Tracking</th>
              <th className="p-2">Réf commande</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td className="p-3 text-gray-400" colSpan={6}>Aucun ordre de transport.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.ref} className="border-t">
                <td className="p-2 font-mono text-xs">{o.ref}</td>
                <td className="p-2">{o.carrier_code}</td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>
                    {o.status}
                  </span>
                </td>
                <td className="p-2 font-mono text-xs">{o.tracking_number || "-"}</td>
                <td className="p-2">{o.order_ref || "-"}</td>
                <td className="p-2 text-right">
                  <button onClick={() => handleRefresh(o.ref)} className="text-blue-700 hover:underline text-xs">
                    Rafraîchir statut
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransportOrders;
