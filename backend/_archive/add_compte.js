const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const { dbConfig } = require('./config/database');

async function addCompte() {
  const email = 'majd.hakim@gmail.com';
  const password = '6#dx^1Ur2Gas';
  const name = 'Hakim';
  const prenom = 'Majd';
  const role = 'admin';
  const profile_id = 1;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Try MySQL first
    let conn;
    try {
      conn = await mysql.createConnection(dbConfig);
      console.log('✅ Connected to MySQL');
      
      const [result] = await conn.execute(`
        INSERT INTO comptes (
          email, 
          password, 
          name, 
          prenom,
          role, 
          profile_id,
          is_suspended,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())
      `, [email, hashedPassword, name, prenom, role, profile_id]);
      
      console.log('✅ User added to MySQL comptes table!');
      console.log('   ID:', result.insertId);
      console.log('   Email:', email);
      console.log('   Name:', prenom, name);
      console.log('   Role:', role);
      
      await conn.end();
      
    } catch (mysqlErr) {
      console.log('❌ MySQL connection failed:', mysqlErr.message);
      console.log('⚠️  Falling back to SQLite EntiteDb.db');
      
      // Fallback to SQLite
      const db = new sqlite3.Database('./EntiteDb.db', (err) => {
        if (err) {
          console.error('Error opening EntiteDb.db:', err);
          process.exit(1);
        }
      });
      
      // Create table if not exists
      db.run(`
        CREATE TABLE IF NOT EXISTS comptes (
          id_compte INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          name TEXT,
          prenom TEXT,
          role TEXT,
          profile_id INTEGER,
          is_suspended INTEGER DEFAULT 0,
          created_at TEXT,
          id_entite INTEGER,
          certicode TEXT,
          certicode_generated_at TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          db.close();
          process.exit(1);
        }
      });
      
      const currentDate = new Date().toISOString();
      
      db.run(`
        INSERT INTO comptes (
          email, 
          password, 
          name, 
          prenom,
          role, 
          profile_id,
          is_suspended,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `, [email, hashedPassword, name, prenom, role, profile_id, currentDate], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.error('❌ Error: User with this email already exists');
          } else {
            console.error('❌ Error inserting user:', err.message);
          }
          db.close();
          process.exit(1);
        }
        
        console.log('✅ User added to SQLite comptes table!');
        console.log('   ID:', this.lastID);
        console.log('   Email:', email);
        console.log('   Name:', prenom, name);
        console.log('   Role:', role);
        
        db.close();
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addCompte();
