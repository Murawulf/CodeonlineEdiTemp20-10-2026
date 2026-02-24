
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function addSellerNameColumn() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database.');
    
    // Check if column exists
    const [columns] = await connection.execute("SHOW COLUMNS FROM orders LIKE 'seller_name'");
    
    if (columns.length === 0) {
      console.log('Adding seller_name column to orders table...');
      await connection.execute("ALTER TABLE orders ADD COLUMN seller_name VARCHAR(255) AFTER fournisseur_gln");
      console.log('Column seller_name added successfully.');
    } else {
      console.log('Column seller_name already exists.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) await connection.end();
  }
}

addSellerNameColumn();
