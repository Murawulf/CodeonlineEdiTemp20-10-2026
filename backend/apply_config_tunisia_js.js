const mysql = require('mysql2/promise');
require('dotenv').config();

async function configureTunisiaDB() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
  });

  console.log('Connected to Tunisia DB');

  const paramsToSet = [
    {
      key: 'CURRENT_INSTANCE_CODE',
      value: 'TUN',
      type: 'string',
      description: 'Code instance courante (TUN, SEN)'
    },
    {
      key: 'LOCAL_API_URL',
      value: 'https://edi-dev.codeonline-info.com',
      type: 'string',
      description: 'URL API Locale'
    },
    {
      key: 'NETWORK_TOPOLOGY',
      value: JSON.stringify({
        "TUN": {
          "name": "Tunisie",
          "country": "Tunisie",
          "countryCode": "TUN",
          "apiUrl": "https://edi-dev.codeonline-info.com",
          "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive"
        },
        "SEN": {
          "name": "Sénégal",
          "country": "Sénégal",
          "countryCode": "SEN",
          "apiUrl": "https://dev.codeonline-edi.net",
          "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive"
        }
      }),
      type: 'json',
      description: 'Topologie réseau EDI'
    },
    {
        key: 'API_PIN',
        value: '3311',
        type: 'string',
        description: 'Code PIN pour sécuriser les appels API EDI'
    }
  ];

  for (const param of paramsToSet) {
    // Check if exists
    const [rows] = await connection.execute(
      'SELECT * FROM app_parameters WHERE param_key = ?',
      [param.key]
    );

    if (rows.length > 0) {
      // Update
      await connection.execute(
        'UPDATE app_parameters SET param_value = ? WHERE param_key = ?',
        [param.value, param.key]
      );
      console.log(`Updated ${param.key}`);
    } else {
      // Insert
      await connection.execute(
        'INSERT INTO app_parameters (param_key, param_value, param_type, description) VALUES (?, ?, ?, ?)',
        [param.key, param.value, param.type, param.description]
      );
      console.log(`Inserted ${param.key}`);
    }
  }
  
  // Verify configuration
  const [verifyRows] = await connection.execute(
    "SELECT param_key, LEFT(param_value, 50) as val FROM app_parameters WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY', 'API_PIN')"
  );
  console.log('Current Configuration:', verifyRows);

  await connection.end();
}

configureTunisiaDB().catch(console.error);
