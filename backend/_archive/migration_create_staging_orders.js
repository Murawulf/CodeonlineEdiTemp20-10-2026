const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const createTableSql = `
CREATE TABLE IF NOT EXISTS staging_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transmission_id INTEGER,
    document_number TEXT NOT NULL,
    buyer_gln TEXT,
    supplier_gln TEXT,
    order_date TEXT,
    delivery_date TEXT,
    currency TEXT,
    total_amount REAL,
    status TEXT DEFAULT 'PENDING_VALIDATION',
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(transmission_id) REFERENCES edi_transmissions(id)
);
`;

db.serialize(() => {
    db.run(createTableSql, (err) => {
        if (err) {
            console.error("Error creating staging_orders table:", err.message);
        } else {
            console.log("staging_orders table created successfully.");
        }
    });
});

db.close();
