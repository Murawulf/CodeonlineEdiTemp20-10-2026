const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATHS = {
    TUNISIA: path.join(DATA_DIR, 'tunisia.db'),
    SENEGAL: path.join(DATA_DIR, 'senegal.db'),
    ORCHESTRATOR: path.join(DATA_DIR, 'orchestrator.db')
};

// Deleting existing DBs for a fresh start? 
// Maybe better to keep them if we want to inspect, but for E2E consistency, fresh is better.
// Let's delete if they exist.
Object.values(DB_PATHS).forEach(p => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
});

const SCHEMA = [
    // 1. EDI Transmissions
    `CREATE TABLE IF NOT EXISTS edi_transmissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        related_id INTEGER,
        related_type TEXT,
        document_type TEXT,
        direction TEXT DEFAULT 'OUTBOUND',
        partner_gln TEXT,
        partner_id INTEGER,
        filename TEXT,
        file_path TEXT,
        file_content TEXT,
        status TEXT DEFAULT 'PENDING',
        logs TEXT,
        error_message TEXT,
        transmission_date DATETIME,
        acknowledgment_date DATETIME,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    )`,
    // 2. Orders
    `CREATE TABLE IF NOT EXISTS orders (
        id_order INTEGER PRIMARY KEY AUTOINCREMENT,
        num_commande TEXT,
        order_number TEXT,
        id_entite_buyer INTEGER,
        acheteur_gln TEXT,
        id_entite_seller INTEGER,
        fournisseur_gln TEXT,
        seller_name TEXT,
        lieu_livraison_gln TEXT,
        status TEXT,
        total_ht REAL,
        total_tax_amount REAL,
        total_amount_with_tax REAL,
        currency TEXT,
        monnaie TEXT,
        date_commande DATETIME,
        date_livraison DATETIME,
        contract_reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    )`,
    // 3. Entite (Companies)
    `CREATE TABLE IF NOT EXISTS Entite (
        id_entite INTEGER PRIMARY KEY AUTOINCREMENT,
        raison_socialle TEXT,
        gln TEXT UNIQUE,
        city TEXT,
        address TEXT
    )`,
    // 4. Network Directory (Local P2P Cache & Orchestrator Routing)
    `CREATE TABLE IF NOT EXISTS network_directory (
        gln TEXT PRIMARY KEY,
        api_url TEXT,
        updated_at DATETIME
    )`,
    // 5. Offline Audit Logs
    `CREATE TABLE IF NOT EXISTS offline_audit_logs (
        id TEXT PRIMARY KEY,
        transaction_id TEXT,
        sender_gln TEXT,
        receiver_gln TEXT,
        message_type TEXT,
        status TEXT,
        transport_mode TEXT,
        created_at DATETIME,
        error_reason TEXT,
        synced_to_hub INTEGER DEFAULT 0,
        synced_at DATETIME
    )`,
    // 6. EDI Worker Logs
    `CREATE TABLE IF NOT EXISTS edi_worker_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_type TEXT NOT NULL,
        worker_type TEXT NOT NULL,
        transmission_id INTEGER,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // 7. App Parameters
    `CREATE TABLE IF NOT EXISTS app_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        param_key TEXT NOT NULL UNIQUE,
        param_value TEXT,
        param_type TEXT DEFAULT 'string',
        description TEXT,
        category TEXT,
        is_public INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // 8. Audit Ledger (Orchestrator)
    `CREATE TABLE IF NOT EXISTS audit_ledger (
        id VARCHAR(36) PRIMARY KEY, -- UUID
        transaction_id VARCHAR(36) NOT NULL, -- UUID from sender
        sender_gln VARCHAR(20) NOT NULL,
        receiver_gln VARCHAR(20) NOT NULL,
        message_type VARCHAR(50), -- ORDERS, DESADV, INVOIC
        status VARCHAR(20) DEFAULT 'RECEIVED_BY_HUB', -- RECEIVED_BY_HUB, IN_QUEUE, DELIVERED, FAILED
        transport_mode VARCHAR(20) DEFAULT 'ORCHESTRATOR', -- ORCHESTRATOR, P2P
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME,
        error_reason TEXT
    )`
];

const topology = JSON.stringify({
    tunisia: { name: "Tunisie", apiUrl: "http://localhost:5005", ediUrl: "http://localhost:5005/api/edi/receive" },
    senegal: { name: "Sénégal", apiUrl: "http://localhost:5002", ediUrl: "http://localhost:5002/api/edi/receive" }
});

const SEEDS = {
    TUNISIA: [
        // My Identity (Tunisia)
        `INSERT INTO Entite (raison_socialle, gln, city) VALUES ('Tunisia Buyer', '6191234567890', 'Tunis')`,
        // Partner (Senegal)
        `INSERT INTO Entite (raison_socialle, gln, city) VALUES ('Senegal Supplier', 'SN02583102G3', 'Dakar')`,
        // Network Directory: Senegal -> Localhost:5002
        `INSERT INTO network_directory (gln, api_url, updated_at) VALUES ('SN02583102G3', 'http://localhost:5002', CURRENT_TIMESTAMP)`,
        // App Parameters
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('MY_GLN', '6191234567890', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('ORCHESTRATOR_URL', 'http://localhost:5010', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('LOCAL_API_URL', 'http://localhost:5005', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('NETWORK_TOPOLOGY', '${topology}', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('CURRENT_INSTANCE_CODE', 'tunisia', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('ENABLE_P2P_WORKERS', 'true', 1)`
    ],
    SENEGAL: [
        // My Identity (Senegal)
        `INSERT INTO Entite (raison_socialle, gln, city) VALUES ('Senegal Supplier', 'SN02583102G3', 'Dakar')`,
        // Partner (Tunisia)
        `INSERT INTO Entite (raison_socialle, gln, city) VALUES ('Tunisia Buyer', '6191234567890', 'Tunis')`,
        // Network Directory: Tunisia -> Localhost:5005
        `INSERT INTO network_directory (gln, api_url, updated_at) VALUES ('6191234567890', 'http://localhost:5005', CURRENT_TIMESTAMP)`,
        // App Parameters
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('MY_GLN', 'SN02583102G3', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('ORCHESTRATOR_URL', 'http://localhost:5010', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('LOCAL_API_URL', 'http://localhost:5002', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('NETWORK_TOPOLOGY', '${topology}', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('CURRENT_INSTANCE_CODE', 'senegal', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('ENABLE_P2P_WORKERS', 'true', 1)`
    ],
    ORCHESTRATOR: [
        // Network Directory: Routing Table
        `INSERT INTO network_directory (gln, api_url, updated_at) VALUES ('6191234567890', 'http://localhost:5005', CURRENT_TIMESTAMP)`,
        `INSERT INTO network_directory (gln, api_url, updated_at) VALUES ('SN02583102G3', 'http://localhost:5002', CURRENT_TIMESTAMP)`,
        // App Parameters for Orchestrator
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('MY_GLN', 'ORCHESTRATOR', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('LOCAL_API_URL', 'http://localhost:5010', 1)`,
        `INSERT INTO app_parameters (param_key, param_value, is_public) VALUES ('ENABLE_P2P_WORKERS', 'false', 1)`
    ]
};

async function setupDB(name, dbPath, seeds) {
    console.log(`Setting up ${name} DB at ${dbPath}...`);
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create Tables
            SCHEMA.forEach(sql => {
                db.run(sql, (err) => {
                    if (err) console.error(`[${name}] Error creating table:`, err.message);
                });
            });

            // Run Seeds
            seeds.forEach(sql => {
                db.run(sql, (err) => {
                    if (err) console.error(`[${name}] Error seeding:`, err.message);
                });
            });

            console.log(`[${name}] Setup complete.`);
            resolve();
        });
    });
}

async function main() {
    await setupDB('TUNISIA', DB_PATHS.TUNISIA, SEEDS.TUNISIA);
    await setupDB('SENEGAL', DB_PATHS.SENEGAL, SEEDS.SENEGAL);
    await setupDB('ORCHESTRATOR', DB_PATHS.ORCHESTRATOR, SEEDS.ORCHESTRATOR);
    console.log('✅ Databases ready for E2E test.');
}

main();
