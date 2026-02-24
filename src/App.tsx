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
import EditProfile from "./pages/ProfileManagement";
import Ged from "./pages/Ged";
import Caracteristiques from "./pages/Caracteristiques";
import Operations from "./pages/Operations";
// import OrdreDeTransport from "./pages/OrdreDetransport"; // Placeholder replaced by functional component
import TransportOrders from "./pages/operation-edi/TransportOrder";
import Shipments from "./pages/operation-edi/Shipment";
import GlobalLoader from "./components/ui/GlobalLoader";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import axios from "axios";

const queryClient = new QueryClient();

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="p-4">
    <h1 className="text-2xl font-bold">Something went wrong.</h1>
    <p className="text-red-500">{error.message}</p>
  </div>
);

interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
  page_name?: string;
}

interface Compte {
  id_compte: number;
  id_entite?: number;
  email: string;
  name: string;
  prenom?: string | null;
  initials?: string;
  profile_id: number;
  permissions: Permission[];
  certicode?: string | null;
  role?: string | null;
  is_suspended: number;
  created_at: string;
  id_producteur: number;
  producer_name: string | null;
  avatar_url?: string | null;
}

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

  useEffect(() => {
    console.log('[App] 🚀 Application mounted');
    console.log('[App] 🔍 Checking localStorage for currentUser...');
    
    const storedUser = localStorage.getItem("currentUser");
    if (storedUser) {
      console.log('[App] 📦 Found user in localStorage, parsing...');
      try {
        const parsedUser: Compte = JSON.parse(storedUser);
        console.log('[App] 👤 Parsed user:', { 
          id_compte: parsedUser.id_compte, 
          email: parsedUser.email, 
          name: parsedUser.name,
          profile_id: parsedUser.profile_id
        });
        
        if (!parsedUser.id_compte) {
          console.warn("[App] ⚠️ id_compte missing in stored user:", parsedUser);
          localStorage.removeItem("currentUser");
          setCurrentUser(null);
          return;
        }
        const userWithInitials = {
          ...parsedUser,
          initials: parsedUser.name ? parsedUser.name.slice(0, 2).toUpperCase() : "UA",
        };
        setCurrentUser(userWithInitials);
        console.log("[App] ✅ currentUser set with id_compte:", parsedUser.id_compte);
      } catch (err) {
        console.error("[App] ❌ Failed to parse stored user:", err);
        localStorage.removeItem("currentUser");
        setCurrentUser(null);
      }
    } else {
      console.warn("[App] ⚠️ No user found in localStorage");
    }

    // Set PIN header globally for Axios
    const pin = localStorage.getItem('pin') || '3311';
    axios.defaults.headers.common['x-api-pin'] = pin;
    console.log('[App] 🔐 Set global x-api-pin header:', pin);
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

          <Toaster
            position="top-right"
            toastOptions={{
              className:
                "bg-white/90 backdrop-blur-lg shadow-lg border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 font-medium transition-all duration-300 hover:scale-[1.02] hover:shadow-xl flex items-center justify-between gap-2",
              style: { maxWidth: "300px" },
            }}
            containerStyle={{ top: "1rem", right: "1rem" }}
          />

          <ReactErrorBoundary FallbackComponent={ErrorFallback}>
            <BrowserRouter>
              <NotificationProvider compteId={currentUser?.id_compte || null}>
                <RouteChangeHandler setIsLoading={setIsLoading} />

                <Routes>
                  <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
                  <Route path="/login" element={<Login />} />
                  <Route element={<DashboardLayout currentUser={currentUser} />}>
                  {/* Always shown EDI pages */}
<Route path="/operation-edi/order" element={<Order />} />
<Route path="/operation-edi/invoice" element={<Invoice />} />
<Route path="/operation-edi/tracking" element={<Tracking />} />
<Route path="/operation-edi/shipments" element={<Shipments />} />
<Route path="/ordre-de-transport" element={<TransportOrders />} />
                    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                    <Route path="/parametres/profils" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="/parametres/comptes" element={<ProtectedRoute><Comptes /></ProtectedRoute>} />
                    <Route path="/parametres/tpo" element={<ProtectedRoute><Tpo /></ProtectedRoute>} />
                    <Route path="/entite" element={<ProtectedRoute><Entite /></ProtectedRoute>} />
                    <Route path="/produit" element={<ProtectedRoute><Produit /></ProtectedRoute>} />
                    <Route path="/trafic" element={<ProtectedRoute><Trafic /></ProtectedRoute>} />
                    <Route path="/gpc" element={<ProtectedRoute><Gpc /></ProtectedRoute>} />
                    <Route path="/flash" element={<ProtectedRoute><Flashnotif /></ProtectedRoute>} />
                    <Route path="/generateur-modele" element={<ProtectedRoute><GenerateurModele /></ProtectedRoute>} />
                    <Route path="/vue-modeles" element={<ProtectedRoute><VueModeles /></ProtectedRoute>} />
                    <Route path="/catalogue" element={<ProtectedRoute><CatalogueFp /></ProtectedRoute>} />
                    <Route path="/operation-edi/order" element={<ProtectedRoute><Order /></ProtectedRoute>} />

                    <Route path="/operation-edi/invoice" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
                    <Route path="/operation-edi/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
                    <Route path="/operation-edi/shipments" element={<ProtectedRoute><Shipments /></ProtectedRoute>} />
                    <Route path="/caracteristiques" element={<ProtectedRoute><Caracteristiques /></ProtectedRoute>} />
                    <Route path="/ordre-de-transport" element={<ProtectedRoute><TransportOrders /></ProtectedRoute>} />
                    <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
                    <Route path="/parametres/profil" element={<ProtectedRoute><Profil /></ProtectedRoute>} />
                    <Route path="/parametres/parametre" element={<ProtectedRoute><Parametre /></ProtectedRoute>} />
                    <Route path="/parametres/deconnexion" element={<ProtectedRoute><Deconnexion /></ProtectedRoute>} />
                    <Route path="/EditProfile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
                    <Route path="/ged" element={<ProtectedRoute><Ged compte={currentUser} /></ProtectedRoute>} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </NotificationProvider>
            </BrowserRouter>
          </ReactErrorBoundary>
        </TranslationProvider>
      </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
};

export default App;
