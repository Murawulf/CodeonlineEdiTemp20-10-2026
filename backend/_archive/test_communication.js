const communicationProvider = require('./services/communication/CommunicationProvider');
const discoveryCache = require('./services/communication/DiscoveryCache');
const auditLogger = require('./services/communication/AuditLogger');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Setup Mocks
const DB_PATH = path.join(__dirname, 'EntiteDb.db');
const db = new sqlite3.Database(DB_PATH);

discoveryCache.setDb(db);
auditLogger.setDb(db);

// Mock Config Service (monkey patch for test)
const configService = require('./services/configService');
configService.get = (key) => {
    if (key === 'MY_GLN') return 'GLN_TEST_SENDER';
    if (key === 'ORCHESTRATOR_URL') return 'http://localhost:5001'; // Point to ourself (Orchestrator Controller mounted)
    return null;
};

async function testCommunication() {
    console.log('--- Starting CommunicationProvider Test ---');
    
    const message = { orderId: '12345', items: [] };
    const targetGLN = 'GLN_TEST_123'; // Maps to localhost:5001

    try {
        // Test 1: Orchestrator (Should succeed if server is running)
        console.log('\nTest 1: Normal Flow (Orchestrator)');
        // Note: For this to work, node server.js must be running in another terminal
        // or we expect connection refused.
        
        try {
            const res = await communicationProvider.dispatch(message, targetGLN, 'ORDERS');
            console.log('✅ Dispatch Success:', res);
        } catch (e) {
            console.log('ℹ️ Dispatch via Orchestrator failed (Expected if server not running):', e.message);
        }

        // Test 2: Force P2P (Simulate Orchestrator Down)
        console.log('\nTest 2: Fallback Flow (P2P)');
        // We temporarily break the Orchestrator URL to force fallback
        const originalGet = configService.get;
        configService.get = (key) => {
             if (key === 'ORCHESTRATOR_URL') return 'http://invalid-url:9999';
             return originalGet(key);
        };

        try {
            // This should fail Orchestrator and try P2P (localhost:5001)
            // If server is not running, P2P will also fail, but we will see the logs.
            const res = await communicationProvider.dispatch(message, targetGLN, 'ORDERS');
            console.log('✅ P2P Dispatch Success:', res);
        } catch (e) {
             console.log('ℹ️ P2P Dispatch failed (Expected if server not running):', e.message);
             console.log('   Checking if offline log was written...');
        }

        // Check Offline Logs
        db.get("SELECT * FROM offline_audit_logs ORDER BY created_at DESC LIMIT 1", (err, row) => {
            if (row) {
                console.log('\n✅ Offline Log Found:', row);
            } else {
                console.log('\n❌ No Offline Log found (unexpected if P2P failed)');
            }
        });

    } catch (err) {
        console.error('Test Error:', err);
    }
}

testCommunication();
