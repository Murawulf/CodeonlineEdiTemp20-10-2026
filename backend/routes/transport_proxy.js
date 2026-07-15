'use strict';

/**
 * transport_proxy.js (P4) — proxy backend-pays → hub PAESN pour les ordres de transport IFTMIN.
 *
 * Le frontend appelle /api/transport (ce proxy). Le proxy relaie vers le hub
 * /api/orchestrator/transport/* en ajoutant le JWT réseau (serviceAuthHeaders), qui
 * NE DOIT JAMAIS être exposé au navigateur. Le hub héberge la logique transport (IFTMIN,
 * adaptateur transporteur, statut). Voir edi_orchestrator/controllers/TransportController.js.
 */
const express = require('express');
const axios = require('axios');
const { serviceAuthHeaders } = require('../services/serviceAuth');

module.exports = function initTransportProxy() {
  const router = express.Router();
  const HUB = () => process.env.ORCHESTRATOR_URL || 'https://registry.codeonline-edi.net';
  const base = () => `${HUB()}/api/orchestrator/transport`;

  const relay = async (res, fn) => {
    try {
      const r = await fn();
      return res.status(r.status).json(r.data);
    } catch (e) {
      const status = (e.response && e.response.status) || 502;
      const data = (e.response && e.response.data) || { success: false, error: e.message };
      return res.status(status).json(data);
    }
  };

  // Liste des ordres de transport
  router.get('/', (req, res) =>
    relay(res, () => axios.get(base(), { headers: serviceAuthHeaders(), params: req.query, timeout: 15000 })));

  // Détail
  router.get('/:ref', (req, res) =>
    relay(res, () => axios.get(`${base()}/${encodeURIComponent(req.params.ref)}`, { headers: serviceAuthHeaders(), timeout: 15000 })));

  // Création d'un ordre de transport (génère l'IFTMIN + appel transporteur côté hub)
  router.post('/create', (req, res) =>
    relay(res, () => axios.post(`${base()}/create`, req.body, { headers: serviceAuthHeaders({ 'Content-Type': 'application/json' }), timeout: 20000 })));

  // Rafraîchir le statut (poll transporteur côté hub)
  router.post('/:ref/refresh', (req, res) =>
    relay(res, () => axios.post(`${base()}/${encodeURIComponent(req.params.ref)}/refresh`, {}, { headers: serviceAuthHeaders(), timeout: 15000 })));

  return router;
};
