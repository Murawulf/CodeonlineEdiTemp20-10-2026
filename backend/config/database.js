require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'codeonline_edi_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000
};

const pool = mysql.createPool(dbConfig);

const createConnection = async () => {
  return await mysql.createConnection(dbConfig);
};

console.log(`[Database] Initializing connection pool to ${dbConfig.host}:${dbConfig.port} (User: ${dbConfig.user}, DB: ${dbConfig.database})`);

module.exports = {
  pool,
  createConnection,
  dbConfig
};
