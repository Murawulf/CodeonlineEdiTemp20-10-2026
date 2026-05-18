/**
 * Settings Context
 * =================
 * 
 * Contexte React pour la gestion des paramètres globaux de l'application.
 * Charge les paramètres depuis l'API au démarrage et les met à disposition
 * de tous les composants via le hook useSettings().
 * 
 * @module contexts/SettingsContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Types
export interface ServerUrls {
  buyer: string;
  supplier: string;
  senegal: string;
  tunisia: string;
  websocket: string;
}

export interface AppSettings {
  // Local Backend API URL (notre serveur)
  LOCAL_API_URL: string;
  
  // Per-Country Configuration (Data API + EDI Endpoint)
  // Hydrated by the backend from NETWORK_TOPOLOGY (app_parameters table)
  API_URL_SENEGAL: string;
  EDI_URL_SENEGAL: string;
  
  API_URL_TUNISIA: string;
  EDI_URL_TUNISIA: string;
  
  WEBSOCKET_URL: string;
  
  // Instance identity (provided by backend /api/settings, sourced from .env CURRENT_INSTANCE_CODE)
  CURRENT_INSTANCE_CODE?: string;
  
  // Legacy / Deprecated (Mapped dynamically for backward compatibility)
  API_URL_BUYER?: string;
  API_URL_SUPPLIER?: string;
  
  // API Configuration
  API_TIMEOUT: number;
  
  // Application Settings
  APP_NAME: string;
  APP_VERSION: string;
  DEFAULT_CURRENCY: string;
  DEFAULT_LANGUAGE: string;
  
  // Feature Flags
  FEATURE_EDI_WORKER: boolean;
  FEATURE_NOTIFICATIONS: boolean;
  
  // Pagination
  DEFAULT_PAGE_SIZE: number;
  MAX_PAGE_SIZE: number;
  
  // File Upload
  MAX_FILE_SIZE_MB: number;
  MAX_LOGO_SIZE_MB: number;
  
  // Allow additional dynamic parameters
  [key: string]: string | number | boolean | undefined;
}

// Static country metadata (UI resources only — no server URLs)
// These are static assets associated with each instance code.
export type CountryId = 'senegal' | 'tunisia' | 'cote_ivoire';

const COUNTRY_METADATA: Record<CountryId, { name: string; flagUrl: string; institutionLogoUrl: string }> = {
  senegal: {
    name: 'Sénégal',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Flag_of_Senegal.svg',
    institutionLogoUrl: '/images/logo-codeonline.png'
  },
  tunisia: {
    name: 'Tunisie',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Flag_of_Tunisia.svg',
    institutionLogoUrl: '/images/logo-codeonline.png'
  },
  cote_ivoire: {
    name: "Côte d'Ivoire",
    flagUrl: '/images/civ_flag.png',
    institutionLogoUrl: '/images/LOGO-CI-EXPORT.png'
  }
};

interface SettingsContextType {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  
  // Helper methods
  get: <T = string | number | boolean>(key: string, defaultValue?: T) => T;
  getServerUrl: (serverId: CountryId | 'websocket') => string;
  getApiUrl: () => string; // Legacy - utiliser getLocalApiUrl
  getLocalApiUrl: () => string; // Pour appels à notre backend
  getCountryApiUrl: (country: CountryId) => string; // API Directe (Data)
  getCountryEdiUrl: (country: CountryId) => string; // EDI Endpoint
  getCurrentCountryInfo: () => { id: CountryId; flagUrl: string; name: string; institutionLogoUrl: string };
  reload: () => Promise<void>;
}

// Default settings (UI fallbacks only — ALL server URLs are populated at runtime
// from the backend `/api/settings` endpoint, which sources them from:
//   1. Environment variables (backend/.env: CURRENT_INSTANCE_CODE, LOCAL_API_URL)
//   2. The `app_parameters` DB table (NETWORK_TOPOLOGY)
// No country-specific URLs should ever live in this file.
const DEFAULT_SETTINGS: AppSettings = {
  // Server URLs — intentionally empty; backend fills these in
  LOCAL_API_URL: '',
  API_URL_SENEGAL: '',
  EDI_URL_SENEGAL: '',
  API_URL_TUNISIA: '',
  EDI_URL_TUNISIA: '',
  WEBSOCKET_URL: '',

  // Non-URL UI defaults (safe to hardcode)
  API_TIMEOUT: 30000,
  APP_NAME: 'CodeOnline EDI',
  APP_VERSION: '1.0.0',
  DEFAULT_CURRENCY: 'TND',
  DEFAULT_LANGUAGE: 'fr',
  FEATURE_EDI_WORKER: true,
  FEATURE_NOTIFICATIONS: true,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_FILE_SIZE_MB: 10,
  MAX_LOGO_SIZE_MB: 5,
};

// Detect environment based on window location
const getInitialApiUrl = (): string => {
  console.log('[SettingsContext] 🔍 getInitialApiUrl() called');
  
  // En développement (DEV=true), utiliser le backend local qui agit comme proxy
  if (import.meta.env.DEV) {
    console.log('[SettingsContext] 🔧 DEV mode: Using local backend proxy at http://localhost:5001');
    return 'http://localhost:5001';
  }
  
  // En production, utiliser dynamiquement l'origine courante (ex: https://dev.codeonline-edi.net)
  // Cela permet au même build de fonctionner sur le serveur Senegal et Tunisie sans recompiler
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    console.log('[SettingsContext] 🌍 PROD mode: Using window origin as API URL:', origin);
    return origin;
  }
  
  // Fallback ultime (ne devrait jamais arriver dans un navigateur)
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Load settings from API
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = getInitialApiUrl();
      console.log('[SettingsContext] 🌐 Loading settings from:', `${apiUrl}/api/settings`);
      const response = await fetch(`${apiUrl}/api/settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[SettingsContext] ❌ Failed to load settings, HTTP status:', response.status);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[SettingsContext] 📥 Settings response:', result);
      
      if (result.success && result.data) {
        // Merge with defaults to ensure all keys exist
        setSettings(prev => ({
          ...DEFAULT_SETTINGS,
          ...prev,
          ...result.data,
        }));
        console.log('[SettingsContext] ✅ Settings loaded from API:', Object.keys(result.data).length, 'parameters');
      } else {
        throw new Error(result.error || 'Failed to load settings');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[SettingsContext] ⚠️ Failed to load settings from API, using defaults:', errorMessage);
      setError(errorMessage);
      // Keep using default settings
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Get a specific setting value
  const get = useCallback(<T = string | number | boolean>(key: string, defaultValue?: T): T => {
    const value = settings[key];
    if (value !== undefined) {
      return value as T;
    }
    return defaultValue as T;
  }, [settings]);

  // Determine current country. Priority:
  //   1. Backend-provided CURRENT_INSTANCE_CODE (sourced from .env on each server)
  //   2. Generic hostname heuristic (any hostname containing "senegal" or ".sn")
  //   3. Default to 'tunisia' as the historical primary instance
  const getCurrentCountryInfo = useCallback(() => {
    const instanceCode = String(settings.CURRENT_INSTANCE_CODE || '').trim().toLowerCase();
    let id: CountryId;

    if (instanceCode === 'senegal' || instanceCode === 'tunisia' || instanceCode === 'cote_ivoire') {
      id = instanceCode;
    } else {
      const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      if (/senegal|\.sn(\b|$)/i.test(hostname)) id = 'senegal';
      else if (/civ|cote.ivoire|codeonline-edi\.net.*civ/i.test(hostname)) id = 'cote_ivoire';
      else id = 'tunisia';
    }

    return { id, ...COUNTRY_METADATA[id] };
  }, [settings.CURRENT_INSTANCE_CODE]);

  // Get server URL by ID
  // Règle : si le serveur demandé = instance courante → URL publique (origin)
  //         si le serveur demandé = autre pays → URL distante depuis la topologie DB
  const getServerUrl = useCallback((serverId: 'senegal' | 'tunisia' | 'websocket'): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';
    
    if (serverId === 'websocket') {
      return settings.WEBSOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5001' : origin);
    }

    // En DEV : toujours localhost
    if (import.meta.env.DEV) {
      return 'http://localhost:5001';
    }

    // En PRODUCTION : détecter si le serveur demandé est l'instance courante
    const currentCountry = getCurrentCountryInfo().id;
    if (serverId === currentCountry) {
      // C'est notre serveur local → utiliser l'URL dynamique du navigateur
      return origin;
    }

    // C'est un serveur distant → utiliser l'URL de la topologie DB
    const remoteUrlMap: Record<string, string> = {
      senegal: settings.API_URL_SENEGAL,
      tunisia: settings.API_URL_TUNISIA,
    };
    return remoteUrlMap[serverId] || origin;
  }, [settings, getCurrentCountryInfo]);

  // Get LOCAL API URL (notre backend)
  const getLocalApiUrl = useCallback((): string => {
    // FORCE PROXY IN DEV MODE: Always use localhost:5001 in dev to avoid CORS
    if (import.meta.env.DEV) {
      console.log('[SettingsContext] 🔧 DEV mode: Forcing local backend proxy at http://localhost:5001');
      return 'http://localhost:5001';
    }

    // EN PRODUCTION : Priorité à l'origine du navigateur, puis aux paramètres configurés
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';
    const url = origin;
    console.log('[SettingsContext] 🔗 getLocalApiUrl() returning:', url);
    return url;
  }, []);

  // Get current API URL based on environment (legacy - utiliser getLocalApiUrl à la place)
  const getApiUrl = useCallback((): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';
    const url = import.meta.env.DEV ? 'http://localhost:5001' : origin;
    console.log('[SettingsContext] 🔗 getApiUrl() returning:', url);
    return url;
  }, []);
  
  // Get Country API URL (Direct Data Access)
  // Règle : si c'est le pays local → URL publique, sinon → URL distante
  const getCountryApiUrl = useCallback((country: 'senegal' | 'tunisia'): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';
    if (!import.meta.env.DEV && country === getCurrentCountryInfo().id) {
      return origin;
    }
    const urlMap: Record<string, string> = {
      senegal: settings.API_URL_SENEGAL,
      tunisia: settings.API_URL_TUNISIA,
    };
    return urlMap[country] || origin;
  }, [settings, getCurrentCountryInfo]);

  // Get Country EDI URL (Document Exchange Endpoint)
  // Règle : si c'est le pays local → URL publique /api/edi/receive, sinon → URL distante
  const getCountryEdiUrl = useCallback((country: 'senegal' | 'tunisia'): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001';
    if (!import.meta.env.DEV && country === getCurrentCountryInfo().id) {
      return `${origin}/api/edi/receive`;
    }
    const urlMap: Record<string, string> = {
      senegal: settings.EDI_URL_SENEGAL,
      tunisia: settings.EDI_URL_TUNISIA,
    };
    return urlMap[country] || `${origin}/api/edi/receive`;
  }, [settings, getCurrentCountryInfo]);

  // Reload settings from API
  const reload = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  const value: SettingsContextType = {
    settings,
    isLoading,
    error,
    isReady,
    get,
    getServerUrl,
    getApiUrl,
    getLocalApiUrl,
    getCountryApiUrl,
    getCountryEdiUrl,
    getCurrentCountryInfo,
    reload,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// Hook to use settings
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Utility hook to get LOCAL API URL (notre backend)
export const useLocalApiUrl = (): string => {
  const { getLocalApiUrl } = useSettings();
  return getLocalApiUrl();
};

// Utility hook to get just the API URL (legacy - utiliser useLocalApiUrl à la place)
export const useApiUrl = (): string => {
  const { getApiUrl } = useSettings();
  return getApiUrl();
};

// Utility hook to get Country API URL (Data)
export const useCountryApiUrl = (country: 'senegal' | 'tunisia'): string => {
  const { getCountryApiUrl } = useSettings();
  return getCountryApiUrl(country);
};

// Utility hook to get Country EDI URL (Exchange)
export const useCountryEdiUrl = (country: 'senegal' | 'tunisia'): string => {
  const { getCountryEdiUrl } = useSettings();
  return getCountryEdiUrl(country);
};

// Utility hook to get server URLs
export const useServerUrls = () => {
  const { settings } = useSettings();
  return {
    local: settings.LOCAL_API_URL,
    senegal: {
      api: settings.API_URL_SENEGAL,
      edi: settings.EDI_URL_SENEGAL
    },
    tunisia: {
      api: settings.API_URL_TUNISIA,
      edi: settings.EDI_URL_TUNISIA
    },
    websocket: settings.WEBSOCKET_URL,
  };
};

export default SettingsContext;
