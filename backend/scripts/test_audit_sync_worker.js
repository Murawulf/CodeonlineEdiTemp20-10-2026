const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');
const { Worker } = require('worker_threads');
const fs = require('fs');

// Configuration
const ORCHESTRATOR_PORT = 5010;
const ORCHESTRATOR_URL = `http://localhost:${ORCHESTRATOR_PORT}`;
const TUNISIA_DB_PATH = path.join(__dirname, '../data/tunisia.db');

// Orchestrator MySQL Config (Matches edi_orchestrator/.env)
const ORCH_DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'codeonline_edi_db'
};

// Helper to query SQLite
function querySQLite(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Helper to run update on SQLite
function runSQLiteUpdate(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.run(sql, params, function (err) {
            db.close();
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Helper to query MySQL
async function queryMySQL(sql, params = []) {
    const connection = await mysql.createConnection(ORCH_DB_CONFIG);
    const [rows] = await connection.execute(sql, params);
    await connection.end();
    return rows;
}

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAuditSyncTest() {
    console.log('🚀 Starting Audit Sync Worker E2E Test');

    const testTxId = `TX_OFFLINE_${Math.floor(Math.random() * 100000)}`;
    
    // 1. Insert Offline Log in Tunisia DB (SQLite)
    console.log(`1️⃣  Injecting Offline Log ${testTxId} into Tunisia DB...`);
    
    // Ensure table exists (idempotent)
    const db = new sqlite3.Database(TUNISIA_DB_PATH);
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS offline_audit_logs (
            id TEXT PRIMARY KEY,
            transaction_id TEXT,
            sender_gln TEXT,
            receiver_gln TEXT,
            message_type TEXT,
            status TEXT,
            transport_mode TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            synced_to_hub INTEGER DEFAULT 0,
            error_reason TEXT,
            delivered_at DATETIME
        )`);
    });
    db.close();

    await runSQLiteUpdate(TUNISIA_DB_PATH, `
        INSERT INTO offline_audit_logs 
        (id, transaction_id, sender_gln, receiver_gln, message_type, status, transport_mode, created_at, synced_to_hub)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
    `, [
        `LOG_${testTxId}`, 
        testTxId, 
        '6191234567890', 
        'SN02583102G3', 
        'ORDERS', 
        'DELIVERED', 
        'P2P'
    ]);
    console.log('   ✅ Offline log inserted.');

    // 2. Run Audit Sync Worker manually
    console.log('2️⃣  Running Audit Sync Worker...');
    const workerPath = path.join(__dirname, '../workers/audit_sync_worker.js');
    
    const worker = new Worker(workerPath, {
        workerData: {
            ENTITE_DB_PATH: TUNISIA_DB_PATH,
            ORCHESTRATOR_URL: ORCHESTRATOR_URL,
            dbConfig: {} // Worker uses SQLite fallback
        }
    });

    console.log('   ⏳ Worker started, waiting for sync (10s)...');
    
    // Allow worker some time to run and push
    await wait(10000);
    
    console.log('   🛑 Terminating worker...');
    await worker.terminate();

    // 3. Verify Orchestrator Received it (MySQL)
    console.log('3️⃣  Verifying Orchestrator DB (MySQL)...');
    try {
        // Note: Orchestrator schema uses 'transactions' table, not 'audit_ledger'
        // But let's check what I mapped in HubController.syncOfflineLogs
        // HubController maps it to 'transactions' table with transport_mode = 'P2P_SYNC'
        const hubRows = await queryMySQL(`SELECT * FROM transactions WHERE transaction_ref = ?`, [testTxId]);
        
        if (hubRows.length > 0) {
            console.log(`   ✅ Success! Found transaction ${testTxId} in Orchestrator Transactions table.`);
            if (hubRows[0].transport_mode === 'P2P_SYNC') {
                console.log('      ✅ Correct transport_mode: P2P_SYNC');
            } else {
                 console.warn(`      ⚠️  Unexpected transport_mode: ${hubRows[0].transport_mode}`);
            }
        } else {
            console.error(`   ❌ Failed! Transaction ${testTxId} not found in Orchestrator DB.`);
            console.log('      Debug: Checking recent transactions...');
            const recent = await queryMySQL(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5`);
            console.log('      Recent:', recent);
            process.exit(1);
        }
    } catch (dbErr) {
        console.error('   ❌ Failed to query Orchestrator MySQL:', dbErr.message);
        process.exit(1);
    }

    // 4. Verify Local DB Marked as Synced (SQLite)
    console.log('4️⃣  Verifying Local DB Synced Status...');
    const localRows = await querySQLite(TUNISIA_DB_PATH, `SELECT synced_to_hub FROM offline_audit_logs WHERE transaction_id = ?`, [testTxId]);
    
    if (localRows.length > 0) {
        if (localRows[0].synced_to_hub === 1) {
            console.log('   ✅ Success! Local log marked as synced (1).');
        } else {
            console.error(`   ❌ Failed! Local log synced_to_hub is ${localRows[0].synced_to_hub}, expected 1.`);
            process.exit(1);
        }
    } else {
        console.error('   ❌ Failed! Local log disappeared?');
        process.exit(1);
    }

    console.log('\n🎉 Audit Sync Worker Test Passed!');
}

runAuditSyncTest().catch(err => {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
});
