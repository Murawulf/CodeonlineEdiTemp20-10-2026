/**
 * Test P3.5 — route hub POST /api/orchestrator/transport/create + get + refresh.
 * Usage : node test/transport_route.test.js   (sur le hub)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const API = 'http://localhost:5010/api/orchestrator/transport';
const TOKEN = jwt.sign({ sub: 'system', role: 'service', instance: 'test' }, process.env.JWT_SECRET, { expiresIn: '10m' });

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function call(method, path, body, auth = true) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  const payload = {
    order_ref: 'TESTORD-P35',
    desadv_ref: 'TESTDES-P35',
    carrier_code: 'MOCK01',
    country_code: '384',
    requester_gln: '6181234567890',
    consignor: { gln: '6181234567890', name: 'Expediteur CIV' },
    consignee: { gln: '6191234567890', name: 'Destinataire TUN' },
    pickup: { gln: '6181234567890', date: '2026-07-15' },
    delivery: { gln: '6191234567890', date: '2026-07-20' },
    goods: [{ packageCount: 2, packageType: 'CT', description: 'Test P3.5', weight: 8, sscc: '361812345000000062' }],
    totalWeight: 8,
  };

  console.log('1. Auth');
  check('sans token → 401', (await call('POST', '/create', payload, false)).status === 401);

  console.log('2. Création bout-en-bout');
  const r = await call('POST', '/create', payload);
  check('HTTP 200 + success', r.status === 200 && r.body.success === true, `status=${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  check('trackingNumber présent', typeof r.body.trackingNumber === 'string' && r.body.trackingNumber.length > 5, r.body.trackingNumber);
  check('statut SENT_TO_CARRIER', r.body.status === 'SENT_TO_CARRIER', r.body.status);
  const ref = r.body.ref;

  const [rows] = await db.execute('SELECT * FROM edi_transport_orders WHERE ref = ?', [ref]);
  check('ligne edi_transport_orders', rows.length === 1);
  if (rows.length === 1) {
    check('IFTMIN stocké', (rows[0].iftmin_content || '').includes('IFTMIN:D:01B'), null);
    check('tracking en DB', rows[0].tracking_number === r.body.trackingNumber);
  }
  const [tx] = await db.execute("SELECT status FROM transactions WHERE transaction_ref = ? AND document_type='IFTMIN'", [ref]);
  check('transaction IFTMIN journalisée', tx.length === 1 && tx[0].status === 'DELIVERED', JSON.stringify(tx));

  console.log('3. GET + refresh');
  const g = await call('GET', `/${ref}`);
  check('GET détail', g.status === 200 && g.body.data.ref === ref);
  const rf = await call('POST', `/${ref}/refresh`);
  check('refresh 200', rf.status === 200, JSON.stringify(rf.body).slice(0, 150));
  check('statut normalisé après refresh', ['SENT_TO_CARRIER', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED'].includes(rf.body.data.status), rf.body.data.status);

  console.log('4. Erreurs propres');
  const bad = await call('POST', '/create', { ...payload, carrier_code: 'INCONNU' });
  check('transporteur inconnu → 404 + FAILED', bad.status === 404 && bad.body.status === 'FAILED', `status=${bad.status} ${JSON.stringify(bad.body).slice(0, 150)}`);
  if (bad.body.ref) {
    const [failRows] = await db.execute('SELECT status FROM edi_transport_orders WHERE ref = ?', [bad.body.ref]);
    check('ordre FAILED en DB', failRows.length === 1 && failRows[0].status === 'FAILED');
  }
  const incomplete = await call('POST', '/create', { carrier_code: 'MOCK01' });
  check('payload incomplet → 400', incomplete.status === 400, `status=${incomplete.status}`);

  // Nettoyage
  await db.execute("DELETE FROM edi_transport_orders WHERE order_ref = 'TESTORD-P35'");
  await db.execute("DELETE FROM transactions WHERE order_ref = 'TESTORD-P35' OR transaction_ref LIKE 'TO-%'");
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
