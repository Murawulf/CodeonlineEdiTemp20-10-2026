require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkLocalApiUrl() {
  const config = {
    host: '91.134.35.126',
    port: 3306,
    user: 'consultant_seg',
    password: process.env.DB_PASSWORD_SEG,
    database: 'Dev_Entitedb',
    connectTimeout: 10000,
  };
  
  let conn;
  
  try {
    console.log('\n🔍 Vérification du paramètre LOCAL_API_URL\n');
    console.log('=' .repeat(60));
    
    conn = await mysql.createConnection(config);
    console.log('✅ Connecté à la base de données\n');
    
    // Vérifier LOCAL_API_URL
    const [rows] = await conn.execute(
      'SELECT * FROM app_parameters WHERE param_key = ?',
      ['LOCAL_API_URL']
    );
    
    // Déterminer le port attendu (Variable d'env ou 5001 par défaut)
    const EXPECTED_PORT = process.env.PORT || 5001;
    const EXPECTED_LOCAL_URL = `http://localhost:${EXPECTED_PORT}`;

    if (rows.length === 0) {
      console.log('❌ Paramètre LOCAL_API_URL NON TROUVÉ dans la base de données');
      console.log('\n💡 Solution: Le paramètre doit être créé ou utiliser la variable d\'environnement');
    } else {
      const param = rows[0];
      console.log('📊 Paramètre LOCAL_API_URL trouvé:');
      console.log(`   - Valeur actuelle: "${param.param_value}"`);
      console.log(`   - Type: ${param.param_type}`);
      console.log(`   - Public: ${param.is_public ? 'Oui' : 'Non'}`);
      console.log(`   - Description: ${param.description || 'N/A'}`);
      
      // Si la valeur actuelle est différente du port attendu et qu'on est en localhost
      if (param.param_value.includes('localhost') && param.param_value !== EXPECTED_LOCAL_URL) {
        console.log(`\n⚠️  DIFFÉRENCE DÉTECTÉE: La valeur actuelle est différente de ${EXPECTED_LOCAL_URL}`);
        
        // On ne force plus la correction automatique car 5000 est valide pour le Sénégal
        // On informe juste l'utilisateur
        console.log(`ℹ️  Note: Le port utilisé par l'application est ${EXPECTED_PORT}.`);
        console.log(`👉 Assurez-vous que cela correspond à votre configuration souhaitée.`);
      } else {
        console.log(`\n✅ La configuration semble correcte.`);
      }
    }
    
    // Vérifier aussi WEBSOCKET_URL
    console.log('\n' + '=' .repeat(60));
    const [wsRows] = await conn.execute(
      'SELECT * FROM app_parameters WHERE param_key = ?',
      ['WEBSOCKET_URL']
    );
    
    if (wsRows.length > 0) {
      const wsParam = wsRows[0];
      console.log('📊 Paramètre WEBSOCKET_URL:');
      console.log(`   - Valeur actuelle: "${wsParam.param_value}"`);
      
      if (wsParam.param_value === 'http://localhost:5000') {
        console.log('⚠️  WEBSOCKET_URL utilise aussi le port 5000');
        console.log('🔧 Correction en cours...');
        
        await conn.execute(
          'UPDATE app_parameters SET param_value = ?, updated_at = NOW() WHERE param_key = ?',
          ['http://localhost:5001', 'WEBSOCKET_URL']
        );
        
        console.log('✅ WEBSOCKET_URL mis à jour vers http://localhost:5001');
      }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Vérification terminée');
    console.log('=' .repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
  } finally {
    if (conn) await conn.end();
  }
}

checkLocalApiUrl();
