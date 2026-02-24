import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "@/contexts/TranslationContext";
import logo from "../components/layout/logo.png";

interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
  page_name?: string;
}

interface Compte {
  id_compte: number;
  email: string;
  name: string;
  profile_id: number;
  permissions: Permission[];
  certicode?: string | null;
  role?: string | null;
  is_suspended: number;
  created_at: string;
  id_entite: number;
  producer_name: string | null;
  gln?: string;
}

const Login: React.FC = () => {
  const API_BASE_URL = useMemo(() => {
    const url = import.meta.env.DEV ? 'http://localhost:5001' : window.location.origin;
    console.log('[Login] 🌐 API_BASE_URL:', url);
    return url;
  }, []);
  
  console.log('[Login] 🔑 Component mounted');
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [certicode, setCerticode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCerticodeModalOpen, setIsCerticodeModalOpen] = useState(false);
  const [timer, setTimer] = useState(60);

  const isBackoffice = email === "fp_back_office@codeonline-info.com";

  /* =========================
     Certicode countdown
  ========================= */
  useEffect(() => {
    if (!isCerticodeModalOpen || isBackoffice) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCerticodeModalOpen(false);
          setCerticode("");
          toast.info(
            t("certicode_timeout") ||
            "Le temps pour entrer le certicode est écoulé"
          );
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCerticodeModalOpen, isBackoffice, t]);

  /* =========================
     Login handler
  ========================= */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error(
        t("email_password_required") || "Email et mot de passe requis"
      );
      return;
    }

    setIsLoading(true);
    console.log('[Login] 🚀 Starting login process');
    console.log('[Login] 📧 Email:', email);
    console.log('[Login] 🏢 Is backoffice:', isBackoffice);

    try {
      const payload: any = { email, password };

      // Correction : Envoyer le certicode s'il est renseigné, quel que soit l'utilisateur
      if (certicode) {
        payload.certicode = certicode;
        console.log('[Login] 🔐 Including certicode in payload');
      }

      const loginUrl = `${API_BASE_URL}/api/login`;
      console.log('[Login] 🌐 POST request to:', loginUrl);
      console.log('[Login] 📦 Payload:', { email, hasPassword: !!password, hasCerticode: !!certicode });

      const { data } = await axios.post(
        loginUrl,
        payload,
        { withCredentials: true }
      );

      console.log('[Login] ✅ Login successful, received data:', data);

      /* ---- Certicode step ---- */
      if (data.status === "certicode_sent") {
        setIsCerticodeModalOpen(true);
        setTimer(60);
        toast.success("Certicode envoyé à votre email");
        return;
      }

      /* ---- SUCCESS ---- */
      const userData: Compte = data;

      // Debug: Log received data from backend
      console.log('🔍 LOGIN FRONTEND - Données reçues du backend:', userData);
      console.log('🔍 LOGIN FRONTEND - GLN dans les données:', userData.gln);

      // Save to localStorage with correct key
      localStorage.setItem("currentUser", JSON.stringify(userData));

      // Verify save
      const saved = localStorage.getItem("currentUser");
      console.log('🔍 LOGIN FRONTEND - Données sauvegardées:', saved);

      // 🔥 CRITICAL FIXES
      setIsCerticodeModalOpen(false);
      setCerticode("");
      setTimer(60);

      toast.success("Connexion réussie");

      // Instant redirect (no delay)
      navigate("/", { replace: true });
    } catch (error: any) {
      const message =
        error.response?.data?.error ||
        t("login_failed") ||
        "Échec de la connexion";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  /* =========================
     Certicode submit
  ========================= */
  const handleCerticodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(e);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <ToastContainer position="top-right" autoClose={1500} theme="dark" />

      {/* Main */}
      <div className="flex flex-grow items-center justify-center">
        <div className="flex w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Left */}
          <div className="hidden md:flex flex-col items-center justify-center w-1/2 p-8">
            <img
              src="https://edi.codeonline-info.com/lovable-uploads/a13c1ffe-9c2c-4e6a-a048-063ce7274535.png"
              className="w-48 object-contain"
            />
            <h3 className="text-xl mt-4">Bienvenue sur Codeonline EDI</h3>
            <p className="text-sm text-gray-600">It's time to goods</p>
          </div>

          {/* Right */}
          <div className="w-full md:w-1/2 p-8 md:p-12">
            <h2 className="text-3xl mb-8 text-center">Connexion</h2>

            <form onSubmit={handleLogin} className="space-y-6">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full border rounded-lg p-3"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full border rounded-lg p-3"
                required
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#001861] text-white rounded-lg"
              >
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-6 text-center">
        <img src={logo} className="h-24 mx-auto mb-3" />
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Netconsulting Europe LTD
        </p>
      </footer>

      {/* Certicode Modal */}
      {isCerticodeModalOpen && !isBackoffice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg mb-4">Certicode</h3>

            <form onSubmit={handleCerticodeSubmit} className="space-y-4">
              <input
                type="text"
                value={certicode}
                onChange={(e) => setCerticode(e.target.value)}
                placeholder="Entrez le certicode"
                className="w-full border rounded-lg p-3"
                autoFocus
                required
              />

              <p className="text-sm text-gray-500">
                Temps restant: {timer}s
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCerticodeModalOpen(false);
                    setCerticode("");
                    setTimer(60);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-[#001861] text-white rounded"
                >
                  {isLoading ? "Vérification..." : "Valider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
