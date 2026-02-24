const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkConnection() {
  console.log(`Connecting to ${process.env.DB_HOST} as ${process.env.DB_USER}...`);
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      connectTimeout: 10000
    });

    console.log('✅ Connected to database successfully!');
    
    const [rows] = await connection.execute('SELECT @@hostname as hostname, DATABASE() as db');
    console.log('Server Info:', rows[0]);
    
    // Check app_params for CURRENT_INSTANCE_CODE
    try {
        const [params] = await connection.execute("SELECT * FROM app_params WHERE param_name = 'CURRENT_INSTANCE_CODE'");
        console.log('CURRENT_INSTANCE_CODE:', params);
    } catch (e) {
        console.log('Could not read CURRENT_INSTANCE_CODE:', e.message);
    }

    await connection.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('Full error:', err);
  }
}

checkConnection();
