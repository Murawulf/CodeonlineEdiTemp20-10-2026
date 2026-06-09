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
  Activity,
  Radio,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import type { Compte } from "../../types/compte";

interface SidebarProps {
  isSidebarOpen: boolean;
  compte: Compte | null;
}

export const Sidebar = ({ isSidebarOpen, compte }: SidebarProps) => {
  const { t } = useTranslation();
  const [openMenuItem, setOpenMenuItem] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [iconOffset, setIconOffset] = useState(0);

  const PAGES = {
    ACCUEIL: 1,
    ENTITE: 2,
    PRODUITS_MAPPING: 4,
    PRODUITS_GENERATEUR: 5,
    PRODUITS_CATALOGUE: 7,
    CARACTERISTIQUES: 8,
    OPERATIONS: 9,
    EDI_COMMANDES: 11,
    EDI_EXPEDITIONS: 12,
    EDI_FACTURES: 13,
    EDI_TRACKING: 14,
    PARAM_TPO: 15,
    PARAM_PROFILS: 16,
    PARAM_COMPTES: 17,
    TRAFIC: 18,
    FLASH_NOTIF: 19,
    EDI_ORDRE_TRANSPORT: 20,
  };

  const canRead = (pageId: number) => {
    if (!compte || !compte.permissions) return false;
    return compte.permissions.some(
      (p) => p.page_id === pageId && p.read === 1 && p.hide === 0
    );
  };

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

  const iconStyle = (collapsed: boolean) =>
    cn("h-5 w-5 text-blue-800", collapsed && "h-6 w-6");

  const renderTooltip = (tooltip: string) =>
    !isSidebarOpen && (
      <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {tooltip}
      </span>
    );

  const iconWrapper = (offset: number, children: React.ReactNode) => (
    <div
      className="icon-wrapper"
      style={{ transform: `translateY(${offset}px)`, transition: "transform 0.1s ease" }}
    >
      {children}
    </div>
  );

  return (
    <aside
      className={cn(
        "bg-gray-100 w-16 md:w-56 transition-all duration-300 relative",
        !isSidebarOpen && "md:static -translate-x-full md:translate-x-0 md:w-16"
      )}
    >
      <div className="flex-1 py-4 overflow-hidden">
        <nav className="grid gap-1 px-2 sidebar-scroll" ref={navRef}>

          {/* Accueil */}
          {canRead(PAGES.ACCUEIL) && (
            <div className="relative group">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                    isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                    !isSidebarOpen && "justify-center px-2"
                  )
                }
              >
                {iconWrapper(iconOffset, <Home className={iconStyle(!isSidebarOpen)} />)}
                {isSidebarOpen && <span>{t("Accueil") || "Accueil"}</span>}
                {renderTooltip(t("Aller à la page d'accueil") || "Aller à la page d'accueil")}
              </NavLink>
            </div>
          )}

          {/* Entité */}
          {canRead(PAGES.ENTITE) && (
            <div className="relative group">
              <NavLink
                to="/entite"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                    isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                    !isSidebarOpen && "justify-center px-2"
                  )
                }
              >
                {iconWrapper(iconOffset, <Building2 className={iconStyle(!isSidebarOpen)} />)}
                {isSidebarOpen && <span>{t("Entité") || "Entité"}</span>}
                {renderTooltip(t("Voir la liste des entités") || "Voir la liste des entités")}
              </NavLink>
            </div>
          )}

          {/* Produits (submenu) */}
          {(canRead(PAGES.PRODUITS_MAPPING) ||
            canRead(PAGES.PRODUITS_GENERATEUR) ||
            canRead(PAGES.PRODUITS_CATALOGUE)) && (
            <div className="relative group">
              <button
                onClick={() => toggleMenuItem("produits")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  !isSidebarOpen && "justify-center px-2"
                )}
              >
                <div className="flex items-center gap-3">
                  {iconWrapper(iconOffset, <Package className={iconStyle(!isSidebarOpen)} />)}
                  {isSidebarOpen && <span>{t("Produits") || "Produits"}</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-blue-800 transition-transform",
                      openMenuItem === "produits" && "rotate-180"
                    )}
                  />
                )}
                {renderTooltip(t("Accéder aux produits") || "Accéder aux produits")}
              </button>
              {isSidebarOpen && openMenuItem === "produits" && (
                <div className="mt-1 ml-9 grid gap-1 border-l pl-2">
                  {canRead(PAGES.PRODUITS_MAPPING) && (
                    <NavLink
                      to="/produit"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Mapping catégories-rayons") || "Mapping"}
                    </NavLink>
                  )}
                  {canRead(PAGES.PRODUITS_GENERATEUR) && (
                    <NavLink
                      to="/gpc"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Générateur Modèle") || "Générateur"}
                    </NavLink>
                  )}
                  {canRead(PAGES.PRODUITS_CATALOGUE) && (
                    <NavLink
                      to="/catalogueComplet"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("CatalogueFP") || "Catalogue FP"}
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Caractéristiques */}
          {canRead(PAGES.CARACTERISTIQUES) && (
            <div className="relative group">
              <NavLink
                to="/caracteristiques"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                    isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                    !isSidebarOpen && "justify-center px-2"
                  )
                }
              >
                {iconWrapper(iconOffset, <BookOpen className={iconStyle(!isSidebarOpen)} />)}
                {isSidebarOpen && <span>{t("Caractéristiques") || "Caractéristiques"}</span>}
                {renderTooltip(t("Voir le catalogue complet") || "Voir le catalogue complet")}
              </NavLink>
            </div>
          )}

          {/* Opérations (submenu) */}
          {canRead(PAGES.OPERATIONS) && (
            <div className="relative group">
              <button
                onClick={() => toggleMenuItem("operations")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  !isSidebarOpen && "justify-center px-2"
                )}
              >
                <div className="flex items-center gap-3">
                  {iconWrapper(iconOffset, <Activity className={iconStyle(!isSidebarOpen)} />)}
                  {isSidebarOpen && <span>{t("Opérations") || "Opérations"}</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-blue-800 transition-transform",
                      openMenuItem === "operations" && "rotate-180"
                    )}
                  />
                )}
                {renderTooltip(t("Gérer les opérations") || "Gérer les opérations")}
              </button>
              {isSidebarOpen && openMenuItem === "operations" && (
                <div className="mt-1 ml-9 grid gap-1 border-l pl-2">
                  <NavLink
                    to="/operations"
                    className={({ isActive }) =>
                      cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                    }
                  >
                    {t("Opérations") || "Opérations"}
                  </NavLink>
                  <NavLink
                    to="/tarification"
                    className={({ isActive }) =>
                      cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                    }
                  >
                    {t("Tarification") || "Tarification"}
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* EDI (submenu) */}
          {(canRead(PAGES.EDI_COMMANDES) ||
            canRead(PAGES.EDI_EXPEDITIONS) ||
            canRead(PAGES.EDI_FACTURES) ||
            canRead(PAGES.EDI_TRACKING) ||
            canRead(PAGES.EDI_ORDRE_TRANSPORT)) && (
            <div className="relative group">
              <button
                onClick={() => toggleMenuItem("edi")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  !isSidebarOpen && "justify-center px-2"
                )}
              >
                <div className="flex items-center gap-3">
                  {iconWrapper(iconOffset, <FileText className={iconStyle(!isSidebarOpen)} />)}
                  {isSidebarOpen && <span>{t("Opérations EDI") || "Opérations EDI"}</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-blue-800 transition-transform",
                      openMenuItem === "edi" && "rotate-180"
                    )}
                  />
                )}
                {renderTooltip(t("Gérer les opérations EDI") || "Gérer les opérations EDI")}
              </button>
              {isSidebarOpen && openMenuItem === "edi" && (
                <div className="mt-1 ml-9 grid gap-1 border-l pl-2">
                  {canRead(PAGES.EDI_COMMANDES) && (
                    <NavLink
                      to="/operation-edi/order"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Commandes") || "Commandes"}
                    </NavLink>
                  )}
                  {canRead(PAGES.EDI_EXPEDITIONS) && (
                    <NavLink
                      to="/operation-edi/shipments"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Expéditions") || "Expéditions"}
                    </NavLink>
                  )}
                  {canRead(PAGES.EDI_EXPEDITIONS) && (
                    <NavLink
                      to="/operation-edi/desadv"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("DESADV & Étiquetage") || "DESADV & Étiquetage"}
                    </NavLink>
                  )}
                  {canRead(PAGES.EDI_FACTURES) && (
                    <NavLink
                      to="/operation-edi/invoice"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Factures") || "Factures"}
                    </NavLink>
                  )}
                  {canRead(PAGES.EDI_ORDRE_TRANSPORT) && (
                    <NavLink
                      to="/ordre-de-transport"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Ordre de transport") || "Ordre de transport"}
                    </NavLink>
                  )}
                  {canRead(PAGES.EDI_TRACKING) && (
                    <NavLink
                      to="/operation-edi/tracking"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Tracking") || "Tracking"}
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trafic */}
          {canRead(PAGES.TRAFIC) && (
            <div className="relative group">
              <NavLink
                to="/trafic"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                    isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                    !isSidebarOpen && "justify-center px-2"
                  )
                }
              >
                {iconWrapper(iconOffset, <Radio className={iconStyle(!isSidebarOpen)} />)}
                {isSidebarOpen && <span>{t("Trafic") || "Trafic"}</span>}
                {renderTooltip(t("Voir le trafic") || "Voir le trafic")}
              </NavLink>
            </div>
          )}

          {/* Media */}
          <div className="relative group">
            <NavLink
              to="/ged"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                  !isSidebarOpen && "justify-center px-2"
                )
              }
            >
              {iconWrapper(iconOffset, <BookOpen className={iconStyle(!isSidebarOpen)} />)}
              {isSidebarOpen && <span>{t("Media") || "Media"}</span>}
              {renderTooltip(t("Accéder aux médias") || "Accéder aux médias")}
            </NavLink>
          </div>

          {/* Paramètres (submenu) */}
          {(canRead(PAGES.PARAM_TPO) ||
            canRead(PAGES.PARAM_PROFILS) ||
            canRead(PAGES.PARAM_COMPTES) ||
            true) && (
            <div className="relative group">
              <button
                onClick={() => toggleMenuItem("parametres")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  !isSidebarOpen && "justify-center px-2"
                )}
              >
                <div className="flex items-center gap-3">
                  {iconWrapper(iconOffset, <Settings className={iconStyle(!isSidebarOpen)} />)}
                  {isSidebarOpen && <span>{t("Paramètres") || "Paramètres"}</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-blue-800 transition-transform",
                      openMenuItem === "parametres" && "rotate-180"
                    )}
                  />
                )}
                {renderTooltip(t("Modifier les paramètres") || "Modifier les paramètres")}
              </button>
              {isSidebarOpen && openMenuItem === "parametres" && (
                <div className="mt-1 ml-9 grid gap-1 border-l pl-2">
                  {canRead(PAGES.PARAM_TPO) && (
                    <NavLink
                      to="/parametres/tpo"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("TPO") || "TPO"}
                    </NavLink>
                  )}
                  {canRead(PAGES.PARAM_PROFILS) && (
                    <NavLink
                      to="/parametres/profils"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Profils") || "Profils"}
                    </NavLink>
                  )}
                  {canRead(PAGES.PARAM_COMPTES) && (
                    <NavLink
                      to="/parametres/comptes"
                      className={({ isActive }) =>
                        cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                      }
                    >
                      {t("Comptes") || "Comptes"}
                    </NavLink>
                  )}
                  <NavLink
                    to="/flash"
                    className={({ isActive }) =>
                      cn("rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors", isActive ? "bg-gray-200 text-blue-800" : "text-gray-800")
                    }
                  >
                    {t("Flash Notification") || "Notifications"}
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Mon Compte */}
          <div className="relative group">
            <NavLink
              to="/EditProfile"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-200 hover:text-blue-800 transition-colors relative",
                  isActive ? "bg-gray-200 text-blue-800" : "text-gray-800",
                  !isSidebarOpen && "justify-center px-2"
                )
              }
            >
              {iconWrapper(iconOffset, <User className={iconStyle(!isSidebarOpen)} />)}
              {isSidebarOpen && <span>{t("Mon Compte") || "Mon Compte"}</span>}
              {renderTooltip(t("Voir mon compte") || "Voir mon compte")}
            </NavLink>
          </div>

        </nav>
      </div>
    </aside>
  );
};