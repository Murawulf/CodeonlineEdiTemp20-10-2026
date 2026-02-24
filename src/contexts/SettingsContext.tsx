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
  API_URL_SENEGAL: string;
  EDI_URL_SENEGAL: string;
  
  API_URL_TUNISIA: string;
  EDI_URL_TUNISIA: string;
  
  WEBSOCKET_URL: string;
  
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
  
  // Current environment info
  CURRENT_COUNTRY: 'senegal' | 'tunisia';
  COUNTRY_FLAG_URL: string;
  
  // Allow additional dynamic parameters
  [key: string]: string | number | boolean;
}

interface SettingsContextType {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  
  // Helper methods
  get: <T = string | number | boolean>(key: string, defaultValue?: T) => T;
  getServerUrl: (serverId: 'senegal' | 'tunisia' | 'websocket') => string;
  getApiUrl: () => string; // Legacy - utiliser getLocalApiUrl
  getLocalApiUrl: () => string; // Pour appels à notre backend
  getCountryApiUrl: (country: 'senegal' | 'tunisia') => string; // API Directe (Data)
  getCountryEdiUrl: (country: 'senegal' | 'tunisia') => string; // EDI Endpoint
  getCurrentCountryInfo: () => { id: 'senegal' | 'tunisia', flagUrl: string, name: string };
  reload: () => Promise<void>;
}

// Default settings (fallback values)
const DEFAULT_SETTINGS: AppSettings = {
  LOCAL_API_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001',
  
  API_URL_SENEGAL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001',
  EDI_URL_SENEGAL: `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api/edi/receive`,
  
  API_URL_TUNISIA: 'https://edi-dev.codeonline-info.com',
  EDI_URL_TUNISIA: 'https://edi-dev.codeonline-info.com/api/edi/receive',
  
  WEBSOCKET_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001',
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
  CURRENT_COUNTRY: 'tunisia',
  COUNTRY_FLAG_URL: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Flag_of_Tunisia.svg'
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

  // Determine current country based on the hostname (pure function, no deps on other callbacks)
  const getCurrentCountryInfo = useCallback(() => {
    const hostname = window.location.hostname;
    const isSenegal = hostname.includes('dev.codeonline-edi.net') || settings.LOCAL_API_URL?.includes('dev.codeonline-edi.net');
    
    if (isSenegal) {
      return {
        id: 'senegal' as const,
        name: 'Sénégal',
        flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Flag_of_Senegal.svg'
      };
    }
    
    return {
      id: 'tunisia' as const,
      name: 'Tunisie',
      flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Flag_of_Tunisia.svg'
    };
  }, [settings.LOCAL_API_URL]);

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
