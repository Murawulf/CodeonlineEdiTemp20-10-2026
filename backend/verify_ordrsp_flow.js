// =====================================================================
// ORDRSP Flow Verification Script
// Tests the complete ORDRSP generation and sending mechanism
// =====================================================================

const mysql = require('mysql2/promise');
const axios = require('axios');
const { dbConfig } = require('./config/database');

const API_PIN = '3311';
const API_BASE = process.env.LOCAL_API_URL || 'http://localhost:5000';

async function verifyORDRSPFlow() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         ORDRSP FLOW VERIFICATION                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let connection;
  
  try {
    // Connect to MySQL
    console.log('[1/6] Connecting to MySQL database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL\n');

    // Check for staging orders
    console.log('[2/6] Checking for staging orders (edi_orders)...');
    const [stagingOrders] = await connection.execute(
      'SELECT id, document_number, buyer_gln, supplier_gln, status, order_date FROM edi_orders LIMIT 5'
    );
    
    if (stagingOrders.length === 0) {
      console.log('⚠️  No staging orders found. Run generate_test_scenarios.js first.');
      return;
    }
    
    console.log(`✅ Found ${stagingOrders.length} staging orders:`);
    stagingOrders.forEach(order => {
      console.log(`   - ID: ${order.id}, Doc: ${order.document_number}, Status: ${order.status}`);
    });
    console.log('');

    // Get supplier entity for the first staging order
    console.log('[3/6] Resolving supplier entity...');
    const testOrder = stagingOrders[0];
    const [supplierRows] = await connection.execute(
      'SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln = ?',
      [testOrder.supplier_gln]
    );
    
    if (supplierRows.length === 0) {
      console.log(`❌ Supplier not found for GLN: ${testOrder.supplier_gln}`);
      return;
    }
    
    const supplier = supplierRows[0];
    console.log(`✅ Supplier found: ${supplier.raison_socialle} (ID: ${supplier.id_entite}, GLN: ${supplier.gln})\n`);

    // Test ORDRSP endpoint with ACCEPT
    console.log('[4/6] Testing ORDRSP endpoint (ACCEPT)...');
    const acceptPayload = {
      orderId: testOrder.id,
      isStaging: true,
      status: 'accepted',
      comment: 'Test acceptance via verification script',
      confirmedDeliveryDate: testOrder.order_date || new Date().toISOString().split('T')[0]
    };

    console.log('   Payload:', JSON.stringify(acceptPayload, null, 2));
    
    try {
      const response = await axios.post(
        `${API_BASE}/api/orders/respond`,
        acceptPayload,
        {
          headers: {
            'x-api-pin': API_PIN,
            'x-entite-id': supplier.id_entite.toString()
          }
        }
      );
      
      console.log('✅ ORDRSP endpoint responded successfully:');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
      console.log('');

      // Check if order was promoted to production
      console.log('[5/6] Verifying order promotion to production...');
      const [productionOrders] = await connection.execute(
        'SELECT id_order, num_commande, status FROM orders WHERE num_commande = ?',
        [testOrder.document_number]
      );
      
      if (productionOrders.length > 0) {
        console.log('✅ Order promoted to production:');
        productionOrders.forEach(order => {
          console.log(`   - ID: ${order.id_order}, Doc: ${order.num_commande}, Status: ${order.status}`);
        });
      } else {
        console.log('⚠️  Order not found in production table');
      }
      console.log('');

      // Check EDI transmission record
      console.log('[6/6] Checking EDI transmission record...');
      const [transmissions] = await connection.execute(
        'SELECT id, document_type, direction, status, logs FROM edi_transmissions WHERE document_type = ? ORDER BY id DESC LIMIT 1',
        ['ORDRSP']
      );
      
      if (transmissions.length > 0) {
        const trans = transmissions[0];
        console.log('✅ ORDRSP transmission record found:');
        console.log(`   - ID: ${trans.id}`);
        console.log(`   - Type: ${trans.document_type}`);
        console.log(`   - Direction: ${trans.direction}`);
        console.log(`   - Status: ${trans.status}`);
        console.log(`   - Logs: ${trans.logs}`);
      } else {
        console.log('⚠️  No ORDRSP transmission record found');
      }
      console.log('');

    } catch (apiError) {
      console.log('❌ ORDRSP endpoint failed:');
      console.log(`   Status: ${apiError.response?.status || 'N/A'}`);
      console.log(`   Error: ${apiError.response?.data?.error || apiError.message}`);
      console.log(`   Details: ${apiError.response?.data?.details || 'N/A'}`);
      console.log('');
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    VERIFICATION COMPLETE                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.\n');
    }
  }
}

// Run verification
verifyORDRSPFlow().catch(console.error);
