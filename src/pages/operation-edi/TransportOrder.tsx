import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api`;

interface TransportOrder {
  id: number;
  transport_number: string;
  id_order: string;
  id_shipment: string;
  transporteur: string;
  vehicule: string;
  driver: string;
  status: string;
}

const TransportOrders: React.FC = () => {
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [form, setForm] = useState<Partial<TransportOrder>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchOrders = async () => {
    const res = await axios.get(`${API_BASE_URL}/transport-orders`);
    setOrders(res.data);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete transport order?")) return;
    await axios.delete(`${API_BASE_URL}/transport-orders/${id}`);
    fetchOrders();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await axios.put(`${API_BASE_URL}/transport-orders/${editingId}`, form);
      setEditingId(null);
    } else {
      await axios.post(`${API_BASE_URL}/transport-orders`, form);
    }
    setForm({});
    fetchOrders();
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Transport Orders</h1>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Transport Number"
          value={form.transport_number || ""}
          onChange={(e) => setForm({ ...form, transport_number: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="ID Order"
          value={form.id_order || ""}
          onChange={(e) => setForm({ ...form, id_order: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="ID Shipment"
          value={form.id_shipment || ""}
          onChange={(e) => setForm({ ...form, id_shipment: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Transporteur"
          value={form.transporteur || ""}
          onChange={(e) => setForm({ ...form, transporteur: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Vehicule"
          value={form.vehicule || ""}
          onChange={(e) => setForm({ ...form, vehicule: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Driver"
          value={form.driver || ""}
          onChange={(e) => setForm({ ...form, driver: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Status"
          value={form.status || ""}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="border p-1"
        />
        <button type="submit" className="bg-blue-500 text-white px-2 rounded">
          {editingId ? "Update" : "Add"}
        </button>
      </form>

      <table className="w-full border">
        <thead className="bg-gray-200">
          <tr>
            <th>ID</th>
            <th>Transport Number</th>
            <th>ID Order</th>
            <th>ID Shipment</th>
            <th>Transporteur</th>
            <th>Vehicule</th>
            <th>Driver</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b">
              <td>{o.id}</td>
              <td>{o.transport_number}</td>
              <td>{o.id_order}</td>
              <td>{o.id_shipment}</td>
              <td>{o.transporteur}</td>
              <td>{o.vehicule}</td>
              <td>{o.driver}</td>
              <td>{o.status}</td>
              <td className="flex gap-2">
                <button
                  className="bg-yellow-400 px-2 rounded"
                  onClick={() => {
                    setForm(o);
                    setEditingId(o.id);
                  }}
                >
                  Edit
                </button>
                <button
                  className="bg-red-500 text-white px-2 rounded"
                  onClick={() => handleDelete(o.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransportOrders;
