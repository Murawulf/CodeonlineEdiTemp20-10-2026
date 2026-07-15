const db = require('../config/db');
const crypto = require('crypto');
const { resolveRoute, dispatchMessage } = require('../services/routingService');

class HubController {
  
  /**
   * Endpoint: POST /api/dispatch (or /api/orchestrator/relay)
   * Receives an EDI message from a sender, logs it, and routes it to the receiver.
   */
  async relayMessage(req, res) {
    let { senderGln, receiverGln, partnerGln, eancomContent, messageType, filename, header, envelope } = req.body;
    let transactionRef = req.body.transactionRef;
    let orderRef = req.body.orderRef || null;

    // Support both direct fields (legacy) and header/envelope format (secure P2P)
    if (header) {
        senderGln = header.sender_gln || senderGln;
        receiverGln = header.receiver_gln || receiverGln;
        messageType = header.message_type || messageType;
        transactionRef = header.transaction_id || transactionRef;
        orderRef = header.order_ref || orderRef;
    } else {
        // Legacy/Direct format compatibility
        if (!receiverGln && partnerGln) receiverGln = partnerGln;
    }

    // Try to extract order_ref from filename if not provided
    // Convention: ORDERS_<orderRef>_<timestamp>.txt or <TYPE>_<orderRef>.edi
    if (!orderRef && filename) {
        const match = filename.match(/(?:ORDERS|ORDRSP|DESADV|RECADV|INVOIC|APERAK)[_-]([A-Za-z0-9\-]+)/i);
        if (match) orderRef = match[1];
    }

    if (!transactionRef) {
        transactionRef = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    const safeMessageType = messageType || 'UNKNOWN';
    const safeSenderGln = senderGln || 'UNKNOWN';
    const safeReceiverGln = receiverGln || 'UNKNOWN';

    console.log(`[Hub] Received ${safeMessageType} from ${safeSenderGln} to ${safeReceiverGln} (Ref: ${transactionRef})`);

    try {
      // 1. Audit: RECEIVED
      // Check if transaction already exists (idempotency)
      const [existing] = await db.execute('SELECT id FROM transactions WHERE transaction_ref = ?', [transactionRef]);
      
      if (existing.length === 0) {
          await db.execute(
            `INSERT INTO transactions 
            (transaction_ref, sender_gln, receiver_gln, document_type, status, payload_size, transport_mode, order_ref, created_at) 
            VALUES (?, ?, ?, ?, 'RECEIVED', ?, 'ORCHESTRATOR', ?, NOW())`,
            [transactionRef, safeSenderGln, safeReceiverGln, safeMessageType, (eancomContent ? eancomContent.length : 0), orderRef || null]
          );
      } else if (orderRef) {
          // Update order_ref if we now have it and it was missing
          await db.execute(
            'UPDATE transactions SET order_ref = ? WHERE transaction_ref = ? AND order_ref IS NULL',
            [orderRef, transactionRef]
          );
      }

      // 2. Resolve Route
      const route = await resolveRoute(safeReceiverGln);
      
      if (!route) {
        console.warn(`[Hub] No route found for GLN ${safeReceiverGln}`);
        await this._updateStatus(transactionRef, 'FAILED', 'No route found');
        return res.status(404).json({ success: false, error: 'Unknown recipient GLN', transactionRef });
      }

      // 3. Forward Message
      // Smart-route: encrypted payloads go to /api/p2p/receive, plaintext to /api/edi/receive
      let forwardUrl = route.url;
      if (header && envelope) {
        forwardUrl = forwardUrl.replace('/api/edi/receive', '/api/p2p/receive');
        console.log(`[Hub] Encrypted payload detected, routing to P2P endpoint`);
      }
      console.log(`[Hub] Routing to ${route.name} (${forwardUrl})`);
      
      const payload = req.body;

      // Add Headers
      const headers = {
        'X-Hub-Transaction-Ref': transactionRef,
        'X-Hub-Transport': 'ORCHESTRATOR'
      };

      await dispatchMessage(forwardUrl, payload, headers);

      // 4. Audit: FORWARDED / DELIVERED
      // Ideally we wait for 200 OK from recipient to mark as DELIVERED
      await this._updateStatus(transactionRef, 'DELIVERED'); // Assuming sync delivery for now
      await db.execute('UPDATE transactions SET delivered_at = NOW() WHERE transaction_ref = ?', [transactionRef]);

      res.json({
        success: true,
        message: 'Message dispatched successfully',
        transactionRef,
        route: route.name
      });

      // P3 — déclencheur auto IFTMIN : un DESADV portant un transporteur → ordre de transport.
      // Fire-and-forget APRÈS la réponse : zéro impact latence, totalement non bloquant.
      if (safeMessageType === 'DESADV' && eancomContent) {
        (async () => {
          try {
            const { parseEANCOM } = require('../services/eancom_parser');
            const { maybeCreateTransport } = require('../services/autoTransport');
            const parsed = parseEANCOM(eancomContent);
            const [pc] = await db.execute('SELECT country_code FROM partners WHERE gln = ? LIMIT 1', [safeSenderGln]);
            const countryCode = (pc[0] && pc[0].country_code) || null;
            const r = await maybeCreateTransport(
              { parsed, senderGln: safeSenderGln, receiverGln: safeReceiverGln, orderRef: orderRef || null, desadvRef: transactionRef, countryCode },
              db
            );
            console.log(`[Hub] auto-transport (${transactionRef}): ${JSON.stringify(r)}`);
          } catch (e) {
            console.warn(`[Hub] auto-transport non bloquant échoué (${transactionRef}): ${e.message}`);
          }
        })();
      }

    } catch (error) {
      console.error(`[Hub] Dispatch Failed:`, error.message);
      await this._updateStatus(transactionRef, 'FAILED', error.message);
      
      res.status(502).json({
        success: false,
        error: 'Failed to forward message',
        details: error.message,
        transactionRef
      });
    }
  }

  /**
   * Endpoint: POST /api/audit/sync
   * Receives offline logs from P2P transactions.
   */
  async syncOfflineLogs(req, res) {
    const { logs } = req.body;
    if (!Array.isArray(logs)) {
      return res.status(400).json({ error: 'logs array required' });
    }

    console.log(`[Hub] Syncing ${logs.length} offline logs...`);
    let inserted = 0;
    let errors = 0;

    for (const log of logs) {
      try {
        // Check existence
        const [exists] = await db.execute('SELECT id FROM transactions WHERE transaction_ref = ?', [log.transaction_id]);
        if (exists.length > 0) continue;

        // Convert dates to MySQL format (YYYY-MM-DD HH:MM:SS)
        const createdAt = log.created_at ? this._toMySQLDate(log.created_at) : this._toMySQLDate(new Date());
        const deliveredAt = log.delivered_at ? this._toMySQLDate(log.delivered_at) : null;

        await db.execute(
          `INSERT INTO transactions 
          (transaction_ref, sender_gln, receiver_gln, document_type, status, transport_mode, error_message, created_at, delivered_at)
          VALUES (?, ?, ?, ?, ?, 'P2P_SYNC', ?, ?, ?)`,
          [
            log.transaction_id,
            log.sender_gln,
            log.receiver_gln,
            log.message_type,
            log.status,
            log.error_reason || null,
            createdAt,
            deliveredAt
          ]
        );
        inserted++;
      } catch (err) {
        console.error(`[Hub] Failed to sync log ${log.transaction_id}:`, err.message);
        errors++;
      }
    }

    res.json({ status: 'success', success: true, synced: inserted, errors });
  }

  /**
   * Endpoint: GET /api/discovery
   * Returns directory of partners.
   */
  async getDirectory(req, res) {
    try {
      const [rows] = await db.execute("SELECT gln, target_url as url, name, country_code FROM partners WHERE status = 'ACTIVE'");
      res.json({ directory: rows });
    } catch (err) {
      console.error('[Hub] Discovery failed:', err.message);
      res.status(500).json({ error: 'Discovery failed' });
    }
  }

  _toMySQLDate(input) {
    if (!input) return null;
    const d = new Date(input);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  async _updateStatus(ref, status, error = null) {
    try {
      await db.execute(
        'UPDATE transactions SET status = ?, error_message = ? WHERE transaction_ref = ?',
        [status, error, ref]
      );
    } catch (e) {
      console.error('[Hub] DB Update Error:', e.message);
    }
  }
}

module.exports = new HubController();
