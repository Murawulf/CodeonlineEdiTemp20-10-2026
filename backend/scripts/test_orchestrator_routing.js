const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Paths to DBs
const TUNISIA_DB_PATH = path.join(__dirname, '../data/tunisia.db');
const SENEGAL_DB_PATH = path.join(__dirname, '../data/senegal.db');
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

async function runOrchestratorTest() {
    console.log('🚀 Starting Orchestrator Routing E2E Test');

    const testId = Math.floor(Math.random() * 10000);
    const filename = `ORCH_TEST_${Date.now()}_${testId}.txt`;
    const content = `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${testId}'UNH+1+ORDERS:D:96A:UN:EAN008'BGM+220+${testId}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+21:100'MOA+203:500'UNS+S'CNT+2:1'UNT+9+1'UNZ+1+${testId}'`;

    console.log(`1️⃣  Injecting OUTBOUND ORDERS (ID: ${testId}) into Tunisia DB...`);

    const result = await runUpdate(TUNISIA_DB_PATH, `
        INSERT INTO edi_transmissions 
        (direction, document_type, partner_gln, status, file_content, filename, related_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, ['OUTBOUND', 'ORDERS', 'SN02583102G3', 'PENDING', content, filename, 'ORDER']);

    const transmissionId = result.lastID;
    console.log(`   ✅ Injected Transmission #${transmissionId} [PENDING]`);

    // 2. Poll Tunisia DB for SENT status
    console.log('2️⃣  Waiting for Tunisia Worker to process (PENDING -> SENT)...');
    let attempts = 0;
    let sent = false;
    
    while (attempts < 60) {
        await wait(1000);
        const rows = await queryDB(TUNISIA_DB_PATH, `SELECT status, logs, error_message FROM edi_transmissions WHERE id = ?`, [transmissionId]);
        if (rows.length > 0) {
            const tx = rows[0];
            if (tx.status === 'SENT') {
                console.log(`   ✅ Status changed to SENT!`);
                console.log(`   📝 Logs: ${tx.logs}`);
                if (tx.logs.includes('SENT_TO_HUB') || tx.logs.includes('ORCHESTRATOR')) {
                    console.log('   ✅ Log confirms routing via ORCHESTRATOR');
                } else {
                    console.warn('   ⚠️ Log suggests P2P or unknown mode:', tx.logs);
                }
                sent = true;
                break;
            } else if (tx.status === 'ERROR') {
                console.error(`   ❌ Transmission FAILED: ${tx.error_message}`);
                break;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!sent) {
        console.error('\n   ❌ Timeout waiting for SENT status.');
        process.exit(1);
    }

    // 3. Check Orchestrator Audit Ledger
    console.log('3️⃣  Checking Orchestrator DB (audit_ledger)...');
    attempts = 0;
    let hubAudit = false;

    while (attempts < 10) {
        await wait(1000);
        const rows = await queryDB(ORCH_DB_PATH, `
            SELECT * FROM audit_ledger 
            WHERE sender_gln = '6191234567890' 
            AND receiver_gln = 'SN02583102G3' 
            ORDER BY received_at DESC LIMIT 1
        `);

        if (rows.length > 0) {
            const log = rows[0];
            // Check recency (within last 2 mins)
            const logTime = new Date(log.received_at).getTime();
            if (Date.now() - logTime < 120000) {
                console.log(`   ✅ Found Audit Record in Hub!`);
                console.log(`      ID: ${log.id}`);
                console.log(`      Status: ${log.status}`);
                console.log(`      Type: ${log.message_type}`);
                console.log(`      Transport: ${log.transport_mode}`);
                hubAudit = true;
                break;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!hubAudit) {
        console.warn('\n   ⚠️ No recent audit log found in Orchestrator. Did it fallback to P2P?');
    }

    // 4. Check Senegal DB
    console.log('4️⃣  Checking Senegal DB for INBOUND receipt...');
    attempts = 0;
    let received = false;

    while (attempts < 20) {
        await wait(1000);
        const rows = await queryDB(SENEGAL_DB_PATH, `
            SELECT * FROM edi_transmissions 
            WHERE direction = 'INBOUND' 
            AND partner_gln = '6191234567890' 
            ORDER BY id DESC LIMIT 1
        `);

        if (rows.length > 0) {
            const rx = rows[0];
            if (rx.filename === filename || rx.file_content === content) {
                console.log(`   ✅ Received INBOUND transmission in Senegal DB!`);
                console.log(`      ID: ${rx.id}`);
                console.log(`      Status: ${rx.status}`);
                received = true;
                break;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!received) {
        console.error('\n   ❌ Timeout waiting for INBOUND receipt in Senegal.');
        process.exit(1);
    }

    console.log('\n🎉 ORCHESTRATOR ROUTING TEST COMPLETE!');
    if (hubAudit) console.log('   ✅ Validated: Tunisia -> Orchestrator -> Senegal');
    else console.log('   ⚠️ Validated: Tunisia -> Senegal (Likely P2P Fallback)');
}

runOrchestratorTest().catch(err => {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
});
