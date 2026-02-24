// Inspect and clear ALL test data
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function inspectAndClear() {
  console.log('\n=== Inspecting Test Data ===\n');
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Check edi_orders
    const [ediOrders] = await connection.execute(
      'SELECT id, document_number, buyer_gln, supplier_gln, status FROM edi_orders'
    );
    console.log(`Found ${ediOrders.length} rows in edi_orders:`);
    ediOrders.forEach(o => {
      console.log(`  ID: ${o.id}, Doc: ${o.document_number}, Buyer: ${o.buyer_gln}, Supplier: ${o.supplier_gln}, Status: ${o.status}`);
    });
    
    // Delete ALL from edi_orders (since this is a test/staging table)
    console.log('\n--- Clearing edi_orders ---');
    const [result1] = await connection.execute('DELETE FROM edi_orders');
    console.log(`✅ Deleted ${result1.affectedRows} rows from edi_orders`);
    
    // Check orders with test patterns
    const [testOrders] = await connection.execute(
      'SELECT id_order, num_commande, status FROM orders WHERE num_commande LIKE "CMD-%" OR num_commande LIKE "HAK%"'
    );
    console.log(`\nFound ${testOrders.length} test orders in orders table:`);
    testOrders.forEach(o => {
      console.log(`  ID: ${o.id_order}, Doc: ${o.num_commande}, Status: ${o.status}`);
    });
    
    if (testOrders.length > 0) {
      console.log('\n--- Clearing test orders ---');
      const [result2] = await connection.execute(
        'DELETE FROM orders WHERE num_commande LIKE "CMD-%" OR num_commande LIKE "HAK%"'
      );
      console.log(`✅ Deleted ${result2.affectedRows} rows from orders`);
      
      // Clean orphaned lines
      const [result3] = await connection.execute(
        'DELETE FROM order_lines WHERE id_order NOT IN (SELECT id_order FROM orders)'
      );
      console.log(`✅ Deleted ${result3.affectedRows} orphaned rows from order_lines`);
    }
    
    console.log('\n✅ All test data cleared\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

inspectAndClear().catch(console.error);
