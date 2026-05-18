/**
 * useApi Hook
 * ============
 * 
 * Hook utilitaire pour créer des instances Axios configurées
 * avec les paramètres globaux de l'application.
 * 
 * @module hooks/useApi
 */

import { useMemo } from 'react';
import axios, { AxiosInstance } from 'axios';
import { useSettings } from '@/contexts/SettingsContext';

/**
 * Hook pour obtenir une instance Axios configurée avec l'URL du serveur actuel
 */
export const useApi = (): AxiosInstance => {
  const { getLocalApiUrl, settings } = useSettings();
  
  const api = useMemo(() => {
    const baseURL = getLocalApiUrl();
    const instance = axios.create({
      baseURL,
      timeout: settings.API_TIMEOUT || 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('currentUser');
          delete axios.defaults.headers.common['Authorization'];
          window.dispatchEvent(new CustomEvent('auth:logout'));
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [getLocalApiUrl, settings.API_TIMEOUT]);

  return api;
};

/**
 * Hook pour obtenir une instance Axios pour un serveur spécifique
 */
export const useServerApi = (serverId: 'senegal' | 'tunisia' | 'websocket'): AxiosInstance => {
  const { getServerUrl, settings } = useSettings();
  
  const api = useMemo(() => {
    const baseURL = getServerUrl(serverId);
    const instance = axios.create({
      baseURL,
      timeout: settings.API_TIMEOUT || 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    return instance;
  }, [getServerUrl, serverId, settings.API_TIMEOUT]);

  return api;
};

/**
 * Fonction utilitaire pour créer une instance API (sans hook)
 * Utile pour les appels en dehors des composants React
 */
export const createApiInstance = (baseURL: string, timeout: number = 30000): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

export default useApi;
