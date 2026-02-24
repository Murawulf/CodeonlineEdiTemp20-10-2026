// =====================================================================
// Génération d'un jeu de tests complet pour tous les statuts de commandes
// =====================================================================

const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function generateCompleteTestSet() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     GÉNÉRATION JEU DE TESTS COMPLET - TOUS LES STATUTS        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connecté à MySQL\n');

    // Récupérer les entités avec GLN
    const [entities] = await connection.execute(
      'SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln IS NOT NULL AND gln != "" LIMIT 2'
    );
    
    if (entities.length < 2) {
      console.log('❌ Besoin d\'au moins 2 entités avec GLN');
      return;
    }

    const supplier = entities[0]; // Nous (fournisseur)
    const buyer = entities[1];     // Client

    console.log(`Fournisseur: ${supplier.raison_socialle} (GLN: ${supplier.gln})`);
    console.log(`Client: ${buyer.raison_socialle} (GLN: ${buyer.gln})\n`);

    // Nettoyer les anciennes données de test
    console.log('--- Nettoyage des anciennes données de test ---');
    await connection.execute('DELETE FROM edi_orders WHERE document_number LIKE "TEST-%"');
    await connection.execute('DELETE FROM orders WHERE num_commande LIKE "TEST-%"');
    await connection.execute('DELETE FROM order_lines WHERE id_order NOT IN (SELECT id_order FROM orders)');
    console.log('✅ Données de test précédentes supprimées\n');

    const timestamp = Date.now();
    const testOrders = [];

    // ========================================================================
    // COMMANDES REÇUES (dans edi_orders - staging)
    // ========================================================================
    console.log('=== CRÉATION DES COMMANDES REÇUES (STAGING) ===\n');

    // 1. Commande reçue - En attente de traitement (PENDING_VALIDATION)
    const doc1 = `TEST-RECEIVED-PENDING-${timestamp}`;
    const rawData1 = {
      documentNumber: doc1,
      documentDate: new Date().toISOString().slice(0,10).replace(/-/g, ''),
      deliveryDateRequested: new Date(Date.now() + 86400000 * 7).toISOString().slice(0,10).replace(/-/g, ''),
      buyer: { gln: buyer.gln, name: buyer.raison_socialle },
      supplier: { gln: supplier.gln, name: supplier.raison_socialle },
      currency: 'TND',
      totals: { totalAmount: 500 },
      items: [
        { lineNumber: 1, gtin: '1234567890123', description: 'Produit Test A', qty: 10, unit: 'PCE', price: 25.00, lineAmount: 250 },
        { lineNumber: 2, gtin: '9876543210987', description: 'Produit Test B', qty: 10, unit: 'PCE', price: 25.00, lineAmount: 250 }
      ]
    };

    const [result1] = await connection.execute(`
      INSERT INTO edi_orders (
        transmission_id, document_number, buyer_gln, supplier_gln,
        order_date, delivery_date, currency, total_amount, status, raw_data
      ) VALUES (NULL, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'TND', 500, 'PENDING_VALIDATION', ?)
    `, [doc1, buyer.gln, supplier.gln, JSON.stringify(rawData1)]);
    
    testOrders.push({ type: 'REÇUE', status: 'PENDING_VALIDATION', doc: doc1, id: result1.insertId, table: 'edi_orders' });
    console.log(`✅ [1/8] Commande REÇUE - PENDING_VALIDATION: ${doc1} (ID: ${result1.insertId})`);

    // ========================================================================
    // COMMANDES DANS ORDERS (production)
    // ========================================================================
    console.log('\n=== CRÉATION DES COMMANDES EN PRODUCTION ===\n');

    // 2. Commande reçue - Acceptée
    const doc2 = `TEST-RECEIVED-ACCEPTED-${timestamp}`;
    const [result2] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', 600, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())
    `, [doc2, doc2, buyer.id_entite, buyer.gln, supplier.id_entite, supplier.gln, supplier.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 15, 'PCE', 20.00, 300),
             (?, 2, '9876543210987', 'Produit Test B', 15, 'PCE', 20.00, 300)
    `, [result2.insertId, result2.insertId]);
    
    testOrders.push({ type: 'REÇUE', status: 'ACCEPTED', doc: doc2, id: result2.insertId, table: 'orders' });
    console.log(`✅ [2/8] Commande REÇUE - ACCEPTED: ${doc2} (ID: ${result2.insertId})`);

    // 3. Commande reçue - Refusée
    const doc3 = `TEST-RECEIVED-REJECTED-${timestamp}`;
    const [result3] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', 400, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())
    `, [doc3, doc3, buyer.id_entite, buyer.gln, supplier.id_entite, supplier.gln, supplier.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 10, 'PCE', 20.00, 200),
             (?, 2, '9876543210987', 'Produit Test B', 10, 'PCE', 20.00, 200)
    `, [result3.insertId, result3.insertId]);
    
    testOrders.push({ type: 'REÇUE', status: 'REJECTED', doc: doc3, id: result3.insertId, table: 'orders' });
    console.log(`✅ [3/8] Commande REÇUE - REJECTED: ${doc3} (ID: ${result3.insertId})`);

    // 4. Commande reçue - Modifiée
    const doc4 = `TEST-RECEIVED-MODIFIED-${timestamp}`;
    const [result4] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'modified', 550, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 10 DAY), NOW())
    `, [doc4, doc4, buyer.id_entite, buyer.gln, supplier.id_entite, supplier.gln, supplier.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 12, 'PCE', 22.00, 264),
             (?, 2, '9876543210987', 'Produit Test B', 13, 'PCE', 22.00, 286)
    `, [result4.insertId, result4.insertId]);
    
    testOrders.push({ type: 'REÇUE', status: 'MODIFIED', doc: doc4, id: result4.insertId, table: 'orders' });
    console.log(`✅ [4/8] Commande REÇUE - MODIFIED: ${doc4} (ID: ${result4.insertId})`);

    // ========================================================================
    // COMMANDES ENVOYÉES (nous sommes l'acheteur)
    // ========================================================================
    console.log('\n=== CRÉATION DES COMMANDES ENVOYÉES ===\n');

    // 5. Commande envoyée - En attente (sent)
    const doc5 = `TEST-SENT-PENDING-${timestamp}`;
    const [result5] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', 700, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), NOW())
    `, [doc5, doc5, supplier.id_entite, supplier.gln, buyer.id_entite, buyer.gln, buyer.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 20, 'PCE', 17.50, 350),
             (?, 2, '9876543210987', 'Produit Test B', 20, 'PCE', 17.50, 350)
    `, [result5.insertId, result5.insertId]);
    
    testOrders.push({ type: 'ENVOYÉE', status: 'SENT', doc: doc5, id: result5.insertId, table: 'orders' });
    console.log(`✅ [5/8] Commande ENVOYÉE - SENT (readonly): ${doc5} (ID: ${result5.insertId})`);

    // 6. Commande envoyée - Acceptée par le fournisseur
    const doc6 = `TEST-SENT-ACCEPTED-${timestamp}`;
    const [result6] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', 800, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), NOW())
    `, [doc6, doc6, supplier.id_entite, supplier.gln, buyer.id_entite, buyer.gln, buyer.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 25, 'PCE', 16.00, 400),
             (?, 2, '9876543210987', 'Produit Test B', 25, 'PCE', 16.00, 400)
    `, [result6.insertId, result6.insertId]);
    
    testOrders.push({ type: 'ENVOYÉE', status: 'ACCEPTED', doc: doc6, id: result6.insertId, table: 'orders' });
    console.log(`✅ [6/8] Commande ENVOYÉE - ACCEPTED (readonly): ${doc6} (ID: ${result6.insertId})`);

    // 7. Commande envoyée - Refusée par le fournisseur
    const doc7 = `TEST-SENT-REJECTED-${timestamp}`;
    const [result7] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', 300, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), NOW())
    `, [doc7, doc7, supplier.id_entite, supplier.gln, buyer.id_entite, buyer.gln, buyer.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 10, 'PCE', 15.00, 150),
             (?, 2, '9876543210987', 'Produit Test B', 10, 'PCE', 15.00, 150)
    `, [result7.insertId, result7.insertId]);
    
    testOrders.push({ type: 'ENVOYÉE', status: 'REJECTED', doc: doc7, id: result7.insertId, table: 'orders' });
    console.log(`✅ [7/8] Commande ENVOYÉE - REJECTED: ${doc7} (ID: ${result7.insertId})`);

    // 8. Commande envoyée - Modifiée par le fournisseur
    const doc8 = `TEST-SENT-MODIFIED-${timestamp}`;
    const [result8] = await connection.execute(`
      INSERT INTO orders (
        num_commande, order_number, id_entite_buyer, acheteur_gln,
        id_entite_seller, fournisseur_gln, seller_name,
        status, total_ht, currency, date_commande, date_livraison, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'modified', 650, 'TND', NOW(), DATE_ADD(NOW(), INTERVAL 21 DAY), NOW())
    `, [doc8, doc8, supplier.id_entite, supplier.gln, buyer.id_entite, buyer.gln, buyer.raison_socialle]);
    
    await connection.execute(`
      INSERT INTO order_lines (id_order, line_number, gtin, libelle, qty, unit, price, line_net_amount)
      VALUES (?, 1, '1234567890123', 'Produit Test A', 18, 'PCE', 18.00, 324),
             (?, 2, '9876543210987', 'Produit Test B', 18, 'PCE', 18.11, 326)
    `, [result8.insertId, result8.insertId]);
    
    testOrders.push({ type: 'ENVOYÉE', status: 'MODIFIED', doc: doc8, id: result8.insertId, table: 'orders' });
    console.log(`✅ [8/8] Commande ENVOYÉE - MODIFIED: ${doc8} (ID: ${result8.insertId})`);

    // ========================================================================
    // RÉSUMÉ
    // ========================================================================
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    RÉSUMÉ DU JEU DE TESTS                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    
    console.log('📋 COMMANDES REÇUES (Vous êtes le fournisseur):');
    console.log('   [1] PENDING_VALIDATION - À traiter (EDITABLE)');
    console.log('   [2] ACCEPTED - Déjà acceptée (READONLY)');
    console.log('   [3] REJECTED - Déjà refusée (READONLY)');
    console.log('   [4] MODIFIED - Déjà modifiée (READONLY)');
    console.log('');
    console.log('📤 COMMANDES ENVOYÉES (Vous êtes l\'acheteur):');
    console.log('   [5] SENT - En attente de réponse (READONLY)');
    console.log('   [6] ACCEPTED - Acceptée par fournisseur (READONLY)');
    console.log('   [7] REJECTED - Refusée par fournisseur (READONLY)');
    console.log('   [8] MODIFIED - Modifiée par fournisseur (READONLY)');
    console.log('');
    console.log('✅ Jeu de tests complet généré avec succès!');
    console.log('');
    console.log('📝 NOTES:');
    console.log('   - Seule la commande [1] (PENDING_VALIDATION) devrait être éditable');
    console.log('   - Toutes les autres commandes devraient être en READONLY');
    console.log('   - Les commandes ENVOYÉES sont readonly car vous êtes l\'acheteur');
    console.log('   - Les commandes ACCEPTÉES/SENT sont readonly car déjà finalisées');
    console.log('');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connexion fermée.\n');
    }
  }
}

generateCompleteTestSet().catch(console.error);
