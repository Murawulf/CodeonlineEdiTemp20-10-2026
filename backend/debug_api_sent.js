const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

const API_PIN = "3311";
const BUYER_ID = 33; // Entity ID for User 3 (Majd)

async function debugApiSent() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // Simulate the query from server.js /api/orders/sent
    const query = `
      SELECT 
        o.id_order, 
        o.num_commande,
        o.order_number,
        o.status, 
        o.created_at,
        o.total_ht,
        o.date_livraison,
        COALESCE(o.monnaie, o.currency, 'TND') as monnaie,
        o.id_entite_seller,
        o.id_entite_buyer,
        o.fournisseur_gln,
        o.acheteur_gln,
        COALESCE(
          o.seller_name,
          (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_seller LIMIT 1),
          'Fournisseur'
        ) AS seller_name,
        (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_buyer LIMIT 1) AS buyer_name
      FROM orders o
      WHERE o.id_entite_buyer = ?
      ORDER BY o.id_order DESC
    `;
    
    console.log(`Executing query for buyerId: ${BUYER_ID}`);
    const [orders] = await conn.query(query, [BUYER_ID]);
    
    console.log(`Found ${orders.length} orders.`);
    if (orders.length > 0) {
      console.table(orders.slice(0, 5)); // Show top 5
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

debugApiSent();
