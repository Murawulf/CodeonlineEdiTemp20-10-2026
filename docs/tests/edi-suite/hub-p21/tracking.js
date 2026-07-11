'use strict';

/**
 * routes/tracking.js
 *
 * Mobile Tracking API — all routes are protected by trackingAuth middleware,
 * then scoped by role via trackingScope (P2.1) :
 *   internal → réseau complet ; partner/carrier → restreint à scope_gln.
 *
 * Base: /api/tracking
 *
 * Routes:
 *   GET /health                          Hub health + uptime (no auth required — optional open)
 *   GET /document-types                  EANCOM document type reference list
 *   GET /me                              Identité de la clé (rôle, scope) — pour le login mobile
 *   GET /transactions                    List transactions (filters: gln, type, status, from, to, page, limit)
 *   GET /transactions/:ref               Single transaction by reference
 *   GET /transactions/:ref/history       Full status timeline for a transaction
 *   GET /deliveries                      Suivi livraisons (DESADV + APERAK + transport) (P2.1)
 *   GET /stats                           Global statistics (filters: gln, from, to)
 *   GET /partners                        [internal] All EDI partners + transmission summary
 *   GET /partners/:gln/timeline          Exchange history for a partner GLN (partner: son GLN uniquement)
 *   GET /alerts                          [internal] Failed & stuck transactions needing attention
 *   GET /orders                          List all tracked orders (lifecycle status)
 *   GET /orders/:orderRef                Full lifecycle detail for a single purchase order
 */

const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/trackingAuth');
const { trackingScope, internalOnly } = require('../middleware/trackingScope');
const controller = require('../controllers/TrackingController');

// ── Public (no auth) ─────────────────────────────────────────────────────────
router.get('/health',         (req, res) => controller.getHealth(req, res));
router.get('/document-types', (req, res) => controller.getDocumentTypes(req, res));

// ── Protected (API key required) ─────────────────────────────────────────────
router.use(auth);
router.use(trackingScope);

// Identité de la clé — permet au mobile de récupérer rôle + scope au login
router.get('/me', (req, res) => res.json({
  success: true,
  data: {
    app_name:  req.trackingClient.app_name,
    role:      req.trackingClient.role,
    scope_gln: req.trackingClient.scope_gln,
  },
}));

router.get('/transactions',              (req, res) => controller.listTransactions(req, res));
router.get('/transactions/:ref/history', (req, res) => controller.getTransactionHistory(req, res));
router.get('/transactions/:ref',         (req, res) => controller.getTransaction(req, res));

router.get('/deliveries',                (req, res) => controller.listDeliveries(req, res));

router.get('/stats',                     (req, res) => controller.getStats(req, res));

router.get('/partners',                  internalOnly, (req, res) => controller.listPartners(req, res));
router.get('/partners/:gln/timeline',    (req, res) => controller.getPartnerTimeline(req, res));

router.get('/alerts',                    internalOnly, (req, res) => controller.getAlerts(req, res));

router.get('/orders',                    (req, res) => controller.listOrders(req, res));
router.get('/orders/:orderRef',          (req, res) => controller.getOrderTracking(req, res));

module.exports = router;
