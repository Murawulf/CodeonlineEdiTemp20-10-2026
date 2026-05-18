const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs'); // Single import for fs and fs.promises
const multer = require('multer');
const path = require('path');
const chokidar = require('chokidar');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const app = express();
const pendingUpdates = new Map(); // For certicode storage: id_compte -> {certicode, expire, newEmail}
const xlsx = require('xlsx'); // For Excel parsing in bulk
const csvParser = require('csv-parser'); // For CSV
// Minimal per-API logging middleware (concise)
app.use((req, res, next) => {
  const start = Date.now();
  const bodyPreview = (req.method === 'GET' || !req.body) ? '' : ` body=${JSON.stringify(req.body).slice(0,200)}`;
  console.log(`[API] ${req.method} ${req.originalUrl}${bodyPreview}`);
  res.on('finish', () => {
    console.log(`[API] ${req.method} ${req.originalUrl} => ${res.statusCode} ${Date.now()-start}ms`);
  });
  next();
});

const csv = require('csv-parser');
const sanitizeHtml = require('sanitize-html'); // Add this dependency for HTML sanitization
const router = express.Router();
const XLSX = require('xlsx');

const GED_DIR = '/var/www/Edi-dev/backend/public/ged';



// Multer Storage Configuration (using your original gedStorage)
// Multer Storage Configuration

const gedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, GED_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeOriginal}`);
  },
});
const uploadGed = multer({
  storage: gedStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'text/plain',
      'video/mp4',
      'video/avi',
      'video/mpeg',
      'audio/mpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.ms-powerpoint',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error('File type not allowed:', file.mimetype);
      cb(new Error(`File type not allowed: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  },
});
// Helper: safe JSON stringify for log details
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

// ✅ Target folder for logo uploads
const logosDir = '/var/www/Edi-dev/backend/public/logo_entite';

try {
  fs.accessSync(logosDir, fs.constants.F_OK);
  console.log('Logo_entite directory already exists:', logosDir);
} catch (err) {
  fs.mkdirSync(logosDir, { recursive: true });
  console.log('Created logo_entite directory:', logosDir);
}

// ✅ Multer storage for company logos
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, logosDir); // Save directly in /var/www/Edi-dev/backend/public/logo_entite
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    cb(null, `company_${req.body.id_entite || timestamp}_${safeOriginal}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error('❌ Invalid logo type:', file.mimetype);
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  },
});
// Serve logo_entite folder
app.use('/logo_entite', express.static('/var/www/Edi-dev/backend/public/logo_entite'));

// Serve fallback logo and other public assets
app.use(express.static('/var/www/Edi-dev/backend/public'));





// --- REPLACE authenticate middleware START ---
const authenticate = async (req, res, next) => {
  // Accept id_compte from body, query, or headers to be robust
  const id_compte = (req.body && req.body.id_compte) || (req.query && req.query.id_compte) || req.headers['x-id-compte'];

  if (!id_compte) {
    console.error('Authentication failed: No id_compte provided', { requestQuery: req.query, requestBody: req.body, headers: req.headers });
    return res.status(401).json({ error: 'Authentication required', details: 'No id_compte provided' });
  }
  try {
    const accountRows = await queryDB(entiteDB, 'SELECT * FROM comptes WHERE id_compte = ?', [parseInt(id_compte, 10)]);
    if (!accountRows || accountRows.length === 0) {
      console.error('Authentication failed: Invalid id_compte:', id_compte);
      return res.status(401).json({ error: 'Invalid account', details: 'No account found for id_compte' });
    }
    req.user = accountRows[0];
    console.log('Authenticated user:', { id_compte, email: req.user.email });
    next();
  } catch (err) {
    console.error('Authentication error:', { message: err.message, stack: err.stack, id_compte });
    res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
};
// --- REPLACE authenticate middleware END ---

function generateCerticode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function generatePassword() {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Environment variables
const MODELES_DIR = process.env.MODELES_DIR || '/var/www/Edi-dev/Modeles';
const ALLGPC_DB_PATH = process.env.ALLGPC_DB_PATH || '/var/www/Edi-dev/backend/allgpc.db';
// ENTITE DB now uses MySQL (phpMyAdmin) instead of local SQLite file
const ENTITE_MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'MywyZrtHI!gQG0N!2025SQP',
  database: 'Entitedb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};
const FIELDRULES_DB_PATH = process.env.FIELDRULES_DB_PATH || '/var/www/Edi-dev/backend/fieldrules.db';
const USERS_DB_PATH = process.env.USERS_DB_PATH || '/var/www/Edi-dev/backend/users.db';

const FILES_JSON_PATH = path.join(MODELES_DIR, 'files.json');

// Environment variables (override with .env file if used)
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || '948ac0001@smtp-brevo.com';
const BREVO_API_KEY = process.env.BREVO_API_KEY || 'FntGXAkHcyIv1ZSp';
const FROM_EMAIL = process.env.FROM_EMAIL || 'netconsultingeurope20@gmail.com';


// File filter to allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images JPEG, PNG ou GIF sont autoris es'), false);
  }
};
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeOriginal}`);
  },
});
const avatarDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
  console.log('📁 Created avatar upload directory:', avatarDir);
} else {
  console.log('✅ Avatar upload directory exists:', avatarDir);
}

// Make the uploads folder accessible via /uploads URL
app.use('/uploads', express.static(avatarDir));
const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only .jpg, .jpeg, .png allowed'));
  }
});












app.use('/ged', express.static(GED_DIR));

app.use(cors({
  origin: ['https://edi-dev.codeonline-info.com/'],
  credentials: true
}));
app.use(express.json());

app.use(express.static('public'))
// Serve static files
app.use('/Modeles', express.static(MODELES_DIR));

// Database connections
const connectDB = (dbPath, dbName) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error(`Error connecting to ${dbName}:`, err.message);
        console.error(`Path attempted: ${dbPath}`);
        console.error(`File exists: ${require('fs').existsSync(dbPath)}`);
        console.error(`Process user: ${process.getuid()}:${process.getgid()}`);
        reject(err);
      } else {
        console.log(`Connected to ${dbName}`);
        resolve(db);
      }
    });
  });
};

// Initialize databases
let fieldrulesDB, allgpcDB, usersDB, entiteDB;
async function initializeDatabases() {
  try {
    allgpcDB = await connectDB(ALLGPC_DB_PATH, 'allgpc.db').catch(err => {
      console.warn('Warning: Failed to connect to allgpc.db:', err.message);
      return null;
    });
    // Create a MySQL pool for Entite (adapter will expose sqlite-like methods used throughout the code)
    let entitePool = null;
    try {
      entitePool = await mysql.createPool(ENTITE_MYSQL_CONFIG);
      console.log('Connected to Entite MySQL pool');
    } catch (err) {
      console.warn('Warning: Failed to create Entite MySQL pool:', err.message);
      entitePool = null;
    }

    if (entitePool) {
      // Adapter object to emulate sqlite3.Database methods used in the code
      entiteDB = {
        __isMysql: true,
        pool: entitePool,
        
all: async function(sql, params, cb) {
          // Support both callback style and promise style
          params = params || [];
          try {
            const [rows] = await entitePool.execute(sql, params);
            if (typeof cb === 'function') return cb(null, rows);
            return rows;
          } catch (err) {
            if (typeof cb === 'function') return cb(err);
            throw err;
          }
        },

run: async function(sql, params, cb) {
          params = params || [];
          if (typeof params === 'function') { cb = params; params = []; }
          try {
            const [result] = await entitePool.execute(sql, params);
            if (typeof cb === 'function') {
              // invoke callback with 'this' context emulating sqlite3's run callback
              const ctx = { changes: result.affectedRows, lastID: result.insertId || null };
              return cb.call(ctx, null);
            }
            return { changes: result.affectedRows, lastID: result.insertId || null };
          } catch (err) {
            if (typeof cb === 'function') return cb(err);
            throw err;
          }
        },

get: async function (sql, params, cb) {
          params = params || [];
          try {
            const [rows] = await entitePool.execute(sql, params);
            const row = (rows && rows.length) ? rows[0] : undefined;
            if (typeof cb === 'function') return cb(null, row);
            return row;
          } catch (err) {
            if (typeof cb === 'function') return cb(err);
            throw err;
          }
        },

serialize: function(fn) {
          // No-op for MySQL pool; just execute the function
          try { fn(); } catch (e) { setImmediate(() => { throw e; }); }
        },

prepare: function(sql) {

          // Return an object with run and finalize to mimic sqlite's prepare().run().finalize()
          return {
        run: async function(...args) {
  let cb = null;
  let params = args;
  if (args.length > 0 && typeof args[args.length - 1] === 'function') {
    cb = args[args.length - 1];
    params = args.slice(0, -1);
  }
  if (params.length === 1 && Array.isArray(params[0])) {
    params = params[0];
  }
  try {
    const [result] = await entitePool.execute(sql, params);
    if (cb) return cb(null);
    return { lastID: result.insertId || null, changes: result.affectedRows };
  } catch (err) {
    if (cb) return cb(err);
    throw err;
  }
},
            finalize: function(cb) { if (cb) cb(null); }
          };
        },

close: async function(cb) {
          try {
            await entitePool.end();
            if (cb) return cb(null);
          } catch (err) {
            if (cb) return cb(err);
          }
        }
};

    } else {
      // Fallback to sqlite file if MySQL pool not available (prevents ENTITE_DB_PATH undefined crash)
      entiteDB = await connectDB(ENTITE_DB_PATH || '/var/www/Edi-dev/backend/entite_fallback.db', 'EntiteDb.db').catch(err => {
        console.warn('Warning: Failed to connect to EntiteDb.db (sqlite fallback):', err.message);
        return null;
      });
    }
    usersDB = await connectDB(USERS_DB_PATH, 'users.db');
    if (allgpcDB) await initializeGpcTables();
    await initializeUsersDB();

    try {
      fieldrulesDB = await connectDB(FIELDRULES_DB_PATH, 'fieldrules.db');
    } catch (err) {
      console.warn('Warning: Failed to connect to fieldrules.db:', err.message);
      fieldrulesDB = null;
    }
   
  } catch (err) {
    console.error('Failed to initialize critical databases:', err.message);
    process.exit(1);
  }
}

// Initialize GPC tables
async function initializeGpcTables() {
  try {
    if (allgpcDB) {
      
      allgpcDB.serialize(() => {
        allgpcDB.run(`
          CREATE TABLE IF NOT EXISTS segmentgpc (
            codeSegment TEXT NOT NULL,
            ordre_segment INTEGER NOT NULL,
            libelleSegment TEXT DEFAULT NULL,
            libelleSegment_a TEXT DEFAULT NULL,
            libelleSegment_e TEXT DEFAULT NULL,
            url_icon_segment TEXT DEFAULT NULL,
            status_s INTEGER NOT NULL DEFAULT 1
          )
        `);
        allgpcDB.run(`
          CREATE TABLE IF NOT EXISTS classegpc (
            codeClasse INTEGER NOT NULL,
            ordre_classe INTEGER NOT NULL DEFAULT 0,
            libelleClasse TEXT DEFAULT NULL,
            libelleClasse_ar TEXT DEFAULT NULL,
            libelleClasse_en TEXT DEFAULT NULL,
            codeFamille TEXT DEFAULT NULL,
            codeSeg TEXT NOT NULL,
            status_c INTEGER NOT NULL DEFAULT 1,
            status_b INTEGER NOT NULL DEFAULT 1
          )
        `);
        allgpcDB.run(`
          CREATE TABLE IF NOT EXISTS brickgpc (
            codeBrique TEXT NOT NULL,
            ordre_brique INTEGER NOT NULL DEFAULT 0,
            libelleBrique TEXT DEFAULT NULL,
            libelleBrique_ar TEXT DEFAULT NULL,
            libelleBrique_en TEXT DEFAULT NULL,
            codeClasse INTEGER DEFAULT NULL,
            status_br INTEGER NOT NULL DEFAULT 1
          )
        `);
        console.log('Segment, Classe, and Brick tables ready in allgpc.db');
      });
    }

if (entiteDB) {
  entiteDB.serialize(() => {
    entiteDB.run(`CREATE TABLE IF NOT EXISTS notifications (
      id_notification INT AUTO_INCREMENT PRIMARY KEY,
      id_compte INT NOT NULL,
      contenu TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`read\` INT DEFAULT 0,
      FOREIGN KEY (id_compte) REFERENCES comptes(id_compte)
    )`, (err) => {
      if (err) {
        console.error('Failed to create notifications table:', err.message);
      } else {
        console.log('Notifications table verified/created');
      }
    });
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS famillegpc (
        codeFamille TEXT NOT NULL,
        ordre_famille INT NOT NULL DEFAULT 0,
        libelleFamille TEXT DEFAULT NULL,
        libelleFamille_ar TEXT DEFAULT NULL,
        libelleFamille_en TEXT DEFAULT NULL,
        codeSegment TEXT DEFAULT NULL,
        status_f INT NOT NULL DEFAULT 1
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS fiche_produit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand TEXT,
        subBrand TEXT,
        description TEXT,
        gtin TEXT,
        libelle TEXT,
        short_libelle TEXT,
        countryOfOrigin TEXT,
        idEntreprise INT,
        images TEXT,
        nb_images INT DEFAULT 0,
        prix_min DOUBLE DEFAULT 0,
        prix_max DOUBLE DEFAULT 0,
        code_cader TEXT,
        codeClasse INT,
        codebrique TEXT,
        date_mis_a_jour_fp TEXT,
        tradeItemSynchronisationDates TEXT,
        date_create_fp TEXT,
        activ_prix INT DEFAULT 0,
        status INT DEFAULT 0,
        done_new INT DEFAULT 0
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS Entite (
        id_entite INT AUTO_INCREMENT PRIMARY KEY,
        raison_socialle TEXT NOT NULL,
        gln TEXT,
        certicode TEXT,
        date_create TEXT,
        pays TEXT,
        site TEXT,
        personne_contact TEXT,
        service TEXT,
        email TEXT NOT NULL,
        tel_mobile TEXT,
        telephone TEXT,
        fax TEXT,
        adresse TEXT,
        region TEXT,
        city TEXT,
        localite TEXT,
        postalCode TEXT,
        type_prod INT,
        statut INT,
        date_abonnement TEXT,
        date_echeance TEXT,
        nb_fp INT,
        inscription INT,
        status_ent TEXT,
        delegation TEXT
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id_profile INT AUTO_INCREMENT PRIMARY KEY,
        id_entite INT,
        email TEXT,
        certicode TEXT,
        role TEXT,
        is_suspended INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        password TEXT,
        name TEXT,
        created_by_Entite INT DEFAULT NULL,
        FOREIGN KEY(id_entite) REFERENCES Entite(id_entite)
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS pages (
        page_id INT AUTO_INCREMENT PRIMARY KEY,
        page_name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    entiteDB.run(`
  CREATE TABLE IF NOT EXISTS comptes (
    id_compte INT AUTO_INCREMENT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    certicode TEXT,
    password TEXT NOT NULL,
    \`role\` TEXT,
    profile_id INT,
    id_entite INT NOT NULL,
    is_suspended INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    avatar_url VARCHAR(500) DEFAULT NULL,
    prenom VARCHAR(255) DEFAULT NULL,
    FOREIGN KEY(profile_id) REFERENCES profiles(id_profile),
    FOREIGN KEY(id_entite) REFERENCES Entite(id_entite)
  )
`);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS account_permissions (
        id_permission INT AUTO_INCREMENT PRIMARY KEY,
        id_compte INT NOT NULL,
        page_id INT NOT NULL,
        \`read\` INT NOT NULL DEFAULT 0,
        \`write\` INT NOT NULL DEFAULT 0,
        hide INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(id_compte) REFERENCES comptes(id_compte),
        FOREIGN KEY(page_id) REFERENCES pages(page_id)
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS autorisation_profile_page (
        id_autorisation INT AUTO_INCREMENT PRIMARY KEY,
        id_profile INT NOT NULL,
        page_id INT NOT NULL,
        can_read TINYINT(1) DEFAULT 0,
        can_write TINYINT(1) DEFAULT 0,
        is_hidden TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        apercu TINYINT(1) NOT NULL DEFAULT 0,
        upload TINYINT(1) NOT NULL DEFAULT 0,
        delete_file TINYINT(1) NOT NULL DEFAULT 0,
        create_folder TINYINT(1) NOT NULL DEFAULT 0,
        view_content TINYINT(1) NOT NULL DEFAULT 0,
        FOREIGN KEY(id_profile) REFERENCES profiles(id_profile) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(page_id) REFERENCES pages(page_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS localite (
        id_localite INT AUTO_INCREMENT PRIMARY KEY,
        localite TEXT NOT NULL,
        code_postal TEXT NOT NULL,
        id_municipalite INT
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS Entite_segment (
        id_entite INT,
        id_segment  VARCHAR(255),
        PRIMARY KEY (id_entite, id_segment ),
        FOREIGN KEY (id_entite) REFERENCES Entite(id_entite),
        FOREIGN KEY (id_segment ) REFERENCES segmentgpc(codeSegment)
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS profile_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profile_id INT NOT NULL,
        model_name VARCHAR(255) DEFAULT NULL
      )
    `);
    entiteDB.run(`
      CREATE TABLE IF NOT EXISTS profile_model_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profile_id INT NOT NULL,
        model_name VARCHAR(255) DEFAULT NULL,
        permission VARCHAR(255) DEFAULT NULL
      )
    `);
    console.log('Famille, Entite, Profiles, Pages, Comptes, Account_permissions, Autorisation_profile_page, Localite, Entite_segment, Profile_models, and Profile_model_permissions tables ready in EntiteDb.db');
  });
}
  } catch (err) {
    console.error('Error initializing GPC tables:', err);
    throw err;
  }
}

// Initialize users database tables
async function initializeUsersDB() {
  try {
    usersDB.serialize(() => {
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS users (
          id_user INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password TEXT NOT NULL,
          raison_sociale TEXT,
          nb_produits INTEGER,
          contact_tel TEXT,
          adresse TEXT,
          code_imei TEXT,
          idRole INTEGER NOT NULL,
          segment TEXT,
          id_region INTEGER,
          id_municipalite INTEGER,
          id_marche INTEGER,
          id_mg_ref INTEGER,
          id_mg_ref_per INTEGER,
          id_mg_ref_per2 INTEGER,
          id_mgp_ref INTEGER,
          id_mgp_ref_per INTEGER,
          id_mgp_ref_per2 INTEGER,
          stus INTEGER DEFAULT 1,
          date_mis_a_jour_u TEXT
        )
      `);
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lib TEXT NOT NULL
        )
      `);
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS autoris_profil_page (
          Id_profil INTEGER NOT NULL,
          Id_page INTEGER NOT NULL,
          Autorisation TEXT NOT NULL,
          code_octal INTEGER NOT NULL,
          PRIMARY KEY (Id_profil, Id_page),
          FOREIGN KEY (Id_profil) REFERENCES profiles(id)
        )
      `);
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS region_ref (
          id_region INTEGER PRIMARY KEY AUTOINCREMENT,
          libelle_region_fr TEXT NOT NULL,
          libelle_region_ar TEXT
        )
      `);
 entiteDB.run(`
    CREATE TABLE IF NOT EXISTS models (
  rayon_code TEXT PRIMARY KEY,
  model_json TEXT,
  libelle TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (rayon_code) REFERENCES bricks(code)        )
      `);

      usersDB.run(`
        CREATE TABLE IF NOT EXISTS municipalite (
          id_municipalite INTEGER PRIMARY KEY AUTOINCREMENT,
          libelle_municipalite_fr TEXT NOT NULL,
          libelle_municipalite_ar TEXT,
          id_region INTEGER,
          FOREIGN KEY (id_region) REFERENCES region_ref(id_region)
        )
      `);

// Add the tpo table creation here
   entiteDB.run(`
  CREATE TABLE IF NOT EXISTS tpo (
    id_tpo INT AUTO_INCREMENT PRIMARY KEY,
    raison_sociale TEXT NOT NULL,
    contact TEXT,
    email TEXT NOT NULL,
    mobile TEXT,
    statut VARCHAR(10) DEFAULT 'A',
    localite TEXT,
    pays TEXT,
    adresse TEXT,
    code_postale TEXT,
    web TEXT
  )
`);
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS marche_ref (
          id_marche INTEGER PRIMARY KEY AUTOINCREMENT,
          libelle_marche_fr TEXT NOT NULL,
          libelle_marche_ar TEXT,
          id_region INTEGER,
          FOREIGN KEY (id_region) REFERENCES region_ref(id_region)
        )
      `);
      usersDB.run(`
        CREATE TABLE IF NOT EXISTS user_marche (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user INTEGER,
          marche INTEGER,
          FOREIGN KEY(user) REFERENCES users(id_user),
          FOREIGN KEY(marche) REFERENCES marche_ref(id_marche)
        )
      `);
      console.log('Users database tables ready');
    });
  } catch (err) {
    console.error('Error initializing users database:', err);
    throw err;
  }
}

// At server startup

// Utility function for database queries
const queryDB = (db, query, params, retries = 5, delay = 1000) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database connection is null'));
    db.all(query, params, (err, rows) => {
      if (err) {
        if (err.code === 'SQLITE_BUSY' && retries > 0) {
          console.warn(`Query retry ${6 - retries} due to SQLITE_BUSY, retrying in ${delay}ms...`);
          setTimeout(() => queryDB(db, query, params, retries - 1, delay * 2).then(resolve).catch(reject), delay);
        } else {
          reject(err);
        }
      } else {
        resolve(rows);
      }
    });
  });
};
// Utility function for database updates
const runUpdate = (db, query, params) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database connection is null'));
    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ changes: this.changes, lastID: this.lastID });
      }
    });
  });
};


// Ensure getCurrentDate is defined at the top of server.js
function getCurrentDate() {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}-${day}-${year}`;
}
// Nodemailer configuration with Brevo SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // Use TLS
  auth: {
    user: BREVO_SMTP_USER,
    pass: BREVO_API_KEY,
  },
  logger: true, // Enable logging for debugging
  debug: true, // Show SMTP traffic
});

// Verify transporter at startup
async function verifyTransporter() {
  try {
    await new Promise((resolve, reject) => {
      transporter.verify((error, success) => {
        if (error) {
          console.error('Brevo SMTP verification failed:', error);
          reject(error);
        } else {
          console.log('Brevo SMTP is ready to send emails');
          resolve(success);
        }
      });
    });
  } catch (err) {
    console.error('Critical: Brevo SMTP cannot connect. Check SMTP key, user, or network.', err);
  }
}
verifyTransporter();

// Fetch distinct regions from Entite table
app.get('/api/regions', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const regions = await queryDB(entiteDB, 'SELECT DISTINCT region FROM Entite WHERE region IS NOT NULL', []);
    res.json(regions);
  } catch (err) {
    console.error('Error fetching regions:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch regions', details: err.message });
  }
});

// Fetch delegations
app.get('/api/delegations', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { region } = req.query;
  try {
    let query = 'SELECT DISTINCT city AS delegation FROM Entite WHERE city IS NOT NULL';
    const params = [];
    if (region && region !== 'all') {
      query += ' AND region = ?';
      params.push(decodeURIComponent(region));
    }
    const delegations = await queryDB(entiteDB, query, params);
    res.json(delegations);
  } catch (err) {
    console.error('Error fetching delegations:', {
      message: err.message,
      stack: err.stack,
      query: req.query
    });
    res.status(500).json({ error: 'Failed to fetch delegations', details: err.message });
  }
});

// Fetch localites
app.post('/api/localites', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { name_delegation } = req.body;
  if (!name_delegation) {
    return res.status(400).json({ error: 'name_delegation is required', details: 'Missing required field' });
  }
  try {
    const localites = await queryDB(
      entiteDB,
      `SELECT localite, code_postal
       FROM localite
       WHERE id_municipalite = (SELECT id_municipalite FROM municipalite WHERE libelle_municipalite_fr = ? OR libelle_municipalite_ar = ?)`,
      [name_delegation, name_delegation]
    );
    res.json(localites);
  } catch (err) {
    console.error('Error fetching localites:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch localites', details: err.message });
  }
});

// Seed companies, municipalites, and localites
app.get('/api/seed-companies', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  if (!usersDB) {
    return res.status(503).json({ error: 'users.db is unavailable', details: 'Database connection not established' });
  }
  try {
    await usersDB.serialize(async () => {
      const sampleMunicipalites = [
        { id_municipalite: 1, libelle_municipalite_fr: 'El Hrairia', libelle_municipalite_ar: '????????', id_region: 1 },
        { id_municipalite: 2, libelle_municipalite_fr: 'Ariana Ville', libelle_municipalite_ar: '?????? ???????', id_region: 2 },
      ];
      for (const mun of sampleMunicipalites) {
        await runUpdate(
          usersDB,
          `INSERT OR IGNORE INTO municipalite (id_municipalite, libelle_municipalite_fr, libelle_municipalite_ar, id_region)
           VALUES (?, ?, ?, ?)`,
          [mun.id_municipalite, mun.libelle_municipalite_fr, mun.libelle_municipalite_ar, mun.id_region]
        );
      }
      const sampleLocalites = [
        { localite: 'Cite El Mechtel', code_postal: '2087', id_municipalite: 1 },
        { localite: 'Cit  El Khadra', code_postal: '2035', id_municipalite: 2 },
      ];
      for (const localite of sampleLocalites) {
        await runUpdate(
          entiteDB,
          `INSERT OR IGNORE INTO localite (localite, code_postal, id_municipalite)
           VALUES (?, ?, ?)`,
          [localite.localite, localite.code_postal, localite.id_municipalite]
        );
      }
      const sampleCompanies = [
        {
          raison_socialle: 'SOPROTIC',
          personne_contact: 'Imene Sassi',
          email: 'imene.s@soprotic.com',
          telephone: '71647301',
          localite: 'Cite El Mechtel',
          postalCode: '2087',
          nb_fp: 50,
          status_ent: 'A',
          region: 'Tunis',
          adresse: '384 Rue Houcine Day',
          site: 'www.soprotic.com',
          pays: '788',
          certicode: '181716',
          date_create: '2024-02-01 11:39:41',
          pwd: 'd35d18a6ebca5e2137382ed1115ec1c8638cd44',
          id_ccir: 1,
          inscription: 1,
        },
        {
          raison_socialle: 'Entreprise B',
          personne_contact: 'Fatima Zohra',
          email: 'fatima.zohra@example.com',
          telephone: '987654321',
          localite: 'Cit  El Khadra',
          postalCode: '2035',
          nb_fp: 30,
          status_ent: 'E',
          region: 'Ariana',
          adresse: '456 Avenue Test',
          site: 'https://entreprise-b.com',
          pays: '788',
        },
      ];
      for (const company of sampleCompanies) {
        await runUpdate(
          entiteDB,
          `INSERT OR IGNORE INTO Entite (
            raison_socialle, personne_contact, email, telephone, localite, postalCode, nb_fp, status_ent,
            region, adresse, site, pays, certicode, date_create, pwd, id_ccir, inscription
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            company.raison_socialle,
            company.personne_contact,
            company.email,
            company.telephone,
            company.localite,
            company.postalCode,
            company.nb_fp,
            company.status_ent,
            company.region,
            company.adresse,
            company.site,
            company.pays,
            company.certicode,
            company.date_create,
            company.pwd,
            company.id_ccir,
            company.inscription,
          ]
        );
      }
    });
    res.json({ message: 'Companies, municipalites, and localites seeded successfully' });
  } catch (err) {
    console.error('Error seeding data:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to seed data', details: err.message });
  }
});

// Seed segments
app.get('/api/seed-segments', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const segments = [
      { codeSegment: '100000', libelleSegment: 'Food/Beverage/Tobacco', ordre_segment: 1, status_s: 1 },
      { codeSegment: '200000', libelleSegment: 'Clothing', ordre_segment: 2, status_s: 1 },
      { codeSegment: '300000', libelleSegment: 'Electronics', ordre_segment: 3, status_s: 1 },
    ];
    for (const segment of segments) {
      await runUpdate(
        allgpcDB,
        'INSERT OR IGNORE INTO segmentgpc (codeSegment, libelleSegment, ordre_segment, status_s) VALUES (?, ?, ?, ?)',
        [segment.codeSegment, segment.libelleSegment, segment.ordre_segment, segment.status_s]
      );
    }
    res.json({ message: 'Segments seeded successfully' });
  } catch (err) {
    console.error('Error seeding segments:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to seed segments', details: err.message });
  }
});

// Seed regions
app.get('/api/seed-regions', async (req, res) => {
  if (!usersDB) {
    return res.status(503).json({ error: 'users.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const regions = [
      { id_region: 1, libelle_region_fr: 'Tunis', libelle_region_ar: '????' },
      { id_region: 2, libelle_region_fr: 'Ariana', libelle_region_ar: '??????' },
      { id_region: 3, libelle_region_fr: 'Ben Arous', libelle_region_ar: '?? ????' },
      { id_region: 4, libelle_region_fr: 'Manouba', libelle_region_ar: '?????' },
      { id_region: 5, libelle_region_fr: 'tous', libelle_region_ar: 'tous' },
      { id_region: 6, libelle_region_fr: 'Zaghouan', libelle_region_ar: '?????' },
      { id_region: 7, libelle_region_fr: 'Nabeul', libelle_region_ar: '????' },
      { id_region: 8, libelle_region_fr: 'Bizerte', libelle_region_ar: '?????' },
      { id_region: 9, libelle_region_fr: 'Jendouba', libelle_region_ar: '??????' },
      { id_region: 10, libelle_region_fr: 'Beja', libelle_region_ar: '????' },
      { id_region: 11, libelle_region_fr: 'Le Kef', libelle_region_ar: '?????' },
      { id_region: 12, libelle_region_fr: 'Siliana', libelle_region_ar: '??????' },
      { id_region: 13, libelle_region_fr: 'Kasserine', libelle_region_ar: '???????' },
      { id_region: 14, libelle_region_fr: 'Kairouan', libelle_region_ar: '????????' },
      { id_region: 15, libelle_region_fr: 'Sousse', libelle_region_ar: '????' },
      { id_region: 16, libelle_region_fr: 'Monastir', libelle_region_ar: '????????' },
      { id_region: 17, libelle_region_fr: 'Mahdia', libelle_region_ar: '???????' },
      { id_region: 18, libelle_region_fr: 'Sfax', libelle_region_ar: '?????' },
      { id_region: 19, libelle_region_fr: 'Sidi Bouzid', libelle_region_ar: '???? ?????' },
      { id_region: 20, libelle_region_fr: 'Gafsa', libelle_region_ar: '????' },
      { id_region: 21, libelle_region_fr: 'Gab s', libelle_region_ar: '????' },
      { id_region: 22, libelle_region_fr: 'M denine', libelle_region_ar: '?????' },
      { id_region: 23, libelle_region_fr: 'Tozeur', libelle_region_ar: '????' },
      { id_region: 24, libelle_region_fr: 'Kebili', libelle_region_ar: '????' },
      { id_region: 25, libelle_region_fr: 'Tataouine', libelle_region_ar: '??????' },
    ];
    for (const region of regions) {
      await runUpdate(
        usersDB,
        'INSERT OR IGNORE INTO region_ref (id_region, libelle_region_fr, libelle_region_ar) VALUES (?, ?, ?)',
        [region.id_region, region.libelle_region_fr, region.libelle_region_ar]
      );
    }
    res.json({ message: 'Regions seeded successfully' });
  } catch (err) {
    console.error('Error seeding regions:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// Segments
app.get('/api/segments', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const segments = await queryDB(entiteDB, `
      SELECT 
        codeSegment AS code, 
        libelleSegment AS libelle, 
        libelleSegment_e AS libelle_en, 
        libelleSegment_a AS libelle_ar, 
        status_s AS status
      FROM segmentgpc
      ORDER BY ordre_segment ASC
    `, []);
    res.json(segments);
  } catch (err) {
    console.error('Error fetching segments:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch segments', details: err.message });
  }
});

app.post('/api/update-segment', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { codeSegment, libelleSegment, libelleSegment_e, libelleSegment_a } = req.body;
  if (!codeSegment || !libelleSegment) {
    return res.status(400).json({ error: 'codeSegment and libelleSegment are required', details: 'Missing required fields' });
  }
  try {
    const changes = await runUpdate(
      entiteDB,
      `UPDATE segmentgpc SET libelleSegment = ?, libelleSegment_e = ?, libelleSegment_a = ? WHERE codeSegment = ?`,
      [libelleSegment, libelleSegment_e || null, libelleSegment_a || null, codeSegment]
    );
    if (changes.changes === 0) {
      return res.status(404).json({ error: 'Segment not found', details: 'No segment with provided codeSegment' });
    }
    res.json({ message: 'Segment updated successfully' });
  } catch (err) {
    console.error('Error updating segment:', {
      message: err.message,
      stack: err.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to update segment', details: err.message });
  }
});

app.post('/api/update-segment-status', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { segments } = req.body;
  if (!Array.isArray(segments)) {
    return res.status(400).json({ error: 'segments must be an array', details: 'Invalid input format' });
  }
  try {
    await entiteDB.serialize(async () => {
      await runUpdate(entiteDB, 'UPDATE segmentgpc SET status_s = 0', []);
      for (const code of segments) {
        await runUpdate(entiteDB, 'UPDATE segmentgpc SET status_s = 1 WHERE codeSegment = ?', [code]);
      }
    });
    res.json({ message: 'Segment statuses updated successfully' });
  } catch (err) {
    console.error('Error updating segment statuses:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to update segment statuses', details: err.message });
  }
});

// Familles (unchanged)
app.get('/api/familles', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb.db is unavailable');
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { codeSegment } = req.query;
  console.log('Fetching familles for codeSegment:', codeSegment);
  try {
    let query = `
      SELECT 
        codeFamille AS code, 
        codeSegment, 
        libelleFamille AS libelle, 
        libelleFamille_en AS libelle_en, 
        libelleFamille_ar AS libelle_ar, 
        status_f AS status
      FROM famillegpc
    `;
    const params = [];
    if (codeSegment) {
      query += ' WHERE codeSegment = ?';
      params.push(codeSegment);
    }
    query += ' ORDER BY ordre_famille ASC';
    const familles = await queryDB(entiteDB, query, params);
    console.log('Familles fetched:', familles);
    res.json(familles);
  } catch (err) {
    console.error('Error fetching familles:', {
      message: err.message,
      stack: err.stack,
      codeSegment
    });
    res.status(500).json({ error: 'Failed to fetch familles', details: err.message });
  }
});
app.post('/api/update-famille', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { codeFamille, libelleFamille, libelleFamille_en, libelleFamille_ar } = req.body;
  if (!codeFamille || !libelleFamille) {
    return res.status(400).json({ error: 'codeFamille and libelleFamille are required', details: 'Missing required fields' });
  }
  try {
    const changes = await runUpdate(
      entiteDB,
      `UPDATE famillegpc SET libelleFamille = ?, libelleFamille_en = ?, libelleFamille_ar = ? WHERE codeFamille = ?`,
      [libelleFamille, libelleFamille_en || null, libelleFamille_ar || null, codeFamille]
    );
    if (changes.changes === 0) {
      return res.status(404).json({ error: 'Famille not found', details: 'No famille with provided codeFamille' });
    }
    res.json({ message: 'Famille updated successfully' });
  } catch (err) {
    console.error('Error updating famille:', {
      message: err.message,
      stack: err.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to update famille', details: err.message });
  }
});

app.post('/api/update-famille-status', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { familles } = req.body;
  if (!Array.isArray(familles)) {
    return res.status(400).json({ error: 'familles must be an array', details: 'Invalid input format' });
  }
  try {
    await entiteDB.serialize(async () => {
      await runUpdate(entiteDB, 'UPDATE famillegpc SET status_f = 0', []);
      for (const code of familles) {
        await runUpdate(entiteDB, 'UPDATE famillegpc SET status_f = 1 WHERE codeFamille = ?', [code]);
      }
    });
    res.json({ message: 'Famille statuses updated successfully' });
  } catch (err) {
    console.error('Error updating famille statuses:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to update famille statuses', details: err.message });
  }
});

// Classes (unchanged)
app.get('/api/classes', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { codeFamille } = req.query;
  try {
    let query = `
      SELECT 
        codeClasse AS code, 
        libelleClasse AS libelle, 
        libelleClasse_en AS libelle_en, 
        libelleClasse_ar AS libelle_ar, 
        status_c AS status
      FROM classegpc
    `;
    const params = [];
    if (codeFamille) {
      query += ' WHERE codeFamille = ?';
      params.push(codeFamille);
    }
    query += ' ORDER BY ordre_classe ASC';
    const classes = await queryDB(allgpcDB, query, params);
    res.json(classes);
  } catch (err) {
    console.error('Error fetching classes:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch classes', details: err.message });
  }
});

app.post('/api/update-classe', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { codeClasse, libelleClasse, libelleClasse_en, libelleClasse_ar } = req.body;
  if (!codeClasse || !libelleClasse) {
    return res.status(400).json({ error: 'codeClasse and libelleClasse are required', details: 'Missing required fields' });
  }
  try {
    const changes = await runUpdate(
      allgpcDB,
      `UPDATE classegpc SET libelleClasse = ?, libelleClasse_en = ?, libelleClasse_ar = ? WHERE codeClasse = ?`,
      [libelleClasse, libelleClasse_en || null, libelleClasse_ar || null, codeClasse]
    );
    if (changes.changes === 0) {
      return res.status(404).json({ error: 'Classe not found', details: 'No classe with provided codeClasse' });
    }
    res.json({ message: 'Classe updated successfully' });
  } catch (err) {
    console.error('Error updating classe:', {
      message: err.message,
      stack: err.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to update classe', details: err.message });
  }
});

app.post('/api/update-classe-status', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { classes } = req.body;
  if (!Array.isArray(classes)) {
    return res.status(400).json({ error: 'classes must be an array', details: 'Invalid input format' });
  }
  try {
    await allgpcDB.serialize(async () => {
      await runUpdate(allgpcDB, 'UPDATE classegpc SET status_c = 0', []);
      for (const code of classes) {
        await runUpdate(allgpcDB, 'UPDATE classegpc SET status_c = 1 WHERE codeClasse = ?', [code]);
      }
    });
    res.json({ message: 'Classe statuses updated successfully' });
  } catch (err) {
    console.error('Error updating classe statuses:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to update classe statuses', details: err.message });
  }
});

// Bricks (unchanged)
app.get('/api/bricks', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { codeClasse } = req.query;
  try {
    let query = `
      SELECT 
        codeBrique AS code, 
        libelleBrique AS libelle, 
        libelleBrique_en AS libelle_en, 
        libelleBrique_ar AS libelle_ar, 
        status_br AS status
      FROM brickgpc
    `;
    const params = [];
    if (codeClasse) {
      query += ' WHERE codeClasse = ?';
      params.push(codeClasse);
    }
    query += ' ORDER BY ordre_brique ASC';
    const bricks = await queryDB(allgpcDB, query, params);
    res.json(bricks);
  } catch (err) {
    console.error('Error fetching bricks:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch bricks', details: err.message });
  }
});

app.post('/api/update-brick', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { codeBrique, libelleBrique, libelleBrique_en, libelleBrique_ar } = req.body;
  if (!codeBrique || !libelleBrique) {
    return res.status(400).json({ error: 'codeBrique and libelleBrique are required', details: 'Missing required fields' });
  }
  try {
    const changes = await runUpdate(
      allgpcDB,
      `UPDATE brickgpc SET libelleBrique = ?, libelleBrique_en = ?, libelleBrique_ar = ? WHERE codeBrique = ?`,
      [libelleBrique, libelleBrique_en || null, libelleBrique_ar || null, codeBrique]
    );
    if (changes.changes === 0) {
      return res.status(404).json({ error: 'Brick not found', details: 'No brick with provided codeBrique' });
    }
    res.json({ message: 'Brick updated successfully' });
  } catch (err) {
    console.error('Error updating brick:', {
      message: err.message,
      stack: err.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to update brick', details: err.message });
  }
});

app.post('/api/update-brick-status', async (req, res) => {
  if (!allgpcDB) {
    return res.status(503).json({ error: 'allgpc.db is unavailable', details: 'Database connection not established' });
  }
  const { bricks } = req.body;
  if (!Array.isArray(bricks)) {
    return res.status(400).json({ error: 'bricks must be an array', details: 'Invalid input format' });
  }
  try {
    await allgpcDB.serialize(async () => {
      await runUpdate(allgpcDB, 'UPDATE brickgpc SET status_br = 0', []);
      for (const code of bricks) {
        await runUpdate(allgpcDB, 'UPDATE brickgpc SET status_br = 1 WHERE codeBrique = ?', [code]);
      }
    });
    res.json({ message: 'Brick statuses updated successfully' });
  } catch (err) {
    console.error('Error updating brick statuses:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to update brick statuses', details: err.message });
  }
});

// Companies




// User management
app.get('/api/users', async (req, res) => {
  if (!usersDB) {
    return res.status(503).json({ error: 'users.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const users = await queryDB(usersDB, `
      SELECT u.*, p.lib AS lib_profil, r.libelle_region_fr, r.libelle_region_ar,
             m.libelle_municipalite_fr, m.libelle_municipalite_ar,
             mr.libelle_marche_fr, mr.libelle_marche_ar
      FROM users u
      LEFT JOIN profiles p ON u.idRole = p.id
      LEFT JOIN region_ref r ON u.id_region = r.id_region
      LEFT JOIN municipalite m ON u.id_municipalite = m.id_municipalite
      LEFT JOIN marche_ref mr ON u.id_marche = mr.id_marche
      WHERE u.idRole != 1
      ORDER BY u.id_user DESC
    `, []);
    const userData = await Promise.all(users.map(async (user) => {
      const marches = await queryDB(usersDB, `
        SELECT m.libelle_marche_fr, m.libelle_marche_ar, m.id_marche
        FROM user_marche um
        JOIN marche_ref m ON um.marche = m.id_marche
        WHERE um.user = ?
      `, [user.id_user]);
      const marcheNames = marches.map(m => `${m.libelle_marche_fr} ${m.libelle_marche_ar || ''}`).join('; ');
      const marcheIds = marches.map(m => m.id_marche).join(',');
      return {
        id_user: user.id_user,
        email: user.email,
        name: user.name,
        raison_sociale: user.raison_sociale,
        nb_produits: user.nb_produits,
        contact_tel: user.contact_tel,
        adresse: user.adresse,
        segment: user.segment,
        lib_profil: user.lib_profil,
        region: user.id_municipalite
          ? `${user.libelle_region_fr} ${user.libelle_region_ar || ''} / ${user.libelle_municipalite_fr} ${user.libelle_municipalite_ar || ''}`
          : `${user.libelle_region_fr || ''} ${user.libelle_region_ar || ''}`,
        marche: user.id_marche
          ? `${user.libelle_marche_fr} ${user.libelle_marche_ar || ''}`
          : marcheNames,
        id_marche: user.id_marche ? user.id_marche.toString() : marcheIds,
        id_municipalite: user.id_municipalite,
        id_region: user.id_region
      };
    }));
    res.json(userData);
  } catch (err) {
    console.error('Error fetching users:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Fetch all pages
app.get('/api/pages', async (req, res) => {
  try {
    const pages = await queryDB(entiteDB, 'SELECT page_id, page_name FROM pages', []);
    res.json(pages);
  } catch (err) {
    console.error('Error fetching pages:', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});


const beginTransaction = async (db) => {
  await runUpdate(db, 'BEGIN', []);
};
const commitTransaction = async (db) => {
  await runUpdate(db, 'COMMIT', []);
};
const rollbackTransaction = async (db) => {
  await runUpdate(db, 'ROLLBACK', []);
};
app.get('/api/profiles/:id', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
  const { id } = req.params;
  try {
    const profile = await queryDB(entiteDB, `
      SELECT id_profile, id_entite, email, certicode, \`role\`, is_suspended, created_at, password, name, created_by_Entite
      FROM profiles
      WHERE id_profile = ?
    `, [id]);
    if (profile.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile[0]);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});
// GET /api/profiles
// --- REPLACE GET /api/profiles START ---
app.get('/api/profiles', async (req, res) => {
  try {
    const profilesData = await queryDB(
      entiteDB,
      `
      SELECT 
        p.id_profile, p.id_entite, p.email, p.certicode, p.role, p.is_suspended, p.created_at, p.created_by_Entite,
        COALESCE(pr.raison_socialle, 'Tous') AS company_name,
        ap.page_id, pg.page_name, ap.can_read, ap.can_write, ap.is_hidden
      FROM profiles p
      LEFT JOIN Entite pr ON p.id_entite = pr.id_entite
      LEFT JOIN autorisation_profile_page ap ON p.id_profile = ap.id_profile
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      ORDER BY p.id_profile
    `,
      []
    );

    // Group permissions by profile
    const profilesMap = new Map();
    for (const row of profilesData) {
      if (!profilesMap.has(row.id_profile)) {
        profilesMap.set(row.id_profile, {
          id_profile: row.id_profile,
          id_entite: row.id_entite,
          email: row.email,
          certicode: row.certicode,
          role: row.role,
          is_suspended: row.is_suspended,
          created_at: row.created_at,
          created_by_Entite: row.created_by_Entite,
          company_name: row.company_name,
          permissions: [],
        });
      }
      if (row.page_id) {
        // Use correct column names returned by SQL (can_read, can_write, is_hidden)
        profilesMap.get(row.id_profile).permissions.push({
          page_id: row.page_id,
          page_name: row.page_name,
          read: !!row.can_read,
          write: !!row.can_write,
          hide: !!row.is_hidden,
        });
      }
    }

    const profilesWithPermissions = Array.from(profilesMap.values());
    res.json(profilesWithPermissions);
  } catch (err) {
    console.error('Error fetching profiles:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.code || 'Unknown',
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// --- REPLACE GET /api/profiles END ---


// POST /api/profiles
app.post('/api/profiles', async (req, res) => {
  const { email, id_entite, role, certicode, password, permissions, created_by_Entite } = req.body;

  // Validate input
  if (!permissions || !Array.isArray(permissions) || created_by_Entite === undefined) {
    return res.status(400).json({
      error: 'Invalid input',
      details: 'created_by_Entite and permissions array are required',
    });
  }
  if (id_entite !== null && id_entite !== undefined) {
    // Validate id_entite only if provided
    const producerExists = await queryDB(
      entiteDB,
      'SELECT 1 FROM Entite WHERE id_entite = ?',
      [id_entite]
    );
    if (!producerExists.length) {
      return res.status(400).json({ error: 'Invalid input', details: 'id_entite does not exist' });
    }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid input', details: 'Invalid email format' });
  }
  if (permissions.some(perm => !perm.page_id || typeof perm.read !== 'number' || typeof perm.write !== 'number' || typeof perm.hide !== 'number')) {
    return res.status(400).json({
      error: 'Invalid input',
      details: 'Permissions must include page_id and numeric read/write/hide values',
    });
  }

  try {
    // Validate created_by_Entite
    const creatorExists = await queryDB(
      entiteDB,
      'SELECT 1 FROM Entite WHERE id_entite = ?',
      [created_by_Entite]
    );
    if (!creatorExists.length) {
      return res.status(400).json({ error: 'Invalid input', details: 'created_by_Entite does not exist' });
    }

    // Validate page_ids
    const pageIds = permissions.map(perm => perm.page_id);
    if (pageIds.length > 0) {
      const validPages = await queryDB(
        entiteDB,
        `SELECT page_id FROM pages WHERE page_id IN (${pageIds.map(() => '?').join(',')})`,
        pageIds
      );
      if (validPages.length !== pageIds.length) {
        return res.status(400).json({ error: 'Invalid input', details: 'One or more page_ids are invalid' });
      }
    }

    await beginTransaction(entiteDB);
    try {
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

      const result = await runUpdate(
        entiteDB,
        `
        INSERT INTO profiles (id_entite, email, certicode, role, is_suspended, password, created_by_Entite)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `,
        [id_entite || null, email || null, certicode || null, role || null, hashedPassword, created_by_Entite]
      );

      const id_profile = result.lastID;

      for (const perm of permissions) {
        if (perm.page_id && (perm.read || perm.write || perm.hide)) {
          await runUpdate(
            entiteDB,
            `
            INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
            [id_profile, perm.page_id, perm.read ? 1 : 0, perm.write ? 1 : 0, perm.hide ? 1 : 0, new Date().toISOString()]
          );
        }
      }

      await commitTransaction(entiteDB);

      // Send email asynchronously
      if (email && password) {
        transporter.sendMail({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: 'New Profile Created',
          text: `Your profile has been created.\nEmail: ${email}\nPassword: ${password}\nCerticode: ${certicode}`,
        }).catch(err => {
          console.error('Error sending email:', { message: err.message, stack: err.stack });
        });
      }

      res.status(201).json({ id_profile, id_entite: id_entite || null, email, role, permissions });
    } catch (err) {
      await rollbackTransaction(entiteDB);
      throw err;
    }
  } catch (err) {
    console.error('Error creating profile:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.code || 'Unknown',
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// PUT /api/profiles/:id_profile
app.put('/api/profiles/:id_profile', async (req, res) => {
  const { id_profile } = req.params;
  const { email, id_entite, role, permissions } = req.body;

  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({
      error: 'Invalid input',
      details: 'permissions array is required',
    });
  }
  if (id_entite !== null && id_entite !== undefined) {
    // Validate id_entite only if provided
    const producerExists = await queryDB(
      entiteDB,
      'SELECT 1 FROM Entite WHERE id_entite = ?',
      [id_entite]
    );
    if (!producerExists.length) {
      return res.status(400).json({ error: 'Invalid input', details: 'id_entite does not exist' });
    }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid input', details: 'Invalid email format' });
  }

  try {
    // Validate page_ids
    const pageIds = permissions.map(perm => perm.page_id);
    if (pageIds.length > 0) {
      const validPages = await queryDB(
        entiteDB,
        `SELECT page_id FROM pages WHERE page_id IN (${pageIds.map(() => '?').join(',')})`,
        pageIds
      );
      if (validPages.length !== pageIds.length) {
        return res.status(400).json({ error: 'Invalid input', details: 'One or more page_ids are invalid' });
      }
    }

    await beginTransaction(entiteDB);
    try {
      const changes = await runUpdate(
        entiteDB,
        `
        UPDATE profiles SET email = ?, id_entite = ?, role = ? WHERE id_profile = ?
      `,
        [email || null, id_entite || null, role || null, id_profile]
      );

      if (changes.changes === 0) {
        throw new Error('Profile not found');
      }

      await runUpdate(
        entiteDB,
        `DELETE FROM autorisation_profile_page WHERE id_profile = ?`,
        [id_profile]
      );

      for (const perm of permissions) {
        if (perm.page_id && (perm.read || perm.write || perm.hide)) {
          await runUpdate(
            entiteDB,
            `
            INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
            [id_profile, perm.page_id, perm.read ? 1 : 0, perm.write ? 1 : 0, perm.hide ? 1 : 0, new Date().toISOString()]
          );
        }
      }

      await commitTransaction(entiteDB);
      res.json({ id_profile, id_entite: id_entite || null, email, role, permissions });
    } catch (err) {
      await rollbackTransaction(entiteDB);
      throw err;
    }
  } catch (err) {
    console.error('Error updating profile:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.code || 'Unknown',
    });
    res.status(err.message === 'Profile not found' ? 404 : 500).json({
      error: err.message === 'Profile not found' ? 'Profile not found' : 'Server error',
      details: err.message,
    });
  }
});

// GET /api/profiles/:id_profile
app.get('/api/profiles/:id_profile', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb unavailable', details: 'Database connection not established' });
  }
  const { id_profile } = req.params;

  try {
    const profileData = await queryDB(
      entiteDB,
      `
      SELECT 
        p.id_profile, p.id_entite, p.email, p.certicode, p.role, p.is_suspended, p.created_at, p.created_by_Entite,
        COALESCE(pr.raison_socialle, 'Tous ') AS company_name,
        ap.page_id, pg.page_name, ap.can_read, ap.can_write, ap.is_hidden
      FROM profiles p
      LEFT JOIN Entite pr ON p.id_entite = pr.id_entite
      LEFT JOIN autorisation_profile_page ap ON p.id_profile = ap.id_profile
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE p.id_profile = ?
    `,
      [id_profile]
    );

    if (!profileData.length) {
      console.log(`No profile found for id_profile: ${id_profile}`);
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = {
      id_profile: profileData[0].id_profile,
      id_entite: profileData[0].id_entite,
      email: profileData[0].email,
      certicode: profileData[0].certicode,
      role: profileData[0].role || null,
      is_suspended: profileData[0].is_suspended,
      created_at: profileData[0].created_at,
      created_by_Entite: profileData[0].created_by_Entite,
      company_name: profileData[0].company_name,
      permissions: [],
    };

    profileData.forEach(row => {
      if (row.page_id) {
        profile.permissions.push({
          page_id: row.page_id,
          page_name: row.page_name,
          read: !!row.read,
          write: !!row.write,
          hide: !!row.hide,
        });
      }
    });

    console.log(`Profile fetched successfully for id_profile: ${id_profile}`, profile);
    res.json(profile);
  } catch (err) {
    console.error('Error fetching profile:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.code || 'Unknown',
      id_profile,
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// PATCH /api/profiles/:id_profile/suspend
app.patch('/api/profiles/:id_profile/suspend', async (req, res) => {
  const { id_profile } = req.params;
  const { is_suspended } = req.body;

  if (is_suspended === undefined) {
    return res.status(400).json({ error: 'Invalid input', details: 'is_suspended is required' });
  }

  try {
    const changes = await runUpdate(
      entiteDB,
      `UPDATE profiles SET is_suspended = ? WHERE id_profile = ?`,
      [is_suspended ? 1 : 0, id_profile]
    );

    if (changes.changes === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ message: `Profile ${is_suspended ? 'suspended' : 'unsuspended'} successfully` });
  } catch (err) {
    console.error('Error updating profile suspend status:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.code || 'Unknown',
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// File management
app.get('/api/files', async (req, res) => {
  try {
    let filesData;
    try {
      const data = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        filesData = [];
      } else {
        throw err;
      }
    }
    res.json(filesData);
  } catch (err) {
    console.error('Error reading files.json:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.get('/api/file-content/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let filesData;
    try {
      const data = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Files data not found', details: 'files.json does not exist' });
      }
      throw err;
    }
    const file = filesData.find(f => f.id === parseInt(id));
    if (!file) {
      return res.status(404).json({ error: 'File not found', details: 'No file with provided ID' });
    }
    const fullPath = path.join(MODELES_DIR, file.filename);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      res.json({ content });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found on disk', details: 'File missing at specified path' });
      }
      throw err;
    }
  } catch (err) {
    console.error('Error fetching file content:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/files', async (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'Filename and content are required', details: 'Missing required fields' });
  }
  try {
    let filesData;
    try {
      const data = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        filesData = [];
      } else {
        throw err;
      }
    }
    const filePath = path.join(MODELES_DIR, filename);
    await fs.writeFile(filePath, content);
    const newFile = {
      id: filesData.length ? Math.max(...filesData.map(f => f.id)) + 1 : 1,
      filename,
      path: `/Modeles/${filename}`,
      date: new Date().toISOString()
    };
    filesData.push(newFile);
    await fs.writeFile(FILES_JSON_PATH, JSON.stringify(filesData, null, 2));
    res.status(201).json(newFile);
  } catch (err) {
    console.error('Error saving file:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/save-file', async (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || !content) {
    return res.status(400).json({ error: 'Path and content are required', details: 'Missing required fields' });
  }
  try {
    const filename = path.basename(filePath);
    const fullPath = path.join(MODELES_DIR, filename);
    await fs.writeFile(fullPath, content);
    let filesData;
    try {
      const data = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        filesData = [];
      } else {
        throw err;
      }
    }
    const existingFileIndex = filesData.findIndex(f => f.path === filePath);
    if (existingFileIndex !== -1) {
      filesData[existingFileIndex].date = new Date().toISOString();
    } else {
      filesData.push({
        id: filesData.length ? Math.max(...filesData.map(f => f.id)) + 1 : 1,
        filename,
        path: filePath,
        date: new Date().toISOString()
      });
    }
    await fs.writeFile(FILES_JSON_PATH, JSON.stringify(filesData, null, 2));
    res.json({ message: 'File saved successfully' });
  } catch (err) {
    console.error('Error saving file:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.delete('/api/files/:id', async (req, res) => {
  const { id } = req.params;
  try {
    let filesData;
    try {
      const data = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Files data not found', details: 'files.json does not exist' });
      }
      throw err;
    }
    const fileIndex = filesData.findIndex(f => f.id === parseInt(id));
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found', details: 'No file with provided ID' });
    }
    const [deletedFile] = filesData.splice(fileIndex, 1);
    await fs.writeFile(FILES_JSON_PATH, JSON.stringify(filesData, null, 2));
    const filePath = path.join(MODELES_DIR, deletedFile.filename);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error deleting file from disk:', {
          message: err.message,
          stack: err.stack
        });
      }
    }
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Save observation
app.post('/save-observation', async (req, res) => {
  const { filename, content, data } = req.body;
  if (!filename || (!content && !data)) {
    return res.status(400).json({ error: 'Missing filename or content/data', details: 'Required fields are missing' });
  }
  try {
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
    const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    let fileContent;
    let finalFilename;
    if (data) {
      fileContent = `const observations = ${JSON.stringify(data, null, 2)};`;
      finalFilename = `observations_${safeFilename}_${timestamp}.js`;
    } else {
      fileContent = content;
      finalFilename = safeFilename;
    }
    const filePath = path.join(MODELES_DIR, finalFilename);
    await fs.writeFile(filePath, fileContent);
    let filesData;
    try {
      const rawData = await fs.readFile(FILES_JSON_PATH, 'utf8');
      filesData = JSON.parse(rawData);
    } catch (err) {
      if (err.code === 'ENOENT') filesData = [];
      else throw err;
    }
    const existingFileIndex = filesData.findIndex(f => f.filename === finalFilename);
    if (existingFileIndex !== -1) {
      filesData[existingFileIndex].date = new Date().toISOString();
    } else {
      filesData.push({
        id: filesData.length ? Math.max(...filesData.map(f => f.id)) + 1 : 1,
        filename: finalFilename,
        path: `/Modeles/${finalFilename}`,
        date: new Date().toISOString(),
      });
    }
    await fs.writeFile(FILES_JSON_PATH, JSON.stringify(filesData, null, 2));
    res.json({ message: `Observation file saved: ${finalFilename}` });
  } catch (err) {
    console.error('Error saving observation:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Watch for file changes
chokidar.watch(MODELES_DIR, { ignored: /(^|[\/\\])\../, persistent: true }).on('all', async (event, filePath) => {
  if (event === 'add' || event === 'unlink' || event === 'change') {
    try {
      let files = [];
      try {
        files = await fs.promises.readdir(MODELES_DIR);
      } catch (readErr) {
        console.warn('Failed to read MODELES_DIR (using empty list):', readErr.message);
      }
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      await fs.promises.writeFile(FILES_JSON_PATH, JSON.stringify(jsonFiles, null, 2));
      console.log('files.json updated');
    } catch (err) {
      console.error('Error updating files.json:', {
        message: err.message,
        stack: err.stack
      });
    }
  }
});



// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const anomalies = await queryDB(entiteDB, 'SELECT COUNT(*) as activeAnomalies FROM anomalies_type_produit_cond WHERE activation_cond = 1', []);
    const profiles = await queryDB(entiteDB, 'SELECT COUNT(*) as profileAuthorizations FROM autoris_profil_page WHERE code_octal > 0', []);
    const activeBricks = await queryDB(allgpcDB, 'SELECT COUNT(*) as activeBricks FROM brickgpc WHERE status_br = 1', []);
    const totalBricks = await queryDB(allgpcDB, 'SELECT COUNT(*) as totalBricks FROM brickgpc', []);
    res.json({
      activeAnomalies: anomalies[0]?.activeAnomalies || 0,
      profileAuthorizations: profiles[0]?.profileAuthorizations || 0,
      activeBricks: activeBricks[0]?.activeBricks || 0,
      totalBricks: totalBricks[0]?.totalBricks || 0
    });
  } catch (err) {
    console.error('Error fetching stats:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Enterprises by sector endpoint
app.get('/api/enterprises-by-sector', async (req, res) => {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  try {
    const rows = await queryDB(allgpcDB, `
      SELECT s.libelleSegment AS name, COUNT(DISTINCT p.id_entite) AS value
      FROM Entite p
      JOIN Entite_segment ps ON p.id_entite = ps.id_entite
      JOIN segmentgpc s ON ps.id_segment  = s.codeSegment
      WHERE s.status_s = 1
      GROUP BY s.libelleSegment
    `, []);
    const data = rows.map((row, index) => ({
      name: row.name,
      value: row.value,
      color: colors[index % colors.length]
    }));
    res.json(data);
  } catch (err) {
    console.error('Error fetching enterprises by sector:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


// Product sheets by sector endpoint
app.get('/api/product-sheets-by-sector', async (req, res) => {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  try {
    const ficheProduitRows = await queryDB(entiteDB, 'SELECT codeClasse, COUNT(id) as count FROM fiche_produit GROUP BY codeClasse', []);
    const results = [];
    for (const row of ficheProduitRows) {
      const segmentRows = await queryDB(allgpcDB, `
        SELECT s.libelleSegment AS name
        FROM classegpc c
        JOIN segmentgpc s ON c.codeSeg = s.codeSegment
        WHERE c.codeClasse = ? AND c.status_c = 1 AND s.status_s = 1
      `, [row.codeClasse]);
      if (segmentRows.length > 0) {
        results.push({
          name: segmentRows[0].name,
          value: row.count
        });
      }
    }
    const aggregated = results.reduce((acc, curr) => {
      const existing = acc.find(item => item.name === curr.name);
      if (existing) {
        existing.value += curr.value;
      } else {
        acc.push({ ...curr, color: colors[acc.length % colors.length] });
      }
      return acc;
    }, []);
    res.json(aggregated);
  } catch (err) {
    console.error('Error fetching product sheets by sector:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Seed regions endpoint
app.get('/api/seed-regions', async (req, res) => {
  try {
    const regions = [
      { id_region: 1, libelle_region_fr: 'Tunis', libelle_region_ar: '????' },
      { id_region: 2, libelle_region_fr: 'Ariana', libelle_region_ar: '??????' },
      { id_region: 3, libelle_region_fr: 'Ben Arous', libelle_region_ar: '?? ????' },
      { id_region: 4, libelle_region_fr: 'Manouba', libelle_region_ar: '?????' },
      { id_region: 5, libelle_region_fr: 'tous', libelle_region_ar: 'tous' },
      { id_region: 6, libelle_region_fr: 'Zaghouan', libelle_region_ar: '?????' },
      { id_region: 7, libelle_region_fr: 'Nabeul', libelle_region_ar: '????' },
      { id_region: 8, libelle_region_fr: 'Bizerte', libelle_region_ar: '?????' },
      { id_region: 9, libelle_region_fr: 'Jendouba', libelle_region_ar: '??????' },
      { id_region: 10, libelle_region_fr: 'Beja', libelle_region_ar: '????' },
      { id_region: 11, libelle_region_fr: 'Le Kef', libelle_region_ar: '?????' },
      { id_region: 12, libelle_region_fr: 'Siliana', libelle_region_ar: '??????' },
      { id_region: 13, libelle_region_fr: 'Kasserine', libelle_region_ar: '???????' },
      { id_region: 14, libelle_region_fr: 'Kairouan', libelle_region_ar: '????????' },
      { id_region: 15, libelle_region_fr: 'Sousse', libelle_region_ar: '????' },
      { id_region: 16, libelle_region_fr: 'Monastir', libelle_region_ar: '????????' },
      { id_region: 17, libelle_region_fr: 'Mahdia', libelle_region_ar: '???????' },
      { id_region: 18, libelle_region_fr: 'Sfax', libelle_region_ar: '?????' },
      { id_region: 19, libelle_region_fr: 'Sidi Bouzid', libelle_region_ar: '???? ?????' },
      { id_region: 20, libelle_region_fr: 'Gafsa', libelle_region_ar: '????' },
      { id_region: 21, libelle_region_fr: 'Gab s', libelle_region_ar: '????' },
      { id_region: 22, libelle_region_fr: 'M denine', libelle_region_ar: '?????' },
      { id_region: 23, libelle_region_fr: 'Tozeur', libelle_region_ar: '????' },
      { id_region: 24, libelle_region_fr: 'Kebili', libelle_region_ar: '????' },
      { id_region: 25, libelle_region_fr: 'Tataouine', libelle_region_ar: '??????' },
    ];
    for (const region of regions) {
      await runUpdate(
        usersDB,
        'INSERT OR IGNORE INTO region_ref (id_region, libelle_region_fr, libelle_region_ar) VALUES (?, ?, ?)',
        [region.id_region, region.libelle_region_fr, region.libelle_region_ar]
      );
    }
    res.json({ message: 'Regions seeded successfully' });
  } catch (err) {
    console.error('Error seeding regions:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// GET /api/companies/max-id
app.get('/api/companies/max-id', async (req, res) => {
  try {
    if (!entiteDB) {
      return res.status(503).json({ error: 'Database unavailable', details: 'Database connection not established' });
    }
    const query = 'SELECT MAX(id_entite) AS max_id FROM Entite';
    const result = await queryDB(entiteDB, query, []);
    res.json({ max_id: result[0]?.max_id || 0 });
  } catch (err) {
    console.error('Error fetching max id_entite:', {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: 'Failed to fetch max ID', details: err.message });
  }
});

//-------------------------------------------------------------
//  FULL FIXED COMPANY API (7 ENDPOINTS)
//  Compatible with Entite.tsx + MySQL schema entitef.sql
//-------------------------------------------------------------

// 1. GET /api/companies  —  List companies with filters
app.get('/api/companies', async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: 'Database unavailable' });

    const { region, segment, delegation, type } = req.query;
    let query = `
      SELECT p.*, GROUP_CONCAT(s.codeSegment) AS segments
      FROM Entite p
      LEFT JOIN Entite_segment ps ON p.id_entite = ps.id_entite
      LEFT JOIN segmentgpc s ON ps.id_segment = s.codeSegment
    `;
    const params = [];
    const conditions = [];

    if (region && region !== 'all') {
      conditions.push('p.region = ?');
      params.push(region);
    }
    if (segment && segment !== 'all') {
      conditions.push('s.codeSegment = ?');
      params.push(segment);
    }
    if (delegation && delegation !== 'all') {
      conditions.push('p.city = ?');
      params.push(delegation);
    }
    if (type && type !== 'all') {
      conditions.push('p.type_prod = ?');
      params.push(parseInt(type, 10));
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY p.id_entite ORDER BY p.id_entite DESC';

    const companies = await queryDB(entiteDB, query, params);

    res.json(
      companies.map(c => ({
        ...c,
        segments: c.segments ? c.segments.split(',') : [],
        type_prod: Number(c.type_prod) || 0,
        statut: Number(c.statut) || 0,
        inscription: Number(c.inscription) || 0,
        nb_fp: Number(c.nb_fp) || 0
      }))
    );
  } catch (err) {
    console.error('GET /api/companies error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 2. GET /api/companies/:id  —  One company (never undefined)
app.get('/api/companies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const rows = await queryDB(
      entiteDB,
      `SELECT p.*, GROUP_CONCAT(s.codeSegment) AS segments
       FROM Entite p
       LEFT JOIN Entite_segment ps ON p.id_entite = ps.id_entite
       LEFT JOIN segmentgpc s ON ps.id_segment = s.codeSegment
       WHERE p.id_entite = ?
       GROUP BY p.id_entite`,
      [id]
    );

    const c = rows[0];
    if (!c) {
      // Always return a default skeleton so React never crashes
      return res.json({
        id_entite: id,
        raison_socialle: '',
        email: '',
        telephone: '',
        tel_mobile: '',
        site: '',
        adresse: '',
        region: '',
        city: '',
        localite: '',
        postalCode: '',
        personne_contact: '',
        nb_fp: 0,
        status_ent: 'A',
        delegation: '',
        titre_fr: '',
        titre_ar: '',
        titre_en: '',
        logo: '',
        segments: []
      });
    }

    res.json({
      ...c,
      segments: c.segments ? c.segments.split(',') : [],
      type_prod: Number(c.type_prod) || 0,
      statut: Number(c.statut) || 0,
      inscription: Number(c.inscription) || 0,
      nb_fp: Number(c.nb_fp) || 0
    });
  } catch (err) {
    console.error('GET /api/companies/:id error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 3. POST /api/companies  —  Create new company
// 3. POST /api/companies  —  Create new company
app.post('/api/companies', uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: 'Database unavailable' });

    let {
      raison_socialle, email, region, city, adresse,
      telephone, tel_mobile, site, personne_contact,
      status_ent, delegation, titre_fr, titre_ar, titre_en,
      segments
    } = req.body;
    const logoFile = req.file;

    if (!raison_socialle || !email)
      return res.status(400).json({ error: 'raison_socialle and email required' });

    if (segments && typeof segments === 'string') {
      try { segments = JSON.parse(segments); } catch { segments = []; }
    }

    await entiteDB.run('BEGIN');

    // ✅ New logo path (changed from /ged/logos/ to /logo_entite/)
    const logoPath = logoFile ? `/logo_entite/${logoFile.filename}` : null;

    const insert = await runUpdate(entiteDB, `
      INSERT INTO Entite (raison_socialle, email, region, city, adresse,
        telephone, tel_mobile, site, personne_contact, status_ent, delegation,
        titre_fr, titre_ar, titre_en, logo, date_create)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [raison_socialle, email, region, city, adresse, telephone, tel_mobile,
        site, personne_contact, status_ent || 'A', delegation, titre_fr,
        titre_ar, titre_en, logoPath]);

    const newId = insert.lastID;

    if (Array.isArray(segments)) {
      for (const seg of segments)
        await runUpdate(entiteDB, 'INSERT INTO Entite_segment (id_entite, id_segment) VALUES (?, ?)', [newId, seg]);
    }

    await entiteDB.run('COMMIT');

    // Fetch the full newly created company including segments
    const rows = await queryDB(entiteDB, `
      SELECT p.*, GROUP_CONCAT(s.id_segment) AS segments
      FROM Entite p
      LEFT JOIN Entite_segment s ON p.id_entite = s.id_entite
      WHERE p.id_entite = ?
      GROUP BY p.id_entite
    `, [newId]);

    const newCompany = rows[0];

    res.status(201).json({
      ...newCompany,
      segments: newCompany.segments ? newCompany.segments.split(',') : [],
      type_prod: Number(newCompany.type_prod) || 0,
      statut: Number(newCompany.statut) || 0,
      inscription: Number(newCompany.inscription) || 0,
      nb_fp: Number(newCompany.nb_fp) || 0
    });

  } catch (err) {
    await entiteDB.run('ROLLBACK').catch(() => {});
    console.error('POST /api/companies error:', err);
    res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});


// 4. PUT /api/companies/:id  —  Full update
app.put('/api/companies/:id', uploadLogo.single('logo'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const logoFile = req.file;

    // ✅ Updated to /logo_entite/
    const logoPath = logoFile ? `/logo_entite/${logoFile.filename}` : null;

    const fields = req.body;
    const cols = [
      'raison_socialle','email','region','city','adresse','telephone',
      'tel_mobile','site','personne_contact','status_ent','delegation',
      'titre_fr','titre_ar','titre_en'
    ];
    const updates = cols.map(c => `${c} = ?`).join(',');
    const values = cols.map(c => fields[c] || '');
    values.push(logoPath);
    const q = `UPDATE Entite SET ${updates}, logo = ? WHERE id_entite = ?`;
    values.push(id);

    const r = await runUpdate(entiteDB, q, values);
    if (!r.changes) return res.status(404).json({ error: 'Not found' });

    res.json({ message: 'Company updated successfully' });
  } catch (err) {
    console.error('PUT /api/companies/:id error:', err);
    res.status(500).json({ error: 'Failed to update company', details: err.message });
  }
});

// 6. DELETE /api/companies/:id  —  Remove company safely
app.delete('/api/companies/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    await entiteDB.run('BEGIN');
    await runUpdate(entiteDB, 'DELETE FROM Entite_segment WHERE id_entite = ?', [id]);
    const del = await runUpdate(entiteDB, 'DELETE FROM Entite WHERE id_entite = ?', [id]);
    await entiteDB.run('COMMIT');

    if (!del.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Company deleted successfully' });
  } catch (err) {
    await entiteDB.run('ROLLBACK').catch(() => {});
    console.error('DELETE /api/companies/:id error:', err);
    res.status(500).json({ error: 'Failed to delete company', details: err.message });
  }
});


// GET /api/check-supervisor-profile/:id_entite
app.get('/api/check-supervisor-profile/:id_entite', async (req, res) => {
  const { id_entite } = req.params;

  if (!id_entite || isNaN(parseInt(id_entite, 10))) {
    return res.status(400).json({ error: 'Invalid id_entite', details: 'id_entite must be a valid number' });
  }

  try {
    if (!entiteDB) {
      return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
    }

    // Query comptes table (fixed table name consistency)
    const profiles = await queryDB(
      entiteDB,
      'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
      [parseInt(id_entite, 10)]
    );

    res.json({ exists: profiles.length > 0 });
  } catch (err) {
    console.error('Error checking supervisor profile:', { id_entite, message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// POST /api/create-supervisor-profile
app.post('/api/create-supervisor-profile', async (req, res) => {
  const { id_entite, raison_socialle } = req.body;

  // Validate input
  if (!id_entite || isNaN(parseInt(id_entite))) {
    return res.status(400).json({
      error: 'Invalid id_entite',
      details: 'id_entite must be a valid number',
    });
  }
  if (!raison_socialle || typeof raison_socialle !== 'string') {
    return res.status(400).json({
      error: 'Invalid raison_socialle',
      details: 'raison_socialle must be a non-empty string',
    });
  }

  try {
    if (!entiteDB) {
      return res.status(503).json({
        error: 'EntiteDb.db is unavailable',
        details: 'Database connection not established',
      });
    }

    // Check if a supervisor profile already exists (fixed table name to comptes)
    const existing = await queryDB(
      entiteDB,
      'SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0',
      [parseInt(id_entite)]
    );
    if (existing.length > 0) {
      return res.status(400).json({
        error: 'Supervisor profile already exists',
        details: `A supervisor profile already exists for id_entite ${id_entite}`,
      });
    }

    // Insert new supervisor profile (fixed table name to comptes; minimal fields, adjust based on comptes table schema)
    const result = await runUpdate(
      entiteDB,
      `INSERT INTO comptes (id_entite, name, email, is_suspended, created_at)
       VALUES (?, ?, ?, 0, datetime('now'))`,
      [parseInt(id_entite), raison_socialle, null] // Email set to null; add if required
    );

    res.status(201).json({
      id_compte: result.lastID,
      id_entite,
      name: raison_socialle,
    });
  } catch (err) {
    console.error('Error creating supervisor profile:', {
      id_entite,
      raison_socialle,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      error: 'Server error',
      details: err.message,
    });
  }
});
//products 
//products 
// Fetch all products with fabricant (raison_socialle from Entite)
// ---------- PRODUCTS API (full, ready) ----------

// Requires: entiteDB, queryDB(entiteDB, sql, params), runUpdate(entiteDB, sql, params), uploadGed (multer array handler), fs, csv-parser, XLSX
// Make sure to `const fs = require('fs'); const csv = require('csv-parser'); const XLSX = require('xlsx');` at top of file.

//
// Helpers: ensure queryDB & runUpdate are your project functions used in companies endpoints
//
const multerBulk = multer();

// GET /api/products (list with filters, sort, pagination)
// GET /api/products (with filters, sorting, pagination)
// ✅ FIXED: /api/products (with filters, sorting, pagination)
app.get('/api/products', async (req, res) => {
  try {
    if (!entiteDB) {
      console.error('entiteDB not initialized');
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    let {
      brand,
      codebrique,
      search,
      sortBy = 'id',
      sortDir = 'DESC',
      page = '1',
      limit = '25'
    } = req.query;

    // ✅ Sanitize pagination values
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.max(1, parseInt(limit) || 25);
    const offset = (safePage - 1) * safeLimit;

    // ✅ Whitelist sortable columns
    const allowedSortKeys = [
      'id', 'brand', 'subBrand', 'description', 'gtin', 'libelle', 'short_libelle',
      'countryOfOrigin', 'idEntreprise', 'nb_images', 'prix_min', 'prix_max',
      'code_cader', 'codeClasse', 'codebrique', 'date_mis_a_jour_fp',
      'tradeItemSynchronisationDates', 'date_create_fp', 'activ_prix', 'status', 'done_new'
    ];
    if (!allowedSortKeys.includes(sortBy)) sortBy = 'id';
    sortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // ✅ Build WHERE clause dynamically
    let where = [];
    let params = [];

    if (brand) {
      where.push('brand = ?');
      params.push(brand);
    }

    if (codebrique) {
      where.push('codebrique = ?');
      params.push(codebrique);
    }

    if (search) {
      where.push('(gtin LIKE ? OR libelle LIKE ? OR brand LIKE ? OR description LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // ✅ Inline LIMIT/OFFSET (no placeholders → prevents mysqld_stmt_execute error)
    const sql = `
      SELECT id, brand, subBrand, description, gtin, libelle, short_libelle,
             countryOfOrigin, idEntreprise, images, nb_images, prix_min,
             prix_max, code_cader, codeClasse, codebrique, date_mis_a_jour_fp,
             tradeItemSynchronisationDates, date_create_fp, activ_prix, status, done_new
      FROM fiche_produit
      ${whereClause}
      ORDER BY \`${sortBy}\` ${sortDir}
      LIMIT ${offset}, ${safeLimit};
    `;

    const products = await queryDB(entiteDB, sql, params);

    // ✅ Separate count query
    const countSql = `SELECT COUNT(*) AS total FROM fiche_produit ${whereClause};`;
    const count = await queryDB(entiteDB, countSql, params);

    res.json({
      products,
      total: count[0]?.total || 0,
      totalPages: Math.ceil((count[0]?.total || 1) / safeLimit),
    });

  } catch (err) {
    console.error('❌ /api/products error:', err);
    res.status(500).json({
      error: 'Failed to fetch products',
      details: err.message
    });
  }
});

// POST /api/products (create with images)
app.post('/api/products', authenticate, uploadGed.array('images', 10), async (req, res) => { // Max 10 images
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });

  const fields = req.body;
  const images = req.files ? req.files.map(file => path.join('/ged', file.filename)).join(';') : '';

  // Validate required fields
  if (!fields.brand || !fields.gtin || !fields.libelle || !fields.idEntreprise || !fields.codebrique) {
    return res.status(400).json({ error: 'Required fields: brand, gtin, libelle, idEntreprise, codebrique' });
  }

  const sql = `
    INSERT INTO fiche_produit (brand, subBrand, description, gtin, libelle, short_libelle, countryOfOrigin, idEntreprise, images, nb_images, prix_min, prix_max, code_cader, codeClasse, codebrique, date_mis_a_jour_fp, tradeItemSynchronisationDates, date_create_fp, activ_prix, status, done_new)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    fields.brand, fields.subBrand || '', fields.description || '', fields.gtin, fields.libelle,
    fields.short_libelle || '', fields.countryOfOrigin || '', Number(fields.idEntreprise),
    images, images ? images.split(';').length : 0,
    Number(fields.prix_min || 0), Number(fields.prix_max || 0), fields.code_cader || '',
    Number(fields.codeClasse || 0), fields.codebrique, new Date().toISOString().slice(0, 19),
    '', new Date().toISOString().slice(0, 19), Number(fields.activ_prix || 0),
    Number(fields.status || 0), Number(fields.done_new || 0)
  ];

  try {
    const result = await runUpdate(entiteDB, sql, params);
    const newProduct = { id: result.lastID, ...fields, images, nb_images: params[9] };
    res.json(newProduct);
  } catch (err) {
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id (update with new images)
app.put('/api/products/:id', authenticate, uploadGed.array('images', 10), async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });

  const { id } = req.params;
  const fields = req.body;
  const newImages = req.files ? req.files.map(file => path.join('/ged', file.filename)).join(';') : '';

  // Fetch existing full product
  const existingQuery = await queryDB(entiteDB, 'SELECT * FROM fiche_produit WHERE id = ?', [id]);
  if (existingQuery.length === 0) return res.status(404).json({ error: 'Product not found' });
  const existing = existingQuery[0];

  const images = existing.images ? `${existing.images};${newImages}`.replace(/^;|;$/g, '') : newImages;
  const nb_images = images ? images.split(';').length : 0;

  const sql = `
    UPDATE fiche_produit SET brand = ?, subBrand = ?, description = ?, gtin = ?, libelle = ?, short_libelle = ?, countryOfOrigin = ?, idEntreprise = ?, images = ?, nb_images = ?, prix_min = ?, prix_max = ?, code_cader = ?, codeClasse = ?, codebrique = ?, date_mis_a_jour_fp = ?, tradeItemSynchronisationDates = ?, activ_prix = ?, status = ?, done_new = ?
    WHERE id = ?
  `;
  const params = [
    fields.brand ?? existing.brand, 
    fields.subBrand ?? existing.subBrand, 
    fields.description ?? existing.description, 
    fields.gtin ?? existing.gtin, 
    fields.libelle ?? existing.libelle,
    fields.short_libelle ?? existing.short_libelle, 
    fields.countryOfOrigin ?? existing.countryOfOrigin, 
    Number(fields.idEntreprise ?? existing.idEntreprise),
    images, 
    nb_images, 
    Number(fields.prix_min ?? existing.prix_min), 
    Number(fields.prix_max ?? existing.prix_max), 
    fields.code_cader ?? existing.code_cader, 
    Number(fields.codeClasse ?? existing.codeClasse), 
    fields.codebrique ?? existing.codebrique, 
    new Date().toISOString().slice(0, 19),
    fields.tradeItemSynchronisationDates ?? existing.tradeItemSynchronisationDates, 
    Number(fields.activ_prix ?? existing.activ_prix),
    Number(fields.status ?? existing.status), 
    Number(fields.done_new ?? existing.done_new), 
    id
  ];

  try {
    const result = await runUpdate(entiteDB, sql, params);
    if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
    const updatedProduct = { ...existing, ...fields, images, nb_images, id: Number(id) };
    res.json(updatedProduct);
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id
app.delete('/api/products/:id', authenticate, async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });

  const { id } = req.params;
  try {
    const result = await runUpdate(entiteDB, 'DELETE FROM fiche_produit WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// POST /api/products/bulk (CSV/Excel upload)
app.post('/api/products/bulk', authenticate, multerBulk.single('csv'), async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    let data;
    if (req.file.mimetype === 'text/csv') {
      data = await new Promise((resolve, reject) => {
        const results = [];
        const stream = require('stream').Readable.from(req.file.buffer);
        stream.pipe(csvParser())
          .on('data', (row) => results.push(row))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else { // Excel
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    }

    let count = 0;
    for (const row of data) {
      // Validate required
      if (!row['Marque*'] || !row['GTIN*'] || !row['Libellé*'] || !row['ID Entreprise*'] || !row['Code Brique*']) continue;

      const images = row.Images || '';
      const nb_images = images ? images.split(';').length : 0;

      const sql = `
        INSERT INTO fiche_produit (brand, subBrand, description, gtin, libelle, short_libelle, countryOfOrigin, idEntreprise, images, nb_images, prix_min, prix_max, code_cader, codeClasse, codebrique, date_mis_a_jour_fp, tradeItemSynchronisationDates, date_create_fp, activ_prix, status, done_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        row['Marque*'], row['Sous-marque'] || '', row.Description || '', row['GTIN*'], row['Libellé*'],
        row['Libellé court'] || '', row["Pays d'origine"] || '', Number(row['ID Entreprise*']),
        images, nb_images, Number(row['Prix minimum'] || 0), Number(row['Prix maximum'] || 0), row['Code Cader'] || '',
        Number(row['Code Classe'] || 0), row['Code Brique*'], new Date().toISOString().slice(0, 19),
        row['Dates de synchronisation'] || '', new Date().toISOString().slice(0, 19), Number(row['Prix actif'] || 0),
        Number(row.Statut || 0), Number(row['Nouveau fait'] || 0)
      ];
      await runUpdate(entiteDB, sql, params);
      count++;
    }
    res.json({ count, message: 'Bulk import successful' });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Failed to import products' });
  }
});
//comptes

// Create compte endpoint
// Serve avatar images via API (new endpoint)
app.get('/api/avatars/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(avatarDir, filename); // avatarDir is path.join(__dirname, 'public/avatars')

  console.log('GET /api/avatars/:filename request:', { filename, filePath });

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('Avatar file not found:', { filename, error: err.message });
      return res.status(404).json({ error: 'Avatar not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    fs.createReadStream(filePath).pipe(res);
  });
});

//ged apis 
// GED Endpoints
// Note: Add these to your Express app, e.g., app.use('/api/ged', gedRouter); or directly app.get/post/etc.
// GED Log function to record actions



// GED Log Helper (utility function, not an endpoint)
async function gedLog(db, id_ged, action, performed_by = null, details = null) {
  try {
    const performed_at = new Date().toISOString();
    const detailsString = details ? JSON.stringify(details) : null;
    await runUpdate(db, `
      INSERT INTO ged_logs (id_ged, action, performed_by, performed_at, details)
      VALUES (?, ?, ?, ?, ?)
    `, [id_ged, action, performed_by, performed_at, detailsString]);
    console.log('GED log recorded:', { id_ged, action, performed_by });
  } catch (err) {
    console.error('Error logging GED action:', err.message, err.stack);
  }
}

// GED List
app.get('/api/ged/list', async (req, res) => {
  try {
    const { page = 1, perPage = 20, sort = 'created_at', dir = 'DESC', search, category, filetype, id_entite } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(perPage);
    const limit = parseInt(perPage);

    let whereClauses = [];
    let params = [];

    if (id_entite) {
      whereClauses.push('gd.uploaded_by IN (SELECT c2.id_compte FROM comptes c2 WHERE c2.id_entite = ?)');
      params.push(parseInt(id_entite));
    }

    if (search) {
      whereClauses.push('(filename LIKE ? OR original_name LIKE ? OR tags LIKE ? OR description LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (filetype) {
      whereClauses.push('mimetype LIKE ?');
      params.push(`${filetype}%`);
    }

    const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortColumn = ['created_at', 'original_name', 'size', 'category'].includes(sort) ? sort : 'created_at';
    const sortDirection = dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const rows = await queryDB(entiteDB, `
      SELECT gd.*, c.email AS uploaded_by_email
      FROM ged_documents gd
      LEFT JOIN comptes c ON gd.uploaded_by = c.id_compte
      ${whereClause}
      ORDER BY gd.${sortColumn} ${sortDirection}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const totalRows = await queryDB(entiteDB, `
      SELECT COUNT(*) as total
      FROM ged_documents gd
      LEFT JOIN comptes c ON gd.uploaded_by = c.id_compte
      ${whereClause}
    `, params);

    res.json({
      total: totalRows[0]?.total || 0,
      page: parseInt(page),
      perPage: limit,
      items: rows.map(row => ({
        ...row,
        path: `/ged/${row.filename}`,
      })),
    });
  } catch (err) {
    console.error('Error listing GED documents:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch documents', details: err.message });
  }
});

// GED Upload (requires multer setup: const uploadGed = multer({ dest: GED_DIR });)
app.post('/api/ged/upload', uploadGed.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      console.error('No file uploaded in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { category = null, tags = null, description = null, id_compte } = req.body;
    const uploaded_by = id_compte ? parseInt(id_compte) : null;

    // Always resolve absolute path
    const filePath = path.join(GED_DIR, file.filename);

    // Ensure GED_DIR exists (sync to avoid promise issues)
    if (!require('fs').existsSync(GED_DIR)) {
      require('fs').mkdirSync(GED_DIR, { recursive: true });
    }

    // Double-check file really exists on disk
    if (!require('fs').existsSync(filePath)) {
      console.error('File not found in GED directory:', filePath);
      return res.status(500).json({
        error: 'File save failed',
        details: `File not found in GED directory: ${filePath}`
      });
    }

    const created_at = new Date().toISOString();
    const relativePath = `/ged/${file.filename}`;

    // Save metadata to DB
    const result = await runUpdate(entiteDB, `
      INSERT INTO ged_documents 
      (filename, original_name, path, mimetype, size, category, tags, uploaded_by, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      file.filename,
      file.originalname,
      relativePath,
      file.mimetype,
      file.size,
      category,
      tags,
      uploaded_by,
      description,
      created_at
    ]);

    const id_ged = result.lastID;

    // Log the action
    await gedLog(entiteDB, id_ged, 'upload', uploaded_by, {
      original_name: file.originalname,
      category,
      tags
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      id_ged,
      file: {
        filename: file.filename,
        original_name: file.originalname,
        path: relativePath,
        mimetype: file.mimetype,
        size: file.size
      }
    });
  } catch (err) {
    console.error('Error uploading GED file:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to upload file', details: err.message });
  }
});

// GED Download
app.get('/api/ged/:id/download', async (req, res) => {
  try {
    const id = req.params.id;
    const { id_compte } = req.query;

    const rows = await queryDB(entiteDB, 'SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows || !rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const file = rows[0];
    const filePath = path.join(GED_DIR, file.filename);

    // Ensure file exists on disk
    if (!require('fs').existsSync(filePath)) {
      console.error('File not found on disk:', filePath);
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Log the download
    await gedLog(entiteDB, id, 'download', id_compte || null);

    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.original_name.replace(/"/g, '')}"`
    );

    res.sendFile(filePath);
  } catch (err) {
    console.error('Error downloading GED file:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to download file', details: err.message });
  }
});

// GED Logs
app.get('/api/ged/:id/logs', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await queryDB(entiteDB, `
      SELECT gl.*, c.email AS performer_email
      FROM ged_logs gl
      LEFT JOIN comptes c ON gl.performed_by = c.id_compte
      WHERE gl.id_ged = ?
      ORDER BY gl.performed_at DESC
    `, [id]);
    res.json({ logs: rows });
  } catch (err) {
    console.error('Error fetching GED logs:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

// GED Soft Delete
app.delete('/api/ged/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { id_compte } = req.body;
    const rows = await queryDB(entiteDB, 'SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].deleted_at) return res.status(400).json({ error: 'Already deleted' });
    const deleted_at = new Date().toISOString();
    await runUpdate(entiteDB, 'UPDATE ged_documents SET deleted_at = ?, modified_at = ? WHERE id_ged = ?', [deleted_at, deleted_at, id]);
    await gedLog(entiteDB, id, 'soft_delete', id_compte);
    res.json({ message: 'Soft deleted' });
  } catch (err) {
    console.error('Error soft deleting GED document:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to soft delete', details: err.message });
  }
});

// GED Restore
app.post('/api/ged/:id/restore', async (req, res) => {
  try {
    const id = req.params.id;
    const { id_compte } = req.body;
    const rows = await queryDB(entiteDB, 'SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (!rows[0].deleted_at) return res.status(400).json({ error: 'Not deleted' });
    const modified_at = new Date().toISOString();
    await runUpdate(entiteDB, 'UPDATE ged_documents SET deleted_at = NULL, modified_at = ? WHERE id_ged = ?', [modified_at, id]);
    await gedLog(entiteDB, id, 'restore', id_compte);
    res.json({ message: 'Restored' });
  } catch (err) {
    console.error('Error restoring GED document:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to restore', details: err.message });
  }
});

// GED Hard Delete
app.delete('/api/ged/:id/hard', async (req, res) => {
  try {
    const id = req.params.id;
    const { id_compte } = req.body;
    const performed_by = id_compte ? parseInt(id_compte) : null;
    const rows = await queryDB(entiteDB, 'SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(GED_DIR, rows[0].filename);
    const fs = require('fs').promises;
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      console.log('File deleted from disk:', filePath);
    } catch (unlinkErr) {
      console.error('Error deleting file from disk:', unlinkErr.message);
      // Continue even if file deletion fails, as DB cleanup is important
    }
    await gedLog(entiteDB, id, 'hard_delete', performed_by);
    await runUpdate(entiteDB, 'DELETE FROM ged_logs WHERE id_ged = ?', [id]);
    await runUpdate(entiteDB, 'DELETE FROM ged_documents WHERE id_ged = ?', [id]);
    res.json({ message: 'Hard deleted' });
  } catch (err) {
    console.error('Error hard deleting GED document:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to hard delete', details: err.message });
  }
});

// GED Update Metadata
app.put('/api/ged/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { category, tags, description, id_compte } = req.body;
    const rows = await queryDB(entiteDB, 'SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const updates = [];
    const params = [];
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    const modified_at = new Date().toISOString();
    updates.push('modified_at = ?');
    params.push(modified_at);
    params.push(id);
    await runUpdate(entiteDB, `UPDATE ged_documents SET ${updates.join(', ')} WHERE id_ged = ?`, params);
    await gedLog(entiteDB, id, 'update_metadata', id_compte, { category, tags, description });
    res.json({ message: 'Metadata updated' });
  } catch (err) {
    console.error('Error updating GED metadata:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update metadata', details: err.message });
  }
});

// GED Folders List (hierarchical, with deleted support)
app.get('/api/ged/folders', async (req, res) => {
  try {
    const { id_entite, include_deleted = 'false' } = req.query;
    let whereClause = '1=1';
    let params = [];

    if (id_entite) {
      whereClause += ' AND gf.uploaded_by IN (SELECT c2.id_compte FROM comptes c2 WHERE c2.id_entite = ?)';
      params.push(parseInt(id_entite));
    }

    if (include_deleted === 'false') {
      whereClause += ' AND gf.deleted_at IS NULL';
    }

    const folders = await queryDB(entiteDB, `
      SELECT * FROM ged_folders gf
      WHERE ${whereClause}
      ORDER BY name ASC
    `, params);

    if (folders.length === 0) {
      return res.json({ folders: [] });
    }

    const folderIds = folders.map(f => f.id_folder);
    const associations = await queryDB(entiteDB, `
      SELECT id_folder, id_ged FROM ged_folder_files
      WHERE id_folder IN (${folderIds.map(() => '?').join(',')})
    `, folderIds);

    const allGedIds = [...new Set(associations.map(a => a.id_ged))];
    let gedFiles = [];
    if (allGedIds.length > 0) {
      gedFiles = await queryDB(entiteDB, `
        SELECT gd.*, c.email AS uploaded_by_email
        FROM ged_documents gd
        LEFT JOIN comptes c ON gd.uploaded_by = c.id_compte
        WHERE gd.id_ged IN (${allGedIds.map(() => '?').join(',')}) AND gd.deleted_at IS NULL
        ORDER BY gd.original_name ASC
      `, allGedIds);
    }

    const gedMap = new Map(gedFiles.map(g => [g.id_ged, {
      ...g,
      path: `/ged/${g.filename}`,
    }]));

    const folderMap = new Map(folders.map(f => [f.id_folder, {
      ...f,
      id: f.id_folder.toString(),
      children: [],
      files: [],
      deleted_at: f.deleted_at
    }]));

    const assocMap = new Map();
    associations.forEach(a => {
      if (!assocMap.has(a.id_folder)) assocMap.set(a.id_folder, new Set());
      assocMap.get(a.id_folder).add(a.id_ged);
    });

    function buildTree(folderNode, map, assocMap, gedMap) {
      const children = folders.filter(f => f.parent_id === parseInt(folderNode.id)).sort((a, b) => a.name.localeCompare(b.name));
      children.forEach(child => {
        const childNode = map.get(child.id_folder);
        buildTree(childNode, map, assocMap, gedMap);
        folderNode.children.push(childNode);
      });

      const fileIds = assocMap.get(parseInt(folderNode.id)) || new Set();
      folderNode.files = Array.from(fileIds).map(id => gedMap.get(id)).filter(Boolean);
      folderNode.files.sort((a, b) => a.original_name.localeCompare(b.original_name));
    }

    const rootFolders = folders.filter(f => !f.parent_id).map(f => folderMap.get(f.id_folder));
    rootFolders.forEach(root => buildTree(root, folderMap, assocMap, gedMap));
    rootFolders.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ folders: rootFolders });
  } catch (err) {
    console.error('Error listing GED folders:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch folders', details: err.message });
  }
});

// GED Create Folder
app.post('/api/ged/folders', async (req, res) => {
  try {
    const { name, parent_id = null, id_compte } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const uploaded_by = id_compte ? parseInt(id_compte) : null;

    const created_at = new Date().toISOString();
    const result = await runUpdate(entiteDB, `
      INSERT INTO ged_folders (name, parent_id, uploaded_by, created_at)
      VALUES (?, ?, ?, ?)
    `, [name.trim(), parent_id ? parseInt(parent_id) : null, uploaded_by, created_at]);

    const id_folder = result.lastID;
    console.log('Folder created:', { id_folder, name, parent_id, uploaded_by });

    res.status(201).json({
      id_folder,
      name: name.trim(),
      parent_id: parent_id ? parseInt(parent_id) : null
    });
  } catch (err) {
    console.error('Error creating GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to create folder', details: err.message });
  }
});

// GED Add File to Folder
app.post('/api/ged/folders/:id/files', async (req, res) => {
  try {
    const id_folder = parseInt(req.params.id);
    const { id_ged, id_compte } = req.body;
    if (!id_ged) {
      return res.status(400).json({ error: 'id_ged is required' });
    }

    const folderRows = await queryDB(entiteDB, 'SELECT * FROM ged_folders WHERE id_folder = ? AND deleted_at IS NULL', [id_folder]);
    if (!folderRows.length) {
      return res.status(404).json({ error: 'Folder not found or deleted' });
    }

    const result = await runUpdate(entiteDB, `
      INSERT OR IGNORE INTO ged_folder_files (id_folder, id_ged)
      VALUES (?, ?)
    `, [id_folder, parseInt(id_ged)]);

    if (result.changes === 0) {
      return res.json({ message: 'File already in folder' });
    }

    await gedLog(entiteDB, parseInt(id_ged), 'add_to_folder', id_compte ? parseInt(id_compte) : null, { id_folder });

    res.json({ message: 'File added to folder' });
  } catch (err) {
    console.error('Error adding file to GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to add file to folder', details: err.message });
  }
});

// GED Remove File from Folder
app.delete('/api/ged/folders/:id/files/:ged_id', async (req, res) => {
  try {
    const id_folder = parseInt(req.params.id);
    const id_ged = parseInt(req.params.ged_id);
    const { id_compte } = req.body;

    const folderRows = await queryDB(entiteDB, 'SELECT * FROM ged_folders WHERE id_folder = ? AND deleted_at IS NULL', [id_folder]);
    if (!folderRows.length) {
      return res.status(404).json({ error: 'Folder not found or deleted' });
    }

    const result = await runUpdate(entiteDB, `
      DELETE FROM ged_folder_files WHERE id_folder = ? AND id_ged = ?
    `, [id_folder, id_ged]);

    if (result.changes === 0) {
      return res.json({ message: 'File not in folder' });
    }

    await gedLog(entiteDB, id_ged, 'remove_from_folder', id_compte ? parseInt(id_compte) : null, { id_folder });

    res.json({ message: 'File removed from folder' });
  } catch (err) {
    console.error('Error removing file from GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to remove file from folder', details: err.message });
  }
});

// GED Folder Soft Delete
app.delete('/api/ged/folders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { id_compte } = req.body;

    const folderRows = await queryDB(entiteDB, 'SELECT * FROM ged_folders WHERE id_folder = ?', [id]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
    if (folderRows[0].deleted_at) return res.status(400).json({ error: 'Already deleted' });

    const deleted_at = new Date().toISOString();
    await runUpdate(entiteDB, 'UPDATE ged_folders SET deleted_at = ?, modified_at = ? WHERE id_folder = ?', [deleted_at, deleted_at, id]);

    console.log('Folder soft deleted:', { id, performed_by: id_compte });

    res.json({ message: 'Folder soft deleted' });
  } catch (err) {
    console.error('Error soft deleting GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to soft delete folder', details: err.message });
  }
});

// GED Folder Restore
app.post('/api/ged/folders/:id/restore', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { id_compte } = req.body;

    const folderRows = await queryDB(entiteDB, 'SELECT * FROM ged_folders WHERE id_folder = ?', [id]);
    if (!folderRows.length) return res.status(404).json({ error: 'Folder not found' });
    if (!folderRows[0].deleted_at) return res.status(400).json({ error: 'Not deleted' });

    const modified_at = new Date().toISOString();
    await runUpdate(entiteDB, 'UPDATE ged_folders SET deleted_at = NULL, modified_at = ? WHERE id_folder = ?', [modified_at, id]);

    // Also restore children recursively
    const children = await queryDB(entiteDB, 'SELECT id_folder FROM ged_folders WHERE parent_id = ? AND deleted_at IS NOT NULL', [id]);
    for (const child of children) {
      await runUpdate(entiteDB, 'UPDATE ged_folders SET deleted_at = NULL, modified_at = ? WHERE id_folder = ?', [modified_at, child.id_folder]);
    }

    console.log('Folder restored:', { id, performed_by: id_compte });

    res.json({ message: 'Folder restored' });
  } catch (err) {
    console.error('Error restoring GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to restore folder', details: err.message });
  }
});

// GED Folder Hard Delete (recursive)
app.delete('/api/ged/folders/:id/hard', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { id_compte } = req.body;
    const performed_by = id_compte ? parseInt(id_compte) : null;

    // First, find all descendants recursively
    const allDescendants = new Set([id]);
    let toProcess = [id];

    while (toProcess.length > 0) {
      const batch = toProcess;
      toProcess = [];
      const placeholders = batch.map(() => '?').join(',');
      const children = await queryDB(entiteDB, `
        SELECT id_folder FROM ged_folders WHERE parent_id IN (${placeholders})
      `, batch);
      children.forEach(child => {
        if (!allDescendants.has(child.id_folder)) {
          allDescendants.add(child.id_folder);
          toProcess.push(child.id_folder);
        }
      });
    }

    // Delete associations for all descendants
    if (allDescendants.size > 0) {
      const assocPlaceholders = Array.from(allDescendants).map(() => '?').join(',');
      await runUpdate(entiteDB, `
        DELETE FROM ged_folder_files WHERE id_folder IN (${assocPlaceholders})
      `, Array.from(allDescendants));

      // Delete folders bottom-up (reverse order)
      const deleteOrder = Array.from(allDescendants).reverse();
      for (const folderId of deleteOrder) {
        await runUpdate(entiteDB, 'DELETE FROM ged_folders WHERE id_folder = ?', [folderId]);
      }
    }

    console.log('Folder hard deleted:', { id, descendants: allDescendants.size, performed_by });

    res.json({ message: 'Folder hard deleted' });
  } catch (err) {
    console.error('Error hard deleting GED folder:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to hard delete folder', details: err.message });
  }
});

//notifications 
// Get all notifications for a compte
// ✅ Notifications Endpoints (MySQL-compatible version)
app.get('/api/notifications', async (req, res) => {
  try {
    const { id_compte } = req.query;
    console.log('🔔 GET /api/notifications called with id_compte:', id_compte);

    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }

    const sql = `
      SELECT id_notification, contenu, type, created_at, \`read\`
      FROM notifications
      WHERE id_compte = ?
      ORDER BY created_at DESC;
    `;

    const rows = await queryDB(entiteDB, sql, [parseInt(id_compte)]);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
  }
});


// ✅ Create a new notification
app.post('/api/notifications', async (req, res) => {
  try {
    const { contenu, type, id_compte } = req.body;
    console.log('🆕 POST /api/notifications called with:', { contenu, type, id_compte });

    if (!contenu || !type || !id_compte || isNaN(id_compte) || !['success', 'error'].includes(type)) {
      return res.status(400).json({ error: 'contenu, valid type (success/error), and id_compte are required' });
    }

    const insertSql = `
      INSERT INTO notifications (id_compte, contenu, type, created_at, \`read\`)
      VALUES (?, ?, ?, NOW(), 0);
    `;
    const result = await queryDB(entiteDB, insertSql, [parseInt(id_compte), contenu, type]);

    const selectSql = `
      SELECT id_notification, contenu, type, created_at, \`read\`
      FROM notifications
      WHERE id_notification = ?;
    `;
    const newNotif = await queryDB(entiteDB, selectSql, [result.insertId]);

    res.json(newNotif[0]);
  } catch (err) {
    console.error('❌ Error creating notification:', err);
    res.status(500).json({ error: 'Failed to create notification', details: err.message });
  }
});


// ✅ Mark a notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    console.log('📖 PUT /api/notifications/:id/read', { id, id_compte });

    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }

    const updateSql = `
      UPDATE notifications
      SET \`read\` = 1
      WHERE id_notification = ? AND id_compte = ?;
    `;
    const result = await queryDB(entiteDB, updateSql, [parseInt(id), parseInt(id_compte)]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or unauthorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to update notification', details: err.message });
  }
});


// ✅ Delete a single notification
app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    console.log('🗑️ DELETE /api/notifications/:id', { id, id_compte });

    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }

    const deleteSql = `
      DELETE FROM notifications
      WHERE id_notification = ? AND id_compte = ?;
    `;
    const result = await queryDB(entiteDB, deleteSql, [parseInt(id), parseInt(id_compte)]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or unauthorized' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting notification:', err);
    res.status(500).json({ error: 'Failed to delete notification', details: err.message });
  }
});


// ✅ Clear all notifications for a specific compte
app.delete('/api/notifications/clear', async (req, res) => {
  try {
    const { id_compte } = req.body;
    console.log('🧹 DELETE /api/notifications/clear called with id_compte:', id_compte);

    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }

    const clearSql = `
      DELETE FROM notifications
      WHERE id_compte = ?;
    `;
    await queryDB(entiteDB, clearSql, [parseInt(id_compte)]);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error clearing notifications:', err);
    res.status(500).json({ error: 'Failed to clear notifications', details: err.message });
  }
});

// api login + comptes 
// Get single compte with permissions
app.get('/api/comptes/:id', async (req, res) => {  
  if (!entiteDB) {  
    return res.status(503).json({ error: 'EntiteDb unavailable' });  
  }  
  const { id } = req.params;  
  console.log('GET /api/comptes/:id request:', { id });  
  try {  
    const account = await queryDB(entiteDB, `  
      SELECT c.id_compte, c.email, c.name, c.prenom, c.certicode, c.is_suspended, c.created_at, c.id_entite,  
             p.raison_socialle AS producer_name, c.profile_id, c.avatar_url  
      FROM comptes c  
      LEFT JOIN Entite p ON c.id_entite = p.id_entite  
      WHERE c.id_compte = ?  
    `, [id]);  
    if (account.length === 0) {  
      console.error('Account not found:', id);  
      return res.status(404).json({ error: 'Account not found' });  
    }  
    const permissionsQueryId = account[0].profile_id || account[0].id_compte;  
    const permissions = await queryDB(entiteDB, `  
      SELECT page_id, can_read, can_write,is_hidden  
      FROM autorisation_profile_page  
      WHERE id_profile = ?  
    `, [permissionsQueryId]);  
    const fullAccount = {  
      ...account[0],  
      permissions  
    };  
    console.log('Single account fetched successfully:', { id_compte: id });  
    res.json(fullAccount);  
  } catch (err) {  
    console.error('Error fetching single account:', { message: err.message, stack: err.stack, id });  
    res.status(500).json({ error: 'Failed to fetch account', details: err.message });  
  }  
});  
// Create compte endpoint (unchanged, but included for completeness)
app.post('/api/comptes', upload.single('avatar'), async (req, res) => {  
  if (!entiteDB) {  
    console.error('Database unavailable');  
    return res.status(503).json({ error: 'Database unavailable' });  
  }  
  const { email, name, prenom, certicode, profile_id, id_entite, permissions, useCustomPermissions } = req.body;  
  const avatarFile = req.file;  
  console.log('POST /api/comptes request:', {  
    email,  
    name,  
    prenom,  
    certicode,  
    profile_id,  
    id_entite,  
    useCustomPermissions,  
    permissions: permissions ? 'provided' : 'not provided',  
    avatar: avatarFile ? { filename: avatarFile.filename, size: avatarFile.size, mimetype: avatarFile.mimetype } : null,  
  });  
  if (!email) return res.status(400).json({ error: 'Email requis' });  
  if (!id_entite) return res.status(400).json({ error: 'id_entite requis' });  
  if (!profile_id && !useCustomPermissions) {  
    return res.status(400).json({ error: 'Veuillez sélectionner un profil ou activer les permissions personnalisées' });  
  }  
  try {  
    const producer = await queryDB(entiteDB, `SELECT id_entite FROM Entite WHERE id_entite = ?`, [id_entite]);  
    if (producer.length === 0) {  
      console.error('Invalid id_entite:', id_entite);  
      return res.status(400).json({ error: 'Invalid id_entite', details: 'Producer does not exist' });  
    }  
    if (profile_id && !useCustomPermissions) {  
      const profile = await queryDB(entiteDB, `SELECT id_profile FROM profiles WHERE id_profile = ?`, [profile_id]);  
      if (profile.length === 0) {  
        console.error('Invalid profile_id:', profile_id);  
        return res.status(400).json({ error: 'Invalid profile_id', details: 'Profile does not exist' });  
      }  
    }  
    let parsedPermissions = null;  
    if (useCustomPermissions && permissions) {  
      try {  
        parsedPermissions = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;  
        if (!Array.isArray(parsedPermissions)) throw new Error('Permissions must be an array');  
      } catch (err) {  
        console.error('Invalid permissions format:', err.message);  
        return res.status(400).json({ error: 'Invalid permissions format', details: err.message });  
      }  
      const pageIds = parsedPermissions.map(p => p.page_id);  
      const validPages = await queryDB(entiteDB, `SELECT page_id FROM pages WHERE page_id IN (${pageIds.map(() => '?').join(',')})`, pageIds);  
      const validPageIds = validPages.map(p => p.page_id);  
      const invalidPages = pageIds.filter(id => !validPageIds.includes(id));  
      if (invalidPages.length > 0) {  
        console.error('Invalid page_id in permissions:', invalidPages);  
        return res.status(400).json({ error: 'Invalid page_id in permissions', details: `Invalid page IDs: ${invalidPages.join(', ')}` });  
      }  
    }  
    const password = generatePassword();  
    const hashedPassword = await bcrypt.hash(password, 10);  
    let avatarUrl = null;  
    if (avatarFile) {  
      avatarUrl = `/uploads/${avatarFile.filename}`; // Fixed to match static serve  
      console.log('Avatar file processed:', { filename: avatarFile.filename, url: avatarUrl });  
    }  
    await runUpdate(entiteDB, 'BEGIN TRANSACTION', []);  
    let lastID;  
    try {  
      const result = await runUpdate(entiteDB, `  
        INSERT INTO comptes (email, name, prenom, certicode, password, profile_id, id_entite, is_suspended, avatar_url)  
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)  
      `, [email, name || null, prenom || null, certicode || null, hashedPassword, useCustomPermissions ? null : profile_id, id_entite, 0, avatarUrl]);  
      lastID = result.lastID;  
      console.log(`Created account id_compte ${lastID}`);  
      if (useCustomPermissions && parsedPermissions && parsedPermissions.length > 0) {  
        for (const perm of parsedPermissions) {  
          await runUpdate(entiteDB, `  
            INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)  
            VALUES (?, ?, ?, ?, ?, ?)  
          `, [lastID, perm.page_id, perm.read ? 1 : 0, perm.write ? 1 : 0, perm.hide ? 1 : 0, new Date().toISOString()]);  
        }  
        console.log(`Inserted custom permissions for id_compte ${lastID}`);  
      } else if (profile_id && !useCustomPermissions) {  
        await runUpdate(entiteDB, `  
          INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)  
          SELECT ?, page_id, can_read, can_write, is_hidden, ?  
          FROM autorisation_profile_page  
          WHERE id_profile = ?  
        `, [lastID, new Date().toISOString(), profile_id]);  
        console.log(`Copied permissions from id_profile ${profile_id} to id_compte ${lastID}`);  
      }  
      await runUpdate(entiteDB, 'COMMIT', []);  
    } catch (err) {  
      await runUpdate(entiteDB, 'ROLLBACK', []);  
      if (avatarFile) {  
        try {  
          fs.unlinkSync(path.join(avatarDir, avatarFile.filename));  
        } catch (unlinkErr) {  
          console.error('Failed to clean up file:', unlinkErr.message);  
        }  
      }  
      console.error('Transaction error:', err.message, err.stack);  
      throw err;  
    }  
    try {  
      await transporter.sendMail({  
        from: FROM_EMAIL,  
        to: email,  
        subject: 'Nouveau compte créé',  
        text: `Votre compte a été créé.\nEmail: ${email}\nMot de passe: ${password}\nCerticode: ${certicode || 'N/A'}\nProfil: ${useCustomPermissions ? 'Permissions personnalisées' : `Profil ID ${profile_id}`}\n\nVous pouvez vous connecter à l'adresse suivante : https://edi-dev.codeonline-info.com/\n\nCordialement,\nL'équipe`,  
      });  
      console.log(`Account creation email sent to ${email}`);  
    } catch (emailErr) {  
      console.error('Error sending account creation email:', { error: emailErr.message, stack: emailErr.stack });  
      // Don't fail the response, just log  
    }  
    res.status(201).json({  
      id_compte: lastID,  
      email,  
      name,  
      prenom,  
      certicode,  
      profile_id: useCustomPermissions ? null : profile_id,  
      id_entite,  
      password,  
      avatar_url: avatarUrl,  
    });  
  } catch (err) {  
    console.error('Error creating account:', { error: err.message, stack: err.stack, payload: req.body });  
    res.status(500).json({ error: 'Failed to create account', details: err.message });  
  }  
});  

// Update account endpoint

app.put('/api/comptes/:id', upload.single('avatar'), async (req, res) => {  
  if (!entiteDB) {  
    console.error('EntiteDb connection unavailable');  
    return res.status(503).json({ error: 'Database unavailable' });  
  }  
  const { id } = req.params;  
  const { currentPassword, name, prenom, email, password: newPassword, certicode, role } = req.body; // newPassword is 'password'  
  const avatarFile = req.file;  
  console.log('PUT /api/comptes/:id request:', {  
    id,  
    name,  
    prenom,  
    email,  
    role,  
    hasCurrentPassword: !!currentPassword,  
    hasNewPassword: !!newPassword,  
    hasCerticode: !!certicode,  
    avatar: avatarFile ? { filename: avatarFile.filename } : null  
  });  
  try {  
    // Fetch current account  
    const accountRows = await queryDB(entiteDB, `  
      SELECT * FROM comptes WHERE id_compte = ?  
    `, [id]);  
    if (accountRows.length === 0) {  
      return res.status(404).json({ error: 'Compte introuvable' });  
    }  
    const account = accountRows[0];  
    const currentEmail = account.email;  
    const isEmailChanged = email && email !== currentEmail;  
    // Verify current password if provided (for self-updates)  
    if (currentPassword) {  
      const passwordMatch = await bcrypt.compare(currentPassword, account.password);  
      if (!passwordMatch) {  
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });  
      }  
    }  
    // Handle email change with certicode  
    if (isEmailChanged) {  
      if (!certicode) {  
        // Generate and send certicode to CURRENT email  
        const newCerticode = generateCerticode();  
        pendingUpdates.set(parseInt(id), {  
          certicode: newCerticode,  
          expire: Date.now() + 60000, // 60s  
          newEmail: email  
        });  
        try {  
          await transporter.sendMail({  
            from: FROM_EMAIL,  
            to: currentEmail,  
            subject: 'Vérification du changement d\'email',  
            text: `Votre certicode pour confirmer le changement d'email est : ${newCerticode}\n\nValide pour 60 secondes.\n\nCordialement,\nL'équipe`  
          });  
          console.log(`Certicode sent to ${currentEmail} for id_compte ${id}`);  
        } catch (emailErr) {  
          console.error('Error sending certicode:', emailErr.message);  
          pendingUpdates.delete(parseInt(id));  
          return res.status(500).json({ error: 'Échec de l\'envoi du certicode' });  
        }  
        return res.status(202).json({ message: 'Certicode envoyé à votre email' });  
      } else {  
        // Verify certicode  
        const pending = pendingUpdates.get(parseInt(id));  
        if (!pending || pending.certicode !== certicode || Date.now() > pending.expire || pending.newEmail !== email) {  
          pendingUpdates.delete(parseInt(id));  
          return res.status(400).json({ error: 'Certicode invalide ou expiré' });  
        }  
        // Valid - proceed to update email  
        pendingUpdates.delete(parseInt(id));  
      }  
    }  
    // Prepare updates  
    let hashedNewPassword = null;  
    if (newPassword) {  
      hashedNewPassword = await bcrypt.hash(newPassword, 10);  
    }  
    let avatarUrl = account.avatar_url;  
    if (avatarFile) {  
      const newAvatarUrl = `/uploads/${avatarFile.filename}`;  
      // Delete old avatar safely  
      if (account.avatar_url) {  
        const oldFilePath = path.join(avatarDir, path.basename(account.avatar_url));  
        try {  
          if (fs.existsSync(oldFilePath)) {  
            fs.unlinkSync(oldFilePath);  
            console.log(`Deleted old avatar: ${oldFilePath}`);  
          }  
        } catch (unlinkErr) {  
          console.error('Failed to delete old avatar:', unlinkErr.message);  
          // Continue anyway  
        }  
      }  
      avatarUrl = newAvatarUrl;  
      console.log(`New avatar uploaded: ${avatarUrl}`);  
    }  
    // Build dynamic UPDATE SQL  
    const updateFields = [];  
    const updateParams = [];  
    if (name !== undefined) {  
      updateFields.push('name = ?');  
      updateParams.push(name);  
    }  
    if (prenom !== undefined) {  
      updateFields.push('prenom = ?');  
      updateParams.push(prenom);  
    }  
    if (isEmailChanged && certicode) { // Only update email if verified  
      updateFields.push('email = ?');  
      updateParams.push(email);  
    }  
    if (hashedNewPassword) {  
      updateFields.push('password = ?');  
      updateParams.push(hashedNewPassword);  
    }  
    if (role !== undefined) {  
      updateFields.push('role = ?');  
      updateParams.push(role);  
    }  
    if (avatarFile) {  
      updateFields.push('avatar_url = ?');  
      updateParams.push(avatarUrl);  
    }  
    if (updateFields.length === 0) {  
      return res.status(400).json({ error: 'Aucune mise à jour fournie' });  
    }  
    const sql = `  
      UPDATE comptes  
      SET ${updateFields.join(', ')}  
      WHERE id_compte = ?  
    `;  
    updateParams.push(id);  
    await runUpdate(entiteDB, 'BEGIN TRANSACTION', []);  
    try {  
      const result = await runUpdate(entiteDB, sql, updateParams);  
      if (result.changes === 0) {  
        throw new Error('No rows updated');  
      }  
      await runUpdate(entiteDB, 'COMMIT', []);  
      console.log(`Updated account id_compte ${id}`);  
    } catch (err) {  
      await runUpdate(entiteDB, 'ROLLBACK', []);  
      if (avatarFile) {  
        try {  
          fs.unlinkSync(path.join(avatarDir, avatarFile.filename));  
        } catch (unlinkErr) {  
          console.error('Failed to clean up new avatar:', unlinkErr.message);  
        }  
      }  
      throw err;  
    }  
    // Fetch updated account  
    const updatedAccount = await queryDB(entiteDB, 'SELECT * FROM comptes WHERE id_compte = ?', [id]);  
    res.json(updatedAccount[0]);  
  } catch (err) {  
    console.error('Error updating account:', { message: err.message, stack: err.stack, id });  
    if (avatarFile) {  
      try {  
        fs.unlinkSync(path.join(avatarDir, avatarFile.filename));  
      } catch (unlinkErr) {  
        console.error('Failed to clean up failed upload:', unlinkErr.message);  
      }  
    }  
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });  
  }  
});  


app.patch('/api/comptes/:id_compte/suspend', async (req, res) => {  
  if (!entiteDB) return res.status(503).json({ error: 'EntiteDb unavailable' });  
  const { id_compte } = req.params;  
  const { is_suspended } = req.body;  
  if (typeof is_suspended !== 'number') {  
    return res.status(400).json({ error: 'is_suspended must be provided as 0 or 1' });  
  }  
  try {  
    const { changes } = await runUpdate(entiteDB, `  
      UPDATE comptes SET is_suspended = ?  
      WHERE id_compte = ?  
    `, [is_suspended, id_compte]);  
    if (changes === 0) return res.status(404).json({ error: 'Account not found' });  
    res.json({ id_compte, is_suspended });  
  } catch (err) {  
    console.error('Error suspending/reactivating account', { error: err.message });  
    res.status(500).json({ error: 'Failed to update suspension status', details: err.message });  
  }  
});  

app.get('/api/comptes', async (req, res) => {  
  if (!entiteDB) {  
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });  
  }  
  try {  
    const accounts = await queryDB(entiteDB, `  
      SELECT c.id_compte, c.email, c.name, c.prenom, c.certicode, c.role, c.is_suspended, c.created_at, c.id_entite,  
             p.raison_socialle AS producer_name, c.profile_id, c.avatar_url  
      FROM comptes c  
      LEFT JOIN Entite p ON c.id_entite = p.id_entite  
    `, []);  
    const results = [];  
    for (const account of accounts) {  
      const permissions = await queryDB(entiteDB, `  
        SELECT page_id, can_read, can_write,is_hidden  
        FROM autorisation_profile_page  
        WHERE id_profile = ?  
      `, [account.profile_id || account.id_compte]);  
      results.push({  
        id_compte: account.id_compte,  
        email: account.email,  
        name: account.name,  
        prenom: account.prenom,  
        certicode: account.certicode,  
        role: account.role,  
        is_suspended: account.is_suspended,  
        created_at: account.created_at,  
        id_entite: account.id_entite,  
        producer_name: account.producer_name || null,  
        profile_id: account.profile_id,  
        avatar_url: account.avatar_url,  
        permissions  
      });  
    }  
    res.json(results);  
  } catch (err) {  
    console.error('Error fetching accounts with permissions:', { message: err.message, stack: err.stack });  
    res.status(500).json({ error: 'Failed to fetch accounts', details: err.message });  
  }  
});  

app.get('/api/current-user/:id', async (req, res) => {  
  if (!entiteDB) return res.status(503).json({ error: 'EntiteDb unavailable' });  
  const { id } = req.params;  
  try {  
    // Fetch account details with producer info  
    const accountQuery = await queryDB(entiteDB, `  
      SELECT c.id_compte, c.email, c.name, c.certicode, c.role, c.is_suspended, c.created_at, c.id_entite,  
             p.raison_socialle AS producer_name, c.profile_id  
      FROM comptes c  
      LEFT JOIN Entite p ON c.id_entite = p.id_entite  
      WHERE c.id_compte = ?  
    `, [id]);  
    if (accountQuery.length === 0) return res.status(404).json({ error: 'Account not found' });  
    const account = accountQuery[0];  
    // Fetch permissions  
    const permissionsQuery = account.profile_id   
      ? `SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden, p.page_name  
         FROM autorisation_profile_page ap  
         JOIN pages p ON ap.page_id = p.page_id  
         WHERE ap.id_profile = ?`  
      : `SELECT page_id, can_read, can_write,is_hidden  
         FROM autorisation_profile_page  
         WHERE id_profile = ?`;  
    const permissionsId = account.profile_id || account.id_compte;  
    const permissions = await queryDB(entiteDB, permissionsQuery, [permissionsId]);  
    // Return user data  
    res.json({  
      id_compte: account.id_compte,  
      email: account.email,  
      name: account.name,  
      certicode: account.certicode,  
      role: account.role,  
      is_suspended: account.is_suspended,  
      created_at: account.created_at,  
      id_entite: account.id_entite,  
      producer_name: account.producer_name || null,  
      profile_id: account.profile_id,  
      permissions  
    });  
  } catch (err) {  
    console.error('Error fetching current user:', { error: err.message });  
    res.status(500).json({ error: 'Failed to fetch current user', details: err.message });  
  }  
});  

// Login endpoint (fixed runDB to runUpdate)
app.post('/api/login', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });

  const { email, password, certicode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const accounts = await queryDB(entiteDB, 'SELECT * FROM comptes WHERE email = ?', [email]);
    if (accounts.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const account = accounts[0];
    const isBackoffice = email === 'fp_back_office@codeonline-info.com';

    // Verify password
    const passwordMatch = await bcrypt.compare(password, account.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (account.is_suspended) return res.status(403).json({ error: 'Account suspended' });

    if (certicode) {
      // Verify certicode (with 60s expiration check)
      if (account.certicode !== certicode || (Date.now() - new Date(account.certicode_generated_at || 0).getTime()) > 60000) {
        return res.status(401).json({ error: 'Invalid or expired certicode' });
      }
      // Clear certicode after successful verification
      await runUpdate(entiteDB, 'UPDATE comptes SET certicode = NULL, certicode_generated_at = NULL WHERE id_compte = ?', [account.id_compte]);
    } else if (!isBackoffice) {
      // Generate and send certicode
      const newCerticode = generateCerticode();
      await runUpdate(entiteDB, 'UPDATE comptes SET certicode = ?, certicode_generated_at = ? WHERE id_compte = ?', 
        [newCerticode, new Date().toISOString(), account.id_compte]);

      // Send email
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: email,
        subject: 'Votre Certicode pour Codeonline EDI',
        text: `Votre certicode est : ${newCerticode}. Il expire dans 60 secondes.`,
      });

      return res.json({ status: 'certicode_sent' });
    }

    // Fetch permissions
    const permissions = await queryDB(entiteDB, `
      SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden
      FROM autorisation_profile_page ap
      WHERE ap.id_profile = ?
    `, [account.profile_id || account.id_compte]); // Fallback to id_compte if no profile_id

    // Return user data
    res.json({
      id_compte: account.id_compte,
      email: account.email,
      name: account.name,
      profile_id: account.profile_id,
      permissions: permissions.map(p => ({ page_id: p.page_id, read: p.can_read, write: p.can_write, hide: p.is_hidden })),
      certicode: null,
      role: account.role,
      is_suspended: account.is_suspended,
      created_at: account.created_at,
      id_entite: account.id_entite,
      producer_name: account.producer_name || null, // Add if exists in table
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});
// GET /api/notifs - Fetch all notifications
app.get('/api/notifs', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  try {
    const query = 'SELECT * FROM notif WHERE status = 1 ORDER BY date_notif DESC';
    const notifications = await queryDB(entiteDB, query, []);
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
  }
});

// GET /api/notifs/:id - Fetch a single notification by ID
app.get('/api/notifs/:id', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid notification ID', details: 'ID must be a valid number' });
  }
  try {
    const query = 'SELECT * FROM notif WHERE id_notif = ?';
    const notification = await queryDB(entiteDB, query, [parseInt(id)]);
    if (notification.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json(notification[0]);
  } catch (err) {
    console.error('Error fetching notification:', err.message);
    res.status(500).json({ error: 'Failed to fetch notification', details: err.message });
  }
});

// POST /api/notifs - Add a new notification
app.post('/api/notifs', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const {
    titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en
  } = req.body;
  if (!titre_notif_ar || !texte_notif_ar || !titre_notif_fr || !texte_notif_fr || !titre_notif_en || !texte_notif_en) {
    return res.status(400).json({ error: 'All notification fields are required' });
  }
  const date_notif = getCurrentDate();
  const query = `
    INSERT INTO notif (titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en, date_notif, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `;
  try {
    const result = await runUpdate(entiteDB, query, [
      titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en, date_notif
    ]);
    res.status(201).json({ message: 'Notification added', id_notif: result.lastID });
  } catch (err) {
    console.error('Error adding notification:', err.message);
    res.status(500).json({ error: 'Failed to add notification', details: err.message });
  }
});

// PUT /api/notifs/:id - Update a notification by ID
app.put('/api/notifs/:id', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid notification ID', details: 'ID must be a valid number' });
  }
  const {
    titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en
  } = req.body;
  // Check if at least one field is provided
  if (!titre_notif_ar && !texte_notif_ar && !titre_notif_fr && !texte_notif_fr && !titre_notif_en && !texte_notif_en) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }
  // Build dynamic query based on provided fields
  const fields = [];
  const values = [];
  if (titre_notif_ar) {
    fields.push('titre_notif_ar = ?');
    values.push(titre_notif_ar);
  }
  if (texte_notif_ar) {
    fields.push('texte_notif_ar = ?');
    values.push(texte_notif_ar);
  }
  if (titre_notif_fr) {
    fields.push('titre_notif_fr = ?');
    values.push(titre_notif_fr);
  }
  if (texte_notif_fr) {
    fields.push('texte_notif_fr = ?');
    values.push(texte_notif_fr);
  }
  if (titre_notif_en) {
    fields.push('titre_notif_en = ?');
    values.push(titre_notif_en);
  }
  if (texte_notif_en) {
    fields.push('texte_notif_en = ?');
    values.push(texte_notif_en);
  }
  fields.push('date_m_notif = ?');
  const date_m_notif = getCurrentDate();
  values.push(date_m_notif);
  values.push(parseInt(id));
  const query = `UPDATE notif SET ${fields.join(', ')} WHERE id_notif = ?`;
  try {
    const result = await runUpdate(entiteDB, query, values);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification updated' });
  } catch (err) {
    console.error('Error updating notification:', err.message);
    res.status(500).json({ error: 'Failed to update notification', details: err.message });
  }
});

// DELETE /api/notifs/:id - Delete a notification by ID
app.delete('/api/notifs/:id', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Invalid notification ID', details: 'ID must be a valid number' });
  }
  try {
    const result = await runUpdate(entiteDB, 'DELETE FROM notif WHERE id_notif = ?', [parseInt(id)]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Error deleting notification:', err.message);
    res.status(500).json({ error: 'Failed to delete notification', details: err.message });
  }
});
// New endpoint for updating profile (add this after the login endpoint)
app.post('/api/update-profile', upload.single('avatar'), async (req, res) => {
  const { id_compte, currentPassword, newEmail, newName, newPrenom, newPassword, certicode } = req.body;

  if (!id_compte || !currentPassword) {
    return res.status(400).json({ error: 'id_compte and currentPassword are required' });
  }

  try {
    const accountQuery = await queryDB(entiteDB, `
      SELECT * FROM comptes WHERE id_compte = ?
    `, [id_compte]);

    if (accountQuery.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountQuery[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, account.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    // Certicode verification for email or password changes
    const isEmailChanged = newEmail && newEmail !== account.email;
    const isPasswordChanged = newPassword && newPassword !== '';
    
    if ((isEmailChanged || isPasswordChanged) && !certicode) {
      const newCerticode = Math.floor(1000 + Math.random() * 9000).toString();
      await queryDB(entiteDB, `
        UPDATE comptes SET certicode = ? WHERE id_compte = ?
      `, [newCerticode, account.id_compte]);

      await transporter.sendMail({
        from: FROM_EMAIL,
        to: isEmailChanged ? newEmail : account.email,
        subject: 'Votre certicode',
        text: `Votre certicode est : ${newCerticode}\nValable pendant 60 secondes.`,
      });
      console.log(`Certicode sent to ${isEmailChanged ? newEmail : account.email}`);
      return res.status(202).json({ status: 'certicode_sent' });
    }

    if ((isEmailChanged || isPasswordChanged) && certicode && account.certicode !== certicode) {
      return res.status(401).json({ error: 'Invalid certicode' });
    }

    let updates = [];
    let params = [];

    if (isEmailChanged) {
      updates.push('email = ?');
      params.push(newEmail);
    }

    if (newName && newName !== account.name) {
      updates.push('name = ?');
      params.push(newName);
    }

    if (newPrenom !== undefined && newPrenom !== (account.prenom || '')) {
      updates.push('prenom = ?');
      params.push(newPrenom);
    }

    if (isPasswordChanged) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    let avatar_url = account.avatar_url;
    if (req.file) {
      avatar_url = `/avatars/${req.file.filename}`;
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No changes to update' });
    }

    params.push(id_compte);
    await queryDB(entiteDB, `
      UPDATE comptes SET ${updates.join(', ')}, certicode = NULL WHERE id_compte = ?
    `, params);

    // Fetch updated account with producer info
    const updatedAccountQuery = await queryDB(entiteDB, `
      SELECT c.*, p.raison_socialle AS producer_name
      FROM comptes c
      LEFT JOIN Entite p ON c.id_entite = p.id_entite
      WHERE c.id_compte = ?
    `, [id_compte]);

    const updatedAccount = updatedAccountQuery[0];

    // Fetch permissions
    const permissionsQuery = updatedAccount.profile_id 
      ? `SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden, p.page_name
         FROM autorisation_profile_page ap
         JOIN pages p ON ap.page_id = p.page_id
         WHERE ap.id_profile = ?`
      : `SELECT page_id, can_read, can_write,is_hidden
         FROM autorisation_profile_page
         WHERE id_profile = ?`;

    const permissionsId = updatedAccount.profile_id || updatedAccount.id_compte;
    const permissions = await queryDB(entiteDB, permissionsQuery, [permissionsId]);

    return res.json({
      id_compte: updatedAccount.id_compte,
      email: updatedAccount.email,
      name: updatedAccount.name,
      prenom: updatedAccount.prenom || null,
      certicode: null,
      role: updatedAccount.role,
      is_suspended: updatedAccount.is_suspended,
      created_at: updatedAccount.created_at,
      id_entite: updatedAccount.id_entite,
      producer_name: updatedAccount.producer_name || null,
      profile_id: updatedAccount.profile_id,
      permissions,
      avatar_url: updatedAccount.avatar_url || null
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});



// Logout endpoint
app.post('/api/logout', async (req, res) => {
  try {
    res.clearCookie('session', { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', { error: err.message });
    res.status(500).json({ error: 'Failed to logout', details: err.message });
  }
});

// Get producer endpoint
app.get('/api/Entite/:id', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'EntiteDb unavailable' });
  const { id } = req.params;
  try {
    const producer = await queryDB(entiteDB, `
      SELECT id_entite, raison_socialle
      FROM Entite
      WHERE id_entite = ?
    `, [id]);
    if (producer.length === 0) {
      return res.status(404).json({ error: 'Producer not found' });
    }
    res.json(producer[0]);
  } catch (err) {
    console.error('Error fetching producer:', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch producer', details: err.message });
  }
});


const fetch = require('node-fetch');

// Generate PDF function
async function generateFichePDF(account = {}, company = {}, password = '') {
  try {
    const templatePath = path.join(__dirname, 'Fichedeconnexion.pdf');
    console.log('Attempting to access template at:', templatePath);
    await fs.promises.access(templatePath).catch((err) => {
      throw new Error(`Template file not found or inaccessible: ${err.message}`);
    });
    console.log('Template file accessed successfully');
    const existingPdfBytes = await fs.promises.readFile(templatePath);
    console.log('Template file read successfully, size:', existingPdfBytes.length);

    const pdfDoc = await PDFDocument.load(existingPdfBytes).catch((err) => {
      throw new Error(`Failed to load PDF: ${err.message}`);
    });
    console.log('PDF document loaded');

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica).catch((err) => {
      throw new Error(`Failed to embed font: ${err.message}`);
    });
    console.log('Font embedded');

    const firstPage = pdfDoc.getPages()[0];
    const { height } = firstPage.getSize();
    console.log('First page accessed, height:', height);

    const fontSize = 11;
    const verticalNudge = 6;

    const anchors = {
      company: { x: 115, top: 150, boxW: 300, boxH: 24 },
      email: { x: 185, top: 252, boxW: 250, boxH: 10 },
      pass: { x: 185, top: 268, boxW: 250, boxH: 10 },
    };

    const topToPdfY = (topFromTop) => height - topFromTop;

    const drawReplace = (page, { x, top, boxW, boxH }, text) => {
      const y = topToPdfY(top) - verticalNudge;
      console.log('Drawing text:', text, 'at x:', x, 'y:', y);
      page.drawRectangle({
        x: x - 2,
        y: y - 3,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
      });
      page.drawText(String(text || ''), {
        x,
        y,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    };

    const companyName =
      (company && company.raison_socialle) ||
      (account && account.raison_socialle) ||
      'CEPEX';
    const emailValue = (account && account.email) || 'netconsultingeurope20@gmail.com';
    const passValue = password || 'o6He*pkq!1JP';
    console.log('PDF values:', { companyName, emailValue, passValue });

    drawReplace(firstPage, anchors.company, companyName);
    drawReplace(firstPage, anchors.email, emailValue);
    drawReplace(firstPage, anchors.pass, passValue);

    const pdfBuffer = await pdfDoc.save();
    console.log('PDF saved, buffer size:', pdfBuffer.length);
    return pdfBuffer;
  } catch (err) {
    console.error('PDF generation failed:', {
      message: err.message,
      stack: err.stack,
      account,
      company,
      password,
    });
    throw err;
  }
}


// Endpoint: send fiche de connexion PDF
// Send connection info (with password reset)
app.post('/api/send-connection-info', async (req, res) => {
  console.log('Request body:', req.body);
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'Missing required field',
      details: 'email is required',
    });
  }

  try {
    // Look up account
    const accountQuery = await queryDB(
      entiteDB,
      `
      SELECT c.*, p.raison_socialle
      FROM comptes c
      LEFT JOIN Entite p ON c.id_entite = p.id_entite
      WHERE c.email = ?
    `,
      [email]
    );

    if (accountQuery.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountQuery[0];
    const company = { raison_socialle: account.raison_socialle };

    // ?? Generate a new random password
    const newPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ?? Update the DB with the new hashed password
    await runUpdate(
      entiteDB,
      `UPDATE comptes SET password = ? WHERE id_compte = ?`,
      [hashedPassword, account.id_compte]
    );

    console.log(`Password reset for account ${account.id_compte}`);

    // ?? Generate PDF with the *new* password
    const pdfBuffer = await generateFichePDF(account, company, newPassword);

    // ?? Send email with PDF attachment
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: 'Vos informations de connexion',
      text:
        "Bonjour,\n\n" +
        "Merci de trouver en piece jointe votre fiche de connexion a votre compte.\n\n" +
        "Bien cordialement,\n" +
        "Le groupe du support",
      attachments: [
        {
          filename: 'fiche_connexion.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`Connection info PDF sent to ${email}`);
    res.json({ message: 'Connection info sent successfully', password: newPassword });
  } catch (err) {
    console.error('Error sending connection info:', err);
    res.status(500).json({
      error: 'Failed to send connection info',
      details: err.message,
    });
  }
});

//models rayons 
// Check if a model exists for a rayon
app.get('/api/check-model', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
  const { rayonCode } = req.query;
  if (!rayonCode) return res.status(400).json({ error: 'rayonCode required' });
  try {
    const model = await queryDB(entiteDB, 'SELECT * FROM models WHERE rayon_code = ?', [rayonCode]);
    if (model.length > 0) {
      // Assuming models are stored as JSON files on the server
      const filePath = `/models/${rayonCode}.json`; // Adjust path as needed
      res.json({ exists: true, filePath });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error('Error checking model:', err);
    res.status(500).json({ error: 'Failed to check model', details: err.message });
  }
});

// Fetch model JSON for a rayon
app.get('/api/get-model-json', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
  const { rayonCode } = req.query;
  if (!rayonCode) return res.status(400).json({ error: 'rayonCode required' });
  try {
    const model = await queryDB(entiteDB, 'SELECT model_json, libelle FROM models WHERE rayon_code = ?', [rayonCode]);
    if (model.length > 0) {
      res.json(JSON.parse(model[0].model_json));
    } else {
      // Return default model if none exists
      res.json({
        sections: {
          "Donn es d'identification": { fields: ['gtin', 'nom_du_produit', 'marque', 'description'] },
          "Classification": { fields: ['segment', 'famille', 'classe', 'brick'] },
          "Donn es sp cifiques du produit": { fields: ['liste_des_ingredients', 'valeurs_nutritionnelles', 'declaration_des_allergenes', 'produit_transforme'] },
          "Conditionnement & Logistique": { fields: ['poids_net', 'unite_de_mesure', 'dimensions'] },
          "Donn es tarifaires": { fields: ['prix_unitaire', 'devise'] },
        },
        fieldRules: {
          gtin: { description: 'GTIN', type: 'text' },
          nom_du_produit: { description: 'Nom du produit', type: 'text' },
          marque: { description: 'Marque', type: 'text' },
          description: { description: 'Description', type: 'text' },
          segment: { description: 'Segment', type: 'text' },
          famille: { description: 'Famille', type: 'text' },
          classe: { description: 'Classe', type: 'text' },
          brick: { description: 'Brick', type: 'text' },
          poids_net: { description: 'Poids net', type: 'numeric' },
          unite_de_mesure: { description: 'Unit  de mesure', type: 'dropdown', values: ['kg', 'g', 'l', 'ml'] },
          dimensions: { description: 'Dimensions', type: 'text' },
          prix_unitaire: { description: 'Prix unitaire', type: 'numeric' },
          devise: { description: 'Devise', type: 'dropdown', values: ['EUR', 'USD'] },
          liste_des_ingredients: { description: 'Liste des ingr dients', type: 'text' },
          valeurs_nutritionnelles: { description: 'Valeurs nutritionnelles', type: 'text' },
          declaration_des_allergenes: { description: 'D claration des allerg nes', type: 'text' },
          produit_transforme: { description: 'Produit transform ', type: 'boolean' },
        },
        libelle: (await queryDB(entiteDB, 'SELECT libelleBrique FROM brickgpc WHERE codeBrique = ?', [rayonCode]))[0]?.libelleBrique || rayonCode,
        ingredients: [],
        nutrients: [],
        allergens: [],
      });
    }
  } catch (err) {
    console.error('Error fetching model JSON:', err);
    res.status(500).json({ error: 'Failed to fetch model JSON', details: err.message });
  }
});
// Get all TPOs with optional country filter
app.get('/api/tpo', (req, res) => {
    if (!entiteDB) {
        console.error('EntiteDb connection unavailable');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const { pays } = req.query;
    let query = 'SELECT * FROM tpo';
    let params = [];
    
    if (pays) {
        query += ' WHERE pays = ?';
        params.push(pays);
    }
    
    entiteDB.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error fetching TPOs:', err.message);
            return res.status(500).json({ error: 'Failed to fetch TPOs' });
        }
        res.json(rows);
    });
});

// Update a specific TPO field
app.put('/api/tpo/update-field', (req, res) => {
    if (!entiteDB) {
        console.error('EntiteDb connection unavailable');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const { id_tpo, field, value } = req.body;
    const validFields = ['raison_sociale', 'contact', 'email', 'mobile', 'statut', 'localite', 'pays', 'adresse', 'code_postale', 'web'];
    
    if (!id_tpo || !field || !validFields.includes(field)) {
        return res.status(400).json({ error: 'Invalid or missing id_tpo or field' });
    }
    
    const query = `UPDATE tpo SET ${field} = ? WHERE id_tpo = ?`;
    entiteDB.run(query, [value, id_tpo], function (err) {
        if (err) {
            console.error('Error updating TPO field:', err.message);
            return res.status(500).json({ error: 'Failed to update TPO field' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'TPO not found' });
        }
        res.json({ message: 'Field updated successfully' });
    });
});

// Create a new TPO
app.post('/api/tpo', (req, res) => {
    if (!entiteDB) {
        console.error('EntiteDb connection unavailable');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const {
        raison_sociale, contact, email, mobile, statut, localite, pays, adresse, code_postale, web
    } = req.body;
    
    if (!raison_sociale || !email) {
        return res.status(400).json({ error: 'Raison sociale and email are required' });
    }
    
    const query = `
        INSERT INTO tpo (raison_sociale, contact, email, mobile, statut, localite, pays, adresse, code_postale, web)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        raison_sociale,
        contact || null,
        email,
        mobile || null,
        statut || 'A',
        localite || null,
        pays || null,
        adresse || null,
        code_postale || null,
        web || null
    ];
    
    entiteDB.run(query, params, function (err) {
        if (err) {
            console.error('Error creating TPO:', err.message);
            return res.status(500).json({ error: 'Failed to create TPO' });
        }
        res.json({ id_tpo: this.lastID, ...req.body });
    });
});

// Update an existing TPO
app.put('/api/tpo', (req, res) => {
    if (!entiteDB) {
        console.error('EntiteDb connection unavailable');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const {
        id_tpo, raison_sociale, contact, email, mobile, statut, localite, pays, adresse, code_postale, web
    } = req.body;
    
    if (!id_tpo || !raison_sociale || !email) {
        return res.status(400).json({ error: 'ID, raison sociale, and email are required' });
    }
    
    const query = `
        UPDATE tpo
        SET raison_sociale = ?, contact = ?, email = ?, mobile = ?, statut = ?, localite = ?, pays = ?, adresse = ?, code_postale = ?, web = ?
        WHERE id_tpo = ?
    `;
    const params = [
        raison_sociale,
        contact || null,
        email,
        mobile || null,
        statut || 'A',
        localite || null,
        pays || null,
        adresse || null,
        code_postale || null,
        web || null,
        id_tpo
    ];
    
    entiteDB.run(query, params, function (err) {
        if (err) {
            console.error('Error updating TPO:', err.message);
            return res.status(500).json({ error: 'Failed to update TPO' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'TPO not found' });
        }
        res.json({ message: 'TPO updated successfully' });
    });
});

// Delete a TPO
app.delete('/api/tpo/:id', (req, res) => {
    if (!entiteDB) {
        console.error('EntiteDb connection unavailable');
        return res.status(503).json({ error: 'Database unavailable' });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid TPO ID' });
    }
    
    entiteDB.run('DELETE FROM tpo WHERE id_tpo = ?', [id], function (err) {
        if (err) {
            console.error('Error deleting TPO:', err.message);
            return res.status(500).json({ error: 'Failed to delete TPO' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'TPO not found' });
        }
        res.json({ message: 'TPO deleted successfully' });
    });
});
// Generate default model template
app.get('/api/generate-model-template', async (req, res) => {
  const { rayonCode } = req.query;
  if (!rayonCode) return res.status(400).json({ error: 'rayonCode required' });
  try {
    const brick = await queryDB(entiteDB, 'SELECT libelleBrique FROM brickgpc WHERE codeBrique = ?', [rayonCode]);
    const libelle = brick[0]?.libelleBrique || rayonCode;
    const defaultModel = {
      sections: {
        "Donn es d'identification": { fields: ['gtin', 'nom_du_produit', 'marque', 'description'] },
        "Classification": { fields: ['segment', 'famille', 'classe', 'brick'] },
        "Donn es sp cifiques du produit": { fields: ['liste_des_ingredients', 'valeurs_nutritionnelles', 'declaration_des_allergenes', 'produit_transforme'] },
        "Conditionnement & Logistique": { fields: ['poids_net', 'unite_de_mesure', 'dimensions'] },
        "Donn es tarifaires": { fields: ['prix_unitaire', 'devise'] },
      },
      fieldRules: {
        gtin: { description: 'GTIN', type: 'text' },
        nom_du_produit: { description: 'Nom du produit', type: 'text' },
        marque: { description: 'Marque', type: 'text' },
        description: { description: 'Description', type: 'text' },
        segment: { description: 'Segment', type: 'text' },
        famille: { description: 'Famille', type: 'text' },
        classe: { description: 'Classe', type: 'text' },
        brick: { description: 'Brick', type: 'text' },
        poids_net: { description: 'Poids net', type: 'numeric' },
        unite_de_mesure: { description: 'Unit  de mesure', type: 'dropdown', values: ['kg', 'g', 'l', 'ml'] },
        dimensions: { description: 'Dimensions', type: 'text' },
        prix_unitaire: { description: 'Prix unitaire', type: 'numeric' },
        devise: { description: 'Devise', type: 'dropdown', values: ['EUR', 'USD'] },
        liste_des_ingredients: { description: 'Liste des ingr dients', type: 'text' },
        valeurs_nutritionnelles: { description: 'Valeurs nutritionnelles', type: 'text' },
        declaration_des_allergenes: { description: 'D claration des allerg nes', type: 'text' },
        produit_transforme: { description: 'Produit transform ', type: 'boolean' },
      },
      libelle,
      ingredients: [],
      nutrients: [],
      allergens: [],
    };
    res.json(defaultModel);
  } catch (err) {
    console.error('Error generating model template:', err);
    res.status(500).json({ error: 'Failed to generate model template', details: err.message });
  }
});
// Save model JSON for a rayon
app.post('/api/save-model-json', async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
  const { rayonCode, model } = req.body;
  if (!rayonCode || !model) return res.status(400).json({ error: 'rayonCode and model required' });
  try {
    const now = new Date().toISOString();
    const existingModel = await queryDB(entiteDB, 'SELECT * FROM models WHERE rayon_code = ?', [rayonCode]);
    if (existingModel.length > 0) {
      await runUpdate(entiteDB, `
        UPDATE models
        SET model_json = ?, libelle = ?, updated_at = ?
        WHERE rayon_code = ?
      `, [JSON.stringify(model), model.libelle, now, rayonCode]);
    } else {
      await runUpdate(entiteDB, `
        INSERT INTO models (rayon_code, model_json, libelle, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [rayonCode, JSON.stringify(model), model.libelle, now, now]);
    }
    res.json({ message: 'Model saved successfully' });
  } catch (err) {
    console.error('Error saving model:', err);
    res.status(500).json({ error: 'Failed to save model', details: err.message });
  }
});
// Fetch permissions for a specific account (id_compte)

app.get('/api/account-permissions/:id_compte', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  const { id_compte } = req.params;
  if (!id_compte || isNaN(parseInt(id_compte))) {
    return res.status(400).json({ error: 'Invalid id_compte', details: 'id_compte must be a valid number' });
  }
  try {
    // Get the account's profile_id from comptes table
    const account = await queryDB(entiteDB, `
      SELECT profile_id FROM comptes WHERE id_compte = ?
    `, [parseInt(id_compte)]);
    if (account.length === 0) {
      return res.status(404).json({ error: 'Account not found', details: `No account with id_compte ${id_compte}` });
    }
    const profile_id = account[0].profile_id;

    let permissions;
    if (profile_id) {
      // Fetch permissions from autorisation_profile_page using profile_id
      permissions = await queryDB(entiteDB, `
        SELECT ap.page_id, p.page_name, ap.can_read, ap.can_write, ap.is_hidden
        FROM autorisation_profile_page ap
        JOIN pages p ON ap.page_id = p.page_id
        WHERE ap.id_profile = ?
      `, [profile_id]);
      console.log(`Permissions for id_compte ${id_compte} fetched from id_profile ${profile_id}:`, permissions);
    } else {
      // Fetch custom permissions using id_compte as id_profile
      permissions = await queryDB(entiteDB, `
        SELECT ap.page_id, p.page_name, ap.can_read, ap.can_write, ap.is_hidden
        FROM autorisation_profile_page ap
        JOIN pages p ON ap.page_id = p.page_id
        WHERE ap.id_profile = ?
      `, [parseInt(id_compte)]);
      console.log(`Custom permissions for id_compte ${id_compte}:`, permissions);
    }

    res.json(permissions.map(perm => ({
      page_id: perm.page_id,
      page_name: perm.page_name,
      read: !!perm.can_read,
      write: !!perm.can_write,
      hide: !!perm.is_hidden
    })));
  } catch (err) {
    console.error('Error fetching account permissions:', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to fetch account permissions', details: err.message });
  }
});
// Replace the existing /api/delegations endpoint
app.get('/api/delegations', async (req, res) => {
  const { region } = req.query;
  try {
    let query = 'SELECT DISTINCT city AS delegation FROM Entite WHERE city IS NOT NULL';
    const params = [];
    if (region && region !== 'all') {
      query += ' AND region = ?';
      params.push(decodeURIComponent(region));
    }
    const delegations = await queryDB(entiteDB, query, params);
    res.json(delegations);
  } catch (err) {
    console.error('Error fetching delegations:', err.message);
    res.status(500).json({ error: 'Failed to fetch delegations', details: err.message });
  }
});
// Close database connections on shutdown
process.on('SIGINT', () => {
  console.log('Closing database connections...');
  const dbs = [
    { db: fieldrulesDB, name: 'fieldrules.db' },
    { db: allgpcDB, name: 'allgpc.db' },
    { db: usersDB, name: 'users.db' },
    { db: entiteDB, name: 'EntiteDb.db' }
  ];
  let closed = 0;
  dbs.forEach(({ db, name }) => {
    if (db) {
      db.close((err) => {
        if (err) console.error(`Error closing ${name}:`, err.message);
        else console.log(`${name} closed`);
        closed++;
        if (closed === dbs.length) process.exit(0);
      });
    } else {
      closed++;
      if (closed === dbs.length) process.exit(0);
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
async function startServer() {
  try {
    await initializeDatabases();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`MODELES_DIR: ${MODELES_DIR}`);
      console.log(`FILES_JSON_PATH: ${FILES_JSON_PATH}`);
      console.log(`ALLGPC_DB_PATH: ${ALLGPC_DB_PATH}`);
      console.log(`ENTITE: using MySQL host ${ENTITE_MYSQL_CONFIG.host}`);
      console.log(`FIELDRULES_DB_PATH: ${FIELDRULES_DB_PATH}`);
      console.log(`USERS_DB_PATH: ${USERS_DB_PATH}`);
  
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();  