// routes/ipay_payment_routes.js
//
// iPay.tn integration — automatic online payment (carte bancaire / iPay-supported
// virement) that plugs into the existing `comptes.subscription_status` /
// `subscription_expires_at` system, alongside (not instead of) the manual virement
// workflow in routes/subscription_routes.js.
//
// Flow:
//   React "Payer avec iPay" -> POST /api/payment/ipay/create (JWT required)
//     -> backend looks up the plan (server-side price/duration, never trusts React)
//     -> iPay POST /api/admin/transactions/create-oneshot
//     -> returns { payment_url } -> React redirects the browser
//   iPay webhook -> POST /api/payment/ipay/webhook (PUBLIC, no JWT — server-to-server)
//     -> verifies transaction/amount/currency against the local `ipay_payments` row
//     -> marks it paid (idempotent) and extends comptes.subscription_expires_at
//
// NOTE on iPay customers: the real iPay API's oneshot-transaction endpoint
// (POST /api/admin/transactions/create-oneshot) takes customer_name /
// customer_external_id directly and does NOT require a pre-created iPay customer
// (that's only needed for the recurring /api/admin/subscriptions flow, which we
// don't use here since Codeonline's own DB remains the source of truth for
// access). So there is no comptes.ipay_customer_id column and no customer-creation
// step — one fewer external API call, one fewer thing that can fail.

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const IPAY_BASE_URL = process.env.IPAY_BASE_URL || 'https://api.ipay.tn';
const IPAY_ORG_ID = process.env.IPAY_ORG_ID;
const IPAY_JWT = process.env.IPAY_JWT;
const IPAY_PRODUCT_CODE = process.env.IPAY_PRODUCT_CODE;

const CURRENCY = 'TND';

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ PLACEHOLDER PRICES ⚠️
// These are NOT real prices. Codeonline's real TND amounts per duration must
// be filled in here before this goes anywhere near production. This is the
// single authoritative place the backend gets price/duration from — React
// only ever sends a plan `code` and never an amount.
// ─────────────────────────────────────────────────────────────────────────
const IPAY_SUBSCRIPTION_PLANS = {
  '1m': { code: '1m', months: 1, amount: 5, label: '1 mois' },
  '3m': { code: '3m', months: 3, amount: 10, label: '3 mois' },
  '6m': { code: '6m', months: 6, amount: 15, label: '6 mois' },
  '12m': { code: '12m', months: 12, amount: 0, label: '12 mois' },
};

function ipayHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Org-Id': IPAY_ORG_ID,
    Authorization: `Bearer ${IPAY_JWT}`,
  };
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
async function ensureIpaySchema(db) {
  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS ipay_payments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      id_compte INT NOT NULL,
      id_entite INT NULL,
      plan_code VARCHAR(50) NOT NULL,
      months INT NOT NULL,
      amount DECIMAL(10,3) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'TND',
      status ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
      ipay_transaction_id VARCHAR(100) NOT NULL,
      invoice_reference VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME NULL,
      UNIQUE KEY uq_ipay_transaction (ipay_transaction_id),
      INDEX idx_ipay_account (id_compte),
      INDEX idx_ipay_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[iPay] ✓ ipay_payments table ready');

  if (!IPAY_ORG_ID || !IPAY_JWT || !IPAY_PRODUCT_CODE) {
    console.warn('[iPay] ⚠️  IPAY_ORG_ID / IPAY_JWT / IPAY_PRODUCT_CODE not set in .env — online payment will fail until configured.');
  }
  if (Object.values(IPAY_SUBSCRIPTION_PLANS).some((p) => !p.amount)) {
    console.warn('[iPay] ⚠️  IPAY_SUBSCRIPTION_PLANS still has placeholder (0) prices in routes/ipay_payment_routes.js — replace with real TND amounts before going live.');
  }
}

// ---------------------------------------------------------------------------
// Router — /api/payment/ipay/*
// ---------------------------------------------------------------------------
function buildIpayRouter(db, { verifyJWT }) {
  const router = express.Router();

  // GET /api/payment/ipay/plans — authoritative plan list + prices for the frontend.
  // The frontend never hard-codes an amount; it only ever sends back a `code` from here.
  router.get('/plans', verifyJWT, (req, res) => {
    res.json(
      Object.values(IPAY_SUBSCRIPTION_PLANS).map((p) => ({
        code: p.code,
        months: p.months,
        amount: p.amount,
        currency: CURRENCY,
        label: p.label,
      }))
    );
  });

  // POST /api/payment/ipay/create   { plan: '1m' | '3m' | '6m' | '12m' }
  router.post('/create', verifyJWT, async (req, res) => {
    try {
      const planCode = req.body && req.body.plan;
      const plan = IPAY_SUBSCRIPTION_PLANS[planCode];
      if (!plan) {
        return res.status(400).json({ error: 'Plan invalide' });
      }
      if (!plan.amount) {
        console.error(`[iPay] Plan "${planCode}" has a placeholder price of 0 — refusing to create a payment.`);
        return res.status(500).json({ error: 'Ce plan n\'est pas encore configuré, contactez le support.' });
      }
      if (!IPAY_ORG_ID || !IPAY_JWT || !IPAY_PRODUCT_CODE) {
        console.error('[iPay] Missing IPAY_ORG_ID/IPAY_JWT/IPAY_PRODUCT_CODE in .env');
        return res.status(500).json({ error: 'Configuration de paiement indisponible' });
      }

      // Authenticated account from JWT -> DB. Never trust id_compte/id_entite from React.
      const [rows] = await db.pool.query(
        `SELECT id_compte, id_entite, name, prenom, email FROM comptes WHERE id_compte = ?`,
        [req.user.id_compte]
      );
      if (!rows.length) return res.status(404).json({ error: 'Compte introuvable' });
      const account = rows[0];

      const invoiceReference = `CO-${account.id_compte}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const customerName =
        `${account.prenom || ''} ${account.name || ''}`.trim() || account.email || `Compte ${account.id_compte}`;

      const ipayRes = await axios.post(
        `${IPAY_BASE_URL}/api/admin/transactions/create-oneshot`,
        {
          product_code: IPAY_PRODUCT_CODE,
          amount: plan.amount,
          currency: CURRENCY,
          customer_name: customerName,
          customer_external_id: String(account.id_compte),
          invoice_reference: invoiceReference,
        },
        { headers: ipayHeaders(), timeout: 15000 }
      );

      const ipayTransactionId = ipayRes.data && ipayRes.data.id;
      const paymentUrl = ipayRes.data && ipayRes.data.payment_url;
      if (!ipayTransactionId || !paymentUrl) {
        console.error('[iPay] Unexpected create-oneshot response shape:', ipayRes.data);
        return res.status(502).json({ error: 'Réponse iPay invalide' });
      }

      await db.pool.query(
        `INSERT INTO ipay_payments
           (id_compte, id_entite, plan_code, months, amount, currency, status, ipay_transaction_id, invoice_reference)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          account.id_compte,
          account.id_entite || null,
          plan.code,
          plan.months,
          plan.amount,
          CURRENCY,
          ipayTransactionId,
          invoiceReference,
        ]
      );

      res.json({ success: true, payment_url: paymentUrl, transaction_id: ipayTransactionId });
    } catch (err) {
      console.error('[iPay] /create error:', (err.response && err.response.data) || err.message);
      res.status(500).json({ error: "Impossible de démarrer le paiement iPay" });
    }
  });

  // GET /api/payment/ipay/status/:transactionId — for the frontend's post-redirect return page
  router.get('/status/:transactionId', verifyJWT, async (req, res) => {
    try {
      const [rows] = await db.pool.query(
        `SELECT id, status, amount, currency, plan_code, months, created_at, paid_at
         FROM ipay_payments WHERE ipay_transaction_id = ? AND id_compte = ?`,
        [req.params.transactionId, req.user.id_compte]
      );
      if (!rows.length) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json(rows[0]);
    } catch (err) {
      console.error('[iPay] /status error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/payment/ipay/webhook — PUBLIC. Called server-to-server by iPay.
  // Must NOT require the app's JWT (see JWT_EXCLUDED_PATHS / SUBSCRIPTION_EXEMPT_PATHS
  // in server.js). This is the ONLY place that ever activates a subscription from a payment.
  router.post('/webhook', async (req, res) => {
    try {
      const body = req.body || {};
      const type = body.type;
      const data = body.data;

      if (!type || !data || !data.id) {
        console.warn('[iPay Webhook] Malformed payload, acknowledging without action.');
        return res.status(200).json({ received: true });
      }

      const transactionId = data.id;
      console.log(`[iPay Webhook] ${type} for transaction ${transactionId}`);

      const [rows] = await db.pool.query(`SELECT * FROM ipay_payments WHERE ipay_transaction_id = ?`, [
        transactionId,
      ]);

      if (!rows.length) {
        // Unknown transaction: log it, do not touch any subscription, ack safely.
        console.warn(`[iPay Webhook] Unknown transaction ${transactionId} — no local ipay_payments row, ignoring.`);
        return res.status(200).json({ received: true });
      }

      const payment = rows[0];

      // Idempotency: if we've already marked this paid, do nothing further.
      if (payment.status === 'paid') {
        return res.status(200).json({ received: true });
      }

      if (type === 'transaction.completed') {
        const paidAmount = Number(data.amount);
        const expectedAmount = Number(payment.amount);
        if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.001) {
          console.error(
            `[iPay Webhook] Amount mismatch for ${transactionId}: expected ${expectedAmount}, got ${data.amount}. Not activating.`
          );
          return res.status(200).json({ received: true });
        }
        if (data.currency && data.currency !== payment.currency) {
          console.error(
            `[iPay Webhook] Currency mismatch for ${transactionId}: expected ${payment.currency}, got ${data.currency}. Not activating.`
          );
          return res.status(200).json({ received: true });
        }

        // Conditional UPDATE as a second idempotency guard against concurrent webhook deliveries.
        const [updateResult] = await db.pool.query(
          `UPDATE ipay_payments SET status = 'paid', paid_at = NOW()
           WHERE ipay_transaction_id = ? AND status != 'paid'`,
          [transactionId]
        );

        if (updateResult.affectedRows > 0) {
          // Same extension rule as manual virement approval: extend from the later of
          // now/current expiry, never reset a still-active subscription to today+duration.
          await db.pool.query(
            `UPDATE comptes
             SET subscription_status = 'active',
                 subscription_expires_at = DATE_ADD(GREATEST(NOW(), COALESCE(subscription_expires_at, NOW())), INTERVAL ? MONTH)
             WHERE id_compte = ?`,
            [payment.months, payment.id_compte]
          );
          console.log(`[iPay Webhook] ✓ Activated ${payment.months} month(s) for compte ${payment.id_compte} (txn ${transactionId})`);
        }
      } else if (type === 'transaction.failed') {
        await db.pool.query(
          `UPDATE ipay_payments SET status = 'failed' WHERE ipay_transaction_id = ? AND status = 'pending'`,
          [transactionId]
        );
        // Do not touch comptes.subscription_status/expires_at — an existing active
        // subscription must never be shortened or changed because a new payment failed.
      } else if (type === 'transaction.expired') {
        await db.pool.query(
          `UPDATE ipay_payments SET status = 'expired' WHERE ipay_transaction_id = ? AND status = 'pending'`,
          [transactionId]
        );
      }
      // transaction.created: nothing to do, the row already exists as 'pending' from /create.

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[iPay Webhook] Processing error:', err.message);
      // iPay does not retry on error, so a 500 buys nothing operationally — it's kept here
      // only to make genuine processing failures visible in logs/monitoring.
      return res.status(500).json({ error: 'Webhook processing error' });
    }
  });

  return router;
}

module.exports = {
  ensureIpaySchema,
  buildIpayRouter,
  IPAY_SUBSCRIPTION_PLANS,
};
