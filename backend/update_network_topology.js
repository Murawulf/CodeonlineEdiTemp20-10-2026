/**
 * Script pour mettre à jour NETWORK_TOPOLOGY avec le champ 'country'
 * Ce script ajoute le champ 'country' à chaque nœud de la topologie réseau
 * pour permettre le matching dynamique sans hardcoder les noms de pays
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'codeonline_edi_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
};

async function updateNetworkTopology() {
  let connection;
  
  try {
    console.log('\n🔧 Connexion à la base de données...');
    console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}\n`);
    
    connection = await mysql.createConnection(dbConfig);
    
    // 1. Récupérer la topologie actuelle
    const [rows] = await connection.execute(
      'SELECT param_value FROM app_parameters WHERE param_key = ?',
      ['NETWORK_TOPOLOGY']
    );
    
    if (rows.length === 0) {
      console.log('❌ NETWORK_TOPOLOGY non trouvé dans la base de données');
      console.log('   Création d\'une nouvelle topologie...\n');
      
      const newTopology = {
        TUN: {
          name: "Tunisie",
          country: "Tunisie",
          countryCode: "TUN",
          apiUrl: "https://edi-dev.codeonline-info.com",
          ediUrl: "https://edi-dev.codeonline-info.com/api/edi/receive"
        },
        SEN: {
          name: "Sénégal",
          country: "Sénégal",
          countryCode: "SEN",
          apiUrl: "https://dev.codeonline-edi.net",
          ediUrl: "https://dev.codeonline-edi.net/api/edi/receive"
        }
      };
      
      await connection.execute(
        `INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public) 
         VALUES (?, ?, 'json', 'network', 'Network topology configuration', 1)`,
        ['NETWORK_TOPOLOGY', JSON.stringify(newTopology, null, 2)]
      );
      
      console.log('✅ NETWORK_TOPOLOGY créé avec succès\n');
      console.log(JSON.stringify(newTopology, null, 2));
      
    } else {
      const currentTopology = JSON.parse(rows[0].param_value);
      console.log('📊 Topologie actuelle:');
      console.log(JSON.stringify(currentTopology, null, 2));
      console.log('');
      
      // 2. Vérifier si le champ 'country' existe déjà
      let needsUpdate = false;
      const updatedTopology = { ...currentTopology };
      
      for (const [nodeCode, nodeConfig] of Object.entries(updatedTopology)) {
        let nodeUpdated = false;
        
        if (!nodeConfig.country) {
          needsUpdate = true;
          nodeUpdated = true;
          updatedTopology[nodeCode].country = nodeConfig.name;
          console.log(`⚠️  Nœud '${nodeCode}': Ajout du champ 'country' = '${nodeConfig.name}'`);
        }
        
        if (!nodeConfig.countryCode) {
          needsUpdate = true;
          nodeUpdated = true;
          // Générer le code pays (3 lettres majuscules)
          updatedTopology[nodeCode].countryCode = nodeCode.toUpperCase();
          console.log(`⚠️  Nœud '${nodeCode}': Ajout du champ 'countryCode' = '${nodeCode.toUpperCase()}'`);
        }
        
        if (!nodeUpdated) {
          console.log(`✅ Nœud '${nodeCode}': Tous les champs présents (country='${nodeConfig.country}', countryCode='${nodeConfig.countryCode}')`);
        }
      }
      
      if (needsUpdate) {
        console.log('\n🔄 Mise à jour de NETWORK_TOPOLOGY...\n');
        
        await connection.execute(
          'UPDATE app_parameters SET param_value = ? WHERE param_key = ?',
          [JSON.stringify(updatedTopology, null, 2), 'NETWORK_TOPOLOGY']
        );
        
        console.log('✅ NETWORK_TOPOLOGY mis à jour avec succès\n');
        console.log('📊 Nouvelle topologie:');
        console.log(JSON.stringify(updatedTopology, null, 2));
      } else {
        console.log('\n✅ Aucune mise à jour nécessaire - tous les nœuds ont déjà le champ \'country\'\n');
      }
    }
    
    // 3. Vérifier CURRENT_INSTANCE_CODE
    console.log('\n🔍 Vérification de CURRENT_INSTANCE_CODE...');
    const [instanceRows] = await connection.execute(
      'SELECT param_value FROM app_parameters WHERE param_key = ?',
      ['CURRENT_INSTANCE_CODE']
    );
    
    if (instanceRows.length === 0) {
      console.log('⚠️  CURRENT_INSTANCE_CODE non trouvé');
      console.log('   Veuillez définir ce paramètre manuellement:');
      console.log('   - Pour le serveur Tunisie: TUN');
      console.log('   - Pour le serveur Sénégal: SEN\n');
    } else {
      const currentInstance = instanceRows[0].param_value;
      console.log(`✅ CURRENT_INSTANCE_CODE = '${currentInstance}'\n`);
      
      if (currentInstance !== 'TUN' && currentInstance !== 'SEN' && currentInstance !== 'tunisia' && currentInstance !== 'senegal') {
        console.log(`⚠️  Valeur inattendue: '${currentInstance}'`);
        console.log('   Valeurs attendues: TUN ou SEN (codes ISO 3 lettres)\n');
        console.log('   Note: Les anciennes valeurs (tunisia, senegal) sont toujours supportées mais deprecated\n');
      } else if (currentInstance === 'tunisia' || currentInstance === 'senegal') {
        console.log(`⚠️  Valeur deprecated: '${currentInstance}'`);
        console.log('   Veuillez mettre à jour vers les codes ISO 3 lettres:');
        console.log(`   - tunisia → TUN`);
        console.log(`   - senegal → SEN\n`);
      }
    }
    
    console.log('✅ Script terminé avec succès!\n');
    
  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Exécuter le script
updateNetworkTopology();
