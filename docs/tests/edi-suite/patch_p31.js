/**
 * Patch P3.1 — eancom_parser.js : support IFTMIN (instruction de transport).
 *  A. Champs résultat IFTMIN (consignor/consignee/carrierParty/lieux/goodsItems/equipment/desadvReference)
 *  B. NAD+CZ/CN/CA
 *  C. LOC+9 (enlèvement) + LOC+7 (livraison) → champs dédiés
 *  D. RFF+DQ → desadvReference
 *  E. GID / EQD + SSCC via PCI+33E sous GID
 *  F. validateParsedEANCOM : règles IFTMIN (transporteur, lieu livraison, colis)
 * Usage : node patch_p31.js <eancom_parser.js> — idempotent.
 */
const fs = require('fs');
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

if (src.includes('P3.1 IFTMIN')) { console.log('ALREADY_PATCHED'); process.exit(0); }

function replaceOnce(from, to, label) {
  const parts = src.split(from);
  if (parts.length !== 2) { console.error(`ANCHOR_FAIL ${label}: ${parts.length - 1}`); process.exit(1); }
  src = parts[0] + to + parts[1];
  console.log(`OK ${label}`);
}

// ── A. Champs résultat ──
replaceOnce(
  `    items: [],
    packages: [],`,
  `    items: [],
    packages: [],
    // P3.1 IFTMIN — instruction de transport
    consignor: { gln: null, name: null },
    consignee: { gln: null, name: null },
    carrierParty: { code: null, name: null },
    placeOfLoading: null,
    placeOfDelivery: null,
    equipment: null,
    desadvReference: null,
    goodsItems: [],`,
  'A: champs résultat'
);

// Variable de contexte GID
replaceOnce(
  `  let currentPackage = null;
  let lastPciCode = null;`,
  `  let currentPackage = null;
  let lastPciCode = null;
  let currentGoodsItem = null; // P3.1 IFTMIN`,
  'A2: contexte GID'
);

// ── B. NAD CZ/CN/CA ──
replaceOnce(
  `          else if (partyQualifier === 'MS') { // P1.2b NAD-APERAK`,
  `          // P3.1 IFTMIN : CZ = expéditeur, CN = destinataire, CA = transporteur
          else if (partyQualifier === 'CZ') {
            result.consignor.gln = partyGLN;
            if (partyName) result.consignor.name = unescapeEancom(partyName);
            if (result.messageType === 'IFTMIN' && !result.supplier.gln) result.supplier.gln = partyGLN;
          }
          else if (partyQualifier === 'CN') {
            result.consignee.gln = partyGLN;
            if (partyName) result.consignee.name = unescapeEancom(partyName);
            if (result.messageType === 'IFTMIN' && !result.buyer.gln) result.buyer.gln = partyGLN;
          }
          else if (partyQualifier === 'CA') {
            result.carrierParty.code = partyGLN ? unescapeEancom(partyGLN) : null;
            if (partyName) result.carrierParty.name = unescapeEancom(partyName);
          }
          else if (partyQualifier === 'MS') { // P1.2b NAD-APERAK`,
  'B: NAD CZ/CN/CA'
);

// ── C. LOC 9/7 ──
replaceOnce(
  `          if (locQualifier === '1') result.deliveryPort = locValue; // Port of loading/unloading
          else if (locQualifier === '7') {`,
  `          if (locQualifier === '1') result.deliveryPort = locValue; // Port of loading/unloading
          else if (locQualifier === '9') { // P3.1 IFTMIN : lieu d'enlèvement/chargement
            result.placeOfLoading = locValue ? unescapeEancom(locValue.split(/(?<!\\?):/)[0]) : null;
          }
          else if (locQualifier === '7') {
            // P3.1 IFTMIN : lieu de livraison (champ dédié, en plus du flux ORDERS multi-livraison)
            result.placeOfDelivery = locValue ? unescapeEancom(locValue.split(/(?<!\\?):/)[0]) : null;`,
  'C: LOC 9/7'
);

// ── D. RFF+DQ ──
replaceOnce(
  `          else if (refQualifier === 'ON') result.orderReference = refValue; // Original Order Number`,
  `          else if (refQualifier === 'ON') result.orderReference = refValue; // Original Order Number
          else if (refQualifier === 'DQ') result.desadvReference = unescapeEancom(refValue); // P3.1 IFTMIN : réf DSADV`,
  'D: RFF+DQ'
);

// ── E. GID / EQD ──
replaceOnce(
  `        case 'CPS': // Consignment Packing Sequence (DESADV)`,
  `        case 'GID': { // P3.1 IFTMIN — Goods Item Details : GID+seq+count:type
          if (currentGoodsItem) result.goodsItems.push(currentGoodsItem);
          const gidCount = parts[2] ? parts[2].split(/(?<!\\?):/) : [];
          currentGoodsItem = {
            sequence: parseInt(parts[1]) || result.goodsItems.length + 1,
            packageCount: gidCount[0] ? parseInt(gidCount[0]) : null,
            packageType: gidCount[1] || null,
            description: null,
            weight: null,
            sscc: null,
          };
          break;
        }

        case 'EQD': // P3.1 IFTMIN — équipement de transport
          result.equipment = { type: parts[1] || null, id: parts[2] ? unescapeEancom(parts[2]) : null };
          break;

        case 'CPS': // Consignment Packing Sequence (DESADV)`,
  'E: GID/EQD'
);

// SSCC des marchandises IFTMIN : PCI+33E+<sscc> sous GID
replaceOnce(
  `        case 'PCI': // Package Identification
          // 33E = Marked with SSCC (Etiquetage), 36E = Marked with batch, 17 = Batch/lot at item level
          lastPciCode = parts[1] || null;
          break;`,
  `        case 'PCI': // Package Identification
          // 33E = Marked with SSCC (Etiquetage), 36E = Marked with batch, 17 = Batch/lot at item level
          lastPciCode = parts[1] || null;
          // P3.1 IFTMIN : PCI+33E+<sscc> directement sous GID
          if (currentGoodsItem && lastPciCode === '33E' && parts[2]) {
            currentGoodsItem.sscc = unescapeEancom(parts[2]);
          }
          break;`,
  'E2: PCI sous GID'
);

// MEA sous GID = poids de la marchandise courante
replaceOnce(
  `        case 'MEA': // Measurement
          {`,
  `        case 'MEA': // Measurement
          {
            // P3.1 IFTMIN : MEA sous GID = poids de la marchandise courante
            if (currentGoodsItem && parts[1] === 'WT' && parts[3]) {
              const gidMea = parts[3].split(/(?<!\\?):/);
              if (gidMea[1]) { currentGoodsItem.weight = parseFloat(gidMea[1]); break; }
            }`,
  'E3: MEA sous GID'
);

// Flush du dernier goods item en fin de parse (avant le return)
replaceOnce(
  `  // Push last item if exists`,
  `  // P3.1 IFTMIN : flush du dernier goods item
  if (currentGoodsItem) result.goodsItems.push(currentGoodsItem);

  // Push last item if exists`,
  'E4: flush goods item'
);

// ── F. Validation IFTMIN ──
replaceOnce(
  `  const errors = [];

  if (!parsedData.messageType) errors.push('Missing message type');
  if (!parsedData.documentNumber) errors.push('Missing document number');
  if (!parsedData.buyer.gln) errors.push('Missing buyer GLN');
  if (!parsedData.supplier.gln) errors.push('Missing supplier GLN');`,
  `  const errors = [];

  if (!parsedData.messageType) errors.push('Missing message type');
  if (!parsedData.documentNumber) errors.push('Missing document number');

  // P3.1 IFTMIN : règles dédiées (transporteur, lieux, colis)
  if (parsedData.messageType === 'IFTMIN') {
    if (!parsedData.consignor?.gln) errors.push('Missing consignor GLN');
    if (!parsedData.consignee?.gln) errors.push('Missing consignee GLN');
    if (!parsedData.carrierParty?.code && !parsedData.carrierParty?.name) errors.push('Missing carrier');
    if (!parsedData.placeOfDelivery) errors.push('Missing place of delivery');
    if (!parsedData.goodsItems || parsedData.goodsItems.length === 0) errors.push('No goods items found');
    return { valid: errors.length === 0, errors };
  }

  if (!parsedData.buyer.gln) errors.push('Missing buyer GLN');
  if (!parsedData.supplier.gln) errors.push('Missing supplier GLN');`,
  'F: validation IFTMIN'
);

fs.writeFileSync(file, src, 'utf8');
console.log('PATCH_P31_DONE');
