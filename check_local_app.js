const http = require('http');

// Configuration
const PORT = 5001; // Port standard DEV (Tunisie Reference)
const PATH = '/api/settings';

console.log(`🔍 Test de connectivité locale sur le port ${PORT}...`);
console.log('=======================================');

// 1. Test de connexion basique
const options = {
  hostname: '127.0.0.1',
  port: PORT,
  path: PATH,
  method: 'GET',
  timeout: 5000
};

console.log(`👉 Tentative de connexion à http://127.0.0.1:5001/api/settings ...`);

const req = http.request(options, (res) => {
  console.log(`\n✅ SUCCÈS - Connexion établie !`);
  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers: ${JSON.stringify(res.headers, null, 2)}`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`\n📦 Corps de la réponse (extrait 200 chars):`);
    console.log(data.substring(0, 200) + (data.length > 200 ? '...' : ''));
    console.log('\n✅ CONCLUSION : L\'application Node.js tourne bien sur le port 5001.');
    console.log('   Si vous ne pouvez pas y accéder depuis l\'extérieur, c\'est un problème de Proxy Apache.');
  });
});

req.on('error', (e) => {
  console.error(`\n❌ ÉCHEC DE LA CONNEXION : ${e.message}`);
  console.log('\n❌ CONCLUSION : L\'application ne répond pas sur le port 5001.');
  console.log('   Vérifiez que PM2 tourne bien : pm2 status');
  console.log('   Vérifiez les logs : pm2 logs');
});

req.on('timeout', () => {
    req.destroy();
    console.error('\n⏱️ TIMEOUT : L\'application met trop de temps à répondre.');
});

req.end();
