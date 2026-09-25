import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "@/contexts/TranslationContext";
import { useLocalApiUrl, useSettings } from "@/contexts/SettingsContext";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { resolveCountryKey, type CountryKey } from "@/lib/country";

/* ================= LOGO PARTENAIRE PAR PAYS =================
   Le pays est fixé au build (npm run build -- tunisia | cote_ivoire | senegal)
   et exposé par getCurrentCountryInfo() — même source que le drapeau.
   Pour ajouter un pays : une entrée ici + une règle dans src/lib/country.ts. */
const PARTNER_LOGOS: Record<CountryKey, { src: string; alt: string }> = {
  tunisia: {
    src: "https://edi.codeonline-info.com/images/cepex_full.png",
    alt: "CEPEX - Tunisia Export",
  },
  cote_ivoire: {
    src: "https://edi.codeonline-info.com/images/LOGO-CI-EXPORT.png",
    alt: "Côte d'Ivoire Export",
  },
  senegal: {
    src: "https://civ.codeonline-edi.net/images/ASEPEX.jpg",
    alt: "ASEPEX - Sénégal",
  },
};

// Petit logo rond dans l'en-tête (Tunisie : icône CEPEX d'origine).
const HEADER_LOGOS: Record<CountryKey, string> = {
  tunisia: "https://edi.codeonline-info.com/images/cepex.png",
  cote_ivoire: PARTNER_LOGOS.cote_ivoire.src,
  senegal: PARTNER_LOGOS.senegal.src,
};

const Login: React.FC = () => {
  const API_BASE_URL = useLocalApiUrl();
  const { getCurrentCountryInfo } = useSettings();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const countryInfo = getCurrentCountryInfo();
  const countryKey = resolveCountryKey(countryInfo);
  const partnerLogo = PARTNER_LOGOS[countryKey];
  const headerLogo = HEADER_LOGOS[countryKey];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [certicode, setCerticode] = useState("");
  const [isCerticodeModalOpen, setIsCerticodeModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(180);

  const isBackoffice =
    email === "fp_back_office@codeonline-info.com";

  /* ================= TIMER (180s CERTICODE) ================= */
  useEffect(() => {
    if (!isCerticodeModalOpen || isBackoffice) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCerticodeModalOpen(false);
          setCerticode("");
          toast.info("Certicode expiré");
          return 180;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCerticodeModalOpen, isBackoffice]);

  /* ================= LOGIN ================= */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Email et mot de passe requis");
      return;
    }

    setIsLoading(true);

    try {
      const payload: any = {
        email,
        password,
      };

      if (isCerticodeModalOpen && certicode) {
        payload.certicode = certicode;
      }

      const { data } = await axios.post(
        `${API_BASE_URL}/api/login`,
        payload
      );

      /* STEP 1: CERTICODE REQUIRED */
      if (data.status === "certicode_sent") {
        setIsCerticodeModalOpen(true);
        setTimer(180);
        setCerticode("");
        toast.success("Certicode envoyé par email");
        return;
      }

      /* STEP 2: LOGIN SUCCESS */
      const { token, ...userData } = data;

      if (token) localStorage.setItem("authToken", token);
      localStorage.setItem("currentUser", JSON.stringify(userData));

      window.dispatchEvent(new CustomEvent("auth:login"));

      toast.success("Connexion réussie");
      navigate("/", { replace: true });

    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur de connexion");
    } finally {
      setIsLoading(false);
    }
  };

  /* ================= RESET PASSWORD ================= */
  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Veuillez entrer votre email");
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/api/reset-password-email`, {
        email,
      });

      toast.success("Email de réinitialisation envoyé");
    } catch {
      toast.error("Erreur lors de la réinitialisation");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">

      <ToastContainer position="top-right" autoClose={1500} />

      {/* ================= HEADER ================= */}
      <header className="w-full bg-white border-b">
        <div className="max-w-7xl mx-auto h-16 flex justify-between items-center px-6">

          <div className="flex items-center gap-3">
            <img src="/images/logo-codeonline.png" className="h-8" />
            <span className="font-semibold text-[#001861]">
              Codeonline EDI
            </span>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSelector />

            <img
              src={countryInfo.flagUrl}
              className="h-6 rounded-sm"
              alt={`${countryInfo.name} Flag`}
            />

            <div className="w-px h-6 bg-gray-200" />

            <img
              src={headerLogo}
              alt={partnerLogo.alt}
              title={partnerLogo.alt}
              className="h-9 w-9 object-contain rounded-full ring-1 ring-gray-200 p-1 bg-white"
            />
          </div>
        </div>
      </header>

      {/* ================= MAIN LOGIN CARD ================= */}
      <div className="flex flex-1 items-center justify-center">

        <div className="w-[900px] h-[520px] flex bg-white shadow-2xl rounded-2xl overflow-hidden">

          {/* ================= LEFT BLUE PANEL ================= */}
          <div className="w-1/2 bg-blue-950 text-white flex flex-col justify-center items-center p-10">

            <img
              src="/images/logo-codeonline.png"
              className="h-16 mb-6"
            />

            <h1 className="text-2xl font-semibold">
              Codeonline EDI
            </h1>

            <p className="text-gray-300 mt-2 text-center">
              It's time to standard
            </p>
          </div>

          {/* ================= RIGHT FORM ================= */}
          <div className="w-1/2 flex items-center justify-center p-10">

            <form onSubmit={handleLogin} className="w-full max-w-sm">

              <div className="relative flex justify-center mb-8">
                <div className="absolute w-36 h-36 bg-gradient-to-br from-red-50 to-transparent rounded-full blur-2xl" />
                <img
                  key={partnerLogo.src}
                  src={partnerLogo.src}
                  alt={partnerLogo.alt}
                  className="relative h-24 w-auto max-w-[260px] object-contain drop-shadow-sm"
                />
              </div>

              <h2 className="text-2xl mb-6 font-semibold text-center text-gray-800">
                Connexion
              </h2>

              <input
                className="w-full border p-3 mb-4 rounded"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                className="w-full border p-3 mb-4 rounded"
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#001861] text-white py-3 rounded"
              >
                {isLoading ? "Connexion..." : "Se connecter"}
              </button>

              <button
                type="button"
                onClick={handleResetPassword}
                className="text-sm text-blue-600 mt-4"
              >
                Mot de passe oublié ?
              </button>

            </form>
          </div>
        </div>
      </div>

      {/* ================= CERTICODE MODAL ================= */}
      {isCerticodeModalOpen && !isBackoffice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">

          <form
            onSubmit={handleLogin}
            className="bg-white p-6 rounded-xl w-[350px]"
          >
            <h3 className="text-lg mb-3">Certicode</h3>

            <input
              className="w-full border p-3 rounded mb-3"
              value={certicode}
              onChange={(e) => setCerticode(e.target.value)}
              placeholder="Code reçu"
            />

            <div className="text-sm mb-3 text-gray-500">
              Temps restant: {timer}s
            </div>

            <button
              type="submit"
              className="w-full bg-[#001861] text-white py-2 rounded"
            >
              Valider
            </button>

            <button
              type="button"
              className="w-full mt-2 bg-gray-200 py-2 rounded"
              onClick={() => {
                setIsCerticodeModalOpen(false);
                setCerticode("");
              }}
            >
              Annuler
            </button>

          </form>
        </div>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="w-full bg-white border-t py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">

          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()}</span>

            <span className="mx-2">|</span>

            <img
              src="/images/logo-netconsulting.png"
              className="h-5"
              alt="Netconsulting Europe Ltd"
            />

            <span>
              Netconsulting Europe Ltd. Tous droits réservés.
            </span>
          </div>

        </div>
      </footer>

    </div>
  );
};

export default Login;