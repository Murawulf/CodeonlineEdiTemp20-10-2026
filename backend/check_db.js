
const mysql = require('mysql2/promise');
const { pool } = require('./config/database');

async function checkSchema() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('DESCRIBE orders');
    console.log('Orders table schema:');
    console.table(rows);
    connection.release();
    // Since we are using a shared pool, we might not want to close it if other parts of the app use it,
    // but for a standalone script, we should close it to exit the process.
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();
