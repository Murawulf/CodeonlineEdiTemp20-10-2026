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
const ExcelJS = require('exceljs');
const API_PIN = '3311'; // Your secret PIN
const EANCOM_BASE_DIR = process.env.EANCOM_BASE_DIR || "/var/www/formation/ecomfournisseur";
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

// ======================================
//  CARACTÉRISTIQUES IMAGE UPLOADER (CJS VERSION)
// ======================================

// Directory for caracteristiques images
const CARAC_DIR = "/var/www/caracteristiques/images";

// Ensure directory exists
if (!fs.existsSync(CARAC_DIR)) {
  fs.mkdirSync(CARAC_DIR, { recursive: true });
}

const storageCaracteristique = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, CARAC_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext; // since you already require crypto
    cb(null, uniqueName);
  }
});

const caracteristiqueUpload = multer({
  storage: storageCaracteristique,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Invalid file type (jpg/png/webp only)"));
    }
    cb(null, true);
  }
});
const GED_DIR = '/var/www/codeonline-fp/images/public/ged';
if (!fs.existsSync(GED_DIR)) {
  fs.mkdirSync(GED_DIR, { recursive: true });
  console.log('?? GED directory created:', GED_DIR);
} else {
  console.log('?? GED directory ready:', GED_DIR);
}



// Ensure GED_DIR exists
function safeFileName(originalName) {
  return originalName
    .replace(/\s+/g, '_')          // replace spaces with underscores
    .replace(/[^\w.\-]/g, '')      // remove weird characters
    .toLowerCase();
}



// Multer Storage Configuration (using your original gedStorage)
// Multer Storage Configuration

// --- Storage configuration ---
const gedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, GED_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = safeFileName(file.originalname);
    cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeOriginal}`);
  }
});
// --- Universal file filter (images, docs, audio, video, zip, etc.) ---
const uploadGed = multer({
  storage: gedStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Archives
      'application/zip', 'application/x-rar-compressed',
      // Audio
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
      // Video
      'video/mp4', 'video/avi', 'video/mpeg', 'video/x-matroska', 'video/quicktime'
    ];

    const allowedExts = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx',
      '.csv', '.ppt', '.pptx', '.zip', '.rar',
      '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mkv', '.mov'
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext})`), false);
    }
  }
});

const productImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRODUCTS_DIR),
  filename: (req, file, cb) => {
    const uniq = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniq}${path.extname(file.originalname)}`);
  },
});
const uploadProducts = multer({
  storage: productImageStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  }
});
/* --------------------------------------------------------------
   B)  PRODUCT IMAGES – /var/www/codeonline-fp/images/products
   -------------------------------------------------------------- */
const PRODUCTS_DIR = '/var/www/codeonline-fp/images/products';
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });



// Helper: safe JSON stringify for log details
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

  // ? Target folder for logo uploads
 const logosDir = '/var/www/codeonline-fp/images/logo_entite';

  try {
    fs.accessSync(logosDir, fs.constants.F_OK);
    console.log('Logo_entite directory already exists:', logosDir);
  } catch (err) {
    fs.mkdirSync(logosDir, { recursive: true });
    console.log('Created logo_entite directory:', logosDir);
  }

// ? Multer storage for company logos
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
      console.error('? Invalid logo type:', file.mimetype);
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  },
});
// Serve logo_entite folder
app.use('/images/logo_entite', express.static('/var/www/codeonline-fp/images/logo_entite'));

app.use(express.static('/var/www/codeonline-fp/images'));
app.use('/images', express.static('/var/www/codeonline-fp/images'));






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
// Universal GED File Filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/avi', 'video/mpeg', 'video/x-matroska', 'video/quicktime',
    'application/zip', 'application/x-rar-compressed'
  ];

  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`File type not allowed: ${file.mimetype}`), false);
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
const avatarDir = '/var/www/codeonline-fp/images/uploads';

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
  console.log('?? Created avatar upload directory:', avatarDir);
} else {
  console.log('? Avatar upload directory exists:', avatarDir);
}

// Make the uploads folder accessible via /uploads URL
app.use('/images/uploads', express.static(avatarDir));
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
  origin: ['https://dev.codeonline-edi.net', 'https://edi-dev.codeonline-info.com'],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-api-pin','x-entite-id'],
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
  console.log("? MySQL pool close suppressed — keeping DB alive");
  if (cb) return cb(null);
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
// Fetch distinct regions from Region_national table
app.get('/api/regions', async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT DISTINCT gouvernorat AS region FROM Region_national WHERE gouvernorat IS NOT NULL');
    await conn.end();
    res.json(rows);
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
  const { region } = req.query;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    let sql = 'SELECT DISTINCT delegation FROM Region_national WHERE delegation IS NOT NULL';
    const params = [];
    if (region && region !== 'all') {
      sql += ' AND gouvernorat = ?';
      params.push(decodeURIComponent(region));
    }
    const [rows] = await conn.query(sql, params);
    await conn.end();
    res.json(rows.map(r => ({ delegation: r.delegation })));
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
  const { name_delegation } = req.body;
  if (!name_delegation) {
    return res.status(400).json({ error: 'name_delegation is required', details: 'Missing required field' });
  }
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(
      'SELECT localite, code_postal FROM Region_national WHERE delegation = ?',
      [name_delegation]
    );
    await conn.end();
    res.json(rows);
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

// ============================================================
// SEGMENTS
// ============================================================
app.get('/api/segments', async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [segments] = await conn.query(`
      SELECT 
        codeSegment AS code,
        libelleSegment AS libelle,
        libelleSegment_e AS libelle_en,
        libelleSegment_a AS libelle_ar,
        status_s AS status
      FROM segmentgpc
      ORDER BY ordre_segment ASC
    `);
    res.json(segments);
  } catch (err) {
    console.error('Error fetching segments:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-segment', async (req, res) => {
  const { codeSegment, libelleSegment, libelleSegment_en, libelleSegment_a } = req.body;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(
      `UPDATE segmentgpc 
       SET libelleSegment=?, libelleSegment_e=?, libelleSegment_a=? 
       WHERE codeSegment=?`,
      [libelleSegment, libelleSegment_en, libelleSegment_a, codeSegment]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating segment:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-segment-status', async (req, res) => {
  const { segments } = req.body; // array of active segment codes
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(`UPDATE segmentgpc SET status_s = 0`);
    if (segments.length > 0) {
      await conn.query(`UPDATE segmentgpc SET status_s = 1 WHERE codeSegment IN (?)`, [segments]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating segment status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FAMILLES
// ============================================================
app.get('/api/familles', async (req, res) => {
  const { codeSegment } = req.query;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [familles] = await conn.query(
      `SELECT 
         codeFamille AS code,
         libelleFamille AS libelle,
         libelleFamille_en AS libelle_en,
         libelleFamille_ar AS libelle_ar,
         status_f AS status
       FROM famillegpc
       WHERE codeSegment = ?
       ORDER BY ordre_famille ASC`,
      [codeSegment]
    );
    res.json(familles);
  } catch (err) {
    console.error('Error fetching familles:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-famille', async (req, res) => {
  const { codeFamille, libelleFamille, libelleFamille_en, libelleFamille_ar } = req.body;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(
      `UPDATE famillegpc 
       SET libelleFamille=?, libelleFamille_en=?, libelleFamille_ar=? 
       WHERE codeFamille=?`,
      [libelleFamille, libelleFamille_en, libelleFamille_ar, codeFamille]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating famille:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-famille-status', async (req, res) => {
  const { familles } = req.body; // array of active famille codes
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(`UPDATE famillegpc SET status_f = 0`);
    if (familles.length > 0) {
      await conn.query(`UPDATE famillegpc SET status_f = 1 WHERE codeFamille IN (?)`, [familles]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating famille status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CLASSES
// ============================================================
// ? GET /api/classes — Return all or filtered by codeFamille
// ============================================================
app.get('/api/classes', async (req, res) => {
  const { codeFamille } = req.query;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    let sql = `
      SELECT 
        codeClasse AS code,
        libelleClasse AS libelle,
        libelleClasse_en AS libelle_en,
        libelleClasse_ar AS libelle_ar,
        status_c AS status
      FROM classegpc
    `;
    const params = [];

    // If a family code is provided, filter by it
    if (codeFamille) {
      sql += ' WHERE codeFamille = ?';
      params.push(codeFamille);
    }

    sql += ' ORDER BY ordre_classe ASC';

    const [rows] = await conn.query(sql, params);
    res.json(rows);
    await conn.end();
  } catch (err) {
    console.error('? Error fetching classes:', err);
    res.status(500).json({ error: 'Failed to fetch classes', details: err.message });
  }
});


app.post('/api/update-classe', async (req, res) => {
  const { codeClasse, libelleClasse, libelleClasse_en, libelleClasse_ar } = req.body;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(
      `UPDATE classegpc 
       SET libelleClasse=?, libelleClasse_en=?, libelleClasse_ar=? 
       WHERE codeClasse=?`,
      [libelleClasse, libelleClasse_en, libelleClasse_ar, codeClasse]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating classe:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-classe-status', async (req, res) => {
  const { classes } = req.body; // array of active classe codes
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(`UPDATE classegpc SET status_c = 0`);
    if (classes.length > 0) {
      await conn.query(`UPDATE classegpc SET status_c = 1 WHERE codeClasse IN (?)`, [classes]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating classe status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// BRICKS
// ============================================================
// ============================================================
app.get('/api/bricks', async (req, res) => {
  const { codeClasse } = req.query;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    let sql = `
      SELECT 
        codeBrique AS code,
        libelleBrique AS libelle,
        libelleBrique_en AS libelle_en,
        libelleBrique_ar AS libelle_ar,
        status_br AS status
      FROM brickgpc
    `;
    const params = [];

    // If a class code is provided, filter by it
    if (codeClasse) {
      sql += ' WHERE codeClasse = ?';
      params.push(codeClasse);
    }

    sql += ' ORDER BY ordre_brique ASC';

    const [rows] = await conn.query(sql, params);
    res.json(rows);
    await conn.end();
  } catch (err) {
    console.error('? Error fetching bricks:', err);
    res.status(500).json({ error: 'Failed to fetch bricks', details: err.message });
  }
});

app.post('/api/update-brick', async (req, res) => {
  const { codeBrique, libelleBrique, libelleBrique_en, libelleBrique_ar } = req.body;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(
      `UPDATE brickgpc 
       SET libelleBrique=?, libelleBrique_en=?, libelleBrique_ar=? 
       WHERE codeBrique=?`,
      [libelleBrique, libelleBrique_en, libelleBrique_ar, codeBrique]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating brick:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-brick-status', async (req, res) => {
  const { bricks } = req.body; // array of active brick codes
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(`UPDATE brickgpc SET status_br = 0`);
    if (bricks.length > 0) {
      await conn.query(`UPDATE brickgpc SET status_br = 1 WHERE codeBrique IN (?)`, [bricks]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating brick status:', err);
    res.status(500).json({ error: err.message });
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
// ==================================================
// ? PROFILES API — MySQL Compatible (Matches Products Style)
// ==================================================
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        p.id_profile, p.id_entite, p.email, p.certicode, p.role, p.is_suspended,
        p.created_at, p.created_by_Entite, e.raison_socialle AS company_name,
        ap.id_autorisation, ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        ap.apercu, ap.upload, ap.delete_file, ap.create_folder, ap.view_content,
        pg.page_name
      FROM profiles p
      LEFT JOIN Entite e ON p.id_entite = e.id_entite
      LEFT JOIN autorisation_profile_page ap ON p.id_profile = ap.id_profile
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE p.id_profile = ?
      ORDER BY p.id_profile DESC;
    `;

    const [rows] = await conn.query(sql, [id]);
    await conn.end();

    if (!rows.length) return res.status(404).json({ error: "Profile not found" });

    const profile = {
      id_profile: rows[0].id_profile,
      id_entite: rows[0].id_entite,
      email: rows[0].email,
      certicode: rows[0].certicode,
      role: rows[0].role,
      is_suspended: !!rows[0].is_suspended,
      created_at: rows[0].created_at,
      created_by_Entite: rows[0].created_by_Entite,
      company_name: rows[0].company_name || null,
      permissions: []
    };

    for (const r of rows) {
      if (r.page_id) {
        profile.permissions.push({
          id_autorisation: r.id_autorisation,
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden,
          apercu: !!r.apercu,
          upload: !!r.upload,
          delete_file: !!r.delete_file,
          create_folder: !!r.create_folder,
          view_content: !!r.view_content
        });
      }
    }

    res.json(profile);
    
  } catch (err) {
    console.error('GET /api/profiles/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});


app.get("/api/profiles", async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        p.id_profile, p.id_entite, p.email, p.certicode, p.role, p.is_suspended,
        p.created_at, p.created_by_Entite, e.raison_socialle AS company_name,
        ap.id_autorisation, ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        ap.apercu, ap.upload, ap.delete_file, ap.create_folder, ap.view_content,
        pg.page_name
      FROM profiles p
      LEFT JOIN Entite e ON p.id_entite = e.id_entite
      LEFT JOIN autorisation_profile_page ap ON p.id_profile = ap.id_profile
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      ORDER BY p.id_profile DESC;
    `;

    const [rows] = await conn.query(sql);
    await conn.end();

    const profiles = {};

    for (const r of rows) {
      if (!profiles[r.id_profile]) {
        profiles[r.id_profile] = {
          id_profile: r.id_profile,
          id_entite: r.id_entite,
          email: r.email,
          certicode: r.certicode,
          role: r.role,
          is_suspended: !!r.is_suspended,
          created_at: r.created_at,
          created_by_Entite: r.created_by_Entite,
          company_name: r.company_name || null,
          permissions: []
        };
      }

      if (r.page_id) {
        profiles[r.id_profile].permissions.push({
          id_autorisation: r.id_autorisation,
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden,
          apercu: !!r.apercu,
          upload: !!r.upload,
          delete_file: !!r.delete_file,
          create_folder: !!r.create_folder,
          view_content: !!r.view_content
        });
      }
    }

    res.json(Object.values(profiles));
  } catch (err) {
    console.error("? /api/profiles error:", err);
    res.status(500).json({ error: "Failed to fetch profiles", details: err.message });
  }
});


// ?? POST /api/profiles — Create new profile
app.post("/api/profiles", async (req, res) => {
  let conn;
  try {
    const { id_entite, role, email, certicode, created_by_Entite, permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ error: "Permissions array missing or invalid" });
    }

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const insertProfileSQL = `
      INSERT INTO profiles (id_entite, email, certicode, role, is_suspended, created_by_Entite)
      VALUES (?, ?, ?, ?, 0, ?)
    `;
    const [profileRes] = await conn.query(insertProfileSQL, [
      id_entite || null, email || null, certicode || null, role || null, created_by_Entite || null
    ]);

    const newProfileId = profileRes.insertId;

    for (const perm of permissions) {
      await conn.query(
        `
        INSERT INTO autorisation_profile_page (
          id_profile, page_id, can_read, can_write, is_hidden,
          apercu, upload, delete_file, create_folder, view_content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          newProfileId,
          perm.page_id,
          perm.read ? 1 : 0,
          perm.write ? 1 : 0,
          perm.hide ? 1 : 0,
          perm.apercu ? 1 : 0,
          perm.upload ? 1 : 0,
          perm.delete_file ? 1 : 0,
          perm.create_folder ? 1 : 0,
          perm.view_content ? 1 : 0
        ]
      );
    }

    await conn.commit();
    await conn.end();

    console.log("? Profile created with ID:", newProfileId);
    res.json({ message: "Profile created successfully", id_profile: newProfileId });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error("? POST /api/profiles error:", err);
    res.status(500).json({ error: "Failed to create profile", details: err.message });
  }
});


// ?? PUT /api/profiles/:id_profile — Update existing profile
app.put("/api/profiles/:id_profile", async (req, res) => {
  let conn;
  try {
    const { id_profile } = req.params;
    const { id_entite, role, email, certicode, permissions } = req.body;

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const updateSQL = `
      UPDATE profiles SET id_entite=?, email=?, certicode=?, role=? WHERE id_profile=?
    `;
    await conn.query(updateSQL, [
      id_entite || null, email || null, certicode || null, role || null, id_profile
    ]);

    await conn.query("DELETE FROM autorisation_profile_page WHERE id_profile=?", [id_profile]);

    for (const perm of permissions || []) {
      await conn.query(
        `
        INSERT INTO autorisation_profile_page (
          id_profile, page_id, can_read, can_write, is_hidden,
          apercu, upload, delete_file, create_folder, view_content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          id_profile,
          perm.page_id,
          perm.read ? 1 : 0,
          perm.write ? 1 : 0,
          perm.hide ? 1 : 0,
          perm.apercu ? 1 : 0,
          perm.upload ? 1 : 0,
          perm.delete_file ? 1 : 0,
          perm.create_folder ? 1 : 0,
          perm.view_content ? 1 : 0
        ]
      );
    }

    await conn.commit();
    await conn.end();

    console.log("? Profile updated:", id_profile);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error("? PUT /api/profiles/:id_profile error:", err);
    res.status(500).json({ error: "Failed to update profile", details: err.message });
  }
});


// ?? PATCH /api/profiles/:id_profile/suspend — Suspend/Unsuspend profile
app.patch("/api/profiles/:id_profile/suspend", async (req, res) => {
  try {
    const { id_profile } = req.params;
    const { is_suspended } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [result] = await conn.query(
      "UPDATE profiles SET is_suspended=? WHERE id_profile=?",
      [is_suspended ? 1 : 0, id_profile]
    );
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: "Profile not found" });

    res.json({ message: `Profile ${is_suspended ? "suspended" : "unsuspended"} successfully` });
  } catch (err) {
    console.error("? PATCH /api/profiles/:id_profile/suspend error:", err);
    res.status(500).json({ error: "Failed to update suspension", details: err.message });
  }
});


// ?? DELETE /api/profiles/:id_profile — Delete profile and its permissions
app.delete("/api/profiles/:id_profile", async (req, res) => {
  let conn;
  try {
    const { id_profile } = req.params;

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    await conn.query("DELETE FROM autorisation_profile_page WHERE id_profile=?", [id_profile]);
    const [result] = await conn.query("DELETE FROM profiles WHERE id_profile=?", [id_profile]);

    await conn.commit();
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: "Profile not found" });

    console.log("??? Profile deleted:", id_profile);
    res.json({ message: "Profile deleted successfully" });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error("? DELETE /api/profiles/:id_profile error:", err);
    res.status(500).json({ error: "Failed to delete profile", details: err.message });
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
//api companies 

//-------------------------------------------------------------
//  FULL FIXED COMPANY API (7 ENDPOINTS)
//  Compatible with Entite.tsx + MySQL schema entitef.sql
//-------------------------------------------------------------

// GET /api/pays
app.get('/api/pays', async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const query = 'SELECT isoNumeric, libelle FROM pays';
    const results = await queryDB(entiteDB, query, []);
    res.json(results);
  } catch (err) {
    console.error('GET /api/pays error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// GET /api/segments
app.get('/api/segments', async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const query = 'SELECT codeSegment as code, libelle FROM segmentgpc WHERE status_s = 1';
    const results = await queryDB(entiteDB, query, []);
    res.json(results);
  } catch (err) {
    console.error('GET /api/segments error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
//-------------------------------------------------------------
//  FULL FIXED COMPANY API (7 ENDPOINTS)
//-------------------------------------------------------------
//  FULL COMPANY API (7 ENDPOINTS) ?
//  Compatible with Entite.tsx + MySQL schema
// Protect /api/companies with a PIN
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


app.get('/api/companies', async (req, res) => {
  try {
    // Check PIN
    const pin = req.headers['x-api-pin'];
    if (pin !== API_PIN) {
      return res.status(403).json({ error: 'Forbidden: Invalid PIN' });
    }

    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });

    const { region, segment, delegation, type } = req.query;
    const params = [];
    const conditions = [];

    if (region && region !== 'all') { conditions.push('p.region = ?'); params.push(region); }
    if (segment && segment !== 'all') { conditions.push('s.codeSegment = ?'); params.push(segment); }
    if (delegation && delegation !== 'all') { conditions.push('p.city = ?'); params.push(delegation); }
    if (type && type !== 'all') { conditions.push('p.type_prod = ?'); params.push(Number(type)); }

    let query = `
      SELECT p.*, GROUP_CONCAT(s.codeSegment) AS segments
      FROM Entite p
      LEFT JOIN Entite_segment ps ON p.id_entite = ps.id_entite
      LEFT JOIN segmentgpc s ON ps.id_segment = s.codeSegment
    `;
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY p.id_entite ORDER BY p.id_entite DESC';

    const companies = await queryDB(entiteDB, query, params);

    const response = companies.map(c => ({
      ...c,
      segments: c.segments ? c.segments.split(',') : [],
      type_prod: Number(c.type_prod) || 0,
      statut: Number(c.statut) || 0,
      inscription: Number(c.inscription) || 0,
      nb_fp: Number(c.nb_fp) || 0
    }));

    res.json(response);

  } catch (err) {
    console.error('GET /api/companies error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});




// 2?? Get One Company (never undefined)
app.get('/api/companies/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const rows = await queryDB(entiteDB, `
      SELECT p.*, GROUP_CONCAT(s.codeSegment) AS segments
      FROM Entite p
      LEFT JOIN Entite_segment ps ON p.id_entite = ps.id_entite
      LEFT JOIN segmentgpc s ON ps.id_segment = s.codeSegment
      WHERE p.id_entite = ?
      GROUP BY p.id_entite
    `, [id]);

    const c = rows[0];
    if (!c) {
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

// ---------------------------------------------------------------
//  CREATE COMPANY
// ---------------------------------------------------------------
// ---------------------------------------------------------------
//  CREATE COMPANY – saves even if segments are invalid

//  CREATE COMPANY + SEGMENTS
app.post('/api/companies', uploadLogo.single('logo'), async (req, res) => {
  const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
  await conn.beginTransaction();
  try {
    const f = req.body;
    const logoFile = req.file;
    const logoPath = logoFile ? `https://fp.codeonline-info.com/images/logo_entite/${logoFile.filename}` : null;

    if (!f.raison_socialle || !f.identifiant_national || !f.personne_contact || !f.type_prod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const company = {
      identifiant_rex: f.identifiant_rex || '',
      date_enregistrement_rex: f.date_enregistrement_rex || '',
      debut_validite_rex: f.debut_validite_rex || '',
      fin_validite_rex: f.fin_validite_rex || '',
      etat: f.etat || '',
      raison_socialle: f.raison_socialle,
      identifiant_national: f.identifiant_national,
      certicode: Number(f.certicode) || 0,
      date_create: new Date().toISOString().slice(0, 10),
      pays: f.pays || '',
      site: f.site || '',
      personne_contact: f.personne_contact,
      service: f.service || '',
      email: f.email || '',
      tel_mobile: f.tel_mobile || '',
      telephone: f.telephone || '',
      fax: f.fax || '',
      adresse: f.adresse || '',
      region: f.region || '',
      city: f.city || '',
      localite: f.localite || '',
      postalCode: f.postalCode || '',
      type_prod: Number(f.type_prod) || 0,
      statut: Number(f.statut) || 0,
      date_abonnement: f.date_abonnement || '',
      date_echeance: f.date_echeance || '',
      pwd: f.pwd || 'empty',
      nb_fp: Number(f.nb_fp) || 0,
      inscription: Number(f.inscription) || 0,
      status_ent: f.status_ent || 'E',
      delegation: f.delegation || '',
      titre_fr: f.titre_fr || '',
      titre_ar: f.titre_ar || '',
      titre_en: f.titre_en || '',
      logo: logoPath,
      gln: f.gln || f.identifiant_national || '',
    };

    const [result] = await conn.query('INSERT INTO Entite SET ?', company);
    const id_entite = result.insertId;

    // ? handle segments
    const segments = f.segments ? JSON.parse(f.segments) : [];
    if (Array.isArray(segments) && segments.length > 0) {
      const values = segments.map(code => [id_entite, code]);
      await conn.query('INSERT INTO Entite_segment (id_entite, id_segment) VALUES ?', [values]);
    }

    await conn.commit();
    res.status(201).json({ id_entite });
  } catch (err) {
    await conn.rollback();
    console.error('POST /api/companies error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await conn.end();
  }
});


// UPDATE COMPANY + SEGMENTS
app.put('/api/companies/:id', uploadLogo.single('logo'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
  await conn.beginTransaction();
  try {
    const f = req.body;
    const logoFile = req.file;
    const logoPath = logoFile ? `https://fp.codeonline-info.com/images/logo_entite/${logoFile.filename}` : null;

    const allowed = [
      'identifiant_rex', 'date_enregistrement_rex', 'debut_validite_rex', 'fin_validite_rex', 'etat',
      'raison_socialle', 'identifiant_national', 'certicode', 'pays', 'site', 'personne_contact',
      'service', 'email', 'tel_mobile', 'telephone', 'fax', 'adresse', 'region', 'city', 'localite',
      'postalCode', 'type_prod', 'statut', 'date_abonnement', 'date_echeance', 'pwd', 'nb_fp',
      'inscription', 'status_ent', 'delegation', 'titre_fr', 'titre_ar', 'titre_en', 'gln'
    ];

    const fields = [];
    const values = [];

    for (const key of allowed) {
      const val = f[key];
      if (val !== undefined && val !== null && val !== '') {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (logoPath) {
      fields.push('logo = ?');
      values.push(logoPath);
    }

    if (fields.length > 0) {
      const sql = `UPDATE Entite SET ${fields.join(', ')} WHERE id_entite = ?`;
      values.push(id);
      await conn.query(sql, values);
    }

    // ? handle segments update
    await conn.query('DELETE FROM Entite_segment WHERE id_entite = ?', [id]);
    const segments = f.segments ? JSON.parse(f.segments) : [];
    if (Array.isArray(segments) && segments.length > 0) {
      const values = segments.map(code => [id, code]);
      await conn.query('INSERT INTO Entite_segment (id_entite, id_segment) VALUES ?', [values]);
    }

    await conn.commit();
    res.json({ message: 'Company and segments updated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /api/companies/:id error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await conn.end();
  }
});


/* -------------------------------------------------------------
   tiny helper to keep the route files tidy
   ------------------------------------------------------------- */
function thirdParty(code, msg) {
  return (req, res) => res.status(code).json({ error: msg });
}


// ? Inline update single field (Blur OK)
app.patch('/api/companies/:id/field', async (req, res) => {
  const id = Number(req.params.id);
  const { field, value } = req.body;

  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  if (!field) return res.status(400).json({ error: 'Field required' });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const sql = `UPDATE Entite SET ${field} = ? WHERE id_entite = ?`;
    await conn.query(sql, [value, id]);
    await conn.end();

    console.log(`[ENTITE] Field ${field} updated for id_entite=${id}`);
    res.json({ message: 'Field saved' });
  } catch (err) {
    console.error('PATCH /api/companies/:id/field error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});


// ? DELETE COMPANY (works with MySQL)
app.delete('/api/companies/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    // First delete related segments (to avoid FK issues)
    await conn.query('DELETE FROM Entite_segment WHERE id_entite = ?', [id]);

    // Then delete the company itself
    const [result] = await conn.query('DELETE FROM Entite WHERE id_entite = ?', [id]);

    await conn.commit();
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    console.log(`[ENTITE] Company deleted – id_entite=${id}`);
    res.json({ message: 'Company deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/companies/:id error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 7?? Update Segments Only
app.put('/api/companies/:id/segments', async (req, res) => {
  try {
    const id = Number(req.params.id);
    let { segments } = req.body;
    if (typeof segments === 'string') try { segments = JSON.parse(segments); } catch {}

    await entiteDB.run('BEGIN');
    await runUpdate(entiteDB, `DELETE FROM Entite_segment WHERE id_entite = ?`, [id]);

    if (Array.isArray(segments)) {
      for (const seg of segments) {
        await runUpdate(entiteDB, `INSERT INTO Entite_segment (id_entite, id_segment) VALUES (?, ?)`, [id, seg]);
      }
    }

    await entiteDB.run('COMMIT');
    res.json({ message: 'Segments updated' });

  } catch (err) {
    await entiteDB.run('ROLLBACK').catch(() => {});
    console.error('PUT /api/companies/:id/segments error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
const typeOptions = [
  { value: "1", label: "Entreprise privée produits & services" },
  { value: "2", label: "Entreprise privée ingénierie & services" },
  { value: "3", label: "Entreprise privée transport logistique & stockage" },
  { value: "4", label: "Entreprise publique transport logistique & stockage" },
  { value: "5", label: "Entreprise publique produits & services" },
  { value: "6", label: "Entreprise publique ingénierie & services" },
  { value: "7", label: "Autre institution publique d’appui à l’exportation" },
  { value: "8", label: "Banque" },
  { value: "9", label: "Douane" },
  { value: "10", label: "Assurance" },
];

app.get("/api/companies/template", async (req, res) => {
  try {
    const filePath = path.join(__dirname, "files", "modele_entites_complet.xlsx");

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "Template file not found. Please upload modele_entites_complet.xlsx in /backend/files/",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="modele_entites_complet.xlsx"'
    );

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("? Error sending template file:", err);
    res.status(500).json({ error: "Failed to send Excel template" });
  }
});
// ? BULK IMPORT COMPANIES FROM EXCEL
app.post('/api/companies/import', async (req, res) => {
  try {
    const { entities } = req.body;
    if (!Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({ error: 'No entities provided' });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const added = [];
    const errors = [];

    for (const e of entities) {
      try {
        // Prepare company object (same as POST /api/companies)
        const company = {
          identifiant_rex: e.identifiant_rex || '',
          date_enregistrement_rex: e.date_enregistrement_rex || '',
          debut_validite_rex: e.debut_validite_rex || '',
          fin_validite_rex: e.fin_validite_rex || '',
          etat: e.etat || '',
          raison_socialle: e.raison_socialle || e.raison_sociale,
          identifiant_national: e.identifiant_national,
          certicode: Number(e.certicode) || 0,
          date_create: new Date().toISOString().slice(0, 10),
          pays: e.pays || '',
          site: e.site || '',
          personne_contact: e.personne_contact,
          service: e.service || '',
          email: e.email || '',
          tel_mobile: e.tel_mobile || '',
          telephone: e.telephone || '',
          fax: e.fax || '',
          adresse: e.adresse || '',
          region: e.region || '',
          city: e.city || '',
          localite: e.localite || '',
          postalCode: e.postalCode || '',
          type_prod: Number(e.type_prod || e.type_operateur) || 1, // Default to 1
          statut: Number(e.statut) || 0,
          date_abonnement: e.date_abonnement || '',
          date_echeance: e.date_echeance || '',
          pwd: e.pwd || 'empty',
          nb_fp: Number(e.nb_fp) || 0,
          inscription: Number(e.inscription) || 0,
          status_ent: e.status_ent || 'E',
          delegation: e.delegation || '',
          titre_fr: e.titre_fr || '',
          titre_ar: e.titre_ar || '',
          titre_en: e.titre_en || '',
          gln: e.gln || e.identifiant_national || '',
        };

        // Insert company
        const [result] = await conn.query('INSERT INTO Entite SET ?', company);
        const newId = result.insertId;

        // Insert segments (if provided)
        if (Array.isArray(e.segments) && e.segments.length > 0) {
          for (const seg of e.segments) {
            await conn.query(
              'INSERT INTO Entite_segment (id_entite, id_segment) VALUES (?, ?)',
              [newId, seg]
            );
          }
        }

        added.push(newId);
      } catch (innerErr) {
        console.error('? Failed to import entity:', e.raison_socialle, innerErr);
        errors.push({
          raison_socialle: e.raison_socialle,
          message: innerErr.message,
        });
      }
    }

    await conn.end();

    res.json({
      added: added.length,
      errors,
    });
  } catch (err) {
    console.error('POST /api/companies/import error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// ====================== EANCOM GENERATOR (like bashEancomXML.php) ======================
function generateEANCOM(data) {
  const lines = [];
  let segmentCount = 0;
  const add = function(l) {
    segmentCount++;
    lines.push(l);
  };
  add("UNH+MESS001+ORDERS:D:96A:UN:EAN008'");
  add("BGM+220+" + data.numCommande + "+9'");
  if (data.datecommande) add("DTM+137:" + data.datecommande + ":102'");
  if (data.datelivraison) {
    var code = String(data.datelivraison).length > 8 ? "203" : "102";
    add("DTM+2:" + data.datelivraison + ":" + code + "'");
  }
  if (data.dateenlevement) {
    var code = String(data.dateenlevement).length > 8 ? "203" : "102";
    add("DTM+200:" + data.dateenlevement + ":" + code + "'");
  }
  if (data.Acheteur) add("NAD+BY+" + data.Acheteur + "::9'");
  if (data.lieu_livraison_primaire) {
    add("NAD+DP+" + data.lieu_livraison_primaire + "::9'");
    add("NAD+UC+" + data.lieu_livraison_primaire + "::9'");
  }
  if (data.fournisseur) add("NAD+SU+" + data.fournisseur + "::9'");
  if (data.facture) add("NAD+IV+" + data.facture + "::9'");
  if (data.monnaie) add("CUX+2:" + data.monnaie + ":9'");
  // ITEMS
  var items = (data.article || "").split(/[;|]/).map(function(v) { return v.trim(); }).filter(Boolean);
  items.forEach(function(line, idx) {
    var gtin, qty, price, unit = "PCE";
    if (line.includes("!")) {
      var parts = line.split("!");
      gtin = parts[0].split("-")[0];
      qty = parts[1];
      price = parts[2];
    } else {
      var parts = line.split(":");
      gtin = parts[0];
      qty = parts[1];
      price = parts[2];
    }
    add("LIN+" + (idx + 1) + "++" + gtin + ":EN'");
    add("QTY+21:" + qty + ":" + unit + "'");
    add("PRI+AAA:" + price + "::NTP:1:" + unit + "'");
  });
  add("UNS+S'");
  add("CNT+2:" + items.length + "'");
  add("UNT+" + segmentCount + "+MESS001'");
  return lines.join("\n") + "\n";
}

// 1. CREATE EANCOM ORDER (like commande_valide.php + bashEancomXML.php)
app.post("/api/orders/eancom", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var data = req.body;
    var sellerId = Number(req.headers["x-entite-id"]);
    if (!data.numCommande || !data.fournisseur || !sellerId)
      return res.status(400).json({ error: "Missing fields" });

    // Validation (like commande_invalide_model.php)
    var errorMessage = "";
    if (!data.article || data.article.split(";").length === 0) errorMessage += "No articles; ";
    if (!data.datelivraison) errorMessage += "Missing datelivraison; ";
    if (errorMessage) {
      // Insert as invalid (like insererCommandeInvalide)
      await queryDB(entiteDB, "INSERT INTO invalid_orders (num_order, error_message) VALUES (?, ?)", [data.numCommande, errorMessage]);
      return res.status(400).json({ error: "Invalid order", details: errorMessage });
    }

    // Generate EANCOM file
    var dir = path.join(EANCOM_BASE_DIR, "fournisseurs", data.fournisseur, "commandes", "commandes_eancom", data.numCommande);
    await fs.mkdir(dir, { recursive: true });
    var edifact = generateEANCOM(data);
    await fs.writeFile(path.join(dir, "ordre.txt"), edifact, "utf8");

    // Insert valid order (like commande_valide_model.php -> insert)
    var insertRes = await queryDB(entiteDB, 
      "INSERT INTO valid_order (num_order, date_reception, date_livraison, gln_fournisseur, commande_a, nbr_lin_article, montant_ht, statut) VALUES (?, NOW(), ?, ?, ?, ?, ?, 'valid')",
      [data.numCommande, data.datelivraison, data.fournisseur, data.Acheteur, data.article.split(";").length, data.montant_ht || 0]
    );
    var orderId = insertRes[0].insertId;

    // Insert lines
    data.article.split(";").forEach(async function(line) {
      var parts = line.split("!");
      var gtin = parts[0];
      var qty = parts[1];
      var price = parts[2];
      await queryDB(entiteDB, "INSERT INTO order_lines (id_order, gtin, qty, price) VALUES (?, ?, ?, ?)", [orderId, gtin, qty, price]);
    });

    res.json({ success: true, file: path.join(dir, "ordre.txt"), orderId });
  } catch (err) {
    console.error("EANCOM Error:", err);
    res.status(500).json({ error: "Failed", details: err.message });
  }
});

// 3. GET INCOMING / VALID ORDERS (like commande_valide_model.php -> getALLCommandeValide)
app.get("/api/orders/incoming", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var sellerId = Number(req.headers["x-entite-id"]);
    if (!sellerId) return res.status(400).json({ error: "Missing x-entite-id" });
    var orders = await queryDB(entiteDB,
      "SELECT o.id_order, o.num_order, o.date_reception, o.date_livraison, o.commande_a, o.nbr_lin_article, o.montant_ht, o.statut, " +
      "e.raison_socialle AS buyer_name " +
      "FROM valid_order o JOIN Entite e ON e.id_entite = o.commande_a " +
      "WHERE o.gln_fournisseur = ? AND o.statut = 'valid' ORDER BY date_reception DESC",
      [sellerId]
    );
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      o.lines = await queryDB(entiteDB, "SELECT gtin, libelle, qty, price FROM order_lines WHERE id_order = ?", [o.id_order]);
    }
    res.json({ orders: orders });
  } catch (err) {
    console.error("incoming error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 4. GET INVALID ORDERS (like commande_invalide_model.php -> getALLCommandeInValide)
app.get("/api/orders/invalid", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var sellerId = Number(req.headers["x-entite-id"]);
    if (!sellerId) return res.status(400).json({ error: "Missing x-entite-id" });
    var orders = await queryDB(entiteDB,
      "SELECT id_order, num_order, date_reception, error_message FROM invalid_orders WHERE gln_fournisseur = ? ORDER BY date_reception DESC",
      [sellerId]
    );
    res.json({ orders: orders });
  } catch (err) {
    console.error("invalid error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. GET ARCHIVED ORDERS (simulating archive like commande_archivee)
app.get("/api/orders/archived", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var sellerId = Number(req.headers["x-entite-id"]);
    if (!sellerId) return res.status(400).json({ error: "Missing x-entite-id" });
    var orders = await queryDB(entiteDB,
      "SELECT o.id_order, o.num_order, o.date_reception, o.statut FROM archived_orders o WHERE gln_fournisseur = ? ORDER BY date_reception DESC",
      [sellerId]
    );
    res.json({ orders: orders });
  } catch (err) {
    console.error("archived error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 6. ORDER RESPONSE / VALIDATE (like validatecmd in commande_valide_Historique.php)
app.post("/api/orders/:id/response", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var orderId = Number(req.params.id);
    var responderId = Number(req.headers["x-entite-id"]);
    var action = req.body.action;
    if (["accept", "reject", "validate"].indexOf(action) === -1)
      return res.status(400).json({ error: "Invalid action" });
    var newStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "valid";
    await queryDB(entiteDB, "INSERT INTO order_responses (id_order, id_entite_responder, action, created_at) VALUES (?, ?, ?, NOW())",
      [orderId, responderId, action]
    );
    await queryDB(entiteDB, "UPDATE orders SET statut = ? WHERE id_order = ?", [newStatus, orderId]);
    if (action === "validate") {
      // Move from invalid to valid (like validatecmd)
      await queryDB(entiteDB, "INSERT INTO valid_order SELECT * FROM invalid_orders WHERE id_order = ?", [orderId]);
      await queryDB(entiteDB, "DELETE FROM invalid_orders WHERE id_order = ?", [orderId]);
    }
    res.json({ success: true, newStatus: newStatus });
  } catch (err) {
    console.error("response error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 7. DELETE ORDER (like suppcmd in commande_valide_Historique.php)
app.delete("/api/orders/:id", async function(req, res) {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) return res.status(403).json({ error: "Invalid PIN" });
    var orderId = Number(req.params.id);
    await queryDB(entiteDB, "DELETE FROM orders WHERE id_order = ?", [orderId]);
    await queryDB(entiteDB, "DELETE FROM order_lines WHERE id_order = ?", [orderId]);
    res.json({ success: true });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ error: "Server error" });
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

//
// Helpers: ensure queryDB & runUpdate are your project functions used in companies endpoints
//
const multerBulk = multer();

// GET /api/products (list with filters, sort, pagination)
// GET /api/products (with filters, sorting, pagination)
// GET /api/products (list with filters, sort, pagination)
// ? FIXED: /api/products (with filters, sorting, pagination)
// ?? HEALTH CHECK
app.get("/api/status", async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ ok: false, msg: "DB unavailable" });
    await queryDB(entiteDB, "SELECT 1");
    res.json({ ok: true, msg: "Database connected" });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
});


// ?? GET /api/products — Fetch all with filters + pagination
app.get("/api/products", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database connection unavailable" });

    let {
      brand,
      codebrique,
      search,
      sortBy = "id",
      sortDir = "DESC",
      page = "1",
      limit = "25",
      id_entite
    } = req.query;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.max(1, parseInt(limit) || 25);
    const offset = (safePage - 1) * safeLimit;

    const allowedSortKeys = [
      "id", "brand", "subBrand", "description", "gtin", "libelle", "short_libelle",
      "countryOfOrigin", "idEntreprise", "nb_images", "prix_min", "prix_max",
      "code_cader", "codeClasse", "codebrique", "date_mis_a_jour_fp",
      "tradeItemSynchronisationDates", "date_create_fp", "activ_prix", "status", "done_new"
    ];
    if (!allowedSortKeys.includes(sortBy)) sortBy = "id";
    sortDir = sortDir.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const where = [];
    const params = [];

    if (brand) { where.push("brand = ?"); params.push(brand); }
    if (codebrique) { where.push("codebrique = ?"); params.push(codebrique); }
    if (search) {
      const s = `%${search}%`;
      where.push("(gtin LIKE ? OR libelle LIKE ? OR brand LIKE ? OR description LIKE ?)");
      params.push(s, s, s, s);
    }

    // Restrict normal users
    if (id_entite && ![111, 999].includes(Number(id_entite))) {
      where.push("idEntreprise = ?");
      params.push(Number(id_entite));
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT id, brand, subBrand, description, gtin, libelle, short_libelle,
             countryOfOrigin, idEntreprise, images, nb_images, prix_min, prix_max,
             code_cader, codeClasse, codebrique, date_mis_a_jour_fp,
             tradeItemSynchronisationDates, date_create_fp, activ_prix, status, done_new
      FROM fiche_produit
      ${whereClause}
      ORDER BY \`${sortBy}\` ${sortDir}
      LIMIT ${offset}, ${safeLimit};
    `;

    const products = await queryDB(entiteDB, sql, params);
    const countSql = `SELECT COUNT(*) AS total FROM fiche_produit ${whereClause};`;
    const count = await queryDB(entiteDB, countSql, params);

    res.json({
      products,
      total: count[0]?.total || 0,
      totalPages: Math.ceil((count[0]?.total || 1) / safeLimit),
    });
  } catch (err) {
    console.error("? /api/products error:", err);
    res.status(500).json({ error: "Failed to fetch products", details: err.message });
  }
});


// ?? GET /api/products/brands
app.get("/api/products/brands", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const rows = await queryDB(
      entiteDB,
      "SELECT DISTINCT brand FROM fiche_produit WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand ASC;"
    );
    const brands = rows.map(r => r.brand);
    res.json(brands);
  } catch (err) {
    console.error("? /api/products/brands error:", err);
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});


// ? POST /api/products (Create Product)
app.post("/api/products", uploadProducts.array("images", 10), async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const fields = req.body;

    // Save images in the products folder and store proper URL
    const images = req.files
      ?.map(f => `https://fp.codeonline-info.com/images/products/${f.filename}`)
      .join(";") || "";

    if (!fields.brand || !fields.gtin || !fields.libelle || !fields.idEntreprise || !fields.codebrique) {
      return res.status(400).json({ error: "Required fields: brand, gtin, libelle, idEntreprise, codebrique" });
    }

    const sql = `
      INSERT INTO fiche_produit (
        brand, subBrand, description, gtin, libelle, short_libelle,
        countryOfOrigin, idEntreprise, images, nb_images,
        prix_min, prix_max, code_cader, codeClasse, codebrique,
        date_mis_a_jour_fp, tradeItemSynchronisationDates, date_create_fp,
        activ_prix, status, done_new
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      fields.brand, fields.subBrand || "", fields.description || "",
      fields.gtin, fields.libelle, fields.short_libelle || "",
      fields.countryOfOrigin || "", Number(fields.idEntreprise),
      images, images ? images.split(";").length : 0,
      Number(fields.prix_min || 0), Number(fields.prix_max || 0),
      fields.code_cader || "", Number(fields.codeClasse || 0),
      fields.codebrique, new Date().toISOString().slice(0, 19), "",
      new Date().toISOString().slice(0, 19),
      Number(fields.activ_prix || 0), 0, 0
    ];

    const result = await runUpdate(entiteDB, sql, params);
    res.json({ id: result.lastID, ...fields, images, nb_images: params[9], status: 0 });
  } catch (err) {
    console.error("? POST /api/products error:", err);
    res.status(500).json({ error: "Failed to create product", details: err.message });
  }
});

// ? PUT /api/products/:id (Update Product)
app.put("/api/products/:id", uploadProducts.array("images", 10), async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const { id } = req.params;
    const fields = req.body;

    // Save new images in the products folder
    const newImages = req.files
      ?.map(f => `https://fp.codeonline-info.com/images/products/${f.filename}`)
      .join(";") || "";

    const existingQuery = await queryDB(entiteDB, "SELECT * FROM fiche_produit WHERE id = ?", [id]);
    if (existingQuery.length === 0) return res.status(404).json({ error: "Product not found" });
    const existing = existingQuery[0];

    // Combine existing images with new uploads
    const images = existing.images
      ? `${existing.images};${newImages}`.replace(/^;|;$/g, "")
      : newImages;
    const nb_images = images ? images.split(";").length : 0;

    const sql = `
      UPDATE fiche_produit SET
        brand=?, subBrand=?, description=?, gtin=?, libelle=?, short_libelle=?,
        countryOfOrigin=?, idEntreprise=?, images=?, nb_images=?,
        prix_min=?, prix_max=?, code_cader=?, codeClasse=?, codebrique=?,
        date_mis_a_jour_fp=?, tradeItemSynchronisationDates=?, activ_prix=?, status=?, done_new=?
      WHERE id=?
    `;

    const params = [
      fields.brand ?? existing.brand, fields.subBrand ?? existing.subBrand,
      fields.description ?? existing.description, fields.gtin ?? existing.gtin,
      fields.libelle ?? existing.libelle, fields.short_libelle ?? existing.short_libelle,
      fields.countryOfOrigin ?? existing.countryOfOrigin, Number(fields.idEntreprise ?? existing.idEntreprise),
      images, nb_images,
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

    const result = await runUpdate(entiteDB, sql, params);
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });

    res.json({ ...existing, ...fields, images, nb_images, id: Number(id) });
  } catch (err) {
    console.error("? PUT /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});


// ? GET /api/entite_segments?id_entite=123
app.get('/api/entite_segments', async (req, res) => {
  try {
    const { id_entite } = req.query;
    if (!id_entite) return res.status(400).json({ error: 'id_entite required' });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(`
      SELECT es.id_segment AS codeSegment, sg.libelleSegment
      FROM Entite_segment es
      LEFT JOIN segmentgpc sg ON es.id_segment = sg.codeSegment
      WHERE es.id_entite = ?
    `, [id_entite]);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/entite_segments error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ? GET /api/classes_by_segment?codeSegment=xxxx
app.get('/api/classes_by_segment', async (req, res) => {
  try {
    const { codeSegment } = req.query;
    if (!codeSegment) return res.status(400).json({ error: 'codeSegment required' });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(`
      SELECT codeClasse, libelleClasse, codeSeg
      FROM classegpc
      WHERE codeSeg = ? AND status_c = 1
      ORDER BY ordre_classe ASC
    `, [codeSegment]);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/classes_by_segment error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bricks_by_class', async (req, res) => {
  try {
    const { codeClasse } = req.query;

    if (!codeClasse) {
      return res.status(400).json({ error: 'codeClasse required' });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [rows] = await conn.query(`
      SELECT 
        codeBrique,
        COALESCE(CONVERT(libelleBrique USING utf8mb4), '(Sans libellé)') AS libelleBrique,
        ordre_brique
      FROM brickgpc
      WHERE codeClasse = ?
        AND status_br = 1
      ORDER BY ordre_brique ASC
    `, [codeClasse]);

    await conn.end();
    res.json(rows);

  } catch (err) {
    console.error('GET /api/bricks_by_class error:', err);
    res.status(500).json({ error: err.message });
  }
});



// ?? DELETE /api/products/:id
app.delete("/api/products/:id", async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });

    const { id } = req.params;
    const result = await runUpdate(entiteDB, "DELETE FROM fiche_produit WHERE id=?", [id]);
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });

    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete", details: err.message });
  }
});

app.patch("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (status === undefined) return res.status(400).json({ error: "status required" });

    const result = await runUpdate(entiteDB, "UPDATE fiche_produit SET status=? WHERE id=?", [Number(status), id]);
    if (result.changes === 0) return res.status(404).json({ error: "Product not found" });

    res.json({ id: Number(id), status: Number(status) });
  } catch (err) {
    console.error("PATCH /api/products/:id error:", err);
    res.status(500).json({ error: "Failed to update status", details: err.message });
  }
});

//orders
function pad2(n){ return String(n).padStart(2,'0'); }

function generateEANCOM(data) {
  // data expected fields (per CI):
  // numCommande, datecommande (YYYYMMDD or YYYYMMDDhhmm), datelivraison, dateenlevement,
  // Acheteur, lieu_livraison_primaire, fournisseur, facture, monnaie, condition_livraison,
  // ModeTransport, TypeTransport, nb_article, article (string)
  const lines = [];
  let n = 0;

  n++; lines.push("UNH+MESS001+ORDERS:D:96A:UN:EAN008'");

  n++; lines.push(`BGM+220+${data.numCommande}+9'`);

  // datecommande expected as YYYYMMDD (CI did list($d,$m,$y) and then $y$m$d)
  if (data.datecommande) {
    n++;
    lines.push(`DTM+137:${data.datecommande}:102'`);
  }

  // datelivraison can be YYYYMMDD or YYYYMMDDhhmm
  if (data.datelivraison) {
    const dl = String(data.datelivraison);
    // if length > 8 (has time) use code 203 else 102
    if (dl.length > 8) {
      n++; lines.push(`DTM+2:${dl}:203'`);
    } else {
      n++; lines.push(`DTM+2:${dl}:102'`);
    }
  }

  // dateenlevement similarly
  if (data.dateenlevement) {
    const de = String(data.dateenlevement);
    if (de.length > 8) {
      n++; lines.push(`DTM+200:${de}:203'`);
    } else {
      n++; lines.push(`DTM+200:${de}:102'`);
    }
  }

  // NAD BY (buyer)
  if (data.Acheteur) { n++; lines.push(`NAD+BY+${data.Acheteur}::9'`); }

  // NAD DP & UC (delivery place)
  if (data.lieu_livraison_primaire) { n++; lines.push(`NAD+DP+${data.lieu_livraison_primaire}::9'`); n++; lines.push(`NAD+UC+${data.lieu_livraison_primaire}::9'`); }

  // NAD SU (supplier)
  if (data.fournisseur) { n++; lines.push(`NAD+SU+${data.fournisseur}::9'`); }

  // NAD IV (invoice party)
  if (data.facture) { n++; lines.push(`NAD+IV+${data.facture}::9'`); }

  // currency
  if (data.monnaie) { n++; lines.push(`CUX+2:${data.monnaie}:9'`); }

  // delivery terms
  if (data.condition_livraison) { n++; lines.push(`TOD+${data.condition_livraison}'`); }

  // transport
  const mt = data.ModeTransport || "";
  const tt = data.TypeTransport || "";
  if (mt || tt) { n++; lines.push(`TDT+20++${mt}+${tt}'`); }

  // Articles: depending on mode the CI algorithm obtains $articles array by splitting article string on ';'
  const articleString = data.article || "";
  const parts = articleString.split(/[;|]/).filter(Boolean); // split on ; (or pipe if any)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    // CI had two possible formats:
    // Fournisseur: GTIN:QTY:PRICE
    // Distributeur: GTIN-ID!QTY!PRICE!DEC  (CI's second controller used explode('!',$articles[$i]) and then list($gtin,$id_article)=explode('-',$gtin);
    // We'll detect which format by presence of '!' vs ':'
    let gtinVal = "";
    let qtyVal = "";
    let priceVal = "";
    let decVal = "";

    if (part.includes("!")) {
      // distributeur style
      const partsD = part.split("!");
      // first piece might be "GTIN-ID" or e.g. "0123456789012-123"
      gtinVal = partsD[0] || "";
      qtyVal = partsD[1] || "";
      priceVal = partsD[2] || "";
      decVal = partsD[3] || "";
      // CI then did: list($gtin,$id_article)=explode('-',$gtin);
      // it wrote LIN with $gtin (first part before -)
      let gt = gtinVal;
      if (gtinVal.includes("-")) {
        gt = gtinVal.split("-")[0];
      }
      n++; lines.push(`LIN+${i + 1}++${gt}:EN'`);
      // CI inserted dec info into article_model: insrproduitdec($gtin,$numCommande,$dec);
      // QTY
      // Check weight variable => choose type KGM or PCE (CI looked up product poidvariable)
      // We can't know here; default to PCE
      const unit = decVal && decVal.toUpperCase().includes("KGM") ? "KGM" : "PCE";
      n++; lines.push(`QTY+21:${qtyVal}:${unit}'`);
      n++; lines.push(`PRI+AAA:${priceVal}::NTP:1:${unit}'`);
    } else {
      // fournisseur style colon separated
      const partsF = part.split(":");
      gtinVal = partsF[0] || "";
      qtyVal = partsF[1] || "";
      priceVal = partsF[2] || "";
      n++; lines.push(`LIN+${i + 1}++${gtinVal}:EN'`);
      // Default type PCE
      n++; lines.push(`QTY+21:${qtyVal}:PCE'`);
      n++; lines.push(`PRI+AAA:${priceVal}::NTP:1:PCE'`);
    }
  }

  // UNS + CNT
  const nbArticle = parts.length;
  lines.push("UNS+S'");
  lines.push(`CNT+2:${nbArticle}'`);
  n++; // CI incremented n before UNT
  // UNT count: CI used a counter $n which incremented with each segment; our 'n' is not exact
  // UNT expects number of segments; we will compute approximate segments = lines.length + 1
  const segmentCount = lines.length + 1;
  lines.push(`UNT+${segmentCount}+EAN005'`);

  return lines.join("\n");
}

// POST /api/orders/eancom
app.post("/api/orders/eancom", async (req, res) => {
  try {
    const pin = req.headers["x-api-pin"];
    if (pin !== API_PIN) return res.status(403).json({ error: "Forbidden: Invalid PIN" });

    if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });

    const data = req.body;
    if (!data || !data.numCommande) return res.status(400).json({ error: "Invalid payload" });

    // Create folder exactly like CI:
    // Example: /var/www/formation/ecomfournisseur/fournisseurs/<fournisseur>/commandes/commandes_eancom/<numCommande>
    // You might want to set a base path matching your environment
    const BASE = process.env.EANCOM_BASE_DIR || "/var/www/formation/ecomfournisseur";
    const folder = path.join(BASE, "fournisseurs", String(data.fournisseur), "commandes", "commandes_eancom", String(data.numCommande));
    await fs.promises.mkdir(folder, { recursive: true });

    // Generate content (function below)
    const content = generateEANCOM(data);

    await fs.promises.writeFile(path.join(folder, "ordre.txt"), content, "utf8");

    // Insert record for tracking (similar to insererNewEancom in CI)
    await queryDB(entiteDB,
      "INSERT INTO eancom_orders (numCommande, fournisseur, Acheteur, created_at) VALUES (?, ?, ?, NOW())",
      [data.numCommande, data.fournisseur, data.Acheteur]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /api/orders/eancom error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/orders/incoming
app.get("/api/orders/incoming", async (req, res) => {
  try {
    const pin = req.headers["x-api-pin"];
    if (pin !== API_PIN) return res.status(403).json({ error: "Forbidden: Invalid PIN" });
    if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });

    const id_entite = Number(req.headers["x-entite-id"]);
    if (!id_entite) return res.status(400).json({ error: "Missing entite id header" });

    // Find orders where any line's product belongs to this seller (idEntreprise)
    const sql = `
      SELECT o.id_order, o.id_entite_buyer, o.status, o.created_at, p.raison_socialle AS buyer_name
      FROM orders o
      JOIN Entite p ON p.id_entite = o.id_entite_buyer
      WHERE EXISTS (
        SELECT 1 FROM order_lines l
        JOIN fiche_produit f ON f.id = l.product_id
        WHERE l.id_order = o.id_order AND f.idEntreprise = ?
      )
      ORDER BY o.id_order DESC
    `;
    const orders = await queryDB(entiteDB, sql, [id_entite]);

    for (const o of orders) {
      const lines = await queryDB(entiteDB, "SELECT product_id, gtin, libelle, qty, price AS prix FROM order_lines WHERE id_order = ?", [o.id_order]);
      o.lines = lines;
    }

    res.json({ orders });
  } catch (err) {
    console.error("GET /api/orders/incoming error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/orders/sent
app.get("/api/orders/sent", async (req, res) => {
  try {
    const pin = req.headers["x-api-pin"];
    if (pin !== API_PIN) return res.status(403).json({ error: "Forbidden: Invalid PIN" });
    if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });

    const id_entite = Number(req.headers["x-entite-id"]);
    if (!id_entite) return res.status(400).json({ error: "Missing entite id header" });

    const sql = `
      SELECT o.id_order, o.status, o.created_at,
        (SELECT f.raison_socialle FROM Entite f WHERE f.id_entite = (
          SELECT fi.idEntreprise FROM order_lines l
          JOIN fiche_produit fi ON fi.id = l.product_id
          WHERE l.id_order = o.id_order LIMIT 1
        ) LIMIT 1) AS seller_name
      FROM orders o
      WHERE o.id_entite_buyer = ?
      ORDER BY o.id_order DESC
    `;
    const orders = await queryDB(entiteDB, sql, [id_entite]);

    for (const o of orders) {
      const lines = await queryDB(entiteDB, "SELECT product_id, gtin, libelle, qty, price AS prix FROM order_lines WHERE id_order = ?", [o.id_order]);
      o.lines = lines;
    }

    res.json({ orders });
  } catch (err) {
    console.error("GET /api/orders/sent error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// POST /api/orders/:id/response
app.post("/api/orders/:id/response", async (req, res) => {
  try {
    const pin = req.headers["x-api-pin"];
    if (pin !== API_PIN) return res.status(403).json({ error: "Forbidden: Invalid PIN" });
    if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });

    const id_order = Number(req.params.id);
    const { action, price } = req.body;
    if (!["accept", "reject", "counter"].includes(action)) return res.status(400).json({ error: "Invalid action" });

    const newStatus = (action === "accept") ? "accepted" : (action === "reject" ? "rejected" : "responded");

    await queryDB(entiteDB, "INSERT INTO order_responses (id_order, id_entite_responder, action, counter_total, created_at) VALUES (?, ?, ?, ?, NOW())", [id_order, Number(req.headers["x-entite-id"] || 0), action, price || null]);

    await queryDB(entiteDB, "UPDATE orders SET status = ? WHERE id_order = ?", [newStatus, id_order]);

    res.json({ success: true, newStatus });
  } catch (err) {
    console.error("POST /api/orders/:id/response error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// ============================================================
app.get('/api/classes', async (req, res) => {
  const { codeFamille } = req.query;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    let sql = `
      SELECT 
        codeClasse AS code,
        libelleClasse AS libelle,
        libelleClasse_en AS libelle_en,
        libelleClasse_ar AS libelle_ar,
        status_c AS status
      FROM classegpc
    `;
    const params = [];

    // If a family code is provided, filter by it
    if (codeFamille) {
      sql += ' WHERE codeFamille = ?';
      params.push(codeFamille);
    }

    sql += ' ORDER BY ordre_classe ASC';

    const [rows] = await conn.query(sql, params);
    res.json(rows);
    await conn.end();
  } catch (err) {
    console.error('? Error fetching classes:', err);
    res.status(500).json({ error: 'Failed to fetch classes', details: err.message });
  }
});



// ?? GET /api/briques-by-class/:codeClasse — Fetch briques for a specific class
app.get("/api/briques-by-class/:codeClasse", async (req, res) => {
  try {
    const { codeClasse } = req.params;
    const rows = await queryDB(
      entiteDB,
      "SELECT codeBrique, libelleBrique FROM brickgpc WHERE codeClasse = ? ORDER BY libelleBrique ASC;",
      [codeClasse]
    );
    res.json(rows);
  } catch (err) {
    console.error("? /api/briques-by-class error:", err);
    res.status(500).json({ error: "Failed to fetch briques" });
  }
});

// ---------------------------------------------------------------
// 1. TEMPLATE GENERATOR  (/api/products/template)
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// TEMPLATE – /api/products/template
// ---------------------------------------------------------------
app.get("/api/products/template", async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const axios   = require("axios");

    const base = `${req.protocol}://${req.get("host")}`;

    // ---- 1. FETCH LIVE DATA ------------------------------------
    const [pRes, cRes, bRes] = await Promise.all([
      axios.get(`${base}/api/pays`),
      axios.get(`${base}/api/classes`),
      axios.get(`${base}/api/bricks`)
    ]);

    const pays   = pRes.data.map(p => `${p.libelle} - ${p.isoNumeric}`);
    const classes = cRes.data
      .filter(c => c.status === 1)
      .map(c => `${c.code} - ${c.libelle}`);
    const briques = bRes.data
      .filter(b => b.status === 1)
      .map(b => `${b.code} - ${b.libelle}`);

    // ---- 2. CREATE WORKBOOK ------------------------------------
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Modèle Import Produits");

    // ----- headers ------------------------------------------------
    const headers = [
      "brand","subBrand","description","gtin","libelle",
      "short_libelle","countryOfOrigin","prix_min","prix_max",
      "code_cader","codeClasse","codebrique","activ_prix"
    ];
    const hr = ws.addRow(headers);
    hr.font = { bold:true };
    ws.columns = headers.map(()=>({ width:35 }));

    // ----- hidden sheet with raw lists -----------------------------
    const lists = wb.addWorksheet("_lists", { state:"veryHidden" });

    // row 1 ? countries (displayed text)
    lists.getRow(1).values = ["countryOfOrigin", ...pays];
    // row 2 ? classes
    lists.getRow(2).values = ["codeClasse", ...classes];
    // row 3 ? briques
    lists.getRow(3).values = ["codebrique", ...briques];
    // row 4 ? activ_prix
    lists.getRow(4).values = ["activ_prix","0","1"];

    // ----- helper: make a CSV string safe for Excel --------------
    const csv = arr => arr.map(s => `"${s.replace(/"/g, '""')}"`).join(",");

    // ----- helper: write a long list to a hidden column and return INDIRECT formula
    // (Excel limit ˜ 255 chars ? we use a hidden column when > 30 items)
    const makeList = (arr, colLetter) => {
      if (arr.length <= 30) {
        return `=${csv(arr)}`;
      }
      // write values vertically in the hidden column
      arr.forEach((v, i) => lists.getCell(`${colLetter}${i + 10}`).value = v);
      const last = 9 + arr.length;
      return `=INDIRECT("_lists!${colLetter}10:${colLetter}${last}")`;
    };

    const countryFormula = makeList(pays,   "Z");   // column Z hidden
    const classeFormula  = makeList(classes,"AA");
    const briqueFormula  = makeList(briques,"AB");

    // ----- apply dropdowns (rows 2-101) ---------------------------
    for (let r = 2; r <= 101; r++) {
      // G = countryOfOrigin
      ws.getCell(`G${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [countryFormula]
      };
      // K = codeClasse
      ws.getCell(`K${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [classeFormula]
      };
      // L = codebrique
      ws.getCell(`L${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [briqueFormula]
      };
      // M = activ_prix
      ws.getCell(`M${r}`).dataValidation = {
        type: "list", allowBlank: true, formulae: ['"_lists!$B$4:$C$4"']
      };
    }

    // ----- send file ---------------------------------------------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Modele_Produits.xlsx"
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("GET /api/products/template error:", err);
    res.status(500).json({ error: "Failed to generate template", details: err.message });
  }
});
app.post("/api/products/import", async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || !products.length) {
      return res.status(400).json({ error: "No products provided" });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    let inserted = 0;
    let skipped = 0;

    for (const p of products) {
      try {
        if (!p.id_entite) {
          skipped++;
          continue;
        }

        const product = {
          brand: p.brand || "",
          subBrand: p.subBrand || "",
          description: p.description || "",
          gtin: p.gtin || "",
          libelle: p.libelle || "",
          short_libelle: p.short_libelle || "",
          countryOfOrigin: p.countryOfOrigin || "",
          idEntreprise: Number(p.id_entite),
          images: "",
          nb_images: 0,
          prix_min: Number(p.prix_min) || 0,
          prix_max: Number(p.prix_max) || 0,
          code_cader: p.code_cader || "",
          codeClasse: Number(p.codeClasse) || 0,
          codebrique: p.codebrique || "",
          date_mis_a_jour_fp: now,
          tradeItemSynchronisationDates: "",
          date_create_fp: now,
          activ_prix: Number(p.activ_prix) || 0,
          status: 0,
          done_new: 0
        };

        await conn.query("INSERT INTO fiche_produit SET ?", product);
        inserted++;
      } catch (err) {
        console.error("? Product insert failed:", err.message);
        skipped++;
      }
    }

    await conn.end();

    res.json({
      inserted,
      skipped,
      message: `${inserted} produit(s) importé(s), ${skipped} ignoré(s)`
    });

  } catch (err) {
    console.error("POST /api/products/import ERROR:", err);
    res.status(500).json({ error: "Server error", details: err.message });
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
// ============================================================
// GED LOG FUNCTION — needed for tracking uploads, downloads, deletes, etc.
// ============================================================
// ============================================================
// HELPER: GED LOG FUNCTION
// ============================================================
async function gedLog(conn, id_ged, action, performed_by = null, details = null) {
  try {
    const detailStr = details ? JSON.stringify(details) : null;
    await conn.query(
      `INSERT INTO ged_logs (id_ged, action, details, performed_by, performed_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [id_ged, action, detailStr, performed_by]
    );
  } catch (err) {
    console.error('gedLog error:', err);
  }
}

// ============================================================
// GED LOGS (HISTORY)
// ============================================================
// ============================================================
// GED LOGS (HISTORY) — French + real emails + folder names
// ============================================================
app.get('/api/ged/:id/logs', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID GED invalide' });

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    // Fetch logs + user email
    const [logs] = await conn.query(`
      SELECT 
        l.id_log,
        l.id_ged,
        l.action,
        l.details,
        l.performed_by,
        l.performed_at,
        c.email AS performed_by_email
      FROM ged_logs l
      LEFT JOIN comptes c ON c.id_compte = l.performed_by
      WHERE l.id_ged = ?
      ORDER BY l.performed_at DESC
    `, [id]);

    // Pre-fetch folder names for translation
    const folderIds = [];
    for (const log of logs) {
      if (log.details) {
        try {
          const parsed = JSON.parse(log.details);
          if (parsed.id_folder) folderIds.push(parsed.id_folder);
        } catch {}
      }
    }

    let folderMap = {};
    if (folderIds.length) {
      const [folders] = await conn.query(
        `SELECT id_folder, name FROM ged_folders WHERE id_folder IN (${folderIds.map(() => '?').join(',')})`,
        folderIds
      );
      folderMap = Object.fromEntries(folders.map(f => [f.id_folder, f.name]));
    }

    await conn.end();

    // Translate actions + replace folder IDs with names
    const translatedLogs = logs.map(l => {
      let details = null;
      try {
        if (l.details) {
          const parsed = JSON.parse(l.details);
          if (parsed.id_folder && folderMap[parsed.id_folder]) {
            parsed.nom_dossier = folderMap[parsed.id_folder];
          }
          details = parsed;
        }
      } catch {
        details = l.details;
      }

      // French labels
      const actionMap = {
        'UPLOAD': 'Téléchargement',
        'DOWNLOAD': 'Téléchargement',
        'VIEW': 'Visualisation',
        'SOFT_DELETE': 'Suppression (temporaire)',
        'HARD_DELETE': 'Suppression définitive',
        'RESTORE': 'Restauration',
        'UPDATE_METADATA': 'Mise à jour des métadonnées',
        'add_to_folder': 'Ajout au dossier',
        'remove_from_folder': 'Retrait du dossier'
      };

      return {
        ...l,
        action: actionMap[l.action] || l.action,
        performed_by_email: l.performed_by_email || 'Inconnu',
        details
      };
    });

    res.json({ logs: translatedLogs });
  } catch (err) {
    console.error('GET /api/ged/:id/logs error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des logs', details: err.message });
  }
});


// ============================================================
// GED LIST (pagination + folder + search + restricted by entite)
// ============================================================
// GED LIST (per-entity isolation — strict filtering)
// ============================================================
app.get('/api/ged/list', async (req, res) => {
  try {
    const {
      page = 1,
      perPage = 20,
      sort = 'created_at',
      dir = 'DESC',
      search = '',
      folderId = null,
      id_entite
    } = req.query;

    if (!id_entite) {
      return res.status(400).json({ error: 'id_entite requis pour la requête.' });
    }

    const offset = (page - 1) * perPage;
    const params = [Number(id_entite)];
    let sql = `
      SELECT d.*, c.email AS uploaded_by_email, c.id_entite
      FROM ged_documents d
      LEFT JOIN comptes c ON d.uploaded_by = c.id_compte
      WHERE d.deleted_at IS NULL
      AND (c.id_entite = ? OR c.id_entite IS NULL)
    `;

    if (folderId && Number(folderId) > 0) {
      sql += ' AND d.id_ged IN (SELECT id_ged FROM ged_folder_files WHERE id_folder = ?)';
      params.push(Number(folderId));
    } else {
      sql += ' AND (d.id_ged NOT IN (SELECT id_ged FROM ged_folder_files) OR d.id_ged IS NOT NULL)';
    }

    if (search) {
      sql += ' AND (d.original_name LIKE ? OR d.tags LIKE ? OR d.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY d.${sort} ${dir} LIMIT ? OFFSET ?`;
    params.push(Number(perPage), Number(offset));

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(sql, params);
    await conn.end();

    res.json(rows);
  } catch (err) {
    console.error('GET /api/ged/list error:', err);
    res.status(500).json({
      error: 'Erreur lors de la récupération des fichiers',
      details: err.message
    });
  }
});




// ============================================================
// GED UPLOAD (insert + optional folder + log)
// ============================================================
app.post('/api/ged/upload', uploadGed.single('file'), async (req, res) => {
  let conn;
  try {
    const file = req.file;
    const { uploaded_by, description, folderId } = req.body;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const [insertRes] = await conn.query(
      `INSERT INTO ged_documents (filename, original_name, path, mimetype, size, description, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        file.filename,
        file.originalname,
        `/ged/${file.filename}`,
        file.mimetype,
        file.size,
        description || null,
        uploaded_by || null
      ]
    );

    const id_ged = insertRes.insertId;

    if (folderId) {
      await conn.query(
        `INSERT INTO ged_folder_files (id_folder, id_ged) VALUES (?, ?)`,
        [folderId, id_ged]
      );
    }

    await gedLog(conn, id_ged, 'UPLOAD', uploaded_by || null);
    await conn.commit();
    await conn.end();

    res.json({ success: true, id_ged, message: 'File uploaded successfully' });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error('POST /api/ged/upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ============================================================
// GED DOWNLOAD (forces download + log)
// ============================================================
app.get('/api/ged/:id/download', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.query;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(
      'SELECT d.*, c.id_entite FROM ged_documents d LEFT JOIN comptes c ON d.uploaded_by = c.id_compte WHERE d.id_ged = ?', 
      [id]
    );
    await conn.end();

    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    const file = rows[0];
    const filePath = path.join(GED_DIR, path.basename(file.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });

    // Log download
    const logConn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await gedLog(logConn, id, 'DOWNLOAD', id_compte ? parseInt(id_compte) : null);
    await logConn.end();

    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('GED Download Error:', err);
    res.status(500).json({ error: 'Failed to download file', details: err.message });
  }
});

// ============================================================
// GED VIEW (inline preview)
// ============================================================
app.get('/api/ged/:id/view', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.query;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(
      'SELECT d.*, c.id_entite FROM ged_documents d LEFT JOIN comptes c ON d.uploaded_by = c.id_compte WHERE d.id_ged = ?', 
      [id]
    );
    await conn.end();

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const file = rows[0];
    const filePath = path.join(GED_DIR, path.basename(file.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    // Log view
    const logConn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await gedLog(logConn, id, 'VIEW', id_compte ? parseInt(id_compte) : null);
    await logConn.end();

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (err) {
    console.error('GED View Error:', err);
    res.status(500).json({ error: 'Failed to preview file', details: err.message });
  }
});

// ============================================================
// GED SOFT DELETE
// ============================================================
app.delete('/api/ged/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const deleted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query('UPDATE ged_documents SET deleted_at = ?, modified_at = ? WHERE id_ged = ?', [deleted_at, deleted_at, id]);
    await gedLog(conn, id, 'SOFT_DELETE', id_compte ? parseInt(id_compte) : null);
    await conn.end();

    res.json({ message: 'File soft deleted' });
  } catch (err) {
    console.error('GED Soft Delete Error:', err);
    res.status(500).json({ error: 'Failed to soft delete', details: err.message });
  }
});

// ============================================================
// GED RESTORE
// ============================================================
app.post('/api/ged/:id/restore', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query('UPDATE ged_documents SET deleted_at = NULL, modified_at = NOW() WHERE id_ged = ?', [id]);
    await gedLog(conn, id, 'RESTORE', id_compte ? parseInt(id_compte) : null);
    await conn.end();

    res.json({ message: 'File restored' });
  } catch (err) {
    console.error('GED Restore Error:', err);
    res.status(500).json({ error: 'Failed to restore file', details: err.message });
  }
});

// ============================================================
// GED HARD DELETE
// ============================================================
app.delete('/api/ged/:id/hard', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(GED_DIR, path.basename(rows[0].filename));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await gedLog(conn, id, 'HARD_DELETE', id_compte ? parseInt(id_compte) : null);
    await conn.query('DELETE FROM ged_folder_files WHERE id_ged = ?', [id]);
    await conn.query('DELETE FROM ged_logs WHERE id_ged = ?', [id]);
    await conn.query('DELETE FROM ged_documents WHERE id_ged = ?', [id]);
    await conn.end();

    res.json({ message: 'File permanently deleted' });
  } catch (err) {
    console.error('GED Hard Delete Error:', err);
    res.status(500).json({ error: 'Failed to hard delete file', details: err.message });
  }
});

// ============================================================
// GED UPDATE METADATA
// ============================================================
app.put('/api/ged/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { category, tags, description, id_compte } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const fields = [];
    const params = [];

    if (category !== undefined) { fields.push('category = ?'); params.push(category); }
    if (tags !== undefined) { fields.push('tags = ?'); params.push(tags); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    fields.push('modified_at = NOW()');
    params.push(id);

    await conn.query(`UPDATE ged_documents SET ${fields.join(', ')} WHERE id_ged = ?`, params);
    await gedLog(conn, id, 'UPDATE_METADATA', id_compte ? parseInt(id_compte) : null, { category, tags, description });
    await conn.end();

    res.json({ message: 'File metadata updated' });
  } catch (err) {
    console.error('GED Update Metadata Error:', err);
    res.status(500).json({ error: 'Failed to update metadata', details: err.message });
  }
});
// ===== GED FOLDERS LIST =====
app.get('/api/ged/folders', async (req, res) => {
  try {
    const { id_entite, include_deleted = 'false' } = req.query;

    let whereClauses = [];
    let params = [];

    if (id_entite) {
      whereClauses.push('c.id_entite = ?');
      params.push(parseInt(id_entite));
    }

    if (include_deleted === 'false') {
      whereClauses.push('gf.deleted_at IS NULL');
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [folders] = await conn.query(`
      SELECT gf.*
      FROM ged_folders gf
      LEFT JOIN comptes c ON gf.uploaded_by = c.id_compte
      ${whereStr}
      ORDER BY gf.name ASC
    `, params);

    if (!folders.length) {
      await conn.end();
      return res.json({ folders: [] });
    }

    const folderIds = folders.map(f => f.id_folder);
    const [associations] = await conn.query(`
      SELECT id_folder, id_ged 
      FROM ged_folder_files 
      WHERE id_folder IN (${folderIds.map(() => '?').join(',')})
    `, folderIds);

    const allGedIds = [...new Set(associations.map(a => a.id_ged))];
    let gedFiles = [];
    if (allGedIds.length > 0) {
      let fileWhereClauses = [];
      let fileParams = [...allGedIds];

      if (include_deleted === 'false') {
        fileWhereClauses.push('gd.deleted_at IS NULL');
      }

      if (id_entite) {
        fileWhereClauses.push('c.id_entite = ?');
        fileParams.push(parseInt(id_entite));
      }

      const fileWhereStr = fileWhereClauses.length ? `AND ${fileWhereClauses.join(' AND ')}` : '';

      [gedFiles] = await conn.query(`
        SELECT gd.*, c.email AS uploaded_by_email
        FROM ged_documents gd
        LEFT JOIN comptes c ON gd.uploaded_by = c.id_compte
        WHERE gd.id_ged IN (${allGedIds.map(() => '?').join(',')}) ${fileWhereStr}
        ORDER BY gd.original_name ASC
      `, fileParams);
    }

    await conn.end();

    const gedMap = new Map(gedFiles.map(g => [g.id_ged, { ...g, path: `/ged/${g.filename}` }]));
    const assocByFolder = {};
    associations.forEach(a => {
      if (!assocByFolder[a.id_folder]) assocByFolder[a.id_folder] = [];
      const ged = gedMap.get(a.id_ged);
      if (ged) assocByFolder[a.id_folder].push(ged);
    });

    const enhancedFolders = folders.map(f => ({
      ...f,
      id: f.id_folder.toString(),
      children: [],
      files: assocByFolder[f.id_folder] || [],
      deleted_at: f.deleted_at
    }));

    const buildTree = (foldersList) => {
      const map = new Map(foldersList.map(f => [f.id_folder, f]));
      const roots = [];
      for (let f of foldersList) {
        if (f.parent_id) {
          const parent = map.get(f.parent_id);
          if (parent) {
            parent.children.push(f);
          }
        } else {
          roots.push(f);
        }
      }
      const sortChildren = (folder) => {
        folder.children = folder.children.filter(child => child && child.name); // Filter out undefined or nameless
        folder.children.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        folder.children.forEach(sortChildren);
      };
      roots.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      roots.forEach(sortChildren);
      return roots;
    };

    const tree = buildTree(enhancedFolders);
    res.json({ folders: tree });
  } catch (err) {
    console.error('GED Folders List Error:', err);
    res.status(500).json({ error: 'Failed to fetch folders', details: err.message });
  }
});

// ===== GED CREATE FOLDER =====
app.post('/api/ged/folders', async (req,res)=>{
  try{
    const { name, parent_id=null, id_compte } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [result] = await conn.query(`INSERT INTO ged_folders (name,parent_id,uploaded_by,created_at) VALUES (?,?,?,?)`, [name,parent_id,id_compte,created_at]);
    await conn.end();
    res.status(201).json({ message:'Folder created', id_folder: result.insertId });
  } catch(err){
    console.error('GED Create Folder Error:', err);
    res.status(500).json({ error:'Failed to create folder', details:err.message });
  }
});

// ===== GED ADD FILE TO FOLDER =====
app.post('/api/ged/folders/:id/files', async (req,res)=>{
  try{
    const id_folder= Number(req.params.id);
    const { id_ged } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query('INSERT IGNORE INTO ged_folder_files (id_folder,id_ged) VALUES (?,?)', [id_folder,id_ged]);
    await conn.end();
    res.json({ message:'File added to folder' });
  } catch(err){
    console.error('GED Add File Error:', err);
    res.status(500).json({ error:'Failed to add file', details:err.message });
  }
});

// ===== GED REMOVE FILE FROM FOLDER =====
app.delete('/api/ged/folders/:id/files/:ged_id', async (req,res)=>{
  try{
    const id_folder= Number(req.params.id);
    const id_ged= Number(req.params.ged_id);

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query('DELETE FROM ged_folder_files WHERE id_folder=? AND id_ged=?',[id_folder,id_ged]);
    await conn.end();
    res.json({ message:'File removed from folder' });
  } catch(err){
    console.error('GED Remove File Error:', err);
    res.status(500).json({ error:'Failed to remove file', details:err.message });
  }
});

// ===== GED SOFT DELETE FOLDER =====
app.delete('/api/ged/folders/:id', async (req,res)=>{
  try{
    const id_folder= Number(req.params.id);
    const { id_compte } = req.body;
    const deleted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query('UPDATE ged_folders SET deleted_at=? WHERE id_folder=?',[deleted_at,id_folder]);
    await conn.end();
    res.json({ message:'Folder soft deleted' });
  } catch(err){
    console.error('GED Soft Delete Folder Error:', err);
    res.status(500).json({ error:'Failed to soft delete folder', details:err.message });
  }
});

// ===== GED RESTORE FOLDER =====
app.post('/api/ged/folders/:id/restore', async (req,res)=>{
  try{
    const id_folder= Number(req.params.id);

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query('UPDATE ged_folders SET deleted_at=NULL WHERE id_folder=?',[id_folder]);
    await conn.end();
    res.json({ message:'Folder restored' });
  } catch(err){
    console.error('GED Restore Folder Error:', err);
    res.status(500).json({ error:'Failed to restore folder', details:err.message });
  }
});

// ===== GED HARD DELETE FOLDER =====
app.delete('/api/ged/folders/:id/hard', async (req,res)=>{
  try{
    const id_folder = parseInt(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    // Get all descendant folders
    async function getDescendants(id) {
      let ids = [id];
      const [children] = await conn.query('SELECT id_folder FROM ged_folders WHERE parent_id = ?', [id]);
      for (let child of children) {
        ids = ids.concat(await getDescendants(child.id_folder));
      }
      return ids;
    }
    const allIds = await getDescendants(id_folder);
    await conn.query(`DELETE FROM ged_folder_files WHERE id_folder IN (${allIds.map(() => '?').join(',')})`, allIds);
    await conn.query(`DELETE FROM ged_folders WHERE id_folder IN (${allIds.map(() => '?').join(',')})`, allIds);

    await conn.commit();
    await conn.end();
    res.json({ message: 'Folder and subfolders hard deleted' });
  } catch(err){
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error('GED Hard Delete Folder Error:', err);
    res.status(500).json({ error:'Failed to hard delete folder', details:err.message });
  }
});
//notifications 
// Get all notifications for a compte
// ? Notifications Endpoints (MySQL-compatible version)
app.get('/api/notifications', async (req, res) => {
  try {
    const { id_compte } = req.query;
    console.log('?? GET /api/notifications called with id_compte:', id_compte);

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
    console.error('? Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications', details: err.message });
  }
});


// ? Create a new notification
app.post('/api/notifications', async (req, res) => {
  try {
    const { contenu, type, id_compte } = req.body;
    console.log('?? POST /api/notifications called with:', { contenu, type, id_compte });

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
    console.error('? Error creating notification:', err);
    res.status(500).json({ error: 'Failed to create notification', details: err.message });
  }
});


// ? Mark a notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    console.log('?? PUT /api/notifications/:id/read', { id, id_compte });

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
    console.error('? Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to update notification', details: err.message });
  }
});


// ? Delete a single notification
app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    console.log('??? DELETE /api/notifications/:id', { id, id_compte });

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
    console.error('? Error deleting notification:', err);
    res.status(500).json({ error: 'Failed to delete notification', details: err.message });
  }
});


// ? Clear all notifications for a specific compte
app.delete('/api/notifications/clear', async (req, res) => {
  try {
    const { id_compte } = req.body;
    console.log('?? DELETE /api/notifications/clear called with id_compte:', id_compte);

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
    console.error('? Error clearing notifications:', err);
    res.status(500).json({ error: 'Failed to clear notifications', details: err.message });
  }
});

// api login + comptes 

app.get('/api/comptes', async (req, res) => {
  try {
    // Check PIN header
    const pin = req.headers['x-api-pin'];
    if (pin !== API_PIN) {
      return res.status(403).json({ error: 'Forbidden: Invalid PIN' });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        c.id_compte, c.email, c.name, c.prenom, c.certicode, c.role, c.is_suspended,
        c.created_at, c.id_entite, c.profile_id, c.avatar_url,
        e.raison_socialle AS producer_name,
        p.role AS profile_role,
        ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        pg.page_name
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      LEFT JOIN profiles p ON c.profile_id = p.id_profile
      LEFT JOIN autorisation_profile_page ap ON ap.id_profile = c.profile_id
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      ORDER BY c.id_compte DESC;
    `;

    const [rows] = await conn.query(sql);
    await conn.end();

    const accounts = {};

    for (const r of rows) {
      if (!accounts[r.id_compte]) {
        accounts[r.id_compte] = {
          id_compte: r.id_compte,
          email: r.email,
          name: r.name,
          prenom: r.prenom,
          certicode: r.certicode,
          role: r.role,
          is_suspended: !!r.is_suspended,
          created_at: r.created_at,
          id_entite: r.id_entite,
          profile_id: r.profile_id,
          avatar_url: r.avatar_url,
          producer_name: r.producer_name || null,
          permissions: []
        };
      }

      if (r.page_id) {
        accounts[r.id_compte].permissions.push({
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden
        });
      }
    }

    res.json(Object.values(accounts));

  } catch (err) {
    console.error('GET /api/comptes error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ? GET single compte
app.get('/api/comptes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT 
        c.id_compte, c.email, c.name, c.prenom, c.certicode, c.role, c.is_suspended,
        c.created_at, c.id_entite, c.profile_id, c.avatar_url,
        e.raison_socialle AS producer_name,
        p.role AS profile_role,
        ap.page_id, ap.can_read, ap.can_write, ap.is_hidden,
        pg.page_name
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      LEFT JOIN profiles p ON c.profile_id = p.id_profile
      LEFT JOIN autorisation_profile_page ap ON ap.id_profile = c.profile_id
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE c.id_compte = ?;
    `;

    const [rows] = await conn.query(sql, [id]);
    await conn.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    const account = {
      id_compte: rows[0].id_compte,
      email: rows[0].email,
      name: rows[0].name,
      prenom: rows[0].prenom,
      certicode: rows[0].certicode,
      role: rows[0].role,
      is_suspended: !!rows[0].is_suspended,
      created_at: rows[0].created_at,
      id_entite: rows[0].id_entite,
      profile_id: rows[0].profile_id,
      avatar_url: rows[0].avatar_url,
      producer_name: rows[0].producer_name || null,
      permissions: []
    };

    for (const r of rows) {
      if (r.page_id) {
        account.permissions.push({
          page_id: r.page_id,
          page_name: r.page_name,
          read: !!r.can_read,
          write: !!r.can_write,
          hide: !!r.is_hidden
        });
      }
    }

    res.json(account);
  } catch (err) {
    console.error('GET /api/comptes/:id error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ? GET account permissions (new endpoint for frontend)
app.get("/api/account-permissions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [accountRows] = await conn.query("SELECT profile_id FROM comptes WHERE id_compte = ?", [id]);
    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Compte not found" });
    }

    const profileId = accountRows[0].profile_id;

    const sql = `
      SELECT 
        ap.page_id, ap.can_read AS read, ap.can_write AS write, ap.is_hidden AS hide,
        pg.page_name
      FROM autorisation_profile_page ap
      LEFT JOIN pages pg ON ap.page_id = pg.page_id
      WHERE ap.id_profile = ?;
    `;

    const [permRows] = await conn.query(sql, [profileId]);
    await conn.end();

    res.json(permRows);
  } catch (err) {
    console.error("GET /api/account-permissions/:id error:", err);
    res.status(500).json({ error: "Failed to fetch permissions", details: err.message });
  }
});


// ? CREATE compte
app.post('/api/comptes', upload.single('avatar'), async (req, res) => {
  let conn;
  try {
    const { email, name, prenom, certicode, profile_id, id_entite, useCustomPermissions, permissions, role } = req.body;
    const avatarFile = req.file;

    if (!email || !id_entite)
      return res.status(400).json({ error: 'Email et id_entite requis' });

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const password = generatePassword();
    const hashed = await bcrypt.hash(password, 10);
    const avatarUrl = avatarFile ? `https://fp.codeonline-info.com/images/uploads/${avatarFile.filename}` : null;

    let finalProfileId = profile_id ? Number(profile_id) : 8;

    if (useCustomPermissions === 'true' || useCustomPermissions === true) {
      // Create a new custom profile
      const customRole = role ? role.trim() : `Custom_${Date.now()}`;
      const insertProfileSQL = `
        INSERT INTO profiles (id_entite, email, certicode, role, is_suspended, created_by_Entite)
        VALUES (?, ?, ?, ?, 0, ?)
      `;
      const [profileRes] = await conn.query(insertProfileSQL, [
        id_entite, email || null, certicode || null, customRole, id_entite || null
      ]);
      finalProfileId = profileRes.insertId;

      // Insert custom permissions to the new profile
      const parsed = typeof permissions === 'string' ? JSON.parse(permissions) : permissions || [];
      for (const p of parsed) {
        await conn.query(`
          INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, [finalProfileId, p.page_id, p.read ? 1 : 0, p.write ? 1 : 0, p.hide ? 1 : 0]);
      }
    }

    // ? Insert compte with the profile_id (either selected or new custom)
    const [result] = await conn.query(`
      INSERT INTO comptes (email, name, prenom, certicode, password, profile_id, id_entite, is_suspended, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `, [email, name || null, prenom || null, certicode || null, hashed, finalProfileId, id_entite, avatarUrl]);

    const newId = result.insertId;

    await conn.commit();
    await conn.end();

    // ? Email sending (outside transaction)
    try {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: email,
        subject: 'Nouveau compte créé',
        text: `Votre compte a été créé.\nEmail: ${email}\nMot de passe: ${password}\nCerticode: ${certicode || 'N/A'}\nLien: https://edi-dev.codeonline-info.com/`
      });
    } catch (mailErr) {
      console.error('Email send error:', mailErr.message);
    }

    res.status(201).json({ id_compte: newId, email, password });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error('POST /api/comptes error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ? UPDATE compte
app.put('/api/comptes/:id', upload.single('avatar'), async (req, res) => {
  let conn;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id_compte' });

    const { name, prenom, email, password, certicode, profile_id, id_entite, is_suspended, role, useCustomPermissions, permissions } = req.body;
    const avatarFile = req.file;

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const [accountRows] = await conn.query('SELECT * FROM comptes WHERE id_compte = ?', [id]);
    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    const oldProfileId = accountRows[0].profile_id;

    const [oldProfileRows] = await conn.query('SELECT role FROM profiles WHERE id_profile = ?', [oldProfileId]);
    const oldRole = oldProfileRows[0]?.role || '';

    let finalProfileId = profile_id ? Number(profile_id) : oldProfileId;

    if (useCustomPermissions === 'true' || useCustomPermissions === true) {
      let customProfileId;
      let customRoleName = role ? role.trim() : oldRole.startsWith('Custom') ? oldRole : `Custom_${Date.now()}`;
      if (oldRole.startsWith('Custom')) {
        customProfileId = oldProfileId;
        // Update existing custom profile if needed
        await conn.query('UPDATE profiles SET email = ?, certicode = ?, role = ? WHERE id_profile = ?', [email || null, certicode || null, customRoleName, customProfileId]);
      } else {
        // Create new custom profile
        const insertProfileSQL = `
          INSERT INTO profiles (id_entite, email, certicode, role, is_suspended, created_by_Entite)
          VALUES (?, ?, ?, ?, 0, ?)
        `;
        const [profileRes] = await conn.query(insertProfileSQL, [
          id_entite || accountRows[0].id_entite, email || null, certicode || null, customRoleName, id_entite || null
        ]);
        customProfileId = profileRes.insertId;
      }

      // Delete old permissions for this custom profile
      await conn.query('DELETE FROM autorisation_profile_page WHERE id_profile = ?', [customProfileId]);

      // Insert new permissions
      const parsed = typeof permissions === 'string' ? JSON.parse(permissions) : permissions || [];
      for (const p of parsed) {
        await conn.query(`
          INSERT INTO autorisation_profile_page (id_profile, page_id, can_read, can_write, is_hidden, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, [customProfileId, p.page_id, p.read ? 1 : 0, p.write ? 1 : 0, p.hide ? 1 : 0]);
      }

      finalProfileId = customProfileId;
    } else {
      // If switching from custom to standard profile, delete the old custom profile and its permissions
      if (oldRole.startsWith('Custom')) {
        await conn.query('DELETE FROM autorisation_profile_page WHERE id_profile = ?', [oldProfileId]);
        await conn.query('DELETE FROM profiles WHERE id_profile = ?', [oldProfileId]);
      }
    }

    let avatarUrl = accountRows[0].avatar_url;
    if (avatarFile) avatarUrl = `https://fp.codeonline-info.com/images/uploads/${avatarFile.filename}`;
    let hashedPassword = accountRows[0].password;
    if (password) hashedPassword = await bcrypt.hash(password, 10);

    const fields = [];
    const values = [];
    const push = (f, v) => { fields.push(`${f} = ?`); values.push(v); };

    if (name !== undefined) push('name', name);
    if (prenom !== undefined) push('prenom', prenom);
    if (email !== undefined) push('email', email);
    if (password) push('password', hashedPassword);
    if (certicode !== undefined) push('certicode', certicode);
    if (id_entite !== undefined) push('id_entite', id_entite);
    if (is_suspended !== undefined) push('is_suspended', is_suspended);
    if (role !== undefined && !useCustomPermissions) push('role', role);
    if (avatarUrl && avatarFile) push('avatar_url', avatarUrl); // Only update if new file

    // Always update profile_id
    push('profile_id', finalProfileId);

    if (fields.length > 0) {
      values.push(id);
      const sql = `UPDATE comptes SET ${fields.join(', ')} WHERE id_compte = ?`;
      await conn.query(sql, values);
    }

    await conn.commit();
    await conn.end();

    res.json({ message: 'Compte mis à jour avec succès', id_compte: id });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error('PUT /api/comptes/:id error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ? Suspend / Reactivate compte
app.patch('/api/comptes/:id_compte/suspend', async (req, res) => {
  const { id_compte } = req.params;
  const { is_suspended } = req.body;

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [result] = await conn.query('UPDATE comptes SET is_suspended = ? WHERE id_compte = ?', [is_suspended, id_compte]);
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ id_compte, is_suspended });
  } catch (err) {
    console.error('PATCH /api/comptes/:id_compte/suspend error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// ? DELETE compte
app.delete('/api/comptes/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.beginTransaction();

    const [accountRows] = await conn.query("SELECT profile_id FROM comptes WHERE id_compte = ?", [id]);
    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Compte not found" });
    }
    const profileId = accountRows[0].profile_id;

    const [profileRows] = await conn.query("SELECT role FROM profiles WHERE id_profile = ?", [profileId]);
    const role = profileRows[0]?.role || '';

    // Delete permissions
    await conn.query("DELETE FROM autorisation_profile_page WHERE id_profile = ?", [profileId]);

    // If custom profile, delete the profile
    if (role.startsWith('Custom')) {
      await conn.query("DELETE FROM profiles WHERE id_profile = ?", [profileId]);
    }

    // Delete the account
    const [result] = await conn.query("DELETE FROM comptes WHERE id_compte = ?", [id]);

    await conn.commit();
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: "Compte not found" });

    console.log("??? Compte deleted:", id);
    res.json({ message: "Compte deleted successfully" });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      await conn.end().catch(() => {});
    }
    console.error("? DELETE /api/comptes/:id error:", err);
    res.status(500).json({ error: "Failed to delete compte", details: err.message });
  }
});

// ? Current user
app.get('/api/current-user/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [rows] = await conn.query(`
      SELECT c.*, e.raison_socialle AS producer_name
      FROM comptes c
      LEFT JOIN Entite e ON c.id_entite = e.id_entite
      WHERE c.id_compte = ?
    `, [id]);
    if (rows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Compte introuvable' });
    }

    const [permissions] = await conn.query(`
      SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden, p.page_name
      FROM autorisation_profile_page ap
      JOIN pages p ON ap.page_id = p.page_id
      WHERE ap.id_profile = ?
    `, [rows[0].profile_id || id]);

    await conn.end();
    res.json({ ...rows[0], permissions });
  } catch (err) {
    console.error('GET /api/current-user/:id error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: err.message });
  }
});

// Login endpoint (fixed runDB to runUpdate)
app.post('/api/login', async (req, res) => {
  if (!entiteDB) {
    console.error('Login failed: entiteDB unavailable');
    return res.status(503).json({ error: 'Database unavailable - try again later' });
  }

  const { email, password, certicode } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // Fetch account
    const accounts = await queryDB(entiteDB, `
      SELECT c.id_compte, c.email, c.password, c.role, c.profile_id,
             c.is_suspended, c.created_at, c.id_entite,
             c.prenom, c.name AS nom,
             c.certicode, c.certicode_generated_at,
             p.raison_socialle AS producer_name
      FROM comptes c
      LEFT JOIN Entite p ON c.id_entite = p.id_entite
      WHERE c.email = ?
    `, [email]);

    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const account = accounts[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, account.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Suspended account
    if (account.is_suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    const isBackoffice = (email === 'fp_back_office@codeonline-info.com');

    // Handle certicode
    if (!isBackoffice) {
      if (!certicode) {
        // Generate and send certicode
        const newCerticode = generateCerticode();
        await runUpdate(entiteDB,
          'UPDATE comptes SET certicode = ?, certicode_generated_at = CURRENT_TIMESTAMP WHERE id_compte = ?',
          [newCerticode, account.id_compte]
        );

        await transporter.sendMail({
          from: FROM_EMAIL,
          to: email,
          subject: 'Votre Certicode pour Codeonline EDI',
          text: `Votre certicode est : ${newCerticode}. Il expire dans 60 secondes.`,
        });

        return res.json({ status: 'certicode_sent' });
      } else {
        // Validate certicode
        if (!account.certicode || account.certicode !== certicode) {
          return res.status(401).json({ error: 'Invalid certicode' });
        }

        const generatedAt = new Date(account.certicode_generated_at).getTime();
        if (Date.now() - generatedAt > 60 * 1000) {
          return res.status(401).json({ error: 'Certicode expired' });
        }

        // Clear certicode after successful use
        await runUpdate(entiteDB,
          'UPDATE comptes SET certicode = NULL, certicode_generated_at = NULL WHERE id_compte = ?',
          [account.id_compte]
        );
      }
    }

    // Fetch permissions
    const permissions = await queryDB(entiteDB, `
      SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden
      FROM autorisation_profile_page ap
      WHERE ap.id_profile = ?
    `, [account.profile_id || account.id_compte]);

    return res.json({
      id_compte: account.id_compte,
      email: account.email,
      prenom: account.prenom,
      nom: account.nom,
      role: account.role,
      profile_id: account.profile_id,
      permissions: permissions.map(p => ({
        page_id: p.page_id,
        read: p.can_read,
        write: p.can_write,
        hide: p.is_hidden
      })),
      producer_name: account.producer_name,
      id_entite: account.id_entite
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
    const query = 'SELECT * FROM notifaction_flashmobile WHERE status = 1 ORDER BY date_notif DESC';
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
    const query = 'SELECT * FROM notifaction_flashmobile WHERE id_notif = ?';
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
    INSERT INTO notifaction_flashmobile (titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en, date_notif, status)
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
  const query = `UPDATE notifaction_flashmobile SET ${fields.join(', ')} WHERE id_notif = ?`;
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

// GET /api/notif_responses - Fetch all responses (for admin) or for specific entite
app.get('/api/notif_responses', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const { entite } = req.query;
  let query;
  let params = [];
  if (entite) {
    if (isNaN(parseInt(entite))) {
      return res.status(400).json({ error: 'Invalid entite ID' });
    }
    query = 'SELECT * FROM notif_responses WHERE id_entite = ? ORDER BY date_response DESC';
    params = [parseInt(entite)];
  } else {
    query = `
      SELECT nr.*, e.raison_socialle 
      FROM notif_responses nr 
      LEFT JOIN Entite e ON nr.id_entite = e.id_entite 
      ORDER BY date_response DESC
    `;
  }
  try {
    const responses = await queryDB(entiteDB, query, params);
    res.json(responses);
  } catch (err) {
    console.error('Error fetching responses:', err.message);
    res.status(500).json({ error: 'Failed to fetch responses', details: err.message });
  }
});

// POST /api/notif_responses - Add a new response
app.post('/api/notif_responses', async (req, res) => {
  if (!entiteDB) {
    console.error('EntiteDb connection unavailable');
    return res.status(503).json({ error: 'Database unavailable', details: 'EntiteDb connection not established' });
  }
  const { id_notif, id_entite, response } = req.body;
  if (!id_notif || !id_entite || !response || !['interesse', 'participe'].includes(response)) {
    return res.status(400).json({ error: 'All fields are required and response must be "interesse" or "participe"' });
  }
  const date_response = getCurrentDate();
  const query = `
    INSERT INTO notif_responses (id_notif, id_entite, response, date_response)
    VALUES (?, ?, ?, ?)
  `;
  try {
    const result = await runUpdate(entiteDB, query, [id_notif, id_entite, response, date_response]);
    res.status(201).json({ message: 'Response added', id: result.lastID });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Response already exists for this notification and entite' });
    }
    console.error('Error adding response:', err.message);
    res.status(500).json({ error: 'Failed to add response', details: err.message });
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
    const result = await runUpdate(entiteDB, 'DELETE FROM notifaction_flashmobile WHERE id_notif = ?', [parseInt(id)]);
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
      avatar_url = `/images/uploads/${req.file.filename}`;
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


// ? FINAL FIXED ENDPOINT: Send connection info PDF (MySQL + frontend match)
app.post('/api/send-connection-info', async (req, res) => {
  console.log('?? /api/send-connection-info body:', req.body);
  const { email, password } = req.body;
  console.log('?? email received:', email);

  if (!email) return res.status(400).json({ error: 'Email is required' });
  let conn;
  try {
    conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    console.log('? Connected to MySQL');

    const [rows] = await conn.query(
      'SELECT * FROM comptes WHERE email = ?',
      [email]
    );
    console.log('?? comptes query result:', rows);

    if (rows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = rows[0];
    const company = { raison_socialle: 'CEPEX' };
    const newPassword = password || Math.random().toString(36).slice(-10);
    const hashed = await bcrypt.hash(newPassword, 10);

    await conn.query(
      'UPDATE comptes SET password = ? WHERE id_compte = ?',
      [hashed, account.id_compte]
    );
    console.log('?? Password updated for', email);

    const pdfBuffer = await generateFichePDF(account, company, newPassword);
    console.log('?? PDF generated successfully');

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: 'Vos informations de connexion',
      text: `Bonjour ${account.prenom || ''},\n\nVeuillez trouver ci-joint votre fiche de connexion.\n\nCordialement,\nLe support CodeOnline.`,
      attachments: [
        { filename: 'fiche_connexion.pdf', content: pdfBuffer, contentType: 'application/pdf' }
      ]
    });
    console.log('?? Email sent to', email);

    await conn.end();
    res.json({ message: 'Fiche connexion envoyée avec succès', email });
  } catch (err) {
    console.error('? send-connection-info failed:', err);
    if (conn) await conn.end().catch(() => {});
    res.status(500).json({ error: err.message });
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

app.get("/api/account-permissions/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id_compte" });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    // 1?? Find the user's profile_id
    const [accountRows] = await conn.query(
      "SELECT profile_id FROM comptes WHERE id_compte = ?",
      [id]
    );

    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Compte not found" });
    }

    const profileId = accountRows[0].profile_id;

    let permQuery;
    let permParams;

    // 2?? If user has profile_id ? fetch profile permissions
    if (profileId) {
      permQuery = `
        SELECT 
          ap.page_id,
          ap.can_read AS read,
          ap.can_write AS write,
          ap.is_hidden AS hide,
          pg.page_name
        FROM autorisation_profile_page ap
        LEFT JOIN pages pg ON ap.page_id = pg.page_id
        WHERE ap.id_profile = ?;
      `;
      permParams = [profileId];
    } 
    // 3?? Otherwise (custom permissions, no profile) ? use compte.id_compte as fallback
    else {
      permQuery = `
        SELECT 
          ap.page_id,
          ap.can_read AS read,
          ap.can_write AS write,
          ap.is_hidden AS hide,
          pg.page_name
        FROM autorisation_profile_page ap
        LEFT JOIN pages pg ON ap.page_id = pg.page_id
        WHERE ap.id_profile = ?;
      `;
      permParams = [id];
    }

    const [permRows] = await conn.query(permQuery, permParams);
    await conn.end();

    res.json(permRows || []);
  } catch (err) {
    console.error("? GET /api/account-permissions/:id error:", err);
    res.status(500).json({
      error: "Failed to fetch permissions",
      details: err.message,
    });
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
