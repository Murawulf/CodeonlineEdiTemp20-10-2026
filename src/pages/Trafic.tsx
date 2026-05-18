import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Bell,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  Info,
  Eye,
  CheckCheck,
  RefreshCw
} from "lucide-react";

function getCurrentUser(): any {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); } catch { return {}; }
}

const Trafic: React.FC = () => {
  const { getLocalApiUrl } = useSettings();
  const LOCAL_API_URL = getLocalApiUrl();
  const currentUser = getCurrentUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const id_compte = parseInt(localStorage.getItem("id_compte") || "0");
  const id_entite = parseInt(localStorage.getItem("id_entite") || "0");
  const isAdmin = [111, 999].includes(id_entite) || (currentUser.profil || "").toLowerCase().includes("admin") || (currentUser.profil || "").toLowerCase().includes("supervisor");

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      let url = `${LOCAL_API_URL}/api/proxy/notifications`;
      if (isAdmin) {
        url += "?id_compte=all";
      } else {
        url += `?id_compte=${id_compte}`;
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await fetch(`${LOCAL_API_URL}/api/proxy/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id_compte })
      });
      setNotifications(prev => prev.map(n =>
        n.id_notification === id ? { ...n, read: 1 } : n
      ));
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await fetch(`${LOCAL_API_URL}/api/proxy/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id_compte })
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  const handleDelete = async (id: number, notif_id_compte: number) => {
    if (!confirm("Supprimer cette notification ?")) return;
    try {
      await fetch(`${LOCAL_API_URL}/api/proxy/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id_compte: notif_id_compte })
      });
      setNotifications(prev => prev.filter(n => n.id_notification !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    if (activeTab === "unread") filtered = filtered.filter(n => !n.read);
    else if (activeTab === "read") filtered = filtered.filter(n => n.read);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => (n.contenu || "").toLowerCase().includes(q));
    }
    return filtered;
  }, [notifications, activeTab, searchQuery]);

  const counts = useMemo(() => ({
    all: notifications.length,
    unread: notifications.filter(n => !n.read).length,
    read: notifications.filter(n => n.read).length,
  }), [notifications]);

  const getTypeIcon = (type: string) => {
    if (type === "success") return <CheckCircle size={18} className="text-green-500 shrink-0" />;
    if (type === "error") return <XCircle size={18} className="text-red-500 shrink-0" />;
    return <Info size={18} className="text-blue-500 shrink-0" />;
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-blue-950 flex items-center gap-2">
            <Bell className="h-7 w-7 text-blue-600" />
            Journal Trafic
          </h1>
          <p className="text-gray-500">Historique complet des notifications et échanges EDI</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={loading} className="gap-1">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </Button>
          {counts.unread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead} className="gap-1">
              <CheckCheck size={14} /> Tout marquer lu
            </Button>
          )}
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Toutes ({counts.all})</TabsTrigger>
            <TabsTrigger value="unread">Non lues ({counts.unread})</TabsTrigger>
            <TabsTrigger value="read">Lues ({counts.read})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9 w-72"
            placeholder="Rechercher dans les notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Chargement...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Bell size={48} className="mx-auto mb-3 opacity-20" />
              <p>Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotifications.map((notif) => (
                <div
                  key={notif.id_notification}
                  className={`flex items-start gap-3 p-4 transition-colors ${
                    notif.read ? "bg-white" : "bg-blue-50/40"
                  } hover:bg-gray-50`}
                >
                  {/* Icon */}
                  <div className="pt-0.5">{getTypeIcon(notif.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${notif.read ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                      {notif.contenu}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                      {!notif.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="Non lu" />
                      )}
                      {notif.link && (
                        <a href={notif.link} className="text-xs text-blue-600 hover:underline">
                          Voir détails →
                        </a>
                      )}
                      {isAdmin && notif.id_compte && (
                        <span className="text-xs text-gray-300">Compte #{notif.id_compte}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!notif.read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-blue-600 hover:text-blue-800"
                        title="Marquer comme lu"
                        onClick={() => handleMarkAsRead(notif.id_notification)}
                      >
                        <Eye size={14} />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-400 hover:text-red-600"
                        title="Supprimer (Admin)"
                        onClick={() => handleDelete(notif.id_notification, notif.id_compte)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Trafic;