const mysql = require('mysql2/promise');
const config = require('./backend/config/database');
async function run() {
  const db = await mysql.createConnection(config.entiteDB);
  const [cols] = await db.query('SHOW COLUMNS FROM orders');
  console.log(cols.map(c => c.Field));
  process.exit(0);
}
run();
