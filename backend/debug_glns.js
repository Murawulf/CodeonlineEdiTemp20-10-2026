const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function debugGLNs() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // 1. Check Entity for GLN 6191907700002
    const [ent34] = await conn.query('SELECT id_entite, raison_socialle, gln FROM Entite WHERE gln = ?', ['6191907700002']);
    console.log('\n--- ENTITY FOR GLN 6191907700002 ---');
    console.table(ent34);

    // 2. Check Entity 15 (Majd's Entity)
    const [ent15] = await conn.query('SELECT id_entite, raison_socialle, gln FROM Entite WHERE id_entite = ?', [15]);
    console.log('\n--- ENTITY 15 ---');
    console.table(ent15);
    
    // 3. Check GLN for User Majd directly from Login logic (joined)
    const [user] = await conn.query(`
        SELECT c.id_compte, c.email, c.id_entite, e.gln 
        FROM comptes c 
        LEFT JOIN Entite e ON c.id_entite = e.id_entite 
        WHERE c.id_compte = 3
    `);
    console.log('\n--- USER MAJD (ID 3) ---');
    console.table(user);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

debugGLNs();
