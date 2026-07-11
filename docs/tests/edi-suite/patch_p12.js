/**
 * Patch P1.2 — APERAK automatique pour DESADV entrant.
 * Insère dans server.js (route POST /api/edi/receive) :
 *  1. NACK (APERAK 314) vers le hub si un DESADV échoue la validation
 *  2. ACK  (APERAK 313) vers le hub après persistance réussie du DESADV
 * Réutilise ediWorker._notifyOrchestratorAck (même canal que ORDERS/INVOIC).
 *
 * Usage : node patch_p12.js /chemin/vers/server.js
 * Idempotent : refuse de patcher deux fois. Échoue si ancre absente/multiple.
 */
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node patch_p12.js <server.js>'); process.exit(2); }
let src = fs.readFileSync(file, 'utf8');

if (src.includes('P1.2 — APERAK DESADV')) {
  console.log('ALREADY_PATCHED');
  process.exit(0);
}

function matchOnce(re, label) {
  const matches = [...src.matchAll(re)];
  if (matches.length !== 1) {
    console.error(`ANCHOR_FAIL ${label}: ${matches.length} occurrence(s)`);
    process.exit(1);
  }
  return matches[0];
}

function insertBefore(re, insertion, label) {
  const m = matchOnce(re, label);
  src = src.slice(0, m.index) + insertion + src.slice(m.index);
}

function insertAfter(re, insertion, label) {
  const m = matchOnce(re, label);
  const end = m.index + m[0].length;
  src = src.slice(0, end) + insertion + src.slice(end);
}

// ── 1. NACK sur échec de validation (bloc commun, filtré DESADV) ──
const nackAnchor = /      return res\.status\(400\)\.json\(\{ ?\r?\n        error: 'Invalid EANCOM message', ?\r?\n        details: validation\.errors,\r?\n        transmissionId\r?\n      \}\);/g;

const nackBlock = `      // P1.2 — APERAK DESADV : validation échouée → NACK (le hub génère l'APERAK 314 vers l'émetteur)
      if (parsedData.messageType === 'DESADV' && ediWorker) {
        ediWorker._notifyOrchestratorAck({
          transmission_id: transmissionId,
          original_ref: parsedData.documentNumber || 'UNKNOWN',
          original_type: 'DESADV',
          sender_gln: parsedData.buyer?.gln,
          receiver_gln: parsedData.supplier?.gln,
          status: 'NACK',
          error_code: '18',
          error_text: validation.errors.join('; ').substring(0, 250),
        }).catch(err => console.log(\`[EDI RECEIVE] ⚠️ APERAK NACK notify failed: \${err.message}\`));
      }

`;
insertBefore(nackAnchor, nackBlock, 'NACK');

// ── 2. ACK après persistance DESADV réussie ──
const ackAnchor = /        console\.log\(`\[EDI RECEIVE\] Processed DESADV #\$\{desadvId\}`\);\r?\n        await updateEdiTransmissionStatus\(entiteDB, transmissionId, 'PROCESSED', null, null, desadvId\);/g;

const ackBlock = `

        // P1.2 — APERAK DESADV : persistance OK → ACK (le hub génère l'APERAK 313 vers l'émetteur)
        if (ediWorker) {
          ediWorker._notifyOrchestratorAck({
            transmission_id: transmissionId,
            original_ref: parsedData.documentNumber,
            original_type: 'DESADV',
            sender_gln: parsedData.buyer?.gln,
            receiver_gln: parsedData.supplier?.gln,
            status: 'ACK',
          }).catch(err => console.log(\`[EDI RECEIVE] ⚠️ APERAK ACK notify failed: \${err.message}\`));
        }`;
insertAfter(ackAnchor, ackBlock, 'ACK');

fs.writeFileSync(file, src, 'utf8');
console.log('PATCHED_OK');
