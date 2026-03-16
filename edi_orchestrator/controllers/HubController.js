const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { resolveRoute, dispatchMessage } = require('../services/routingService');

class HubController {
  
  /**
   * Endpoint: POST /api/dispatch (or /api/orchestrator/relay)
   * Receives an EDI message from a sender, logs it, and routes it to the receiver.
   */
  async relayMessage(req, res) {
    let { senderGln, receiverGln, partnerGln, eancomContent, messageType, filename, header, envelope } = req.body;
    let transactionRef = req.body.transactionRef;

    // Support both direct fields (legacy) and header/envelope format (secure P2P)
    if (header && envelope) {
        senderGln = header.sender_gln;
        receiverGln = header.receiver_gln;
        messageType = header.message_type;
        transactionRef = header.transaction_id;
        // The payload is the envelope itself for forwarding
    } else {
        // Legacy/Direct format compatibility
        if (!receiverGln && partnerGln) receiverGln = partnerGln;
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
            (transaction_ref, sender_gln, receiver_gln, document_type, status, payload_size, transport_mode, created_at) 
            VALUES (?, ?, ?, ?, 'RECEIVED', ?, 'ORCHESTRATOR', NOW())`,
            [transactionRef, safeSenderGln, safeReceiverGln, safeMessageType, (eancomContent ? eancomContent.length : 0)]
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
      console.log(`[Hub] Routing to ${route.name} (${route.url})`);
      
      const forwardUrl = route.url;
      
      // Prepare Payload
      // If we received header/envelope, we forward that. 
      // If we received flat fields, we might need to restructure or forward as is depending on recipient expectation.
      // For now, we forward exactly what we received to maintain transparency.
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
