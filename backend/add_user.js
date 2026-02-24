const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const USERS_DB_PATH = process.env.USERS_DB_PATH || './users.db';

async function addUser() {
  const email = 'majd.hakim@gmail.com';
  const password = '6#dx^1Ur2Gas';
  const name = 'Majd Hakim';
  const idRole = 1; // Admin role, adjust if needed

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Open database connection
    const db = new sqlite3.Database(USERS_DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
      }
      console.log('Connected to users.db');
    });

    // Insert user
    const sql = `
      INSERT INTO users (
        email, 
        name, 
        password, 
        idRole, 
        stus,
        date_mis_a_jour_u
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const currentDate = new Date().toISOString();

    db.run(sql, [email, name, hashedPassword, idRole, 1, currentDate], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.error('❌ Error: User with this email already exists');
        } else {
          console.error('❌ Error inserting user:', err.message);
        }
        db.close();
        process.exit(1);
      }

      console.log('✅ User added successfully!');
      console.log('   ID:', this.lastID);
      console.log('   Email:', email);
      console.log('   Name:', name);
      console.log('   Role ID:', idRole);

      // Verify the user was added
      db.get('SELECT id_user, email, name, idRole FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          console.error('Error verifying user:', err);
        } else if (row) {
          console.log('\n✅ Verification successful:');
          console.log('   User ID:', row.id_user);
          console.log('   Email:', row.email);
          console.log('   Name:', row.name);
          console.log('   Role ID:', row.idRole);
        }
        
        db.close();
      });
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addUser();
