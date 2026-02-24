const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function debugTransmissions() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // Check recent transmissions
    const [transmissions] = await conn.query(`
      SELECT id, related_id, related_type, document_type, direction, status, retry_count, created_at, updated_at 
      FROM edi_transmissions 
      ORDER BY id DESC 
      LIMIT 10
    `);
    console.log('\n--- RECENT TRANSMISSIONS ---');
    console.table(transmissions);

    // Check recent orders again to correlate
    const [orders] = await conn.query(`
      SELECT id_order, num_commande, status, created_at 
      FROM orders 
      ORDER BY id_order DESC 
      LIMIT 5
    `);
    console.log('\n--- RECENT ORDERS ---');
    console.table(orders);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

debugTransmissions();
