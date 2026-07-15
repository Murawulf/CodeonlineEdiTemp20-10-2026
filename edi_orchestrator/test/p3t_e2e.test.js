/**
 * Test P3.T — scénario complet transport bout-en-bout (hub prod).
 * 1. Ordre de transport depuis un DESADV existant → 200, IFTMIN, SENT_TO_CARRIER, trackingNumber
 * 2. Round-trip IFTMIN (contenu stocké → parse → champs cohérents)
 * 3. getStatus adaptateur via /refresh → statut normalisé
 * 4. API tracking rôle carrier : ordre visible + maj statut → DELIVERED
 * 5. API tracking rôle partner : livraison montre transport DELIVERED + trackingNumber
 * Usage : node test/p3t_e2e.test.js  (sur le hub)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { parseEANCOM, validateParsedEANCOM } = require('../services/eancom_parser');

const HUB = 'http://localhost:5010';
const TOKEN = jwt.sign({ sub: 'system', role: 'service', instance: 'test' }, process.env.JWT_SECRET, { expiresIn: '10m' });

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${HUB}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  // Clés tracking réelles
  const [keys] = await db.execute("SELECT app_name, api_key FROM tracking_api_keys WHERE status='ACTIVE'");
  const K_CAR = keys.find((k) => k.app_name === 'tracking-app-carrier-test')?.api_key;
  const K_CIV = keys.find((k) => k.app_name === 'tracking-app-partner-civ')?.api_key;

  // P2.4 — fixture DESADV autonome : le test ne dépend plus d'un DESADV pré-existant.
  // receiver_gln = 6181234567890 (CIV) → visible par la clé partner-civ (scope_gln CIV).
  const FIX_TS = Date.now();
  const FIX_DESADV_REF = `DESADV-IFTTESTFIX-${FIX_TS}`;
  const FIX_ORDER_REF = `ORD-IFTTESTFIX-${FIX_TS}`;
  await db.execute(
    `INSERT INTO transactions (transaction_ref, sender_gln, receiver_gln, document_type, status, order_ref, payload_size, created_at, delivered_at)
     VALUES (?, '6191234567890', '6181234567890', 'DESADV', 'DELIVERED', ?, 0, NOW(), NOW())`,
    [FIX_DESADV_REF, FIX_ORDER_REF]
  );
  let ref = null;
  try {

  // DESADV existant (dernier DESADV du réseau, cycle P1/P2)
  const [desadvTx] = await db.execute(
    "SELECT transaction_ref, order_ref FROM transactions WHERE document_type='DESADV' ORDER BY id DESC LIMIT 1"
  );
  check('DESADV existant trouvé', desadvTx.length === 1, 'aucun DESADV dans transactions');
  const desadvRef = desadvTx.length ? (/^DESADV-(.+)-\d+$/.exec(desadvTx[0].transaction_ref)?.[1] || null) : null;
  const orderRef = desadvTx.length ? desadvTx[0].order_ref : null;
  check('réf DSADV extraite', !!desadvRef, JSON.stringify(desadvTx));

  // ── 1. Création ordre de transport ──
  console.log('1. POST /transport/create depuis le DSADV', desadvRef);
  const r = await api('POST', '/api/orchestrator/transport/create', {
    order_ref: orderRef,
    desadv_ref: desadvRef,
    carrier_code: 'MOCK01',
    country_code: '384',
    requester_gln: '6181234567890',
    consignor: { gln: '6181234567890', name: 'Cote Ivoire Hub' },
    consignee: { gln: '6191234567890', name: 'Tunisie Hub' },
    pickup: { gln: '6181234567890' },
    delivery: { gln: '6191234567890', date: '2026-07-20' },
    goods: [{ packageCount: 1, packageType: 'CT', description: 'Colis P3.T', weight: 7.25, sscc: '361812345000000079' }],
    totalWeight: 7.25,
  }, { Authorization: `Bearer ${TOKEN}` });
  check('200 + success', r.status === 200 && r.body.success === true, JSON.stringify(r.body).slice(0, 200));
  check('trackingNumber présent', !!r.body.trackingNumber, r.body.trackingNumber);
  check('SENT_TO_CARRIER', r.body.status === 'SENT_TO_CARRIER', r.body.status);
  ref = r.body.ref;

  const [row] = await db.execute('SELECT * FROM edi_transport_orders WHERE ref = ?', [ref]);
  check('CREATED→SENT_TO_CARRIER en DB', row.length === 1 && row[0].status === 'SENT_TO_CARRIER', row[0]?.status);

  // ── 2. Round-trip IFTMIN ──
  console.log('2. Round-trip IFTMIN stocké');
  const parsed = parseEANCOM(row[0].iftmin_content);
  const v = validateParsedEANCOM(parsed);
  check('IFTMIN valide', v.valid === true, JSON.stringify(v.errors));
  check('transporteur cohérent', parsed.carrierParty.code === 'MOCK01', JSON.stringify(parsed.carrierParty));
  check('lieux cohérents', parsed.placeOfLoading === '6181234567890' && parsed.placeOfDelivery === '6191234567890',
    `${parsed.placeOfLoading} / ${parsed.placeOfDelivery}`);
  check('colis cohérents', parsed.goodsItems.length === 1 && parsed.goodsItems[0].sscc === '361812345000000079', JSON.stringify(parsed.goodsItems));
  check('réf DSADV liée', parsed.desadvReference === desadvRef, parsed.desadvReference);

  // ── 3. getStatus via /refresh ──
  console.log('3. Refresh (adaptateur getStatus)');
  const rf = await api('POST', `/api/orchestrator/transport/${ref}/refresh`, null, { Authorization: `Bearer ${TOKEN}` });
  check('refresh 200 + statut normalisé', rf.status === 200 &&
    ['SENT_TO_CARRIER', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED'].includes(rf.body.data.status),
    JSON.stringify(rf.body).slice(0, 150));

  // ── 4. Rôle carrier : visible + maj statut ──
  console.log('4. API tracking — rôle transporteur');
  const listCar = await api('GET', '/api/tracking/transports', null, { 'X-Tracking-Api-Key': K_CAR });
  check('carrier voit son ordre', listCar.status === 200 && (listCar.body.data || []).some((t) => t.ref === ref),
    `n=${(listCar.body.data || []).length}`);

  // partner n'a pas accès aux transports
  const listPart = await api('GET', '/api/tracking/transports', null, { 'X-Tracking-Api-Key': K_CIV });
  check('partner /transports → 403', listPart.status === 403, `status=${listPart.status}`);

  // progression : IN_TRANSIT puis DELIVERED par le transporteur
  const up1 = await api('POST', `/api/tracking/transports/${ref}/status`, { status: 'IN_TRANSIT' }, { 'X-Tracking-Api-Key': K_CAR });
  check('carrier → IN_TRANSIT', up1.status === 200 && up1.body.data.status === 'IN_TRANSIT', JSON.stringify(up1.body).slice(0, 120));
  const up2 = await api('POST', `/api/tracking/transports/${ref}/status`, { status: 'DELIVERED' }, { 'X-Tracking-Api-Key': K_CAR });
  check('carrier → DELIVERED', up2.status === 200 && up2.body.data.status === 'DELIVERED', JSON.stringify(up2.body).slice(0, 120));
  const upBad = await api('POST', `/api/tracking/transports/${ref}/status`, { status: 'IN_TRANSIT' }, { 'X-Tracking-Api-Key': K_CAR });
  check('transition illégale refusée (DELIVERED→IN_TRANSIT)', upBad.status === 409, `status=${upBad.status}`);

  // ── 5. Rôle partner : livraison enrichie transport ──
  console.log('5. API tracking — rôle partenaire (deliveries)');
  const del = await api('GET', '/api/tracking/deliveries', null, { 'X-Tracking-Api-Key': K_CIV });
  const dRow = (del.body.data || []).find((d) => d.desadv_number === desadvRef);
  check('livraison trouvée', !!dRow, JSON.stringify((del.body.data || []).map((d) => d.desadv_number)));
  if (dRow) {
    check('transport rattaché', !!dRow.transport, JSON.stringify(dRow).slice(0, 200));
    check('statut transport DELIVERED', dRow.transport?.status === 'DELIVERED', dRow.transport?.status);
    check('trackingNumber exposé', !!dRow.transport?.tracking_number, JSON.stringify(dRow.transport));
  }

  } finally {
    // P2.4 — nettoyage fixture DESADV + ordre de transport créé (test autonome, 0 résidu)
    await db.execute('DELETE FROM transactions WHERE transaction_ref = ?', [FIX_DESADV_REF]);
    if (ref) {
      await db.execute('DELETE FROM edi_transport_orders WHERE ref = ?', [ref]);
      await db.execute('DELETE FROM transactions WHERE transaction_ref = ?', [ref]);
    }
  }

  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
