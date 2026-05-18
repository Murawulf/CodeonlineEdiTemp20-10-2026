const orchestratorController = require('./controllers/OrchestratorController');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Setup Test DB
const DB_PATH = path.join(__dirname, 'EntiteDb.db');
const db = new sqlite3.Database(DB_PATH);

// Mock Express Request/Response
const mockReq = (body) => ({
    body
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

// Mock Axios for forwarding
// We need to mock axios globally or inject it. 
// Since OrchestratorController requires axios, we can't easily mock it without proxyquire or similar.
// However, since we are testing the Audit Log primarily, we can let the forward fail (ECONNREFUSED) 
// and check if the status updates to FAILED, or we can assume it works if we point to a valid URL.
// Let's point to a non-existent URL to test error handling, or start a dummy server.

async function testOrchestrator() {
    console.log('--- Starting Orchestrator Test ---');

    // 1. Initialize Controller with DB
    orchestratorController.setDb(db);

    // 2. Prepare Data
    const transactionId = uuidv4();
    const senderGLN = 'GLN_TEST_SENDER';
    const receiverGLN = 'GLN_TEST_123'; // This maps to localhost:5001 in our seed
    
    const payload = {
        header: {
            sender_gln: senderGLN,
            receiver_gln: receiverGLN,
            transaction_id: transactionId,
            message_type: 'ORDERS'
        },
        envelope: {
            encryptedData: 'Gw8...',
            iv: '...',
            // ...
        }
    };

    console.log(`Sending message ${transactionId} from ${senderGLN} to ${receiverGLN}...`);

    // 3. Call relayMessage
    // We expect it to try to forward to http://localhost:5001/api/p2p/receive
    // Since nothing is listening there (unless the real server is running), it might fail.
    // If it fails, status should be FAILED.
    
    const req = mockReq(payload);
    const res = mockRes();

    await orchestratorController.relayMessage(req, res);

    console.log('Response Status:', res.statusCode);
    console.log('Response Body:', res.body);

    // 4. Check Database Audit
    db.get('SELECT * FROM audit_ledger WHERE transaction_id = ?', [transactionId], (err, row) => {
        if (err) {
            console.error('DB Error:', err);
            return;
        }
        if (row) {
            console.log('\n✅ Audit Record Found:');
            console.log(row);
            
            if (res.statusCode === 200 && row.status === 'DELIVERED') {
                 console.log('Test Result: SUCCESS (Delivered)');
            } else if (res.statusCode === 502 && row.status === 'FAILED') {
                 console.log('Test Result: SUCCESS (Handled Failure correctly)');
            } else {
                 console.log('Test Result: UNEXPECTED STATE');
            }

        } else {
            console.error('\n❌ Audit Record NOT Found!');
        }
    });

    // 5. Test Audit Sync
    console.log('\n--- Testing Audit Sync ---');
    const syncReq = mockReq({
        logs: [
            {
                transaction_id: uuidv4(),
                sender_gln: senderGLN,
                receiver_gln: receiverGLN,
                message_type: 'DESADV',
                status: 'DELIVERED',
                created_at: new Date(),
                delivered_at: new Date()
            }
        ]
    });
    const syncRes = mockRes();
    
    await orchestratorController.syncOfflineLogs(syncReq, syncRes);
    console.log('Sync Response:', syncRes.body);
}

testOrchestrator();
