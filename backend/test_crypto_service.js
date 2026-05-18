const cryptoService = require('./services/crypto/CryptoService');
const keyManager = require('./services/crypto/KeyManager');
const fs = require('fs');
const path = require('path');

// Setup mock keys for a partner (simulating self-to-self for testing)
const TEST_GLN = 'GLN_TEST_123';
const keysDir = path.join(__dirname, 'config/keys/partners');

if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
}

// Copy local public key as partner key for testing
const localPublicKey = keyManager.getLocalPublicKey();
fs.writeFileSync(path.join(keysDir, `${TEST_GLN}.pem`), localPublicKey);

async function testCrypto() {
    console.log('--- Starting CryptoService Test ---');
    
    const payload = {
        message: 'Hello Secure World',
        secret: 'Top Secret Data',
        timestamp: Date.now()
    };

    console.log('Original Payload:', payload);

    try {
        // 1. Encrypt
        console.log(`\nEncrypting for recipient ${TEST_GLN}...`);
        const envelope = await cryptoService.encryptAndSign(payload, TEST_GLN);
        console.log('Envelope created:');
        console.log('- Encrypted Data Length:', envelope.encryptedData.length);
        console.log('- IV:', envelope.iv);
        console.log('- Signature:', envelope.signature);

        // 2. Decrypt (simulating the recipient which is also us in this test)
        console.log(`\nDecrypting as ${TEST_GLN} (using local private key)...`);
        // Note: verify checks the sender's signature. 
        // In this self-test, sender is us (KeyManager uses local key for signing).
        // Recipient is us (KeyManager uses local key for decryption).
        // Verification needs Sender's Public Key. In this case, it's the same key.
        
        // We need to ensure KeyManager.getPublicKeyForGLN returns the key for the "Sender"
        // When decrypting, we pass senderGLN. 
        // Let's pretend the sender is also TEST_GLN for this loopback test.
        
        const decrypted = await cryptoService.decryptAndVerify(envelope, TEST_GLN);
        console.log('\nDecrypted Payload:', decrypted);

        // Verify content
        if (JSON.stringify(payload) === JSON.stringify(decrypted)) {
            console.log('\n✅ SUCCESS: Decrypted payload matches original.');
        } else {
            console.error('\n❌ FAILURE: Mismatch!');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error);
    }
}

testCrypto();
