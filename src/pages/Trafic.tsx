import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import axios from "axios";

const Trafic: React.FC = () => {
  const text = "Service    ultérieur ( Phase 2 )".split("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isSpecial, setIsSpecial] = useState(false);

  useEffect(() => {
    const id_compte = parseInt(localStorage.getItem("id_compte") || "0");
    const id_entite = parseInt(localStorage.getItem("id_entite") || "0");
    const special = [111, 999].includes(id_entite);
    setIsSpecial(special);

    const fetchNotifications = async () => {
      try {
        let url = "/api/notifications";
        if (special) {
          url += "?id_compte=all";
        } else {
          url += `?id_compte=${id_compte}`;
        }
        const response = await axios.get(url);
        setNotifications(response.data);
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };

    fetchNotifications();
  }, []);

  const handleDelete = async (id: number, notif_id_compte: number) => {
    try {
      await axios.delete(`/api/notifications/${id}`, {
        data: { id_compte: notif_id_compte },
      });
      setNotifications(notifications.filter((n) => n.id_notification !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Breadcrumb same as Opérations */}
      <nav className="flex items-center space-x-2 text-sm">
        <span
          style={{
            color: "#3b82f6",
            position: "relative",
            top: "-14px",
            fontWeight: "500",
          }}
        >
          Trafic
        </span>
      </nav>

      {/* Main Content */}
      <div className="space-y-6 p-6">
        {/* Journal Trafic Card */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Journal Trafic</CardTitle>
            <CardDescription>Liste des notifications</CardDescription>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p>Aucune notification</p>
            ) : (
              <ul className="space-y-4">
                {notifications.map((notif) => (
                  <li
                    key={notif.id_notification}
                    className={`flex justify-between items-center p-2 border rounded ${
                      notif.read ? "bg-gray-100" : "bg-white"
                    }`}
                  >
                    <div>
                      <p
                        className={`font-bold ${
                          notif.type === "success" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {notif.contenu}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(notif.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm">{notif.read ? "Lu" : "Non lu"}</p>
                    </div>
                    {isSpecial && (
                      <button
                        onClick={() => handleDelete(notif.id_notification, notif.id_compte)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Original Card */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Interactions du réseau PAESN</CardTitle>
            <CardDescription>
              Suivi des échanges entre le Data Pool Sénégal et les plateformes externes locales ou internationales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border rounded border-dashed">
              <div className="flex space-x-1">
                {text.map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-sky-600 font-extrabold text-5xl"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                    transition={{
                      duration: 0.6,
                      delay: i * 0.3,
                      repeat: Infinity,
                      repeatDelay: text.length * 0.3 + 1,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Trafic;