// src/App.tsx
import React, { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TranslationProvider } from "./contexts/TranslationContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import DashboardLayout from "./components/layout/DashboardLayout";
import GenerateurModele from "./pages/GenerateurModele";
import VueModeles from "./pages/VueModeles";
import Login from "./pages/Login";
import Enquete from "./pages/Enquete";
import Profile from "./pages/Profile";
import Comptes from "./pages/comptes";
import Index from "./pages/Index";
import Tpo from "./pages/Tpo";
import Entite from "./pages/Entite";
import Produit from "./pages/Produit";
import Gpc from "./pages/gpc";
import Trafic from "./pages/Trafic";
import Flashnotif from "./pages/FlashNotif";
import Order from "./pages/operation-edi/Order";
import Invoice from "./pages/operation-edi/Invoice";
import Tracking from "./pages/operation-edi/Tracking";
import Profil from "./pages/parametres/Profil";
import Parametre from "./pages/parametres/Parametre";
import Deconnexion from "./pages/parametres/Deconnexion";
import NotFound from "./pages/NotFound";
import CatalogueFp from "./pages/Catalogue";
import CatalogueComplet from "./pages/CatalogueComplet";
import Tarification from "./pages/Tarification"; 
import EditProfile from "./pages/ProfileManagement";
import Ged from "./pages/Ged";
import Caracteristiques from "./pages/Caracteristiques";
import Operations from "./pages/Operations";
// import OrdreDeTransport from "./pages/OrdreDetransport"; // Placeholder replaced by functional component
import TransportOrders from "./pages/operation-edi/TransportOrder";
import Shipments from "./pages/operation-edi/Shipment";
import DesadvManager from "./pages/operation-edi/DesadvManager";
import GlobalLoader from "./components/ui/GlobalLoader";
import ChatbotWidget from "./components/ChatbotWidget";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import axios from "axios";
import type { Compte, Permission } from "./types/compte";

const queryClient = new QueryClient();

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="p-4">
    <h1 className="text-2xl font-bold">Something went wrong.</h1>
    <p className="text-red-500">{error.message}</p>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = localStorage.getItem("currentUser");
  const location = useLocation();

  console.log('[ProtectedRoute] 🚪 Checking access to:', location.pathname);
  console.log('[ProtectedRoute] 👤 User in localStorage:', user ? 'EXISTS' : 'NOT FOUND');

  if (!user && location.pathname === "/") {
    console.log('[ProtectedRoute] ⚠️ No user and accessing root, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    console.log('[ProtectedRoute] ⚠️ No user found, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  console.log('[ProtectedRoute] ✅ Access granted to:', location.pathname);
  return <>{children}</>;
};

// Loader that triggers instantly on route change and hides quickly
const RouteChangeHandler: React.FC<{ setIsLoading: (v: boolean) => void }> = ({ setIsLoading }) => {
  const location = useLocation();
  useEffect(() => {
    console.log('[RouteChangeHandler] 🛣️ Route changed to:', location.pathname);
    setIsLoading(true);
    const timer = requestAnimationFrame(() => setIsLoading(false));
    return () => cancelAnimationFrame(timer);
  }, [location.pathname, setIsLoading]);
  return null;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<Compte | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hydrateCurrentUser = () => {
    const storedUser = localStorage.getItem("currentUser");
    if (storedUser) {
      try {
        const parsedUser: Compte = JSON.parse(storedUser);
        if (!parsedUser.id_compte) {
          localStorage.removeItem("currentUser");
          setCurrentUser(null);
          return;
        }
        const userWithInitials = {
          ...parsedUser,
          initials: parsedUser.name ? parsedUser.name.slice(0, 2).toUpperCase() : "UA",
        };
        setCurrentUser(userWithInitials);
      } catch (err) {
        console.error("[App] ❌ Failed to parse stored user:", err);
        localStorage.removeItem("currentUser");
        setCurrentUser(null);
      }
    }
    // Note: l'injection du Bearer token est centralisée dans src/main.tsx
    // (axios.interceptors.request.use + window.fetch wrapper). Plus de
    // axios.defaults.headers.common ici pour éviter les doublons et les
    // tokens périmés non purgés sur logout.
  };

  useEffect(() => {
    // Hydrate on mount (page reload scenario)
    hydrateCurrentUser();

    // Listen for login event dispatched by Login.tsx (SPA navigation scenario)
    const handleAuthLogin = () => hydrateCurrentUser();
    const handleAuthLogout = () => {
      delete axios.defaults.headers.common['Authorization'];
      setCurrentUser(null);
    };
    window.addEventListener('auth:login', handleAuthLogin);
    window.addEventListener('auth:logout', handleAuthLogout);
    return () => {
      window.removeEventListener('auth:login', handleAuthLogin);
      window.removeEventListener('auth:logout', handleAuthLogout);
    };
  }, []);

  // Axios interceptors with active request counting for fast loader
  useEffect(() => {
    console.log('[App] 🔌 Setting up Axios interceptors...');
    let activeRequests = 0;

    const reqInt = axios.interceptors.request.use((config) => {
      activeRequests++;
      console.log(`[App] 📤 HTTP Request [${activeRequests}]:`, config.method?.toUpperCase(), config.url);
      setIsLoading(true);
      return config;
    });

    const resInt = axios.interceptors.response.use(
      (res) => {
        activeRequests--;
        console.log(`[App] 📥 HTTP Response [${activeRequests}]:`, res.config.method?.toUpperCase(), res.config.url, '- Status:', res.status);
        if (activeRequests <= 0) setIsLoading(false);
        return res;
      },
      (err) => {
        activeRequests--;
        console.error(`[App] ❌ HTTP Error [${activeRequests}]:`, err.config?.method?.toUpperCase(), err.config?.url, '- Status:', err.response?.status);
        if (activeRequests <= 0) setIsLoading(false);
        return Promise.reject(err);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInt);
      axios.interceptors.response.eject(resInt);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
      <TooltipProvider>
        <TranslationProvider>
          {isLoading && <GlobalLoader text="Chargement..." />}

          <Toaster />

          <ReactErrorBoundary FallbackComponent={ErrorFallback}>
            <BrowserRouter>
              <NotificationProvider compteId={currentUser?.id_compte || null}>
                <RouteChangeHandler setIsLoading={setIsLoading} />

                <Routes>
                  <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
                  <Route path="/login" element={<Login />} />
                  <Route element={<DashboardLayout currentUser={currentUser} />}>
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="/parametres/profils" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="/parametres/comptes" element={<ProtectedRoute><Comptes /></ProtectedRoute>} />
                    <Route path="/parametres/tpo" element={<ProtectedRoute><Tpo /></ProtectedRoute>} />
                    <Route path="/entite" element={<ProtectedRoute><Entite /></ProtectedRoute>} />
                    <Route path="/produit" element={<ProtectedRoute><Produit /></ProtectedRoute>} />
                    <Route path="/trafic" element={<ProtectedRoute><Trafic /></ProtectedRoute>} />
                    <Route path="/gpc" element={<ProtectedRoute><Gpc /></ProtectedRoute>} />
                    <Route path="/flash" element={<ProtectedRoute><Flashnotif profileId={currentUser?.profile_id ?? 0} idEntite={currentUser?.id_entite ?? 0} idCompte={currentUser?.id_compte ?? 0} /></ProtectedRoute>} />
                    <Route path="/generateur-modele" element={<ProtectedRoute><GenerateurModele /></ProtectedRoute>} />
                    <Route path="/vue-modeles" element={<ProtectedRoute><VueModeles /></ProtectedRoute>} />
                    <Route path="/catalogue" element={<ProtectedRoute><CatalogueFp /></ProtectedRoute>} />
                    <Route path="/catalogueComplet" element={<ProtectedRoute><CatalogueComplet /></ProtectedRoute>} />
                    <Route path="/tarification" element={<ProtectedRoute><Tarification /></ProtectedRoute>} />
                    <Route path="/operation-edi/order" element={<ProtectedRoute><Order /></ProtectedRoute>} />
<Route path="/enquete" element={<ProtectedRoute><Enquete /></ProtectedRoute>} />
                    <Route path="/operation-edi/invoice" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
                    <Route path="/operation-edi/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
                    <Route path="/operation-edi/shipments" element={<ProtectedRoute><Shipments /></ProtectedRoute>} />
                    <Route path="/operation-edi/desadv" element={<ProtectedRoute><DesadvManager /></ProtectedRoute>} />
                    <Route path="/caracteristiques" element={<ProtectedRoute><Caracteristiques id_entite={currentUser?.id_entite ?? 0} /></ProtectedRoute>} />
                    <Route path="/ordre-de-transport" element={<ProtectedRoute><TransportOrders /></ProtectedRoute>} />
                    <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
                    <Route path="/parametres/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
                    <Route path="/parametres/parametre" element={<ProtectedRoute><Parametre /></ProtectedRoute>} />
                    <Route path="/parametres/deconnexion" element={<ProtectedRoute><Deconnexion /></ProtectedRoute>} />
                    <Route path="/EditProfile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
                    <Route path="/ged" element={<ProtectedRoute><Ged compte={currentUser as any} /></ProtectedRoute>} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </NotificationProvider>
            </BrowserRouter>
          </ReactErrorBoundary>
          <ChatbotWidget />
        </TranslationProvider>
      </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
};

export default App;
