require('dotenv').config();
const mysql = require('mysql2/promise');

// Test configurations
const testConfigs = [
  // Tests sur 91.134.35.126
  {
    name: '[91.134.35.126] Port 3306 - consultant_seg',
    config: {
      host: '91.134.35.126',
      port: 3306,
      user: 'consultant_seg',
      password: '49BD&4vyrK6=PT!',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  {
    name: '[91.134.35.126] Port 3306 - Consultant',
    config: {
      host: '91.134.35.126',
      port: 3306,
      user: 'Consultant',
      password: 'A4b6xb1s*',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  {
    name: '[91.134.35.126] Port 3307',
    config: {
      host: '91.134.35.126',
      port: 3307,
      user: 'consultant_seg',
      password: '49BD&4vyrK6=PT!',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  // Tests sur 217.182.94.86
  {
    name: '[217.182.94.86] Port 3306 - consultant_seg',
    config: {
      host: '217.182.94.86',
      port: 3306,
      user: 'consultant_seg',
      password: '49BD&4vyrK6=PT!',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  {
    name: '[217.182.94.86] Port 3306 - Consultant',
    config: {
      host: '217.182.94.86',
      port: 3306,
      user: 'Consultant',
      password: 'A4b6xb1s*',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  {
    name: '[217.182.94.86] Port 3307',
    config: {
      host: '217.182.94.86',
      port: 3307,
      user: 'consultant_seg',
      password: '49BD&4vyrK6=PT!',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  },
  {
    name: '[217.182.94.86] Port 33060 (MySQL X)',
    config: {
      host: '217.182.94.86',
      port: 33060,
      user: 'consultant_seg',
      password: '49BD&4vyrK6=PT!',
      database: 'Dev_Entitedb',
      connectTimeout: 10000,
    }
  }
];

async function testConnection(testConfig) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Test: ${testConfig.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Host: ${testConfig.config.host}:${testConfig.config.port}`);
  console.log(`User: ${testConfig.config.user}`);
  console.log(`Database: ${testConfig.config.database}`);
  
  let connection;
  try {
    console.log('⏳ Tentative de connexion...');
    connection = await mysql.createConnection(testConfig.config);
    console.log('✅ Connexion réussie!');
    
    // Test query
    const [rows] = await connection.execute('SELECT 1 + 1 AS result');
    console.log('✅ Requête de test réussie:', rows[0]);
    
    // Get server info
    const [serverInfo] = await connection.execute('SELECT VERSION() as version');
    console.log('📊 Version MySQL:', serverInfo[0].version);
    
    // Test access to app_parameters table
    try {
      const [params] = await connection.execute('SELECT COUNT(*) as count FROM app_parameters');
      console.log('✅ Accès à app_parameters:', params[0].count, 'paramètres trouvés');
    } catch (err) {
      console.log('⚠️  Erreur accès app_parameters:', err.message);
    }
    
    return { success: true, config: testConfig };
  } catch (error) {
    console.log('❌ Échec de connexion');
    console.log('Code erreur:', error.code);
    console.log('Message:', error.message);
    if (error.errno) console.log('Errno:', error.errno);
    if (error.sqlState) console.log('SQL State:', error.sqlState);
    return { success: false, error, config: testConfig };
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Connexion fermée');
    }
  }
}

async function runAllTests() {
  console.log('\n🚀 Démarrage des tests de connexion MySQL\n');
  
  const results = [];
  for (const testConfig of testConfigs) {
    const result = await testConnection(testConfig);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between tests
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 RÉSUMÉ DES TESTS');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  if (successful.length > 0) {
    console.log('\n✅ Connexions réussies:');
    successful.forEach(r => {
      console.log(`  - ${r.config.name}`);
      console.log(`    ${r.config.config.host}:${r.config.config.port} (user: ${r.config.config.user})`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Connexions échouées:');
    failed.forEach(r => {
      console.log(`  - ${r.config.name}`);
      console.log(`    Erreur: ${r.error.code} - ${r.error.message}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${successful.length}/${results.length} réussis`);
  console.log('='.repeat(60) + '\n');
}

runAllTests().catch(console.error);
