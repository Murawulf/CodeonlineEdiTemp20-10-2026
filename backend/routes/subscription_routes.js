// routes/subscription_routes.js
//
// Trial / subscription management for `comptes`, matching comptes.tsx:
//   - subscription_status: 'trial' | 'pending_review' | 'active' | 'expired' | 'suspended'
//   - subscription_expires_at: end of the current PAID period (set on virement approval)
//   - trial_notified_at: when the day-20 trial-ending email was sent
//   - Accounts on entity 999 or 111 are "privileged": they bypass subscription checks entirely
//   - Users submit a bank-transfer proof ("virement"); an admin (999/111) approves/rejects it
//
// Trial length is 30 days from comptes.created_at (gives the "days_left_trial <= 10" banner
// in comptes.tsx its meaning: the day-20 notice fires exactly when 10 days remain).
// Adjust TRIAL_LENGTH_DAYS / NOTICE_DAY_OFFSET if that's not the intended business rule.

const fs = require('fs');
const path = require('path');

const TRIAL_LENGTH_DAYS = 30;
const NOTICE_DAY_OFFSET = 20; // send the reminder when the trial is 20 days old

const TOP_ENTITY_ID = 999;
const SECOND_ENTITY_ID = 111;
const isPrivilegedEntity = (id_entite) => id_entite === TOP_ENTITY_ID || id_entite === SECOND_ENTITY_ID;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'virements');

// ---------------------------------------------------------------------------
// Schema (columns already exist in prod; this only fills in what's missing —
// e.g. on a fresh/staging DB — and creates the virements table)
// ---------------------------------------------------------------------------
async function ensureSubscriptionSchema(db) {
  const [cols] = await db.pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comptes'
       AND COLUMN_NAME IN ('subscription_status','subscription_expires_at','trial_notified_at')`
  );
  const existing = new Set(cols.map(c => c.COLUMN_NAME));

  if (!existing.has('subscription_status')) {
    await db.pool.query(
      `ALTER TABLE comptes
       ADD COLUMN subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial'
       COMMENT 'trial | pending_review | active | expired | suspended'`
    );
    console.log('[Subscription] ? Added comptes.subscription_status');
  }

  if (!existing.has('subscription_expires_at')) {
    await db.pool.query(
      `ALTER TABLE comptes ADD COLUMN subscription_expires_at DATETIME NULL
       COMMENT 'End of the currently paid subscription period, if any'`
    );
    console.log('[Subscription] ? Added comptes.subscription_expires_at');
  }

  if (!existing.has('trial_notified_at')) {
    await db.pool.query(
      `ALTER TABLE comptes ADD COLUMN trial_notified_at DATETIME NULL
       COMMENT 'When the day-20 trial-ending email was sent'`
    );
    console.log('[Subscription] ? Added comptes.trial_notified_at');
  }

  await db.pool.query(`
    CREATE TABLE IF NOT EXISTS virements (
      id_virement INT AUTO_INCREMENT PRIMARY KEY,
      id_compte INT NOT NULL,
      id_entite INT NULL,
      image_path VARCHAR(500) NOT NULL,
      original_filename VARCHAR(255) NULL,
      montant DECIMAL(10,2) NULL,
      reference VARCHAR(255) NULL,
      months_requested INT NOT NULL DEFAULT 1,
      statut ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      source VARCHAR(50) NOT NULL DEFAULT 'web',
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      reject_reason TEXT NULL,
      INDEX idx_virements_compte (id_compte),
      INDEX idx_virements_statut (statut)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function computeTrialEndsAt(created_at) {
  const end = new Date(created_at);
  end.setDate(end.getDate() + TRIAL_LENGTH_DAYS);
  return end;
}

function computeStatus({ id_entite, subscription_status, subscription_expires_at, created_at }) {
  const is_privileged = isPrivilegedEntity(id_entite);
  const now = new Date();
  const trial_ends_at = computeTrialEndsAt(created_at);
  const days_left_trial = Math.max(0, Math.ceil((trial_ends_at - now) / 86400000));

  let has_access;
  if (is_privileged) {
    has_access = true;
  } else if (subscription_status === 'suspended' || subscription_status === 'expired') {
    has_access = false;
  } else if (subscription_status === 'pending_review') {
    has_access = true; // keep access while the admin reviews the proof
  } else if (subscription_status === 'active') {
    has_access = !!subscription_expires_at && new Date(subscription_expires_at) > now;
  } else {
    // 'trial' (or unrecognized -> treat as trial)
    has_access = trial_ends_at > now;
  }

  return { is_privileged, trial_ends_at, days_left_trial, has_access };
}

// ---------------------------------------------------------------------------
// Cron (call once at startup; runs hourly)
// ---------------------------------------------------------------------------
function startSubscriptionCron(db, { getTransporter, getFromEmail }) {
  const run = async () => {
    try {
      // 1) Expire paid subscriptions that ran out
      const [expiredActive] = await db.pool.query(
        `UPDATE comptes
         SET subscription_status = 'expired'
         WHERE subscription_status = 'active'
           AND subscription_expires_at IS NOT NULL
           AND subscription_expires_at < NOW()`
      );

      // 2) Expire trials that ran out (30 days from created_at)
      const [expiredTrials] = await db.pool.query(
        `UPDATE comptes
         SET subscription_status = 'expired'
         WHERE subscription_status = 'trial'
           AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [TRIAL_LENGTH_DAYS]
      );

      if (expiredActive.affectedRows || expiredTrials.affectedRows) {
        console.log(`[Subscription] ? Expired ${expiredActive.affectedRows + expiredTrials.affectedRows} account(s)`);
      }

      // 3) Day-20 warning email (once per account)
      const [dueForNotice] = await db.pool.query(
        `SELECT id_compte, email, name, created_at
         FROM comptes
         WHERE subscription_status = 'trial'
           AND trial_notified_at IS NULL
           AND created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [NOTICE_DAY_OFFSET]
      );

      if (dueForNotice.length) {
        const transporter = getTransporter && getTransporter();
        for (const acc of dueForNotice) {
          const trialEndsAt = computeTrialEndsAt(acc.created_at);
          if (transporter && acc.email) {
            try {
              await transporter.sendMail({
                from: getFromEmail ? getFromEmail() : undefined,
                to: acc.email,
                subject: "Votre période d'essai se termine bientôt",
                text: `Bonjour ${acc.name || ''},\n\nVotre période d'essai gratuite se termine le ${trialEndsAt.toLocaleDateString('fr-FR')}. Soumettez un justificatif de virement depuis la page Comptes pour éviter toute interruption d'accès.\n\nMerci.`
              });
              console.log(`[Subscription] ?? Notice sent to ${acc.email}`);
            } catch (mailErr) {
              console.error(`[Subscription] ?? Failed to email ${acc.email}:`, mailErr.message);
            }
          }
          await db.pool.query(`UPDATE comptes SET trial_notified_at = NOW() WHERE id_compte = ?`, [acc.id_compte]);
        }
      }
    } catch (err) {
      console.error('[Subscription] ? Cron error:', err.message);
    }
  };

  run();
  return setInterval(run, 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Middleware — gate other routes behind an active subscription/trial
// ---------------------------------------------------------------------------
function requireActiveSubscription(db) {
  return async (req, res, next) => {
    try {
      const id_compte = req.user && req.user.id_compte;
      if (!id_compte) return res.status(401).json({ error: 'Unauthorized' });

      const [rows] = await db.pool.query(
        `SELECT id_entite, subscription_status, subscription_expires_at, created_at
         FROM comptes WHERE id_compte = ?`,
        [id_compte]
      );
      if (!rows.length) return res.status(404).json({ error: 'Compte introuvable' });

      const { has_access } = computeStatus(rows[0]);
      if (!has_access) {
        return res.status(402).json({ error: 'Subscription expired', subscription_status: rows[0].subscription_status });
      }
      next();
    } catch (err) {
      console.error('[Subscription] Middleware error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

// ---------------------------------------------------------------------------
// Router — /api/subscription/*
// ---------------------------------------------------------------------------
function buildSubscriptionRouter(db, { verifyJWT, getTransporter, getFromEmail }) {
  const express = require('express');
  const multer = require('multer');
  const router = express.Router();

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '';
      cb(null, `virement_${req.user.id_compte}_${Date.now()}${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const ok = /^image\/|^application\/pdf$/.test(file.mimetype);
      cb(ok ? null : new Error('Format de fichier non supporté (image ou PDF uniquement)'), ok);
    }
  });

  const requireAdmin = (req, res, next) => {
    if (!isPrivilegedEntity(req.user.id_entite)) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    next();
  };

  // GET /api/subscription/status
  router.get('/status', verifyJWT, async (req, res) => {
    try {
      const [rows] = await db.pool.query(
        `SELECT id_entite, subscription_status, subscription_expires_at, created_at
         FROM comptes WHERE id_compte = ?`,
        [req.user.id_compte]
      );
      if (!rows.length) return res.status(404).json({ error: 'Compte introuvable' });

      const acc = rows[0];
      const { is_privileged, trial_ends_at, days_left_trial, has_access } = computeStatus(acc);

      res.json({
        id_compte: req.user.id_compte,
        is_privileged,
        subscription_status: acc.subscription_status,
        trial_ends_at: trial_ends_at.toISOString(),
        days_left_trial,
        subscription_expires_at: acc.subscription_expires_at,
        has_access,
      });
    } catch (err) {
      console.error('[Subscription] /status error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/subscription/virements?statut=pending|approved|rejected  (admin only)
  router.get('/virements', verifyJWT, requireAdmin, async (req, res) => {
    try {
      const { statut } = req.query;
      const params = [];
      let where = '';
      if (statut && statut !== 'all') {
        where = 'WHERE v.statut = ?';
        params.push(statut);
      }

      const [rows] = await db.pool.query(
        `SELECT v.*, c.email, c.name, c.prenom, e.raison_socialle AS entite_name
         FROM virements v
         LEFT JOIN comptes c ON c.id_compte = v.id_compte
         LEFT JOIN Entite e ON e.id_entite = v.id_entite
         ${where}
         ORDER BY v.submitted_at DESC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error('[Subscription] /virements error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/subscription/virement  (own submission, multipart)
  router.post('/virement', verifyJWT, upload.single('proof'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Fichier requis' });

      const { montant, reference } = req.body;

      await db.pool.query(
        `INSERT INTO virements
           (id_compte, id_entite, image_path, original_filename, montant, reference, months_requested, statut, source)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', 'web')`,
        [
          req.user.id_compte,
          req.user.id_entite || null,
          req.file.path,
          req.file.originalname || null,
          montant ? Number(montant) : null,
          reference || null,
        ]
      );

      await db.pool.query(
        `UPDATE comptes SET subscription_status = 'pending_review' WHERE id_compte = ?`,
        [req.user.id_compte]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('[Subscription] /virement error:', err.message);
      res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  // GET /api/subscription/virements/:id/image  (admin or the owning account)
  router.get('/virements/:id/image', verifyJWT, async (req, res) => {
    try {
      const [rows] = await db.pool.query(`SELECT * FROM virements WHERE id_virement = ?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Justificatif introuvable' });

      const v = rows[0];
      const isOwner = v.id_compte === req.user.id_compte;
      if (!isOwner && !isPrivilegedEntity(req.user.id_entite)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      if (!fs.existsSync(v.image_path)) {
        return res.status(404).json({ error: 'Fichier introuvable sur le serveur' });
      }
      res.sendFile(path.resolve(v.image_path));
    } catch (err) {
      console.error('[Subscription] /virements/:id/image error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /api/subscription/virements/:id/validate  { action, months?, reject_reason? }  (admin only)
  router.patch('/virements/:id/validate', verifyJWT, requireAdmin, async (req, res) => {
    try {
      const { action, months, reject_reason } = req.body;
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action invalide' });
      }

      const [rows] = await db.pool.query(`SELECT * FROM virements WHERE id_virement = ?`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Justificatif introuvable' });
      const v = rows[0];
      if (v.statut !== 'pending') {
        return res.status(409).json({ error: 'Ce justificatif a déjà été traité' });
      }

      if (action === 'approve') {
        const monthsToAdd = Number(months) > 0 ? Number(months) : 12;

        await db.pool.query(
          `UPDATE virements
           SET statut = 'approved', months_requested = ?, reviewed_by = ?, reviewed_at = NOW()
           WHERE id_virement = ?`,
          [monthsToAdd, req.user.id_compte, v.id_virement]
        );

        await db.pool.query(
          `UPDATE comptes
           SET subscription_status = 'active',
               subscription_expires_at = DATE_ADD(GREATEST(NOW(), COALESCE(subscription_expires_at, NOW())), INTERVAL ? MONTH)
           WHERE id_compte = ?`,
          [monthsToAdd, v.id_compte]
        );
      } else {
        await db.pool.query(
          `UPDATE virements
           SET statut = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = NOW()
           WHERE id_virement = ?`,
          [reject_reason || null, req.user.id_compte, v.id_virement]
        );

        // Revert the account to whatever its state would otherwise be
        const [acctRows] = await db.pool.query(
          `SELECT created_at FROM comptes WHERE id_compte = ?`,
          [v.id_compte]
        );
        const acct = acctRows[0];
        const stillInTrial = acct && computeTrialEndsAt(acct.created_at) > new Date();
        await db.pool.query(
          `UPDATE comptes SET subscription_status = ? WHERE id_compte = ?`,
          [stillInTrial ? 'trial' : 'expired', v.id_compte]
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[Subscription] /virements/:id/validate error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = {
  ensureSubscriptionSchema,
  startSubscriptionCron,
  buildSubscriptionRouter,
  requireActiveSubscription,
};