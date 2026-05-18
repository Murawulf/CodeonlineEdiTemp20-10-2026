import { cn } from "@/lib/utils";
import {
  Home,
  Building2,
  Package,
  FileText,
  Settings,
  ChevronDown,
  LogOut,
  User,
  BookOpen,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

interface SidebarProps {
  isSidebarOpen: boolean;
}

export const Sidebar = ({ isSidebarOpen }: SidebarProps) => {
  const [openMenuItem, setOpenMenuItem] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [iconOffset, setIconOffset] = useState(0);

  const toggleMenuItem = (item: string) => {
    setOpenMenuItem(openMenuItem === item ? null : item);
  };

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scrollSpeed = 0.5;
      setIconOffset((prev) => prev + event.deltaY * scrollSpeed * -1);
    };

    const navElement = navRef.current;
    if (navElement) {
      navElement.addEventListener("wheel", handleWheel, { passive: false });
    }

    return () => {
      if (navElement) {
        navElement.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  const menuItems = [
    {
      title: "Accueil",
      path: "/",
      icon: Home,
      tooltip: "Aller à la page d'accueil",
      submenu: false,
    },
    {
      title: "Entité",
      path: "/entite",
      icon: Building2,
      tooltip: "Voir la liste des entités",
      submenu: false,
    },
    {
      title: "Produit",
      path: "/produit",
      icon: Package,
      tooltip: "Accéder aux produits",
      submenu: false,
    },
    {
      title: "Catalogue",
      path: "/catalogue",
      icon: BookOpen,
      tooltip: "Voir le catalogue complet",
      submenu: false,
    },
    {
      title: "Opérations EDI",
      path: "/operation-edi",
      icon: FileText,
      tooltip: "Gérer les opérations EDI",
      submenu: true,
      subItems: [
        { title: "Order", path: "/operation-edi/order", tooltip: "Voir les commandes" },
        { title: "Expédition", path: "/operation-edi/shipments", tooltip: "Préparer et envoyer une expédition" },
        { title: "DESADV & Étiquetage", path: "/operation-edi/desadv", tooltip: "Suivi DESADV, étiquetage GS1 et marquage" },
        { title: "Invoice", path: "/operation-edi/invoice", tooltip: "Voir les factures" },
        { title: "Tracking", path: "/operation-edi/tracking", tooltip: "Suivi des envois" },
      ],
    },
    {
      title: "Paramètres",
      path: "/parametres",
      icon: Settings,
      tooltip: "Modifier les paramètres",
      submenu: true,
      subItems: [
        { title: "Profil", path: "/parametres/profil", tooltip: "Modifier le profil" },
        { title: "Paramètre", path: "/parametres/parametre", tooltip: "Changer les paramètres" },
        { title: "Déconnexion", path: "/parametres/deconnexion", icon: LogOut, tooltip: "Se déconnecter" },
      ],
    },
    {
      title: "Mon Compte",
      path: "/EditProfile",
      icon: User,
      tooltip: "Voir mon compte",
      submenu: false,
    },
  ];

  return (
    <aside
      className={cn(
        "bg-gray-100 w-16 md:w-56 transition-all duration-300 relative",
        !isSidebarOpen && "md:static -translate-x-full md:translate-x-0 md:w-16"
      )}
    >
      <div className="flex-1 py-4 overflow-hidden">
        <nav className="grid gap-1 px-2 sidebar-scroll" ref={navRef}>
          {menuItems.map((item) => (
            <div key={item.title} className="relative group">
              {!item.submenu ? (
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                      isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                      !isSidebarOpen && "justify-center px-2"
                    )
                  }
                >
                  <div
                    className="icon-wrapper"
                    style={{
                      transform: `translateY(${iconOffset}px)`,
                      transition: "transform 0.1s ease",
                    }}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 text-blue-800",
                        !isSidebarOpen && "h-6 w-6"
                      )}
                    />
                  </div>
                  {isSidebarOpen && <span>{item.title}</span>}

                  {/* Tooltip */}
                  {!isSidebarOpen && (
                    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                      {item.tooltip}
                    </span>
                  )}
                </NavLink>
              ) : (
                <>
                  <button
                    onClick={() => toggleMenuItem(item.title)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                      !isSidebarOpen && "justify-center px-2"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="icon-wrapper"
                        style={{
                          transform: `translateY(${iconOffset}px)`,
                          transition: "transform 0.1s ease",
                        }}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 text-blue-800",
                            !isSidebarOpen && "h-6 w-6"
                          )}
                        />
                      </div>
                      {isSidebarOpen && <span>{item.title}</span>}
                    </div>
                    {isSidebarOpen && item.submenu && (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-blue-800 transition-transform",
                          openMenuItem === item.title && "rotate-180"
                        )}
                      />
                    )}

                    {/* Tooltip */}
                    {!isSidebarOpen && (
                      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        {item.tooltip}
                      </span>
                    )}
                  </button>

                  {isSidebarOpen && openMenuItem === item.title && (
                    <div className="mt-1 ml-9 grid gap-1 border-l pl-2">
                      {item.subItems?.map((subItem) => (
                        <NavLink
                          key={subItem.title}
                          to={subItem.path}
                          className={({ isActive }) =>
                            cn(
                              "rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative group",
                              isActive
                                ? "bg-gray-200 text-blue-800"
                                : "text-gray-800"
                            )
                          }
                        >
                          {subItem.title}

                          {/* Tooltip for collapsed sidebar */}
                          {!isSidebarOpen && (
                            <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                              {subItem.tooltip}
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};
