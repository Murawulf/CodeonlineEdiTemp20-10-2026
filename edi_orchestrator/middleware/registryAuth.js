'use strict';

/**
 * registryAuth.js
 *
 * Authentification interne pour les endpoints /api/registry/*.
 * Appelé UNIQUEMENT par des serveurs pays de confiance (jamais par le mobile).
 *
 * Clé attendue dans l'en-tête :
 *   x-registry-key: <clé>
 *
 * La clé maître provient de la variable d'environnement REGISTRY_API_KEY.
 */

function registryAuth(req, res, next) {
  const incomingKey = req.headers['x-registry-key'] || null;
  const masterKey = process.env.REGISTRY_API_KEY;

  if (!masterKey) {
    return res.status(503).json({
      success: false,
      error: 'Registry auth not configured (REGISTRY_API_KEY missing).',
    });
  }

  if (!incomingKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing registry key. Provide x-registry-key header.',
    });
  }

  if (incomingKey !== masterKey) {
    return res.status(403).json({ success: false, error: 'Invalid registry key.' });
  }

  return next();
}

module.exports = registryAuth;
