'use strict';

/**
 * AckController.js
 * 
 * Receives ACK/NACK notifications from EDI nodes (buyers) after they have processed
 * an inbound EDI document (e.g. INVOIC).
 * 
 * On receipt:
 *  - Generates an EANCOM APERAK message (D.96A)
 *  - Routes it to the original sender (supplier) via the existing routingService
 *  - Updates the transaction audit log in the hub database
 * 
 * Architecture: Star topology (Hub-and-Spoke).
 * Nodes NEVER send directly to each other — they POST here, and the hub routes onward.
 * 
 * Endpoint: POST /api/orchestrator/ack
 * 
 * Request body:
 * {
 *   transmission_id: number,      // edi_transmissions.id on the node side (for traceability)
 *   original_ref:   string,       // Document number of the original EDI message (e.g. invoice number)
 *   original_type:  string,       // Message type of the original document, e.g. 'INVOIC' (default)
 *   sender_gln:     string,       // GLN of the ACK sender = the buyer who received the document
 *   receiver_gln:   string,       // GLN of the APERAK destination = the supplier who sent the document
 *   status:         'ACK'|'NACK', // Whether processing succeeded or failed
 *   error_code:     string?,      // EDIFACT error code (required when status = 'NACK')
 *   error_text:     string?,      // Human-readable error description (optional)
 * }
 */

const db = require('../config/db');
const { resolveRoute, dispatchMessage } = require('../services/routingService');
const { generateAperakEANCOM } = require('../services/generateAperakEANCOM');

class AckController {

  /**
   * POST /api/orchestrator/ack
   * Receive an ACK or NACK from a node, generate and dispatch the APERAK.
   */
  async handleAck(req, res) {
    const {
      transmission_id,
      original_ref,
      original_type = 'INVOIC',
      sender_gln,
      receiver_gln,
      status,
      error_code = null,
      error_text = null,
    } = req.body;

    // ─── Validate required fields ──────────────────────────────────────────
    if (!original_ref || !sender_gln || !receiver_gln || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: original_ref, sender_gln, receiver_gln, status',
      });
    }

    if (!['ACK', 'NACK'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be either "ACK" or "NACK"',
      });
    }

    if (status === 'NACK' && !error_code) {
      return res.status(400).json({
        success: false,
        error: 'error_code is required when status is "NACK"',
      });
    }

    console.log(`[Hub/ACK] Received ${status} from ${sender_gln} for doc "${original_ref}" (type: ${original_type})`);

    try {
      // ─── Step 1: Generate the APERAK EANCOM message ──────────────────────
      const aperakContent = generateAperakEANCOM({
        originalRef:     original_ref,
        originalMsgType: original_type,
        senderGln:       sender_gln,
        receiverGln:     receiver_gln,
        aperakType:      status,
        errorCode:       error_code,
        errorText:       error_text,
      });

      console.log(`[Hub/ACK] APERAK generated (${status}), routing to ${receiver_gln}...`);

      // ─── Step 2: Resolve route for the supplier (receiver_gln) ────────────
      const route = await resolveRoute(receiver_gln);

      if (!route) {
        console.error(`[Hub/ACK] No route found for supplier GLN: ${receiver_gln}`);
        await this._logAckEvent(transmission_id, original_ref, status, 'APERAK_ROUTE_FAILED', `No route for GLN ${receiver_gln}`);
        return res.status(404).json({
          success: false,
          error: `No route found for receiver GLN: ${receiver_gln}`,
        });
      }

      // ─── Step 3: Dispatch the APERAK to the supplier node ─────────────────
      const transactionRef = `APERAK-${original_ref}-${Date.now()}`;
      const payload = {
        senderGln:      sender_gln,
        receiverGln:    receiver_gln,
        messageType:    'APERAK',
        eancomContent:  aperakContent,
        filename:       `APERAK_${original_ref}.txt`,
        transactionRef,
      };

      const forwardHeaders = {
        'X-Hub-Transaction-Ref': transactionRef,
        'X-Hub-Transport':       'ORCHESTRATOR',
      };

      await dispatchMessage(route.url, payload, forwardHeaders);

      console.log(`[Hub/ACK] ✅ APERAK dispatched to ${route.name} (${route.url})`);

      // ─── Step 4: Audit log in hub DB ──────────────────────────────────────
      await this._logAckEvent(transmission_id, original_ref, status, 'APERAK_SENT', null);

      // Also insert a new transaction record for this APERAK
      // (order_ref = original_ref pour relier l'APERAK au document acquitté)
      try {
        await db.execute(
          `INSERT INTO transactions
           (transaction_ref, sender_gln, receiver_gln, document_type, status, payload_size, transport_mode, order_ref, created_at, delivered_at)
           VALUES (?, ?, ?, 'APERAK', 'DELIVERED', ?, 'ORCHESTRATOR', ?, NOW(), NOW())`,
          [transactionRef, sender_gln, receiver_gln, aperakContent.length, original_ref || null]
        );
      } catch (dbErr) {
        // Non-blocking — the APERAK was already dispatched
        console.warn(`[Hub/ACK] Could not insert APERAK transaction log: ${dbErr.message}`);
      }

      // P2.1 — refléter l'ACK/NACK sur la transaction du document original
      // (colonne aperak_status, consommée par l'API tracking /deliveries)
      try {
        await db.execute(
          `UPDATE transactions SET aperak_status = ?
           WHERE document_type = ?
             AND (transaction_ref = ? OR transaction_ref LIKE ? OR order_ref = ?)`,
          [
            status === 'NACK' ? 'NACK' : 'ACK',
            original_type || 'INVOIC',
            original_ref,
            `${original_type || 'DOC'}-${original_ref}-%`,
            original_ref,
          ]
        );
      } catch (dbErr) {
        console.warn(`[Hub/ACK] Could not update aperak_status on original tx: ${dbErr.message}`);
      }

      // ─── Step 5: Respond to the node ──────────────────────────────────────
      return res.json({
        success: true,
        message: `APERAK (${status}) generated and dispatched to ${receiver_gln}`,
        transactionRef,
        route: route.name,
      });

    } catch (err) {
      console.error(`[Hub/ACK] ❌ Failed to process ACK:`, err.message);
      await this._logAckEvent(transmission_id, original_ref, status, 'APERAK_FAILED', err.message);

      return res.status(500).json({
        success: false,
        error: 'Failed to generate or dispatch APERAK',
        details: err.message,
      });
    }
  }

  /**
   * Update the original transaction status in the hub DB.
   * Non-throwing — logs errors but does not block response.
   */
  async _logAckEvent(transmissionId, originalRef, ackStatus, hubStatus, errorMsg) {
    try {
      // Update the original INVOIC transaction by matching its original_ref
      await db.execute(
        `UPDATE transactions SET status = ?, error_message = ? WHERE transaction_ref LIKE ?`,
        [hubStatus, errorMsg || null, `%${originalRef}%`]
      );
    } catch (e) {
      console.warn(`[Hub/ACK] DB log error: ${e.message}`);
    }
  }
}

module.exports = new AckController();
