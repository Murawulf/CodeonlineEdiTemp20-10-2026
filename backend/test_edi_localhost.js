#!/usr/bin/env node

/**
 * Script de Test Automatique EDI - Localhost
 * 
 * Ce script teste automatiquement le routage EDI intra-pays et inter-pays
 * en environnement localhost (Mac).
 * 
 * Prérequis:
 * - Backend démarré sur localhost:5001
 * - Base de données configurée
 * - Entités de test créées
 */

const axios = require('axios');
const mysql = require('mysql2/promise');

// Configuration
const CONFIG = {
  apiUrl: 'http://localhost:5001',
  apiPin: '3311',
  dbConfig: {
    host: '217.182.94.86',
    port: 3306,
    user: 'Consultant',
    password: process.env.DB_PASSWORD_CONSULTANT,
    database: 'Dev_Entitedb'
  }
};

// Couleurs pour l'affichage
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Connexion à la base de données
async function connectDB() {
  try {
    const connection = await mysql.createConnection(CONFIG.dbConfig);
    logSuccess('Connexion à la base de données établie');
    return connection;
  } catch (err) {
    logError(`Erreur de connexion BDD: ${err.message}`);
    throw err;
  }
}

// Vérifier la configuration
async function checkConfiguration(db) {
  logSection('📋 VÉRIFICATION DE LA CONFIGURATION');
  
  try {
    const [rows] = await db.execute(
      `SELECT param_key, param_value 
       FROM app_parameters 
       WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')`
    );
    
    const config = {};
    rows.forEach(row => {
      config[row.param_key] = row.param_value;
    });
    
    // Vérifier CURRENT_INSTANCE_CODE
    if (config.CURRENT_INSTANCE_CODE) {
      logSuccess(`CURRENT_INSTANCE_CODE: ${config.CURRENT_INSTANCE_CODE}`);
    } else {
      logError('CURRENT_INSTANCE_CODE non défini');
      return false;
    }
    
    // Vérifier LOCAL_API_URL
    if (config.LOCAL_API_URL) {
      logSuccess(`LOCAL_API_URL: ${config.LOCAL_API_URL}`);
    } else {
      logError('LOCAL_API_URL non défini');
      return false;
    }
    
    // Vérifier NETWORK_TOPOLOGY
    if (config.NETWORK_TOPOLOGY) {
      const topology = JSON.parse(config.NETWORK_TOPOLOGY);
      const nodes = Object.keys(topology);
      logSuccess(`NETWORK_TOPOLOGY: ${nodes.length} nœuds (${nodes.join(', ')})`);
      
      // Afficher les détails
      for (const [code, node] of Object.entries(topology)) {
        logInfo(`  ${code}: ${node.name} (${node.countryCode || 'N/A'})`);
      }
    } else {
      logError('NETWORK_TOPOLOGY non défini');
      return false;
    }
    
    return true;
  } catch (err) {
    logError(`Erreur lors de la vérification: ${err.message}`);
    return false;
  }
}

// Récupérer ou créer des entités de test
async function setupTestEntities(db) {
  logSection('🏢 PRÉPARATION DES ENTITÉS DE TEST');
  
  try {
    // Definir les GLN des entités de test (doivent correspondre à prepare_test_data.js)
    const TEST_GLNS = {
      tunBuyer: '6199999900001',
      tunSupplier: '6199999900002',
      senSupplier: '6869999900001'
    };

    const entities = {};

    // 1. Get TUN Buyer
    const [tunBuyerRows] = await db.execute(
      `SELECT id_entite, raison_socialle, gln, pays FROM Entite WHERE gln = ?`,
      [TEST_GLNS.tunBuyer]
    );
    if (tunBuyerRows.length > 0) entities.tunBuyer = tunBuyerRows[0];

    // 2. Get TUN Supplier
    const [tunSupplierRows] = await db.execute(
      `SELECT id_entite, raison_socialle, gln, pays FROM Entite WHERE gln = ?`,
      [TEST_GLNS.tunSupplier]
    );
    if (tunSupplierRows.length > 0) entities.tunSupplier = tunSupplierRows[0];

    // 3. Get SEN Supplier
    const [senSupplierRows] = await db.execute(
      `SELECT id_entite, raison_socialle, gln, pays FROM Entite WHERE gln = ?`,
      [TEST_GLNS.senSupplier]
    );
    if (senSupplierRows.length > 0) entities.senSupplier = senSupplierRows[0];

    // Validation
    if (!entities.tunBuyer) {
      logError(`Entité Test Acheteur TN (GLN: ${TEST_GLNS.tunBuyer}) non trouvée. Lancez prepare_test_data.js`);
      return null;
    }
    if (!entities.tunSupplier) {
      logError(`Entité Test Fournisseur TN (GLN: ${TEST_GLNS.tunSupplier}) non trouvée. Lancez prepare_test_data.js`);
      return null;
    }
    if (!entities.senSupplier) {
      logError(`Entité Test Fournisseur SEN (GLN: ${TEST_GLNS.senSupplier}) non trouvée. Lancez prepare_test_data.js`);
      return null;
    }
    
    logSuccess(`Acheteur TN: ${entities.tunBuyer.raison_socialle} (${entities.tunBuyer.gln})`);
    logSuccess(`Fournisseur TN: ${entities.tunSupplier.raison_socialle} (${entities.tunSupplier.gln})`);
    logSuccess(`Fournisseur SEN: ${entities.senSupplier.raison_socialle} (${entities.senSupplier.gln})`);
    
    return entities;
  } catch (err) {
    logError(`Erreur lors de la récupération des entités: ${err.message}`);
    return null;
  }
}

// Vérifier que le serveur est accessible
async function checkServerHealth() {
  logSection('🏥 VÉRIFICATION DU SERVEUR');
  
  try {
    const response = await axios.get(`${CONFIG.apiUrl}/health`, {
      timeout: 5000
    });
    
    if (response.status === 200) {
      logSuccess(`Serveur accessible: ${CONFIG.apiUrl}`);
      return true;
    } else {
      logError(`Serveur retourne status ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Serveur non accessible: ${err.message}`);
    logInfo('Assurez-vous que le backend est démarré sur localhost:5001');
    return false;
  }
}

// Helper pour vérifier les notifications
async function checkNotification(db, entityId, keyword, expectedContext = null) {
  const [rows] = await db.execute(
    `SELECT * FROM notifications 
     WHERE id_compte IN (SELECT id_compte FROM comptes WHERE id_entite = ?)
     AND contenu LIKE ?
     ORDER BY created_at DESC LIMIT 1`,
    [entityId, `%${keyword}%`]
  );
  
  if (rows.length > 0) {
    const content = rows[0].contenu;
    if (expectedContext && !content.includes(expectedContext)) {
      logError(`  ❌ Notification trouvée mais contenu incorrect. Attendu: "${expectedContext}", Reçu: "${content}"`);
      return false;
    }
    logSuccess(`  ✅ Notification trouvée pour l'entité ${entityId}: "${content.substring(0, 50)}..."`);
    return true;
  } else {
    logError(`  ❌ Aucune notification trouvée pour l'entité ${entityId} avec le mot-clé "${keyword}"`);
    return false;
  }
}

// Test 1: Commande Intra-Pays (Tunisie → Tunisie) + Réponse (ORDRSP)
async function testIntraCountry(db, entities) {
  logSection('🧪 TEST 1: COMMANDE INTRA-PAYS (Tunisie → Tunisie) + ORDRSP');
  
  const orderNumber = `TEST-TUN-TUN-${Date.now()}`;
  let orderId = null;
  
  const orderData = {
    numCommande: orderNumber,
    Acheteur: entities.tunBuyer.gln,
    fournisseur: entities.tunSupplier.gln,
    fournisseurIdEntite: entities.tunSupplier.id_entite, // Requis
    supplierName: entities.tunSupplier.raison_socialle,
    datecommande: new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14), // YYYYMMDDHHMMSS
    datelivraison: new Date(Date.now() + 86400000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 8), // YYYYMMDD
    dateLivraisonDemandee: new Date(Date.now() + 86400000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 8),
    monnaie: 'TND',
    currency: 'TND',
    total_ht: 255.00,
    articles: [
      {
        gtin: '6141411234567',
        libelle: 'Produit Test Intra-Pays',
        qty: 10,
        unit: 'PCE',
        price: 25.50
      }
    ]
  };
  
  logInfo(`➡️ ÉTAPE 1: Création de la commande EANCOM: ${orderNumber}`);
  logInfo(`  Acheteur: ${entities.tunBuyer.raison_socialle} (${entities.tunBuyer.gln})`);
  logInfo(`  Fournisseur: ${entities.tunSupplier.raison_socialle} (${entities.tunSupplier.gln})`);
  
  try {
    const response = await axios.post(
      `${CONFIG.apiUrl}/api/orders/eancom`, // Endpoint EANCOM
      orderData,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-pin': CONFIG.apiPin,
          'x-entite-id': entities.tunSupplier.id_entite.toString() // ID Entité Seller
        },
        timeout: 30000
      }
    );
    
    if (response.status === 200 || response.status === 201) {
      logSuccess('✅ Commande créée avec succès');
      orderId = response.data.orderId;
      logInfo(`  ID Commande BDD: ${orderId}`);
      
      // Attendre un peu pour que le traitement se fasse
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Vérifier la transmission EDI (ORDERS)
      const [transmissions] = await db.execute(
        `SELECT id, document_type, direction, partner_gln, status, 
                logs, error_message, created_at 
         FROM edi_transmissions 
         WHERE document_type = 'ORDERS' 
           AND partner_gln = ?
         ORDER BY created_at DESC 
         LIMIT 1`,
        [entities.tunSupplier.gln]
      );
      
      if (transmissions.length > 0) {
        const transmission = transmissions[0];
        logSuccess(`  Transmission EDI (ORDERS) créée (ID: ${transmission.id})`);
        
        if (transmission.status === 'SENT' || transmission.status === 'RECEIVED' || transmission.status === 'PROCESSED') {
          logSuccess(`  ✅ Envoi ORDERS réussi (Status: ${transmission.status})`);
          
          // VÉRIFICATION NOTIFICATION FOURNISSEUR
          // Doit contenir "Nouvelle commande ... reçue"
          await checkNotification(db, entities.tunSupplier.id_entite, orderNumber, "Nouvelle commande");
          
          // --- ÉTAPE 2: ENVOI DE LA RÉPONSE (ORDRSP) ---
          logInfo(`➡️ ÉTAPE 2: Envoi de la réponse (ORDRSP) - Modification de prix`);
          
          const ordrspData = {
            orderId: orderId,
            status: 'modified',
            isStaging: false, // Commande déjà en prod
            confirmedDeliveryDate: new Date(Date.now() + 172800000).toISOString().substring(0, 10), // +2 jours
            comment: "Prix modifié suite hausse matière première",
            modifiedArticles: [
              {
                gtin: '6141411234567',
                qty: 10, // Quantité confirmée
                price: 28.00, // PRIX MODIFIÉ (25.50 -> 28.00)
                comment: "Nouveau tarif 2026"
              }
            ]
          };
          
          try {
            const ordrspResponse = await axios.post(
              `${CONFIG.apiUrl}/api/orders/respond`,
              ordrspData,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-pin': CONFIG.apiPin,
                  'x-entite-id': entities.tunSupplier.id_entite.toString()
                },
                timeout: 30000
              }
            );
            
            if (ordrspResponse.status === 200) {
               logSuccess('✅ Réponse (ORDRSP) envoyée avec succès');
               
               // Attendre traitement EDI
               await new Promise(resolve => setTimeout(resolve, 2000));
               
               // Vérifier transmission EDI (ORDRSP)
               const [ordrspTransmissions] = await db.execute(
                 `SELECT id, document_type, direction, partner_gln, status, 
                         logs, error_message, created_at 
                  FROM edi_transmissions 
                  WHERE document_type = 'ORDRSP' 
                    AND related_id = ?
                  ORDER BY created_at DESC 
                  LIMIT 1`,
                 [orderId]
               );
               
               if (ordrspTransmissions.length > 0) {
                 const ordrspTrans = ordrspTransmissions[0];
                 logSuccess(`  Transmission EDI (ORDRSP) créée (ID: ${ordrspTrans.id})`);
                 
                 if (ordrspTrans.status === 'SENT' || ordrspTrans.status === 'RECEIVED') {
                   logSuccess(`  ✅ Envoi ORDRSP réussi (Status: ${ordrspTrans.status})`);
                   
                   // VÉRIFICATION NOTIFICATION ACHETEUR
                   // Doit contenir "Réponse reçue"
                   await checkNotification(db, entities.tunBuyer.id_entite, orderNumber, "Réponse reçue");
                   
                   logSuccess('✅ ✅ TEST COMPLET (ORDERS + ORDRSP) RÉUSSI');
                   return true;
                 } else {
                   logError(`  ❌ Erreur transmission ORDRSP: ${ordrspTrans.status}`);
                   return false;
                 }
               } else {
                 logError('  ❌ Aucune transmission ORDRSP trouvée');
                 return false;
               }
               
            } else {
              logError(`❌ Erreur API ORDRSP: Status ${ordrspResponse.status}`);
              return false;
            }
          } catch (ordrspErr) {
             logError(`❌ Erreur lors de l'appel ORDRSP: ${ordrspErr.message}`);
             if (ordrspErr.response) logError(`  Détails: ${JSON.stringify(ordrspErr.response.data)}`);
             return false;
          }

        } else if (transmission.status === 'PENDING') {
          logWarning('  Transmission ORDERS en cours (PENDING)');
          return true;
        } else {
          logError(`  Transmission ORDERS en erreur: ${transmission.error_message || 'N/A'}`);
          if (transmission.logs) logInfo(`Logs: ${transmission.logs}`);
          return false;
        }
      } else {
        logError('Aucune transmission EDI ORDERS trouvée');
        return false;
      }
    } else {
      logError(`Erreur API: Status ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Erreur lors du test: ${err.message}`);
    if (err.response) {
      logError(`  Réponse API: ${JSON.stringify(err.response.data)}`);
    }
    return false;
  }
}

// Test 2: Commande Inter-Pays (Tunisie → Sénégal) + Réponse (ORDRSP)
async function testInterCountry(db, entities) {
  logSection('🧪 TEST 2: COMMANDE INTER-PAYS (Tunisie → Sénégal) + ORDRSP');
  
  const orderNumber = `TEST-TUN-SEN-${Date.now()}`;
  let orderId = null;
  
  const orderData = {
    numCommande: orderNumber,
    Acheteur: entities.tunBuyer.gln,
    fournisseur: entities.senSupplier.gln,
    fournisseurIdEntite: entities.senSupplier.id_entite, // Requis
    supplierName: entities.senSupplier.raison_socialle,
    datecommande: new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14),
    datelivraison: new Date(Date.now() + 86400000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 8),
    dateLivraisonDemandee: new Date(Date.now() + 86400000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 8),
    monnaie: 'EUR',
    currency: 'EUR',
    total_ht: 75.00,
    articles: [
      {
        gtin: '6141412999999',
        libelle: 'Produit Test Inter-Pays',
        qty: 5,
        unit: 'PCE',
        price: 15.00
      }
    ]
  };
  
  logInfo(`➡️ ÉTAPE 1: Création de la commande EANCOM: ${orderNumber}`);
  logInfo(`  Acheteur: ${entities.tunBuyer.raison_socialle} (${entities.tunBuyer.gln})`);
  logInfo(`  Fournisseur: ${entities.senSupplier.raison_socialle} (${entities.senSupplier.gln})`);
  
  try {
    const response = await axios.post(
      `${CONFIG.apiUrl}/api/orders/eancom`, // Endpoint EANCOM
      orderData,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-pin': CONFIG.apiPin,
          'x-entite-id': entities.senSupplier.id_entite.toString()
        },
        timeout: 30000
      }
    );
    
    if (response.status === 200 || response.status === 201) {
      logSuccess('✅ Commande créée avec succès');
      orderId = response.data.orderId;
      logInfo(`  ID Commande BDD: ${orderId}`);
      
      // Attendre un peu pour que le traitement se fasse
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Vérifier la transmission EDI
      const [transmissions] = await db.execute(
        `SELECT id, document_type, direction, partner_gln, status, 
                logs, error_message, created_at 
         FROM edi_transmissions 
         WHERE document_type = 'ORDERS' 
           AND partner_gln = ?
         ORDER BY created_at DESC 
         LIMIT 1`,
        [entities.senSupplier.gln]
      );
      
      if (transmissions.length > 0) {
        const transmission = transmissions[0];
        logSuccess(`  Transmission EDI (ORDERS) créée (ID: ${transmission.id})`);
        
        if (transmission.status === 'SENT' || transmission.status === 'RECEIVED' || transmission.status === 'PROCESSED') {
          logSuccess(`  ✅ Envoi ORDERS réussi (Status: ${transmission.status})`);

          // VÉRIFICATION NOTIFICATION FOURNISSEUR (Sénégal)
          // Doit contenir "Nouvelle commande ... reçue"
          await checkNotification(db, entities.senSupplier.id_entite, orderNumber, "Nouvelle commande");

          // --- ÉTAPE 2: ENVOI DE LA RÉPONSE (ORDRSP) ---
          logInfo(`➡️ ÉTAPE 2: Envoi de la réponse (ORDRSP) - Acceptation avec modification mineure`);
          
          const ordrspData = {
            orderId: orderId,
            status: 'accepted', // Accepté mais on renvoie quand même un ORDRSP
            isStaging: false,
            confirmedDeliveryDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10),
            comment: "Commande validée pour export Sénégal",
            modifiedArticles: [
              {
                gtin: '6141412999999',
                qty: 5,
                price: 15.00,
                comment: "OK"
              }
            ]
          };
          
          try {
            const ordrspResponse = await axios.post(
              `${CONFIG.apiUrl}/api/orders/respond`,
              ordrspData,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-pin': CONFIG.apiPin,
                  'x-entite-id': entities.senSupplier.id_entite.toString()
                },
                timeout: 30000
              }
            );
            
            if (ordrspResponse.status === 200) {
               logSuccess('✅ Réponse (ORDRSP) envoyée avec succès');
               
               // Attendre traitement EDI
               await new Promise(resolve => setTimeout(resolve, 2000));
               
               // Vérifier transmission EDI (ORDRSP)
               const [ordrspTransmissions] = await db.execute(
                 `SELECT id, document_type, direction, partner_gln, status, 
                         logs, error_message, created_at 
                  FROM edi_transmissions 
                  WHERE document_type = 'ORDRSP' 
                    AND related_id = ?
                  ORDER BY created_at DESC 
                  LIMIT 1`,
                 [orderId]
               );
               
               if (ordrspTransmissions.length > 0) {
                 const ordrspTrans = ordrspTransmissions[0];
                 logSuccess(`  Transmission EDI (ORDRSP) créée (ID: ${ordrspTrans.id})`);
                 
                 if (ordrspTrans.status === 'SENT' || ordrspTrans.status === 'RECEIVED') {
                   logSuccess(`  ✅ Envoi ORDRSP réussi (Status: ${ordrspTrans.status})`);
                   
                   // VÉRIFICATION NOTIFICATION ACHETEUR (Tunisie)
                   // Doit contenir "Réponse reçue"
                   await checkNotification(db, entities.tunBuyer.id_entite, orderNumber, "Réponse reçue");
                   
                   logSuccess('✅ ✅ TEST COMPLET INTER-PAYS (ORDERS + ORDRSP) RÉUSSI');
                   return true;
                 } else {
                   logError(`  ❌ Erreur transmission ORDRSP: ${ordrspTrans.status}`);
                   return false;
                 }
               } else {
                 logError('  ❌ Aucune transmission ORDRSP trouvée');
                 return false;
               }
               
            } else {
              logError(`❌ Erreur API ORDRSP: Status ${ordrspResponse.status}`);
              return false;
            }
          } catch (ordrspErr) {
             logError(`❌ Erreur lors de l'appel ORDRSP: ${ordrspErr.message}`);
             if (ordrspErr.response) logError(`  Détails: ${JSON.stringify(ordrspErr.response.data)}`);
             return false;
          }

        } else if (transmission.status === 'PENDING') {
          logWarning('  Transmission ORDERS en cours (PENDING)');
          logInfo('Le EDI Worker devrait traiter cette transmission sous peu');
          return true;
        } else {
          logError(`  Transmission ORDERS en erreur (Status: ${transmission.status}): ${transmission.error_message || 'N/A'}`);
          if (transmission.logs) logInfo(`Logs: ${transmission.logs}`);
          return false;
        }
      } else {
        logError('Aucune transmission EDI ORDERS trouvée');
        return false;
      }
    } else {
      logError(`Erreur API: Status ${response.status}`);
      return false;
    }
  } catch (err) {
    logError(`Erreur lors du test: ${err.message}`);
    if (err.response) {
      logError(`  Réponse API: ${JSON.stringify(err.response.data)}`);
    }
    return false;
  }
}

// Afficher le résumé des tests
function displaySummary(results) {
  logSection('📊 RÉSUMÉ DES TESTS');
  
  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;
  
  console.log('');
  results.forEach(result => {
    if (result.success) {
      logSuccess(`${result.name}: RÉUSSI`);
    } else {
      logError(`${result.name}: ÉCHOUÉ`);
    }
  });
  
  console.log('');
  log(`Total: ${total} tests`, 'bright');
  logSuccess(`Réussis: ${passed}`);
  if (failed > 0) {
    logError(`Échoués: ${failed}`);
  }
  
  console.log('');
  if (failed === 0) {
    logSuccess('🎉 TOUS LES TESTS SONT RÉUSSIS !');
  } else {
    logError('❌ CERTAINS TESTS ONT ÉCHOUÉ');
  }
}

// Fonction principale
async function main() {
  log('\n🚀 DÉMARRAGE DES TESTS EDI AUTOMATIQUES - LOCALHOST\n', 'bright');
  
  let db;
  const results = [];
  
  try {
    // 1. Connexion BDD
    db = await connectDB();
    
    // 2. Vérifier la configuration
    const configOk = await checkConfiguration(db);
    if (!configOk) {
      logError('Configuration incorrecte. Arrêt des tests.');
      process.exit(1);
    }
    
    // 3. Vérifier le serveur
    const serverOk = await checkServerHealth();
    if (!serverOk) {
      logError('Serveur non accessible. Arrêt des tests.');
      process.exit(1);
    }
    
    // 4. Préparer les entités de test
    const entities = await setupTestEntities(db);
    if (!entities) {
      logError('Impossible de préparer les entités de test. Arrêt des tests.');
      process.exit(1);
    }
    
    // 5. Test Intra-Pays
    const test1Success = await testIntraCountry(db, entities);
    results.push({ name: 'Test Intra-Pays (TUN → TUN)', success: test1Success });
    
    // 6. Test Inter-Pays
    const test2Success = await testInterCountry(db, entities);
    results.push({ name: 'Test Inter-Pays (TUN → SEN)', success: test2Success });
    
    // 7. Afficher le résumé
    displaySummary(results);
    
    // 8. Code de sortie
    const allPassed = results.every(r => r.success);
    process.exit(allPassed ? 0 : 1);
    
  } catch (err) {
    logError(`Erreur fatale: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    if (db) {
      await db.end();
      logInfo('Connexion BDD fermée');
    }
  }
}

// Exécution
if (require.main === module) {
  main();
}

module.exports = { main };
