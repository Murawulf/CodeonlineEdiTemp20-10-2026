'use strict';

/**
 * TrackingController.js
 *
 * Read-only API for the mobile tracking application.
 * Exposes EDI document statuses and transmission metadata.
 *
 * ⚠️  SECURITY RULES (enforced here):
 *   - NEVER return eancomContent, envelope, header crypto fields, or any document payload
 *   - Error messages are sanitized to strip cryptographic details
 *   - Only metadata from the `transactions` table is exposed
 *
 * Endpoints mounted at /api/tracking/*
 */

const db = require('../config/db');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Remove sensitive crypto/key terms from error strings before exposing them */
function sanitizeError(msg) {
  if (!msg) return null;
  return msg
    .replace(/aes[-_]?\d+[-_]?gcm/gi, '[CRYPTO]')
    .replace(/rsa[- _]?(private|public|keypair|key)?/gi, '[CRYPTO]')
    .replace(/encrypt(ed|ion)?/gi, '[CRYPTO]')
    .replace(/decrypt(ed|ion)?/gi, '[CRYPTO]')
    .replace(/cipher/gi, '[CRYPTO]')
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[PEM_REDACTED]')
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[B64_REDACTED]')  // long base64 blobs
    .substring(0, 500); // cap length
}

/** Parse pagination params from query */
function parsePaging(query) {
  const page  = Math.max(1, parseInt(query.page  || '1',  10));
  const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Build a safe ISO date string or null */
function toISO(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Format a transaction row for public consumption */
function formatTx(row) {
  return {
    id:               row.id,
    transaction_ref:  row.transaction_ref,
    sender_gln:       row.sender_gln,
    receiver_gln:     row.receiver_gln,
    document_type:    row.document_type,
    status:           row.status,
    transport_mode:   row.transport_mode,
    payload_size:     row.payload_size,
    order_ref:        row.order_ref || null,
    error_message:    sanitizeError(row.error_message),
    created_at:       toISO(row.created_at),
    delivered_at:     toISO(row.delivered_at),
    updated_at:       toISO(row.updated_at),
    delivery_time_ms: row.delivered_at && row.created_at
      ? new Date(row.delivered_at) - new Date(row.created_at)
      : null,
  };
}

// ─── controller ──────────────────────────────────────────────────────────────

class TrackingController {

  /**
   * GET /api/tracking/transactions
   *
   * List transactions with optional filters and pagination.
   * Filters: gln, sender_gln, receiver_gln, document_type, status, from, to
   */
  async listTransactions(req, res) {
    try {
      const { page, limit, offset } = parsePaging(req.query);

      const conditions = [];
      const params     = [];

      if (req.query.gln) {
        conditions.push('(sender_gln = ? OR receiver_gln = ?)');
        params.push(req.query.gln, req.query.gln);
      }
      if (req.query.sender_gln) {
        conditions.push('sender_gln = ?');
        params.push(req.query.sender_gln);
      }
      if (req.query.receiver_gln) {
        conditions.push('receiver_gln = ?');
        params.push(req.query.receiver_gln);
      }
      if (req.query.document_type) {
        conditions.push('document_type = ?');
        params.push(req.query.document_type.toUpperCase());
      }
      if (req.query.status) {
        conditions.push('status = ?');
        params.push(req.query.status.toUpperCase());
      }
      if (req.query.from) {
        conditions.push('created_at >= ?');
        params.push(new Date(req.query.from));
      }
      if (req.query.to) {
        conditions.push('created_at <= ?');
        params.push(new Date(req.query.to));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM transactions ${where}`,
        params
      );
      const total = countRows[0].total;

      const [rows] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, transport_mode, payload_size, error_message,
                created_at, delivered_at, updated_at
         FROM transactions
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      return res.json({
        success: true,
        data:    rows.map(formatTx),
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error('[Tracking] listTransactions error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/transactions/:ref
   *
   * Get a single transaction by its reference ID.
   */
  async getTransaction(req, res) {
    try {
      const { ref } = req.params;

      const [rows] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, transport_mode, payload_size, error_message, order_ref,
                created_at, delivered_at, updated_at
         FROM transactions
         WHERE transaction_ref = ?
         LIMIT 1`,
        [ref]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      // P2.1 — scope : un partenaire ne voit que ses propres transactions
      if (req.scopeGln && rows[0].sender_gln !== req.scopeGln && rows[0].receiver_gln !== req.scopeGln) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      return res.json({ success: true, data: formatTx(rows[0]) });
    } catch (err) {
      console.error('[Tracking] getTransaction error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/stats
   *
   * Global statistics dashboard.
   * Filters: gln, from, to
   */
  async getStats(req, res) {
    try {
      const conditions = [];
      const params     = [];

      if (req.query.gln) {
        conditions.push('(sender_gln = ? OR receiver_gln = ?)');
        params.push(req.query.gln, req.query.gln);
      }
      if (req.query.from) {
        conditions.push('created_at >= ?');
        params.push(new Date(req.query.from));
      }
      if (req.query.to) {
        conditions.push('created_at <= ?');
        params.push(new Date(req.query.to));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Counts by status
      const [byStatus] = await db.execute(
        `SELECT status, COUNT(*) AS count FROM transactions ${where} GROUP BY status`,
        params
      );

      // Counts by document type
      const [byType] = await db.execute(
        `SELECT document_type, COUNT(*) AS count FROM transactions ${where} GROUP BY document_type ORDER BY count DESC`,
        params
      );

      // Top partners by transaction volume
      const [topPartners] = await db.execute(
        `SELECT sender_gln AS gln, COUNT(*) AS sent FROM transactions ${where}
         GROUP BY sender_gln ORDER BY sent DESC LIMIT 10`,
        params
      );

      // Average delivery time (for DELIVERED records only)
      const [avgDelivery] = await db.execute(
        `SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, delivered_at)) AS avg_seconds
         FROM transactions
         WHERE status = 'DELIVERED' AND delivered_at IS NOT NULL
         ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}`,
        params
      );

      // Transactions in last 24 h
      const [last24h] = await db.execute(
        `SELECT COUNT(*) AS count FROM transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR`,
        []
      );

      // Recent failures (last 10)
      const failWhere = conditions.length
        ? `WHERE status = 'FAILED' AND ${conditions.join(' AND ')}`
        : `WHERE status = 'FAILED'`;
      const [recentFailed] = await db.execute(
        `SELECT transaction_ref, sender_gln, receiver_gln, document_type, error_message, created_at
         FROM transactions
         ${failWhere}
         ORDER BY created_at DESC
         LIMIT 10`,
        params
      );

      // Overall delivery rate
      const total   = byStatus.reduce((s, r) => s + Number(r.count), 0);
      const delivered = byStatus.find((r) => r.status === 'DELIVERED')?.count || 0;
      const failed    = byStatus.find((r) => r.status === 'FAILED')?.count    || 0;

      return res.json({
        success: true,
        data: {
          total_transactions:   total,
          transactions_24h:     Number(last24h[0].count),
          delivery_rate_pct:    total > 0 ? +((delivered / total) * 100).toFixed(2) : 0,
          avg_delivery_time_s:  avgDelivery[0].avg_seconds
            ? +Number(avgDelivery[0].avg_seconds).toFixed(1)
            : null,
          by_status:   Object.fromEntries(byStatus.map((r) => [r.status,   Number(r.count)])),
          by_type:     Object.fromEntries(byType.map((r)   => [r.document_type, Number(r.count)])),
          top_senders: topPartners.map((r) => ({ gln: r.gln, sent: Number(r.sent) })),
          recent_failures: recentFailed.map((r) => ({
            transaction_ref: r.transaction_ref,
            sender_gln:      r.sender_gln,
            receiver_gln:    r.receiver_gln,
            document_type:   r.document_type,
            error:           sanitizeError(r.error_message),
            at:              toISO(r.created_at),
          })),
        },
      });
    } catch (err) {
      console.error('[Tracking] getStats error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/partners
   *
   * List all active EDI partners with their transaction summary.
   */
  async listPartners(req, res) {
    try {
      const [partners] = await db.execute(
        `SELECT p.gln, p.name, p.country_code, p.status,
                COUNT(t.id)                                       AS total_tx,
                SUM(t.status = 'DELIVERED')                       AS delivered,
                SUM(t.status = 'FAILED')                          AS failed,
                MAX(t.created_at)                                 AS last_activity
         FROM partners p
         LEFT JOIN transactions t ON (t.sender_gln = p.gln OR t.receiver_gln = p.gln)
         GROUP BY p.gln, p.name, p.country_code, p.status
         ORDER BY total_tx DESC`
      );

      return res.json({
        success: true,
        data: partners.map((p) => ({
          gln:           p.gln,
          name:          p.name,
          country_code:  p.country_code,
          status:        p.status,
          stats: {
            total:     Number(p.total_tx),
            delivered: Number(p.delivered || 0),
            failed:    Number(p.failed    || 0),
            delivery_rate_pct: p.total_tx > 0
              ? +((p.delivered / p.total_tx) * 100).toFixed(2)
              : 0,
          },
          last_activity: toISO(p.last_activity),
        })),
      });
    } catch (err) {
      console.error('[Tracking] listPartners error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/partners/:gln/timeline
   *
   * Full chronological message exchange timeline for a given GLN.
   * Shows every document sent or received, in order — without content.
   */
  async getPartnerTimeline(req, res) {
    try {
      const { gln } = req.params;

      // P2.1 — scope : un partenaire ne consulte que sa propre timeline
      if (req.scopeGln && gln !== req.scopeGln) {
        return res.status(403).json({ success: false, error: 'Access restricted to your own GLN timeline' });
      }

      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '100', 10)));

      // Resolve partner name
      const [pRows] = await db.execute(
        'SELECT name, country_code FROM partners WHERE gln = ? LIMIT 1',
        [gln]
      );

      const [rows] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, transport_mode, payload_size, error_message,
                created_at, delivered_at
         FROM transactions
         WHERE sender_gln = ? OR receiver_gln = ?
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        [gln, gln]
      );

      return res.json({
        success: true,
        partner: pRows.length > 0
          ? { gln, name: pRows[0].name, country_code: pRows[0].country_code }
          : { gln, name: 'Unknown', country_code: null },
        data: rows.map((r) => ({
          ...formatTx(r),
          direction: r.sender_gln === gln ? 'SENT' : 'RECEIVED',
        })),
      });
    } catch (err) {
      console.error('[Tracking] getPartnerTimeline error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/alerts
   *
   * Returns currently failing or stuck transactions that need attention.
   * - FAILED transactions from the last 7 days
   * - RECEIVED transactions older than 5 minutes (possibly stuck)
   */
  async getAlerts(req, res) {
    try {
      const [failed] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, error_message, created_at, transport_mode
         FROM transactions
         WHERE status = 'FAILED'
           AND created_at >= NOW() - INTERVAL 7 DAY
         ORDER BY created_at DESC
         LIMIT 100`
      );

      const [stuck] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, error_message, created_at, transport_mode
         FROM transactions
         WHERE status IN ('RECEIVED', 'FORWARDED')
           AND created_at <= NOW() - INTERVAL 5 MINUTE
         ORDER BY created_at ASC
         LIMIT 50`
      );

      const formatAlert = (row, type) => ({
        type,
        id:              row.id,
        transaction_ref: row.transaction_ref,
        sender_gln:      row.sender_gln,
        receiver_gln:    row.receiver_gln,
        document_type:   row.document_type,
        status:          row.status,
        transport_mode:  row.transport_mode,
        error:           sanitizeError(row.error_message),
        created_at:      toISO(row.created_at),
        age_minutes:     Math.round((Date.now() - new Date(row.created_at)) / 60000),
      });

      return res.json({
        success: true,
        data: {
          total_alerts: failed.length + stuck.length,
          failed:       failed.map((r) => formatAlert(r, 'FAILED')),
          stuck:        stuck.map((r)  => formatAlert(r, 'STUCK')),
        },
      });
    } catch (err) {
      console.error('[Tracking] getAlerts error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/health
   *
   * Hub health check — safe to expose without auth (or with minimal auth).
   */
  async getHealth(req, res) {
    try {
      const [[{ count }]] = await db.execute(
        'SELECT COUNT(*) AS count FROM transactions WHERE created_at >= NOW() - INTERVAL 24 HOUR'
      );
      const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM transactions');
      const [[{ partners }]] = await db.execute(
        "SELECT COUNT(*) AS partners FROM partners WHERE status = 'ACTIVE'"
      );

      return res.json({
        success: true,
        data: {
          status:             'ok',
          db:                 'connected',
          uptime_seconds:     Math.floor(process.uptime()),
          transactions_24h:   Number(count),
          transactions_total: Number(total),
          active_partners:    Number(partners),
          timestamp:          new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[Tracking] health check failed:', err.message);
      return res.status(503).json({
        success: false,
        data: { status: 'degraded', db: 'error', error: err.message },
      });
    }
  }

  /**
   * GET /api/tracking/document-types
   *
   * Returns the list of known EANCOM document types and their human descriptions.
   * Useful for the mobile UI to display readable labels.
   */
  getDocumentTypes(req, res) {
    return res.json({
      success: true,
      data: [
        { code: 'ORDERS',  label: 'Purchase Order',         description: 'Buyer sends an order to supplier' },
        { code: 'ORDRSP',  label: 'Order Response',         description: 'Supplier acknowledges / rejects an order' },
        { code: 'DESADV',  label: 'Despatch Advice',        description: 'Supplier notifies shipment dispatch' },
        { code: 'RECADV',  label: 'Receiving Advice',       description: 'Buyer confirms goods received' },
        { code: 'INVOIC',  label: 'Invoice',                description: 'Supplier sends invoice to buyer' },
        { code: 'APERAK',  label: 'Application Error & Acknowledgement', description: 'ACK / NACK for a processed document' },
        { code: 'CONTRL',  label: 'Interchange Control',   description: 'Syntax-level acknowledgement' },
        { code: 'UNKNOWN', label: 'Unknown',                description: 'Document type could not be determined' },
      ],
    });
  }

  /**
   * GET /api/tracking/transactions/:ref/history
   *
   * Returns all status changes for a transaction (based on logs if available,
   * or reconstructed from the current record).
   */
  async getTransactionHistory(req, res) {
    try {
      const { ref } = req.params;

      const [rows] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, transport_mode, payload_size, error_message, order_ref,
                created_at, delivered_at, updated_at
         FROM transactions
         WHERE transaction_ref LIKE ?
         ORDER BY created_at ASC`,
        [`%${ref}%`]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      // P2.1 — scope : un partenaire ne voit que ses propres transactions
      if (req.scopeGln && !rows.some((r) => r.sender_gln === req.scopeGln || r.receiver_gln === req.scopeGln)) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      // Reconstruct a timeline of status transitions from the row(s)
      const main = rows[0];
      const timeline = [];

      timeline.push({
        status:    'RECEIVED',
        at:        toISO(main.created_at),
        note:      `Document received from ${main.sender_gln}`,
      });

      if (main.status === 'DELIVERED' && main.delivered_at) {
        timeline.push({
          status: 'FORWARDED',
          at:     toISO(main.created_at), // forwarding happens ~instantly on hub
          note:   `Routed to ${main.receiver_gln} via ${main.transport_mode}`,
        });
        timeline.push({
          status: 'DELIVERED',
          at:     toISO(main.delivered_at),
          note:   `Successfully delivered to ${main.receiver_gln}`,
        });
      } else if (main.status === 'FAILED') {
        timeline.push({
          status: 'FAILED',
          at:     toISO(main.updated_at),
          note:   sanitizeError(main.error_message) || 'Delivery failed',
        });
      } else if (['RECEIVED', 'FORWARDED'].includes(main.status)) {
        timeline.push({
          status: main.status,
          at:     toISO(main.updated_at),
          note:   'Transmission in progress',
        });
      }

      // If there are related APERAK rows (ACK/NACK), append them
      const aperakRows = rows.filter((r) => r.document_type === 'APERAK');
      for (const aperak of aperakRows) {
        timeline.push({
          status: `APERAK_${aperak.status}`,
          at:     toISO(aperak.created_at),
          note:   `Application acknowledgement (${aperak.status}) from ${aperak.sender_gln}`,
        });
      }

      return res.json({
        success: true,
        transaction_ref: ref,
        document_type:   main.document_type,
        sender_gln:      main.sender_gln,
        receiver_gln:    main.receiver_gln,
        current_status:  main.status,
        timeline,
      });
    } catch (err) {
      console.error('[Tracking] getTransactionHistory error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/orders
   *
   * List all orders that have an order_ref set, with their lifecycle status.
   * Filters: buyer_gln, supplier_gln, lifecycle_status, from, to, page, limit
   *
   * lifecycle_status progression:
   *   ORDERED → CONFIRMED → SHIPPED → RECEIVED → INVOICED → COMPLETED
   *   ERROR if any step failed
   */
  async listOrders(req, res) {
    try {
      const { page, limit, offset } = parsePaging(req.query);

      const conditions = [];
      const params     = [];

      if (req.query.order_ref) {
        conditions.push('order_ref LIKE ?');
        params.push(`%${req.query.order_ref}%`);
      }
      if (req.query.gln) {
        conditions.push('(buyer_gln = ? OR supplier_gln = ?)');
        params.push(req.query.gln, req.query.gln);
      }
      if (req.query.lifecycle_status) {
        conditions.push('lifecycle_status = ?');
        params.push(req.query.lifecycle_status.toUpperCase());
      }
      if (req.query.from) {
        conditions.push('order_date >= ?');
        params.push(new Date(req.query.from));
      }
      if (req.query.to) {
        conditions.push('order_date <= ?');
        params.push(new Date(req.query.to));
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Use the view when available, fall back to manual aggregation
      let rows, total;
      try {
        const [countRows] = await db.execute(
          `SELECT COUNT(*) AS total FROM order_tracking_summary ${where}`,
          params
        );
        total = countRows[0].total;

        [rows] = await db.execute(
          `SELECT order_ref, buyer_gln, supplier_gln, order_date, last_activity,
                  total_steps, has_orders, has_ordrsp, has_desadv, has_recadv,
                  has_invoic, has_aperak, lifecycle_status, has_errors, failed_steps
           FROM order_tracking_summary
           ${where}
           ORDER BY last_activity DESC
           LIMIT ${limit} OFFSET ${offset}`,
          params
        );
      } catch (viewErr) {
        // View doesn't exist yet (migration not run) — fall back to raw query
        console.warn('[Tracking] order_tracking_summary view unavailable, using raw query');
        const rawConditions = ['order_ref IS NOT NULL'];
        const rawParams = [];
        if (req.query.order_ref) {
          rawConditions.push('order_ref LIKE ?');
          rawParams.push(`%${req.query.order_ref}%`);
        }
        // P2.1 — scope GLN aussi appliqué au fallback brut
        if (req.query.gln) {
          rawConditions.push('(sender_gln = ? OR receiver_gln = ?)');
          rawParams.push(req.query.gln, req.query.gln);
        }
        const rawWhere = `WHERE ${rawConditions.join(' AND ')}`;

        const [countRows] = await db.execute(
          `SELECT COUNT(DISTINCT order_ref) AS total FROM transactions ${rawWhere}`,
          rawParams
        );
        total = countRows[0].total;

        [rows] = await db.execute(
          `SELECT
             order_ref,
             MIN(sender_gln)  AS buyer_gln,
             MIN(created_at)  AS order_date,
             MAX(created_at)  AS last_activity,
             COUNT(*)         AS total_steps,
             MAX(status = 'FAILED') AS has_errors,
             SUM(status = 'FAILED') AS failed_steps,
             CASE
               WHEN MAX(document_type = 'APERAK') = 1 THEN 'COMPLETED'
               WHEN MAX(document_type = 'INVOIC') = 1 THEN 'INVOICED'
               WHEN MAX(document_type = 'RECADV') = 1 THEN 'RECEIVED'
               WHEN MAX(document_type = 'DESADV') = 1 THEN 'SHIPPED'
               WHEN MAX(document_type = 'ORDRSP') = 1 THEN 'CONFIRMED'
               WHEN MAX(document_type = 'ORDERS') = 1 THEN 'ORDERED'
               WHEN MAX(status = 'FAILED') = 1        THEN 'ERROR'
               ELSE 'IN_PROGRESS'
             END AS lifecycle_status
           FROM transactions
           ${rawWhere}
           GROUP BY order_ref
           ORDER BY last_activity DESC
           LIMIT ${limit} OFFSET ${offset}`,
          rawParams
        );
      }

      return res.json({
        success: true,
        data: rows.map((r) => ({
          order_ref:        r.order_ref,
          buyer_gln:        r.buyer_gln,
          supplier_gln:     r.supplier_gln || null,
          lifecycle_status: r.lifecycle_status,
          has_errors:       Boolean(r.has_errors),
          failed_steps:     Number(r.failed_steps || 0),
          total_steps:      Number(r.total_steps),
          steps_completed: {
            ordered:   Boolean(r.has_orders),
            confirmed: Boolean(r.has_ordrsp),
            shipped:   Boolean(r.has_desadv),
            received:  Boolean(r.has_recadv),
            invoiced:  Boolean(r.has_invoic),
            acked:     Boolean(r.has_aperak),
          },
          order_date:     toISO(r.order_date),
          last_activity:  toISO(r.last_activity),
        })),
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error('[Tracking] listOrders error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/orders/:orderRef
   *
   * Full lifecycle tracking for a single purchase order.
   * Returns all EDI steps (transactions) linked to this order_ref,
   * with a structured timeline showing the progression through the
   * ORDERED → CONFIRMED → SHIPPED → RECEIVED → INVOICED → COMPLETED lifecycle.
   */
  async getOrderTracking(req, res) {
    try {
      const { orderRef } = req.params;

      const [steps] = await db.execute(
        `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                status, transport_mode, payload_size, error_message,
                created_at, delivered_at, order_ref
         FROM transactions
         WHERE order_ref = ?
         ORDER BY created_at ASC`,
        [orderRef]
      );

      if (steps.length === 0) {
        // Try partial match (order_ref might be partial in older records)
        const [partialSteps] = await db.execute(
          `SELECT id, transaction_ref, sender_gln, receiver_gln, document_type,
                  status, transport_mode, payload_size, error_message,
                  created_at, delivered_at, order_ref
           FROM transactions
           WHERE order_ref LIKE ?
           ORDER BY created_at ASC`,
          [`%${orderRef}%`]
        );
        if (partialSteps.length === 0) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }
        steps.push(...partialSteps);
      }

      // P2.1 — scope : un partenaire ne suit que les commandes où il apparaît
      if (req.scopeGln && !steps.some((s) => s.sender_gln === req.scopeGln || s.receiver_gln === req.scopeGln)) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      // Derive buyer / supplier from the ORDERS step
      const ordersStep = steps.find((s) => s.document_type === 'ORDERS');
      const buyerGln    = ordersStep?.sender_gln   || steps[0].sender_gln;
      const supplierGln = ordersStep?.receiver_gln || steps[0].receiver_gln;

      // Build lifecycle steps — fixed order, each enriched with actual tx data
      const LIFECYCLE = [
        { key: 'ORDERED',   type: 'ORDERS',  label: 'Commande envoyée',       icon: '📋' },
        { key: 'CONFIRMED', type: 'ORDRSP',  label: 'Commande confirmée',      icon: '✅' },
        { key: 'SHIPPED',   type: 'DESADV',  label: 'Expédition notifiée',     icon: '🚚' },
        { key: 'RECEIVED',  type: 'RECADV',  label: 'Réception confirmée',     icon: '📦' },
        { key: 'INVOICED',  type: 'INVOIC',  label: 'Facture émise',           icon: '💰' },
        { key: 'COMPLETED', type: 'APERAK',  label: 'Acknowledgement reçu',    icon: '🔔' },
      ];

      const lifecycle = LIFECYCLE.map((lc) => {
        const tx = steps.find((s) => s.document_type === lc.type);
        return {
          key:      lc.key,
          type:     lc.type,
          label:    lc.label,
          icon:     lc.icon,
          done:     Boolean(tx && tx.status === 'DELIVERED'),
          failed:   Boolean(tx && tx.status === 'FAILED'),
          pending:  !tx,
          tx: tx ? {
            transaction_ref: tx.transaction_ref,
            status:          tx.status,
            sender_gln:      tx.sender_gln,
            receiver_gln:    tx.receiver_gln,
            transport_mode:  tx.transport_mode,
            payload_size:    tx.payload_size,
            error:           sanitizeError(tx.error_message),
            created_at:      toISO(tx.created_at),
            delivered_at:    toISO(tx.delivered_at),
            delivery_time_ms: tx.delivered_at && tx.created_at
              ? new Date(tx.delivered_at) - new Date(tx.created_at)
              : null,
          } : null,
        };
      });

      // Compute overall lifecycle status
      const hasError    = steps.some((s) => s.status === 'FAILED');
      const lastDone    = [...lifecycle].reverse().find((l) => l.done);
      const lifecycleStatus = hasError
        ? 'ERROR'
        : lastDone ? lastDone.key : 'IN_PROGRESS';

      // Completion percentage
      const donePct = Math.round(
        (lifecycle.filter((l) => l.done).length / lifecycle.length) * 100
      );

      // All raw transactions (for the detailed log section)
      const allTx = steps.map((s) => ({
        ...formatTx(s),
        order_ref: s.order_ref,
      }));

      return res.json({
        success: true,
        order_ref:        orderRef,
        buyer_gln:        buyerGln,
        supplier_gln:     supplierGln,
        lifecycle_status: lifecycleStatus,
        completion_pct:   donePct,
        has_errors:       hasError,
        order_date:       toISO(steps[0]?.created_at),
        last_activity:    toISO(steps[steps.length - 1]?.created_at),
        lifecycle,
        transactions:     allTx,
      });
    } catch (err) {
      console.error('[Tracking] getOrderTracking error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/deliveries  (P2.1)
   *
   * Suivi des livraisons : une entrée par DESADV transitant par le hub,
   * enrichie de l'acquittement APERAK et (P3.6) du statut transport.
   *
   * delivery_status : IN_TRANSIT → DELIVERED → ACKNOWLEDGED | REJECTED | FAILED
   * Filters: gln (forcé par le scope), ref, status, from, to, page, limit
   */
  async listDeliveries(req, res) {
    try {
      const { page, limit, offset } = parsePaging(req.query);

      const conditions = ["document_type = 'DESADV'"];
      const params     = [];

      if (req.query.gln) {
        conditions.push('(sender_gln = ? OR receiver_gln = ?)');
        params.push(req.query.gln, req.query.gln);
      }
      if (req.query.ref) {
        conditions.push('(transaction_ref LIKE ? OR order_ref LIKE ?)');
        params.push(`%${req.query.ref}%`, `%${req.query.ref}%`);
      }
      if (req.query.from) {
        conditions.push('created_at >= ?');
        params.push(new Date(req.query.from));
      }
      if (req.query.to) {
        conditions.push('created_at <= ?');
        params.push(new Date(req.query.to));
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM transactions ${where}`,
        params
      );

      const [rows] = await db.execute(
        `SELECT id, transaction_ref, order_ref, sender_gln, receiver_gln,
                status, aperak_status, transport_mode, payload_size,
                error_message, created_at, delivered_at, updated_at
         FROM transactions
         ${where}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      // Résolution des noms partenaires (petite table — un seul fetch)
      const [partners] = await db.execute('SELECT gln, name FROM partners');
      const nameOf = (gln) => partners.find((p) => p.gln === gln)?.name || null;

      // P3.6 — ordres de transport liés (par réf DESADV extraite ou order_ref)
      let transports = [];
      try {
        const [tRows] = await db.execute(
          `SELECT ref, order_ref, desadv_ref, carrier_code, status, tracking_number
           FROM edi_transport_orders ORDER BY created_at DESC LIMIT 500`
        );
        transports = tRows;
      } catch { /* table absente : transport reste null */ }

      const deriveStatus = (r) => {
        if (r.status === 'FAILED') return 'FAILED';
        if (r.aperak_status === 'NACK') return 'REJECTED';
        if (r.aperak_status === 'ACK') return 'ACKNOWLEDGED';
        if (r.status === 'DELIVERED') return 'DELIVERED';
        return 'IN_TRANSIT';
      };

      let data = rows.map((r) => {
        // transaction_ref forme "DESADV-<numéro>-<ts>" → extraire le numéro DESADV
        const m = /^DESADV-(.+)-\d+$/.exec(r.transaction_ref);
        const desadvNumber = m ? m[1] : null;
        // P3.6 — rattacher l'ordre de transport (réf DSADV prioritaire, sinon réf commande)
        const to = transports.find((t) =>
          (desadvNumber && t.desadv_ref === desadvNumber) ||
          (r.order_ref && t.order_ref === r.order_ref)
        );
        return {
          transaction_ref: r.transaction_ref,
          desadv_number:   desadvNumber,
          order_ref:       r.order_ref,
          sender_gln:      r.sender_gln,
          sender_name:     nameOf(r.sender_gln),
          receiver_gln:    r.receiver_gln,
          receiver_name:   nameOf(r.receiver_gln),
          delivery_status: deriveStatus(r),
          hub_status:      r.status,
          aperak_status:   r.aperak_status,
          transport: to ? { // P3.6 — statut transport temps réel
            ref:             to.ref,
            carrier_code:    to.carrier_code,
            status:          to.status,
            tracking_number: to.tracking_number,
          } : null,
          error:           sanitizeError(r.error_message),
          created_at:      toISO(r.created_at),
          delivered_at:    toISO(r.delivered_at),
          updated_at:      toISO(r.updated_at),
        };
      });

      // Filtre optionnel sur le statut dérivé
      if (req.query.status) {
        const wanted = req.query.status.toUpperCase();
        data = data.filter((d) => d.delivery_status === wanted);
      }

      return res.json({
        success: true,
        data,
        pagination: {
          total: Number(countRows[0].total),
          page,
          limit,
          pages: Math.ceil(Number(countRows[0].total) / limit),
        },
      });
    } catch (err) {
      console.error('[Tracking] listDeliveries error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * GET /api/tracking/transports  (P3.6)
   *
   * Ordres de transport : carrier → SES ordres (carrier_code de la clé),
   * internal → tous. (Partner : accès refusé — il voit le transport via /deliveries.)
   */
  async listTransports(req, res) {
    try {
      const client = req.trackingClient || {};
      const role = client.role || 'partner';
      if (role !== 'internal' && role !== 'carrier') {
        return res.status(403).json({ success: false, error: 'Reserved for carrier or internal roles' });
      }
      if (role === 'carrier' && !client.carrier_code) {
        return res.status(403).json({ success: false, error: 'API key has no carrier_code configured' });
      }

      const model = require('../services/TransportOrderModel');
      const rows = await model.list({
        carrier_code: role === 'carrier' ? client.carrier_code : req.query.carrier_code,
        status: req.query.status,
        limit: Math.min(200, parseInt(req.query.limit || '100', 10)),
      });
      return res.json({
        success: true,
        data: rows.map((t) => ({
          ref:             t.ref,
          order_ref:       t.order_ref,
          desadv_ref:      t.desadv_ref,
          carrier_code:    t.carrier_code,
          country_code:    t.country_code,
          status:          t.status,
          tracking_number: t.tracking_number,
          created_at:      toISO(t.created_at),
          updated_at:      toISO(t.updated_at),
        })),
      });
    } catch (err) {
      console.error('[Tracking] listTransports error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }

  /**
   * POST /api/tracking/transports/:ref/status  (P3.6)
   * Body : { status: 'ACCEPTED'|'IN_TRANSIT'|'DELIVERED'|'FAILED' }
   *
   * Le transporteur met à jour le statut de SON ordre (transitions légales
   * uniquement — machine à états du modèle).
   */
  async updateTransportStatus(req, res) {
    try {
      const client = req.trackingClient || {};
      const role = client.role || 'partner';
      if (role !== 'carrier' && role !== 'internal') {
        return res.status(403).json({ success: false, error: 'Reserved for carrier or internal roles' });
      }

      const model = require('../services/TransportOrderModel');
      const order = await model.getByRef(req.params.ref);
      if (!order) return res.status(404).json({ success: false, error: 'Transport order not found' });
      if (role === 'carrier' && order.carrier_code !== client.carrier_code) {
        return res.status(403).json({ success: false, error: 'This transport order belongs to another carrier' });
      }

      const newStatus = String(req.body?.status || '').toUpperCase();
      const allowed = ['ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({ success: false, error: `status must be one of ${allowed.join(', ')}` });
      }

      try {
        const updated = await model.transition(req.params.ref, newStatus, {
          error_message: req.body?.comment || undefined,
        });
        return res.json({ success: true, data: { ref: updated.ref, status: updated.status } });
      } catch (err) {
        const code = err.statusCode || 500;
        return res.status(code).json({ success: false, error: err.message });
      }
    } catch (err) {
      console.error('[Tracking] updateTransportStatus error:', err.message);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
  }
}

module.exports = new TrackingController();
