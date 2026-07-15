/**
 * Test P3 — déclencheur auto IFTMIN depuis un DESADV (services/autoTransport.js).
 * Vérifie : création si transporteur présent, idempotence, skip si pas de transporteur.
 * Autonome : crée/nettoie ses propres données. Usage : node --test test/auto_transport.test.js (sur le hub).
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../config/db');
const { maybeCreateTransport } = require('../services/autoTransport');

let failures = 0;
function check(l, c, d) { if (c) console.log('  ✅ ' + l); else { failures++; console.error('  ❌ ' + l + (d ? ' — ' + d : '')); } }

async function main() {
  const TS = Date.now();
  const DES = `DESADV-AUTOTEST-${TS}`;
  const ORD = `ORD-AUTOTEST-${TS}`;
  const createdRefs = [];
  const withCarrier = {
    transport: { carrier: 'MOCKCARRIER', carrierName: 'Carrier X' },
    carrierParty: { code: 'MOCKCARRIER', name: 'Carrier X' },
    goodsItems: [{ packageCount: 3, description: 'Colis auto', sscc: null }],
  };
  const meta = { parsed: withCarrier, senderGln: '6191234567890', receiverGln: '6181234567890', orderRef: ORD, desadvRef: DES, countryCode: '788' };

  try {
    const r1 = await maybeCreateTransport(meta, db);
    if (r1 && r1.ref) createdRefs.push(r1.ref);
    check('création auto (transporteur présent)', r1.created === true && !!r1.ref, JSON.stringify(r1));

    const r2 = await maybeCreateTransport(meta, db);
    check('idempotent (rejeu → skipped exists)', r2.skipped === 'exists', JSON.stringify(r2));

    const r3 = await maybeCreateTransport(
      { ...meta, parsed: { transport: { carrier: null }, carrierParty: { code: null }, goodsItems: [] }, desadvRef: DES + '-NC', orderRef: ORD + '-NC' },
      db
    );
    check('sans transporteur → skipped no-carrier', r3.skipped === 'no-carrier', JSON.stringify(r3));

    const [rows] = await db.execute('SELECT COUNT(*) AS n FROM edi_transport_orders WHERE desadv_ref = ?', [DES]);
    check('exactement 1 transport pour le DESADV', Number(rows[0].n) === 1, 'n=' + rows[0].n);
  } finally {
    await db.execute('DELETE FROM edi_transport_orders WHERE desadv_ref LIKE ? OR order_ref LIKE ?', [`DESADV-AUTOTEST-${TS}%`, `ORD-AUTOTEST-${TS}%`]);
    if (createdRefs.length) {
      const ph = createdRefs.map(() => '?').join(',');
      await db.execute(`DELETE FROM transactions WHERE transaction_ref IN (${ph})`, createdRefs);
    }
    await db.execute('DELETE FROM transactions WHERE order_ref LIKE ?', [`ORD-AUTOTEST-${TS}%`]);
  }

  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
