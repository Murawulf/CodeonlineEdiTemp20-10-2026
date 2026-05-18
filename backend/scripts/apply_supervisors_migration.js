#!/usr/bin/env node
/**
 * Apply supervisors table migration
 * Run this script to create the supervisors table in the database
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database configuration
const ENTITE_MYSQL_CONFIG = {
  host: process.env.ENTITE_DB_HOST || 'localhost',
  user: process.env.ENTITE_DB_USER || 'root',
  password: process.env.ENTITE_DB_PASSWORD || '',
  database: process.env.ENTITE_DB_NAME || 'entite_db',
  multipleStatements: true
};

async function applyMigration() {
  console.log('🔄 Applying supervisors table migration...');
  console.log(`📊 Database: ${ENTITE_MYSQL_CONFIG.database} on ${ENTITE_MYSQL_CONFIG.host}`);
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/create_supervisors_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Connect to database
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    console.log('✅ Connected to database');
    
    // Execute migration
    await conn.query(migrationSQL);
    console.log('✅ Migration applied successfully');
    
    // Verify table was created
    const [tables] = await conn.query("SHOW TABLES LIKE 'supervisors'");
    if (tables.length > 0) {
      console.log('✅ Table "supervisors" verified');
      
      // Show table structure
      const [columns] = await conn.query('DESCRIBE supervisors');
      console.log('\n📋 Table structure:');
      columns.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key ? `[${col.Key}]` : ''}`);
      });
    } else {
      console.error('❌ Table "supervisors" was not created');
    }
    
    await conn.end();
    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
applyMigration();
