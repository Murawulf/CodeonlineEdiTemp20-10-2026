/**
 * Patch P1.2b — corrige la chaîne APERAK côté nœud :
 *  A. eancom_parser.js : NAD+MS/NAD+MR remplissent buyer/supplier GLN pour APERAK
 *     (sinon validateParsedEANCOM rejette tout APERAK entrant → 400)
 *  B. eancom_parser.js : DOC+131:TYPE (forme colon, émise par le hub) parsé en
 *     referencedDocumentType (en plus de la forme DOC+131+TYPE)
 *  C. workers/edi_worker.js : table APERAK→DESADV corrigée edi_despatch_advices → edi_desadv
 *
 * Usage : node patch_p12b.js <dir_backend>
 * Idempotent.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('usage: node patch_p12b.js <backend_dir>'); process.exit(2); }

function patchFile(file, edits) {
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const { marker, from, to, label } of edits) {
    if (src.includes(marker)) { console.log(`SKIP ${label} (déjà appliqué)`); continue; }
    const parts = src.split(from);
    if (parts.length !== 2) {
      console.error(`ANCHOR_FAIL ${label}: ${parts.length - 1} occurrence(s) dans ${file}`);
      process.exit(1);
    }
    src = parts.join(to);
    changed = true;
    console.log(`OK ${label}`);
  }
  if (changed) fs.writeFileSync(file, src, 'utf8');
  return changed;
}

// ── A + B : parser ──
const parserFile = path.join(dir, 'eancom_parser.js');
patchFile(parserFile, [
  {
    label: 'A: NAD MS/MR → buyer/supplier (APERAK)',
    marker: 'P1.2b NAD-APERAK',
    from: `          else if (partyQualifier === 'MS') result.aperakSenderGln = partyGLN;
          else if (partyQualifier === 'MR') result.aperakReceiverGln = partyGLN;`,
    to: `          else if (partyQualifier === 'MS') { // P1.2b NAD-APERAK
            result.aperakSenderGln = partyGLN;
            if (result.messageType === 'APERAK' && !result.buyer.gln) result.buyer.gln = partyGLN;
          }
          else if (partyQualifier === 'MR') {
            result.aperakReceiverGln = partyGLN;
            if (result.messageType === 'APERAK' && !result.supplier.gln) result.supplier.gln = partyGLN;
          }`,
  },
  {
    label: 'B: DOC+131:TYPE (forme colon)',
    marker: 'P1.2b DOC-colon',
    from: `            const docQualifier = docSegParts[0];
            if (docQualifier === '131' && parts[2]) {
              result.referencedDocumentType = unescapeEancom(parts[2]);
            }`,
    to: `            const docQualifier = docSegParts[0];
            if (docQualifier === '131' && parts[2]) {
              result.referencedDocumentType = unescapeEancom(parts[2]);
            } else if (docQualifier === '131' && docSegParts[2]) { // P1.2b DOC-colon (DOC+131:TYPE)
              result.referencedDocumentType = unescapeEancom(docSegParts[2]);
            }`,
  },
]);

// ── C : worker ──
const workerFile = path.join(dir, 'workers', 'edi_worker.js');
patchFile(workerFile, [
  {
    label: 'C: table edi_desadv (APERAK→DESADV)',
    marker: "tableName = 'edi_desadv';",
    from: `      } else if (referencedType === 'DESADV') {
        tableName = 'edi_despatch_advices';
        refColumn = 'desadv_number';`,
    to: `      } else if (referencedType === 'DESADV') {
        tableName = 'edi_desadv';
        refColumn = 'desadv_number';`,
  },
]);

console.log('PATCH_P12B_DONE');
