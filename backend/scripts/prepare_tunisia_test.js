
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
    console.log("Connected to Tunisia DB");

    // 1. Ensure Tunisia Buyer Exists (GLN: 6199999900001)
    // We use ID 1012 based on previous grep, or create if missing
    let [buyers] = await connection.execute('SELECT id_entite FROM Entite WHERE gln = ?', ['6199999900001']);
    let buyerId;
    if (buyers.length > 0) {
      buyerId = buyers[0].id_entite;
      console.log(`Found Tunisia Buyer: ${buyerId}`);
    } else {
      const [res] = await connection.execute('INSERT INTO Entite (raison_socialle, gln, pays) VALUES (?, ?, ?)', ['Tunisia Buyer Test', '6199999900001', '788']);
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
      const [res] = await connection.execute('INSERT INTO Entite (raison_socialle, gln, pays, date_create, region) VALUES (?, ?, ?, NOW(), ?)', ['Senegal Seller Test', 'SN02583102G3', '686', 'Dakar']);
      sellerId = res.insertId;
      console.log(`Created Senegal Seller: ${sellerId}`);
    }

    // 3. Create/Update Test Order
    const numCommande = `ORD-TUN-SEN-${Date.now()}`;
    
    const [result] = await connection.execute(
      `INSERT INTO orders 
       (num_commande, order_number, id_entite_buyer, id_entite_seller, status, total_ht, created_at, updated_at, acheteur_gln, fournisseur_gln, seller_name)
       VALUES (?, ?, ?, ?, 'modified', 100.00, NOW(), NOW(), ?, ?, ?)`,
      [numCommande, numCommande, buyerId, sellerId, '6199999900001', 'SN02583102G3', 'Senegal Seller Test']
    );

    const orderId = result.insertId;
    console.log(`Created Tunisia Order ID: ${orderId} (${numCommande})`);

    // 4. Add Line Item (Modified)
    await connection.execute(
      `INSERT INTO order_lines 
       (id_order, gtin, qty, price, confirmed_qty, confirmed_price) 
       VALUES (?, '1234567890123', 10, 10.00, 8, 12.00)`,
      [orderId]
    );

    console.log("\n--- TUNISIA TEST INFO ---");
    console.log(JSON.stringify({
      orderId: orderId,
      orderNumber: numCommande,
      buyerId: buyerId,
      pin: process.env.API_PIN || '3311'
    }));

  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
