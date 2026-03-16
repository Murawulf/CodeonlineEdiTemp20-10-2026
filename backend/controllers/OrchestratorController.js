const crypto = require('crypto');
const { queryDB, runUpdate } = require('../db_utils');
const configService = require('../services/configService');
const axios = require('axios');

class OrchestratorController {
  constructor() {
    // In a real app, we might inject the DB connection or use a singleton
    // Here we assume we can access the global entiteDB or similar, 
    // but better to pass it or require it if it's a module.
    // For now, I'll assume we can pass the DB instance when initializing the controller
    // or require it from a central module if available. 
    // Since server.js has entiteDB, we might need to export it or pass it.
    // I will try to require the pool from config/database if it exists, or rely on injection.
  }

  setDb(db) {
    this.db = db;
  }

  /**
   * Endpoint: POST /api/orchestrator/relay
   * Receives an encrypted envelope with cleartext header.
   * Logs to audit, forwards to recipient, updates audit.
   */
  async relayMessage(req, res) {
    const { header, envelope } = req.body;
    
    // 1. Basic Validation
    if (!header || !envelope) {
      return res.status(400).json({ error: 'Invalid format: header and envelope required' });
    }
    const { sender_gln, receiver_gln, transaction_id, message_type } = header;
    if (!sender_gln || !receiver_gln || !transaction_id) {
        return res.status(400).json({ error: 'Missing required header fields' });
    }

    const auditId = crypto.randomUUID();
    const receivedAt = new Date();

    try {
        // 2. Audit: RECEIVED_BY_HUB
        // Using runUpdate from db_utils
        await runUpdate(this.db, `
            INSERT INTO audit_ledger 
            (id, transaction_id, sender_gln, receiver_gln, message_type, status, transport_mode, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            auditId, 
            transaction_id, 
            sender_gln, 
            receiver_gln, 
            message_type || 'UNKNOWN', 
            'RECEIVED_BY_HUB', 
            'ORCHESTRATOR', 
            receivedAt
        ]);

        console.log(`[Orchestrator] Received msg ${transaction_id} from ${sender_gln} to ${receiver_gln}`);

        // 3. Resolve Recipient URL
        // We need a way to map GLN to URL.
        // For now, I will use a simple mapping or helper. 
        // In the future this should come from a DB table 'network_directory'.
        const recipientUrl = await this._resolveRecipientUrl(receiver_gln);

        if (!recipientUrl) {
            throw new Error(`Recipient URL not found for GLN ${receiver_gln}`);
        }

        // 4. Forward to Recipient
        // The payload is encrypted, we just pass it through.
        // We assume the recipient has an endpoint /api/p2p/receive (Step 4)
        // or we reuse a standard receiving endpoint.
        const forwardUrl = `${recipientUrl}/api/p2p/receive`; 
        console.log(`[Orchestrator] Forwarding to ${forwardUrl}...`);

        const response = await axios.post(forwardUrl, {
            header,
            envelope
        }, {
            timeout: 10000 // 10s timeout
        });

        // 5. Audit: DELIVERED
        await runUpdate(this.db, `
            UPDATE audit_ledger 
            SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [auditId]);

        console.log(`[Orchestrator] Message ${transaction_id} delivered successfully.`);
        
        // Return success to Sender
        return res.status(200).json({ 
            status: 'success', 
            message: 'Message relayed successfully',
            hub_audit_id: auditId
        });

    } catch (error) {
        console.error(`[Orchestrator] Relay failed for ${transaction_id}:`, error.message);

        // 6. Audit: FAILED
        // We try to update the audit log even if forwarding failed
        try {
            await runUpdate(this.db, `
                UPDATE audit_ledger 
                SET status = 'FAILED', error_reason = ?
                WHERE id = ?
            `, [error.message, auditId]);
        } catch (auditErr) {
            console.error('[Orchestrator] Failed to update audit log:', auditErr);
        }

        return res.status(502).json({ 
            error: 'Relay failed', 
            details: error.message,
            hub_audit_id: auditId
        });
    }
  }

  /**
   * Helper to resolve GLN to URL.
   * This should eventually query a database.
   */
  async _resolveRecipientUrl(gln) {
      // Temporary mock mapping based on configService or static map
      // In production, query 'network_directory' table
      
      // Try to find if it's one of the known countries
      // This is a simplistic heuristic for the MVP
      // We should probably allow the user to define this in a better way
      
      // For now, let's assume we can query the `comptes` or `entites` table if they are local?
      // No, the Orchestrator is a Hub. It should have a directory.
      
      // Let's fallback to a mock for the test environment or use configService if possible
      
      // Use configService to look up country URLs if we can map GLN to Country
      // Example: Senegal GLN starts with 6, Tunisia with 6? (Just guessing)
      
      // BETTER: Query a 'network_nodes' table.
      // I will check if I can query the DB for this.
      
      // If db is available:
      if (this.db) {
          try {
              // Check if we have a table for this (we might need to create it)
              // For now, let's mock it or use the existing configService.getCountryApiUrl logic
              // if we can guess the country.
              
              // If we are in the context of the Hub, we might have a `users` table where we store GLNs?
              // Or `entites`.
              
              const node = await queryDB(this.db, "SELECT api_url FROM network_directory WHERE gln = ?", [gln]);
              if (node && node.length > 0) {
                  return node[0].api_url;
              }
          } catch (e) {
              // Table might not exist yet
          }
      }

      // Hardcoded fallback for known test GLNs or patterns
      if (gln === 'GLN_SENEGAL' || gln === 'SN02583102G3') return configService.getCountryApiUrl('senegal');
      if (gln === 'GLN_TUNISIA' || gln === '619...') return configService.getCountryApiUrl('tunisia');
      
      // Local loopback for testing
      if (gln === 'GLN_TEST_123') return 'http://localhost:5001';

      return null; 
  }

  /**
   * Endpoint: POST /api/audit/sync
   * Receives offline logs from nodes that were in P2P mode.
   */
  async syncOfflineLogs(req, res) {
      const { logs } = req.body;
      if (!Array.isArray(logs)) {
          return res.status(400).json({ error: 'logs array required' });
      }

      let inserted = 0;
      let errors = 0;

      for (const log of logs) {
          try {
              // Check if already exists (idempotency)
              const exists = await queryDB(this.db, "SELECT 1 FROM audit_ledger WHERE transaction_id = ? AND status = ?", [log.transaction_id, log.status]);
              if (exists && exists.length > 0) continue;

              await runUpdate(this.db, `
                INSERT INTO audit_ledger 
                (id, transaction_id, sender_gln, receiver_gln, message_type, status, transport_mode, received_at, delivered_at, error_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                  crypto.randomUUID(), // Generate new Hub ID for this sync record
                  log.transaction_id,
                  log.sender_gln,
                  log.receiver_gln,
                  log.message_type,
                  log.status,
                  'P2P_SYNC', // Mark as synced from P2P
                  log.created_at, // received_at = created_at
                  log.delivered_at,
                  log.error_reason
              ]);
              inserted++;
          } catch (err) {
              console.error('[Orchestrator] Sync log error:', err.message);
              errors++;
          }
      }

      res.json({ status: 'success', synced: inserted, errors });
  }

  /**
   * Endpoint: GET /api/orchestrator/discovery
   * Returns the full network directory for nodes to cache.
   */
  async getDirectory(req, res) {
      try {
          // Query the network_directory table
          // We assume the table exists as per setup_e2e_dbs.js
          const rows = await queryDB(this.db, "SELECT gln, api_url as url FROM network_directory");
          res.json({ directory: rows });
      } catch (err) {
          console.error('[Orchestrator] Discovery failed:', err.message);
          res.status(500).json({ error: 'Discovery failed', details: err.message });
      }
  }
}

module.exports = new OrchestratorController();
