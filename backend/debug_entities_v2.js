const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function debugEntities() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // 1. List all Entities (limit 5)
    const [entities] = await conn.query('SELECT id_entite, raison_socialle, gln FROM Entite LIMIT 5');
    console.log('\n--- ENTITIES ---');
    console.table(entities);

    // 2. List all Accounts (limit 5)
    // We want to see who is linked to which entity
    const [accounts] = await conn.query(`
      SELECT c.id_compte, c.email, c.id_entite, e.raison_socialle 
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      LIMIT 5
    `);
    console.log('\n--- ACCOUNTS ---');
    console.table(accounts);

    // 3. Check recent orders
    const [orders] = await conn.query(`
      SELECT id_order, num_commande, id_entite_buyer, acheteur_gln, id_entite_seller, seller_name, status, created_at 
      FROM orders 
      ORDER BY id_order DESC 
      LIMIT 5
    `);
    console.log('\n--- RECENT ORDERS ---');
    console.table(orders);

    // 4. Check notifications
    // Check if table exists first
    try {
        const [notifs] = await conn.query(`
        SELECT id_notification, id_compte, contenu, type, created_at, \`read\`
        FROM notifications 
        ORDER BY id_notification DESC 
        LIMIT 5
        `);
        console.log('\n--- RECENT NOTIFICATIONS ---');
        console.table(notifs);
    } catch (e) {
        console.log('\n--- RECENT NOTIFICATIONS ---');
        console.log("Error querying notifications table: " + e.message);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

debugEntities();
