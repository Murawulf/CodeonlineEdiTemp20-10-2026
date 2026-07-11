/**
 * Test P3.2 — modèle edi_transport_orders : CRUD + machine à états.
 * Usage : node test/transport_order.test.js   (sur le hub)
 * Nettoie ses données (refs TESTTO-*).
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const model = require('../services/TransportOrderModel');
const db = require('../config/db');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const ref = `TESTTO-${Date.now()}`;

  console.log('1. Création');
  const created = await model.create({
    ref, order_ref: 'CMD-1', desadv_ref: 'DES-1',
    carrier_code: 'MOCK01', country_code: '384', requester_gln: '6181234567890',
    iftmin_content: "UNH+X+IFTMIN:D:01B:UN:EAN004'",
  });
  check('statut initial CREATED', created.status === 'CREATED', created.status);
  check('lecture par ref', (await model.getByRef(ref)).ref === ref);

  console.log('2. Transitions légales');
  check('CREATED→SENT_TO_CARRIER', (await model.transition(ref, 'SENT_TO_CARRIER', { tracking_number: 'TRK-1' })).status === 'SENT_TO_CARRIER');
  const afterTrk = await model.getByRef(ref);
  check('tracking_number stocké', afterTrk.tracking_number === 'TRK-1', afterTrk.tracking_number);
  check('SENT→IN_TRANSIT', (await model.transition(ref, 'IN_TRANSIT')).status === 'IN_TRANSIT');
  check('IN_TRANSIT→DELIVERED', (await model.transition(ref, 'DELIVERED')).status === 'DELIVERED');

  console.log('3. Transitions illégales rejetées');
  async function rejects(label, fn) {
    try { await fn(); failures++; console.error(`  ❌ ${label} — acceptée à tort`); }
    catch (e) { check(label, e.name === 'TransportStateError' || e.statusCode === 409 || e.statusCode === 404, e.message); }
  }
  await rejects('DELIVERED→IN_TRANSIT rejetée', () => model.transition(ref, 'IN_TRANSIT'));
  await rejects('DELIVERED→CREATED rejetée', () => model.transition(ref, 'CREATED'));
  await rejects('ref inconnue → 404', () => model.transition('TESTTO-INEXISTANT', 'FAILED'));

  const ref2 = `TESTTO-${Date.now()}-B`;
  await model.create({ ref: ref2, carrier_code: 'MOCK01', country_code: '788' });
  await rejects('CREATED→IN_TRANSIT rejetée (saut d\'étape)', () => model.transition(ref2, 'IN_TRANSIT'));
  check('CREATED→FAILED autorisée', (await model.transition(ref2, 'FAILED', { error_message: 'test' })).status === 'FAILED');

  console.log('4. Idempotence + liste');
  check('DELIVERED→DELIVERED idempotent', (await model.transition(ref, 'DELIVERED')).status === 'DELIVERED');
  const rows = await model.list({ carrier_code: 'MOCK01' });
  check('liste par transporteur ≥2', rows.length >= 2, `n=${rows.length}`);

  // Nettoyage
  await db.execute("DELETE FROM edi_transport_orders WHERE ref LIKE 'TESTTO-%'");
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
