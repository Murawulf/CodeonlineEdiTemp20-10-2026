/**
 * Test P3.1 — IFTMIN : génération → parsing round-trip + validation.
 * Usage : node test/iftmin.test.js   (depuis le dossier backend)
 */
const { generateIftminEANCOM } = require('../generateIftminEANCOM');
const { parseEANCOM, validateParsedEANCOM } = require('../eancom_parser');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

// ── 1. Round-trip complet ──
console.log('1. Round-trip générer → parser');
const data = {
  iftminNumber: 'TRANS-2026-001',
  orderNumber: 'CMD-42',
  desadvNumber: 'DES-42',
  consignor: { gln: '6181234567890', name: 'Expediteur CIV' },
  consignee: { gln: '6191234567890', name: 'Destinataire TUN' },
  carrier: { code: 'CARR01', name: 'Trans Afrique Express' },
  pickup: { gln: '6181234567890', date: '2026-07-15' },
  delivery: { gln: '6191234567890', date: '2026-07-20' },
  transportMode: '30',
  equipment: { type: 'TE', id: 'TRLR-889' },
  goods: [
    { packageCount: 2, packageType: 'CT', description: 'Cartons produits secs', weight: 12.5, sscc: '361812345000000048' },
    { packageCount: 1, packageType: 'PX', description: 'Palette boissons', weight: 240 },
  ],
  totalWeight: 252.5,
  freeText: 'Livraison sur rendez-vous',
};

const msg = generateIftminEANCOM(data);
check('message généré non vide', typeof msg === 'string' && msg.length > 100);
check('UNH IFTMIN', msg.includes('UNH+') && msg.includes('+IFTMIN:D:01B:UN:EAN004'));
check('BGM+610', msg.includes("BGM+610+TRANS-2026-001+9"));

const p = parseEANCOM(msg);
check('messageType=IFTMIN', p.messageType === 'IFTMIN', p.messageType);
check('documentNumber', p.documentNumber === 'TRANS-2026-001', p.documentNumber);
check('orderReference', p.orderReference === 'CMD-42', p.orderReference);
check('desadvReference', p.desadvReference === 'DES-42', p.desadvReference);
check('consignor GLN', p.consignor.gln === '6181234567890', JSON.stringify(p.consignor));
check('consignee GLN', p.consignee.gln === '6191234567890', JSON.stringify(p.consignee));
check('carrier code+nom', p.carrierParty.code === 'CARR01' && p.carrierParty.name === 'Trans Afrique Express', JSON.stringify(p.carrierParty));
check('TDT carrier', p.transport.carrier === 'CARR01', JSON.stringify(p.transport));
check('lieu enlèvement', p.placeOfLoading === '6181234567890', p.placeOfLoading);
check('lieu livraison', p.placeOfDelivery === '6191234567890', p.placeOfDelivery);
check('équipement', p.equipment && p.equipment.id === 'TRLR-889', JSON.stringify(p.equipment));
check('2 goods items', p.goodsItems.length === 2, `n=${p.goodsItems.length}`);
if (p.goodsItems.length === 2) {
  check('item1 2xCT + poids + SSCC', p.goodsItems[0].packageCount === 2 && p.goodsItems[0].packageType === 'CT' && p.goodsItems[0].weight === 12.5 && p.goodsItems[0].sscc === '361812345000000048', JSON.stringify(p.goodsItems[0]));
  check('item2 1xPX 240kg', p.goodsItems[1].packageCount === 1 && p.goodsItems[1].packageType === 'PX' && p.goodsItems[1].weight === 240, JSON.stringify(p.goodsItems[1]));
}

const v = validateParsedEANCOM(p);
check('validation OK', v.valid === true, JSON.stringify(v.errors));

// ── 2. Validation : rejets ──
console.log('2. Validation rejette IFTMIN incomplet');
const noDelivery = msg.replace(/LOC\+7\+[^']*'/, '');
const v2 = validateParsedEANCOM(parseEANCOM(noDelivery));
check('sans lieu de livraison → invalide', v2.valid === false && v2.errors.some(e => e.includes('place of delivery')), JSON.stringify(v2.errors));

const noCarrier = msg.replace(/NAD\+CA\+[^']*'/, '').replace(/TDT\+20[^']*'/, 'TDT+20++30');
const v3 = validateParsedEANCOM(parseEANCOM(noCarrier + "'"));
check('sans transporteur → invalide', v3.valid === false && v3.errors.some(e => e.includes('carrier')), JSON.stringify(v3.errors));

const noGoods = msg.replace(/GID\+[^']*'/g, '');
const v4 = validateParsedEANCOM(parseEANCOM(noGoods));
check('sans colis → invalide', v4.valid === false && v4.errors.some(e => e.includes('goods')), JSON.stringify(v4.errors));

// ── 3. Générateur : erreurs franches ──
console.log('3. Générateur exige les champs clés');
function throws(label, fn) {
  try { fn(); failures++; console.error(`  ❌ ${label} — pas d'erreur levée`); }
  catch { console.log(`  ✅ ${label}`); }
}
throws('sans carrier → throw', () => generateIftminEANCOM({ ...data, carrier: null }));
throws('sans delivery → throw', () => generateIftminEANCOM({ ...data, delivery: null }));
throws('sans goods → throw', () => generateIftminEANCOM({ ...data, goods: [] }));

// ── 4. Non-régression : un DESADV se parse toujours ──
console.log('4. Non-régression DESADV');
const { generateDesadvEANCOM } = require('../generateDesadvEANCOM');
const desadv = generateDesadvEANCOM({
  desadvNumber: 'NR-1', seller: { gln: '6181234567890' }, buyer: { gln: '6191234567890' },
  dateExpedition: new Date(),
  packages: [{ type: 'CT', sscc: '361812345000000055', items: [{ lineNumber: 1, gtin: '6181234500011', quantity: 1 }] }]
});
const pd = parseEANCOM(desadv);
const vd = validateParsedEANCOM(pd);
check('DESADV parse + valide', pd.messageType === 'DESADV' && vd.valid === true && pd.packages.length === 1, JSON.stringify({ t: pd.messageType, v: vd, pk: pd.packages.length }));

console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
