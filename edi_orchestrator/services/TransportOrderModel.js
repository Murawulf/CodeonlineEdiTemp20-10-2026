'use strict';

/**
 * TransportOrderModel (P3.2)
 *
 * Accès à `edi_transport_orders` (ordres de transport mutualisés sur le hub)
 * avec machine à états stricte :
 *
 *   CREATED → SENT_TO_CARRIER → ACCEPTED → IN_TRANSIT → DELIVERED
 *      │            │              │            │
 *      └────────────┴──────────────┴────────────┴──→ FAILED
 *   CREATED/SENT_TO_CARRIER → CANCELLED
 *
 * Toute transition illégale lève TransportStateError.
 */

const db = require('../config/db');

const STATUSES = ['CREATED', 'SENT_TO_CARRIER', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'];

const TRANSITIONS = {
  CREATED:         ['SENT_TO_CARRIER', 'FAILED', 'CANCELLED'],
  SENT_TO_CARRIER: ['ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
  ACCEPTED:        ['IN_TRANSIT', 'DELIVERED', 'FAILED'],
  IN_TRANSIT:      ['DELIVERED', 'FAILED'],
  DELIVERED:       [],
  FAILED:          [],
  CANCELLED:       [],
};

class TransportStateError extends Error {
  constructor(from, to) {
    super(`Illegal transport order transition: ${from} → ${to}`);
    this.name = 'TransportStateError';
    this.statusCode = 409;
  }
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

async function create({ ref, order_ref, desadv_ref, carrier_code, country_code, requester_gln, iftmin_content }) {
  if (!ref) throw new Error('ref is required');
  if (!carrier_code) throw new Error('carrier_code is required');
  if (!country_code) throw new Error('country_code is required');
  await db.execute(
    `INSERT INTO edi_transport_orders
       (ref, order_ref, desadv_ref, carrier_code, country_code, requester_gln, status, iftmin_content)
     VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?)`,
    [ref, order_ref || null, desadv_ref || null, carrier_code, country_code, requester_gln || null, iftmin_content || null]
  );
  return getByRef(ref);
}

async function getByRef(ref) {
  const [rows] = await db.execute('SELECT * FROM edi_transport_orders WHERE ref = ? LIMIT 1', [ref]);
  return rows[0] || null;
}

async function list({ carrier_code, status, gln, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  if (carrier_code) { conditions.push('carrier_code = ?'); params.push(carrier_code); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (gln) { conditions.push('requester_gln = ?'); params.push(gln); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.execute(
    `SELECT * FROM edi_transport_orders ${where} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );
  return rows;
}

/**
 * Transition de statut avec verrouillage optimiste sur le statut courant.
 * @param {string} ref
 * @param {string} newStatus
 * @param {Object} [extra] { tracking_number, carrier_response, error_message }
 */
async function transition(ref, newStatus, extra = {}) {
  if (!STATUSES.includes(newStatus)) throw new Error(`Unknown status: ${newStatus}`);
  const current = await getByRef(ref);
  if (!current) throw Object.assign(new Error(`Transport order not found: ${ref}`), { statusCode: 404 });
  if (current.status === newStatus) return current; // idempotent
  if (!canTransition(current.status, newStatus)) throw new TransportStateError(current.status, newStatus);

  const sets = ['status = ?'];
  const params = [newStatus];
  if (extra.tracking_number !== undefined) { sets.push('tracking_number = ?'); params.push(extra.tracking_number); }
  if (extra.carrier_response !== undefined) { sets.push('carrier_response = ?'); params.push(extra.carrier_response); }
  if (extra.error_message !== undefined) { sets.push('error_message = ?'); params.push(extra.error_message); }
  params.push(ref, current.status);

  const [res] = await db.execute(
    `UPDATE edi_transport_orders SET ${sets.join(', ')} WHERE ref = ? AND status = ?`,
    params
  );
  if (res.affectedRows === 0) {
    // Statut modifié concurremment — relire et re-vérifier
    const fresh = await getByRef(ref);
    if (fresh.status === newStatus) return fresh;
    throw new TransportStateError(fresh.status, newStatus);
  }
  return getByRef(ref);
}

module.exports = { create, getByRef, list, transition, canTransition, STATUSES, TRANSITIONS, TransportStateError };
