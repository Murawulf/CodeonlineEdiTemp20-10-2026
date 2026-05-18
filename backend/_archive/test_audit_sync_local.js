const auditLogger = require('./services/communication/AuditLogger');
const { runUpdate, queryOne } = require('./db_utils');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Setup DB
const DB_PATH = path.join(__dirname, 'EntiteDb.db');
const db = new sqlite3.Database(DB_PATH);
auditLogger.setDb(db);

async function testSyncFlow() {
    console.log('--- Starting Offline Audit Sync Test ---');

    const transactionId = uuidv4();
    const sender = 'GLN_SENDER_SYNC';
    const receiver = 'GLN_RECEIVER_SYNC';

    try {
        // 1. Log Offline
        console.log(`Logging offline transaction ${transactionId}...`);
        await auditLogger.logOffline(transactionId, sender, receiver, 'ORDERS', 'DELIVERED');

        // Verify it's in DB and unsynced
        let row = await queryOne(db, "SELECT * FROM offline_audit_logs WHERE transaction_id = ?", [transactionId]);
        if (row && row.synced_to_hub === 0) {
            console.log('✅ Log inserted successfully and is unsynced.');
        } else {
            console.error('❌ Log insertion failed or invalid state.', row);
            return;
        }

        // 2. Simulate Worker Sync (Success)
        console.log('Simulating successful sync...');
        // Assume axios.post succeeded
        await auditLogger.markAsSynced([transactionId]);

        // Verify it's marked as synced
        row = await queryOne(db, "SELECT * FROM offline_audit_logs WHERE transaction_id = ?", [transactionId]);
        if (row && row.synced_to_hub === 1 && row.synced_at) {
            console.log('✅ Log marked as synced successfully.');
            console.log('Synced At:', row.synced_at);
        } else {
            console.error('❌ Failed to mark log as synced.', row);
        }

    } catch (err) {
        console.error('Test Error:', err);
    }
}

testSyncFlow();
