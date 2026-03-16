const axios = require('axios');
const crypto = require('crypto');
const cryptoService = require('../crypto/CryptoService');
const discoveryCache = require('./DiscoveryCache');
const auditLogger = require('./AuditLogger');
const configService = require('../configService');

class CommunicationProvider {
  constructor() {
      // Configuration loaded lazily or via configService
      this.timeout = 10000; // 10 seconds
  }

  /**
   * Main entry point to send a message.
   * Implements Waterfall strategy:
   * 1. Try Orchestrator Primary
   * 2. Try Orchestrator Secondary (if configured)
   * 3. Fallback to P2P
   */
  async dispatch(message, targetGLN, messageType = 'UNKNOWN') {
    const senderGLN = configService.get('MY_GLN') || 'MY_GLN_UNKNOWN';
    
    // DEBUG: Log config status
    if (senderGLN === 'MY_GLN_UNKNOWN') {
        console.error('[CommunicationProvider] ⚠️ MY_GLN is missing in configService!');
        console.error('[CommunicationProvider] Config Cache Keys:', Object.keys(configService.getAll()));
        console.error('[CommunicationProvider] Env MY_GLN:', process.env.MY_GLN);
    }

    const transactionId = crypto.randomUUID();
    
    // Prepare Payload
    const payload = {
        message, // The actual EDI content or Object
        timestamp: Date.now()
    };

    console.log(`[CommunicationProvider] Dispatching ${transactionId} to ${targetGLN}`);

    // 1. E2EE Encryption
    let envelope;
    try {
        envelope = await cryptoService.encryptAndSign(payload, targetGLN);
    } catch (err) {
        console.error('[CommunicationProvider] Encryption failed:', err.message);
        throw err; // Abort if we can't encrypt
    }

    const transmissionPacket = {
        header: {
            sender_gln: senderGLN,
            receiver_gln: targetGLN,
            transaction_id: transactionId,
            message_type: messageType
        },
        envelope
    };

    // 2. Try Orchestrator (Hub)
    try {
        const result = await this._tryOrchestrator(transmissionPacket);
        return { 
            status: 'SENT_TO_HUB', 
            mode: 'ORCHESTRATOR', 
            hub_response: result 
        };
    } catch (orchErr) {
        console.warn(`[CommunicationProvider] Orchestrator unreachable (${orchErr.message}). Attempting P2P...`);
    }

    // 3. Fallback P2P
    try {
        const result = await this._tryP2P(transmissionPacket, targetGLN);
        
        // Log successful P2P to local audit for later sync
        await auditLogger.logOffline(transactionId, senderGLN, targetGLN, messageType, 'DELIVERED');
        
        return { 
            status: 'SENT_P2P', 
            mode: 'P2P', 
            peer_response: result 
        };
    } catch (p2pErr) {
        console.error(`[CommunicationProvider] P2P failed: ${p2pErr.message}`);
        
        // Log failed P2P
        await auditLogger.logOffline(transactionId, senderGLN, targetGLN, messageType, 'FAILED', p2pErr.message);
        
        throw new Error(`All transport methods failed. Last error: ${p2pErr.message}`);
    }
  }

  async _tryOrchestrator(packet) {
      // Get URLs from config
      const primaryUrl = configService.get('ORCHESTRATOR_URL');
      if (!primaryUrl) throw new Error('ORCHESTRATOR_URL not configured');

      const targetUrl = `${primaryUrl}/api/orchestrator/relay`;
      
      console.log(`[CommunicationProvider] Trying Hub: ${targetUrl}`);
      const response = await axios.post(targetUrl, packet, { 
          timeout: this.timeout,
          headers: { 'x-api-pin': configService.get('API_PIN') }
      });
      return response.data;
  }

  async _tryP2P(packet, targetGLN) {
      // Resolve IP
      const targetBaseUrl = await discoveryCache.resolve(targetGLN);
      if (!targetBaseUrl) {
          throw new Error(`Could not resolve P2P URL for GLN ${targetGLN}`);
      }

      const targetUrl = `${targetBaseUrl}/api/p2p/receive`;
      console.log(`[CommunicationProvider] Trying P2P: ${targetUrl}`);

      // We send the same packet (encrypted). 
      // The receiver must be able to decrypt it using their private key.
      const response = await axios.post(targetUrl, packet, { timeout: this.timeout });
      return response.data;
  }
}

module.exports = new CommunicationProvider();
