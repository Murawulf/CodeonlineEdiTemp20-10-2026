const express = require('express');
const bodyParser = require('body-parser');
const p2pRoutes = require('./routes/p2p');
const cryptoService = require('./services/crypto/CryptoService');
const keyManager = require('./services/crypto/KeyManager');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Setup Mocks
const TEST_GLN_SENDER = 'GLN_TEST_SENDER';
const TEST_GLN_RECEIVER = 'GLN_TEST_123'; // Matches the receiver

// Ensure keys exist
const keysDir = path.join(__dirname, 'config/keys/partners');
if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
}
// For verification to work, the receiver needs the sender's public key.
// In this test, we are the receiver AND the sender.
// KeyManager.getLocalPrivateKey() is used by receiver to decrypt (AES key).
// KeyManager.getPublicKeyForGLN(sender) is used by receiver to verify signature.
// KeyManager.getLocalPrivateKey() is used by sender to sign.
// KeyManager.getPublicKeyForGLN(receiver) is used by sender to encrypt (AES key).

// We need to copy our local public key to 'partners/GLN_TEST_SENDER.pem' so the receiver can verify the sender.
const localPublicKey = keyManager.getLocalPublicKey();
fs.writeFileSync(path.join(keysDir, `${TEST_GLN_SENDER}.pem`), localPublicKey);
// And for the sender to encrypt for the receiver (us), it needs 'partners/GLN_TEST_123.pem'
fs.writeFileSync(path.join(keysDir, `${TEST_GLN_RECEIVER}.pem`), localPublicKey);

const app = express();
app.use(bodyParser.json());
app.use('/api/p2p', p2pRoutes);

async function testP2PReceiver() {
    console.log('--- Starting P2P Receiver Test ---');

    // 1. Create a valid encrypted message (As Sender)
    const payload = {
        orderId: 'ORDER_999',
        items: [{ sku: 'ABC', qty: 10 }]
    };

    console.log('Encrypting payload from', TEST_GLN_SENDER, 'to', TEST_GLN_RECEIVER);
    const envelope = await cryptoService.encryptAndSign(payload, TEST_GLN_RECEIVER);

    const body = {
        header: {
            sender_gln: TEST_GLN_SENDER,
            receiver_gln: TEST_GLN_RECEIVER,
            transaction_id: 'TRANS_001',
            message_type: 'ORDERS'
        },
        envelope
    };

    // 2. Send to Receiver Endpoint
    const res = await request(app)
        .post('/api/p2p/receive')
        .send(body);

    console.log('Response Status:', res.status);
    console.log('Response Body:', res.body);

    if (res.status === 200 && res.body.status === 'success') {
        console.log('✅ P2P Receive Test Passed');
    } else {
        console.error('❌ P2P Receive Test Failed');
    }
}

testP2PReceiver();
