const path = require('path');
// Load .env explicitly from backend root
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { dbConfig } = require('../config/database');
const mysql = require('mysql2/promise');

// Load SQL files
const sqlDir = path.join(__dirname, '../sql/setup');
const migrationFiles = [
    'create_audit_ledger.sql',
    'create_network_directory.sql',
    'create_offline_audit_logs.sql'
];

async function applyMigrations() {
    console.log('--- Starting Database Schema Update ---');

    // Detect DB Type (MySQL vs SQLite) based on Env or Config
    // For this script, we check if we can connect to MySQL, else SQLite fallback (EntiteDb.db)
    
    let connection = null;
    let type = 'sqlite';

    try {
        // Try MySQL first if host is not localhost or if explicitly requested
        if (dbConfig.host && dbConfig.host !== 'localhost') {
             console.log(`Attempting MySQL connection to ${dbConfig.host}...`);
             connection = await mysql.createConnection(dbConfig);
             type = 'mysql';
             console.log('✅ Connected to MySQL.');
        } else {
            throw new Error('Skipping MySQL check (localhost defaults to SQLite in this setup script for safety, unless configured otherwise)');
        }
    } catch (e) {
        console.log(`ℹ️ MySQL not available or skipped (${e.message}). Using SQLite (EntiteDb.db).`);
        const dbPath = path.join(__dirname, '../EntiteDb.db');
        connection = new sqlite3.Database(dbPath);
        type = 'sqlite';
    }

    for (const file of migrationFiles) {
        const filePath = path.join(sqlDir, file);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Migration file not found: ${file}`);
            continue;
        }

        const sqlContent = fs.readFileSync(filePath, 'utf8');
        console.log(`\nApplying ${file}...`);

        try {
            if (type === 'mysql') {
                // Split by semicolon for MySQL multiple statements
                const statements = sqlContent.split(';').filter(s => s.trim());
                for (const statement of statements) {
                    await connection.query(statement);
                }
            } else {
                // SQLite exec
                await new Promise((resolve, reject) => {
                    connection.exec(sqlContent, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            console.log(`✅ ${file} applied successfully.`);
        } catch (err) {
            console.error(`❌ Failed to apply ${file}:`, err.message);
        }
    }

    if (type === 'mysql') {
        await connection.end();
    } else {
        connection.close();
    }
    
    console.log('\n--- Database Update Complete ---');
}

applyMigrations();
