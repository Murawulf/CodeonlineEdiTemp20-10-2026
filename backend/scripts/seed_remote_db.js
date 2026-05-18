const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { dbConfig } = require('../config/database');

async function seedRemote() {
    console.log('--- Seeding Remote MySQL Network Directory ---');
    console.log(`Connecting to ${dbConfig.host}...`);

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected.');

        // 1. Clear existing directory (optional, or just upsert)
        // await connection.execute('TRUNCATE TABLE network_directory');

        // 2. Insert Nodes
        // Note: For the simulation, Senegal is running locally on port 5002
        // and Tunisia on port 5005.
        // In a real deployment, these would be real domains/IPs.
        
        const nodes = [
            {
                gln: 'SN02583102G3',
                name: 'SENEGAL HUB',
                country_code: 'SN',
                api_url: 'http://localhost:5002' // Mock for testing
            },
            {
                gln: '6191234567890',
                name: 'TUNISIA HUB',
                country_code: 'TN',
                api_url: 'http://localhost:5005' // Mock for testing
            }
        ];

        for (const node of nodes) {
            const sql = `
                INSERT INTO network_directory (gln, name, country_code, api_url, updated_at)
                VALUES (?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    name = VALUES(name),
                    api_url = VALUES(api_url),
                    updated_at = NOW()
            `;
            await connection.execute(sql, [node.gln, node.name, node.country_code, node.api_url]);
            console.log(`✅ Upserted ${node.name} (${node.gln}) -> ${node.api_url}`);
        }

    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
    } finally {
        if (connection) await connection.end();
    }
}

seedRemote();
