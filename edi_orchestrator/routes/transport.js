'use strict';

/**
 * routes/transport.js (P3.5) — ordres de transport IFTMIN.
 *
 * Base : /api/orchestrator/transport
 * Auth : JWT réseau (Bearer signé avec le JWT_SECRET partagé des nœuds).
 *
 *   POST /create        Créer un ordre de transport (IFTMIN + appel transporteur)
 *   GET  /              Lister (filtres carrier_code, status, gln)
 *   GET  /:ref          Détail
 *   POST /:ref/refresh  Poll transporteur → sync statut
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const controller = require('../controllers/TransportController');

const JWT_SECRET = process.env.JWT_SECRET;

/** Auth JWT réseau — même secret partagé que les nœuds (serviceAuth). */
function networkAuth(req, res, next) {
  if (!JWT_SECRET) {
    console.warn('[Transport] JWT_SECRET not configured — refusing all requests');
    return res.status(503).json({ success: false, error: 'Network auth not configured on hub' });
  }
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing Bearer token' });
  }
  try {
    req.networkClient = jwt.verify(header.slice(7), JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, error: `Invalid token: ${err.message}` });
  }
}

router.use(networkAuth);

router.post('/create', (req, res) => controller.create(req, res));
router.get('/', (req, res) => controller.listOrders(req, res));
router.get('/:ref', (req, res) => controller.get(req, res));
router.post('/:ref/refresh', (req, res) => controller.refresh(req, res));

module.exports = router;
