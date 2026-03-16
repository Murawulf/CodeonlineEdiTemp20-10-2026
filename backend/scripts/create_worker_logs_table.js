const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbs = [
    path.join(__dirname, '../data/tunisia.db'),
    path.join(__dirname, '../data/senegal.db')
];

const createTableSql = `
CREATE TABLE IF NOT EXISTS edi_worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_type TEXT NOT NULL,
    worker_type TEXT NOT NULL,
    transmission_id INTEGER,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

dbs.forEach(dbPath => {
    const db = new sqlite3.Database(dbPath);
    db.run(createTableSql, (err) => {
        if (err) {
            console.error(`Error creating table in ${dbPath}:`, err.message);
        } else {
            console.log(`Table edi_worker_logs created in ${dbPath}`);
        }
        db.close();
    });
});
