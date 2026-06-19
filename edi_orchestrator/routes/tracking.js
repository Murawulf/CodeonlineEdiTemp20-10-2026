'use strict';

/**
 * routes/tracking.js
 *
 * Mobile Tracking API — all routes are protected by trackingAuth middleware.
 *
 * Base: /api/tracking
 *
 * Routes:
 *   GET /health                          Hub health + uptime (no auth required — optional open)
 *   GET /document-types                  EANCOM document type reference list
 *   GET /transactions                    List transactions (filters: gln, type, status, from, to, page, limit)
 *   GET /transactions/:ref               Single transaction by reference
 *   GET /transactions/:ref/history       Full status timeline for a transaction
 *   GET /stats                           Global statistics (filters: gln, from, to)
 *   GET /partners                        All EDI partners + transmission summary
 *   GET /partners/:gln/timeline          Chronological exchange history for a partner GLN
 *   GET /alerts                          Failed & stuck transactions needing attention
 *   GET /orders                           List all tracked orders (lifecycle status)
 *   GET /orders/:orderRef                 Full lifecycle detail for a single purchase order
 */

const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/trackingAuth');
const controller = require('../controllers/TrackingController');

// ── Public (no auth) ─────────────────────────────────────────────────────────
router.get('/health',         (req, res) => controller.getHealth(req, res));
router.get('/document-types', (req, res) => controller.getDocumentTypes(req, res));

// ── Protected (API key required) ─────────────────────────────────────────────
router.use(auth);

router.get('/transactions',              (req, res) => controller.listTransactions(req, res));
router.get('/transactions/:ref/history', (req, res) => controller.getTransactionHistory(req, res));
router.get('/transactions/:ref',         (req, res) => controller.getTransaction(req, res));

router.get('/stats',                     (req, res) => controller.getStats(req, res));

router.get('/partners',                  (req, res) => controller.listPartners(req, res));
router.get('/partners/:gln/timeline',    (req, res) => controller.getPartnerTimeline(req, res));

router.get('/alerts',                    (req, res) => controller.getAlerts(req, res));

router.get('/orders',                    (req, res) => controller.listOrders(req, res));
router.get('/orders/:orderRef',          (req, res) => controller.getOrderTracking(req, res));

module.exports = router;
