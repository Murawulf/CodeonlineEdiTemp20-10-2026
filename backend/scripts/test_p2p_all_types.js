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

const TEST_CASES = [
    {
        type: 'ORDERS',
        relatedType: 'ORDER',
        content: (id) => `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${id}'UNH+1+ORDERS:D:96A:UN:EAN008'BGM+220+${id}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+21:100'MOA+203:500'UNS+S'CNT+2:1'UNT+9+1'UNZ+1+${id}'`
    },
    {
        type: 'ORDRSP',
        relatedType: 'ORDER_RESPONSE',
        content: (id) => `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${id}'UNH+1+ORDRSP:D:96A:UN:EAN008'BGM+231+${id}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+21:100'UNS+S'CNT+2:1'UNT+8+1'UNZ+1+${id}'`
    },
    {
        type: 'DESADV',
        relatedType: 'DESPATCH_ADVICE',
        content: (id) => `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${id}'UNH+1+DESADV:D:96A:UN:EAN008'BGM+351+${id}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'CPS+1'LIN+1+1+5412345000013:SRV'QTY+12:100'CNT+2:1'UNT+8+1'UNZ+1+${id}'`
    },
    {
        type: 'INVOIC',
        relatedType: 'INVOICE',
        content: (id) => `UNA:+.? 'UNB+UNOC:3+6191234567890:14+SN02583102G3:14+${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12)}+${id}'UNH+1+INVOIC:D:96A:UN:EAN008'BGM+380+${id}+9'DTM+137:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:102'NAD+BY+6191234567890::9'NAD+SU+SN02583102G3::9'LIN+1+1+5412345000013:SRV'QTY+47:100'MOA+203:500'UNS+S'CNT+2:1'UNT+9+1'UNZ+1+${id}'`
    }
];

async function runSingleTest(testCase) {
    const testId = Math.floor(Math.random() * 10000);
    const filename = `${testCase.type}_TEST_${Date.now()}_${testId}.txt`;
    const content = testCase.content(testId);

    console.log(`\n🔹 Testing ${testCase.type} (ID: ${testId})...`);

    // 1. Inject
    const result = await runUpdate(TUNISIA_DB_PATH, `
        INSERT INTO edi_transmissions 
        (direction, document_type, partner_gln, status, file_content, filename, related_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, ['OUTBOUND', testCase.type, 'SN02583102G3', 'PENDING', content, filename, testCase.relatedType]);

    const transmissionId = result.lastID;
    console.log(`   [Inject] ID ${transmissionId} PENDING in Tunisia`);

    // 2. Wait for SENT
    let attempts = 0;
    let sent = false;
    process.stdout.write('   [Wait SENT] ');
    while (attempts < 60) {
        await wait(1000);
        const rows = await queryDB(TUNISIA_DB_PATH, `SELECT status, error_message FROM edi_transmissions WHERE id = ?`, [transmissionId]);
        if (rows.length > 0) {
            if (rows[0].status === 'SENT') {
                sent = true;
                console.log(' ✅ SENT');
                break;
            } else if (rows[0].status === 'ERROR') {
                console.log(` ❌ ERROR: ${rows[0].error_message}`);
                return false;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    if (!sent) {
        console.log(' ❌ Timeout waiting for SENT');
        return false;
    }

    // 3. Check Receipt
    attempts = 0;
    let received = false;
    process.stdout.write('   [Check Receipt] ');
    while (attempts < 20) {
        await wait(1000);
        const rows = await queryDB(SENEGAL_DB_PATH, `
            SELECT * FROM edi_transmissions 
            WHERE direction = 'INBOUND' 
            AND partner_gln = '6191234567890' 
            AND document_type = ?
            ORDER BY id DESC LIMIT 1
        `, [testCase.type]);

        if (rows.length > 0) {
            const rx = rows[0];
            // Check if it's the one we just sent (approximate match by filename or content)
            if (rx.file_content === content || rx.filename === filename) {
                received = true;
                console.log(` ✅ RECEIVED (ID: ${rx.id})`);
                return true;
            }
        }
        process.stdout.write('.');
        attempts++;
    }

    console.log(' ❌ Timeout waiting for RECEIPT');
    return false;
}

async function runAllTests() {
    console.log('🚀 Starting P2P Multi-Type E2E Test Suite');
    
    let passed = 0;
    for (const testCase of TEST_CASES) {
        const success = await runSingleTest(testCase);
        if (success) passed++;
        else {
            console.error(`🛑 Test failed for ${testCase.type}. Stopping suite.`);
            process.exit(1);
        }
        await wait(2000); // Cool down
    }

    console.log(`\n🎉 All ${passed}/${TEST_CASES.length} tests passed successfully!`);
}

runAllTests().catch(err => {
    console.error('\n❌ Suite Failed:', err);
    process.exit(1);
});
