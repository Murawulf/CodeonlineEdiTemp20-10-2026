const db = require('../config/db');
const axios = require('axios');
const https = require('https');

// Create an HTTPS agent that ignores SSL certificate errors (for Dev/Test environments)
const httpsAgent = new https.Agent({  
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined // Disable hostname verification
});

/**
 * Resolve the target URL for a given GLN
 * 1. Check database for exact GLN match
 * 2. Check database for prefix match (if applicable, though usually exact GLN is better for partners)
 * 3. Fallback to static rules (Legacy/Hardcoded) if needed
 */
async function resolveRoute(gln) {
  try {
    // 1. Exact Match
    const [rows] = await db.execute('SELECT target_url, country_code, name FROM partners WHERE gln = ? AND status = "ACTIVE"', [gln]);
    
    if (rows.length > 0) {
      return {
        url: rows[0].target_url,
        country: rows[0].country_code,
        name: rows[0].name,
        source: 'DATABASE'
      };
    }

    // 2. Prefix / Logic Fallback (if not in DB)
    // This maintains the "intelligence" even if DB is empty
    if (gln.startsWith('SN')) {
      return {
        url: 'https://dev.codeonline-edi.net/api/edi/receive',
        country: '686',
        name: 'Senegal Gateway',
        source: 'PREFIX_RULE'
      };
    } else if (gln.startsWith('619')) {
      return {
        url: 'https://edi-dev.codeonline-info.com/api/edi/receive',
        country: '788',
        name: 'Tunisia Gateway',
        source: 'PREFIX_RULE'
      };
    }

    return null;
  } catch (error) {
    console.error('[RoutingService] Error resolving route:', error);
    throw error;
  }
}

/**
 * Forward the EDI message to the target URL
 */
async function dispatchMessage(targetUrl, payload, headers = {}) {
  try {
    console.log(`[Dispatcher] Forwarding to ${targetUrl}...`);
    
    // Add API PIN for authentication with backend nodes
    const apiPin = process.env.API_PIN;
    const authHeaders = apiPin ? { 'x-api-pin': apiPin } : {};

    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Codeonline-EDI-Orchestrator/1.0',
        ...authHeaders,
        ...headers
      },
      httpsAgent: httpsAgent, // Use the custom agent to ignore SSL errors
      timeout: 30000 // 30s timeout
    });
    return response.data;
  } catch (error) {
    console.error(`[Dispatcher] Failed to forward to ${targetUrl}:`, error.message);
    throw error;
  }
}

module.exports = {
  resolveRoute,
  dispatchMessage
};
