/**
 * Test P1.2 — APERAK automatique au retour d'un DESADV.
 * 1. DESADV valide  → ACK envoyé au hub (log "ACK sent to orchestrator")
 * 2. DESADV invalide (sans numéro de document) → NACK envoyé au hub
 *
 * Usage : node test/aperak.test.js   (depuis /var/www/Edi-prod/backend)
 * Vérifie via le log pm2 out du process prod.
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateDesadvEANCOM } = require('../generateDesadvEANCOM');
const { serviceAuthHeaders } = require('../services/serviceAuth');

const API = process.env.TEST_API_BASE || 'http://localhost:5000';
const SENDER_GLN = '6191234567890'; // TUN — émetteur du DESADV, destinataire de l'APERAK
const RECEIVER_GLN = '6181234567890'; // CIV — nous
const PM2_LOG = process.env.TEST_PM2_LOG || '/var/www/Edi-prod/logs/pm2-out.log';

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postReceive(eancomContent, filename) {
  const res = await fetch(`${API}/api/edi/receive`, {
    method: 'POST',
    headers: serviceAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ eancomContent, filename, senderGln: SENDER_GLN })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function logSince(offset) {
  // slice sur Buffer : l'offset statSync est en octets (le log contient des émojis multi-octets)
  return fs.readFileSync(PM2_LOG).subarray(offset).toString('utf8');
}

async function main() {
  const ts = Date.now();
  const logOffset = fs.statSync(PM2_LOG).size;

  // --- Cas 1 : DESADV valide → ACK ---
  const ref1 = `TESTAPK${ts}`;
  const valid = generateDesadvEANCOM({
    desadvNumber: ref1,
    orderNumber: `TESTORD${ts}`,
    seller: { gln: SENDER_GLN }, buyer: { gln: RECEIVER_GLN },
    dateExpedition: new Date(),
    packages: [{ type: 'CT', sscc: '361912345000000022', weight: 5,
      items: [{ lineNumber: 1, gtin: '6191234500017', description: 'Test APERAK', quantity: 2 }] }]
  });

  console.log('Cas 1 : DESADV valide → ACK');
  const r1 = await postReceive(valid, `test_aperak_ok_${ts}.txt`);
  check('HTTP 200', r1.status === 200, `status=${r1.status}`);
  await sleep(8000);
  let logs = logSince(logOffset);
  check('log "ACK sent to orchestrator"', logs.includes(`ACK sent to orchestrator for doc "${ref1}"`), 'absent du log pm2');
  check('pas d\'échec notify', !logs.includes('APERAK ACK notify failed') && !logs.includes('Failed to send ACK to orchestrator'), 'échec notify présent');

  // --- Cas 2 : DESADV invalide (sans numéro doc) → NACK ---
  // BGM+351++9 : numéro de document vide → validation "Missing document number"
  const invalid = valid.replace(`BGM+351+${ref1}+9`, 'BGM+351++9');
  console.log('Cas 2 : DESADV invalide → NACK');
  const logOffset2 = fs.statSync(PM2_LOG).size;
  const r2 = await postReceive(invalid, `test_aperak_ko_${ts}.txt`);
  check('HTTP 400', r2.status === 400, `status=${r2.status} body=${JSON.stringify(r2.body)}`);
  await sleep(8000);
  logs = logSince(logOffset2);
  check('log NACK envoyé', logs.includes('ACK sent to orchestrator for doc "UNKNOWN" (NACK)'), 'absent du log pm2');

  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
