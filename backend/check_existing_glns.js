// Check existing GLNs in the database
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function checkGLNs() {
  const connection = await mysql.createConnection(dbConfig);
  
  console.log('\n=== Existing Entities with GLNs ===\n');
  const [entities] = await connection.execute(
    'SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln IS NOT NULL AND gln != "" LIMIT 10'
  );
  
  entities.forEach(e => {
    console.log(`ID: ${e.id_entite}, GLN: ${e.gln}, Name: ${e.raison_socialle}`);
  });
  
  console.log(`\nTotal entities with GLN: ${entities.length}`);
  
  await connection.end();
}

checkGLNs().catch(console.error);
