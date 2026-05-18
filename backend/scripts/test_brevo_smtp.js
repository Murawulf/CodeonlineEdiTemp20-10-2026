/**
 * Test Brevo SMTP credentials
 * ===========================
 * 
 * Usage:
 *   node scripts/test_brevo_smtp.js [--user=<smtp-user>] [--key=<api-key>] [--to=<email>]
 *
 * Defaults to env vars BREVO_SMTP_USER / BREVO_API_KEY.
 * If --to is provided, sends an actual test email after verifying credentials.
 *
 * Examples:
 *   # Verify only
 *   node scripts/test_brevo_smtp.js --key=xsmtpsib-abc...
 *
 *   # Verify + send a test email
 *   node scripts/test_brevo_smtp.js --key=xsmtpsib-abc... --to=me@example.com
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createMailTransporter } = require('../services/mailTransporter');

// --- Parse CLI args ---
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
);

const SMTP_HOST = 'smtp-relay.brevo.com';
const SMTP_PORT = 587;
const SMTP_USER = args.user || process.env.BREVO_SMTP_USER || '948ac0001@smtp-brevo.com';
const SMTP_PASS = args.key  || process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'netconsultingeurope20@gmail.com';
const TO_EMAIL = args.to || null;

if (!SMTP_PASS) {
  console.error('❌ Missing SMTP key. Provide --key=<value> or set BREVO_API_KEY env var.');
  process.exit(1);
}

const maskedKey = SMTP_PASS.length > 12
  ? SMTP_PASS.slice(0, 8) + '…' + SMTP_PASS.slice(-4)
  : '***';

console.log('🧪 Test Brevo SMTP');
console.log('─────────────────────────────────────');
console.log('  Host :', SMTP_HOST + ':' + SMTP_PORT);
console.log('  User :', SMTP_USER);
console.log('  Key  :', maskedKey, `(len=${SMTP_PASS.length})`);
console.log('  From :', FROM_EMAIL);
console.log('  To   :', TO_EMAIL || '(verify only, no send)');
console.log('─────────────────────────────────────\n');

(async () => {
  const transporter = createMailTransporter({
    user: SMTP_USER,
    pass: SMTP_PASS,
    host: SMTP_HOST,
    port: SMTP_PORT,
    defaultFrom: FROM_EMAIL,
  });
  console.log('  Mode :', transporter._info?.backend || 'unknown');
  console.log('');

  // Step 1 — verify
  try {
    console.log('🔌 Step 1: verifying SMTP connection & authentication...');
    await transporter.verify();
    console.log('✅ SMTP credentials are VALID — ready to send emails.\n');
  } catch (err) {
    console.error('❌ SMTP verification FAILED');
    console.error('   Code   :', err.code || '(no code)');
    console.error('   Cmd    :', err.command || '(n/a)');
    console.error('   Msg    :', err.message);
    if (err.responseCode) console.error('   SMTP   :', err.responseCode, err.response);
    process.exit(2);
  }

  // Step 2 — optional send
  if (!TO_EMAIL) {
    console.log('ℹ️  No --to provided, skipping send. Credentials are valid.');
    process.exit(0);
  }

  try {
    console.log(`📤 Step 2: sending a test email to ${TO_EMAIL}...`);
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: '[TEST] Brevo SMTP — Codeonline EDI Tunisie',
      text: [
        'Ceci est un email de test envoyé depuis le script test_brevo_smtp.js',
        '',
        `Date  : ${new Date().toISOString()}`,
        `User  : ${SMTP_USER}`,
        `KeyLen: ${SMTP_PASS.length}`,
        '',
        'Si vous recevez ce message, la nouvelle clé Brevo est opérationnelle. ✅',
      ].join('\n'),
    });
    console.log('✅ Email sent successfully');
    console.log('   messageId:', info.messageId);
    console.log('   accepted :', info.accepted);
    console.log('   rejected :', info.rejected);
    console.log('   response :', info.response);
    process.exit(0);
  } catch (err) {
    console.error('❌ Sending FAILED');
    console.error('   Code:', err.code, '/', err.responseCode);
    console.error('   Msg :', err.message);
    if (err.response) console.error('   SMTP:', err.response);
    process.exit(3);
  }
})();
