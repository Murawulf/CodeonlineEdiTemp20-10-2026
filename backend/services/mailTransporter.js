/**
 * Mail Transporter Factory
 * ========================
 *
 * Construit un transporter compatible avec l'API `transporter.sendMail({...})`
 * de nodemailer, en choisissant automatiquement entre :
 *
 *   - Brevo SMTP (clé courte ou clé `xsmtpsib-…`)        → nodemailer
 *   - Brevo HTTP REST API (clé `xkeysib-…`)              → fetch /v3/smtp/email
 *
 * Le code applicatif appelle `transporter.sendMail(opts)` sans savoir lequel
 * des deux backends est utilisé. Les options supportées sont :
 *   { from, to, cc, bcc, subject, text, html, attachments: [{filename, content, contentType}] }
 *
 * Référence API Brevo : https://developers.brevo.com/reference/sendtransacemail
 */

const nodemailer = require('nodemailer');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account';

const isApiKey = (key) => typeof key === 'string' && key.startsWith('xkeysib-');

/**
 * Parse "Name <email@x.com>" or just "email@x.com" into { name, email }.
 */
function parseAddress(addr) {
  if (!addr) return null;
  if (typeof addr === 'object' && addr.email) return addr;
  const s = String(addr).trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: s };
}

/**
 * Normalize a recipient list (string | string[] | object[]) to Brevo format.
 */
function toRecipients(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  return arr
    .map((x) => (typeof x === 'string' ? parseAddress(x.trim()) : x))
    .filter(Boolean)
    .filter((x) => x.email);
}

/**
 * Convert nodemailer-style attachments to Brevo format.
 *   nodemailer: { filename, content: Buffer|string, contentType }
 *   Brevo    : { name, content: base64 string }
 */
function toBrevoAttachments(atts) {
  if (!Array.isArray(atts) || atts.length === 0) return undefined;
  return atts.map((a) => {
    let b64;
    if (Buffer.isBuffer(a.content)) {
      b64 = a.content.toString('base64');
    } else if (typeof a.content === 'string') {
      // Could already be base64 or raw; assume raw and base64-encode
      b64 = Buffer.from(a.content).toString('base64');
    } else if (a.path) {
      // Synchronous file read fallback
      const fs = require('fs');
      b64 = fs.readFileSync(a.path).toString('base64');
    } else {
      throw new Error(`Attachment "${a.filename || '(unnamed)'}" has no content/path`);
    }
    return { name: a.filename || 'attachment', content: b64 };
  });
}

/**
 * Build a Brevo REST-backed transporter implementing nodemailer's surface
 * for `verify()` and `sendMail()`.
 */
function createBrevoApiTransporter(apiKey, opts = {}) {
  const defaultFrom = opts.defaultFrom || process.env.FROM_EMAIL;

  async function verify() {
    const res = await fetch(BREVO_ACCOUNT_URL, {
      method: 'GET',
      headers: { 'api-key': apiKey, 'accept': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Brevo API verify failed: HTTP ${res.status} ${body}`);
      err.code = 'EAUTH';
      err.responseCode = res.status;
      throw err;
    }
    return true;
  }

  async function sendMail(message) {
    const sender = parseAddress(message.from || defaultFrom);
    if (!sender) throw new Error('sendMail: no `from` and no FROM_EMAIL configured');

    const payload = {
      sender,
      to: toRecipients(message.to),
      subject: message.subject || '(no subject)',
    };
    const cc  = toRecipients(message.cc);  if (cc.length)  payload.cc  = cc;
    const bcc = toRecipients(message.bcc); if (bcc.length) payload.bcc = bcc;

    if (message.html) payload.htmlContent = message.html;
    if (message.text) payload.textContent = message.text;
    if (!payload.htmlContent && !payload.textContent) {
      payload.textContent = '(empty body)';
    }

    const att = toBrevoAttachments(message.attachments);
    if (att) payload.attachment = att;

    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }

    if (!res.ok) {
      const err = new Error(`Brevo API sendMail failed: HTTP ${res.status} ${text}`);
      err.code = 'EBREVO';
      err.responseCode = res.status;
      err.response = text;
      throw err;
    }

    // Mimic nodemailer info object
    return {
      messageId: (json && json.messageId) || (json && json.messageIds && json.messageIds[0]) || null,
      accepted: payload.to.map((r) => r.email),
      rejected: [],
      response: `200 OK (Brevo API) ${json ? JSON.stringify(json) : ''}`.trim(),
      _backend: 'brevo-api',
    };
  }

  return { verify, sendMail, _backend: 'brevo-api' };
}

/**
 * Build an SMTP transporter (legacy / xsmtpsib- keys).
 */
function createSmtpTransporter({ user, pass, host = 'smtp-relay.brevo.com', port = 587 }) {
  return nodemailer.createTransport({
    host, port,
    secure: false, // STARTTLS on 587
    auth: { user, pass },
    logger: false,
    debug: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/**
 * Main factory. Picks API REST or SMTP based on key shape.
 */
function createMailTransporter({ user, pass, host, port, defaultFrom }) {
  if (!pass) {
    throw new Error('createMailTransporter: missing pass/key');
  }
  if (isApiKey(pass)) {
    return {
      ...createBrevoApiTransporter(pass, { defaultFrom }),
      _info: { backend: 'brevo-api', user: '(api-key)', keyLen: pass.length },
    };
  }
  if (!user) {
    throw new Error('createMailTransporter: SMTP key requires a `user` (BREVO_SMTP_USER)');
  }
  const t = createSmtpTransporter({ user, pass, host, port });
  t._info = { backend: 'smtp', user, keyLen: pass.length };
  return t;
}

module.exports = {
  createMailTransporter,
  createBrevoApiTransporter,
  createSmtpTransporter,
  isApiKey,
  parseAddress,
};
