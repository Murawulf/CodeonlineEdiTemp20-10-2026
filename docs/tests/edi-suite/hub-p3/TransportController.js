'use strict';

/**
 * TransportController (P3.5) — orchestration des ordres de transport IFTMIN.
 *
 * POST /api/orchestrator/transport/create
 *   { order_ref?, desadv_ref?, carrier_code, country_code, requester_gln?,
 *     consignor:{gln,name?}, consignee:{gln,name?}, pickup?, delivery:{gln|address,date?},
 *     goods:[{packageCount,packageType,description?,weight?,sscc?}], transportMode?, totalWeight?, freeText? }
 *   → génère l'IFTMIN → edi_transport_orders CREATED → adaptateur.createShipment
 *   → SENT_TO_CARRIER + trackingNumber → journalise dans `transactions`.
 *
 * GET  /api/orchestrator/transport/:ref            → détail + statut
 * POST /api/orchestrator/transport/:ref/refresh    → poll adaptateur getStatus → transition
 */

const db = require('../config/db');
const model = require('../services/TransportOrderModel');
const { resolve, CarrierResolutionError } = require('../services/carriers/registry');
const { generateIftminEANCOM } = require('../services/generateIftminEANCOM');
const { parseEANCOM, validateParsedEANCOM } = require('../services/eancom_parser');

/** Journalise l'événement transport dans la table transactions (trace réseau). */
async function logTransaction(ref, senderGln, receiverGln, status, size, orderRef) {
  try {
    await db.execute(
      `INSERT INTO transactions
        (transaction_ref, sender_gln, receiver_gln, document_type, status, payload_size, transport_mode, order_ref, created_at, delivered_at)
       VALUES (?, ?, ?, 'IFTMIN', ?, ?, 'ORCHESTRATOR', ?, NOW(), ${status === 'DELIVERED' ? 'NOW()' : 'NULL'})`,
      [ref, senderGln || 'HUB', receiverGln || 'CARRIER', status, size || 0, orderRef || null]
    );
  } catch (err) {
    console.warn(`[Transport] Could not log transaction ${ref}: ${err.message}`);
  }
}

class TransportController {
  async create(req, res) {
    const b = req.body || {};
    try {
      // ── Validation d'entrée ──
      const missing = [];
      if (!b.carrier_code) missing.push('carrier_code');
      if (!b.country_code) missing.push('country_code');
      if (!b.consignor?.gln) missing.push('consignor.gln');
      if (!b.consignee?.gln) missing.push('consignee.gln');
      if (!b.delivery?.gln && !b.delivery?.address) missing.push('delivery');
      if (!Array.isArray(b.goods) || b.goods.length === 0) missing.push('goods');
      if (missing.length) {
        return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
      }

      const ref = b.ref || `TO-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

      // ── Génération IFTMIN ──
      const iftmin = generateIftminEANCOM({
        iftminNumber: ref,
        orderNumber: b.order_ref || null,
        desadvNumber: b.desadv_ref || null,
        consignor: b.consignor,
        consignee: b.consignee,
        carrier: { code: b.carrier_code, name: b.carrier_name || b.carrier_code },
        pickup: b.pickup || { gln: b.consignor.gln },
        delivery: b.delivery,
        transportMode: b.transportMode || '30',
        equipment: b.equipment || null,
        goods: b.goods,
        totalWeight: b.totalWeight || null,
        freeText: b.freeText || null,
      });

      const parsed = parseEANCOM(iftmin);
      const validation = validateParsedEANCOM(parsed);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: 'Generated IFTMIN failed validation', details: validation.errors });
      }

      // ── Enregistrement CREATED ──
      await model.create({
        ref,
        order_ref: b.order_ref || null,
        desadv_ref: b.desadv_ref || null,
        carrier_code: String(b.carrier_code).toUpperCase(),
        country_code: String(b.country_code),
        requester_gln: b.requester_gln || b.consignor.gln,
        iftmin_content: iftmin,
      });

      // ── Appel adaptateur (isolé : échec → FAILED, pas de 500 brut) ──
      let adapter;
      try {
        adapter = resolve(b.country_code, b.carrier_code);
      } catch (err) {
        await model.transition(ref, 'FAILED', { error_message: err.message });
        await logTransaction(ref, b.consignor.gln, b.carrier_code, 'FAILED', iftmin.length, b.order_ref);
        const code = err instanceof CarrierResolutionError ? 404 : 502;
        return res.status(code).json({ success: false, ref, status: 'FAILED', error: err.message });
      }

      try {
        const shipment = await adapter.createShipment(parsed, iftmin);
        const updated = await model.transition(ref, 'SENT_TO_CARRIER', {
          tracking_number: shipment.trackingNumber,
          carrier_response: JSON.stringify(shipment.raw || {}).slice(0, 2000),
        });
        await logTransaction(ref, b.consignor.gln, b.carrier_code, 'DELIVERED', iftmin.length, b.order_ref);
        return res.json({
          success: true,
          ref,
          status: updated.status,
          trackingNumber: shipment.trackingNumber,
          carrier: { code: adapter.code, name: adapter.name },
          iftmin_preview: iftmin.slice(0, 500),
        });
      } catch (err) {
        console.error(`[Transport] Carrier ${adapter.code} createShipment failed: ${err.message}`);
        await model.transition(ref, 'FAILED', { error_message: err.message });
        await logTransaction(ref, b.consignor.gln, b.carrier_code, 'FAILED', iftmin.length, b.order_ref);
        return res.status(502).json({ success: false, ref, status: 'FAILED', error: `Carrier call failed: ${err.message}` });
      }
    } catch (err) {
      console.error('[Transport] create error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async get(req, res) {
    try {
      const order = await model.getByRef(req.params.ref);
      if (!order) return res.status(404).json({ success: false, error: 'Transport order not found' });
      return res.json({ success: true, data: order });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  async listOrders(req, res) {
    try {
      const rows = await model.list({
        carrier_code: req.query.carrier_code,
        status: req.query.status,
        gln: req.query.gln,
        limit: Math.min(200, parseInt(req.query.limit || '100', 10)),
      });
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /** Poll l'adaptateur et synchronise le statut local. */
  async refresh(req, res) {
    try {
      const order = await model.getByRef(req.params.ref);
      if (!order) return res.status(404).json({ success: false, error: 'Transport order not found' });
      if (!order.tracking_number) {
        return res.status(409).json({ success: false, error: 'No tracking number (order not sent to carrier)' });
      }
      if (['DELIVERED', 'FAILED', 'CANCELLED'].includes(order.status)) {
        return res.json({ success: true, data: order, note: 'Terminal status — no refresh' });
      }

      let adapter;
      try {
        adapter = resolve(order.country_code, order.carrier_code);
      } catch (err) {
        return res.status(502).json({ success: false, error: err.message });
      }

      try {
        const st = await adapter.getStatus(order.tracking_number);
        let updated = order;
        if (st.status && st.status !== order.status && model.canTransition(order.status, st.status)) {
          updated = await model.transition(order.ref, st.status, {
            carrier_response: JSON.stringify(st.raw || {}).slice(0, 2000),
          });
        }
        return res.json({ success: true, data: updated, carrier_status: st.status });
      } catch (err) {
        return res.status(502).json({ success: false, error: `Carrier getStatus failed: ${err.message}` });
      }
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new TransportController();
