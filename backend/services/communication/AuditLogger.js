const { v4: uuidv4 } = require('uuid');
const { runUpdate } = require('../../db_utils');

class AuditLogger {
  constructor() {
    this.db = null;
  }

  setDb(db) {
    this.db = db;
  }

  /**
   * Logs a P2P transaction locally when Orchestrator is unavailable.
   */
  async logOffline(transactionId, senderGLN, receiverGLN, messageType, status, errorReason = null) {
    if (!this.db) {
        console.error('[AuditLogger] DB not set, cannot log offline transaction');
        return;
    }

    try {
      await runUpdate(this.db, `
        INSERT INTO offline_audit_logs 
        (id, transaction_id, sender_gln, receiver_gln, message_type, status, transport_mode, created_at, error_reason, synced_to_hub)
        VALUES (?, ?, ?, ?, ?, ?, 'P2P', CURRENT_TIMESTAMP, ?, 0)
      `, [
        uuidv4(),
        transactionId,
        senderGLN,
        receiverGLN,
        messageType,
        status,
        errorReason
      ]);
      console.log(`[AuditLogger] Offline log recorded for ${transactionId} (${status})`);
    } catch (err) {
      console.error('[AuditLogger] Failed to write offline log:', err.message);
    }
  }

  /**
   * Mark logs as synced after successful upload to Orchestrator.
   */
  async markAsSynced(transactionIds) {
      if (!this.db || !transactionIds.length) return;
      
      const placeholders = transactionIds.map(() => '?').join(',');
      try {
          await runUpdate(this.db, `
            UPDATE offline_audit_logs 
            SET synced_to_hub = 1, synced_at = CURRENT_TIMESTAMP
            WHERE transaction_id IN (${placeholders})
          `, transactionIds);
      } catch (err) {
          console.error('[AuditLogger] Failed to mark logs as synced:', err.message);
      }
  }
}

module.exports = new AuditLogger();
