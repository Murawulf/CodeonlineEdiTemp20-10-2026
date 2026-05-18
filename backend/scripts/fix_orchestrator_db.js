const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../edi_orchestrator/.env' });

// Override with command line args if provided
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'codeonline_edi_db';

async function fixOrchestratorDb() {
  console.log(`Connecting to database ${DB_NAME} at ${DB_HOST}...`);
  
  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });

    console.log('Connected!');

    const schema = `
    CREATE TABLE IF NOT EXISTS partners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      gln VARCHAR(13) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      country_code VARCHAR(3) NOT NULL,
      target_url VARCHAR(255) NOT NULL,
      api_key VARCHAR(64),
      status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_gln (gln)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      transaction_ref VARCHAR(64) NOT NULL,
      sender_gln VARCHAR(13) NOT NULL,
      receiver_gln VARCHAR(13) NOT NULL,
      document_type VARCHAR(10) NOT NULL,
      status ENUM('RECEIVED', 'FORWARDED', 'DELIVERED', 'FAILED', 'RETRY_QUEUED') DEFAULT 'RECEIVED',
      transport_mode ENUM('ORCHESTRATOR', 'P2P', 'P2P_SYNC') DEFAULT 'ORCHESTRATOR',
      error_message TEXT,
      payload_size INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sender (sender_gln),
      INDEX idx_receiver (receiver_gln),
      INDEX idx_ref (transaction_ref),
      INDEX idx_created_at (created_at)
    );
    `;

    console.log('Applying schema...');
    
    // Split by ; and execute each statement
    const statements = schema.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
        await connection.query(statement);
    }
    
    console.log('✅ Tables created successfully.');

    // Check if partners are seeded
    const [partners] = await connection.query('SELECT count(*) as count FROM partners');
    if (partners[0].count === 0) {
        console.log('Seeding partners...');
        await connection.query(`
            INSERT IGNORE INTO partners (gln, name, country_code, target_url, status) VALUES 
            ('6191234567890', 'Tunisie Hub', '788', 'https://edi-dev.codeonline-info.com/api/edi/receive', 'ACTIVE'),
            ('SN02583102G3', 'Senegal Hub', '686', 'https://dev.codeonline-edi.net/api/edi/receive', 'ACTIVE');
        `);
        console.log('✅ Partners seeded.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

fixOrchestratorDb();
