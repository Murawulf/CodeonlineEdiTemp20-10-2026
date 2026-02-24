/**
 * API Proxy Routes
 * 
 * Centralise tous les appels API du frontend via le backend pour :
 * - Éviter les problèmes CORS
 * - Centraliser la gestion des erreurs
 * - Améliorer la sécurité (pas d'exposition directe des URLs)
 * - Faciliter le monitoring et le logging
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const configService = require('../services/configService');

const DEFAULT_PORT = process.env.PORT || 5001;
const DEFAULT_LOCAL_URL = `http://localhost:${DEFAULT_PORT}`;

// Timeout par défaut pour les requêtes proxy
const DEFAULT_TIMEOUT = 10000; // 10 secondes

/**
 * Proxy générique pour tous les appels API
 * Route: /api/proxy/:target/:path(*)
 * 
 * Exemples:
 * - GET /api/proxy/settings → GET {LOCAL_API_URL}/api/settings
 * - POST /api/proxy/login → POST {LOCAL_API_URL}/api/login
 * - GET /api/proxy/senegal/companies → GET {API_URL_SENEGAL}/api/companies
 * - GET /api/proxy/tunisia/products → GET {API_URL_TUNISIA}/api/products
 */
router.all(/^\/proxy\/([^\/]+)\/(.*)/, async (req, res) => {
  try {
    const target = req.params[0];
    const path = req.params[1];
    
    console.log(`[API Proxy] 📡 ${req.method} /api/proxy/${target}/${path}`);
    
    // Déterminer l'URL de base selon la cible
    let baseUrl;
    
    switch (target.toLowerCase()) {
      case 'local':
      case 'settings':
      case 'login':
      case 'notifications':
        // Appels vers le serveur local/principal
        baseUrl = configService.get('LOCAL_API_URL', DEFAULT_LOCAL_URL);
        break;
        
      case 'senegal':
      case 'sn':
        // Appels vers le serveur Sénégal
        baseUrl = configService.getCountryApiUrl('senegal');
        break;
        
      case 'tunisia':
      case 'tn':
        // Appels vers le serveur Tunisie
        baseUrl = configService.getCountryApiUrl('tunisia');
        break;
        
      default:
        return res.status(400).json({
          error: 'Invalid proxy target',
          details: `Target '${target}' is not recognized. Valid targets: local, senegal, tunisia, settings, login, notifications`,
          validTargets: ['local', 'senegal', 'tunisia', 'settings', 'login', 'notifications']
        });
    }
    
    // Construire l'URL complète
    const fullUrl = `${baseUrl}/api/${path}`;
    console.log(`[API Proxy] 🌐 Forwarding to: ${fullUrl}`);
    
    // Préparer les headers (exclure les headers problématiques)
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
    };
    
    // Ajouter le PIN si présent
    if (req.headers['x-api-pin']) {
      headers['x-api-pin'] = req.headers['x-api-pin'];
    }
    
    // Préparer la configuration de la requête
    const axiosConfig = {
      method: req.method,
      url: fullUrl,
      headers,
      timeout: DEFAULT_TIMEOUT,
      validateStatus: () => true, // Ne pas rejeter sur les codes d'erreur HTTP
    };
    
    // Ajouter les query params
    if (Object.keys(req.query).length > 0) {
      axiosConfig.params = req.query;
    }
    
    // Ajouter le body pour POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      axiosConfig.data = req.body;
    }
    
    // Faire la requête
    const response = await axios(axiosConfig);
    
    // Logger le résultat
    console.log(`[API Proxy] ${response.status >= 400 ? '❌' : '✅'} Response: ${response.status}`);
    
    // Transférer les headers importants
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }
    if (response.headers['cache-control']) {
      res.set('Cache-Control', response.headers['cache-control']);
    }
    
    // Retourner la réponse
    res.status(response.status).json(response.data);
    
  } catch (err) {
    console.error(`[API Proxy] ❌ Error:`, err.message);
    
    // Gestion des erreurs de connexion
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Service unavailable',
        details: 'Could not connect to the target server',
        code: 'ECONNREFUSED'
      });
    }
    
    if (err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Gateway timeout',
        details: 'The target server did not respond in time',
        code: 'ETIMEDOUT'
      });
    }
    
    // Erreur de réponse HTTP
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    // Erreur générique
    res.status(500).json({
      error: 'Proxy error',
      details: err.message
    });
  }
});

// NOTE: /api/settings route is handled by settingsRoutes, not by proxy
// Removed to prevent infinite loop (proxy calling itself)

/**
 * Route spécifique pour /api/login (raccourci)
 * POST /api/login → POST {LOCAL_API_URL}/api/login
 */
router.post('/login', async (req, res) => {
  try {
    console.log('[API Proxy] 📡 POST /api/login (direct route)');
    
    const localApiUrl = configService.get('LOCAL_API_URL', DEFAULT_LOCAL_URL);
    const loginUrl = `${localApiUrl}/api/login`;
    
    console.log(`[API Proxy] 🌐 Forwarding login to: ${loginUrl}`);
    
    const response = await axios.post(loginUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
      validateStatus: () => true,
    });
    
    console.log(`[API Proxy] ${response.status >= 400 ? '❌' : '✅'} Login response: ${response.status}`);
    
    // Transférer les cookies si présents
    if (response.headers['set-cookie']) {
      res.set('Set-Cookie', response.headers['set-cookie']);
    }
    
    res.status(response.status).json(response.data);
    
  } catch (err) {
    console.error('[API Proxy] ❌ Login error:', err.message);
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({
        error: 'Login service unavailable',
        details: 'Could not connect to the authentication server'
      });
    }
    
    res.status(500).json({
      error: 'Login failed',
      details: err.message
    });
  }
});

/**
 * Route pour les notifications (existant)
 * GET /api/proxy/notifications?id_compte=123
 */

// Throttle mechanism pour éviter le spam de logs
let notificationsServerDown = false;
let lastNotificationError = 0;
const NOTIFICATION_ERROR_COOLDOWN = 30000; // 30 secondes

router.get('/proxy/notifications', async (req, res) => {
  try {
    // Cache pour 30 secondes
    res.set('Cache-Control', 'private, max-age=30');
    const { id_compte } = req.query;
    
    if (!id_compte) {
      return res.status(400).json({ 
        error: 'Missing id_compte parameter',
        details: 'id_compte is required to fetch notifications'
      });
    }

    // Si le serveur était down récemment, retourner l'erreur en cache
    const now = Date.now();
    if (notificationsServerDown && (now - lastNotificationError) < NOTIFICATION_ERROR_COOLDOWN) {
      return res.status(503).json({ 
        error: 'Notifications server unavailable',
        details: 'Service temporarily unavailable',
        retryAfter: Math.ceil((NOTIFICATION_ERROR_COOLDOWN - (now - lastNotificationError)) / 1000)
      });
    }

    const localApiUrl = configService.get('LOCAL_API_URL', DEFAULT_LOCAL_URL);
    const notificationsUrl = `${localApiUrl}/api/notifications`;

    console.log('[API Proxy] 📡 GET /api/proxy/notifications');
    console.log(`[API Proxy] 🌐 Fetching from: ${notificationsUrl}`);

    const response = await axios.get(notificationsUrl, {
      params: { id_compte },
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    if (response.status >= 500) {
      console.warn(`[API Proxy] ⚠️ Target returned ${response.status}`);
      return res.status(response.status).json(response.data);
    }

    // Serveur de retour, reset flag
    if (notificationsServerDown) {
      console.log('[API Proxy] ✅ Notifications server is back online');
      notificationsServerDown = false;
    }

    res.json(response.data);
    
  } catch (err) {
    const now = Date.now();
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      if (!notificationsServerDown || (now - lastNotificationError) >= NOTIFICATION_ERROR_COOLDOWN) {
        console.warn('[API Proxy] ⚠️  Notifications server unavailable');
        notificationsServerDown = true;
        lastNotificationError = now;
      }
      
      return res.status(503).json({ 
        error: 'Notifications server unavailable', 
        details: 'Could not connect to the notifications server',
        retryAfter: 30
      });
    }
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ 
      error: 'Proxy error', 
      details: err.message 
    });
  }
});

/**
 * Route pour marquer une notification comme lue
 * PUT /api/proxy/notifications/:id/read
 */
router.put('/proxy/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    
    if (!id_compte) {
      return res.status(400).json({ 
        error: 'Missing id_compte parameter',
        details: 'id_compte is required to mark notification as read'
      });
    }

    const localApiUrl = configService.get('LOCAL_API_URL', DEFAULT_LOCAL_URL);
    const notificationsUrl = `${localApiUrl}/api/notifications/${id}/read`;

    console.log(`[API Proxy] 📡 PUT /api/proxy/notifications/${id}/read`);

    const response = await axios.put(notificationsUrl, 
      { id_compte },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000,
        validateStatus: () => true
      }
    );

    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }

    res.json(response.data);
    
  } catch (err) {
    console.error('[API Proxy] ❌ Mark notification as read error:', err.message);
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Notifications server unavailable', 
        details: 'Could not connect to the notifications server'
      });
    }
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ 
      error: 'Proxy error', 
      details: err.message 
    });
  }
});

/**
 * Route pour supprimer une notification
 * DELETE /api/proxy/notifications/:id
 */
router.delete('/proxy/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    
    if (!id_compte) {
      return res.status(400).json({ 
        error: 'Missing id_compte parameter',
        details: 'id_compte is required to delete notification'
      });
    }

    const localApiUrl = configService.get('LOCAL_API_URL', DEFAULT_LOCAL_URL);
    const notificationsUrl = `${localApiUrl}/api/notifications/${id}`;

    console.log(`[API Proxy] 📡 DELETE /api/proxy/notifications/${id}`);

    const response = await axios.delete(notificationsUrl, {
      data: { id_compte },
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000,
      validateStatus: () => true
    });

    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }

    res.json(response.data);
    
  } catch (err) {
    console.error('[API Proxy] ❌ Delete notification error:', err.message);
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Notifications server unavailable', 
        details: 'Could not connect to the notifications server'
      });
    }
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ 
      error: 'Proxy error', 
      details: err.message 
    });
  }
});

/**
 * Route pour les fournisseurs EDI (suppliers)
 * GET /api/edi/suppliers/:country
 */
router.get('/edi/suppliers/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const crypto = require('crypto');
    const requestId = crypto.randomBytes(6).toString('hex');
    const startedAt = Date.now();
    
    // Mapping: SN -> senegal, TN -> tunisia
    let countryKey = country.toLowerCase();
    if (countryKey === 'sn') countryKey = 'senegal';
    if (countryKey === 'tn') countryKey = 'tunisia';

    // Get API URL
    const serverUrlBase = configService.getCountryApiUrl(countryKey);
    const serverUrl = `${serverUrlBase}/api/companies`;
    
    if (!serverUrl || serverUrl.includes('undefined')) {
      console.log(`[API Proxy][${requestId}] Invalid country code: ${country}`);
      return res.status(400).json({ 
        error: 'Invalid country code', 
        details: `No API URL configured for country: ${country}`
      });
    }

    console.log(`[API Proxy][${requestId}] 📡 GET /api/edi/suppliers/${country}`);
    console.log(`[API Proxy][${requestId}] 🌐 Forwarding to: ${serverUrl}`);

    const apiPin = configService.get('API_PIN') || '3311';

    const response = await axios.get(serverUrl, {
      headers: {
        'x-api-pin': apiPin,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    const durationMs = Date.now() - startedAt;
    console.log(`[API Proxy][${requestId}] ${response.status >= 400 ? '❌' : '✅'} Response: ${response.status} (${durationMs}ms)`);

    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }

    res.json(response.data);
    
  } catch (err) {
    console.error('[API Proxy] ❌ EDI suppliers error:', err.message);
    
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'EDI server unavailable', 
        details: 'Could not connect to the EDI server'
      });
    }
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ 
      error: 'Proxy error', 
      details: err.message 
    });
  }
});

/**
 * Route pour les produits EDI
 * GET /api/edi/products/:country?id_entite=123
 */
router.get('/edi/products/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const { id_entite } = req.query;
    const crypto = require('crypto');
    const requestId = crypto.randomBytes(6).toString('hex');
    const startedAt = Date.now();
    
    if (!id_entite) {
      return res.status(400).json({ 
        error: 'Missing id_entite parameter',
        details: 'id_entite is required to fetch products'
      });
    }
    
    // Mapping: SN -> senegal, TN -> tunisia
    let countryKey = country.toLowerCase();
    if (countryKey === 'sn') countryKey = 'senegal';
    if (countryKey === 'tn') countryKey = 'tunisia';

    const serverUrlBase = configService.getCountryApiUrl(countryKey);
    const serverUrl = `${serverUrlBase}/api/products`;
    
    if (!serverUrl || serverUrl.includes('undefined')) {
      console.log(`[API Proxy][${requestId}] Invalid country code: ${country}`);
      return res.status(400).json({ 
        error: 'Invalid country code', 
        details: `No API URL configured for country: ${country}`
      });
    }

    console.log(`[API Proxy][${requestId}] 📡 GET /api/edi/products/${country}`);
    console.log(`[API Proxy][${requestId}] 🌐 Forwarding to: ${serverUrl}?id_entite=${id_entite}`);

    const apiPin = configService.get('API_PIN') || '3311';

    const response = await axios.get(serverUrl, {
      params: { id_entite },
      headers: {
        'x-api-pin': apiPin,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    const durationMs = Date.now() - startedAt;
    console.log(`[API Proxy][${requestId}] ${response.status >= 400 ? '❌' : '✅'} Response: ${response.status} (${durationMs}ms)`);

    if (response.status >= 400) {
      return res.status(response.status).json(response.data);
    }

    res.json(response.data);
    
  } catch (err) {
    console.error('[API Proxy] ❌ EDI products error:', err.message);
    
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'EDI server unavailable', 
        details: 'Could not connect to the EDI server'
      });
    }
    
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    
    res.status(500).json({ 
      error: 'Proxy error', 
      details: err.message 
    });
  }
});

module.exports = router;
