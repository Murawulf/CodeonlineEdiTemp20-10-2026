const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'entite.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

db.serialize(() => {
    console.log("Checking database schema...");
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
            console.error(err);
            return;
        }
        
        const tableNames = tables.map(t => t.name);
        console.log("Tables found:", tableNames);

        const tablesToCheck = ['edi_orders', 'orders', 'order_lines', 'edi_transmissions', 'edi_desadv', 'edi_invoic'];
        
        let completed = 0;
        if (tablesToCheck.length === 0) process.exit(0);

        tablesToCheck.forEach(tableName => {
            if (tableNames.includes(tableName)) {
                db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                    if (err) {
                        console.error(`Error checking table ${tableName}:`, err);
                    } else {
                        console.log(`\nTable: ${tableName}`);
                        columns.forEach(col => {
                            console.log(` - ${col.name} (${col.type})`);
                        });
                    }
                    completed++;
                    if (completed === tablesToCheck.length) process.exit(0);
                });
            } else {
                console.log(`\nTable: ${tableName} - MISSING`);
                completed++;
                if (completed === tablesToCheck.length) process.exit(0);
            }
        });
    });
});
