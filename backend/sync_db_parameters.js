require('dotenv').config();
const mysql = require('mysql2/promise');

// Configuration des deux serveurs
const sourceConfig = {
  host: '217.182.94.86',
  port: 3306,
  user: 'Consultant',
  password: 'A4b6xb1s*',
  database: 'Dev_Entitedb',
  connectTimeout: 10000,
};

const targetConfig = {
  host: '91.134.35.126',
  port: 3306,
  user: 'consultant_seg',
  password: '49BD&4vyrK6=PT!',
  database: 'Dev_Entitedb',
  connectTimeout: 10000,
};

async function syncParameters() {
  let sourceConn, targetConn;
  
  try {
    console.log('\n🔄 Synchronisation des paramètres entre les serveurs\n');
    console.log('=' .repeat(60));
    
    // Connexion au serveur source
    console.log('📡 Connexion au serveur SOURCE (217.182.94.86)...');
    sourceConn = await mysql.createConnection(sourceConfig);
    console.log('✅ Connecté au serveur source\n');
    
    // Connexion au serveur cible
    console.log('📡 Connexion au serveur CIBLE (91.134.35.126)...');
    targetConn = await mysql.createConnection(targetConfig);
    console.log('✅ Connecté au serveur cible\n');
    
    // Récupérer tous les paramètres du serveur source
    console.log('📥 Récupération des paramètres du serveur SOURCE...');
    const [sourceParams] = await sourceConn.execute(
      'SELECT * FROM app_parameters ORDER BY param_key'
    );
    console.log(`✅ ${sourceParams.length} paramètres trouvés sur le serveur source\n`);
    
    // Récupérer tous les paramètres du serveur cible
    console.log('📥 Récupération des paramètres du serveur CIBLE...');
    const [targetParams] = await targetConn.execute(
      'SELECT * FROM app_parameters ORDER BY param_key'
    );
    console.log(`✅ ${targetParams.length} paramètres trouvés sur le serveur cible\n`);
    
    // Créer un map des paramètres cibles pour comparaison rapide
    const targetParamsMap = new Map();
    targetParams.forEach(param => {
      targetParamsMap.set(param.param_key, param);
    });
    
    // Identifier les paramètres manquants et différents
    const missingParams = [];
    const differentParams = [];
    
    sourceParams.forEach(sourceParam => {
      const targetParam = targetParamsMap.get(sourceParam.param_key);
      
      if (!targetParam) {
        missingParams.push(sourceParam);
      } else if (
        sourceParam.param_value !== targetParam.param_value ||
        sourceParam.param_type !== targetParam.param_type ||
        sourceParam.is_public !== targetParam.is_public ||
        sourceParam.description !== targetParam.description
      ) {
        differentParams.push({
          source: sourceParam,
          target: targetParam
        });
      }
    });
    
    console.log('=' .repeat(60));
    console.log('📊 ANALYSE DES DIFFÉRENCES\n');
    
    if (missingParams.length > 0) {
      console.log(`❌ ${missingParams.length} paramètres MANQUANTS sur le serveur cible:`);
      missingParams.forEach(param => {
        console.log(`   - ${param.param_key} (${param.param_type})`);
      });
      console.log('');
    } else {
      console.log('✅ Aucun paramètre manquant\n');
    }
    
    if (differentParams.length > 0) {
      console.log(`⚠️  ${differentParams.length} paramètres DIFFÉRENTS:`);
      differentParams.forEach(diff => {
        console.log(`   - ${diff.source.param_key}`);
        console.log(`     Source: "${diff.source.param_value}"`);
        console.log(`     Cible:  "${diff.target.param_value}"`);
      });
      console.log('');
    } else {
      console.log('✅ Tous les paramètres existants sont identiques\n');
    }
    
    // Demander confirmation avant synchronisation
    if (missingParams.length === 0 && differentParams.length === 0) {
      console.log('=' .repeat(60));
      console.log('✅ Les deux serveurs sont déjà synchronisés!');
      console.log('=' .repeat(60) + '\n');
      return;
    }
    
    console.log('=' .repeat(60));
    console.log('🔄 SYNCHRONISATION EN COURS...\n');
    
    let insertedCount = 0;
    let updatedCount = 0;
    
    // Insérer les paramètres manquants
    if (missingParams.length > 0) {
      console.log('📝 Insertion des paramètres manquants...');
      for (const param of missingParams) {
        try {
          await targetConn.execute(
            `INSERT INTO app_parameters 
             (param_key, param_value, param_type, is_public, description, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              param.param_key,
              param.param_value,
              param.param_type,
              param.is_public,
              param.description,
              param.created_at,
              param.updated_at
            ]
          );
          console.log(`   ✅ Inséré: ${param.param_key}`);
          insertedCount++;
        } catch (err) {
          console.log(`   ❌ Erreur insertion ${param.param_key}: ${err.message}`);
        }
      }
      console.log('');
    }
    
    // Mettre à jour les paramètres différents
    if (differentParams.length > 0) {
      console.log('🔄 Mise à jour des paramètres différents...');
      for (const diff of differentParams) {
        try {
          await targetConn.execute(
            `UPDATE app_parameters 
             SET param_value = ?, param_type = ?, is_public = ?, description = ?, updated_at = NOW()
             WHERE param_key = ?`,
            [
              diff.source.param_value,
              diff.source.param_type,
              diff.source.is_public,
              diff.source.description,
              diff.source.param_key
            ]
          );
          console.log(`   ✅ Mis à jour: ${diff.source.param_key}`);
          updatedCount++;
        } catch (err) {
          console.log(`   ❌ Erreur mise à jour ${diff.source.param_key}: ${err.message}`);
        }
      }
      console.log('');
    }
    
    // Vérification finale
    console.log('=' .repeat(60));
    console.log('🔍 VÉRIFICATION FINALE\n');
    
    const [finalTargetParams] = await targetConn.execute(
      'SELECT COUNT(*) as count FROM app_parameters'
    );
    
    console.log(`✅ Serveur SOURCE: ${sourceParams.length} paramètres`);
    console.log(`✅ Serveur CIBLE: ${finalTargetParams[0].count} paramètres`);
    console.log(`\n📊 Résumé:`);
    console.log(`   - ${insertedCount} paramètres insérés`);
    console.log(`   - ${updatedCount} paramètres mis à jour`);
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ SYNCHRONISATION TERMINÉE AVEC SUCCÈS!');
    console.log('=' .repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (sourceConn) await sourceConn.end();
    if (targetConn) await targetConn.end();
  }
}

syncParameters();
