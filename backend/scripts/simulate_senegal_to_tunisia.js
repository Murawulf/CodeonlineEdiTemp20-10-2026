const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const SENEGAL_GLN = 'SN02583102G3';
const TUNISIA_GLN = '6191234567890'; // Local Server GLN
const TUNISIA_URL = 'http://localhost:5005/api/p2p/receive'; // Port 5005 to avoid conflicts

// Paths
const SENEGAL_KEYS_DIR = path.join(__dirname, '../temp_keys/senegal');
const TUNISIA_PUBLIC_KEY_PATH = path.join(__dirname, '../config/keys/public.pem');

// Load Keys
const senegalPrivateKey = fs.readFileSync(path.join(SENEGAL_KEYS_DIR, 'private.pem'), 'utf8');
const tunisiaPublicKey = fs.readFileSync(TUNISIA_PUBLIC_KEY_PATH, 'utf8');

const ALGORITHM = 'aes-256-gcm';

/**
 * Simulate the Encryption Process (CryptoService logic duplicated for client simulation)
 */
function encryptAndSign(payload, recipientPublicKey, senderPrivateKey) {
    const dataBuffer = Buffer.from(JSON.stringify(payload));

    // 1. Generate AES Key
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // 2. Encrypt Payload
    const cipher = crypto.createCipheriv(ALGORITHM, aesKey, iv);
    let encryptedData = cipher.update(dataBuffer);
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 3. Encrypt AES Key with Recipient's Public Key
    const encryptedKey = crypto.publicEncrypt(
        {
            key: recipientPublicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        aesKey
    );

    // 4. Sign Hash with Sender's Private Key
    const sign = crypto.createSign('SHA256');
    sign.update(dataBuffer);
    sign.end();
    const signature = sign.sign(senderPrivateKey);

    return {
        encryptedData: encryptedData.toString('base64'),
        iv: iv.toString('base64'),
        tag: authTag.toString('base64'),
        encryptedKey: encryptedKey.toString('base64'),
        signature: signature.toString('base64')
    };
}

async function runSimulation() {
    console.log(`--- Simulating Senegal (${SENEGAL_GLN}) -> Tunisia (${TUNISIA_GLN}) ---`);
    console.log(`Target URL: ${TUNISIA_URL}`);

    const payload = {
        message_type: 'ORDERS',
        order_id: 'ORD-SN-TN-001',
        items: [
            { sku: 'MANGUE-SN', qty: 5000, unit: 'KG' },
            { sku: 'ARACHIDE-SN', qty: 2000, unit: 'KG' }
        ],
        timestamp: Date.now()
    };

    console.log('Payload:', payload);

    try {
        console.log('Encrypting...');
        const envelope = encryptAndSign(payload, tunisiaPublicKey, senegalPrivateKey);
        
        const body = {
            header: {
                sender_gln: SENEGAL_GLN,
                receiver_gln: TUNISIA_GLN,
                transaction_id: uuidv4(),
                message_type: 'ORDERS'
            },
            envelope
        };

        console.log(`Sending Transaction ${body.header.transaction_id}...`);
        
        const response = await axios.post(TUNISIA_URL, body, { timeout: 5000 });
        
        console.log('✅ Response:', response.status, response.data);
        
        if (response.data.status === 'success') {
            console.log('\n✨ TEST PASSED: Message received and processed by Tunisia Server.');
        } else {
            console.error('\n❌ TEST FAILED: Server returned error status.');
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) {
            console.error('Server Response:', error.response.status, error.response.data);
        } else if (error.code === 'ECONNREFUSED') {
            console.error('Connection Refused. Is the server running?');
        }
    }
}

runSimulation();
