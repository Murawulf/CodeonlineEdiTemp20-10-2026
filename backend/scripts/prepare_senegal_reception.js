
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
    console.log("Connected to Senegal DB");

    // 1. Ensure Tunisia Buyer Exists (GLN: 6199999900001)
    let [buyers] = await connection.execute('SELECT id_entite FROM Entite WHERE gln = ?', ['6199999900001']);
    let buyerId;
    if (buyers.length > 0) {
      buyerId = buyers[0].id_entite;
      console.log(`Found Tunisia Buyer: ${buyerId}`);
    } else {
      const [res] = await connection.execute('INSERT INTO Entite (raison_socialle, gln, pays, date_create, region) VALUES (?, ?, ?, NOW(), ?)', ['Tunisia Buyer Test', '6199999900001', '788', 'Tunis']);
      buyerId = res.insertId;
      console.log(`Created Tunisia Buyer: ${buyerId}`);
    }

    // 2. Ensure Senegal Seller Exists (GLN: SN02583102G3)
    let [sellers] = await connection.execute('SELECT id_entite FROM Entite WHERE gln = ?', ['SN02583102G3']);
    let sellerId;
    if (sellers.length > 0) {
      sellerId = sellers[0].id_entite;
      console.log(`Found Senegal Seller: ${sellerId}`);
    } else {
      console.error("Senegal Seller not found! This should exist.");
      process.exit(1);
    }

    // 3. Create/Update Test Order to receive the update
    // Order Number MUST match what we created in Tunisia: ORD-TUN-SEN-1772277340563
    const numCommande = 'ORD-TUN-SEN-1772277340563';
    
    // Check if exists first
    let [existing] = await connection.execute('SELECT id_order FROM orders WHERE num_commande = ?', [numCommande]);
    let orderId;

    if (existing.length > 0) {
        orderId = existing[0].id_order;
        console.log(`Order ${numCommande} already exists (ID: ${orderId}). Resetting status to 'sent'.`);
        await connection.execute("UPDATE orders SET status = 'sent', updated_at = NOW() WHERE id_order = ?", [orderId]);
    } else {
        const [result] = await connection.execute(
          `INSERT INTO orders 
           (num_commande, order_number, id_entite_buyer, id_entite_seller, status, total_ht, created_at, updated_at, acheteur_gln, fournisseur_gln, seller_name)
           VALUES (?, ?, ?, ?, 'sent', 100.00, NOW(), NOW(), ?, ?, ?)`,
          [numCommande, numCommande, buyerId, sellerId, '6199999900001', 'SN02583102G3', 'NETCONSULTING EUROPE LTD']
        );
        orderId = result.insertId;
        console.log(`Created Senegal Order ID: ${orderId} (${numCommande})`);
    }

    // 4. Add Line Item (Original values: Qty 10, Price 10)
    // We expect the incoming ORDCHG to update confirmed_qty to 8 and confirmed_price to 12
    await connection.execute('DELETE FROM order_lines WHERE id_order = ?', [orderId]);
    await connection.execute(
      `INSERT INTO order_lines 
       (id_order, gtin, qty, price) 
       VALUES (?, '1234567890123', 10, 10.00)`,
      [orderId]
    );

    console.log("\n--- SENEGAL PREP INFO ---");
    console.log(`Ready to receive ORDCHG for Order #${orderId} (${numCommande})`);

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
