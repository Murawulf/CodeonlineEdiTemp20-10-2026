import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api`;

interface Tracking {
  id: number;
  id_shipment: string;
  event_code: string;
  event_label: string;
  event_datetime: string;
  location: string;
}

const TrackingPage: React.FC = () => {
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [form, setForm] = useState<Partial<Tracking>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchTracking = async () => {
    if (!shipmentId) return;
    const res = await axios.get(`${API_BASE_URL}/tracking/${shipmentId}`);
    setTracking(res.data);
  };

  useEffect(() => {
    fetchTracking();
  }, [shipmentId]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete tracking event?")) return;
    await axios.delete(`${API_BASE_URL}/tracking/${id}`);
    fetchTracking();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipmentId) return alert("Enter shipment ID");
    if (editingId) {
      await axios.put(`${API_BASE_URL}/tracking/${editingId}`, form);
      setEditingId(null);
    } else {
      await axios.post(`${API_BASE_URL}/tracking/${shipmentId}`, form);
    }
    setForm({});
    fetchTracking();
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Tracking</h1>

      <input
        type="text"
        placeholder="Shipment ID"
        value={shipmentId}
        onChange={(e) => setShipmentId(e.target.value)}
        className="border p-1 mb-2"
      />
      <button
        onClick={fetchTracking}
        className="bg-green-500 text-white px-2 rounded mb-4"
      >
        Load Tracking
      </button>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Event Code"
          value={form.event_code || ""}
          onChange={(e) => setForm({ ...form, event_code: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Event Label"
          value={form.event_label || ""}
          onChange={(e) => setForm({ ...form, event_label: e.target.value })}
          className="border p-1"
        />
        <input
          type="datetime-local"
          placeholder="Event DateTime"
          value={form.event_datetime || ""}
          onChange={(e) => setForm({ ...form, event_datetime: e.target.value })}
          className="border p-1"
        />
        <input
          placeholder="Location"
          value={form.location || ""}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
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
            <th>Shipment</th>
            <th>Event Code</th>
            <th>Label</th>
            <th>DateTime</th>
            <th>Location</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tracking.map((t) => (
            <tr key={t.id} className="border-b">
              <td>{t.id}</td>
              <td>{t.id_shipment}</td>
              <td>{t.event_code}</td>
              <td>{t.event_label}</td>
              <td>{t.event_datetime}</td>
              <td>{t.location}</td>
              <td className="flex gap-2">
                <button
                  className="bg-yellow-400 px-2 rounded"
                  onClick={() => {
                    setForm(t);
                    setEditingId(t.id);
                  }}
                >
                  Edit
                </button>
                <button
                  className="bg-red-500 text-white px-2 rounded"
                  onClick={() => handleDelete(t.id)}
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

export default TrackingPage;
