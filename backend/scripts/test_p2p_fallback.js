const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Paths to DBs
const TUNISIA_DB_PATH = path.join(__dirname, '../data/tunisia.db');
const SENEGAL_DB_PATH = path.join(__dirname, '../data/senegal.db');

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

async function runP2PFallbackTest() {
    console.log('🚀 Starting P2P Fallback E2E Test (Orchestrator DOWN)');
    
    const testId = Math.floor(Math.random() * 10000);
    const filename = `ORDERS_FALLBACK_${Date.now()}_${testId}.txt`;
    const content = `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${testId}'UNH+1+ORDERS:D:96A:UN:EAN008'BGM+220+${testId}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+21:100'MOA+203:500'UNS+S'CNT+2:1'UNT+9+1'UNZ+1+${testId}'`;

    console.log(`\n🔹 Testing ORDERS (ID: ${testId})...`);

    // 1. Inject
    const result = await runUpdate(TUNISIA_DB_PATH, `
        INSERT INTO edi_transmissions 
        (direction, document_type, partner_gln, status, file_content, filename, related_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, ['OUTBOUND', 'ORDERS', 'SN02583102G3', 'PENDING', content, filename, 'ORDER']);

    const transmissionId = result.lastID;
    console.log(`   [Inject] ID ${transmissionId} PENDING in Tunisia`);

    // 2. Wait for SENT
    let attempts = 0;
    let sent = false;
    process.stdout.write('   [Wait SENT] ');
    while (attempts < 60) {
        await wait(1000);
        const rows = await queryDB(TUNISIA_DB_PATH, `SELECT status, logs, error_message FROM edi_transmissions WHERE id = ?`, [transmissionId]);
        if (rows.length > 0) {
            const tx = rows[0];
            if (tx.status === 'SENT' || tx.status === 'SENT_P2P') { // Some logics might set SENT_P2P or just SENT
                sent = true;
                console.log(` ✅ SENT (Status: ${tx.status})`);
                
                // Check if routed via P2P Fallback
                console.log(`   📝 Logs: ${tx.logs}`);
                if (tx.logs.includes('SENT_P2P') || tx.logs.includes('P2P')) {
                    console.log('      ✅ Log confirms P2P routing');
                } else {
                    console.warn('      ⚠️ Log does not explicitly mention P2P');
                }
                
                if (tx.logs.includes('Orchestrator unreachable') || tx.logs.includes('ECONNREFUSED')) {
                     console.log('      ✅ Log confirms Orchestrator failure detection');
                }
                break;
            } else if (tx.status === 'ERROR') {
                console.log(` ❌ ERROR: ${tx.error_message}`);
                console.log(`   📝 Logs: ${tx.logs}`);
                process.exit(1);
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!sent) {
        console.log(' ❌ Timeout waiting for SENT');
        process.exit(1);
    }

    // 3. Check Receipt in Senegal
    attempts = 0;
    let received = false;
    process.stdout.write('   [Check Receipt] ');
    while (attempts < 20) {
        await wait(1000);
        const rows = await queryDB(SENEGAL_DB_PATH, `
            SELECT * FROM edi_transmissions 
            WHERE direction = 'INBOUND' 
            AND partner_gln = '6191234567890' 
            AND document_type = 'ORDERS'
            ORDER BY id DESC LIMIT 1
        `);

        if (rows.length > 0) {
            const rx = rows[0];
            // Check if it's the one we just sent (approximate match by filename or content)
            if (rx.file_content === content || rx.filename === filename) {
                received = true;
                console.log(` ✅ RECEIVED (ID: ${rx.id})`);
                break;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!received) {
         console.log(' ❌ Timeout waiting for RECEIPT in Senegal');
         process.exit(1);
    }

    console.log('\n🎉 P2P Fallback Test Passed Successfully!');
}

runP2PFallbackTest().catch(err => {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
});
