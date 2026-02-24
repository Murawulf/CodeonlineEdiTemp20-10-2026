const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Compter les occurrences
const matches = content.match(/ENTITE_MYSQL_CONFIG/g);
console.log(`\n🔍 Trouvé ${matches ? matches.length : 0} occurrences de ENTITE_MYSQL_CONFIG\n`);

// Remplacer toutes les occurrences
const updatedContent = content.replace(/ENTITE_MYSQL_CONFIG/g, 'dbConfig');

// Vérifier qu'on importe bien dbConfig
if (!updatedContent.includes("const { pool: entitePool, dbConfig } = require('./config/database');")) {
  console.log('⚠️  Mise à jour de l\'import pour inclure dbConfig');
  const oldImport = "const { pool: entitePool } = require('./config/database');";
  const newImport = "const { pool: entitePool, dbConfig } = require('./config/database');";
  
  if (updatedContent.includes(oldImport)) {
    fs.writeFileSync(serverPath, updatedContent.replace(oldImport, newImport), 'utf8');
    console.log('✅ Import mis à jour et toutes les références remplacées');
  } else {
    fs.writeFileSync(serverPath, updatedContent, 'utf8');
    console.log('✅ Toutes les références remplacées (import déjà correct)');
  }
} else {
  fs.writeFileSync(serverPath, updatedContent, 'utf8');
  console.log('✅ Toutes les références remplacées');
}

console.log(`\n📊 ${matches ? matches.length : 0} occurrences de ENTITE_MYSQL_CONFIG → dbConfig\n`);
