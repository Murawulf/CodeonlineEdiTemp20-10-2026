
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log("Connected to DB");

    // 1. Find two entities (Buyer and Seller)
    // We'll just take the first two entities we find, or specific ones if possible.
    const [entities] = await connection.execute('SELECT id_entite, raison_socialle, gln FROM Entite LIMIT 2');
    
    if (entities.length < 2) {
      console.error("Not enough entities found");
      process.exit(1);
    }

    const buyer = entities[0];
    const seller = entities[1];
    
    console.log(`Buyer: ${buyer.id_entite} (${buyer.raison_socialle})`);
    console.log(`Seller: ${seller.id_entite} (${seller.raison_socialle})`);

    // 2. Create or Find an order
    // We'll create a dummy order for testing to avoid messing up real data if possible, 
    // or update an old one. Let's create one to be safe.
    
    const numCommande = `TEST-ORDCHG-${Date.now()}`;
    
    const [result] = await connection.execute(
      `INSERT INTO orders 
       (num_commande, order_number, id_entite_buyer, id_entite_seller, status, total_ht, created_at, updated_at, acheteur_gln, fournisseur_gln, seller_name)
       VALUES (?, ?, ?, ?, 'modified', 100.00, NOW(), NOW(), ?, ?, ?)`,
      [numCommande, numCommande, buyer.id_entite, seller.id_entite, buyer.gln, seller.gln, seller.raison_socialle]
    );

    const orderId = result.insertId;
    console.log(`Created Test Order ID: ${orderId} with status 'modified'`);

    // 3. Add a line item
    await connection.execute(
      `INSERT INTO order_lines 
       (id_order, gtin, qty, price, confirmed_qty, confirmed_price) 
       VALUES (?, '1234567890123', 10, 10.00, 8, 12.00)`,
      [orderId]
    );
    console.log("Added line item with modification (Qty: 10->8, Price: 10->12)");

    // 4. Output curl command info
    console.log("\n--- TEST INFO ---");
    console.log(JSON.stringify({
      orderId: orderId,
      buyerId: buyer.id_entite,
      pin: process.env.API_PIN || '3311'
    }));

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
