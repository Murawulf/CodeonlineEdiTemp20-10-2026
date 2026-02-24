const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { dbConfig } = require('./config/database');

const ENTITE_MYSQL_CONFIG = {
  ...dbConfig,
  multipleStatements: true
};

async function runMigrations() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    console.log('Connected.');

    const migrationFiles = [
      'create_desadv_tables.sql',
      'create_invoic_tables.sql'
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(__dirname, 'migrations', file);
      console.log(`Reading migration file: ${file}`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Executing migration: ${file}`);
      await connection.query(sql);
      console.log(`Successfully executed: ${file}`);
    }

    console.log('All migrations completed successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed.');
    }
  }
}

runMigrations();
