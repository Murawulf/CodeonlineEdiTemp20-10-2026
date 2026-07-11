/**
 * Test P2.1 — API tracking : auth par clé, rôles, scope GLN, deliveries.
 * S'exécute SUR le hub : node test/tracking_auth.test.js
 * (lit les clés de test directement dans tracking_api_keys)
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const API = 'http://localhost:5010/api/tracking';
const CIV = '6181234567890', TUN = '6191234567890', SEN = 'SN02583102G3';

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failures++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}

async function get(path, key) {
  const res = await fetch(`${API}${path}`, { headers: key ? { 'X-Tracking-Api-Key': key } : {} });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [keys] = await db.execute("SELECT app_name, api_key, role FROM tracking_api_keys WHERE status='ACTIVE'");
  const keyOf = (name) => keys.find((k) => k.app_name === name)?.api_key;
  const K_INT = keyOf('tracking-app-internal');
  const K_CIV = keyOf('tracking-app-partner-civ');
  const K_CAR = keyOf('tracking-app-carrier-test');
  if (!K_INT || !K_CIV || !K_CAR) { console.error('Clés de test manquantes'); process.exit(1); }

  console.log('1. Auth');
  check('sans clé → 401', (await get('/transactions')).status === 401);
  check('clé invalide → 403', (await get('/transactions', 'trk_bogus')).status === 403);

  console.log('2. /me (identité clé)');
  const meInt = await get('/me', K_INT);
  const meCiv = await get('/me', K_CIV);
  check('internal role', meInt.body.data?.role === 'internal', JSON.stringify(meInt.body));
  check('partner role + scope CIV', meCiv.body.data?.role === 'partner' && meCiv.body.data?.scope_gln === CIV, JSON.stringify(meCiv.body));

  console.log('3. Scope transactions');
  const txInt = await get('/transactions?limit=100', K_INT);
  const txCiv = await get('/transactions?limit=100', K_CIV);
  check('internal 200', txInt.status === 200);
  check('partner 200', txCiv.status === 200);
  const intRows = txInt.body.data || [], civRows = txCiv.body.data || [];
  check('internal voit ≥1 transaction', intRows.length >= 1, `n=${intRows.length}`);
  check('partner ne voit QUE ses GLN', civRows.length > 0 && civRows.every((t) => t.sender_gln === CIV || t.receiver_gln === CIV), `n=${civRows.length}`);
  const tunSenVisible = civRows.some((t) => t.sender_gln === TUN && t.receiver_gln === SEN);
  check('TUN→SEN invisible pour partner CIV', !tunSenVisible);
  check('TUN→SEN visible pour internal', intRows.some((t) => t.sender_gln === TUN && t.receiver_gln === SEN));
  // le partner ne peut pas élargir via query param
  const txCivWide = await get(`/transactions?gln=${TUN}&limit=100`, K_CIV);
  check('override gln bloqué', (txCivWide.body.data || []).every((t) => t.sender_gln === CIV || t.receiver_gln === CIV));

  console.log('4. Endpoints réservés internal');
  check('partner /alerts → 403', (await get('/alerts', K_CIV)).status === 403);
  check('internal /alerts → 200', (await get('/alerts', K_INT)).status === 200);
  check('partner /partners → 403', (await get('/partners', K_CIV)).status === 403);
  check('internal /partners → 200', (await get('/partners', K_INT)).status === 200);

  console.log('5. Timeline partenaire');
  check('partner timeline autre GLN → 403', (await get(`/partners/${TUN}/timeline`, K_CIV)).status === 403);
  check('partner timeline propre GLN → 200', (await get(`/partners/${CIV}/timeline`, K_CIV)).status === 200);

  console.log('6. Accès transaction individuelle hors scope');
  const foreign = intRows.find((t) => t.sender_gln !== CIV && t.receiver_gln !== CIV);
  if (foreign) {
    check('tx étrangère → 404 pour partner', (await get(`/transactions/${foreign.transaction_ref}`, K_CIV)).status === 404);
  } else {
    check('tx étrangère → 404 pour partner', false, 'aucune tx étrangère en base pour tester');
  }

  console.log('7. Deliveries');
  const delInt = await get('/deliveries', K_INT);
  const delCiv = await get('/deliveries', K_CIV);
  check('internal deliveries 200', delInt.status === 200);
  const dRows = delCiv.body.data || [];
  check('partner deliveries scopées', delCiv.status === 200 && dRows.every((d) => d.sender_gln === CIV || d.receiver_gln === CIV), `n=${dRows.length}`);
  check('≥1 livraison ACKNOWLEDGED', dRows.some((d) => d.delivery_status === 'ACKNOWLEDGED'), JSON.stringify(dRows.map((d) => d.delivery_status)));
  check('desadv_number extrait', dRows.some((d) => d.desadv_number && d.desadv_number.startsWith('TESTUI')), JSON.stringify(dRows.map((d) => d.desadv_number)));

  console.log('8. Rôle carrier (scope GLN TUN)');
  const txCar = await get('/transactions?limit=50', K_CAR);
  check('carrier scopé TUN', txCar.status === 200 && (txCar.body.data || []).every((t) => t.sender_gln === TUN || t.receiver_gln === TUN));

  await db.end();
  console.log(failures === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${failures} ÉCHEC(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
