/**
 * Database Utility Module
 * ======================
 * 
 * Architecture centralisée pour la gestion des requêtes DB.
 * Supporte à la fois SQLite et MySQL (via wrapper ou pool direct).
 * 
 * Détection du type de connexion:
 * 1. __isMysql: true -> Wrapper MySQL (entiteDB dans server.js)
 * 2. db.query existe -> Pool MySQL direct (mysql2/promise)
 * 3. Sinon -> SQLite (sqlite3)
 * 
 * @module db_utils
 */

/**
 * Détecte si la connexion est MySQL
 * @param {Object} db - Connexion DB
 * @returns {boolean}
 */
const isMySQLConnection = (db) => {
  return db && (db.__isMysql === true || typeof db.query === 'function');
};

/**
 * Détecte si c'est le wrapper MySQL de server.js
 * @param {Object} db - Connexion DB
 * @returns {boolean}
 */
const isMySQLWrapper = (db) => {
  return db && db.__isMysql === true;
};

/**
 * Execute a SELECT query on the database
 * 
 * @param {Object} db - Database connection (SQLite, MySQL pool, or MySQL wrapper)
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {number} retries - Number of retries for SQLITE_BUSY errors (SQLite only)
 * @param {number} delay - Initial delay between retries in ms (SQLite only)
 * @returns {Promise<Array>} Query results
 * 
 * @example
 * // MySQL wrapper (entiteDB)
 * const rows = await queryDB(entiteDB, 'SELECT * FROM users WHERE id = ?', [1]);
 * 
 * // SQLite
 * const rows = await queryDB(sqliteDb, 'SELECT * FROM users WHERE id = ?', [1]);
 */
const queryDB = async (db, query, params = [], retries = 5, delay = 1000) => {
  if (!db) {
    throw new Error('Database connection is null');
  }

  // Cas 1: Wrapper MySQL de server.js (entiteDB)
  // Le wrapper a déjà une méthode all() async qui utilise execute() en interne
  if (isMySQLWrapper(db)) {
    try {
      // Le wrapper all() retourne directement les rows (pas de destructuring nécessaire)
      const rows = await db.all(query, params);
      return rows;
    } catch (err) {
      console.error('[DB_UTILS] MySQL wrapper query error:', err.message);
      throw err;
    }
  }

  // Cas 2: Pool MySQL direct (mysql2/promise)
  if (typeof db.query === 'function') {
    try {
      const [rows] = await db.execute(query, params);
      return rows;
    } catch (err) {
      console.error('[DB_UTILS] MySQL pool query error:', err.message);
      throw err;
    }
  }

  // Cas 3: SQLite (callback-based)
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        if (err.code === 'SQLITE_BUSY' && retries > 0) {
          console.warn(`[DB_UTILS] SQLite BUSY, retry ${6 - retries}/5 in ${delay}ms...`);
          setTimeout(() => {
            queryDB(db, query, params, retries - 1, delay * 2)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(err);
        }
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * Execute an INSERT/UPDATE/DELETE query on the database
 * 
 * @param {Object} db - Database connection (SQLite, MySQL pool, or MySQL wrapper)
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result with changes and lastID
 * 
 * @example
 * const result = await runUpdate(db, 'INSERT INTO users (name) VALUES (?)', ['John']);
 * console.log(result.lastID); // ID de la ligne insérée
 */
const runUpdate = async (db, query, params = []) => {
  if (!db) {
    throw new Error('Database connection is null');
  }

  // Cas 1: Wrapper MySQL de server.js (entiteDB)
  if (isMySQLWrapper(db)) {
    try {
      const result = await db.run(query, params);
      return {
        changes: result.changes || 0,
        lastID: result.lastID || null
      };
    } catch (err) {
      console.error('[DB_UTILS] MySQL wrapper update error:', err.message);
      throw err;
    }
  }

  // Cas 2: Pool MySQL direct (mysql2/promise)
  if (typeof db.query === 'function') {
    try {
      const [result] = await db.execute(query, params);
      return {
        changes: result.affectedRows || 0,
        lastID: result.insertId || null
      };
    } catch (err) {
      console.error('[DB_UTILS] MySQL pool update error:', err.message);
      throw err;
    }
  }

  // Cas 3: SQLite (callback-based)
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          changes: this.changes,
          lastID: this.lastID
        });
      }
    });
  });
};

/**
 * Execute a query and return only the first row
 * 
 * @param {Object} db - Database connection
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|undefined>} First row or undefined
 */
const queryOne = async (db, query, params = []) => {
  const rows = await queryDB(db, query, params);
  return rows && rows.length > 0 ? rows[0] : undefined;
};

/**
 * Check if a record exists
 * 
 * @param {Object} db - Database connection
 * @param {string} table - Table name
 * @param {string} column - Column to check
 * @param {*} value - Value to look for
 * @returns {Promise<boolean>}
 */
const exists = async (db, table, column, value) => {
  const row = await queryOne(db, `SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`, [value]);
  return !!row;
};

module.exports = {
  queryDB,
  runUpdate,
  queryOne,
  exists,
  isMySQLConnection,
  isMySQLWrapper,
};
