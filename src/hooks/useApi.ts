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
  const { getApiUrl, settings } = useSettings();
  
  const api = useMemo(() => {
    const baseURL = getApiUrl();
    
    return axios.create({
      baseURL,
      timeout: settings.API_TIMEOUT || 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-pin': localStorage.getItem('pin') || '3311',
      },
    });
  }, [getApiUrl, settings.API_TIMEOUT]);

  return api;
};

/**
 * Hook pour obtenir une instance Axios pour un serveur spécifique
 */
export const useServerApi = (serverId: 'buyer' | 'supplier' | 'senegal' | 'tunisia'): AxiosInstance => {
  const { getServerUrl, settings } = useSettings();
  
  const api = useMemo(() => {
    const baseURL = getServerUrl(serverId);
    
    return axios.create({
      baseURL,
      timeout: settings.API_TIMEOUT || 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-pin': localStorage.getItem('pin') || '3311',
      },
    });
  }, [getServerUrl, serverId, settings.API_TIMEOUT]);

  return api;
};

/**
 * Fonction utilitaire pour créer une instance API (sans hook)
 * Utile pour les appels en dehors des composants React
 */
export const createApiInstance = (baseURL: string, timeout: number = 30000): AxiosInstance => {
  return axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
      'x-api-pin': localStorage.getItem('pin') || '3311',
    },
  });
};

export default useApi;
