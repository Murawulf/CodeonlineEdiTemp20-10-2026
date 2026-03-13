const auditLogger = require('../services/communication/AuditLogger');
const configService = require('../services/configService');
const { queryDB } = require('../db_utils');
const axios = require('axios');
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { workerData } = require('worker_threads');

// Worker configuration
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

console.log('[AuditSyncWorker] Started.');

let db;

async function initDb() {
    if (workerData && workerData.dbConfig && workerData.dbConfig.host && workerData.dbConfig.host !== 'localhost') {
        try {
            console.log(`[AuditSyncWorker] Connecting to MySQL (${workerData.dbConfig.host})...`);
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
            console.log('[AuditSyncWorker] Connected to MySQL.');
        } catch (err) {
            console.error('[AuditSyncWorker] MySQL connection failed:', err.message);
        }
    }

    if (!db) {
        console.log('[AuditSyncWorker] Using SQLite fallback.');
        const DB_PATH = path.join(__dirname, '../EntiteDb.db');
        db = new sqlite3.Database(DB_PATH);
    }

    auditLogger.setDb(db);
    
    // ConfigService initialization
    try {
        await configService.initialize(db);
        if (workerData && workerData.ORCHESTRATOR_URL) {
             await configService.set('ORCHESTRATOR_URL', workerData.ORCHESTRATOR_URL);
        }
    } catch (e) {
        console.warn('[AuditSyncWorker] ConfigService init failed:', e.message);
    }
}

async function sync() {
    if (!db) await initDb();

    try {
        // 1. Fetch unsynced logs
        const logs = await queryDB(db, "SELECT * FROM offline_audit_logs WHERE synced_to_hub = 0 LIMIT 50");
        
        if (logs.length === 0) {
            // Nothing to sync
            return;
        }

        console.log(`[AuditSyncWorker] Found ${logs.length} unsynced logs.`);

        // 2. Push to Orchestrator
        const orchestratorUrl = configService.get('ORCHESTRATOR_URL');
        
        if (!orchestratorUrl) {
            console.warn('[AuditSyncWorker] ORCHESTRATOR_URL not set. Skipping sync.');
            return;
        }

        const syncUrl = `${orchestratorUrl}/api/orchestrator/audit/sync`;
        
        const response = await axios.post(syncUrl, { logs }, { 
            timeout: 10000,
            headers: { 'x-api-pin': configService.get('API_PIN') }
        });

        if (response.data.status === 'success') {
            // 3. Mark as synced
            const transactionIds = logs.map(l => l.transaction_id);
            await auditLogger.markAsSynced(transactionIds);
            console.log(`[AuditSyncWorker] Successfully synced ${transactionIds.length} logs.`);
        } else {
            console.warn('[AuditSyncWorker] Sync response not success:', response.data);
        }

    } catch (err) {
        console.error('[AuditSyncWorker] Sync failed:', err.message);
    }
    
    // Schedule next run
    setTimeout(sync, SYNC_INTERVAL);
}

// Initial run
// Wait a bit for DB to be ready
setTimeout(sync, 5000);
