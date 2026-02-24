import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { createPortal } from "react-dom";

import { Bell, ChevronDown, Menu, Search, Trash2, CheckCircle, AlertCircle, Info, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { LanguageSelector } from "./LanguageSelector";
import { useTranslation } from "@/contexts/TranslationContext";
import { TopBarMenu } from "./TopBarMenu";
import { Link, useNavigate } from "react-router-dom";
import { useNotifications } from "@/contexts/NotificationContext";
import { useSettings } from "@/contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";

interface AuthUser {
  name: string;
  prenom: string;
  initials: string;
  avatar_url?: string | null;
  profile_id: number | null;
  id_compte?: number;
}

interface Profile {
  id_profile: number;
  role: string | null;
}

interface Compte {
  id_compte: number;
  id_entite: number;
}

interface Producteur {
  id_entite: number;
  logo: string;
}

interface HeaderProps {
  setIsSidebarOpen: (open: boolean) => void;
  isSidebarOpen: boolean;
}

export const Header = ({ setIsSidebarOpen, isSidebarOpen }: HeaderProps) => {
  console.log('[Header] 🏛️ Component mounted');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getCurrentCountryInfo } = useSettings();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { notifications, markAsRead, deleteNotification, clearNotifications } = useNotifications();
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'read'>('all');

  const [userPermissions, setUserPermissions] = useState<any[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        const userData = {
          name: parsedUser.name || "Utilisateur",
          prenom: parsedUser.prenom || null,
          initials: parsedUser.name ? parsedUser.name.slice(0, 2).toUpperCase() : "UA",
          avatar_url: parsedUser.avatar_url || null,
          profile_id: parsedUser.profile_id || null,
          id_compte: parsedUser.id_compte || null,
        };
        setUser(userData);
        setUserPermissions(parsedUser.permissions || []);
        setIsAuthenticated(true);
      } catch (err) {
        console.error("Failed to parse stored user:", err);
        localStorage.removeItem("currentUser");
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (isAuthenticated && user?.profile_id) {
        try {
          const response = await fetch(`/api/profiles/${user.profile_id}`, {
            headers: { Accept: "application/json" },
            credentials: "include",
          });
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          const profile: Profile = await response.json();
          setProfileRole(profile.role || "Utilisateur");
        } catch (err: any) {
          console.error("Failed to fetch profile:", err.message);
          setProfileRole("Utilisateur");
        }
      } else {
        setProfileRole("Utilisateur");
      }
    };
    fetchProfile();
  }, [isAuthenticated, user?.profile_id]);

  useEffect(() => {
    const fetchCompanyLogo = async () => {
      if (isAuthenticated && user?.id_compte) {
        console.log('Fetching all comptes for id_compte:', user.id_compte);
        try {
          const pin = localStorage.getItem('pin') || '3311';
          const comptesResponse = await fetch(`/api/comptes`, {
            headers: { Accept: "application/json", 'x-api-pin': pin },
            credentials: "include",
          });
          console.log('Comptes response status:', comptesResponse.status);
          if (!comptesResponse.ok) {
            console.log(`Failed to fetch comptes. Status: ${comptesResponse.status} ${comptesResponse.statusText}`);
            return;
          }
          const comptes: Compte[] = await comptesResponse.json();
          console.log('Comptes data:', comptes);
          const matchingCompte = comptes.find(c => c.id_compte === user.id_compte);
          if (!matchingCompte) {
            console.log(`No compte found for id: ${user.id_compte}`);
            return;
          }
          const id_entite = matchingCompte.id_entite;
          console.log('Found id_entite:', id_entite);

          if (!id_entite) {
            console.log("No producteur associated with account");
            return;
          }

          console.log('Fetching all producteurs');
          const producteursResponse = await fetch(`/api/companies`, {
            headers: { Accept: "application/json", 'x-api-pin': pin },
            credentials: "include",
          });
          console.log('Producteurs response status:', producteursResponse.status);
          if (!producteursResponse.ok) {
            console.log(`Failed to fetch producteurs. Status: ${producteursResponse.status} ${producteursResponse.statusText}`);
            return;
          }
          const producteurs: Producteur[] = await producteursResponse.json();
          console.log('Producteurs data:', producteurs);
          const matchingProducteur = producteurs.find(p => p.id_entite === id_entite);
          if (!matchingProducteur) {
            console.log(`No producteur found for id: ${id_entite}`);
            return;
          }
          console.log('Matching producteur data:', matchingProducteur);
          setCompanyLogo(matchingProducteur.logo || null);
          setLogoLoadError(false);
        } catch (err: any) {
          console.error("Unexpected error fetching company logo:", err.message);
          setLogoLoadError(true);
        }
      }
    };
    fetchCompanyLogo();
  }, [isAuthenticated, user?.id_compte]);

  const handleLogout = () => {
    console.log('[Header] 🚪 Logging out user...');
    localStorage.removeItem("currentUser");
    localStorage.removeItem("pin");
    setUser(null);
    setIsAuthenticated(false);
    setProfileRole(null);
    console.log('[Header] ➡️ Redirecting to /login');
    navigate("/login");
  };

  const handleClearAllNotifications = () => setShowConfirmDialog(true);

 const confirmClearNotifications = async () => {
  try {
    await clearNotifications();
    setShowConfirmDialog(false);
  } catch (err) {
    console.error("Failed to clear notifications:", err);
  }
};


  const cancelClearNotifications = () => setShowConfirmDialog(false);

  const getNotificationIcon = (type: string) => {
    const baseClass = "h-5 w-5 text-[#1e3a8a]";
    switch (type) {
      case "success":
        return <CheckCircle className={baseClass} />;
      case "error":
        return <AlertCircle className={baseClass} />;
      default:
        return <Info className={baseClass} />;
    }
  };

  if (isLoading) return <div className="p-4 text-gray-500">Loading...</div>;

  const placeholderLogo = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAyOCAyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI4IiBoZWlnaHQ9IjI4IiByeD0iMTQiIGZpbGw9IiNDQ0NDQ0MiLz4KPHRleHQgeD0iMTQiIHk9IjE4IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM2NjY2NjYiPkM8L3RleHQ+Cjwvc3ZnPgo=';

  const effectiveLogoSrc = companyLogo && !logoLoadError ? companyLogo : placeholderLogo;

  return (
    <header className="ynex-header sticky top-0 z-50 w-full border-b bg-background shadow-sm">
      <div className="flex h-14 items-center px-4 md:px-6">
        {/* Left Side */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden hover:bg-gray-100"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex items-center gap-2">
            <img
              src={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/lovable-uploads/a13c1ffe-9c2c-4e6a-a048-063ce7274535.png`}
              alt="CodeOnline EDI"
              className="h-10 object-contain"
            />
          </div>
        </div>

        {/* Search bar */}
        <div className="hidden md:flex ml-auto">
          <div className="relative">
         
          </div>
        </div>

        {/* Right Side */}
        <div className="ml-auto md:ml-4 flex items-center gap-4">
          {isAuthenticated && (
            <img
              src={effectiveLogoSrc}
              alt="Company Logo"
              className="h-7 w-7 object-cover rounded-full border"
              onError={() => {
                console.log('Company logo failed to load, using placeholder');
                setLogoLoadError(true);
              }}
            />
          )}
          <img
            src={getCurrentCountryInfo().flagUrl}
            alt={`${getCurrentCountryInfo().name} Flag`}
            title={`Serveur: ${getCurrentCountryInfo().name}`}
            className="h-7 w-7 object-cover rounded-full border bg-white"
          />
          <LanguageSelector />

          {/* Notification Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
                <Bell className="h-5 w-5" />
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border-2 border-background text-white text-[10px] font-bold flex items-center justify-center">
                    {notifications.filter((n) => !n.read).length > 99 ? '99+' : notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[420px] max-h-[85vh] overflow-hidden p-0 bg-white rounded-xl shadow-xl border border-gray-200"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white z-10 border-b border-gray-100">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-[#1e3a8a]" />
                    <span className="text-lg font-semibold text-gray-800">
                      {t("notifications")}
                    </span>
                    {notifications.filter(n => !n.read).length > 0 && (
                      <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {notifications.filter(n => !n.read).length} {t("non-lues") || "non lues"}
                      </span>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleClearAllNotifications}
                      className="text-red-600 hover:text-red-700 flex items-center gap-1 text-xs font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("effacer-tout")}
                    </motion.button>
                  )}
                </div>
                
                {/* Filter Tabs */}
                <div className="flex border-b border-gray-100 px-2">
                  {[
                    { key: 'all', label: t("toutes") || "Toutes", count: notifications.length },
                    { key: 'unread', label: t("non-lues") || "Non lues", count: notifications.filter(n => !n.read).length },
                    { key: 'read', label: t("lues") || "Lues", count: notifications.filter(n => n.read).length }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setNotifFilter(tab.key as 'all' | 'unread' | 'read')}
                      className={cn(
                        "flex-1 py-2.5 text-sm font-medium transition-colors relative",
                        notifFilter === tab.key 
                          ? "text-[#1e3a8a]" 
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      {tab.label} ({tab.count})
                      {notifFilter === tab.key && (
                        <motion.div 
                          layoutId="notifTab"
                          className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#1e3a8a] rounded-full"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notifications List */}
              <div className="overflow-y-auto max-h-[60vh] p-3">
                {notifications.filter(n => {
                  if (notifFilter === 'unread') return !n.read;
                  if (notifFilter === 'read') return n.read;
                  return true;
                }).length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                      {notifFilter === 'unread' 
                        ? (t("aucune-notification-non-lue") || "Aucune notification non lue")
                        : notifFilter === 'read'
                          ? (t("aucune-notification-lue") || "Aucune notification lue")
                          : (t("aucune-notification") || "Aucune notification")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {notifications
                        .filter(n => {
                          if (notifFilter === 'unread') return !n.read;
                          if (notifFilter === 'read') return n.read;
                          return true;
                        })
                        .map((notif) => (
                        <motion.div
                          key={notif.id_notification}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -100 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => {
                            if (notif.link) {
                              navigate(notif.link);
                              setIsSidebarOpen(false); // Close sidebar on mobile if open
                            }
                            if (!notif.read) {
                              markAsRead(notif.id_notification);
                            }
                          }}
                          className={cn(
                            "flex items-start p-3 rounded-lg transition-all border relative group cursor-pointer",
                            notif.read 
                              ? "bg-gray-50 border-gray-100 hover:bg-gray-100" 
                              : "bg-blue-50/50 border-blue-100 hover:bg-blue-100"
                          )}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notif.id_notification);
                            }}
                            className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="flex items-start gap-3 w-full pr-6">
                            <div className={cn(
                              "mt-0.5 p-1.5 rounded-full",
                              notif.type === 'success' ? "bg-green-100" : "bg-red-100"
                            )}>
                              {getNotificationIcon(notif.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm leading-relaxed",
                                notif.read ? "text-gray-600" : "text-gray-800 font-medium"
                              )}>
                                {notif.contenu}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-gray-400">
                                  {new Date(notif.created_at).toLocaleString("fr-FR", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                                {!notif.read && (
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                )}
                              </div>
                            </div>
                            {!notif.read && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notif.id_notification);
                                }}
                                className="text-[#1e3a8a] hover:bg-blue-100 text-xs h-7 px-2 rounded-md border border-blue-200 whitespace-nowrap flex-shrink-0"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </motion.button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              {notifications.filter(n => !n.read).length > 0 && (
                <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 p-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      notifications.filter(n => !n.read).forEach(n => markAsRead(n.id_notification));
                    }}
                    className="w-full py-2 text-sm font-medium text-[#1e3a8a] hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    {t("marquer-tout-comme-lu") || "Marquer tout comme lu"}
                  </motion.button>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Confirmation Dialog */}
          <AnimatePresence>
       {showConfirmDialog &&
  createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
          className="bg-white rounded-xl p-6 w-96 shadow-2xl border border-gray-100"
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {t("confirmer-suppression")}
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            {t("etes-vous-sur-de-supprimer-toutes-les-notifications")}
          </p>
          <div className="flex justify-end gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={cancelClearNotifications}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t("annuler")}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={confirmClearNotifications}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              {t("supprimer")}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )}

          </AnimatePresence>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 hover:bg-gray-100">
                <div className="flex items-center gap-2 px-2">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="User Avatar"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-primary">
                        {user?.initials || "UA"}
                      </span>
                    )}
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="flex gap-2">
                      <p className="text-sm font-medium">{user?.name || "Utilisateur"}</p>
                      {user?.prenom && <p className="text-sm font-medium">{user.prenom}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">{profileRole || "Utilisateur"}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-white rounded-xl shadow-lg border border-gray-100"
            >
              <DropdownMenuLabel className="text-gray-800">{t("mon-compte")}</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-100" />
              {isAuthenticated ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/EditProfile" className="text-gray-700 hover:bg-gray-50">
                      {t("paramètres")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    {t("deconnexion")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem asChild>
                  <Link to="/login" className="text-gray-700 hover:bg-gray-50">
                    {t("connexion")}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* TopBarMenu est maintenant rendu uniquement dans DashboardLayout pour éviter les doublons */}
    </header>
  );
};