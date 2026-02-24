const mysql = require('mysql2/promise');
const { generateOrderResponseEANCOM } = require('./generateOrderResponseEANCOM'); // Verify this works standalone if needed, or just mock content
const path = require('path');
const { dbConfig } = require('./config/database');

async function generateTestScenarios() {
    console.log("=== GENERATING TEST SCENARIOS ===");
    
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("✅ Connected to MySQL");

        // 1. Get Entities with valid GLNs
        const [entities] = await connection.execute("SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln IS NOT NULL AND gln != '' LIMIT 2");
        if (entities.length < 2) {
            console.error("❌ Need at least 2 entities with GLNs in DB to generate test data.");
            return;
        }

        // Assume Entity 1 is US (The User/Seller usually) and Entity 2 is the PARTNER (Buyer)
        // Adjust logic if user is Buyer. 
        // Let's create scenarios where Entity 1 is Supplier (Incoming Orders) and Entity 1 is Buyer (Sent Orders)
        const us = entities[0];
        const partner = entities[1];

        console.log(`Using 'Us': ${us.raison_socialle} (${us.gln})`);
        console.log(`Using 'Partner': ${partner.raison_socialle} (${partner.gln})`);

        // === SCENARIO 1: NEW INCOMING ORDER (Ready to be processed) ===
        // Insert into edi_orders (Staging)
        console.log("\n--- Scenario 1: New Incoming Order (Pending) ---");
        const docNum1 = `CMD-TEST-${Date.now()}-1`;
        const rawData1 = {
            documentNumber: docNum1,
            documentDate: new Date().toISOString().slice(0,10).replace(/-/g, ""),
            deliveryDateRequested: new Date(Date.now() + 86400000 * 7).toISOString().slice(0,10).replace(/-/g, ""),
            buyer: { gln: partner.gln, name: partner.raison_socialle },
            supplier: { gln: us.gln, name: us.raison_socialle },
            currency: "TND",
            totals: { totalAmount: 150.00, taxAmount: 28.50 },
            items: [
                { lineNumber: 1, gtin: "1234567890123", description: "Test Product A", qty: 10, price: 10.00, lineAmount: 100.00 },
                { lineNumber: 2, gtin: "9876543210987", description: "Test Product B", qty: 5, price: 10.00, lineAmount: 50.00 }
            ]
        };

        const [res1] = await connection.execute(`
            INSERT INTO edi_orders (
                transmission_id, document_number, buyer_gln, supplier_gln,
                order_date, delivery_date, currency, total_amount,
                status, raw_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            0, // Fake transmission ID
            docNum1,
            partner.gln,
            us.gln,
            new Date(),
            new Date(Date.now() + 86400000 * 7),
            "TND",
            150.00,
            "PENDING_VALIDATION",
            JSON.stringify(rawData1)
        ]);
        console.log(`✅ Created Incoming Order #${res1.insertId} in edi_orders`);


        // === SCENARIO 2: PROCESSED ORDER - ACCEPTED ===
        // Insert into orders (Production)
        console.log("\n--- Scenario 2: History - Accepted Order ---");
        const docNum2 = `CMD-TEST-${Date.now()}-2`;
        const [res2] = await connection.execute(`
            INSERT INTO orders (
                num_commande, order_number, 
                id_entite_buyer, acheteur_gln,
                id_entite_seller, fournisseur_gln, seller_name,
                status, total_ht, currency, date_commande, date_livraison, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            docNum2, docNum2,
            partner.id_entite, partner.gln,
            us.id_entite, us.gln, us.raison_socialle,
            "accepted", 200.00, "TND", new Date(), new Date()
        ]);
        const orderId2 = res2.insertId;
        
        await connection.execute(`
            INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, price, line_net_amount)
            VALUES (?, 1, '1234567890123', 'Accepted Product', 20, 10.00, 200.00)
        `, [orderId2]);
        console.log(`✅ Created Accepted Order #${orderId2} in orders`);

        // === SCENARIO 3: PROCESSED ORDER - REJECTED ===
        console.log("\n--- Scenario 3: History - Rejected Order ---");
        const docNum3 = `CMD-TEST-${Date.now()}-3`;
        const [res3] = await connection.execute(`
            INSERT INTO orders (
                num_commande, order_number, 
                id_entite_buyer, acheteur_gln,
                id_entite_seller, fournisseur_gln, seller_name,
                status, total_ht, currency, date_commande, date_livraison, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            docNum3, docNum3,
            partner.id_entite, partner.gln,
            us.id_entite, us.gln, us.raison_socialle,
            "rejected", 500.00, "TND", new Date(), new Date()
        ]);
        console.log(`✅ Created Rejected Order #${res3.insertId} in orders`);

        // === SCENARIO 4: PROCESSED ORDER - MODIFIED ===
        console.log("\n--- Scenario 4: History - Modified Order ---");
        const docNum4 = `CMD-TEST-${Date.now()}-4`;
        const [res4] = await connection.execute(`
            INSERT INTO orders (
                num_commande, order_number, 
                id_entite_buyer, acheteur_gln,
                id_entite_seller, fournisseur_gln, seller_name,
                status, total_ht, currency, date_commande, date_livraison, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            docNum4, docNum4,
            partner.id_entite, partner.gln,
            us.id_entite, us.gln, us.raison_socialle,
            "modified", 300.00, "TND", new Date(), new Date()
        ]);
        const orderId4 = res4.insertId;
        await connection.execute(`
            INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, price, line_net_amount)
            VALUES (?, 1, '1234567890123', 'Modified Product', 30, 10.00, 300.00)
        `, [orderId4]);
        console.log(`✅ Created Modified Order #${orderId4} in orders`);


        // === SCENARIO 5: SENT ORDER (We are Buyer) ===
        console.log("\n--- Scenario 5: Sent Order (We are Buyer) ---");
        const docNum5 = `CMD-SENT-${Date.now()}-5`;
        const [res5] = await connection.execute(`
            INSERT INTO orders (
                num_commande, order_number, 
                id_entite_buyer, acheteur_gln,
                id_entite_seller, fournisseur_gln, seller_name,
                status, total_ht, currency, date_commande, date_livraison, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            docNum5, docNum5,
            us.id_entite, us.gln, // We are buyer
            partner.id_entite, partner.gln, partner.raison_socialle, // They are seller
            "sent", 1000.00, "TND", new Date(), new Date()
        ]);
        const orderId5 = res5.insertId;
        await connection.execute(`
            INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, price, line_net_amount)
            VALUES (?, 1, '9999999999999', 'Sent Product', 100, 10.00, 1000.00)
        `, [orderId5]);
        console.log(`✅ Created Sent Order #${orderId5} in orders`);

        console.log("\n=== TEST DATA GENERATION COMPLETE ===");

    } catch (err) {
        console.error("Critical Error:", err);
    } finally {
        if (connection) await connection.end();
    }
}

generateTestScenarios();
