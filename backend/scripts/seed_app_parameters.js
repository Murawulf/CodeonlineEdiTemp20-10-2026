const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbs = [
    { path: path.join(__dirname, '../data/tunisia.db'), gln: '6191234567890', name: 'Tunisie' },
    { path: path.join(__dirname, '../data/senegal.db'), gln: 'SN02583102G3', name: 'Sénégal' }
];

const createTableSql = `
CREATE TABLE IF NOT EXISTS app_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param_key TEXT NOT NULL UNIQUE,
    param_value TEXT,
    param_type TEXT DEFAULT 'string',
    description TEXT,
    category TEXT,
    is_public INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const topology = JSON.stringify({
    tunisia: { name: "Tunisie", apiUrl: "http://localhost:5005", ediUrl: "http://localhost:5005/api/edi/receive" },
    senegal: { name: "Sénégal", apiUrl: "http://localhost:5002", ediUrl: "http://localhost:5002/api/edi/receive" }
});

dbs.forEach(info => {
    const db = new sqlite3.Database(info.path);
    db.serialize(() => {
        db.run(createTableSql, (err) => {
            if (err) console.error(`Error creating app_parameters in ${info.name}:`, err.message);
            else console.log(`Table app_parameters created/verified in ${info.name}`);
        });

        const params = [
            ['MY_GLN', info.gln],
            ['ORCHESTRATOR_URL', 'http://localhost:5000'], // Dummy orchestrator for now
            ['LOCAL_API_URL', info.name === 'Tunisie' ? 'http://localhost:5005' : 'http://localhost:5002'],
            ['NETWORK_TOPOLOGY', topology],
            ['CURRENT_INSTANCE_CODE', info.name === 'Tunisie' ? 'tunisia' : 'senegal'],
            ['ENABLE_P2P_WORKERS', 'true']
        ];

        const stmt = db.prepare("INSERT OR REPLACE INTO app_parameters (param_key, param_value, is_public) VALUES (?, ?, 1)");
        params.forEach(p => stmt.run(p));
        stmt.finalize();
        console.log(`Seeded app_parameters for ${info.name}`);
    });
    db.close();
});
