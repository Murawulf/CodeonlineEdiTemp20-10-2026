const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function checkOrder() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('Connected to DB');

    // Check orders table
    const [orders] = await conn.query('SELECT * FROM orders WHERE id_order = 39');
    console.log('Production Order #39:', orders.length ? orders[0] : 'Not Found');

    // Check edi_orders table
    const [ediOrders] = await conn.query('SELECT * FROM edi_orders WHERE id = 39');
    console.log('Staging Order #39:', ediOrders.length ? ediOrders[0] : 'Not Found');
    
    // Check if there is any order with number related to 39 if ID is not 39
    // Maybe 39 is not the ID but something else? The user log said "Processing response for order #39" so it is likely the ID.

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.end();
  }
}

checkOrder();
