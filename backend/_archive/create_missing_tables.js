const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'entite.db');
const db = new sqlite3.Database(dbPath);

const tables = [
    // 1. EDI Orders (Technical Staging - The missing piece for distributed flow)
    `CREATE TABLE IF NOT EXISTS edi_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transmission_id INTEGER,
        document_number TEXT,
        buyer_gln TEXT,
        supplier_gln TEXT,
        order_date DATETIME,
        delivery_date DATETIME,
        currency TEXT,
        total_amount REAL,
        status TEXT DEFAULT 'PENDING_VALIDATION',
        raw_data TEXT, -- JSON content
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
    )`,

    // 2. Production Orders (The main order table)
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

    // 3. Order Lines
    `CREATE TABLE IF NOT EXISTS order_lines (
        id_line INTEGER PRIMARY KEY AUTOINCREMENT,
        id_order INTEGER,
        line_number INTEGER,
        gtin TEXT,
        libelle TEXT,
        qty REAL,
        unit TEXT,
        price REAL,
        line_net_amount REAL,
        FOREIGN KEY(id_order) REFERENCES orders(id_order)
    )`,

    // 4. EDI Transmissions (For traceability)
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

    // 5. EDI Despatch Advice (DESADV)
    `CREATE TABLE IF NOT EXISTS edi_desadv (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        desadv_number TEXT,
        original_order_number TEXT,
        buyer_gln TEXT,
        seller_gln TEXT,
        delivery_gln TEXT,
        shipping_date DATETIME,
        delivery_date DATETIME,
        direction TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // 6. DESADV Lines
    `CREATE TABLE IF NOT EXISTS edi_desadv_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_desadv INTEGER,
        line_number INTEGER,
        gtin TEXT,
        qty_dispatched REAL,
        qty_ordered REAL,
        libelle TEXT,
        FOREIGN KEY(id_desadv) REFERENCES edi_desadv(id)
    )`,

    // 7. Packages
    `CREATE TABLE IF NOT EXISTS edi_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_desadv INTEGER,
        sscc TEXT,
        package_type TEXT,
        FOREIGN KEY(id_desadv) REFERENCES edi_desadv(id)
    )`,

    // 8. EDI Invoices (INVOIC)
    `CREATE TABLE IF NOT EXISTS edi_invoic (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoic_number TEXT,
        type_code TEXT,
        date_facture DATETIME,
        buyer_gln TEXT,
        seller_gln TEXT,
        order_reference TEXT,
        desadv_reference TEXT,
        currency TEXT,
        total_ht REAL,
        total_tax REAL,
        total_ttc REAL,
        direction TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
];

db.serialize(() => {
    console.log("Starting DB Schema Creation...");
    
    tables.forEach((sql, index) => {
        db.run(sql, (err) => {
            if (err) {
                console.error(`Error creating table #${index + 1}:`, err.message);
            } else {
                console.log(`Table #${index + 1} checked/created successfully.`);
            }
        });
    });

    // Special verification for columns that might be missing in existing tables
    // (e.g., if 'orders' existed but lacked 'seller_name')
    const alterCommands = [
        "ALTER TABLE orders ADD COLUMN seller_name TEXT",
        "ALTER TABLE orders ADD COLUMN monnaie TEXT",
        "ALTER TABLE orders ADD COLUMN contract_reference TEXT",
        "ALTER TABLE edi_orders ADD COLUMN supplier_gln TEXT" // Verify this column specifically
    ];

    alterCommands.forEach(cmd => {
        db.run(cmd, (err) => {
             // Ignore "duplicate column name" errors
            if (err && !err.message.includes("duplicate column name")) {
                console.log(`Note on ALTER: ${err.message}`);
            }
        });
    });

    console.log("Migration completed.");
});

db.close();
