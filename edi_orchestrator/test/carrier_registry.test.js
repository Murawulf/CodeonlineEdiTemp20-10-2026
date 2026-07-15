/**
 * Test P3.3/P3.4 — registry adaptateurs transporteurs + adaptateur pilote MOCK01.
 * Usage : node test/carrier_registry.test.js   (sur le hub)
 */
const { resolve, listCarriers, CarrierResolutionError, ADAPTERS } = require('../services/carriers/registry');
const CarrierAdapter = require('../services/carriers/CarrierAdapter');
const { generateIftminEANCOM } = require('../services/generateIftminEANCOM');
const { parseEANCOM } = require('../services/eancom_parser');

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('1. Résolution par pays + code');
  const civ = resolve('384', 'MOCK01');
  check('384:MOCK01 résolu', civ instanceof CarrierAdapter, typeof civ);
  check('code adaptateur', civ.code === 'MOCK01');
  const tun = resolve('788', 'mock01');
  check('788:mock01 (casse insensible) résolu', tun && tun.code === 'MOCK01');
  check('cache : même instance', resolve('384', 'MOCK01') === civ);
  check('listCarriers ≥3', listCarriers().length >= 3, JSON.stringify(listCarriers()));

  console.log('2. Adaptateur inconnu → erreur claire');
  try {
    resolve('384', 'INCONNU');
    failures++; console.error('  ❌ aucun rejet');
  } catch (e) {
    check('CarrierResolutionError', e instanceof CarrierResolutionError, e.name);
    check('message explicite', e.message.includes('INCONNU') && e.message.includes('384'), e.message);
  }

  console.log('3. Isolation : un adaptateur cassé ne casse pas les autres');
  ADAPTERS['999:BROKEN'] = './fichier_inexistant.js';
  try {
    resolve('999', 'BROKEN');
    failures++; console.error('  ❌ chargement cassé accepté');
  } catch (e) {
    check('erreur isolée au module', e.message.includes('failed to load'), e.message);
  }
  check('MOCK01 fonctionne toujours après échec BROKEN', resolve('384', 'MOCK01').code === 'MOCK01');
  delete ADAPTERS['999:BROKEN'];

  console.log('4. Pilote MOCK01 : createShipment / getStatus');
  const iftmin = generateIftminEANCOM({
    iftminNumber: 'TESTREG-TO-1',
    consignor: { gln: '6181234567890' }, consignee: { gln: '6191234567890' },
    carrier: { code: 'MOCK01', name: 'Pilote' },
    delivery: { gln: '6191234567890' }, pickup: { gln: '6181234567890' },
    goods: [{ packageCount: 1, packageType: 'CT', weight: 3 }],
  });
  const parsed = parseEANCOM(iftmin);
  const shipment = await civ.createShipment(parsed, iftmin);
  check('trackingNumber non vide', typeof shipment.trackingNumber === 'string' && shipment.trackingNumber.length > 5, shipment.trackingNumber);
  check('statut initial normalisé', shipment.status === 'SENT_TO_CARRIER', shipment.status);

  const st = await civ.getStatus(shipment.trackingNumber);
  check('getStatus statut normalisé', CarrierAdapter.STATUSES.includes(st.status), st.status);

  const cancelled = await civ.cancel(shipment.trackingNumber);
  check('cancel accepté', cancelled.cancelled === true);
  check('statut FAILED après annulation', (await civ.getStatus(shipment.trackingNumber)).status === 'FAILED');

  console.log('5. IFTMIN invalide rejeté par l\'adaptateur');
  try {
    await civ.createShipment({ messageType: 'ORDERS' }, '');
    failures++; console.error('  ❌ accepté à tort');
  } catch (e) {
    check('rejet non-IFTMIN', e.message.includes('IFTMIN'), e.message);
  }

  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
