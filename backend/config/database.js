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

// Only create pool if DB_HOST is set and not 'sqlite'
// If DB_HOST is explicitly empty string, we should probably not default to localhost if we want to force SQLite
// But the current logic is process.env.DB_HOST || 'localhost'.
// We need a way to disable MySQL.
const shouldDisableMySQL = process.env.DB_HOST === '' || process.env.DB_HOST === 'sqlite';

const pool = shouldDisableMySQL ? null : mysql.createPool(dbConfig);

const createConnection = async () => {
  if (shouldDisableMySQL) return null;
  return await mysql.createConnection(dbConfig);
};

if (!shouldDisableMySQL) {
  console.log(`[Database] Initializing connection pool to ${dbConfig.host}:${dbConfig.port} (User: ${dbConfig.user}, DB: ${dbConfig.database})`);
} else {
  console.log('[Database] MySQL disabled (DB_HOST is empty or "sqlite"), using SQLite fallback');
}

module.exports = {
  pool,
  createConnection,
  dbConfig
};
