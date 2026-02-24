const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });
async function run() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_entite'
  });
  const [cols] = await db.query('SHOW COLUMNS FROM order_lines');
  console.log(cols.map(c => c.Field));
  process.exit(0);
}
run();
