/**
 * Test P1.1 — Réception DESADV : persistance métier
 * Poste un DESADV généré par generateDesadvEANCOM sur /api/edi/receive
 * et vérifie les enregistrements edi_desadv / edi_desadv_lines / edi_packages.
 *
 * Usage : node test/desadv_receive.test.js
 * (s'exécute depuis /var/www/Edi-prod/backend, lit .env pour la DB)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');
const { generateDesadvEANCOM } = require('../generateDesadvEANCOM');
const { serviceAuthHeaders } = require('../services/serviceAuth');

const API = process.env.TEST_API_BASE || 'http://localhost:5000';
const SENDER_GLN = '6191234567890'; // TUN (émetteur du DESADV)
const RECEIVER_GLN = '6181234567890'; // CIV (récepteur local)

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function postReceive(eancomContent, filename) {
  const res = await fetch(`${API}/api/edi/receive`, {
    method: 'POST',
    headers: serviceAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ eancomContent, filename, senderGln: SENDER_GLN })
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

  // --- Cas 1 : DESADV complet (2 lignes dans 1 colis SSCC) ---
  const ref1 = `TESTDES${ts}`;
  const desadv1 = generateDesadvEANCOM({
    desadvNumber: ref1,
    orderNumber: `TESTORD${ts}`,
    seller: { gln: SENDER_GLN, name: 'TEST SUPPLIER TUN' },
    buyer: { gln: RECEIVER_GLN, name: 'TEST BUYER CIV' },
    dateExpedition: new Date(),
    dateDelivery: new Date(Date.now() + 3 * 86400000),
    totalWeight: 12.5,
    packages: [{
      type: 'CT', sscc: '361912345000000015', weight: 12.5,
      items: [
        { lineNumber: 1, gtin: '6191234500017', description: 'Produit test A', quantity: 10, orderedQuantity: 10, batchNumber: 'LOT-A1' },
        { lineNumber: 2, gtin: '6191234500024', description: 'Produit test B', quantity: 5, orderedQuantity: 6 }
      ]
    }]
  });

  console.log('Cas 1 : DESADV 2 lignes / 1 colis SSCC');
  const r1 = await postReceive(desadv1, `test_desadv_${ts}.txt`);
  check('HTTP 200', r1.status === 200, `status=${r1.status} body=${JSON.stringify(r1.body)}`);

  const [hdr] = await db.execute('SELECT * FROM edi_desadv WHERE desadv_number = ?', [ref1]);
  check('1 entête edi_desadv', hdr.length === 1, `count=${hdr.length}`);
  if (hdr.length === 1) {
    check('direction INBOUND', hdr[0].direction === 'INBOUND', hdr[0].direction);
    check('seller_gln = émetteur', hdr[0].seller_gln === SENDER_GLN, hdr[0].seller_gln);
    const id = hdr[0].id;
    const [pkgs] = await db.execute('SELECT * FROM edi_packages WHERE id_desadv = ?', [id]);
    check('1 colis edi_packages', pkgs.length === 1, `count=${pkgs.length}`);
    if (pkgs.length === 1) check('SSCC correct', pkgs[0].sscc === '361912345000000015', pkgs[0].sscc);
    const [lines] = await db.execute('SELECT * FROM edi_desadv_lines WHERE id_desadv = ?', [id]);
    check('2 lignes edi_desadv_lines', lines.length === 2, `count=${lines.length}`);
    if (lines.length === 2) {
      check('lignes rattachées au colis', lines.every(l => l.id_package === pkgs[0].id), JSON.stringify(lines.map(l => l.id_package)));
      const l1 = lines.find(l => l.line_number === 1);
      check('qty_dispatched ligne 1 = 10', l1 && Number(l1.qty_dispatched) === 10, l1 && l1.qty_dispatched);
    }
  }

  // --- Cas 2 : DESADV sans colis (items à plat, 0 package) ---
  const ref2 = `TESTDESNP${ts}`;
  const desadv2 = generateDesadvEANCOM({
    desadvNumber: ref2,
    orderNumber: `TESTORD${ts}`,
    seller: { gln: SENDER_GLN }, buyer: { gln: RECEIVER_GLN },
    dateExpedition: new Date(),
    items: [{ lineNumber: 1, gtin: '6191234500031', description: 'Produit vrac', quantity: 3 }]
  });

  console.log('Cas 2 : DESADV sans colis');
  const r2 = await postReceive(desadv2, `test_desadv_np_${ts}.txt`);
  check('HTTP 200', r2.status === 200, `status=${r2.status} body=${JSON.stringify(r2.body)}`);

  const [hdr2] = await db.execute('SELECT * FROM edi_desadv WHERE desadv_number = ?', [ref2]);
  check('1 entête edi_desadv', hdr2.length === 1, `count=${hdr2.length}`);
  if (hdr2.length === 1) {
    const [pkgs2] = await db.execute('SELECT * FROM edi_packages WHERE id_desadv = ?', [hdr2[0].id]);
    check('0 colis', pkgs2.length === 0, `count=${pkgs2.length}`);
    const [lines2] = await db.execute('SELECT * FROM edi_desadv_lines WHERE id_desadv = ?', [hdr2[0].id]);
    check('1 ligne à plat', lines2.length === 1, `count=${lines2.length}`);
  }

  // --- Vérif transmission ---
  const [tx] = await db.execute(
    "SELECT id, status FROM edi_transmissions WHERE document_type='DESADV' AND direction='INBOUND' AND filename LIKE ? ORDER BY id DESC",
    [`test_desadv_%${ts}%`]
  );
  check('2 transmissions INBOUND DESADV', tx.length === 2, `count=${tx.length}`);
  check('transmissions PROCESSED', tx.every(t => t.status === 'PROCESSED'), JSON.stringify(tx));

  await db.end();
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
