/**
 * Migration Script: Create app_parameters table
 * ==============================================
 * 
 * Run this script to create the app_parameters table and insert default values.
 * 
 * Usage: node run_migration_app_parameters.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { dbConfig } = require('./config/database');

const ENTITE_MYSQL_CONFIG = {
  ...dbConfig,
  multipleStatements: true, // Allow multiple SQL statements
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Connecting to MySQL database...');
    connection = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    console.log('✅ Connected to MySQL database');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'sql', 'migrations', 'create_app_parameters.sql');
    let migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Remove comments (lines starting with --)
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    // Split by semicolons and filter empty statements
    const statements = cleanSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`\n📋 Running ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length > 0) {
        try {
          console.log(`[${i + 1}/${statements.length}] Executing: ${stmt.substring(0, 60)}...`);
          await connection.execute(stmt);
          console.log(`   ✅ Success`);
        } catch (err) {
          // Ignore "duplicate key" errors for INSERT statements
          if (err.code === 'ER_DUP_ENTRY') {
            console.log(`   ⚠️  Skipped (already exists)`);
          } else if (err.code === 'ER_DUP_KEYNAME') {
            console.log(`   ⚠️  Skipped (index already exists)`);
          } else {
            console.error(`   ❌ Error: ${err.message}`);
          }
        }
      }
    }

    // Verify the table was created
    console.log('\n📊 Verifying table creation...');
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM app_parameters');
    console.log(`✅ app_parameters table has ${rows[0].count} parameters`);

    // Show all parameters
    console.log('\n📋 Current parameters:');
    const [params] = await connection.execute('SELECT param_key, param_value, category, is_public FROM app_parameters ORDER BY category, param_key');
    
    let currentCategory = '';
    for (const param of params) {
      if (param.category !== currentCategory) {
        currentCategory = param.category;
        console.log(`\n  [${currentCategory.toUpperCase()}]`);
      }
      const publicFlag = param.is_public ? '🌐' : '🔒';
      console.log(`    ${publicFlag} ${param.param_key} = ${param.param_value}`);
    }

    console.log('\n✅ Migration completed successfully!');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

runMigration();
