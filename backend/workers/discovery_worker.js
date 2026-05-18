const discoveryCache = require('../services/communication/DiscoveryCache');
const { parentPort, workerData } = require('worker_threads');
const mysql = require('mysql2/promise');
const configService = require('../services/configService');

// Worker configuration
const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

console.log('[DiscoveryWorker] Started.');

let db;

async function initDb() {
    if (workerData && workerData.dbConfig && workerData.dbConfig.host && workerData.dbConfig.host !== 'localhost') {
        try {
            console.log(`[DiscoveryWorker] Connecting to MySQL (${workerData.dbConfig.host})...`);
            const pool = mysql.createPool(workerData.dbConfig);
            
            // Create a wrapper compatible with db_utils
            db = {
                __isMysql: true,
                query: async (sql, params) => {
                    const [rows] = await pool.execute(sql, params);
                    return rows;
                },
                all: async (sql, params) => {
                    const [rows] = await pool.execute(sql, params);
                    return rows;
                },
                run: async (sql, params) => {
                    const [result] = await pool.execute(sql, params);
                    return { changes: result.affectedRows, lastID: result.insertId };
                }
            };
            console.log('[DiscoveryWorker] Connected to MySQL.');
        } catch (err) {
            console.error('[DiscoveryWorker] MySQL connection failed:', err.message);
        }
    }

    if (!db) {
        throw new Error('[DiscoveryWorker] MySQL connection required (no SQLite fallback). Vérifier workerData.dbConfig.');
    }

    discoveryCache.setDb(db);
    
    // ConfigService initialization (crucial for workers to know Orchestrator URL)
    try {
        await configService.initialize(db);
        if (workerData && workerData.ORCHESTRATOR_URL) {
             // Monkey patch if DB fails to load or override
             await configService.set('ORCHESTRATOR_URL', workerData.ORCHESTRATOR_URL);
        }
    } catch (e) {
        console.warn('[DiscoveryWorker] ConfigService init failed:', e.message);
    }
}

async function run() {
    if (!db) await initDb();

    try {
        console.log('[DiscoveryWorker] Refreshing cache...');
        await discoveryCache.refreshCache();
    } catch (err) {
        console.error('[DiscoveryWorker] Error:', err.message);
    }
    
    // Schedule next run
    setTimeout(run, REFRESH_INTERVAL);
}

// Initial run
run();

if (parentPort) {
    parentPort.on('message', (msg) => {
        if (msg === 'force_refresh') {
            run();
        }
    });
}
