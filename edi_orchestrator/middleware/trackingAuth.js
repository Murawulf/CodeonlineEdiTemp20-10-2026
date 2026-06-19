'use strict';

/**
 * trackingAuth.js
 *
 * API-Key authentication middleware for the /api/tracking/* endpoints.
 *
 * The mobile app must send the key in one of:
 *   Header : X-Tracking-Api-Key: <key>
 *   Query  : ?api_key=<key>
 *
 * Keys are managed in two ways (priority order):
 *   1. Static master key from env TRACKING_API_KEY  (always valid)
 *   2. Per-app keys stored in DB table `tracking_api_keys`
 */

const db = require('../config/db');

// In-memory cache of DB keys to avoid a query on every request (TTL: 60 s)
let _keyCache = null;
let _keyCacheAt = 0;
const KEY_CACHE_TTL_MS = 60_000;

async function loadDbKeys() {
  const now = Date.now();
  if (_keyCache && now - _keyCacheAt < KEY_CACHE_TTL_MS) return _keyCache;

  try {
    const [rows] = await db.execute(
      "SELECT api_key, app_name, scope FROM tracking_api_keys WHERE status = 'ACTIVE'"
    );
    _keyCache = rows;
    _keyCacheAt = now;
    return rows;
  } catch {
    // Table may not exist yet — treat as empty list
    return [];
  }
}

async function trackingAuth(req, res, next) {
  const incomingKey =
    req.headers['x-tracking-api-key'] ||
    req.query.api_key ||
    null;

  if (!incomingKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing API key. Provide X-Tracking-Api-Key header or ?api_key= query param.',
    });
  }

  // 1. Master key (env)
  const masterKey = process.env.TRACKING_API_KEY;
  if (masterKey && incomingKey === masterKey) {
    req.trackingClient = { app_name: 'master', scope: 'full' };
    return next();
  }

  // 2. Per-app DB keys
  const dbKeys = await loadDbKeys();
  const match = dbKeys.find((k) => k.api_key === incomingKey);
  if (match) {
    req.trackingClient = { app_name: match.app_name, scope: match.scope };
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Invalid or revoked API key.',
  });
}

module.exports = trackingAuth;
