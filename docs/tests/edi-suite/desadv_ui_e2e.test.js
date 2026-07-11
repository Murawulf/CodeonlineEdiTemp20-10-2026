/**
 * Test P1.3/P1.4 — e2e envoi DSADV depuis payload UI (forme exacte Shipment.tsx)
 * 1. POST /api/edi/desadv/preview → EANCOM généré (200, contient BGM+351)
 * 2. POST /api/edi/desadv/send   → success, edi_desadv OUTBOUND + transmission
 * 3. Attente cycle réseau : TUN reçoit → APERAK 313 retour → worker CIV
 *    → edi_desadv.status = ACKNOWLEDGED (poll 180 s max)
 *
 * Usage : node test/desadv_ui_e2e.test.js   (depuis /var/www/Edi-prod/backend)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');
const { serviceAuthHeaders } = require('../services/serviceAuth');

const API = process.env.TEST_API_BASE || 'http://localhost:5000';
const SELLER_GLN = '6181234567890'; // CIV (nous, émetteur)
const BUYER_GLN = '6191234567890';  // TUN (destinataire)

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function post(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: serviceAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const ts = Date.now();
  const ref = `TESTUI${ts}`;

  // Payload : forme EXACTE produite par buildDesadvPayload() de Shipment.tsx
  const payload = {
    desadvNumber: ref,
    orderNumber: `TESTORDUI${ts}`,
    orderId: null,
    buyer: { gln: BUYER_GLN },
    seller: { gln: SELLER_GLN },
    delivery: { gln: BUYER_GLN },
    dateExpedition: new Date().toISOString().slice(0, 10),
    dateDelivery: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    transport: { carrier: 'TEST CARRIER', carrierName: 'TEST CARRIER', vehicle: 'AB-123-CD', mode: '30' },
    packages: [{
      sscc: '361812345000000031', type: 'CT', weight: 7.25, trackingNumber: null,
      items: [
        { lineNumber: 1, gtin: '6181234500011', description: 'Produit UI test A', quantity: 4, orderedQuantity: 4, batchNumber: 'LOTUI1', expiryDate: null },
        { lineNumber: 2, gtin: '6181234500028', description: 'Produit UI test B', quantity: 2, orderedQuantity: 3, batchNumber: null, expiryDate: null }
      ]
    }]
  };

  // --- 1. Preview ---
  console.log('1. Preview EANCOM');
  const p = await post('/api/edi/desadv/preview', payload);
  check('HTTP 200', p.status === 200, `status=${p.status} ${JSON.stringify(p.body).slice(0, 200)}`);
  check('EANCOM contient BGM+351+ref', (p.body.eancomContent || '').includes(`BGM+351+${ref}`));
  check('EANCOM contient SSCC', (p.body.eancomContent || '').includes('GIN+BJ+361812345000000031'));

  // Preview ne persiste rien
  const [pre] = await db.execute('SELECT id FROM edi_desadv WHERE desadv_number = ?', [ref]);
  check('preview sans persistance', pre.length === 0, `count=${pre.length}`);

  // --- 2. Send ---
  console.log('2. Send DESADV');
  const s = await post('/api/edi/desadv/send', payload);
  check('HTTP 200 + success', s.status === 200 && s.body.success === true, `status=${s.status} ${JSON.stringify(s.body).slice(0, 200)}`);

  const [hdr] = await db.execute('SELECT * FROM edi_desadv WHERE desadv_number = ?', [ref]);
  check('edi_desadv OUTBOUND créé', hdr.length === 1 && hdr[0].direction === 'OUTBOUND', JSON.stringify(hdr.map(h => h.direction)));
  const [tx] = await db.execute(
    "SELECT id, status FROM edi_transmissions WHERE document_type='DESADV' AND direction='OUTBOUND' AND file_content LIKE ? ORDER BY id DESC LIMIT 1",
    [`%${ref}%`]
  );
  check('transmission OUTBOUND créée', tx.length === 1, `count=${tx.length}`);

  // --- 3. Cycle réseau complet : attendre ACKNOWLEDGED ---
  console.log('3. Attente APERAK retour (TUN → hub → CIV, max 180 s)');
  let finalStatus = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const [rows] = await db.execute('SELECT status FROM edi_desadv WHERE desadv_number = ?', [ref]);
    finalStatus = rows[0] && rows[0].status;
    if (finalStatus === 'ACKNOWLEDGED') break;
    await sleep(10000);
    process.stdout.write(`   … statut=${finalStatus}\n`);
  }
  check('edi_desadv.status = ACKNOWLEDGED', finalStatus === 'ACKNOWLEDGED', `statut final=${finalStatus}`);

  if (tx.length === 1) {
    await sleep(3000);
    const [tx2] = await db.execute('SELECT status FROM edi_transmissions WHERE id = ?', [tx[0].id]);
    check('transmission OUTBOUND = ACKNOWLEDGED (P1.4)', tx2[0].status === 'ACKNOWLEDGED', `status=${tx2[0].status}`);
  }

  await db.end();
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
