const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Worker } = require('worker_threads');
const fs = require('fs');

// Configuration
const ORCHESTRATOR_PORT = 5010;
const ORCHESTRATOR_URL = `http://localhost:${ORCHESTRATOR_PORT}`;
const TUNISIA_DB_PATH = path.join(__dirname, '../data/tunisia.db');
const ORCH_DB_PATH = path.join(__dirname, '../data/orchestrator.db');

// Helper to query DB
function queryDB(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Helper to run update
function runUpdate(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.run(sql, params, function (err) {
            db.close();
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runDiscoveryTest() {
    console.log('🚀 Starting Discovery Worker E2E Test');

    // 1. Setup Orchestrator Data
    console.log('1️⃣  Seeding Orchestrator Network Directory...');
    const testGln = `TEST_NODE_${Math.floor(Math.random() * 10000)}`;
    const testUrl = `http://localhost:${Math.floor(Math.random() * 1000) + 6000}`;
    
    // Ensure ORCHESTRATOR DB has the entry
    await runUpdate(ORCH_DB_PATH, `
        INSERT INTO network_directory (gln, api_url, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [testGln, testUrl]);
    console.log(`   ✅ Inserted ${testGln} -> ${testUrl} into Orchestrator DB`);

    // 2. Clear Tunisia Local Cache for this GLN (if exists)
    await runUpdate(TUNISIA_DB_PATH, `DELETE FROM network_directory WHERE gln = ?`, [testGln]);

    // 3. Run Discovery Worker manually
    console.log('2️⃣  Running Discovery Worker...');
    const workerPath = path.join(__dirname, '../workers/discovery_worker.js');
    
    // We run the worker as a thread, explicitly providing the TUNISIA DB path
    // via workerData which we just patched in the worker script.
    const worker = new Worker(workerPath, {
        workerData: {
            ENTITE_DB_PATH: TUNISIA_DB_PATH,
            ORCHESTRATOR_URL: ORCHESTRATOR_URL,
            dbConfig: {} // Empty to force SQLite fallback logic in worker
        }
    });

    console.log('   ⏳ Worker started, waiting for sync (5s)...');
    
    // Allow worker some time to run and fetch
    await wait(5000);
    
    console.log('   🛑 Terminating worker...');
    await worker.terminate();

    // 4. Verification
    console.log('3️⃣  Verifying Local Cache in Tunisia DB...');
    // We verify against TUNISIA DB to confirm the worker updated it
    const db = new sqlite3.Database(TUNISIA_DB_PATH);
    db.all(`SELECT api_url FROM network_directory WHERE gln = ?`, [testGln], (err, rows) => {
        db.close();
        if (err) {
            console.error('   ❌ DB Query Failed:', err.message);
            process.exit(1);
        }

        if (rows.length > 0) {
            if (rows[0].api_url === testUrl) {
                console.log(`   ✅ Success! Found ${testGln} -> ${rows[0].api_url} in local DB.`);
                process.exit(0);
            } else {
                console.error(`   ❌ Mismatch! Expected ${testUrl}, found ${rows[0].api_url}`);
                process.exit(1);
            }
        } else {
            console.error(`   ❌ Failed! GLN ${testGln} not found in local DB.`);
            process.exit(1);
        }
    });
}

runDiscoveryTest().catch(err => {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
});
