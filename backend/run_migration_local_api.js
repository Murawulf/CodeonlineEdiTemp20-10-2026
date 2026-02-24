/**
 * Migration Runner: Add LOCAL_API_URL parameter
 * 
 * This script adds the LOCAL_API_URL parameter to distinguish between:
 * 1. Local backend API calls (our server)
 * 2. Remote server API calls (Senegal, Tunisia)
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'codeonline_edi',
  multipleStatements: true
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrations', 'add_local_api_url.sql');
    console.log(`📖 Reading migration file: ${sqlPath}`);
    
    let sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Remove comments and split statements
    const statements = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`\n⚙️  Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${stmt.substring(0, 80)}...`);
      
      await connection.execute(stmt);
      console.log(`   ✅ Statement ${i + 1} executed successfully`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Added LOCAL_API_URL parameter');
    console.log('   - Updated descriptions for API_URL_SENEGAL and API_URL_TUNISIA');
    console.log('\n💡 Next steps:');
    console.log('   1. Restart your backend server to load the new parameter');
    console.log('   2. Update frontend code to use useLocalApiUrl() for local calls');
    console.log('   3. Use useRemoteServerUrl() for remote server calls');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run migration
runMigration();
