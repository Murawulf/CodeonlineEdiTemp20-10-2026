'use strict';

/**
 * trackingScope.js (P2.1)
 *
 * Applique le périmètre de données selon le rôle de la clé tracking :
 *   - internal : accès réseau complet (aucune restriction)
 *   - partner  : ne voit que les transactions où son scope_gln est émetteur/destinataire
 *   - carrier  : même restriction GLN (ses ordres de transport arrivent en P3)
 *
 * Doit être monté APRÈS trackingAuth (req.trackingClient requis).
 * Le filtrage s'appuie sur le paramètre `gln` déjà géré nativement par
 * TrackingController (listTransactions, getStats, listOrders…) — on le force
 * ici, et les endpoints à ressource unique vérifient req.scopeGln.
 */

function trackingScope(req, res, next) {
  const client = req.trackingClient || {};
  const role = client.role || 'partner';
  req.trackingRole = role;

  if (role === 'internal') {
    req.scopeGln = null;
    return next();
  }

  const scopeGln = client.scope_gln;
  if (!scopeGln) {
    return res.status(403).json({
      success: false,
      error: 'API key has no GLN scope configured. Contact the network administrator.',
    });
  }

  req.scopeGln = scopeGln;
  // Force le filtre : le client ne peut pas élargir son périmètre par query param
  req.query.gln = scopeGln;
  delete req.query.sender_gln;
  delete req.query.receiver_gln;
  return next();
}

/** Garde : endpoint réservé au rôle interne (monitoring réseau, alertes). */
function internalOnly(req, res, next) {
  const role = req.trackingRole || (req.trackingClient || {}).role;
  if (role === 'internal') return next();
  return res.status(403).json({
    success: false,
    error: 'This endpoint is reserved for the internal role.',
  });
}

module.exports = { trackingScope, internalOnly };
