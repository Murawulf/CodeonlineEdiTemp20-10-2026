const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function debugUserAndOrders() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // 1. Find user "Majd"
    const [users] = await conn.query(`
      SELECT c.id_compte, c.email, c.name, c.prenom, c.id_entite, e.raison_socialle, e.gln 
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      WHERE c.name LIKE '%Majd%' OR c.prenom LIKE '%Majd%'
    `);
    console.log('\n--- USER MAJD ---');
    console.table(users);

    if (users.length > 0) {
      const user = users[0];
      const buyerId = user.id_entite;
      
      // 2. Check orders for this entity (as Buyer)
      const [orders] = await conn.query(`
        SELECT id_order, num_commande, status, created_at, id_entite_seller, seller_name 
        FROM orders 
        WHERE id_entite_buyer = ? 
        ORDER BY id_order DESC 
        LIMIT 5
      `, [buyerId]);
      console.log(`\n--- ORDERS FOR ENTITY ${buyerId} (Buyer) ---`);
      console.table(orders);

      // 3. Check notifications for this user
      const [notifs] = await conn.query(`
        SELECT id_notification, contenu, type, created_at, \`read\`
        FROM notifications 
        WHERE id_compte = ? 
        ORDER BY id_notification DESC 
        LIMIT 5
      `, [user.id_compte]);
      console.log(`\n--- NOTIFICATIONS FOR USER ${user.id_compte} ---`);
      console.table(notifs);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

debugUserAndOrders();
