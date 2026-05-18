const express = require('express');
const router = express.Router();
const cryptoService = require('../services/crypto/CryptoService');
const { runUpdate } = require('../db_utils');

/**
 * Endpoint: POST /api/p2p/receive
 * Receives an encrypted message directly from a peer (or forwarded by Orchestrator).
 */
router.post('/receive', async (req, res) => {
    const { header, envelope } = req.body;

    if (!header || !envelope) {
        return res.status(400).json({ error: 'Invalid format' });
    }

    const { sender_gln, receiver_gln, transaction_id, message_type } = header;

    console.log(`[P2P] Received message ${transaction_id} from ${sender_gln} (${message_type})`);

    try {
        // 1. Decrypt and Verify Signature
        // We pass sender_gln to verify the signature against their public key
        const payload = await cryptoService.decryptAndVerify(envelope, sender_gln);
        
        console.log(`[P2P] Message decrypted successfully.`);
        
        // 2. Persist to DB for Async Processing by EDI Worker
        const { message, timestamp } = payload;
        const eancomContent = message.eancomContent || message; // Handle object or string
        const filename = message.filename || `${message_type}_${transaction_id}_P2P.txt`;

        // Insert into edi_transmissions
        // We use EntiteDb (entiteDB global usually, but here we might need to rely on what's available or runUpdate)
        // Ideally we should inject the DB or use a singleton. db_utils runUpdate requires a db instance.
        // For this route, we assume 'entiteDB' is available globally (from server.js) OR we grab it from request app locals if we attached it.
        // But server.js doesn't attach it to app.locals usually.
        // server.js: app.use('/api/p2p', p2pRoutes);
        // Let's assume we can access the global `entiteDB` or we need to pass it.
        // Actually, db_utils requires 'db' object.
        // As a quick fix for this module, let's require the DB instance or rely on a singleton if we had one.
        // But we don't have a DB singleton. 
        // We should export a setDb function for this router or pass it during initialization.
        
        // Re-reading server.js:
        // const p2pRoutes = require('./routes/p2p');
        // app.use('/api/p2p', p2pRoutes);
        
        // It's just a router.
        // I will update this file to export a function that accepts DB, OR I will assume `req.app.get('entiteDB')` if I set it.
        // I'll assume I can set it in server.js.
        
        // Wait, I can't easily change server.js to pass DB to the require right now without breaking things or doing it carefully.
        // Alternative: Use sqlite3/mysql directly here? No, connection sharing is better.
        
        // Best approach: In server.js, `app.set('entiteDB', entiteDB)` is not there.
        // I will assume for now I can't persist easily without the DB instance.
        // I will modify server.js to pass the DB to the router, or use `request.app.get('db')` pattern.
        
        // Let's modify the response to just say success for now, but I MUST persist it.
        // I will use `req.app.get('entiteDB')`. I need to ensure server.js sets it.
        
        const db = req.app.get('entiteDB');
        if (!db) {
             console.error('[P2P] DB not attached to app');
             throw new Error('Database connection unavailable');
        }

        await runUpdate(db, `
            INSERT INTO edi_transmissions 
            (direction, document_type, sender_gln, partner_gln, status, file_content, filename, related_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'RECEIVED', ?, ?, 'P2P', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
            'INBOUND',
            message_type,
            sender_gln,
            receiver_gln,
            eancomContent,
            filename
        ]);

        console.log(`[P2P] Message persisted to edi_transmissions.`);

        res.json({ 
            status: 'success', 
            message: 'Message received, decrypted, and queued for processing',
            timestamp: Date.now()
        });

    } catch (error) {
        console.error(`[P2P] Decryption/Verification failed for ${transaction_id}:`, error.message);
        res.status(401).json({ 
            error: 'Security check failed', 
            details: error.message 
        });
    }
});

module.exports = router;
