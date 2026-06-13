const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { dbConfig } = require('../config/database');

async function runDbSeeder() {
  let connection;
  
  try {
    const instanceCode = process.env.CURRENT_INSTANCE_CODE;
    const localUrl = process.env.LOCAL_API_URL || 'http://localhost:5001';

    if (!instanceCode) {
      console.warn('⚠️ WARNING: CURRENT_INSTANCE_CODE is not defined in .env. Skipping DB parameter initialization.');
      process.exit(0);
    }

    console.log(`🔌 Connecting to database: ${dbConfig.host}`);
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database');

    console.log(`\n📋 Initializing parameters for instance: ${instanceCode}...`);

    // Define Network Topology (Single Source of Truth).
    // Per-node URLs can be overridden via env vars (TN_API_URL / SN_API_URL / CI_API_URL)
    // for environments where domains differ from the default ones.
    const tnApi = process.env.TN_API_URL || 'https://edi-dev.codeonline-info.com';
    const snApi = process.env.SN_API_URL || 'https://dev.codeonline-edi.net';
    const ciApi = process.env.CI_API_URL || 'https://dev.codeonline-edi.ci';

    const networkTopology = {
      "senegal": {
        "name": "Sénégal",
        "apiUrl": snApi,
        "ediUrl": `${snApi}/api/edi/receive`,
        "countryCode": "SEN",
        "country": "Senegal"
      },
      "tunisia": {
        "name": "Tunisie",
        "apiUrl": tnApi,
        "ediUrl": `${tnApi}/api/edi/receive`,
        "countryCode": "TUN",
        "country": "Tunisie"
      },
      "cote_ivoire": {
        "name": "Côte d'Ivoire",
        "apiUrl": ciApi,
        "ediUrl": `${ciApi}/api/edi/receive`,
        "countryCode": "CIV",
        "country": "Côte d'Ivoire"
      }
    };

    const baseParams = [
      { key: 'CURRENT_INSTANCE_CODE', value: instanceCode, type: 'string', desc: 'Identifiant unique du serveur actuel' },
      { key: 'LOCAL_API_URL', value: localUrl, type: 'string', desc: 'URL locale du backend' },
      { key: 'NETWORK_TOPOLOGY', value: JSON.stringify(networkTopology), type: 'json', desc: 'Topologie réseau globale pour le routage EDI' },
      // Other common global settings that should be the same everywhere
      { key: 'SESSION_TIMEOUT', value: '3600', type: 'number', desc: 'Timeout session en secondes' },
      { key: 'EDI_ORDERS_PATH', value: process.env.EDI_ORDERS_PATH || '/var/www/Edi-orders', type: 'string', desc: 'Chemin de stockage des documents EANCOM (commandes, envois, réceptions)' }
    ];

    // Insert or Update Parameters
    for (let param of baseParams) {
      console.log(`- Updating ${param.key}...`);
      await connection.query(`
        INSERT INTO app_parameters (param_key, param_value, param_type, description, is_public) 
        VALUES (?, ?, ?, ?, 1) 
        ON DUPLICATE KEY UPDATE 
          param_value = VALUES(param_value),
          param_type = VALUES(param_type),
          description = VALUES(description)
      `, [param.key, param.value, param.type, param.desc]);
    }

    // Clean up old legacy parameters (Cleanup phase)
    const legacyKeys = [
      'API_URL_SENEGAL',
      'API_URL_TUNISIA',
      'API_URL_BUYER',
      'API_URL_SUPPLIER'
    ];
    
    if (legacyKeys.length > 0) {
      console.log(`\n🧹 Cleaning up legacy parameters...`);
      const placeholders = legacyKeys.map(() => '?').join(',');
      const [result] = await connection.query(`DELETE FROM app_parameters WHERE param_key IN (${placeholders})`, legacyKeys);
      console.log(`- Deleted ${result.affectedRows} legacy keys.`);
    }

    console.log('\n✅ Database parameters initialized successfully!');
    
  } catch (error) {
    console.error('❌ Error initializing parameters:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Connection closed');
    }
  }
}

runDbSeeder();
