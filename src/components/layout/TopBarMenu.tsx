import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "@/contexts/TranslationContext";
import { cn } from "@/lib/utils";
import type { Compte, Permission } from "../../types/compte";

interface TopBarMenuProps {
  compte: Compte | null;
}

export const TopBarMenu: React.FC<TopBarMenuProps> = ({ compte }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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

  const toggleMenu = (menu: string) =>
    setOpenMenu(openMenu === menu ? null : menu);
  const closeMenu = () => setOpenMenu(null);

  // 🔹 Main link styles (uniform, full height)
  const linkStyle =
    "flex items-center h-full px-4 text-white font-medium rounded-md transition-all duration-200 hover:bg-white hover:text-[#001861]";
  const activeLinkStyle =
    "flex items-center h-full px-4 bg-white text-[#001861] font-medium rounded-md transition-all duration-200";

  // 🔹 Submenu link styles
  const submenuLinkStyle =
  "flex items-center h-12 px-4 text-[#001861] hover:bg-[#f2f6ff] transition-colors duration-150 rounded-md";
const activeSubmenuLinkStyle =
  "flex items-center h-12 px-4 bg-[#f2f6ff] text-[#001861] font-medium transition-colors duration-150 rounded-md";

 const submenuStyle =
  "absolute top-full left-0 bg-white shadow-md min-w-[180px] z-50 border border-gray-200 rounded-md";

  const isProduitsActive = [
    "/produit",
    "/vue-modeles",
    "/catalogue",
    "/catalogueComplet",
  ].includes(location.pathname);

  const isOperationsActive = [
    "/operations",
    "/tarification",
  ].includes(location.pathname);

  const isEdiActive = [
    "/operation-edi/order",
    "/operation-edi/shipments",
    "/operation-edi/desadv",
    "/operation-edi/invoice",
    "/operation-edi/tracking",
    "/ordre-de-transport",
  ].includes(location.pathname);
  const isParametresActive = [
    "/parametres/tpo",
    "/parametres/profils",
    "/parametres/comptes",
    "/flash",
  ].includes(location.pathname);

  if (!compte) return null;

  return (
    <nav className="bg-[#001861] relative z-40 h-12">
      <ul className="flex px-6 space-x-6 items-stretch h-full">
        {canRead(PAGES.ACCUEIL) && (
          <li>
            <NavLink
              to="/"
              className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
            >
              {t("Accueil") || "Accueil"}
            </NavLink>
          </li>
        )}

        {canRead(PAGES.ENTITE) && (
          <li>
            <NavLink
              to="/entite"
              className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
            >
              {t("Entité") || "Entité"}
            </NavLink>
          </li>
        )}

        <li>
          <NavLink
            to="/retour-enquete"
            className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
          >
            {t("Retour Enquête") || "Retour Enquête"}
          </NavLink>
        </li>

        {(canRead(PAGES.PRODUITS_MAPPING) ||
          canRead(PAGES.PRODUITS_GENERATEUR) ||
          canRead(PAGES.PRODUITS_CATALOGUE)) && (
          <li
            className="relative flex items-stretch"
            onMouseEnter={() => toggleMenu("produits")}
            onMouseLeave={closeMenu}
          >
            <button className={cn(linkStyle, isProduitsActive && activeLinkStyle)}>
              {t("Produits") || "Produits"}
            </button>
            {openMenu === "produits" && (
              <ul className={submenuStyle}>
                {canRead(PAGES.PRODUITS_MAPPING) && (
                  <li>
                    <NavLink
                      to="/produit"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Mapping catégories-rayons ") || "Mapping"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.PRODUITS_GENERATEUR) && (
                  <li>
                    <NavLink
                      to="/gpc"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Générateur Modèle") || "Générateur"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.PRODUITS_CATALOGUE) && (
                  <li>
                    <NavLink
                      to="/catalogueComplet"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("CatalogueFP") || "Catalogue FP"}
                    </NavLink>
                  </li>
                )}
              </ul>
            )}
          </li>
        )}

        {canRead(PAGES.CARACTERISTIQUES) && (
          <li>
            <NavLink
              to="/caracteristiques"
              className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
            >
              {t("Caractéristiques") || "Caractéristiques"}
            </NavLink>
          </li>
        )}

        {/* Operations menu with Tarification */}
        {canRead(PAGES.OPERATIONS) && (
          <li
            className="relative flex items-stretch"
            onMouseEnter={() => toggleMenu("operations")}
            onMouseLeave={closeMenu}
          >
            <button
              className={cn(linkStyle, isOperationsActive && activeLinkStyle)}
            >
              {t("Opérations") || "Opérations"}
            </button>
            {openMenu === "operations" && (
              <ul className={submenuStyle}>
                <li>
                  <NavLink
                    to="/operations"
                    className={({ isActive }) =>
                      cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                    }
                    onClick={closeMenu}
                  >
                    {t("Opérations") || "Opérations"}
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/tarification"
                    className={({ isActive }) =>
                      cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                    }
                    onClick={closeMenu}
                  >
                    {t("Tarification") || "Tarification"}
                  </NavLink>
                </li>
              </ul>
            )}
          </li>
        )}

        {(canRead(PAGES.EDI_COMMANDES) ||
          canRead(PAGES.EDI_EXPEDITIONS) ||
          canRead(PAGES.EDI_FACTURES) ||
          canRead(PAGES.EDI_TRACKING) ||
          canRead(PAGES.EDI_ORDRE_TRANSPORT)) && (
          <li
            className="relative flex items-stretch"
            onMouseEnter={() => toggleMenu("edi")}
            onMouseLeave={closeMenu}
          >
            <button className={cn(linkStyle, isEdiActive && activeLinkStyle)}>
              {t("EDI") || "EDI"}
            </button>
            {openMenu === "edi" && (
              <ul className={submenuStyle}>
                {canRead(PAGES.EDI_COMMANDES) && (
                  <li>
                    <NavLink
                      to="/operation-edi/order"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Commandes") || "Commandes"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.EDI_EXPEDITIONS) && (
                  <li>
                    <NavLink
                      to="/operation-edi/shipments"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Expéditions") || "Expéditions"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.EDI_EXPEDITIONS) && (
                  <li>
                    <NavLink
                      to="/operation-edi/desadv"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("DESADV & Étiquetage") || "DESADV & Étiquetage"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.EDI_FACTURES) && (
                  <li>
                    <NavLink
                      to="/operation-edi/invoice"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Factures") || "Factures"}
                    </NavLink>
                  </li>
                )}
                <li>
                  <NavLink
                    to="/ordre-de-transport"
                    className={({ isActive }) =>
                      cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                    }
                    onClick={closeMenu}
                  >
                    {t("Ordre de transport") || "Ordre de transport"}
                  </NavLink>
                </li>
                {canRead(PAGES.EDI_TRACKING) && (
                  <li>
                    <NavLink
                      to="/operation-edi/tracking"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Tracking") || "Tracking"}
                    </NavLink>
                  </li>
                )}
              </ul>
            )}
          </li>
        )}

        {canRead(PAGES.TRAFIC) && (
          <li>
            <NavLink
              to="/trafic"
              className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
            >
              {t("Trafic") || "Trafic"}
            </NavLink>
          </li>
        )}

        {(canRead(PAGES.PARAM_TPO) ||
          canRead(PAGES.PARAM_PROFILS) ||
          canRead(PAGES.PARAM_COMPTES) ||
          true) && (
          <li
            className="relative flex items-stretch"
            onMouseEnter={() => toggleMenu("param")}
            onMouseLeave={closeMenu}
          >
            <button className={cn(linkStyle, isParametresActive && activeLinkStyle)}>
              {t("Paramètres") || "Paramètres"}
            </button>
            {openMenu === "param" && (
              <ul className={submenuStyle}>
                {canRead(PAGES.PARAM_TPO) && (
                  <li>
                    <NavLink
                      to="/parametres/tpo"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("TPO") || "TPO"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.PARAM_PROFILS) && (
                  <li>
                    <NavLink
                      to="/parametres/profils"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Profils") || "Profils"}
                    </NavLink>
                  </li>
                )}
                {canRead(PAGES.PARAM_COMPTES) && (
                  <li>
                    <NavLink
                      to="/parametres/comptes"
                      className={({ isActive }) =>
                        cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                      }
                      onClick={closeMenu}
                    >
                      {t("Comptes") || "Comptes"}
                    </NavLink>
                  </li>
                )}
                <li>
                  <NavLink
                    to="/flash"
                    className={({ isActive }) =>
                      cn(submenuLinkStyle, isActive && activeSubmenuLinkStyle)
                    }
                    onClick={closeMenu}
                  >
                    {t("Flash Notification") || "Notifications"}
                  </NavLink>
                </li>
              </ul>
            )}
          </li>
        )}

        <li>
          <NavLink
            to="/ged"
            className={({ isActive }) => cn(linkStyle, isActive && activeLinkStyle)}
          >
            {t("Media") || "Media"}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
};