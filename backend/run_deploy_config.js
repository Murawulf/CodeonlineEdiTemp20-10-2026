const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();
const { dbConfig } = require('./config/database');

// Configuration MySQL (Reprise de server.js ou via variables d'env)
// Note: Assurez-vous que ces identifiants pointent vers la bonne base de données (DEV)
const DB_CONFIG = {
  ...dbConfig,
  multipleStatements: true // Important pour exécuter le script SQL contenant plusieurs requêtes
};

async function runDeployConfig() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database:', DB_CONFIG.host);
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to MySQL database');

    // Lire le fichier SQL
    const sqlPath = path.join(__dirname, 'deploy_config_dev.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('\n📋 Applying deployment configuration...');
    
    // Exécuter le script
    await connection.query(sqlContent);
    
    console.log('✅ Configuration applied successfully!');
    console.log('\nVerify the changes in the database or by calling /api/settings/reload on the server.');

  } catch (error) {
    console.error('❌ Error applying configuration:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Connection closed');
    }
  }
}

runDeployConfig();
