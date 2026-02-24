const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

const tables = {
    edi_orders: `
        CREATE TABLE IF NOT EXISTS edi_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transmission_id INT,
            document_number VARCHAR(255),
            buyer_gln VARCHAR(50),
            supplier_gln VARCHAR(50),
            order_date DATETIME,
            delivery_date DATETIME,
            currency VARCHAR(10),
            total_amount DECIMAL(15, 3),
            status VARCHAR(50) DEFAULT 'PENDING_VALIDATION',
            raw_data LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    orders: `
        CREATE TABLE IF NOT EXISTS orders (
            id_order INT AUTO_INCREMENT PRIMARY KEY,
            num_commande VARCHAR(255),
            order_number VARCHAR(255),
            id_entite_buyer INT,
            acheteur_gln VARCHAR(50),
            id_entite_seller INT,
            fournisseur_gln VARCHAR(50),
            seller_name VARCHAR(255),
            lieu_livraison_gln VARCHAR(50),
            status VARCHAR(50),
            total_ht DECIMAL(15, 3),
            total_tax_amount DECIMAL(15, 3),
            total_amount_with_tax DECIMAL(15, 3),
            currency VARCHAR(10),
            monnaie VARCHAR(10),
            date_commande DATETIME,
            date_livraison DATETIME,
            contract_reference VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    order_lines: `
        CREATE TABLE IF NOT EXISTS order_lines (
            id_line INT AUTO_INCREMENT PRIMARY KEY,
            id_order INT,
            line_number INT,
            gtin VARCHAR(50),
            libelle VARCHAR(255),
            qty DECIMAL(15, 3),
            unit VARCHAR(20),
            price DECIMAL(15, 3),
            line_net_amount DECIMAL(15, 3),
            INDEX idx_order (id_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    edi_transmissions: `
        CREATE TABLE IF NOT EXISTS edi_transmissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            related_id INT,
            related_type VARCHAR(50),
            document_type VARCHAR(50),
            direction VARCHAR(20) DEFAULT 'OUTBOUND',
            partner_gln VARCHAR(50),
            partner_id INT,
            filename VARCHAR(255),
            file_path TEXT,
            file_content LONGTEXT,
            status VARCHAR(50) DEFAULT 'PENDING',
            logs TEXT,
            error_message TEXT,
            transmission_date DATETIME,
            acknowledgment_date DATETIME,
            retry_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    edi_desadv: `
        CREATE TABLE IF NOT EXISTS edi_desadv (
            id INT AUTO_INCREMENT PRIMARY KEY,
            desadv_number VARCHAR(255),
            original_order_number VARCHAR(255),
            buyer_gln VARCHAR(50),
            seller_gln VARCHAR(50),
            delivery_gln VARCHAR(50),
            shipping_date DATETIME,
            delivery_date DATETIME,
            direction VARCHAR(20),
            status VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    edi_desadv_lines: `
        CREATE TABLE IF NOT EXISTS edi_desadv_lines (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_desadv INT,
            line_number INT,
            gtin VARCHAR(50),
            qty_dispatched DECIMAL(15, 3),
            qty_ordered DECIMAL(15, 3),
            libelle VARCHAR(255),
            INDEX idx_desadv (id_desadv)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    edi_packages: `
        CREATE TABLE IF NOT EXISTS edi_packages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_desadv INT,
            sscc VARCHAR(50),
            package_type VARCHAR(50),
            INDEX idx_desadv_pkg (id_desadv)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `,
    edi_invoic: `
        CREATE TABLE IF NOT EXISTS edi_invoic (
            id INT AUTO_INCREMENT PRIMARY KEY,
            invoic_number VARCHAR(255),
            type_code VARCHAR(10),
            date_facture DATETIME,
            buyer_gln VARCHAR(50),
            seller_gln VARCHAR(50),
            order_reference VARCHAR(255),
            desadv_reference VARCHAR(255),
            currency VARCHAR(10),
            total_ht DECIMAL(15, 3),
            total_tax DECIMAL(15, 3),
            total_ttc DECIMAL(15, 3),
            direction VARCHAR(20),
            status VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `
};

async function checkAndMigrate() {
    let connection;
    try {
        console.log('Connecting to MySQL...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected.');

        for (const [tableName, createSql] of Object.entries(tables)) {
            console.log(`Checking table: ${tableName}...`);
            await connection.execute(createSql);
            console.log(`Table ${tableName} ensured.`);

            // Check columns
            const [columns] = await connection.execute(`SHOW COLUMNS FROM ${tableName}`);
            const columnNames = columns.map(c => c.Field);
            
            // Define expected columns for critical tables to add if missing (basic ALTER support)
            const expectedColumns = {
                orders: [
                    { name: 'seller_name', type: 'VARCHAR(255)' },
                    { name: 'monnaie', type: 'VARCHAR(10)' },
                    { name: 'contract_reference', type: 'VARCHAR(255)' },
                    { name: 'fournisseur_gln', type: 'VARCHAR(50)' }
                ],
                edi_orders: [
                    { name: 'supplier_gln', type: 'VARCHAR(50)' },
                    { name: 'raw_data', type: 'LONGTEXT' }
                ],
                edi_transmissions: [
                    { name: 'related_type', type: 'VARCHAR(50)' }
                ]
            };

            if (expectedColumns[tableName]) {
                for (const col of expectedColumns[tableName]) {
                    if (!columnNames.includes(col.name)) {
                        console.log(`Adding missing column ${col.name} to ${tableName}...`);
                        try {
                            await connection.execute(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`);
                            console.log(`Column ${col.name} added.`);
                        } catch (alterErr) {
                            console.error(`Failed to add column ${col.name}: ${alterErr.message}`);
                        }
                    }
                }
            }
        }
        
        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        if (connection) await connection.end();
    }
}

checkAndMigrate();
