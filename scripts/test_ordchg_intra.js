
require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:5001'; // Local API on the server
const API_PIN = process.env.API_PIN || '0000'; // Default or from env

async function runTest() {
    console.log("🚀 Starting ORDCHG Intra-Country Test (Tunisia -> Tunisia)...");

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'Consultant',
        password: process.env.DB_PASSWORD, // Must be provided in env
        database: process.env.DB_NAME || 'Dev_Entitedb'
    });

    try {
        // 1. Identify Buyer and Seller (Tunisia)
        // Buyer: Yutex Sarl (34)
        // Seller: Société Monia Bouzid sarl (33)
        const buyerId = 34;
        const sellerId = 33;

        console.log(`🔹 Using Buyer ID: ${buyerId}, Seller ID: ${sellerId}`);

        // 2. Create a "Modified" Order
        const numCommande = `TEST-ORDCHG-INTRA-${Date.now()}`;
        console.log(`🔹 Creating Order ${numCommande}...`);

        const [res] = await connection.execute(
            `INSERT INTO orders 
            (num_commande, order_number, id_entite_buyer, id_entite_seller, status, total_ht, created_at, updated_at, acheteur_gln, fournisseur_gln, seller_name, currency)
            SELECT ?, ?, ?, ?, 'modified', 150.00, NOW(), NOW(), b.gln, s.gln, s.raison_socialle, 'TND'
            FROM Entite b, Entite s
            WHERE b.id_entite = ? AND s.id_entite = ?`,
            [numCommande, numCommande, buyerId, sellerId, buyerId, sellerId]
        );

        const orderId = res.insertId;
        console.log(`✅ Order created with ID: ${orderId}`);

        // 3. Add Line Items (Original vs Confirmed)
        await connection.execute(
            `INSERT INTO order_lines 
            (id_order, line_number, gtin, libelle, qty, price, confirmed_qty, confirmed_price, unit) 
            VALUES 
            (?, 1, '6191234567890', 'Product A', 10, 10.00, 10, 10.00, 'PCE'),
            (?, 2, '6199876543210', 'Product B (Modified)', 20, 5.00, 15, 5.50, 'PCE')`,
            [orderId, orderId]
        );
        console.log("✅ Order lines added (with modifications)");

        // 4. Trigger "Accept Modifications"
        console.log("🔹 Triggering /api/orders/accept-modifications...");
        
        try {
            const response = await axios.post(`${API_URL}/api/orders/accept-modifications`, {
                orderId: orderId,
                buyerId: buyerId
            }, {
                headers: {
                    'x-api-pin': API_PIN,
                    'x-entite-id': buyerId,
                    'Content-Type': 'application/json'
                }
            });

            console.log("✅ API Response:", response.data);
        } catch (apiError) {
            console.error("❌ API Call Failed:", apiError.response ? apiError.response.data : apiError.message);
            // Don't exit, check DB logs
        }

        // 5. Verify EDI Transmission
        const [rows] = await connection.execute(
            `SELECT * FROM edi_transmissions 
             WHERE related_id = ? AND related_type = 'ORDER_CHANGE' AND document_type = 'ORDCHG' 
             ORDER BY id DESC LIMIT 1`,
            [orderId]
        );

        if (rows.length > 0) {
            const trans = rows[0];
            console.log(`\n✅ ORDCHG Transmission Found!`);
            console.log(`   ID: ${trans.id}`);
            console.log(`   Status: ${trans.status}`);
            console.log(`   Filename: ${trans.filename}`);
            console.log(`   Logs: ${trans.logs || 'N/A'}`);
            console.log(`   Error: ${trans.error_message || 'None'}`);
        } else {
            console.error("\n❌ No ORDCHG Transmission found for this order.");
        }

    } catch (err) {
        console.error("❌ Script Error:", err);
    } finally {
        await connection.end();
    }
}

runTest();
