/**
 * Patch P1.T — les dispatchs directs vers le hub (desadv/send, invoic/send)
 * envoient désormais messageType + transactionRef + orderRef, pour que le hub
 * journalise document_type=DESADV/INVOIC (et non UNKNOWN) dans transactions.
 * Usage : node patch_p1t.js <server.js> — idempotent.
 */
const fs = require('fs');
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

if (src.includes('P1.T — messageType dispatch')) { console.log('ALREADY_PATCHED'); process.exit(0); }

const oldPayload = `        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: eancomContent,
          filename: filename,
          partnerGln: data.buyer.gln,
          senderGln: data.seller.gln
        }, {`;

function patchSection(marker, insertion, label) {
  const idx = src.indexOf(marker);
  if (idx === -1) { console.error(`MARKER_FAIL ${label}`); process.exit(1); }
  const payloadIdx = src.indexOf(oldPayload, idx);
  if (payloadIdx === -1) { console.error(`PAYLOAD_FAIL ${label}`); process.exit(1); }
  src = src.slice(0, payloadIdx) + insertion + src.slice(payloadIdx + oldPayload.length);
  console.log(`OK ${label}`);
}

patchSection(
  '[DESADV SEND]',
  `        // P1.T — messageType dispatch : le hub journalise le bon document_type
        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: eancomContent,
          filename: filename,
          partnerGln: data.buyer.gln,
          senderGln: data.seller.gln,
          receiverGln: data.buyer.gln,
          messageType: 'DESADV',
          transactionRef: \`DESADV-\${data.desadvNumber}-\${Date.now()}\`,
          orderRef: data.orderNumber || null
        }, {`,
  'DESADV'
);

patchSection(
  '[INVOIC SEND]',
  `        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: eancomContent,
          filename: filename,
          partnerGln: data.buyer.gln,
          senderGln: data.seller.gln,
          receiverGln: data.buyer.gln,
          messageType: 'INVOIC',
          transactionRef: \`INVOIC-\${data.invoiceNumber}-\${Date.now()}\`,
          orderRef: data.orderNumber || null
        }, {`,
  'INVOIC'
);

fs.writeFileSync(file, src, 'utf8');
console.log('PATCHED_OK');
