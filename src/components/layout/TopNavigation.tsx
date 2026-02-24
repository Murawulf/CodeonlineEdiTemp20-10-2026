import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { useTranslation } from "@/contexts/TranslationContext";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

interface User {
  id_compte: number;
  email: string;
  name: string | null;
  id_entite: number;
  producer_name: string;
}

export const TopNavigation: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Fetch user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");
    console.log("Stored user in localStorage:", storedUser); // Debug log
    if (storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        console.log("Parsed user:", parsedUser); // Debug log
        if (parsedUser.id_compte && parsedUser.email && parsedUser.id_entite && parsedUser.producer_name) {
          setUser(parsedUser);
          console.log("Set user state:", parsedUser); // Debug log
        } else {
          console.error("Invalid user data structure:", parsedUser);
          localStorage.removeItem("currentUser"); // Clear invalid data
        }
      } catch (error) {
        console.error("Error parsing user from localStorage:", error);
        localStorage.removeItem("currentUser"); // Clear invalid data
      }
    } else {
      console.log("No user found in localStorage"); // Debug log
    }
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/logout`, {}, { withCredentials: true });
      localStorage.removeItem("currentUser");
      setUser(null);
      toast.success(t("logout_success") || "Déconnexion réussie");
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error(t("logout_failed") || "Échec de la déconnexion");
    }
  };

  // Generate initials for avatar
  const getInitials = (name: string | null) => {
    if (!name) return "U";
    const names = name.split(" ");
    return names
      .map((n) => n.charAt(0))
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const isProduitsActive = location.pathname === "/produit" || location.pathname === "/vue-modeles";
  const isEdiActive = location.pathname === "/operation-edi/order" || location.pathname === "/operation-edi/invoice" || location.pathname === "/ordre-de-transport" || location.pathname === "/operation-edi/tracking";

  return (
    <div className="flex items-center justify-between px-6 py-3 bg-white shadow-sm">
      <NavigationMenu className="hidden md:flex">
        <NavigationMenuList className="flex space-x-1">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <NavLink
                to="/"
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded text-gray-700 hover:bg-gray-100",
                    isActive ? "text-[#1c74e9] font-medium" : ""
                  )
                }
              >
                {t("accueil") || "Accueil"}
              </NavLink>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <NavLink
                to="/entite"
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded text-gray-700 hover:bg-gray-100",
                    isActive ? "text-[#1c74e9] font-medium" : ""
                  )
                }
              >
                {t("entite") || "Entité"}
              </NavLink>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger className={cn("bg-transparent hover:bg-gray-100 text-gray-700", isProduitsActive ? "text-[#1c74e9] font-medium" : "")}>
              {t("Produits") || "Produits"}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="grid gap-2 p-3 w-48 bg-white text-gray-700 rounded shadow-sm">
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/produit"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("Mapping") || "Mapping"}
                  </NavLink>
                </NavigationMenuLink>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/vue-modeles"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("generateur-modele") || "Générateur de modèle"}
                  </NavLink>
                </NavigationMenuLink>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <NavLink
                to="/caracteristiques"
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded text-gray-700 hover:bg-gray-100",
                    isActive ? "text-[#1c74e9] font-medium" : ""
                  )
                }
              >
                {t("Caractéristiques") || "Caractéristiques"}
              </NavLink>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <NavLink
                to="/operations"
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded text-gray-700 hover:bg-gray-100",
                    isActive ? "text-[#1c74e9] font-medium" : ""
                  )
                }
              >
                {t("Opérations") || "Opérations"}
              </NavLink>
            </NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger className={cn("bg-transparent hover:bg-gray-100 text-gray-700", isEdiActive ? "text-[#1c74e9] font-medium" : "")}>
              {t("EDI") || "EDI"}
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="grid gap-2 p-3 w-48 bg-white text-gray-700 rounded shadow-sm">
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/operation-edi/order"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("Order") || "Commande"}
                  </NavLink>
                </NavigationMenuLink>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/operation-edi/invoice"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("Invoice") || "Facture"}
                  </NavLink>
                </NavigationMenuLink>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/ordre-de-transport"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("ordre_de_transport") || "Ordre de transport"}
                  </NavLink>
                </NavigationMenuLink>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/operation-edi/tracking"
                    className={({ isActive }) =>
                      cn("block p-2 rounded hover:bg-gray-100 text-gray-700", isActive ? "text-[#1c74e9]" : "")
                    }
                  >
                    {t("Tracking") || "Suivi"}
                  </NavLink>
                </NavigationMenuLink>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      <div className="flex items-center space-x-3">
        {user ? (
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2"
            >
              <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                {getInitials(user.name)}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-medium text-gray-800">{user.name || user.email}</span>
                <span className="text-xs text-gray-500">{user.producer_name || "N/A"}</span>
              </div>
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-white rounded shadow-sm z-50">
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 text-gray-700 hover:bg-gray-100"
                >
                  {t("logout") || "Déconnexion"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <NavLink
            to="/login"
            className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            {t("login") || "Connexion"}
          </NavLink>
        )}
      </div>
    </div>
  );
};