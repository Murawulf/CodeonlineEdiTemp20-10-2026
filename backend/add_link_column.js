
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function addLinkColumn() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database.');

    // Check if column exists
    const [rows] = await connection.execute("SHOW COLUMNS FROM notifications LIKE 'link'");
    if (rows.length === 0) {
        console.log("Adding 'link' column to notifications table...");
        await connection.execute("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) DEFAULT NULL AFTER type");
        console.log("Column 'link' added successfully.");
    } else {
        console.log("Column 'link' already exists.");
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

addLinkColumn();
