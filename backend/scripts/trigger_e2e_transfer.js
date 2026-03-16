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

async function runTest() {
    console.log('🚀 Starting E2E Transmission Test (Tunisia -> Senegal)');

    // 1. Inject OUTBOUND transmission in Tunisia DB
    console.log('1️⃣  Injecting OUTBOUND transmission into Tunisia DB...');
    const filename = `ORDER_TEST_${Date.now()}.txt`;
    const content = `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+77'UNH+1+ORDERS:D:96A:UN:EAN008'BGM+220+${Date.now()}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+21:100'MOA+203:500'UNS+S'CNT+2:1'UNT+9+1'UNZ+1+77'`;

    const result = await runUpdate(TUNISIA_DB_PATH, `
        INSERT INTO edi_transmissions 
        (direction, document_type, partner_gln, status, file_content, filename, related_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, ['OUTBOUND', 'ORDERS', 'SN02583102G3', 'PENDING', content, filename, 'ORDER']);

    const transmissionId = result.lastID;
    console.log(`   ✅ Injected Transmission #${transmissionId} [PENDING]`);

    // 2. Poll Tunisia DB for Status Change (PENDING -> SENT)
    console.log('2️⃣  Waiting for Tunisia Worker to process (PENDING -> SENT)...');
    let attempts = 0;
    let success = false;
    
    while (attempts < 60) { // Wait up to 60 seconds (Worker runs every 30s)
        await wait(1000);
        const rows = await queryDB(TUNISIA_DB_PATH, `SELECT status, error_message FROM edi_transmissions WHERE id = ?`, [transmissionId]);
        if (rows.length > 0) {
            const status = rows[0].status;
            process.stdout.write('.');
            
            if (status === 'SENT') {
                console.log(`\n   ✅ Status changed to SENT!`);
                success = true;
                break;
            } else if (status === 'ERROR') {
                console.error(`\n   ❌ Transmission FAILED: ${rows[0].error_message}`);
                break;
            }
        }
        attempts++;
    }

    if (!success) {
        console.error('\n   ❌ Timeout waiting for OUTBOUND processing.');
        process.exit(1);
    }

    // 3. Check Senegal DB for INBOUND transmission
    console.log('3️⃣  Checking Senegal DB for INBOUND receipt...');
    attempts = 0;
    success = false;

    while (attempts < 20) {
        await wait(1000);
        // Look for recent INBOUND from Tunisia GLN
        const rows = await queryDB(SENEGAL_DB_PATH, `
            SELECT * FROM edi_transmissions 
            WHERE direction = 'INBOUND' 
            AND partner_gln = '6191234567890' 
            ORDER BY id DESC LIMIT 1
        `);

        if (rows.length > 0) {
            const rx = rows[0];
            // Check if it matches our file content (or close to it)
            if (rx.file_content === content || rx.filename === filename || rx.filename.includes('ORDERS')) {
                console.log(`\n   ✅ Received INBOUND transmission in Senegal DB!`);
                console.log(`      ID: ${rx.id}`);
                console.log(`      Status: ${rx.status}`);
                console.log(`      File: ${rx.filename}`);
                success = true;
                break;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!success) {
        console.error('\n   ❌ Timeout waiting for INBOUND receipt in Senegal.');
        process.exit(1);
    }

    console.log('\n🎉 E2E TEST PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
    console.error('\n❌ Test Failed:', err);
    process.exit(1);
});
