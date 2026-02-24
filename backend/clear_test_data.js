// Clear old test data before regenerating
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function clearTestData() {
  console.log('\n=== Clearing Old Test Data ===\n');
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Delete test orders from edi_orders
    const [result1] = await connection.execute(
      'DELETE FROM edi_orders WHERE document_number LIKE "HAK%" OR document_number LIKE "CMD-TEST-%"'
    );
    console.log(`✅ Deleted ${result1.affectedRows} rows from edi_orders`);
    
    // Delete test orders from orders
    const [result2] = await connection.execute(
      'DELETE FROM orders WHERE num_commande LIKE "HAK%" OR num_commande LIKE "CMD-TEST-%"'
    );
    console.log(`✅ Deleted ${result2.affectedRows} rows from orders`);
    
    // Delete test order lines
    const [result3] = await connection.execute(
      'DELETE FROM order_lines WHERE id_order NOT IN (SELECT id_order FROM orders)'
    );
    console.log(`✅ Deleted ${result3.affectedRows} orphaned rows from order_lines`);
    
    console.log('\n✅ Test data cleared successfully\n');
  } catch (error) {
    console.error('❌ Error clearing test data:', error.message);
  } finally {
    await connection.end();
  }
}

clearTestData().catch(console.error);
