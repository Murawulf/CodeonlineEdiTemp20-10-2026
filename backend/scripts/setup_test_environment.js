const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runUpdate } = require('../db_utils');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const KEYS_DIR = path.join(__dirname, '../config/keys');
const PARTNERS_DIR = path.join(KEYS_DIR, 'partners');
const SENEGAL_TEMP_DIR = path.join(__dirname, '../temp_keys/senegal');

const TUNISIA_GLN = '6191234567890';
const SENEGAL_GLN = 'SN02583102G3';

// Ensure directories exist
[KEYS_DIR, PARTNERS_DIR, SENEGAL_TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function generateKeyPair(name, privatePath, publicPath) {
    console.log(`Generating keys for ${name}...`);
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(privatePath, privateKey);
    fs.writeFileSync(publicPath, publicKey);
    return { privateKey, publicKey };
}

async function setup() {
    // 1. Generate Tunisia Keys (Local Server Identity)
    const tunisiaKeys = generateKeyPair('Tunisia', 
        path.join(KEYS_DIR, 'private.pem'), 
        path.join(KEYS_DIR, 'public.pem')
    );

    // 2. Generate Senegal Keys (Remote Node Identity)
    const senegalKeys = generateKeyPair('Senegal', 
        path.join(SENEGAL_TEMP_DIR, 'private.pem'), 
        path.join(SENEGAL_TEMP_DIR, 'public.pem')
    );

    // 3. Exchange Public Keys
    // Tunisia needs Senegal's Public Key to verify signatures from Senegal
    fs.writeFileSync(path.join(PARTNERS_DIR, `${SENEGAL_GLN}.pem`), senegalKeys.publicKey);
    console.log(`Deployed Senegal's public key to ${PARTNERS_DIR}/${SENEGAL_GLN}.pem`);

    // Senegal needs Tunisia's Public Key to encrypt messages for Tunisia
    // (In a real scenario, this file would be copied to the Senegal server)
    // We leave it in KEYS_DIR/public.pem for now, the test script will read it.

    // 4. Update Database (network_directory)
    console.log('Updating network_directory in EntiteDb.db...');
    const dbPath = path.join(__dirname, '../EntiteDb.db');
    const db = new sqlite3.Database(dbPath);

    // We assume the db_utils functions can work with this db instance if we pass it, 
    // or we use the driver directly.
    
    const insertNode = (gln, name, country, url) => {
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT OR REPLACE INTO network_directory (gln, name, country_code, api_url, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [gln, name, country, url], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };

    try {
        await insertNode(TUNISIA_GLN, 'TUNISIA HUB', 'TN', 'http://localhost:5001');
        await insertNode(SENEGAL_GLN, 'SENEGAL HUB', 'SN', 'http://localhost:5002'); // Mock URL
        console.log('✅ Network directory updated.');
    } catch (err) {
        console.error('❌ DB Update failed:', err.message);
    } finally {
        db.close();
    }
}

setup();
