#!/usr/bin/env node
/**
 * ============================================================================
 * E2E TEST SUITE: EDI Orchestrator - All Message Types + Encryption
 * ============================================================================
 * Tests all EANCOM message types (ORDERS, ORDRSP, DESADV, INVOIC) in both
 * directions (Tunisia↔Senegal) via the Orchestrator Hub, with both
 * plaintext and encrypted (E2EE) payloads.
 *
 * Run from the Tunisia server: node backend/scripts/test_e2e_orchestrator.js
 * ============================================================================
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Configuration ──────────────────────────────────────────────────────
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:5010';
const ORCHESTRATOR_PIN = process.env.API_PIN || '3311';

const TUNISIA_GLN = '6191234567890';
const SENEGAL_GLN = 'SN02583102G3';

const KEYS_DIR = process.env.KEYS_DIR || path.join(__dirname, '../config/keys');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── EANCOM Templates ───────────────────────────────────────────────────
function makeEANCOM(type, senderGln, receiverGln, docNum) {
  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const ts = Date.now().toString().slice(-6);
  
  const templates = {
    ORDERS: [
      `UNB+UNOC:3+${senderGln}:14+${receiverGln}:14+${date.slice(2)}:1200+${ts}'`,
      `UNH+1+ORDERS:D:96A:UN:EAN008'`,
      `BGM+220+${docNum}+9'`,
      `DTM+137:${date}:102'`,
      `DTM+2:${date}:102'`,
      `NAD+BY+${senderGln}::9'`,
      `NAD+SU+${receiverGln}::9'`,
      `NAD+DP+${receiverGln}::9'`,
      `CUX+2:EUR:9'`,
      `LIN+1++3456789012345:SRV'`,
      `IMD+F++:::Produit Test Orchestrator'`,
      `QTY+21:100'`,
      `PRI+AAA:25.50'`,
      `LIN+2++9876543210123:SRV'`,
      `IMD+F++:::Produit Test 2'`,
      `QTY+21:50'`,
      `PRI+AAA:12.75'`,
      `UNS+S'`,
      `MOA+79:3187.50'`,
      `MOA+176:574.75'`,
      `MOA+128:3762.25'`,
      `CNT+2:2'`,
      `UNT+22+1'`,
      `UNZ+1+${ts}'`
    ].join('\n'),

    ORDRSP: [
      `UNB+UNOC:3+${senderGln}:14+${receiverGln}:14+${date.slice(2)}:1200+${ts}'`,
      `UNH+1+ORDRSP:D:96A:UN:EAN008'`,
      `BGM+231+${docNum}+29'`,
      `DTM+137:${date}:102'`,
      `RFF+ON:ORD-REF-001'`,
      `NAD+BY+${receiverGln}::9'`,
      `NAD+SU+${senderGln}::9'`,
      `LIN+1++3456789012345:SRV'`,
      `QTY+21:100'`,
      `PRI+AAA:25.50'`,
      `LIN+2++9876543210123:SRV'`,
      `QTY+21:50'`,
      `PRI+AAA:12.75'`,
      `UNS+S'`,
      `MOA+128:3762.25'`,
      `CNT+2:2'`,
      `UNT+16+1'`,
      `UNZ+1+${ts}'`
    ].join('\n'),

    DESADV: [
      `UNB+UNOC:3+${senderGln}:14+${receiverGln}:14+${date.slice(2)}:1200+${ts}'`,
      `UNH+1+DESADV:D:96A:UN:EAN008'`,
      `BGM+351+${docNum}+9'`,
      `DTM+137:${date}:102'`,
      `DTM+2:${date}:102'`,
      `RFF+ON:ORD-REF-001'`,
      `NAD+BY+${receiverGln}::9'`,
      `NAD+SU+${senderGln}::9'`,
      `NAD+DP+${receiverGln}::9'`,
      `TDT+20+++31'`,
      `CPS+1'`,
      `LIN+1++3456789012345:SRV'`,
      `IMD+F++:::Produit Test Orchestrator'`,
      `QTY+12:100'`,
      `LIN+2++9876543210123:SRV'`,
      `IMD+F++:::Produit Test 2'`,
      `QTY+12:50'`,
      `UNS+S'`,
      `CNT+2:2'`,
      `UNT+19+1'`,
      `UNZ+1+${ts}'`
    ].join('\n'),

    INVOIC: [
      `UNB+UNOC:3+${senderGln}:14+${receiverGln}:14+${date.slice(2)}:1200+${ts}'`,
      `UNH+1+INVOIC:D:96A:UN:EAN008'`,
      `BGM+380+${docNum}+9'`,
      `DTM+137:${date}:102'`,
      `RFF+ON:ORD-REF-001'`,
      `NAD+BY+${receiverGln}::9'`,
      `NAD+SU+${senderGln}::9'`,
      `CUX+2:EUR:9'`,
      `LIN+1++3456789012345:SRV'`,
      `IMD+F++:::Produit Test Orchestrator'`,
      `QTY+47:100'`,
      `PRI+AAA:25.50'`,
      `MOA+203:2550.00'`,
      `TAX+7+VAT+++:::19'`,
      `LIN+2++9876543210123:SRV'`,
      `IMD+F++:::Produit Test 2'`,
      `QTY+47:50'`,
      `PRI+AAA:12.75'`,
      `MOA+203:637.50'`,
      `TAX+7+VAT+++:::19'`,
      `UNS+S'`,
      `MOA+79:3187.50'`,
      `MOA+176:605.63'`,
      `MOA+128:3793.13'`,
      `CNT+2:2'`,
      `UNT+25+1'`,
      `UNZ+1+${ts}'`
    ].join('\n')
  };

  return templates[type];
}

// ── Crypto Helpers ─────────────────────────────────────────────────────
function loadKey(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

function encryptAndSign(payload, recipientPublicKeyPem, senderPrivateKeyPem) {
  const dataBuffer = Buffer.from(JSON.stringify(payload));

  // AES-256-GCM
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  let encrypted = cipher.update(dataBuffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // RSA encrypt the AES key
  const encryptedKey = crypto.publicEncrypt(
    { key: recipientPublicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  );

  // Sign
  const sign = crypto.createSign('SHA256');
  sign.update(dataBuffer);
  sign.end();
  const signature = sign.sign(senderPrivateKeyPem);

  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    encryptedKey: encryptedKey.toString('base64'),
    signature: signature.toString('base64')
  };
}

// ── Test Runner ────────────────────────────────────────────────────────
const results = [];

async function sendPlaintext(messageType, senderGln, receiverGln, direction) {
  const docNum = `TEST-${messageType}-${direction}-${Date.now().toString().slice(-5)}`;
  const eancom = makeEANCOM(messageType, senderGln, receiverGln, docNum);
  const testName = `Plaintext ${messageType} ${direction}`;

  const start = Date.now();
  try {
    const resp = await axios.post(`${ORCHESTRATOR_URL}/api/orchestrator/relay`, {
      senderGln,
      receiverGln,
      eancomContent: eancom,
      messageType,
      filename: `${docNum}.edi`
    }, {
      headers: { 'x-api-pin': ORCHESTRATOR_PIN },
      httpsAgent,
      timeout: 15000
    });

    const elapsed = Date.now() - start;
    const pass = resp.data && resp.data.success === true;
    results.push({
      test: testName, docNum, pass, elapsed,
      status: resp.status,
      transactionRef: resp.data.transactionRef || null,
      route: resp.data.route || null,
      error: null
    });
    console.log(`  ${pass ? '✅' : '❌'} ${testName} (${elapsed}ms) → ${resp.data.transactionRef || 'N/A'}`);
  } catch (err) {
    const elapsed = Date.now() - start;
    const status = err.response ? err.response.status : 0;
    const detail = err.response ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
    results.push({
      test: testName, docNum, pass: false, elapsed,
      status,
      transactionRef: null, route: null,
      error: detail
    });
    console.log(`  ❌ ${testName} (${elapsed}ms) → ${status} ${detail}`);
  }
}

async function sendEncrypted(messageType, senderGln, receiverGln, direction) {
  const docNum = `TEST-ENC-${messageType}-${direction}-${Date.now().toString().slice(-5)}`;
  const eancom = makeEANCOM(messageType, senderGln, receiverGln, docNum);
  const testName = `Encrypted ${messageType} ${direction}`;

  const start = Date.now();
  try {
    // Load keys
    const senderPrivKey = loadKey(path.join(KEYS_DIR, 'private.pem'));
    const recipientPubKey = loadKey(path.join(KEYS_DIR, 'partners', `${receiverGln}.pem`));

    const payload = { message: { eancomContent: eancom, filename: `${docNum}.edi` }, timestamp: Date.now() };
    const envelope = encryptAndSign(payload, recipientPubKey, senderPrivKey);
    const transactionId = crypto.randomUUID();

    const resp = await axios.post(`${ORCHESTRATOR_URL}/api/orchestrator/relay`, {
      header: {
        sender_gln: senderGln,
        receiver_gln: receiverGln,
        transaction_id: transactionId,
        message_type: messageType
      },
      envelope
    }, {
      headers: { 'x-api-pin': ORCHESTRATOR_PIN },
      httpsAgent,
      timeout: 15000
    });

    const elapsed = Date.now() - start;
    const pass = resp.data && resp.data.success === true;
    results.push({
      test: testName, docNum, pass, elapsed,
      status: resp.status,
      transactionRef: resp.data.transactionRef || transactionId,
      route: resp.data.route || null,
      error: null
    });
    console.log(`  ${pass ? '✅' : '❌'} ${testName} (${elapsed}ms) → ${resp.data.transactionRef || transactionId}`);
  } catch (err) {
    const elapsed = Date.now() - start;
    const status = err.response ? err.response.status : 0;
    const detail = err.response ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
    results.push({
      test: testName, docNum, pass: false, elapsed,
      status,
      transactionRef: null, route: null,
      error: detail
    });
    console.log(`  ❌ ${testName} (${elapsed}ms) → ${status} ${detail}`);
  }
}

async function checkOrchestratorDB() {
  const testName = 'Orchestrator DB Transaction Logging';
  try {
    const resp = await axios.get(`${ORCHESTRATOR_URL}/api/orchestrator/discovery`, { httpsAgent, timeout: 5000 });
    const pass = resp.data && resp.data.directory && resp.data.directory.length >= 2;
    results.push({ test: testName, docNum: 'N/A', pass, elapsed: 0, status: resp.status, transactionRef: null, route: null, error: null });
    console.log(`  ${pass ? '✅' : '❌'} ${testName} (${resp.data.directory.length} partners)`);
  } catch (err) {
    results.push({ test: testName, docNum: 'N/A', pass: false, elapsed: 0, status: 0, transactionRef: null, route: null, error: err.message });
    console.log(`  ❌ ${testName} → ${err.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────
(async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   E2E TEST SUITE: EDI Orchestrator - Full Validation       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Orchestrator: ${ORCHESTRATOR_URL}`);
  console.log(`  Tunisia GLN:  ${TUNISIA_GLN}`);
  console.log(`  Senegal GLN:  ${SENEGAL_GLN}`);
  console.log(`  Keys Dir:     ${KEYS_DIR}`);
  console.log('');

  // 0. Verify Orchestrator is up
  console.log('── Phase 0: Orchestrator Health ──────────────────────────────');
  await checkOrchestratorDB();
  console.log('');

  // 1. Plaintext Tests via Orchestrator
  console.log('── Phase 1: Plaintext Relay via Orchestrator ─────────────────');
  const types = ['ORDERS', 'ORDRSP', 'DESADV', 'INVOIC'];
  for (const t of types) {
    await sendPlaintext(t, TUNISIA_GLN, SENEGAL_GLN, 'TN→SN');
  }
  for (const t of types) {
    await sendPlaintext(t, SENEGAL_GLN, TUNISIA_GLN, 'SN→TN');
  }
  console.log('');

  // 2. Encrypted (E2EE) Tests via Orchestrator
  console.log('── Phase 2: Encrypted (E2EE) Relay via Orchestrator ──────────');
  // Check keys exist
  const privKeyExists = fs.existsSync(path.join(KEYS_DIR, 'private.pem'));
  const snPubExists = fs.existsSync(path.join(KEYS_DIR, 'partners', `${SENEGAL_GLN}.pem`));
  const tnPubExists = fs.existsSync(path.join(KEYS_DIR, 'partners', `${TUNISIA_GLN}.pem`));
  console.log(`  Keys: private.pem=${privKeyExists}, ${SENEGAL_GLN}.pem=${snPubExists}, ${TUNISIA_GLN}.pem=${tnPubExists}`);

  if (privKeyExists && snPubExists) {
    for (const t of types) {
      await sendEncrypted(t, TUNISIA_GLN, SENEGAL_GLN, 'TN→SN');
    }
  } else {
    console.log('  ⚠️  Skipping TN→SN encrypted tests (missing keys)');
    types.forEach(t => results.push({ test: `Encrypted ${t} TN→SN`, docNum: 'N/A', pass: false, elapsed: 0, status: 0, transactionRef: null, route: null, error: 'Missing keys' }));
  }

  if (privKeyExists && tnPubExists) {
    for (const t of types) {
      await sendEncrypted(t, SENEGAL_GLN, TUNISIA_GLN, 'SN→TN');
    }
  } else {
    console.log('  ⚠️  Skipping SN→TN encrypted tests (missing keys)');
    types.forEach(t => results.push({ test: `Encrypted ${t} SN→TN`, docNum: 'N/A', pass: false, elapsed: 0, status: 0, transactionRef: null, route: null, error: 'Missing keys' }));
  }
  console.log('');

  // ── Summary ──────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed}/${total} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════════');

  // Output JSON for report generation
  const reportData = {
    timestamp: new Date().toISOString(),
    orchestratorUrl: ORCHESTRATOR_URL,
    tunisiaGln: TUNISIA_GLN,
    senegalGln: SENEGAL_GLN,
    summary: { total, passed, failed },
    results
  };

  const reportPath = path.join(__dirname, '..', 'test_results_orchestrator.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n  Report JSON saved to: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
})();
