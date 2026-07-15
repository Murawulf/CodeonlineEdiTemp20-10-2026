'use strict';

/**
 * autoTransport.js (P3) — déclencheur automatique d'ordre de transport IFTMIN.
 *
 * Appelé de façon NON BLOQUANTE (fire-and-forget) depuis HubController.relayMessage
 * à la réception d'un DESADV. Si le DESADV porte un transporteur (segment TDT ou NAD+CA)
 * et qu'aucun ordre de transport n'existe déjà pour ce desadv_ref / order_ref (idempotence),
 * crée un ordre via l'endpoint interne /api/orchestrator/transport/create.
 *
 * Mapping transporteur : tout transporteur présent → carrier_code = 'MOCK01' (seul adaptateur
 * simulé enregistré). Le vrai mapping GLN→transporteur viendra avec les vrais adaptateurs [FM-1].
 */
const jwt = require('jsonwebtoken');

async function maybeCreateTransport({ parsed, senderGln, receiverGln, orderRef, desadvRef, countryCode }, db) {
  const carrier = (parsed && ((parsed.transport && parsed.transport.carrier) || (parsed.carrierParty && parsed.carrierParty.code))) || null;
  if (!carrier) return { skipped: 'no-carrier' };
  if (!countryCode) return { skipped: 'no-country' };

  // Idempotence : un transport existe-t-il déjà pour ce DESADV ou cette commande ?
  const [ex] = await db.execute(
    `SELECT id FROM edi_transport_orders
     WHERE (desadv_ref IS NOT NULL AND desadv_ref = ?) OR (order_ref IS NOT NULL AND order_ref = ?)
     LIMIT 1`,
    [desadvRef || null, orderRef || null]
  );
  if (ex.length) return { skipped: 'exists' };

  const items = (parsed.goodsItems && parsed.goodsItems.length) ? parsed.goodsItems : [];
  const goods = items.length
    ? items.map((g) => ({ packageCount: g.packageCount || 1, packageType: 'CT', description: g.description || 'Auto DESADV', sscc: g.sscc || undefined }))
    : [{ packageCount: 1, packageType: 'CT', description: 'Auto DESADV' }];

  const body = {
    order_ref: orderRef || null,
    desadv_ref: desadvRef || null,
    carrier_code: 'MOCK01',
    country_code: String(countryCode),
    requester_gln: senderGln,
    consignor: { gln: senderGln },
    consignee: { gln: receiverGln },
    pickup: { gln: senderGln },
    delivery: { gln: receiverGln },
    goods,
  };

  const token = jwt.sign({ sub: 'auto-transport', role: 'service' }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const port = process.env.PORT || 5010;
  const res = await fetch(`http://localhost:${port}/api/orchestrator/transport/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { created: j.success === true, ref: j.ref || null, status: j.status || null };
}

module.exports = { maybeCreateTransport };
