const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });
const { dbConfig } = require('./backend/config/database');

async function check() {
  const c = await mysql.createConnection(dbConfig);
  const [rows] = await c.query("SELECT param_key, param_value FROM app_parameters");
  console.log(rows);
  await c.end();
}
check();
