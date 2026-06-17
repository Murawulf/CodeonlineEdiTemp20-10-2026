const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs'); // Single import for fs and fs.promises
const multer = require('multer');
const chokidar = require('chokidar');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('âŒ FATAL: JWT_SECRET is required (set it in /var/www/Edi-dev/backend/.env on every node â€” same value across the EDI network).');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const safeErrDetails = (err) => (IS_PRODUCTION ? undefined : (err && err.message) || String(err));

// Service token helpers (centralisÃ©s dans services/serviceAuth.js)
const { getServiceToken, serviceAuthHeaders } = require('./services/serviceAuth');

/**
 * JWT Authentication Middleware
 * Validates Bearer token on all protected routes.
 * Routes excluded: POST /api/login
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: token expired' });
    }
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
};
const { generateOrderEANCOM_Enhanced } = require('./generateOrderEANCOM_enhanced');
const { generateOrderResponseEANCOM } = require('./generateOrderResponseEANCOM');
const { generateDesadvEANCOM } = require('./generateDesadvEANCOM');
const { generateInvoicEANCOM } = require('./generateInvoicEANCOM');
const { createEdiTransmission, updateEdiTransmissionStatus, getEdiTransmissions, incrementRetryCount } = require('./edi_transmission_helper');
const { notifyOrderSent, notifyOrderReceived, notifyOrderResponseReceived, notifyInvoiceReceived } = require('./notification_helper');
const { queryDB, runUpdate, queryOne } = require('./db_utils');
const EDIWorker = require('./workers/edi_worker');
const keyManager = require('./services/crypto/KeyManager');
const { router: ediWorkerRouter, initializeRoutes: initEdiWorkerRoutes } = require('./routes/edi_worker_routes');
const ediWorkerConfig = require('./config/edi_worker_config');
const configService = require('./services/configService');
const discoveryCache = require('./services/communication/DiscoveryCache');
const auditLogger = require('./services/communication/AuditLogger');
const settingsRoutes = require('./routes/settings_routes');
const apiProxyRoutes = require('./routes/api_proxy');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Export io for use in other modules
global.io = io;
const pendingUpdates = new Map(); // For certicode storage: id_compte -> {certicode, expire, newEmail}
const xlsx = require('xlsx'); // For Excel parsing in bulk
const ExcelJS = require('exceljs');
// ==================== CONFIG ====================
// configService.get('API_PIN') is now loaded from database via configService
// EANCOM_BASE_DIR is now dynamically loaded from database via configService.getEdiOrdersPath()

const csvParser = require('csv-parser'); // For CSV
// Minimal per-API logging middleware (concise)
app.use((req, res, next) => {
  console.log(`[DEBUG REQUEST] ${req.method} ${req.url} (Original: ${req.originalUrl})`);
  const start = Date.now();
  const bodyPreview = (req.method === 'GET' || !req.body) ? '' : ` body=${JSON.stringify(req.body).slice(0, 200)}`;
  console.log(`[API] ${req.method} ${req.originalUrl}${bodyPreview}`);
  res.on('finish', () => {
    console.log(`[API] ${req.method} ${req.originalUrl} => ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

const csv = require('csv-parser');
const sanitizeHtml = require('sanitize-html'); // Add this dependency for HTML sanitization
const router = express.Router();
const XLSX = require('xlsx');

const GED_DIR = process.env.GED_DIR || path.join(__dirname, 'uploads', 'ged');
if (!fs.existsSync(GED_DIR)) {
  try {
    fs.mkdirSync(GED_DIR, { recursive: true });
    console.log('?? GED directory created:', GED_DIR);
  } catch (error) {
    console.error('?? Error creating GED directory:', error.message);
    // Fallback to local uploads/ged if permission denied (dev mode fallback)
    if (error.code === 'EACCES') {
      const localGedDir = path.join(__dirname, 'uploads', 'ged');
      console.log('?? Falling back to local GED directory:', localGedDir);
      if (!fs.existsSync(localGedDir)) {
        fs.mkdirSync(localGedDir, { recursive: true });
      }
    } else {
      throw error;
    }
  }
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
   B)  PRODUCT IMAGES â€“ /var/www/codeonline-fp/images/products
   -------------------------------------------------------------- */
const PRODUCTS_DIR = process.env.PRODUCTS_DIR || path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(PRODUCTS_DIR)) {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
}



// Helper: safe JSON stringify for log details
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

// ? Target folder for logo uploads
const logosDir = process.env.LOGOS_DIR || path.join(__dirname, 'uploads', 'logo_entite');

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
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(__dirname, 'uploads');
app.use('/images/logo_entite', express.static(path.join(IMAGES_DIR, 'logo_entite')));
app.use(express.static(IMAGES_DIR));
app.use('/images', express.static(IMAGES_DIR));






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
    res.status(500).json({ error: 'Authentication failed', details: safeErrDetails(err) });
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
const MODELES_DIR = process.env.MODELES_DIR || path.join(__dirname, 'Modeles');
// *_DB_PATH constants supprimÃ©es : exclusivement MySQL via entitePool (config/database.js)

// Centralized Database Config
const { pool: entitePool, dbConfig } = require('./config/database');
const ENTITE_MYSQL_CONFIG = dbConfig; // alias used by Dev2 routes

// Create caracteristiques tables in MySQL if they don't exist
(async () => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(`CREATE TABLE IF NOT EXISTS caracteristiques (
      id_carac INT AUTO_INCREMENT PRIMARY KEY,
      id_entite INT NOT NULL,
      identification VARCHAR(500) NOT NULL,
      description_fr TEXT,
      description_en TEXT,
      description_ar TEXT,
      nature VARCHAR(100),
      utilite TEXT,
      date_lancement DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS caracteristiques_elements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_carac INT NOT NULL,
      nom_element VARCHAR(255),
      type_element VARCHAR(50),
      options_element TEXT,
      valeur_default TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS caracteristiques_illustrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_carac INT NOT NULL,
      filename VARCHAR(500),
      type VARCHAR(20),
      url TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.end();
    console.log('[MySQL] caracteristiques tables verified/created');
  } catch (e) {
    console.warn('[MySQL] caracteristiques table init warning:', e.message);
  }
})();

const EANCOM_BASE_DIR = process.env.EANCOM_BASE_DIR || path.join(__dirname, 'uploads', 'eancom');
const EDI_ORDERS_PATH = process.env.EDI_ORDERS_PATH || path.join(__dirname, 'uploads', 'orders');

const FILES_JSON_PATH = path.join(MODELES_DIR, 'files.json');

// Environment variables (override with .env file if used)
// Email config is now loaded from database via configService
// const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || '948ac0001@smtp-brevo.com';
// const BREVO_API_KEY = process.env.BREVO_API_KEY || 'FntGXAkHcyIv1ZSp';
// const getFromEmail() = process.env.getFromEmail() || 'netconsultingeurope20@gmail.com';
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



const avatarDir = process.env.AVATAR_DIR || path.join(__dirname, 'uploads', 'avatars');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
  console.log('?? Created avatar upload directory:', avatarDir);
} else {
  console.log('? Avatar upload directory exists:', avatarDir);
}

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

// Multer for in-memory file uploads (Excel, CSV files)
const multerMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files allowed'));
    }
  }
});












// CORS must be first, before any other middleware
// TODO : add the list in the database app_params
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Get allowed origins from config or use default list
    const configOrigins = configService.get('ALLOWED_ORIGINS');
    let allowedOrigins = [
      'https://edi-dev.codeonline-info.com',
      'https://dev.codeonline-edi.net',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:5173', // Vite default port
      'http://127.0.0.1:5173',
      'http://192.168.11.104:8080',
      'http://localhost:8081'
    ];

    // Ajouter l'URL frontend dynamiquement depuis l'environnement
    if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    if (configOrigins) {
      try {
        const parsed = JSON.parse(configOrigins);
        if (Array.isArray(parsed)) {
          allowedOrigins = [...allowedOrigins, ...parsed];
        }
      } catch (e) {
        console.warn('Failed to parse ALLOWED_ORIGINS config:', e.message);
      }
    }

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.error(`[CORS ERROR] Origin not allowed: "${origin}"`);
      console.error(`[CORS ERROR] Allowed origins:`, allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-pin', 'x-entite-id'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());

// Static files after CORS
app.use('/ged', express.static(GED_DIR));
app.use(express.static('public'))
// Serve static files
app.use('/Modeles', express.static(MODELES_DIR));

// JWT protection: all /api routes except POST /api/login and GET /api/settings
// Mounted BEFORE any /api/* route handlers so middleware actually runs.
const JWT_EXCLUDED_PATHS = [
  { path: '/login', method: 'POST' },
  { path: '/settings', method: 'GET' },
  { path: '/companies/template', method: 'GET' },
];
app.use('/api', (req, res, next) => {
  const isExcluded = JWT_EXCLUDED_PATHS.some(
    e => req.path === e.path && req.method === e.method
  );
  if (isExcluded) return next();
  return verifyJWT(req, res, next);
});

// connectDB() supprimÃ© : connexion exclusivement MySQL via entitePool (config/database.js).

// Initialize databases (entiteDB est l'unique pool MySQL : ex-usersDB/allgpcDB/fieldrulesDB pointent dessus)
let entiteDB;
async function initializeDatabases() {
  try {
    // Connexion unique : pool MySQL (entitePool) + adapter sqlite-like exposÃ© via entiteDB
    try {
      if (entitePool) {
        const connection = await entitePool.getConnection();
        const { dbConfig } = require('./config/database');
        console.log('âœ… MySQL connection test successful - Connected to remote database at', dbConfig.host);
        connection.release();
      } else {
        console.warn('Warning: entitePool is not initialized');
      }
    } catch (testErr) {
      console.error('âŒ MySQL connection test failed:', testErr.message);
    }

    if (entitePool) {
      // Adapter object to emulate sqlite3.Database methods used in the code
      entiteDB = {
        __isMysql: true,
        pool: entitePool,

        all: async function (sql, params, cb) {
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

        run: async function (sql, params, cb) {
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

        serialize: function (fn) {
          // No-op for MySQL pool; just execute the function
          try { fn(); } catch (e) { setImmediate(() => { throw e; }); }
        },

        prepare: function (sql) {

          // Return an object with run and finalize to mimic sqlite's prepare().run().finalize()
          return {
            run: async function (...args) {
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
            finalize: function (cb) { if (cb) cb(null); }
          };
        },

        close: async function (cb) {
          console.log("? MySQL pool close suppressed â€” keeping DB alive");
          if (cb) return cb(null);
        }

      };

    } else {
      // MySQL pool indisponible : pas de fallback SQLite (BDD distante exclusivement)
      throw new Error('entitePool not initialized â€” MySQL connection required, no SQLite fallback');
    }
    // Tables (comptes, Entite, GPC, users legacy, etc.) sont gÃ©rÃ©es par les
    // migrations SQL (sql/migrations/*.sql) et le dump initial. Plus de
    // CREATE TABLE IF NOT EXISTS au boot.

  } catch (err) {
    console.error('Failed to initialize critical databases:', err.message);
    process.exit(1);
  }
}

// Initialize GPC tables
// Initialize users database tables
// At server startup

// Database utility functions are now imported from db_utils.js


// Ensure getCurrentDate is defined at the top of server.js
function getCurrentDate() {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const year = now.getFullYear();
  return `${month}-${day}-${year}`;
}

// Nodemailer configuration with Brevo SMTP
// Initialized in initMailer() after configService is ready
let transporter = null;

// Helper to get from email
const getFromEmail = () => {
  return configService.get('FROM_EMAIL') || process.env.FROM_EMAIL || 'netconsultingeurope20@gmail.com';
};

// Initialize Mailer function â€” supports both Brevo SMTP and Brevo REST API
const { createMailTransporter } = require('./services/mailTransporter');
const initMailer = async () => {
  const smtpUser = configService.get('BREVO_SMTP_USER') || process.env.BREVO_SMTP_USER || '948ac0003@smtp-brevo.com';
  const mailKey  = configService.get('BREVO_API_KEY')  || process.env.BREVO_API_KEY;
  const fromEmail = getFromEmail();

  if (!mailKey) {
    console.warn('âš ï¸  BREVO_API_KEY is not set â€” emails will not be sent.');
    transporter = null;
    return;
  }

  transporter = createMailTransporter({
    user: smtpUser,
    pass: mailKey,
    host: 'smtp-relay.brevo.com',
    port: 587,
    defaultFrom: fromEmail,
  });

  const info = transporter._info || {};
  console.log(`ðŸ“¨ Mailer backend: ${info.backend} (user=${info.user}, keyLen=${info.keyLen})`);

  try {
    await transporter.verify();
    console.log(`âœ… Brevo (${info.backend}) is ready to send emails`);
  } catch (error) {
    console.error(`âŒ Critical: Brevo (${info.backend}) cannot authenticate. Check key/user/network.`, error.message);
  }
};


// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Backend API Server is running',
    version: '1.0.0',
    endpoints: {
      api: '/api/*',
      health: '/health'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    databases: {
      mysql: entiteDB && entiteDB.__isMysql ? 'connected' : 'disconnected',
      sqlite: {
        users: entiteDB ? 'connected' : 'disconnected',
        allgpc: entiteDB ? 'connected' : 'disconnected',
        fieldrules: entiteDB ? 'connected' : 'disconnected'
      }
    }
  });
});

// Fetch distinct regions from Region_national table
app.get('/api/regions', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query('SELECT DISTINCT gouvernorat AS region FROM Region_national WHERE gouvernorat IS NOT NULL');
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching regions:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Failed to fetch regions', details: safeErrDetails(err) });
  }
});

// Fetch delegations
app.get('/api/delegations', async (req, res) => {
  const { region } = req.query;
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch delegations', details: safeErrDetails(err) });
  }
});

// Fetch localites
app.post('/api/localites', async (req, res) => {
  const { name_delegation } = req.body;
  if (!name_delegation) {
    return res.status(400).json({ error: 'name_delegation is required', details: 'Missing required field' });
  }
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch localites', details: safeErrDetails(err) });
  }
});
// Seed companies, municipalites, and localites
app.get('/api/seed-companies', async (req, res) => {
  if (!entiteDB) {
    return res.status(503).json({ error: 'EntiteDb.db is unavailable', details: 'Database connection not established' });
  }
  if (!entiteDB) {
    return res.status(503).json({ error: 'users.db is unavailable', details: 'Database connection not established' });
  }
  try {
    await entiteDB.serialize(async () => {
      const sampleMunicipalites = [
        { id_municipalite: 1, libelle_municipalite_fr: 'El Hrairia', libelle_municipalite_ar: '????????', id_region: 1 },
        { id_municipalite: 2, libelle_municipalite_fr: 'Ariana Ville', libelle_municipalite_ar: '?????? ???????', id_region: 2 },
      ];
      for (const mun of sampleMunicipalites) {
        await runUpdate(
          entiteDB,
          `INSERT IGNORE INTO municipalite (id_municipalite, libelle_municipalite_fr, libelle_municipalite_ar, id_region)
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
          `INSERT IGNORE INTO localite (localite, code_postal, id_municipalite)
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
          `INSERT IGNORE INTO Entite (
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
    res.status(500).json({ error: 'Failed to seed data', details: safeErrDetails(err) });
  }
});

// ============================================================
// SEGMENTS
// ============================================================
app.get('/api/segments', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
// ? GET /api/classes â€” Return all or filtered by codeFamille
// ============================================================
app.get('/api/classes', async (req, res) => {
  const { codeFamille } = req.query;
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch classes', details: safeErrDetails(err) });
  }
});


app.post('/api/update-classe', async (req, res) => {
  const { codeClasse, libelleClasse, libelleClasse_en, libelleClasse_ar } = req.body;
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch bricks', details: safeErrDetails(err) });
  }
});

app.post('/api/update-brick', async (req, res) => {
  const { codeBrique, libelleBrique, libelleBrique_en, libelleBrique_ar } = req.body;
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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
  if (!entiteDB) {
    return res.status(503).json({ error: 'users.db is unavailable', details: 'Database connection not established' });
  }
  try {
    const users = await queryDB(entiteDB, `
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
      const marches = await queryDB(entiteDB, `
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// Fetch all pages
app.get('/api/pages', async (req, res) => {
  try {
    const pages = await queryDB(entiteDB, 'SELECT page_id, page_name FROM pages', []);
    res.json(pages);
  } catch (err) {
    console.error('Error fetching pages:', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
// ? PROFILES API â€” MySQL Compatible (Matches Products Style)
// ==================================================
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(dbConfig);

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
    res.status(500).json({ error: 'Failed to fetch profile', details: safeErrDetails(err) });
  }
});


app.get("/api/profiles", async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);

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
    res.status(500).json({ error: "Failed to fetch profiles", details: safeErrDetails(err) });
  }
});


// ?? POST /api/profiles â€” Create new profile
app.post("/api/profiles", async (req, res) => {
  let conn;
  try {
    const { id_entite, role, email, certicode, created_by_Entite, permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ error: "Permissions array missing or invalid" });
    }

    conn = await mysql.createConnection(dbConfig);
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
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error("? POST /api/profiles error:", err);
    res.status(500).json({ error: "Failed to create profile", details: safeErrDetails(err) });
  }
});


// ?? PUT /api/profiles/:id_profile â€” Update existing profile
app.put("/api/profiles/:id_profile", async (req, res) => {
  let conn;
  try {
    const { id_profile } = req.params;
    const { id_entite, role, email, certicode, permissions } = req.body;

    conn = await mysql.createConnection(dbConfig);
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
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error("? PUT /api/profiles/:id_profile error:", err);
    res.status(500).json({ error: "Failed to update profile", details: safeErrDetails(err) });
  }
});


// ?? PATCH /api/profiles/:id_profile/suspend â€” Suspend/Unsuspend profile
app.patch("/api/profiles/:id_profile/suspend", async (req, res) => {
  try {
    const { id_profile } = req.params;
    const { is_suspended } = req.body;

    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query(
      "UPDATE profiles SET is_suspended=? WHERE id_profile=?",
      [is_suspended ? 1 : 0, id_profile]
    );
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: "Profile not found" });

    res.json({ message: `Profile ${is_suspended ? "suspended" : "unsuspended"} successfully` });
  } catch (err) {
    console.error("? PATCH /api/profiles/:id_profile/suspend error:", err);
    res.status(500).json({ error: "Failed to update suspension", details: safeErrDetails(err) });
  }
});


// ?? DELETE /api/profiles/:id_profile â€” Delete profile and its permissions
app.delete("/api/profiles/:id_profile", async (req, res) => {
  let conn;
  try {
    const { id_profile } = req.params;

    conn = await mysql.createConnection(dbConfig);
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
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error("? DELETE /api/profiles/:id_profile error:", err);
    res.status(500).json({ error: "Failed to delete profile", details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    const activeBricks = await queryDB(entiteDB, 'SELECT COUNT(*) as activeBricks FROM brickgpc WHERE status_br = 1', []);
    const totalBricks = await queryDB(entiteDB, 'SELECT COUNT(*) as totalBricks FROM brickgpc', []);
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
    res.status(500).json({ error: 'Internal server error', details: safeErrDetails(err) });
  }
});

// Enterprises by sector endpoint
app.get('/api/enterprises-by-sector', async (req, res) => {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  try {
    const rows = await queryDB(entiteDB, `
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
    res.status(500).json({ error: 'Internal server error', details: safeErrDetails(err) });
  }
});


// Product sheets by sector endpoint
app.get('/api/product-sheets-by-sector', async (req, res) => {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  try {
    const ficheProduitRows = await queryDB(entiteDB, 'SELECT codeClasse, COUNT(id) as count FROM fiche_produit GROUP BY codeClasse', []);
    const results = [];
    for (const row of ficheProduitRows) {
      const segmentRows = await queryDB(entiteDB, `
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
    res.status(500).json({ error: 'Internal server error', details: safeErrDetails(err) });
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
        entiteDB,
        'INSERT IGNORE INTO region_ref (id_region, libelle_region_fr, libelle_region_ar) VALUES (?, ?, ?)',
        [region.id_region, region.libelle_region_fr, region.libelle_region_ar]
      );
    }
    res.json({ message: 'Regions seeded successfully' });
  } catch (err) {
    console.error('Error seeding regions:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});
//-------------------------------------------------------------
//  FULL FIXED COMPANY API (7 ENDPOINTS)
//-------------------------------------------------------------
//  FULL COMPANY API (7 ENDPOINTS) ?
//  Compatible with Entite.tsx + MySQL schema
// Protect /api/companies with a PIN
// FULL FIXED COMPANY API (7 ENDPOINTS + SITES)
// Compatible with Entite.tsx + MySQL schema (gln in site, not entite)
// Protect /api/companies with a PIN
// GET /api/companies/max-id
app.get("/api/companies/template", async (req, res) => {
  try {
    const SEGMENTS = [
      '10000000 - Nourriture/Soins pour animal',
      '120000000 - Ingénierie & Services',
      '47000000 - Produits d\'Entretien/Nettoyage',
      '50000000 - Nourriture/Boisson',
      '51000000 - Santé',
      '53000000 - Beauté/Soin Personnel/Hygiène',
      '54000000 - Soins Bébé Puériculture',
      '60000000 - Oeuvres Textuelles/Imprimées/De Référence',
      '63000000 - Chaussures',
      '64000000 - Accessoires Corporels',
      '67000000 - Vêtements Habillement Textile',
      '71000000 - Equipements Sportifs',
      '72000000 - Equipement de la Maison',
      '73000000 - Ustensiles de Cuisine et Art de la Table',
      '75000000 - Meubles Domestiques/De Bureau/Ameublement',
      '77000000 - Composants, Outils et Consommables Auto et autres véhicules',
      '78000000 - Matériels Electriques',
      '79000000 - Plomberie/Chauffage/Ventilation/Climatisation',
      '80000000 - Outillages/Equipements Manuels',
      '82000000 - Outils/Equipements à Moteur',
      '83000000 - Produits de Construction',
      '84000000 - Rangements pour l\'Outillage – Mobiliers d\'Atelier',
      '85000000 - Sécurité/Protection – Bricolage',
      '86000000 - Jouets/Jeux',
      '87000000 - Carburants/Gaz',
      '88000000 - Lubrifiants',
      '91000000 - Sûreté/Sécurité/Surveillance',
      '93000000 - Plantes Horticoles',
      '94000000 - Cultures',
      '99000000 - Métiers d\'Art - Série Limitée',
    ];

    const TYPE_OPTIONS = [
      '1 - Entreprise privée produits & services',
      '2 - Entreprise privée ingénierie & services',
      '3 - Entreprise privée transport logistique & stockage',
      '4 - Entreprise publique transport logistique & stockage',
      '5 - Entreprise publique produits & services',
      '6 - Entreprise publique ingénierie & services',
      '7 - Autre institution publique d\'appui à l\'exportation',
      '8 - Banque',
      '9 - Douane',
      '10 - Assurance',
    ];
    const STATUS_OPTIONS = ['E - En attente', 'A - Actif', 'I - Inactif'];
    const PAYS_OPTIONS   = ['788 - Tunisie'];

    const workbook = new ExcelJS.Workbook();

    // Hidden sheet for dropdown data
    const dataWs = workbook.addWorksheet('_data', { state: 'veryHidden' });
    TYPE_OPTIONS  .forEach((v, i) => { dataWs.getCell(i + 1, 1).value = v; });
    STATUS_OPTIONS.forEach((v, i) => { dataWs.getCell(i + 1, 2).value = v; });
    PAYS_OPTIONS  .forEach((v, i) => { dataWs.getCell(i + 1, 3).value = v; });
    SEGMENTS      .forEach((v, i) => { dataWs.getCell(i + 1, 4).value = v; });

    const typeRange   = `_data!$A$1:$A$${TYPE_OPTIONS.length}`;
    const statusRange = `_data!$B$1:$B$${STATUS_OPTIONS.length}`;
    const paysRange   = `_data!$C$1:$C$${PAYS_OPTIONS.length}`;
    const segRange    = `_data!$D$1:$D$${SEGMENTS.length}`;

    const ws = workbook.addWorksheet('Entites');

    // ? Display-friendly headers (what user sees) vs internal keys (what parser reads)
    // The frontend cleanKey() strips " *" and " ?" — so the key is always the clean version
    ws.columns = [
      { header: 'Raison Sociale *',         key: 'raison_socialle',        width: 38 },
      { header: 'Identifiant National *',    key: 'identifiant_national',   width: 22 },
      { header: 'Personne Contact *',        key: 'personne_contact',       width: 28 },
      { header: 'Type Producteur ?',         key: 'type_prod',              width: 48 },
      { header: 'Email',                     key: 'email',                  width: 30 },
      { header: 'Tél Mobile',                key: 'tel_mobile',             width: 18 },
      { header: 'Téléphone',                 key: 'telephone',              width: 18 },
      { header: 'Fax',                       key: 'fax',                    width: 16 },
      { header: 'Adresse',                   key: 'adresse',                width: 40 },
      { header: 'Région',                    key: 'region',                 width: 20 },
      { header: 'Délégation',                key: 'delegation',             width: 20 },
      { header: 'Ville',                     key: 'city',                   width: 20 },
      { header: 'Localité',                  key: 'localite',               width: 20 },
      { header: 'Code Postal',               key: 'postalCode',             width: 12 },
      { header: 'Pays ?',                    key: 'pays',                   width: 18 },
      { header: 'Site Web',                  key: 'site',                   width: 30 },
      { header: 'Service',                   key: 'service',                width: 20 },
      { header: 'État',                      key: 'etat',                   width: 12 },
      { header: 'Identifiant REX',           key: 'identifiant_rex',        width: 20 },
      { header: 'Date Enregistrement REX',   key: 'date_enregistrement_rex',width: 24 },
      { header: 'Début Validité REX',        key: 'debut_validite_rex',     width: 18 },
      { header: 'Fin Validité REX',          key: 'fin_validite_rex',       width: 18 },
      { header: 'Date Abonnement',           key: 'date_abonnement',        width: 18 },
      { header: 'Date Échéance',             key: 'date_echeance',          width: 18 },
      { header: 'Nb FP',                     key: 'nb_fp',                  width: 10 },
      { header: 'Inscription',               key: 'inscription',            width: 12 },
      { header: 'Statut Entité ?',           key: 'status_ent',             width: 18 },
      { header: 'Titre FR',                  key: 'titre_fr',               width: 30 },
      { header: 'Titre AR',                  key: 'titre_ar',               width: 30 },
      { header: 'Titre EN',                  key: 'titre_en',               width: 30 },
      { header: 'Segment 1 ?',               key: 'segment1',               width: 48 },
      { header: 'Segment 2 ?',               key: 'segment2',               width: 48 },
      { header: 'Segment 3 ?',               key: 'segment3',               width: 48 },
      { header: 'Segment 4 ?',               key: 'segment4',               width: 48 },
    ];

    // ? Build COL map from key (not header display text)
    const COL = {};
    ws.columns.forEach((c, i) => { COL[c.key] = i + 1; });

    // ? Style header — detect required/dropdown from display header
    const headerRow = ws.getRow(1);
    headerRow.height = 36;
    ws.columns.forEach((col, ci) => {
      const cell = headerRow.getCell(ci + 1);
      const isRequired  = col.header.includes('*');
      const hasDropdown = col.header.includes('?');
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isRequired ? 'FF8B0000' : hasDropdown ? 'FF1A4A7A' : 'FF1E3A5F' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top:    { style: 'thin',   color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left:   { style: 'thin',   color: { argb: 'FF000000' } },
        right:  { style: 'thin',   color: { argb: 'FF000000' } },
      };
    });

    // 100 data rows with dropdowns
    for (let r = 2; r <= 101; r++) {
      const row = ws.getRow(r);
      row.height = 20;
      const bgColor = r % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA';

      ws.columns.forEach((_, ci) => {
        const cell = row.getCell(ci + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top:    { style: 'hair', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
          left:   { style: 'hair', color: { argb: 'FFCCCCCC' } },
          right:  { style: 'hair', color: { argb: 'FFCCCCCC' } },
        };
        cell.alignment = { vertical: 'middle' };
      });

      ws.getCell(r, COL['type_prod']).dataValidation = {
        type: 'list', allowBlank: true, showDropDown: false,
        formulae: [typeRange],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Type invalide',
        error: 'Choisissez un type dans la liste déroulante',
      };
      ws.getCell(r, COL['pays']).dataValidation = {
        type: 'list', allowBlank: true, showDropDown: false,
        formulae: [paysRange],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Pays invalide',
        error: 'Choisissez un pays dans la liste déroulante',
      };
      ws.getCell(r, COL['status_ent']).dataValidation = {
        type: 'list', allowBlank: true, showDropDown: false,
        formulae: [statusRange],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Statut invalide',
        error: 'Choisissez un statut dans la liste déroulante',
      };
      ['segment1','segment2','segment3','segment4'].forEach(seg => {
        ws.getCell(r, COL[seg]).dataValidation = {
          type: 'list', allowBlank: true, showDropDown: false,
          formulae: [segRange],
          showErrorMessage: true, errorStyle: 'warning',
          errorTitle: 'Segment invalide',
          error: 'Choisissez un segment dans la liste déroulante',
        };
      });
    }

    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1, topLeftCell: 'D2' }];

    // Notes sheet
    const notesWs = workbook.addWorksheet('Notes');
    notesWs.columns = [
      { header: 'Colonne',      key: 'col',  width: 35 },
      { header: 'Obligatoire',  key: 'req',  width: 14 },
      { header: 'Description',  key: 'desc', width: 80 },
    ];
    notesWs.getRow(1).height = 26;
    notesWs.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    [
      ['Raison Sociale *',                   'OUI',  'Raison sociale de l\'entreprise — obligatoire'],
      ['Identifiant National *',             'OUI',  'Matricule fiscal ou identifiant national — obligatoire'],
      ['Personne Contact *',                 'OUI',  'Nom complet du contact principal — obligatoire'],
      ['Type Producteur ?',                  'NON',  'Menu déroulant. Laisser vide = type 1 par défaut'],
      ['Email',                              'NON',  'Adresse email professionnelle'],
      ['Tél Mobile',                         'NON',  'Téléphone mobile (ex: +21698000000)'],
      ['Téléphone',                          'NON',  'Téléphone fixe'],
      ['Fax',                                'NON',  'Numéro de fax'],
      ['Adresse',                            'NON',  'Adresse physique complète'],
      ['Région',                             'NON',  'Région (ex: Tunis, Sfax, Sousse, Monastir...)'],
      ['Délégation',                         'NON',  'Délégation'],
      ['Ville',                              'NON',  'Ville'],
      ['Localité',                           'NON',  'Localité'],
      ['Code Postal',                        'NON',  'Code postal (ex: 1000)'],
      ['Pays ?',                             'NON',  'Menu déroulant. Laisser vide = Tunisie par défaut'],
      ['Site Web',                           'NON',  'Site web (ex: https://exemple.tn)'],
      ['Service',                            'NON',  'Service ou département'],
      ['État',                               'NON',  'État libre'],
      ['Statut Entité ?',                    'NON',  'Menu déroulant: E=En attente (défaut), A=Actif, I=Inactif'],
      ['Segment 1 à Segment 4 ?',            'NON',  'Menu déroulant — jusqu\'à 4 segments d\'activité'],
      ['Date Abonnement / Date Échéance',    'NON',  'Format YYYY-MM-DD (ex: 2025-01-15)'],
      ['Nb FP / Inscription',                'NON',  'Nombres entiers (ex: 0, 1, 5)'],
      ['Titre FR / Titre AR / Titre EN',     'NON',  'Titre de présentation multilingue'],
      ['Identifiant REX',                    'NON',  'Identifiant REX si applicable'],
      ['Colonnes rouges *',                  'INFO', 'Champs obligatoires — le reste est optionnel'],
      ['Colonnes bleues ?',                  'INFO', 'Champs avec menu déroulant — cliquez sur la cellule'],
      ['100 lignes disponibles',             'INFO', 'Remplissez autant de lignes que nécessaire puis importez'],
    ].forEach(([col, req, desc]) => {
      const row = notesWs.addRow({ col, req, desc });
      row.height = 20;
      row.getCell(2).alignment = { horizontal: 'center' };
      if (req === 'OUI')  { row.getCell(2).font = { bold: true, color: { argb: 'FFCC0000' } }; }
      if (req === 'NON')  { row.getCell(2).font = { color: { argb: 'FF2E7D32' } }; }
      if (req === 'INFO') { row.getCell(2).font = { bold: true, color: { argb: 'FF1565C0' } }; row.font = { italic: true }; }
    });
    notesWs.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_entites_complet.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating template:', err);
    res.status(500).json({ error: 'Failed to generate Excel template' });
  }
});


app.post('/api/companies/import', async (req, res) => {
  try {
    if (!entiteDB) {
      return res.status(503).json({
        success: false,
        error: 'Database unavailable'
      });
    }

    const { entities } = req.body;

    if (!Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No entities provided'
      });
    }

    const errors = [];
    let added = 0;

    const clean = (v) => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    const parseCode = (v) => {
      const s = clean(v);
      if (!s) return null;
      return s.includes(' - ')
        ? s.split(' - ')[0].trim()
        : s;
    };

    for (const e of entities) {
      try {

        const raison =
          clean(e.raison_socialle) ||
          clean(e.raison_sociale);

        const identifiant =
          clean(e.identifiant_national);

        const contact =
          clean(e.personne_contact);

        if (!raison) {
          errors.push({
            raison_socialle: 'N/A',
            message: 'Raison sociale manquante'
          });
          continue;
        }

        if (!identifiant) {
          errors.push({
            raison_socialle: raison,
            message: 'Identifiant national manquant'
          });
          continue;
        }

        if (!contact) {
          errors.push({
            raison_socialle: raison,
            message: 'Personne contact manquante'
          });
          continue;
        }

        const company = {
          identifiant_rex: clean(e.identifiant_rex),
          date_enregistrement_rex: clean(e.date_enregistrement_rex),
          debut_validite_rex: clean(e.debut_validite_rex),
          fin_validite_rex: clean(e.fin_validite_rex),
          etat: clean(e.etat),
          raison_socialle: raison,
          identifiant_national: identifiant,
          gln: clean(e.gln) || identifiant,
          certicode: Number(e.certicode) || 0,
          date_create: new Date().toISOString().slice(0, 10),
          pays: parseCode(e.pays),
          site: clean(e.site),
          personne_contact: contact,
          service: clean(e.service),
          email: clean(e.email),
          tel_mobile: clean(e.tel_mobile),
          telephone: clean(e.telephone),
          fax: clean(e.fax),
          adresse: clean(e.adresse),
          region: clean(e.region) || '',
          city: clean(e.city),
          localite: clean(e.localite) || '',
          postalCode: clean(e.postalCode),
          type_prod: Number(parseCode(e.type_prod)) || 1,
          statut: Number(e.statut) || 0,
          date_abonnement: clean(e.date_abonnement),
          date_echeance: clean(e.date_echeance),
          pwd: clean(e.pwd) || 'empty',
          nb_fp: Number(e.nb_fp) || 0,
          inscription: Number(e.inscription) || 0,
          status_ent: parseCode(e.status_ent) || 'E',
          delegation: clean(e.delegation),
          titre_fr: clean(e.titre_fr),
          titre_ar: clean(e.titre_ar),
          titre_en: clean(e.titre_en)
        };

        const idRows = await queryDB(
          entiteDB,
          'SELECT COALESCE(MAX(id_entite),0)+1 AS nextId FROM Entite'
        );

        company.id_entite =
          Array.isArray(idRows) && idRows.length
            ? Number(idRows[0].nextId)
            : 1;

        console.log(
          'IMPORT:',
          company.id_entite,
          company.raison_socialle,
          company.identifiant_national
        );

        const fields = Object.keys(company);
        const placeholders = fields.map(() => '?').join(',');
        const values = fields.map(field => company[field]);

        const insertSql = `
          INSERT INTO Entite (
            ${fields.join(',')}
          )
          VALUES (
            ${placeholders}
          )
        `;

        await queryDB(
          entiteDB,
          insertSql,
          values
        );

        const newId = company.id_entite;

        const segs = Array.isArray(e.segments)
          ? e.segments
          : [
              e.segment1,
              e.segment2,
              e.segment3,
              e.segment4
            ];

        for (const seg of segs) {
          const code = parseCode(seg);

          if (!code) continue;

          try {
            await queryDB(
              entiteDB,
              'INSERT IGNORE INTO Entite_segment (id_entite,id_segment) VALUES (?,?)',
              [newId, code]
            );
          } catch (segErr) {
            console.error(
              'SEGMENT ERROR',
              code,
              segErr.message
            );
          }
        }

        added++;

      } catch (err) {

        console.error('IMPORT ERROR', err);

        errors.push({
          raison_socialle:
            e.raison_socialle ||
            e.raison_sociale ||
            'Inconnu',
          message:
            err.sqlMessage ||
            err.message ||
            'Erreur inconnue'
        });
      }
    }

    return res.json({
      success: true,
      added,
      errors
    });

  } catch (err) {

    console.error('GLOBAL IMPORT ERROR', err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
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
    res.status(500).json({ error: 'Failed to fetch max ID', details: safeErrDetails(err) });
  }
});


app.get('/api/companies', async (req, res) => {
  try {
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
    query += ' GROUP BY p.id_entite ORDER BY p.raison_socialle ASC';

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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// ---------------------------------------------------------------
// CREATE COMPANY
// ---------------------------------------------------------------
// CREATE COMPANY + SEGMENTS + SITES (GLNs optional)
app.post('/api/companies', uploadLogo.single('logo'), async (req, res) => {
  const conn = await mysql.createConnection(dbConfig);
  await conn.beginTransaction();
  try {
    const f = req.body;
    const logoFile = req.file;
    const logoPath = logoFile ? logoFile.filename : null;

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
      // No gln here
    };

    const [result] = await conn.query('INSERT INTO Entite SET ?', company);
    const id_entite = result.insertId;

    // Handle segments
    const segments = f.segments ? JSON.parse(f.segments) : [];
    if (Array.isArray(segments) && segments.length > 0) {
      const values = segments.map(code => [id_entite, code]);
      await conn.query('INSERT INTO Entite_segment (id_entite, id_segment) VALUES ?', [values]);
    }

    // Handle sites (optional, can be zero)
    const sites = f.sites ? JSON.parse(f.sites) : [];
    if (Array.isArray(sites) && sites.length > 0) {
      for (const site of sites) {
        const siteData = {
          id_entite: id_entite,
          nom_site: site.nom_site || null,
          gln: site.gln || null,
          adresse: site.adresse || null,
          region: site.region || null,
          delegation: site.delegation || null,
          localite: site.localite || null,
          code_postal: site.code_postal || null,
          principal: site.principal ? 1 : 0,
          created_at: new Date().toISOString(),
        };
        await conn.query('INSERT INTO site SET ?', siteData);
      }
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

// UPDATE COMPANY + SEGMENTS + SITES (GLNs optional)
app.put('/api/companies/:id', uploadLogo.single('logo'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  const conn = await mysql.createConnection(dbConfig);
  await conn.beginTransaction();
  try {
    const f = req.body;
    const logoFile = req.file;
    const logoPath = logoFile ? logoFile.filename : null;

    const allowed = [
      'identifiant_rex', 'date_enregistrement_rex', 'debut_validite_rex', 'fin_validite_rex', 'etat',
      'raison_socialle', 'identifiant_national', 'certicode', 'pays', 'site', 'personne_contact',
      'service', 'email', 'tel_mobile', 'telephone', 'fax', 'adresse', 'region', 'city', 'localite',
      'postalCode', 'type_prod', 'statut', 'date_abonnement', 'date_echeance', 'pwd', 'nb_fp',
      'inscription', 'status_ent', 'delegation', 'titre_fr', 'titre_ar', 'titre_en'
      // No gln here
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

    // Handle segments update
    await conn.query('DELETE FROM Entite_segment WHERE id_entite = ?', [id]);
    const segments = f.segments ? JSON.parse(f.segments) : [];
    if (Array.isArray(segments) && segments.length > 0) {
      const segValues = segments.map(code => [id, code]);
      await conn.query('INSERT INTO Entite_segment (id_entite, id_segment) VALUES ?', [segValues]);
    }

    // Handle sites (optional, can be zero - delete existing and re-insert)
    await conn.query('DELETE FROM `Site` WHERE id_entite = ?', [id]);
    const sites = f.sites ? JSON.parse(f.sites) : [];
    if (Array.isArray(sites) && sites.length > 0) {
      for (const site of sites) {
        const siteData = {
          id_entite: id,
          nom_site: site.nom_site || null,
          gln: site.gln || null,
          adresse: site.adresse || null,
          region: site.region || null,
          delegation: site.delegation || null,
          localite: site.localite || null,
          code_postal: site.code_postal || null,
          principal: site.principal ? 1 : 0,
          created_at: site.created_at || new Date().toISOString(),
        };
        await conn.query('INSERT INTO `Site` SET ?', siteData);
      }
    }

    await conn.commit();
    res.json({ message: 'Company, segments, and sites updated successfully' });
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
    const conn = await mysql.createConnection(dbConfig);
    const sql = `UPDATE Entite SET ${field} = ? WHERE id_entite = ?`;
    await conn.query(sql, [value, id]);
    await conn.end();

    console.log(`[ENTITE] Field ${field} updated for id_entite=${id}`);
    res.json({ message: 'Field saved' });
  } catch (err) {
    console.error('PATCH /api/companies/:id/field error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// ? DELETE COMPANY (works with MySQL)
app.delete('/api/companies/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.beginTransaction();

    // Delete related segments (to avoid FK issues)
    await conn.query('DELETE FROM Entite_segment WHERE id_entite = ?', [id]);

    // Delete sites
    await conn.query('DELETE FROM Site WHERE id_entite = ?', [id]);

    // Delete comptes referencing this entity (FK constraint)
    await conn.query('DELETE FROM comptes WHERE id_entite = ?', [id]);

    // Delete tarification entries if table exists
    try { await conn.query('DELETE FROM tarification WHERE id_entite = ?', [id]); } catch (_) {}

    // Then delete the company itself
    const [result] = await conn.query('DELETE FROM Entite WHERE id_entite = ?', [id]);

    await conn.commit();
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    console.log(`[ENTITE] Company deleted â€“ id_entite=${id}`);
    res.json({ message: 'Company deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/companies/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

app.put('/api/companies/:id/archive', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);

    const [result] = await conn.query(
      'UPDATE Entite SET etat = ? WHERE id_entite = ?',
      ['archivé', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    console.log(`[ENTITE] Company archived - id_entite=${id}`);
    res.json({ message: 'Company archived successfully' });
  } catch (err) {
    console.error('PUT /api/companies/:id/archive error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  } finally {
    if (conn) await conn.end();
  }
});
// 7?? Update Segments Only
app.put('/api/companies/:id/segments', async (req, res) => {
  try {
    const id = Number(req.params.id);
    let { segments } = req.body;
    if (typeof segments === 'string') try { segments = JSON.parse(segments); } catch { }
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
    await entiteDB.run('ROLLBACK').catch(() => { });
    console.error('PUT /api/companies/:id/segments error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});





// GET sites for an entite
app.get('/api/sites/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query(
      'SELECT * FROM `Site` WHERE id_entite = ? ORDER BY principal DESC, id_site ASC',
      [id]
    );
    await conn.end();
    res.json(rows.map(r => ({
      ...r,
      principal: r.principal ? 1 : 0,
      created_at: r.created_at ? r.created_at.toISOString() : null
    })));
  } catch (err) {
    console.error('GET /api/sites/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// POST /api/sites â€” Create new site
app.post('/api/sites', async (req, res) => {
  try {
    const { id_entite, nom_site, gln, adresse, region, delegation, localite, code_postal, principal } = req.body;
    if (!id_entite || !nom_site) return res.status(400).json({ error: 'id_entite and nom_site are required' });
    const conn = await mysql.createConnection(dbConfig);
    if (principal) {
      await conn.query('UPDATE `Site` SET principal = 0 WHERE id_entite = ?', [id_entite]);
    }
    const [result] = await conn.query(
      'INSERT INTO `Site` (id_entite, nom_site, gln, adresse, region, delegation, localite, code_postal, principal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [id_entite, nom_site, gln || null, adresse || null, region || null, delegation || null, localite || null, code_postal || null, principal ? 1 : 0]
    );
    const [newRow] = await conn.query('SELECT * FROM `Site` WHERE id_site = ?', [result.insertId]);
    await conn.end();
    const r = newRow[0];
    res.status(201).json({ ...r, principal: r.principal ? 1 : 0, created_at: r.created_at ? r.created_at.toISOString() : null });
  } catch (err) {
    console.error('POST /api/sites error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// PUT /api/sites/:id_site â€” Update site
app.put('/api/sites/:id_site', async (req, res) => {
  try {
    const id_site = Number(req.params.id_site);
    if (!id_site) return res.status(400).json({ error: 'Invalid ID' });
    const { id_entite, nom_site, gln, adresse, region, delegation, localite, code_postal, principal } = req.body;
    const conn = await mysql.createConnection(dbConfig);
    if (principal) {
      await conn.query('UPDATE `Site` SET principal = 0 WHERE id_entite = ?', [id_entite]);
    }
    await conn.query(
      'UPDATE `Site` SET nom_site=?, gln=?, adresse=?, region=?, delegation=?, localite=?, code_postal=?, principal=? WHERE id_site=?',
      [nom_site, gln || null, adresse || null, region || null, delegation || null, localite || null, code_postal || null, principal ? 1 : 0, id_site]
    );
    await conn.end();
    res.json({ message: 'Site updated successfully' });
  } catch (err) {
    console.error('PUT /api/sites/:id_site error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// PUT /api/sites/:id_entite/set-primary/:id_site â€” Set primary site
app.put('/api/sites/:id_entite/set-primary/:id_site', async (req, res) => {
  try {
    const id_entite = Number(req.params.id_entite);
    const id_site = Number(req.params.id_site);
    if (!id_entite || !id_site) return res.status(400).json({ error: 'Invalid IDs' });
    const conn = await mysql.createConnection(dbConfig);
    await conn.query('UPDATE `Site` SET principal = 0 WHERE id_entite = ?', [id_entite]);
    await conn.query('UPDATE `Site` SET principal = 1 WHERE id_site = ?', [id_site]);
    await conn.end();
    res.json({ message: 'Primary site updated' });
  } catch (err) {
    console.error('PUT /api/sites/set-primary error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// DELETE /api/sites/:id_site â€” Delete site
app.delete('/api/sites/:id_site', async (req, res) => {
  try {
    const id_site = Number(req.params.id_site);
    if (!id_site) return res.status(400).json({ error: 'Invalid ID' });
    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query('DELETE FROM `Site` WHERE id_site = ?', [id_site]);
    await conn.end();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Site not found' });
    res.json({ message: 'Site deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/sites/:id_site error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// 7?? Update Segments Only
app.put('/api/companies/:id/segments', async (req, res) => {
  try {
    const id = Number(req.params.id);
    let { segments } = req.body;
    if (typeof segments === 'string') try { segments = JSON.parse(segments); } catch { }

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
    await entiteDB.run('ROLLBACK').catch(() => { });
    console.error('PUT /api/companies/:id/segments error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});
const typeOptions = [
  { value: "1", label: "Entreprise privÃ©e produits & services" },
  { value: "2", label: "Entreprise privÃ©e ingÃ©nierie & services" },
  { value: "3", label: "Entreprise privÃ©e transport logistique & stockage" },
  { value: "4", label: "Entreprise publique transport logistique & stockage" },
  { value: "5", label: "Entreprise publique produits & services" },
  { value: "6", label: "Entreprise publique ingÃ©nierie & services" },
  { value: "7", label: "Autre institution publique dâ€™appui Ã  lâ€™exportation" },
  { value: "8", label: "Banque" },
  { value: "9", label: "Douane" },
  { value: "10", label: "Assurance" },
];
// ------------------------------------------------------------------------------
// ENQUETES — Transport Logistique Afrique de l'Ouest
// ------------------------------------------------------------------------------

// GET /api/enquetes — list (light columns for table)
app.get('/api/enquetes', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, `
      SELECT id_enquete, id_entite, raison_sociale, secteur, flux, pays, foprodex, date_enquete
      FROM Enquete
      ORDER BY date_enquete DESC
    `, []);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/enquetes error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// GET /api/enquetes/by-entite/:id_entite — all enquêtes for one entité
app.get('/api/enquetes/by-entite/:id_entite', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, `
      SELECT id_enquete, raison_sociale, secteur, flux, pays, foprodex, date_enquete
      FROM Enquete WHERE id_entite = ? ORDER BY date_enquete DESC
    `, [Number(req.params.id_entite)]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/enquetes/by-entite error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// GET /api/enquetes/:id — full detail for edit modal
// ??  Must come AFTER /by-entite to avoid route collision
app.get('/api/enquetes/:id', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, 'SELECT * FROM Enquete WHERE id_enquete = ?', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Enquête introuvable' });
    const row = rows[0];
    // Parse JSON columns (mysql2 may return them as strings)
    ['volumes', 'frequences', 'transporteurs', 'difficultes'].forEach(col => {
      if (typeof row[col] === 'string') {
        try { row[col] = JSON.parse(row[col]); } catch { row[col] = null; }
      }
    });
    res.json(row);
  } catch (err) {
    console.error('GET /api/enquetes/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// POST /api/enquetes — create
app.post('/api/enquetes', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const {
      id_entite, raison_sociale, identifiant_fiscal,
      secteur, flux, pays,
      volumes, groupage, frequences,
      transporteurs, difficultes,
      foprodex, besoins_transport,
    } = req.body;

    if (!raison_sociale || !secteur || !flux || !pays) {
      return res.status(400).json({ error: 'Champs obligatoires manquants (raison_sociale, secteur, flux, pays)' });
    }

    const result = await runUpdate(entiteDB, `
      INSERT INTO Enquete
        (id_entite, raison_sociale, identifiant_fiscal, secteur, flux, pays,
         volumes, groupage, frequences, transporteurs, difficultes,
         foprodex, besoins_transport, date_enquete)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id_entite || null,
      raison_sociale,
      identifiant_fiscal || null,
      secteur,
      flux,
      pays,
      JSON.stringify(volumes || []),
      groupage || null,
      JSON.stringify(frequences || []),
      JSON.stringify(transporteurs || []),
      JSON.stringify(difficultes || []),
      foprodex || null,
      besoins_transport || null,
    ]);
    res.status(201).json({ id_enquete: result.insertId ?? result.lastID });
  } catch (err) {
    console.error('POST /api/enquetes error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// PUT /api/enquetes/:id — update
app.put('/api/enquetes/:id', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const {
      id_entite, raison_sociale, identifiant_fiscal,
      secteur, flux, pays,
      volumes, groupage, frequences,
      transporteurs, difficultes,
      foprodex, besoins_transport,
    } = req.body;

    await runUpdate(entiteDB, `
      UPDATE Enquete SET
        id_entite          = ?,
        raison_sociale     = ?,
        identifiant_fiscal = ?,
        secteur            = ?,
        flux               = ?,
        pays               = ?,
        volumes            = ?,
        groupage           = ?,
        frequences         = ?,
        transporteurs      = ?,
        difficultes        = ?,
        foprodex           = ?,
        besoins_transport  = ?,
        updated_at         = NOW()
      WHERE id_enquete = ?
    `, [
      id_entite || null,
      raison_sociale,
      identifiant_fiscal || null,
      secteur,
      flux,
      pays,
      JSON.stringify(volumes || []),
      groupage || null,
      JSON.stringify(frequences || []),
      JSON.stringify(transporteurs || []),
      JSON.stringify(difficultes || []),
      foprodex || null,
      besoins_transport || null,
      Number(req.params.id),
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/enquetes/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// DELETE /api/enquetes/:id
app.delete('/api/enquetes/:id', verifyJWT, async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    await runUpdate(entiteDB, 'DELETE FROM Enquete WHERE id_enquete = ?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/enquetes/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// ------------------------------------------------------------------------------


// --- 1. UTILITAIRES DE VALIDATION & PRÃ‰CISION ---

const Validators = {
  // Liste simplifiÃ©e des devises ISO 4217 courantes
  ALLOWED_CURRENCIES: new Set(['EUR', 'USD', 'GBP', 'MAD', 'CAD', 'CHF']),

  /**
   * VÃ©rifie si un code devise est valide
   */
  isValidCurrency: (code) => {
    return Validators.ALLOWED_CURRENCIES.has(code);
  },

  /**
   * VÃ©rifie la validitÃ© d'un code EAN/GTIN (8, 12, 13, 14 chiffres)
   * Utilise l'algorithme du Modulo 10
   */
  isValidGTIN: (gtin) => {
    if (!gtin || !/^\d+$/.test(gtin)) return false;

    // Padder avec des 0 Ã  gauche pour atteindre 14 chiffres (standard GTIN-14)
    const paddedParams = gtin.padStart(14, '0');
    const digits = paddedParams.split('').map(Number);
    const checkDigit = digits.pop(); // Le dernier chiffre est la clÃ© de contrÃ´le

    // Calcul : (Impair * 3) + (Pair * 1)
    const sum = digits.reduce((acc, digit, index) => {
      const multiplier = (index % 2 === 0) ? 3 : 1;
      return acc + (digit * multiplier);
    }, 0);

    const nearestTen = Math.ceil(sum / 10) * 10;
    const calculatedCheck = nearestTen - sum;

    return calculatedCheck === checkDigit;
  }
};

const MoneyHelper = {
  /**
   * Convertit un montant string/float en entier (cents) pour calcul prÃ©cis
   * Exemple: 12.50 -> 1250
   */
  toCents: (amount) => Math.round(parseFloat(amount) * 100),

  /**
   * Convertit des cents en float prÃ©cis
   */
  fromCents: (cents) => (cents / 100).toFixed(2),

  /**
   * VÃ©rifie si le total calculÃ© correspond au total dÃ©clarÃ© (avec tolÃ©rance 0.01)
   */
  checkConsistency: (calculated, declared) => {
    const diff = Math.abs(calculated - declared);
    return diff < 0.01;
  }
};

// Auto-create orders date columns if they don't exist
async function ensureOrdersColumns() {
  if (!entiteDB) {
    console.log('âš ï¸  EntiteDB not available, skipping orders columns check');
    return;
  }

  try {
    // Orders table columns
    const ordersColumns = [
      { name: 'date_livraison_demandee', type: 'DATETIME', comment: 'Date de livraison demandÃ©e (DTM+2)' },
      { name: 'date_livraison_confirmee', type: 'DATETIME', comment: 'Date de livraison confirmÃ©e (DTM+69)' },
      { name: 'date_livraison_plus_tot', type: 'DATETIME', comment: 'Date de livraison au plus tÃ´t (DTM+64)' },
      { name: 'date_livraison_plus_tard', type: 'DATETIME', comment: 'Date de livraison au plus tard (DTM+63)' },
      { name: 'lieu_livraison_gln', type: 'VARCHAR(20)', comment: 'GLN du lieu de livraison (NAD+DP)' }
    ];

    for (const col of ordersColumns) {
      try {
        // Check if column exists
        const [existing] = await entiteDB.pool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
          [col.name]
        );
        
        if (existing.length === 0) {
          // Column doesn't exist, add it
          await entiteDB.pool.query(
            `ALTER TABLE orders ADD COLUMN ${col.name} ${col.type} NULL COMMENT '${col.comment}'`
          );
          console.log(`âœ… Column ${col.name} added to orders`);
        } else {
          console.log(`âœ“ Column ${col.name} already exists in orders`);
        }
      } catch (err) {
        console.error(`âŒ Error adding column ${col.name} to orders:`, err.message);
      }
    }

    // Order_lines table columns for confirmed data
    const orderLinesColumns = [
      { name: 'confirmed_qty', type: 'INT', comment: 'QuantitÃ© confirmÃ©e par le fournisseur' },
      { name: 'confirmed_price', type: 'DECIMAL(10,2)', comment: 'Prix confirmÃ© par le fournisseur' },
      { name: 'line_comment', type: 'TEXT', comment: 'Commentaire du fournisseur sur la ligne' }
    ];

    for (const col of orderLinesColumns) {
      try {
        const [existing] = await entiteDB.pool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_lines' AND COLUMN_NAME = ?`,
          [col.name]
        );
        
        if (existing.length === 0) {
          await entiteDB.pool.query(
            `ALTER TABLE order_lines ADD COLUMN ${col.name} ${col.type} NULL COMMENT '${col.comment}'`
          );
          console.log(`âœ… Column ${col.name} added to order_lines`);
        } else {
          console.log(`âœ“ Column ${col.name} already exists in order_lines`);
        }
      } catch (err) {
        console.error(`âŒ Error adding column ${col.name} to order_lines:`, err.message);
      }
    }
  } catch (err) {
    console.error('âŒ Error ensuring orders columns:', err);
  }
}

const EDI_CONFIG = {
  segmentTerminator: "'",
  dataElementSeparator: "+",
  componentSeparator: ":",
  releaseIndicator: "?"
};

// --- 2. FONCTIONS PRINCIPALES ---

/**
 * Fonction de DÃ©codage avec Validations
 */
function decodeInvoiceEANCOM(ediString) {
  if (!ediString || typeof ediString !== 'string') throw new Error("Format d'entrÃ©e invalide");

  const segments = ediString.split(EDI_CONFIG.segmentTerminator).map(s => s.trim()).filter(s => s.length > 0);

  const invoice = {
    meta: {},
    header: {},
    parties: {},
    lines: [],
    totals: { taxes: [] },
    validationErrors: [] // Pour stocker les erreurs non-bloquantes
  };

  let currentLine = null;
  let section = 'HEADER';
  let computedTotalLines = 0; // Pour vÃ©rifier la cohÃ©rence

  segments.forEach((segment, index) => {
    const elements = segment.split(EDI_CONFIG.dataElementSeparator);
    const tag = elements[0];
    const getVal = (idx, subIdx = 0) => elements[idx] ? elements[idx].split(EDI_CONFIG.componentSeparator)[subIdx] : null;

    try {
      switch (tag) {
        // ... (Segments UNB, BGM, DTM identiques Ã  la version prÃ©cÃ©dente) ...
        case 'UNB':
          invoice.meta.sender = getVal(2);
          invoice.meta.receiver = getVal(3);
          break;
        case 'BGM':
          invoice.header.number = getVal(2);
          break;
        case 'DTM':
          if (getVal(1) === '137') invoice.header.date = getVal(1, 1);
          break;

        case 'CUX':
          const currency = getVal(1, 1);
          if (!Validators.isValidCurrency(currency)) {
            throw new Error(`Devise invalide dÃ©tectÃ©e : ${currency}`);
          }
          invoice.header.currency = currency;
          break;

        case 'NAD':
          const role = getVal(1);
          const gln = getVal(2);
          // Validation simple du GLN (souvent format EAN13)
          if (gln && gln.length === 13 && !Validators.isValidGTIN(gln)) {
            invoice.validationErrors.push(`GLN invalide pour le rÃ´le ${role}: ${gln}`);
          }
          if (role === 'BY') invoice.parties.buyer = gln;
          if (role === 'SU') invoice.parties.supplier = gln;
          break;

        case 'LIN':
          section = 'DETAIL';
          if (currentLine) {
            invoice.lines.push(currentLine);
            // Ajout au total calculÃ©
            if (currentLine.netAmount) computedTotalLines += currentLine.netAmount;
          }

          const gtin = getVal(3);
          if (!Validators.isValidGTIN(gtin)) {
            invoice.validationErrors.push(`Ligne ${getVal(1)}: Code Article (GTIN) invalide : ${gtin}`);
          }

          currentLine = { lineIndex: getVal(1), gtin: gtin };
          break;

        case 'QTY':
          if (section === 'DETAIL' && currentLine) {
            currentLine.quantity = parseFloat(getVal(1, 1));
            currentLine.unit = getVal(1, 2) || 'PCE';
          }
          break;

        case 'MOA':
          const type = getVal(1);
          const rawAmount = parseFloat(getVal(1, 1));

          if (section === 'DETAIL' && currentLine) {
            // Type 203 = Montant Ligne
            if (type === '203') currentLine.netAmount = rawAmount;
          } else if (section === 'SUMMARY') {
            // Type 79 = Total Lignes, 86 = Total TTC, 125 = Taxable
            if (type === '79') invoice.totals.linesAmount = rawAmount;
            if (type === '86') invoice.totals.totalAmount = rawAmount;
            if (type === '125') invoice.totals.taxableAmount = rawAmount;
            if (type === '176') invoice.totals.totalTax = rawAmount;
          }
          break;

        case 'PRI':
          if (section === 'DETAIL' && currentLine) {
            currentLine.price = parseFloat(getVal(1, 1));
          }
          break;

        case 'UNS':
          section = 'SUMMARY';
          if (currentLine) {
            invoice.lines.push(currentLine);
            if (currentLine.netAmount) computedTotalLines += currentLine.netAmount;
          }
          break;

        case 'TAX':
          const taxRate = getVal(5, 3);
          if (taxRate) invoice.totals.taxes.push({ rate: parseFloat(taxRate) });
          break;
      }
    } catch (err) {
      invoice.validationErrors.push(`Erreur Segment ${tag} (index ${index}): ${err.message}`);
    }
  });

  // --- VERIFICATIONS FINALES DE COHERENCE ---

  // 1. VÃ©rifier si la somme des lignes correspond au total dÃ©clarÃ©
  if (invoice.totals.linesAmount) {
    // On utilise une tolÃ©rance car l'EDI peut contenir des arrondis
    const isValidTotal = MoneyHelper.checkConsistency(computedTotalLines, invoice.totals.linesAmount);

    if (!isValidTotal) {
      invoice.validationErrors.push(
        `IncohÃ©rence Montants : Somme calculÃ©e des lignes (${computedTotalLines.toFixed(2)}) ` +
        `ne correspond pas au MOA+79 (${invoice.totals.linesAmount})`
      );
    }
  }

  return invoice;
}

/**
 * Fonction de GÃ©nÃ©ration avec Validation prÃ©ventive
 */
function generateInvoiceEANCOM(data) {
  // 1. Validation prÃ©ventive des donnÃ©es critiques
  if (!Validators.isValidCurrency(data.header.currency)) {
    throw new Error(`Impossible de gÃ©nÃ©rer : Devise ${data.header.currency} non supportÃ©e.`);
  }

  data.lines.forEach((line, idx) => {
    if (!Validators.isValidGTIN(line.gtin)) {
      throw new Error(`Impossible de gÃ©nÃ©rer : GTIN invalide ligne ${idx + 1} (${line.gtin})`);
    }
  });

  const { d = EDI_CONFIG.dataElementSeparator, c = EDI_CONFIG.componentSeparator, t = EDI_CONFIG.segmentTerminator } = {};
  const segments = [];
  const now = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Construction standard (identique structure prÃ©cÃ©dente, mais sÃ©curisÃ©e)
  segments.push(`UNB${d}UNOB${c}1${d}${data.meta.sender}${c}1${d}${data.meta.receiver}${c}1${d}${now.substring(2)}${c}1200${d}1${t}`);
  segments.push(`UNH${d}ME000001${d}INVOIC${c}D${c}01B${c}UN${c}EAN011${t}`);
  segments.push(`BGM${d}380${d}${data.header.number}${t}`);
  segments.push(`DTM${d}137${c}${data.header.date}${c}102${t}`);

  // Parties
  if (data.parties.buyer) segments.push(`NAD${d}BY${d}${data.parties.buyer}${c}${c}9${t}`);
  if (data.parties.supplier) segments.push(`NAD${d}SU${d}${data.parties.supplier}${c}${c}9${t}`);

  // Devise
  segments.push(`CUX${d}2${c}${data.header.currency}${c}4${t}`);

  // Lignes avec formatage des nombres (2 dÃ©cimales forcÃ©es pour les montants)
  if (data.lines) {
    data.lines.forEach((line, index) => {
      segments.push(`LIN${d}${index + 1}${d}${d}${line.gtin}${c}SRV${t}`);
      segments.push(`QTY${d}47${c}${line.quantity}${c}${line.unit || 'PCE'}${t}`);

      if (line.netAmount)
        segments.push(`MOA${d}203${c}${parseFloat(line.netAmount).toFixed(2)}${t}`);

      if (line.price)
        segments.push(`PRI${d}AAA${c}${parseFloat(line.price).toFixed(2)}${c}CA${t}`);
    });
  }

  segments.push(`UNS${d}S${t}`);

  // Totaux - Calcul automatique si non fournis pour Ã©viter les erreurs manuelles ?
  // Pour cet exemple, on prend ceux fournis mais on les formatte.
  if (data.totals.totalAmount) segments.push(`MOA${d}86${c}${parseFloat(data.totals.totalAmount).toFixed(2)}${t}`);
  if (data.totals.taxableAmount) segments.push(`MOA${d}125${c}${parseFloat(data.totals.taxableAmount).toFixed(2)}${t}`);
  if (data.totals.linesAmount) segments.push(`MOA${d}79${c}${parseFloat(data.totals.linesAmount).toFixed(2)}${t}`);

  const segmentCount = segments.length - 1 + 2;
  segments.push(`UNT${d}${segmentCount}${d}ME000001${t}`);
  segments.push(`UNZ${d}1${d}1${t}`);

  return segments.join('\n');
}

// --- EXEMPLE DE TEST (Pour voir la validation en action) ---

// Cas : GTIN invalide (dernier chiffre devrait Ãªtre 3 pour ce code, j'ai mis 0)
// Cas : IncohÃ©rence de montant
const badData = `
UNB+UNOB:1+SENDER1:1+RECEIVER1:1+071101:1701+131++INVOIC++1++1'
UNH+ME000001+INVOIC:D:01B:UN:EAN011'
BGM+380+IN432097'
DTM+137:20020308:102'
CUX+2:EUR:4'
NAD+BY+5412345000013::9'
LIN+1++4000862141400:SRV' 
QTY+47:10'
MOA+203:100'
UNS+S'
MOA+79:150' 
UNT+10+ME000001'
UNZ+1+131'
`;

// Test dÃ©sactivÃ© - Utilise des codes fictifs qui ne passent pas la validation GS1
/*
console.log("--- TEST DE DÃ‰CODAGE ---");
const result = decodeInvoiceEANCOM(badData);

if (result.validationErrors.length > 0) {
  console.error("âš ï¸ ERREURS DÃ‰TECTÃ‰ES :");
  result.validationErrors.forEach(e => console.error("- " + e));
} else {
  console.log("âœ… Facture Valide");
}
*/

/**
 * Fonction de DÃ©codage d'une Commande (ORDERS)
 * Extrait les donnÃ©es clÃ©s : Qui commande ? Quoi ? Pour quand ?
 */
function decodeOrderEANCOM(ediString) {
  if (!ediString || typeof ediString !== 'string') throw new Error("Format d'entrÃ©e invalide");

  const segments = ediString.split(EDI_CONFIG.segmentTerminator)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const order = {
    meta: {},
    header: {
      orderNumber: null,
      functionCode: null, // 9 = Original, 5 = Remplacement, 1 = Annulation
      orderDate: null,
      requestedDeliveryDate: null,
      currency: 'EUR' // DÃ©faut
    },
    parties: {
      buyer: null,      // BY
      supplier: null,   // SU
      deliveryPlace: null, // DP
      invoicee: null    // IV (Celui qui reÃ§oit la facture)
    },
    lines: [],
    instructions: [], // FTX (Global)
    validationErrors: []
  };

  let currentLine = null;
  let section = 'HEADER';

  segments.forEach((segment, index) => {
    const elements = segment.split(EDI_CONFIG.dataElementSeparator);
    const tag = elements[0];
    // Helper pour extraire valeur (ex: CUX+2:EUR:4 -> getVal(1, 1) = EUR)
    const getVal = (idx, subIdx = 0) => elements[idx] ? elements[idx].split(EDI_CONFIG.componentSeparator)[subIdx] : null;

    try {
      switch (tag) {
        case 'UNH':
          const msgType = getVal(2, 0);
          if (msgType !== 'ORDERS') {
            order.validationErrors.push(`Type de message incorrect : ${msgType} (Attendu: ORDERS)`);
          }
          break;

        case 'BGM':
          // 220 = Commande standard, 224 = Commande urgente
          order.header.type = getVal(1);
          order.header.orderNumber = getVal(2);
          order.header.functionCode = getVal(3); // 9 = Original
          break;

        case 'DTM':
          const dateType = getVal(1);
          const dateVal = getVal(1, 1);

          if (section === 'HEADER') {
            if (dateType === '137') order.header.orderDate = dateVal; // Date de commande
            if (dateType === '2') order.header.requestedDeliveryDate = dateVal; // Livraison demandÃ©e
            if (dateType === '64') order.header.earliestDeliveryDate = dateVal; // Au plus tÃ´t
            if (dateType === '63') order.header.latestDeliveryDate = dateVal;   // Au plus tard
          } else if (section === 'DETAIL' && currentLine) {
            // Date spÃ©cifique Ã  la ligne (ex: livraison partielle diffÃ©rÃ©e)
            if (dateType === '2') currentLine.requestedDeliveryDate = dateVal;
          }
          break;

        case 'NAD':
          const role = getVal(1);
          const gln = getVal(2);

          // Validation simple du GLN
          if (gln && gln.length === 13 && !Validators.isValidGTIN(gln)) {
            order.validationErrors.push(`GLN invalide pour ${role}: ${gln}`);
          }

          if (role === 'BY') order.parties.buyer = gln;
          if (role === 'SU') order.parties.supplier = gln;
          if (role === 'DP') order.parties.deliveryPlace = gln;
          if (role === 'IV') order.parties.invoicee = gln;
          break;

        case 'CUX':
          order.header.currency = getVal(1, 1);
          break;

        case 'FTX':
          // Commentaires libres (Instructions de livraison, etc.)
          const subject = getVal(1); // PUR = Purchasing info, DEL = Delivery info
          const text = getVal(4);
          const instruction = { subject, text };

          if (section === 'HEADER') order.instructions.push(instruction);
          else if (section === 'DETAIL' && currentLine) currentLine.instructions.push(instruction);
          break;

        case 'LIN':
          section = 'DETAIL';
          if (currentLine) order.lines.push(currentLine);

          const gtin = getVal(3);
          if (gtin && !Validators.isValidGTIN(gtin)) {
            order.validationErrors.push(`Ligne ${getVal(1)}: GTIN invalide (${gtin})`);
          }

          currentLine = {
            lineIndex: getVal(1),
            gtin: gtin,
            supplierItemCode: getVal(3, 1), // Parfois le code fournisseur est en 2Ã¨me position
            instructions: []
          };
          break;

        case 'QTY':
          // 21 = QuantitÃ© commandÃ©e
          // 59 = UnitÃ© consommateur (si diffÃ©rente)
          if (section === 'DETAIL' && currentLine) {
            const qtyType = getVal(1);
            if (qtyType === '21') {
              currentLine.quantityOrdered = parseFloat(getVal(1, 1));
              currentLine.unit = getVal(1, 2) || 'PCE';
            }
          }
          break;

        case 'PRI':
          // Note : Le prix n'est pas obligatoire dans une commande (c'est l'acheteur qui commande)
          // Mais s'il est prÃ©sent, c'est souvent le prix attendu/nÃ©gociÃ©.
          // AAA = Prix net calculÃ©, AAB = Prix brut
          if (section === 'DETAIL' && currentLine) {
            currentLine.expectedPrice = parseFloat(getVal(1, 1));
          }
          break;

        case 'UNS':
          section = 'SUMMARY';
          if (currentLine) { order.lines.push(currentLine); currentLine = null; }
          break;

        case 'CNT':
          // 2 = Nombre de lignes d'articles
          if (getVal(1) === '2') {
            order.meta.lineCountDeclared = parseInt(getVal(1, 1), 10);
          }
          break;
      }
    } catch (err) {
      order.validationErrors.push(`Erreur parsing segment ${tag}: ${err.message}`);
    }
  });

  // Sauvegarde derniÃ¨re ligne
  if (currentLine) order.lines.push(currentLine);

  // Validation Post-Parsing
  if (order.meta.lineCountDeclared && order.lines.length !== order.meta.lineCountDeclared) {
    order.validationErrors.push(`Ecart nb lignes : DÃ©clarÃ© ${order.meta.lineCountDeclared} vs TrouvÃ© ${order.lines.length}`);
  }

  return order;
}

// --- Exemple d'utilisation ---

const sampleOrder = `
UNB+UNOB:1+5411234512345:14+5411234567890:14+260107:1000+1234++ORDERS'
UNH+ME001+ORDERS:D:96A:UN:EAN008'
BGM+220+CMD123456+9'
DTM+137:20260107:102'
DTM+2:20260110:102'
NAD+BY+5411234512345::9'
NAD+SU+5411234567890::9'
NAD+DP+5411234599999::9'
FTX+DEL+++LIVRAISON ARRIERE BOUTIQUE'
LIN+1++5410001000105:SRV'
QTY+21:50:PCE'
DTM+2:20260112:102'
LIN+2++5410002000204:SRV'
QTY+21:10:CS'
FTX+ACB+++ATTENTION FRAGILE'
UNS+S'
CNT+2:2'
UNT+15+ME001'
UNZ+1+1234'
`;

// Test dÃ©sactivÃ© - Utilise des codes fictifs qui ne passent pas la validation GS1
// Pour rÃ©activer le test, dÃ©commentez le code ci-dessous
/*
try {
  const decodedOrder = decodeOrderEANCOM(sampleOrder);
  console.log(JSON.stringify(decodedOrder, null, 2));

  if (decodedOrder.validationErrors.length > 0) {
    console.error("âš ï¸ Erreurs de validation:", decodedOrder.validationErrors);
  } else {
    console.log("âœ… Commande valide et prÃªte pour insertion BDD");
  }

} catch (e) {
  console.error(e);
}
*/

/**
 * Codes d'action standard EANCOM pour la rÃ©ponse commande (Segment LIN, champ 1229)
 */
const ACTION_CODES = {
  '1': 'ADDED',           // AjoutÃ©
  '3': 'CHANGED',         // ModifiÃ© (QuantitÃ©, prix, date...)
  '5': 'ACCEPTED',        // AcceptÃ© sans modification
  '7': 'NOT_ACCEPTED'     // RefusÃ© / Non livrable
};

/**
 * Codes de statut global (Segment BGM, champ 1225)
 */
const RESPONSE_STATUS = {
  '4': 'CHANGE_PROPOSED', // AcceptÃ© avec rÃ©serves/changements
  '29': 'ACCEPTED',       // AcceptÃ© totalement
  '27': 'REJECTED'        // RefusÃ© totalement
};

function decodeOrderResponseEANCOM(ediString) {
  if (!ediString || typeof ediString !== 'string') throw new Error("Format invalide");

  const segments = ediString.split("'").map(s => s.trim()).filter(s => s.length > 0);

  // Structure de sortie
  const response = {
    meta: { type: 'ORDRSP' },
    header: {
      responseNumber: null,
      responseStatus: null, // Global status
      responseDate: null,
      originalOrderNumber: null, // RÃ©fÃ©rence critique
      originalOrderDate: null
    },
    parties: { buyer: null, supplier: null },
    lines: [], // DÃ©tail par article
    validationErrors: []
  };

  let currentLine = null;
  let section = 'HEADER';

  segments.forEach((segment, index) => {
    const elements = segment.split('+');
    const tag = elements[0];
    const getVal = (idx, subIdx = 0) => elements[idx] ? elements[idx].split(':')[subIdx] : null;

    try {
      switch (tag) {
        case 'BGM':
          // BGM+231+ORSP12856+4
          response.header.responseNumber = getVal(2);
          const statusCode = getVal(3);
          response.header.responseStatus = RESPONSE_STATUS[statusCode] || statusCode;
          break;

        case 'DTM':
          const dateType = getVal(1);
          const dateVal = getVal(1, 1);

          if (section === 'HEADER') {
            if (dateType === '137') response.header.responseDate = dateVal; // Date du message
            if (dateType === '171') response.header.originalOrderDate = dateVal; // Date de la commande d'origine
          }
          break;

        case 'RFF':
          // RFF+ON:652744 (RÃ©fÃ©rence Ã  la commande d'origine)
          const refType = getVal(1);
          if (refType === 'ON') response.header.originalOrderNumber = getVal(1, 1);
          break;

        case 'NAD':
          const role = getVal(1);
          const gln = getVal(2);
          if (role === 'BY') response.parties.buyer = gln;
          if (role === 'SU') response.parties.supplier = gln;
          break;

        case 'LIN':
          // LIN+1+5+3312345501102:SRV
          section = 'DETAIL';
          if (currentLine) response.lines.push(currentLine);

          const lineIndex = getVal(1);
          const actionCode = getVal(2); // Le champ critique : 5, 3, 7...
          const gtin = getVal(3);

          currentLine = {
            lineIndex: lineIndex,
            gtin: gtin,
            status: ACTION_CODES[actionCode] || 'UNKNOWN',
            originalStatusCode: actionCode,
            changes: {} // Pour stocker les nouvelles valeurs proposÃ©es
          };
          break;

        case 'QTY':
          // QTY+21:48 (QuantitÃ© confirmÃ©e/modifiÃ©e)
          if (section === 'DETAIL' && currentLine) {
            const qtyType = getVal(1);
            if (qtyType === '21') { // 21 = Ordered Quantity (ici interprÃ©tÃ© comme Confirmed Quantity)
              currentLine.confirmedQuantity = parseFloat(getVal(1, 1));
            }
          }
          break;

        case 'PRI':
          // PRI+AAA:550... (Nouveau prix si modifiÃ©)
          if (section === 'DETAIL' && currentLine) {
            currentLine.confirmedPrice = parseFloat(getVal(1, 1));
          }
          break;

        case 'PIA':
          // PIA+1+ABC1234:SA (Code article fournisseur)
          if (section === 'DETAIL' && currentLine) {
            if (getVal(1) === '1') currentLine.supplierItemCode = getVal(2);
          }
          break;

        case 'UNS':
          section = 'SUMMARY';
          if (currentLine) { response.lines.push(currentLine); currentLine = null; }
          break;
      }
    } catch (e) {
      response.validationErrors.push(`Erreur parsing ${tag}: ${e.message}`);
    }
  });

  if (currentLine) response.lines.push(currentLine);

  return response;
}

// --- TEST AVEC L'EXEMPLE GS1 ---
// J'ai reconstruit la chaÃ®ne brute Ã  partir de votre exemple
const gs1Data = `UNH+ME000001+ORDRSP:D:01B:UN:EAN009'BGM+231+ORSP12856+4'DTM+137:20020330:102'RFF+ON:652744'DTM+171:20020325:102'NAD+BY+5412345000013::9'RFF+VA:452282'NAD+SU+4012345500004::9'RFF+VA:87765432'LIN+1+5+3312345501102:SRV'LIN+2+3+3312345501003:SRV'PIA+1+ABC1234:SA'IMD+C++TU::9'QTY+21:48'DTM+2:20020910:102'MOA+203:26400'PRI+AAA:550:CT:AAA'PAC+4+1+CS'TAX+7+VAT+++:::17.5+S'MOA+124:4620'TDT+20++30++31'LIN+3+7+3312345501096:SRV'UNS+S'CNT+2:3'UNT+25+ME000001'`;

console.log("--- DÃ‰CODAGE ORDRSP (GS1 Example) ---");
const testResult = decodeOrderResponseEANCOM(gs1Data);

// Affichage simplifiÃ© pour vÃ©rifier la logique des statuts
console.log(`Status Global: ${testResult.header.responseStatus}`);
console.log(`Commande RÃ©f: ${testResult.header.originalOrderNumber}`);
console.log("\n--- LIGNES ---");
testResult.lines.forEach(l => {
  let detail = `Ligne ${l.lineIndex} [${l.status}] - GTIN: ${l.gtin}`;
  if (l.confirmedQuantity) detail += ` | QtÃ© ConfirmÃ©e: ${l.confirmedQuantity}`;
  if (l.confirmedPrice) detail += ` | Prix ConfirmÃ©: ${l.confirmedPrice}`;
  console.log(detail);
});


// ====================== EANCOM GENERATOR (like bashEancomXML.php) ======================
// ====================== EANCOM GENERATOR (Improved) ======================
function generateOrderEANCOM(data) {
  const lines = [];
  let segmentCount = 0;
  const add = function (l) {
    segmentCount++;
    lines.push(l);
  };
  add("UNH+MESS001+ORDERS:D:96A:UN:EAN008'");
  add("BGM+220+" + data.numCommande + "+9'");
  if (data.datecommande) add("DTM+137:" + data.datecommande + ":102'");
  
  // Additional delivery dates if provided
  if (data.dateLivraisonDemandee) {
    add("DTM+2:" + data.dateLivraisonDemandee + ":102'");
  }
  if (data.dateLivraisonPlusTot) {
    add("DTM+64:" + data.dateLivraisonPlusTot + ":102'");
  }
  if (data.dateLivraisonPlusTard) {
    add("DTM+63:" + data.dateLivraisonPlusTard + ":102'");
  }
  if (data.datelivraison) {
    var code = String(data.datelivraison).length > 8 ? "203" : "204";
    add("DTM+2:" + data.datelivraison + ":" + code + "'");
  }
  if (data.dateenlevement) {
    var code = String(data.dateenlevement).length > 8 ? "203" : "204";
    add("DTM+200:" + data.dateenlevement + ":" + code + "'");
  }
  if (data.Acheteur) {
    // Include buyer name in NAD segment for inter-country orders (4th field)
    const buyerName = data.buyerName || '';
    add("NAD+BY+" + data.Acheteur + "::9++" + buyerName + "'");
  }
  if (data.lieu_livraison_primaire) {
    add("NAD+DP+" + data.lieu_livraison_primaire + "::9'");
    add("NAD+UC+" + data.lieu_livraison_primaire + "::9'");
  }
  if (data.fournisseur) add("NAD+SU+" + data.fournisseur + "::9'");
  if (data.facture) add("NAD+IV+" + data.facture + "::9'");
  if (data.monnaie) add("CUX+2:" + data.monnaie + ":9'");

  // ITEMS (Expects array of objects: { gtin, qty, price, unit })
  const items = Array.isArray(data.articles) ? data.articles : [];

  items.forEach(function (item, idx) {
    const unit = item.unit || "PCE";
    add("LIN+" + (idx + 1) + "++" + item.gtin + ":EN'");
    add("QTY+21:" + item.qty + ":" + unit + "'");
    add("PRI+AAA:" + item.price + "::NTP:1:" + unit + "'");
  });

  add("UNS+S'");
  
  // Total amount
  if (data.total_ht !== undefined && data.total_ht !== null) {
    add("MOA+86:" + Number(data.total_ht).toFixed(2) + "'");
  }

  // Transport fees if provided
  if (data.fraisTransport && data.fraisTransport > 0) {
    add("MOA+23:" + data.fraisTransport.toFixed(2) + "'");
  }
  
  add("CNT+2:" + items.length + "'");
  add("UNT+" + (segmentCount + 1) + "+MESS001'");
  return lines.join("\n") + "\n";
}

// 1. CREATE EANCOM ORDER (like commande_valide.php + bashEancomXML.php)
// 1. CREATE EANCOM ORDER (Robust Version)
app.post("/api/orders/eancom", async function (req, res) {
  try {
    const data = req.body;
    const sellerId = Number(req.headers["x-entite-id"]);

    // --- 1. Basic Validation ---
    const errors = [];
    if (!data.numCommande) errors.push("Missing Order Number");
    if (!data.fournisseur) errors.push("Missing Supplier GLN");
    if (!data.fournisseurIdEntite) errors.push("Missing Supplier ID (fournisseurIdEntite)");
    if (!data.Acheteur) errors.push("Missing Buyer GLN");
    if (!data.datelivraison) errors.push("Missing Delivery Date");
    if (!Array.isArray(data.articles) || data.articles.length === 0) errors.push("No articles provided");

    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation Failed", details: errors.join("; ") });
    }

    console.log("\n=== [ORDER CREATION] START ===");
    console.log("[ORDER CREATION] Order Number:", data.numCommande);
    console.log("[ORDER CREATION] Supplier GLN:", data.fournisseur);
    console.log("[ORDER CREATION] Supplier ID (from remote server):", data.fournisseurIdEntite);
    console.log("[ORDER CREATION] Buyer GLN:", data.Acheteur);

    // --- 2. Advanced Validation (DB Checks) ---
    // Note: Supplier is from remote server, so we use fournisseurIdEntite directly
    // Only validate Buyer GLN locally
    
    // Check Buyer Existence
    const buyerCheck = await queryDB(entiteDB, "SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln = ?", [data.Acheteur]);
    console.log("[ORDER VALIDATION] Buyer check result:", buyerCheck);
    
    if (buyerCheck.length === 0) {
      // Try to find similar GLNs for debugging
      const similarGLNs = await queryDB(entiteDB, "SELECT id_entite, gln, raison_socialle FROM Entite WHERE gln LIKE ? LIMIT 5", [`%${data.Acheteur.slice(-5)}%`]);
      console.error("[ORDER VALIDATION] âŒ Buyer GLN not found. Similar GLNs in DB:", similarGLNs);
      
      return res.status(400).json({ 
        error: "Invalid Buyer", 
        details: `Buyer GLN ${data.Acheteur} not found in database`,
        hint: similarGLNs.length > 0 ? `Similar GLNs found: ${similarGLNs.map(e => e.gln).join(', ')}` : "No similar GLNs found"
      });
    }
    
    // Force Buyer Name from DB to ensure it's the Company Name (not User Name)
    data.buyerName = buyerCheck[0].raison_socialle;
    
    console.log("[ORDER VALIDATION] âœ… Buyer found:", buyerCheck[0]);
    console.log("[ORDER VALIDATION] Using Buyer Name:", data.buyerName);
    console.log("=== [ORDER VALIDATION] GLN Checks Complete ===\n");

    // Validate Articles
    for (const item of data.articles) {
      if (!item.gtin || item.gtin.length !== 13) errors.push(`Invalid GTIN: ${item.gtin}`);
      if (!item.qty || Number(item.qty) <= 0) errors.push(`Invalid Qty for ${item.gtin}`);
      if (item.price === undefined || Number(item.price) < 0) errors.push(`Invalid Price for ${item.gtin}`);
    }

    if (errors.length > 0) {
      // Log as invalid order if needed, but for now just return error
      await queryDB(entiteDB, "INSERT INTO invalid_orders (num_order, error_message) VALUES (?, ?)", [data.numCommande, errors.join("; ")]);
      return res.status(400).json({ error: "Article Validation Failed", details: errors.join("; ") });
    }

    // --- 3. Transaction & Insertion ---
    // Use query() instead of execute() for transaction commands (MySQL doesn't support them in prepared statements)
    if (entiteDB.pool) {
      await entiteDB.pool.query('START TRANSACTION');
    } else {
      await entiteDB.run('BEGIN');
    }

    try {
      // Generate EANCOM file with enhanced GS1-compliant generator
      // Use configurable EDI_ORDERS_PATH from database
      const ediOrdersPath = configService.getEdiOrdersPath();
      const dir = path.join(ediOrdersPath, "orders", data.fournisseur, data.numCommande);
      await fs.promises.mkdir(dir, { recursive: true });
      const edifact = generateOrderEANCOM_Enhanced(data);
      const filePath = path.join(dir, "ordre.txt");
      await fs.promises.writeFile(filePath, edifact, "utf8");
      console.log(`[EANCOM] File generated: ${filePath}`);

      // Helper to parse EANCOM date (YYYYMMDDHHMMSS) to SQL (YYYY-MM-DD HH:MM:SS)
      const parseEancomDate = (str) => {
        if (!str || str.length < 8) return null;
        const y = str.substring(0, 4);
        const m = str.substring(4, 6);
        const d = str.substring(6, 8);
        const h = str.substring(8, 10) || '00';
        const min = str.substring(10, 12) || '00';
        const s = str.substring(12, 14) || '00';
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      };

      // Insert Header
      // NOTE: Transport fields removed from orders table (managed in edi_transport_orders)
      const insertRes = await runUpdate(entiteDB,
        "INSERT INTO orders (num_commande, order_number, id_entite_buyer, acheteur_gln, id_entite_seller, seller_name, fournisseur_gln, lieu_livraison_gln, status, total_ht, monnaie, articles, currency, date_commande, date_livraison, date_livraison_demandee, date_livraison_plus_tot, date_livraison_plus_tard, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
        [
          data.numCommande, 
          data.numCommande, 
          buyerCheck[0].id_entite, 
          data.Acheteur, 
          data.fournisseurIdEntite, // ID from remote server
          data.supplierName || 'Fournisseur', // Persist supplier name
          data.fournisseur, 
          data.lieu_livraison_primaire || data.lieuLivraison || null, 
          'new', 
          data.total_ht || 0, 
          data.currency || data.monnaie || 'TND',
          JSON.stringify(data.articles), 
          data.currency || data.monnaie || 'TND',
          parseEancomDate(data.datecommande), 
          parseEancomDate(data.datelivraison),
          parseEancomDate(data.dateLivraisonDemandee),
          parseEancomDate(data.dateLivraisonPlusTot),
          parseEancomDate(data.dateLivraisonPlusTard)
        ]
      );
      const orderId = insertRes.lastID;
      console.log(`[ORDER CREATION] âœ… Order inserted with ID: ${orderId}`);

      // Insert Transport Order if transport data exists
      if (data.transporteurGln || data.modeTransport || data.moyenTransport) {
        try {
          await runUpdate(entiteDB, 
            "INSERT INTO edi_transport_orders (transport_number, id_order, transporteur, vehicule, status) VALUES (?, ?, ?, ?, ?)",
            [
              `TR-${data.numCommande}`,
              orderId,
              data.transporteurGln,
              `${data.modeTransport || ''} ${data.moyenTransport || ''}`.trim(),
              'PENDING'
            ]
          );
          console.log(`[ORDER CREATION] âœ… Transport order created for Order #${orderId}`);
        } catch (transportErr) {
          console.error(`[ORDER CREATION] âš ï¸ Failed to create transport order:`, transportErr.message);
          // Non-blocking error
        }
      }

      // Insert Lines
      let lineNumber = 1;
      for (const item of data.articles) {
        await runUpdate(entiteDB,
          "INSERT INTO order_lines (id_order, line_number, product_id, gtin, libelle, qty, unit, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [orderId, lineNumber, null, item.gtin, item.libelle || "", item.qty, item.unit || "PCE", item.price]
        );
        lineNumber++;
      }

      // Record EDI transmission
      const transmissionId = await createEdiTransmission(entiteDB, {
        related_id: orderId,
        related_type: 'ORDER',
        document_type: 'ORDERS',
        direction: 'OUTBOUND',
        partner_id: null, // Remote supplier ID not in local DB, use GLN instead
        partner_gln: data.fournisseur,
        sender_gln: data.Acheteur,
        filename: 'ordre.txt',
        file_path: filePath,
        file_content: edifact,
        status: 'PENDING',
        logs: `Order ${data.numCommande} created and EANCOM file generated`
      });
      console.log(`[EDI] Transmission #${transmissionId} recorded for order #${orderId}`);

      if (entiteDB.pool) {
        await entiteDB.pool.query('COMMIT');
      } else {
        await entiteDB.run('COMMIT');
      }

      // --- 3. Send EANCOM file to EDI server (async, non-blocking) ---
      // Determine target EDI server dynamically using configService
      // Works for both intra-country and inter-country routing.
      // For inter-country: supplier GLN may not exist locally, so we use 'supplierServer' hint from payload.
      let ediTarget = await configService.getEdiTargetUrl(entiteDB, data.fournisseur);
      
      // If GLN-based routing failed (supplier not in local DB) AND the payload provides a server hint, use it
      if (!ediTarget.countryCode && data.supplierServer) {
        const hintedEdiUrl = configService.get(`EDI_URL_${data.supplierServer.toUpperCase()}`);
        if (hintedEdiUrl) {
          console.log(`[EDI SEND] ðŸ”€ GLN-based routing failed, using supplierServer hint: '${data.supplierServer}' -> ${hintedEdiUrl}`);
          ediTarget = { url: hintedEdiUrl, countryCode: data.supplierServer.toUpperCase(), countryName: data.supplierServer };
        }
      }
      
      const ediServerUrl = ediTarget.url;
      
      console.log(`[EDI SEND] ðŸŽ¯ EDI Routing Details:`);
      console.log(`  - Supplier GLN: ${data.fournisseur}`);
      console.log(`  - Target Country: ${ediTarget.countryName} (${ediTarget.countryCode || 'local'})`);
      console.log(`  - Target EDI URL: ${ediServerUrl}`);
      
      // Send asynchronously without blocking the response
      setImmediate(async () => {
        try {
          const ediResponse = await axios.post(ediServerUrl, {
            eancomContent: edifact,
            filename: `ordre_${data.numCommande}.txt`,
            partnerGln: data.fournisseur
          }, {
            headers: serviceAuthHeaders({ 'Content-Type': 'application/json' }),
            timeout: 30000
          });

          console.log(`[EDI SEND] âœ… Successfully sent to EDI server. Response:`, ediResponse.data);
          
          // Update transmission status to SENT
          await updateEdiTransmissionStatus(
            entiteDB, 
            transmissionId, 
            'SENT',
            `Successfully sent to EDI server at ${new Date().toISOString()}. Response: ${JSON.stringify(ediResponse.data)}`,
            null
          );

          // Update order status to 'sent' immediately
          await runUpdate(
            entiteDB,
            'UPDATE orders SET status = ? WHERE id_order = ?',
            ['sent', orderId]
          );

          // Emit WebSocket event globally - frontend filters by buyerId/sellerId
          if (global.io) {
            const eventData = {
              orderId: orderId,
              status: 'sent',
              numCommande: data.numCommande,
              fournisseurName: data.supplierName || 'Fournisseur',
              timestamp: new Date().toISOString(),
              buyerId: sellerId, // sellerId variable here is actually req.headers["x-entite-id"] which is the buyer
              sellerId: data.fournisseurIdEntite
            };
            global.io.emit('order:status:updated', eventData);
            console.log(`[EDI SEND] ðŸ“¡ WebSocket event emitted globally for order #${orderId} (buyer:${sellerId}, seller:${data.fournisseurIdEntite})`);
          }

          // Notification to supplier users is handled by the EDI Worker (processInboundOrder)
          // after the order is actually received and processed on the supplier's server.
          // This avoids duplicate notifications and ensures the notification is sent only
          // after confirmed reception.
          console.log(`[EDI SEND] ðŸ“¨ Order ${data.numCommande} sent. Supplier notification will be triggered by EDI Worker on reception.`);
          
        } catch (ediErr) {
          console.error(`[EDI SEND] âŒ Failed to send to EDI server:`, ediErr.message);
          
          // Update transmission status to ERROR
          await updateEdiTransmissionStatus(
            entiteDB,
            transmissionId,
            'ERROR',
            `Failed to send to EDI server at ${new Date().toISOString()}`,
            `${ediErr.message}${ediErr.response?.data ? ' - ' + JSON.stringify(ediErr.response.data) : ''}`
          );
          
          // Increment retry count
          await incrementRetryCount(entiteDB, transmissionId);
        }
      });

      res.json({ 
        success: true, 
        file: filePath, 
        orderId, 
        transmissionId,
        message: 'Order created successfully. EANCOM file is being sent to EDI server.'
      });

    } catch (innerErr) {
      if (entiteDB.pool) {
        await entiteDB.pool.query('ROLLBACK');
      } else {
        await entiteDB.run('ROLLBACK');
      }
      throw innerErr;
    }

  } catch (err) {
    console.error("EANCOM Error:", err);
    res.status(500).json({ error: "Failed to create order", details: safeErrDetails(err) });
  }
});

// 3. GET INCOMING ORDERS (from edi_orders table - PHASE 2)
app.get("/api/orders/incoming", async function (req, res) {
  try {
    console.log("\n=== [BACKEND] GET /api/orders/incoming (STAGING) - START ===");
    var rawSellerId = Number(req.headers["x-entite-id"]);
    console.log("[BACKEND INCOMING] rawSellerId (from x-entite-id):", rawSellerId);
    if (!rawSellerId) return res.status(400).json({ error: "Missing x-entite-id" });

    // Resolve: x-entite-id may be id_entite OR id_compte
    var sellerId = rawSellerId;
    const directSellerEntity = await queryOne(entiteDB, "SELECT id_entite FROM Entite WHERE id_entite = ?", [rawSellerId]);
    if (!directSellerEntity) {
      const accountRow = await queryOne(entiteDB, "SELECT id_entite FROM comptes WHERE id_compte = ?", [rawSellerId]);
      if (accountRow && accountRow.id_entite) {
        sellerId = accountRow.id_entite;
        console.log(`[BACKEND INCOMING] Resolved id_compte ${rawSellerId} -> id_entite ${sellerId}`);
      }
    }

    // 1. Get Seller GLN
    const sellerRows = await queryDB(entiteDB, "SELECT gln, raison_socialle FROM Entite WHERE id_entite = ?", [sellerId]);
    if (sellerRows.length === 0) {
        console.log("[BACKEND INCOMING] Seller not found for id_entite:", sellerId);
        return res.json({ orders: [] });
    }
    const sellerGln = sellerRows[0].gln;
    const sellerName = sellerRows[0].raison_socialle;
    console.log(`[BACKEND INCOMING] Fetching staging orders for GLN: ${sellerGln} (${sellerName})`);

    // 2. Query edi_orders
    const query = `
        SELECT 
            eo.id, 
            eo.document_number as num_order, 
            eo.order_date, 
            eo.delivery_date, 
            eo.buyer_gln, 
            eo.total_amount as total_ht, 
            eo.status as statut, 
            eo.currency as monnaie,
            eo.raw_data,
            DATE_FORMAT(eo.created_at, '%Y-%m-%dT%H:%i:%s') as date_reception,
            o.id_order as production_id_order,
            o.comment as production_comment,
            o.status as production_status,
            DATE_FORMAT(o.updated_at, '%Y-%m-%dT%H:%i:%s') as production_updated_at,
            DATE_FORMAT(o.date_livraison, '%Y-%m-%dT%H:%i:%s') as production_date_livraison,
            DATE_FORMAT(o.date_livraison_confirmee, '%Y-%m-%dT%H:%i:%s') as production_date_livraison_confirmee,
            (SELECT COUNT(*) FROM edi_invoic ei 
             WHERE (ei.order_reference = eo.document_number OR ei.order_reference = o.num_commande OR (ei.id_order IS NOT NULL AND ei.id_order = o.id_order))
             AND ei.direction = 'OUTBOUND' AND ei.status NOT IN ('REJECTED', 'ERROR')) as invoice_count
        FROM edi_orders eo
        LEFT JOIN orders o ON eo.document_number = o.num_commande AND o.id_entite_seller = ?
        WHERE eo.supplier_gln = ? 
        ORDER BY eo.created_at DESC
    `;
    
    const stagingOrders = await queryDB(entiteDB, query, [sellerId, sellerGln]);
    console.log(`[BACKEND INCOMING] Found ${stagingOrders.length} staging orders`);

    const orders = [];

    // Helper to format EANCOM date (YYYYMMDD) to YYYY-MM-DD
    const formatEancomDate = (str) => {
        if (!str || str.length < 8) return null;
        return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    };

    for (const so of stagingOrders) {
        // Parse raw data to get details
        let raw = {};
        try {
            raw = JSON.parse(so.raw_data);
        } catch (e) {
            console.error("Failed to parse raw_data for staging order", so.id);
            continue;
        }

        // Resolve Buyer Name
        let buyerName = raw.buyer?.name || 'Unknown Buyer';
        let buyerId = 0; 
        if (so.buyer_gln) {
             const buyerRows = await queryDB(entiteDB, "SELECT id_entite, raison_socialle FROM Entite WHERE gln = ?", [so.buyer_gln]);
             if (buyerRows.length > 0) {
                 buyerName = buyerRows[0].raison_socialle;
                 buyerId = buyerRows[0].id_entite;
             }
        }

        // Map Lines and fetch images
        const lines = [];
        if (raw.items && Array.isArray(raw.items)) {
            for (const item of raw.items) {
                // Fetch image for GTIN
                let imageUrl = null;
                let confirmedQty = item.qty || item.qtyOrdered;
                let confirmedPrice = item.price;
                let lineComment = null;
                
                if (item.gtin) {
                    const imgRows = await queryDB(entiteDB, "SELECT images FROM fiche_produit WHERE gtin = ?", [item.gtin]);
                    if (imgRows.length > 0) {
                        imageUrl = imgRows[0].images;
                    }
                    
                    // If we have a production order, fetch the confirmed details for this line
                    if (so.production_id_order) {
                        const prodLineRows = await queryDB(entiteDB, 
                            "SELECT confirmed_qty, confirmed_price, line_comment FROM order_lines WHERE id_order = ? AND gtin = ?", 
                            [so.production_id_order, item.gtin]
                        );
                        if (prodLineRows.length > 0) {
                            const pl = prodLineRows[0];
                            if (pl.confirmed_qty !== null) confirmedQty = pl.confirmed_qty;
                            if (pl.confirmed_price !== null) confirmedPrice = pl.confirmed_price;
                            if (pl.line_comment !== null) lineComment = pl.line_comment;
                        }
                    }
                }

                lines.push({
                    gtin: item.gtin,
                    libelle: item.description,
                    qty: item.qty || item.qtyOrdered,
                    price: item.price,
                    confirmedQty: confirmedQty,
                    confirmed_qty: confirmedQty, // Add snake_case alias
                    confirmedPrice: confirmedPrice,
                    confirmed_price: confirmedPrice, // Add snake_case alias
                    comment: lineComment,
                    line_comment: lineComment, // Add snake_case alias
                    images: imageUrl
                });
            }
        }

        orders.push({
            id_order: so.id, // Use staging ID as temporary order ID
            is_staging: true, // Flag to indicate this is from staging
            num_order: so.num_order,
            num_commande: so.num_order, // Add num_commande for deduplication
            date_reception: so.date_reception,
            date_livraison: so.production_date_livraison || so.delivery_date,
            date_livraison_confirmee: so.production_date_livraison_confirmee || so.production_date_livraison || null,
            date_livraison_demandee: formatEancomDate(raw.deliveryDateRequested),
            date_livraison_plus_tot: formatEancomDate(raw.deliveryDateEarliest),
            date_livraison_plus_tard: formatEancomDate(raw.deliveryDateLatest),
            lieu_livraison_gln: raw.deliveryParty?.gln || raw.lieu_livraison_primaire,
            id_entite_seller: sellerId,
            id_entite_buyer: buyerId,
            buyer_gln: so.buyer_gln || '', // Buyer GLN from edi_orders
            acheteur_gln: so.buyer_gln || '', // Alias for InvoiceCreationModal
            buyer_name: buyerName, // Add buyer_name
            seller_name: sellerName, // Add seller_name
            fournisseur_gln: sellerGln, // Seller/Supplier GLN
            total_ht: so.total_ht,
            monnaie: so.monnaie, // Currency from edi_orders
            // Use production status if available and meaningful for supplier
            // 'sent' is a buyer-side status (means buyer sent the order) - supplier should see 'received'
            // 'new' is also buyer-side (order just created, not yet sent) - supplier should see 'received'
            // Only use production_status if it reflects a supplier action (accepted, rejected, modified)
            status: (so.production_status && !['sent', 'new'].includes(so.production_status)) 
              ? so.production_status 
              : (so.statut === 'PENDING_VALIDATION' ? 'received' : so.statut), 
            statut: (so.production_status && !['sent', 'new'].includes(so.production_status)) 
              ? so.production_status 
              : (so.statut === 'PENDING_VALIDATION' ? 'received' : so.statut),
            type: "ReÃ§ue",
            _server: "local",
            montant_ht: so.total_ht,
            comment: so.production_comment, // Include the global comment from production
            updated_at: so.production_updated_at,
            lines: lines, // Include parsed lines for articles count
            has_invoice: so.invoice_count > 0,
            invoice_count: so.invoice_count
        });
        
        console.log(`[BACKEND INCOMING] Staging Order #${so.id} mapped with ${lines.length} lines`);
    }

    console.log("=== [BACKEND] GET /api/orders/incoming - END ===\n");
    res.json({ orders: orders });
  } catch (err) {
    console.error("[BACKEND INCOMING] Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 4.1. ACCEPT MODIFICATIONS (ORDCHG) - Buyer accepts Supplier's modifications
let generateOrderChangeEANCOM;
try {
  generateOrderChangeEANCOM = require('./generateOrderChangeEANCOM');
  console.log("âœ… generateOrderChangeEANCOM loaded successfully");
} catch (e) {
  console.error("âŒ Failed to load generateOrderChangeEANCOM:", e);
}

app.get("/api/orders/test-ordchg", (req, res) => {
  res.json({ message: "Test ORDCHG route works", moduleLoaded: !!generateOrderChangeEANCOM });
});

app.post("/api/orders/accept-modifications", async function (req, res) {
  console.log("ðŸ‘‰ ENTERING POST /api/orders/accept-modifications");
  try {
    const rawId = Number(req.headers["x-entite-id"]);
    if (!rawId) return res.status(400).json({ error: "Missing x-entite-id" });

    // Resolve buyer ID
    let buyerId = rawId;
    const directEntity = await queryOne(entiteDB, "SELECT id_entite FROM Entite WHERE id_entite = ?", [rawId]);
    if (!directEntity) {
      const accountRow = await queryOne(entiteDB, "SELECT id_entite FROM comptes WHERE id_compte = ?", [rawId]);
      if (accountRow && accountRow.id_entite) {
        buyerId = accountRow.id_entite;
      } else {
        return res.status(400).json({ error: "Could not resolve entity from x-entite-id" });
      }
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "Missing orderId" });
    }

    console.log(`[ORDCHG] Buyer #${buyerId} accepting modifications for order #${orderId}`);

    // 1. Fetch original order details to verify state and ownership
    const order = await queryOne(entiteDB, 
      "SELECT * FROM orders WHERE id_order = ? AND id_entite_buyer = ?", 
      [orderId, buyerId]
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found or access denied" });
    }

    if (order.status !== 'modified' && order.status !== 'modifiÃ©e') {
      return res.status(400).json({ error: "Order must be in 'modified' status to accept changes. Current status: " + order.status });
    }

    // Resolve Names
    let buyerName = "Buyer";
    const buyerEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE id_entite = ?", [buyerId]);
    if (buyerEntity) buyerName = buyerEntity.raison_socialle;

    let supplierName = order.seller_name || "Supplier";
    if (order.id_entite_seller) {
        const supplierEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE id_entite = ?", [order.id_entite_seller]);
        if (supplierEntity) supplierName = supplierEntity.raison_socialle;
    } else if (order.fournisseur_gln) {
         const supplierEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE gln = ?", [order.fournisseur_gln]);
         if (supplierEntity) supplierName = supplierEntity.raison_socialle;
    }

    // Fetch lines
    const lines = await queryDB(entiteDB, "SELECT * FROM order_lines WHERE id_order = ?", [orderId]);

    // 2. Prepare data for EANCOM ORDCHG
    const changeNumber = "CHG" + Date.now();
    
    const ordchgData = {
      changeNumber: changeNumber,
      originalOrderNumber: order.num_commande,
      buyerGln: order.acheteur_gln,
      supplierGln: order.fournisseur_gln,
      buyerName: buyerName,
      supplierName: supplierName,
      comment: "Modifications approuvÃ©es par l'acheteur",
      articles: lines.map(line => ({
        gtin: line.gtin,
        qty: line.confirmed_qty !== null ? line.confirmed_qty : line.qty,
        price: line.confirmed_price !== null ? line.confirmed_price : line.price
      }))
    };

    // 3. Generate EANCOM file
    const ordchgContent = generateOrderChangeEANCOM(ordchgData);
    
    // Save file
    const ediOrdersPath = configService.getEdiOrdersPath();
    const dir = path.join(ediOrdersPath, "changes", order.acheteur_gln, order.num_commande);
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `ordchg_${changeNumber}.txt`);
    await fs.promises.writeFile(filePath, ordchgContent, "utf8");
    console.log(`[ORDCHG] File generated: ${filePath}`);

    // 4. Update Order Status in DB locally (Buyer side)
    const newStatus = 'accepted'; // Internal status representing final mutual agreement
    await runUpdate(entiteDB, 
      "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id_order = ?", 
      [newStatus, orderId]
    );

    // 5. Create EDI Transmission record
    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: orderId,
      related_type: 'ORDER_CHANGE', 
      document_type: 'ORDCHG',
      direction: 'OUTBOUND',
      partner_id: order.id_entite_seller, 
      partner_gln: order.fournisseur_gln,
      sender_gln: order.acheteur_gln,
      filename: `ordchg_${changeNumber}.txt`,
      file_path: filePath,
      file_content: ordchgContent,
      status: 'PENDING',
      logs: `Order Change (Accept Modifications) for order ${order.num_commande} generated`
    });

    // 6. Send to EDI Server (Async)
    const ediTarget = await configService.getEdiTargetUrl(entiteDB, order.fournisseur_gln);
    const ediServerUrl = ediTarget.url;
    
    console.log(`[ORDCHG SEND] ðŸŽ¯ EDI Routing: ${order.fournisseur_gln} -> ${ediTarget.countryName} -> ${ediServerUrl}`);
    
    setImmediate(async () => {
      try {
        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: ordchgContent,
          filename: `ordchg_${order.num_commande}_${changeNumber}.txt`,
          partnerGln: order.fournisseur_gln, // Send TO the supplier
          senderGln: order.acheteur_gln
        }, {
          headers: serviceAuthHeaders()
        });

        console.log(`[ORDCHG SEND] âœ… Sent to EDI server. Response:`, ediResponse.data);
        
        await updateEdiTransmissionStatus(
          entiteDB, 
          transmissionId, 
          'SENT',
          `Successfully sent to EDI server.`,
          null
        );
      } catch (ediErr) {
        console.error(`[ORDCHG SEND] âŒ Failed to send:`, ediErr.message);
        await updateEdiTransmissionStatus(
          entiteDB, transmissionId, 'ERROR', `Failed to send`, ediErr.message
        );
      }
    });

    res.json({ 
      success: true, 
      message: `Modifications accepted successfully`, 
      changeNumber,
      transmissionId 
    });

  } catch (err) {
    console.error("[ORDCHG] Error:", err);
    res.status(500).json({ error: "Failed to process modification acceptance", details: safeErrDetails(err) });
  }
});

// 4. RESPOND TO ORDER (ORDRSP) - Accept, Reject, Modify
app.post("/api/orders/respond", async function (req, res) {
  try {
    const rawId = Number(req.headers["x-entite-id"]);
    if (!rawId) return res.status(400).json({ error: "Missing x-entite-id" });

    // Resolve: x-entite-id may be an id_entite OR an id_compte (account ID).
    // Try direct entity lookup first; if not found, resolve via comptes table.
    let sellerId = rawId;
    const directEntity = await queryOne(entiteDB, "SELECT id_entite FROM Entite WHERE id_entite = ?", [rawId]);
    
    if (!directEntity) {
      const accountRow = await queryOne(entiteDB, "SELECT id_entite FROM comptes WHERE id_compte = ?", [rawId]);
      if (accountRow && accountRow.id_entite) {
        sellerId = accountRow.id_entite;
        console.log(`[ORDRSP] Resolved id_compte ${rawId} -> id_entite ${sellerId}`);
      } else {
        return res.status(400).json({ error: "Could not resolve entity from x-entite-id" });
      }
    }

    const { orderId, status, comment, modifiedArticles, confirmedDeliveryDate, isStaging } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ error: "Missing orderId or status" });
    }

    if (!['accepted', 'rejected', 'modified'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'accepted', 'rejected', or 'modified'" });
    }

    console.log(`[ORDRSP] Processing response for order #${orderId} (Staging: ${isStaging}): ${status}`);
    console.log(`[ORDRSP] Confirmed delivery date:`, confirmedDeliveryDate);

    let order = null;
    let lines = [];
    let productionOrderId = orderId; // Will change if promoting from staging

    // --- PHASE 3: PROMOTION FROM STAGING ---
    if (isStaging) {
        console.log(`[ORDRSP] Promoting Staging Order #${orderId} to Production...`);
        
        // 1. Fetch from Staging
        const stagingOrder = await queryOne(entiteDB, "SELECT * FROM edi_orders WHERE id = ?", [orderId]);
        if (!stagingOrder) {
            return res.status(404).json({ error: "Staging order not found" });
        }
        
        // Check access (Supplier GLN match)
        const sellerEntity = await queryOne(entiteDB, "SELECT gln, raison_socialle FROM Entite WHERE id_entite = ?", [sellerId]);
        if (!sellerEntity || stagingOrder.supplier_gln !== sellerEntity.gln) {
            console.error(`[ORDRSP] Access Denied. Seller GLN: ${sellerEntity?.gln}, Order Supplier GLN: ${stagingOrder.supplier_gln}`);
            return res.status(403).json({ error: "Access denied to this staging order" });
        }

        const rawData = JSON.parse(stagingOrder.raw_data);
        
        // Resolve Buyer ID
        let buyerId = null;
        if (stagingOrder.buyer_gln) {
            const buyerRow = await queryOne(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [stagingOrder.buyer_gln]);
            if (buyerRow) {
                buyerId = buyerRow.id_entite;
                console.log(`[ORDRSP] Buyer GLN ${stagingOrder.buyer_gln} resolved to id_entite: ${buyerId}`);
            } else {
                console.log(`[ORDRSP] Buyer GLN ${stagingOrder.buyer_gln} not found in local DB (inter-country order). buyerId will be NULL.`);
            }
        }

        // 2. Check if already exists in Production to avoid duplicates
        const existingOrder = await queryOne(entiteDB, 
            "SELECT id_order FROM orders WHERE num_commande = ? AND id_entite_seller = ?", 
            [stagingOrder.document_number, sellerId]
        );

        if (existingOrder) {
             console.log(`[ORDRSP] Order #${stagingOrder.document_number} already exists in production (ID: ${existingOrder.id_order}). Using existing record.`);
             productionOrderId = existingOrder.id_order;
             
             // Update basic info if needed (e.g. totals could have changed if we re-parsed? Unlikely but safe to update basics if needed)
             // For now, we assume standard fields are same. Status will be updated later.
        } else {
            // Insert into Production 'orders' table
            const orderInsertSql = `
              INSERT INTO orders (
                num_commande, order_number, 
                id_entite_buyer, acheteur_gln, 
                id_entite_seller, fournisseur_gln, seller_name,
                lieu_livraison_gln, 
                status, 
                total_ht, total_tax_amount, total_amount_with_tax,
                currency, 
                date_commande, date_livraison,
                date_livraison_demandee, date_livraison_plus_tot, date_livraison_plus_tard,
                contract_reference,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            // Helper to convert EANCOM YYYYMMDD to YYYY-MM-DD
            const parseEancomDate = (str) => {
              if (!str || str.length < 8) return null;
              return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)} 00:00:00`;
            };

            const orderParams = [
              stagingOrder.document_number, stagingOrder.document_number,
              buyerId, stagingOrder.buyer_gln,
              sellerId, stagingOrder.supplier_gln, sellerEntity.raison_socialle,
              rawData.deliveryParty?.gln || stagingOrder.buyer_gln,
              'received', // Initial status
              stagingOrder.total_amount || 0,
              rawData.totals?.taxAmount || 0,
              rawData.totals?.totalAmount || 0,
              stagingOrder.currency || 'EUR',
              stagingOrder.order_date,
              stagingOrder.delivery_date,
              parseEancomDate(rawData.deliveryDateRequested),
              parseEancomDate(rawData.deliveryDateEarliest),
              parseEancomDate(rawData.deliveryDateLatest),
              rawData.contractReference || null
            ];

            const orderResult = await runUpdate(entiteDB, orderInsertSql, orderParams);
            productionOrderId = orderResult.lastID;
            console.log(`[ORDRSP] âœ… Promoted to Production Order #${productionOrderId}`);

            // 3. Insert Lines
            if (rawData.items && Array.isArray(rawData.items)) {
                for (const item of rawData.items) {
                     await runUpdate(entiteDB, `
                      INSERT INTO order_lines (
                        id_order, line_number, gtin, libelle, qty, unit, price
                      ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                      productionOrderId, item.lineNumber,
                      item.gtin, item.description,
                      item.qty, item.unit || 'PCE',
                      item.price
                    ]);
                }
            }
        }

        // 4. Update Staging Status to match the decision (also save comment and confirmed delivery date)
        await runUpdate(entiteDB, "UPDATE edi_orders SET status = ?, production_comment = ?, production_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, comment || null, orderId]);
        
        // 5. Fetch the newly created order and lines for ORDRSP generation
        order = await queryOne(entiteDB, "SELECT * FROM orders WHERE id_order = ?", [productionOrderId]);
        lines = await queryDB(entiteDB, "SELECT * FROM order_lines WHERE id_order = ?", [productionOrderId]);

    } else {
        // Standard flow (existing production order)
        // 1. Fetch original order details
        console.log(`[ORDRSP] Fetching production order #${orderId} for seller #${sellerId}`);
        order = await queryOne(entiteDB, 
          "SELECT * FROM orders WHERE id_order = ? AND id_entite_seller = ?", 
          [orderId, sellerId]
        );

        if (!order) {
          console.error(`[ORDRSP] Order #${orderId} not found for seller #${sellerId}. Checking existence...`);
          const checkOrder = await queryOne(entiteDB, "SELECT id_entite_seller FROM orders WHERE id_order = ?", [orderId]);
          if (checkOrder) {
             console.error(`[ORDRSP] Order exists but seller mismatch. Expected: ${sellerId}, Actual: ${checkOrder.id_entite_seller}`);
          } else {
             console.error(`[ORDRSP] Order #${orderId} does not exist in 'orders' table.`);
          }
          return res.status(404).json({ error: "Order not found or access denied" });
        }

        // Fetch lines
        lines = await queryDB(entiteDB, "SELECT * FROM order_lines WHERE id_order = ?", [orderId]);
    }

    // 2. Prepare data for EANCOM ORDRSP
    const responseNumber = "RSP" + Date.now(); // Simple ID generation
    
    // Resolve Names for EANCOM
    let supplierName = order.seller_name || "Supplier";
    const supplierEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE id_entite = ?", [sellerId]);
    if (supplierEntity) supplierName = supplierEntity.raison_socialle;

    let buyerName = "Buyer";
    if (order.id_entite_buyer) {
        const buyerEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE id_entite = ?", [order.id_entite_buyer]);
        if (buyerEntity) buyerName = buyerEntity.raison_socialle;
    } else if (order.acheteur_gln) {
         const buyerEntity = await queryOne(entiteDB, "SELECT raison_socialle FROM Entite WHERE gln = ?", [order.acheteur_gln]);
         if (buyerEntity) buyerName = buyerEntity.raison_socialle;
    }
    
    // Fallback: Try to get Buyer Name from original EDI Order if not found in local DB
    if (buyerName === "Buyer") {
         const originalEdiOrder = await queryOne(entiteDB, "SELECT raw_data FROM edi_orders WHERE document_number = ? LIMIT 1", [order.num_commande]);
         if (originalEdiOrder) {
             try {
                 const raw = JSON.parse(originalEdiOrder.raw_data);
                 if (raw.buyer && raw.buyer.name) {
                     buyerName = raw.buyer.name;
                     console.log(`[ORDRSP] Resolved buyerName from edi_orders: ${buyerName}`);
                 }
             } catch(e) {
                 console.error("[ORDRSP] Failed to parse raw_data for buyer name fallback", e);
             }
         }
    }

    // Merge original lines with modifications if any
    console.log(`[ORDRSP] modifiedArticles received:`, JSON.stringify(modifiedArticles));
    let finalArticles = lines.map(line => {
      const mod = modifiedArticles ? modifiedArticles.find(m => m.gtin === line.gtin) : null;
      const result = {
        gtin: line.gtin,
        libelle: line.libelle,
        lineNumber: line.line_number,
        qty: line.qty, // Original qty
        price: line.price, // Original price
        unit: line.unit || 'PCE',
        confirmedQty: mod ? mod.qty : (status === 'rejected' ? 0 : line.qty),
        confirmedPrice: mod && mod.price !== undefined ? mod.price : line.price,
        comment: mod ? mod.comment : null
      };
      console.log(`[ORDRSP] Line ${line.gtin}: original price=${line.price}, mod.price=${mod?.price}, confirmedPrice=${result.confirmedPrice}`);
      return result;
    });

    const ordrspData = {
      responseNumber: responseNumber,
      originalOrderNumber: order.num_commande,
      originalOrderDate: order.created_at, // Format needs check
      requestedDeliveryDate: order.date_livraison,
      confirmedDeliveryDate: confirmedDeliveryDate || order.date_livraison,
      status: status, // accepted, rejected, modified
      buyerGln: order.acheteur_gln,
      supplierGln: order.fournisseur_gln,
      buyerName: buyerName,
      supplierName: supplierName,
      currency: order.monnaie || 'TND',
      comment: comment,
      articles: finalArticles
    };

    // 3. Generate EANCOM file
    const ordrspContent = generateOrderResponseEANCOM(ordrspData);
    
    // Save file using configurable EDI_ORDERS_PATH from database
    const ediOrdersPath = configService.getEdiOrdersPath();
    const dir = path.join(ediOrdersPath, "responses", order.fournisseur_gln, order.num_commande);
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `ordrsp_${responseNumber}.txt`);
    await fs.promises.writeFile(filePath, ordrspContent, "utf8");
    console.log(`[ORDRSP] File generated: ${filePath}`);

    // 4. Update Order Status in DB
    // Map internal status to DB status
    // 'accepted' -> 'accepted' (or 'processing')
    // 'rejected' -> 'rejected'
    // 'modified' -> 'modified' (or 'processing' with flag)
    
    // Save confirmed delivery date to date_livraison_confirmee (never overwrite date_livraison / date_livraison_demandee)
    if (confirmedDeliveryDate) {
      await runUpdate(entiteDB,
        "UPDATE orders SET status = ?, comment = ?, date_livraison_confirmee = ? WHERE id_order = ?",
        [status, comment || null, confirmedDeliveryDate, productionOrderId]
      );
    } else {
      await runUpdate(entiteDB, 
        "UPDATE orders SET status = ?, comment = ? WHERE id_order = ?", 
        [status, comment || null, productionOrderId]
      );
    }

    // Update order_lines with confirmed prices and quantities
    for (const article of finalArticles) {
      try {
        await runUpdate(entiteDB,
          "UPDATE order_lines SET confirmed_qty = ?, confirmed_price = ?, line_comment = ? WHERE id_order = ? AND gtin = ?",
          [article.confirmedQty, article.confirmedPrice, article.comment || null, productionOrderId, article.gtin]
        );
        console.log(`[ORDRSP] Updated line for GTIN ${article.gtin}: confirmedQty=${article.confirmedQty}, confirmedPrice=${article.confirmedPrice}`);
      } catch (lineUpdateErr) {
        console.error(`[ORDRSP] Failed to update line for GTIN ${article.gtin}:`, lineUpdateErr.message);
      }
    }

    // 5. Create EDI Transmission record
    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: productionOrderId,
      related_type: 'ORDER_RESPONSE', // New type
      document_type: 'ORDRSP',
      direction: 'OUTBOUND',
      partner_id: order.id_entite_buyer, 
      partner_gln: order.acheteur_gln,
      sender_gln: order.fournisseur_gln,
      filename: `ordrsp_${responseNumber}.txt`,
      file_path: filePath,
      file_content: ordrspContent,
      status: 'PENDING',
      logs: `Order Response ${status} for order ${order.num_commande} generated`
    });

    // 6. Send to EDI Server (Async) - Use dynamic routing
    const ediTarget = await configService.getEdiTargetUrl(entiteDB, order.acheteur_gln);
    const ediServerUrl = ediTarget.url;
    
    console.log(`[ORDRSP SEND] ðŸŽ¯ EDI Routing: ${order.acheteur_gln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);
    
    setImmediate(async () => {
      try {
        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: ordrspContent,
          filename: `ordrsp_${order.num_commande}_${responseNumber}.txt`,
          partnerGln: order.acheteur_gln, // Send TO the buyer
          senderGln: order.fournisseur_gln
        }, {
          headers: serviceAuthHeaders()
        });

        console.log(`[ORDRSP SEND] âœ… Sent to EDI server. Response:`, ediResponse.data);
        
        await updateEdiTransmissionStatus(
          entiteDB, 
          transmissionId, 
          'SENT',
          `Successfully sent to EDI server.`,
          null
        );

        // Notify Buyer (if local)
        // ... (Optional: logic to find buyer user and notify)

      } catch (ediErr) {
        console.error(`[ORDRSP SEND] âŒ Failed to send:`, ediErr.message);
        await updateEdiTransmissionStatus(
          entiteDB, transmissionId, 'ERROR', `Failed to send`, ediErr.message
        );
      }
    });

    res.json({ 
      success: true, 
      message: `Order ${status} successfully`, 
      responseNumber,
      transmissionId 
    });

  } catch (err) {
    console.error("[ORDRSP] Error:", err);
    res.status(500).json({ error: "Failed to process response", details: safeErrDetails(err) });
  }
});

// GET /api/orders/sent - RÃ©cupÃ©rer les commandes envoyÃ©es
app.get("/api/orders/sent", async function (req, res) {
  try {
    console.log("\n=== [BACKEND] GET /api/orders/sent - START ===");
    const rawBuyerId = Number(req.headers["x-entite-id"]);
    console.log("[BACKEND SENT] rawBuyerId (from x-entite-id):", rawBuyerId);
    
    if (!rawBuyerId) {
      console.log("[BACKEND SENT] Missing x-entite-id");
      return res.status(400).json({ error: "Missing x-entite-id" });
    }

    // Resolve: x-entite-id may be id_entite OR id_compte
    let buyerId = rawBuyerId;
    const directBuyerEntity = await queryOne(entiteDB, "SELECT id_entite FROM Entite WHERE id_entite = ?", [rawBuyerId]);
    if (!directBuyerEntity) {
      const accountRow = await queryOne(entiteDB, "SELECT id_entite FROM comptes WHERE id_compte = ?", [rawBuyerId]);
      if (accountRow && accountRow.id_entite) {
        buyerId = accountRow.id_entite;
        console.log(`[BACKEND SENT] Resolved id_compte ${rawBuyerId} -> id_entite ${buyerId}`);
      }
    }

    // RÃ©cupÃ©rer les commandes envoyÃ©es (oÃ¹ l'entitÃ© est l'acheteur)
    // Inclure num_commande et le nom du fournisseur pour un affichage correct
    const query = `
      SELECT 
        o.id_order, 
        o.num_commande,
        o.order_number,
        o.status, 
        o.comment,
        DATE_FORMAT(o.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
        DATE_FORMAT(o.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at,
        o.total_ht,
        DATE_FORMAT(o.date_livraison, '%Y-%m-%dT%H:%i:%s') AS date_livraison,
        DATE_FORMAT(COALESCE(o.date_livraison_confirmee, o.date_livraison), '%Y-%m-%dT%H:%i:%s') AS date_livraison_confirmee,
        DATE_FORMAT(o.date_livraison_demandee, '%Y-%m-%dT%H:%i:%s') AS date_livraison_demandee,
        DATE_FORMAT(o.date_livraison_plus_tot, '%Y-%m-%dT%H:%i:%s') AS date_livraison_plus_tot,
        DATE_FORMAT(o.date_livraison_plus_tard, '%Y-%m-%dT%H:%i:%s') AS date_livraison_plus_tard,
        o.lieu_livraison_gln,
        COALESCE(o.monnaie, o.currency, 'TND') as monnaie,
        o.id_entite_seller,
        o.id_entite_buyer,
        o.fournisseur_gln,
        o.acheteur_gln,
        COALESCE(
          o.seller_name,
          (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_seller LIMIT 1),
          'Fournisseur'
        ) AS seller_name,
        (SELECT e.raison_socialle FROM Entite e WHERE e.id_entite = o.id_entite_buyer LIMIT 1) AS buyer_name
      FROM orders o
      WHERE o.id_entite_buyer = ?
      ORDER BY o.id_order DESC
    `;
    
    console.log("[BACKEND SENT] Executing query...");
    const orders = await queryDB(entiteDB, query, [buyerId]);
    console.log(`[BACKEND SENT] Found ${orders.length} sent orders`);

    // Charger les lignes de commande pour chaque commande
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      console.log(`[BACKEND SENT] Order #${i + 1}:`, {
        id_order: o.id_order,
        num_commande: o.num_commande,
        id_entite_seller: o.id_entite_seller,
        id_entite_buyer: o.id_entite_buyer,
        seller_name: o.seller_name,
        buyer_name: o.buyer_name,
        status: o.status,
        comment: o.comment,
        updated_at: o.updated_at,
        total_ht: o.total_ht,
        date_livraison: o.date_livraison,
        monnaie: o.monnaie,
        created_at: o.created_at
      });
      const lines = await queryDB(
        entiteDB, 
        "SELECT ol.product_id, ol.gtin, ol.libelle, ol.qty, ol.price AS prix, ol.confirmed_qty AS confirmedQty, ol.confirmed_price AS confirmedPrice, ol.line_comment AS lineComment, fp.images FROM order_lines ol LEFT JOIN fiche_produit fp ON ol.gtin = fp.gtin WHERE ol.id_order = ?", 
        [o.id_order]
      );
      console.log(`[BACKEND SENT] Order #${o.id_order} lines with images:`, lines.map(l => ({
        gtin: l.gtin,
        libelle: l.libelle,
        qty: l.qty,
        prix: l.prix,
        confirmedQty: l.confirmedQty,
        confirmedPrice: l.confirmedPrice,
        comment: l.lineComment,
        images: l.images || 'NO IMAGE'
      })));
      o.lines = lines.map(l => ({
        gtin: l.gtin,
        libelle: l.libelle,
        qty: l.qty,
        prix: l.prix,
        price: l.prix, // Add price alias for compatibility
        confirmedQty: l.confirmedQty !== null ? l.confirmedQty : l.qty,
        confirmed_qty: l.confirmedQty !== null ? l.confirmedQty : l.qty, // Add snake_case alias
        confirmedPrice: l.confirmedPrice !== null ? l.confirmedPrice : l.prix,
        confirmed_price: l.confirmedPrice !== null ? l.confirmedPrice : l.prix, // Add snake_case alias
        comment: l.lineComment,
        line_comment: l.lineComment, // Add snake_case alias
        images: l.images
      }));

      // Fetch transport info
      const transport = await queryOne(entiteDB, "SELECT * FROM edi_transport_orders WHERE id_order = ?", [o.id_order]);
      if (transport) {
        o.transport = transport;
      }

      console.log(`[BACKEND SENT] Order ${o.id_order} has ${lines.length} lines`);
    }

    console.log("=== [BACKEND] GET /api/orders/sent - END ===\n");
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET INVALID ORDERS (like commande_invalide_model.php -> getALLCommandeInValide)
app.get("/api/orders/invalid", async function (req, res) {
  try {
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
app.get("/api/orders/archived", async function (req, res) {
  try {
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

// 6. ORDER RESPONSE / VALIDATE (updates orders table status)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch order header
    const orderRows = await queryDB(entiteDB, "SELECT * FROM orders WHERE id_order = ?", [id]);
    if (!orderRows || orderRows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderRows[0];
    
    // Fetch order lines
    const rawLines = await queryDB(entiteDB, "SELECT * FROM order_lines WHERE id_order = ?", [id]);
    const lines = rawLines.map(l => ({
      ...l,
      price: l.price || l.prix,
      confirmedQty: l.confirmed_qty !== null ? l.confirmed_qty : l.qty,
      confirmedPrice: l.confirmed_price !== null ? l.confirmed_price : (l.price || l.prix),
      confirmed_qty: l.confirmed_qty !== null ? l.confirmed_qty : l.qty,
      confirmed_price: l.confirmed_price !== null ? l.confirmed_price : (l.price || l.prix),
      comment: l.line_comment,
      line_comment: l.line_comment
    }));
    
    // Fetch related DESADV
    const desadvRows = await queryDB(entiteDB, "SELECT desadv_number FROM edi_desadv WHERE id_order = ? ORDER BY created_at DESC LIMIT 1", [id]);
    const desadvNumber = desadvRows.length > 0 ? desadvRows[0].desadv_number : null;
    
    res.json({ ...order, lines, desadvNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders/:id/response", async function (req, res) {
  try {
    var orderId = Number(req.params.id);
    var responderId = Number(req.headers["x-entite-id"]);
    var action = req.body.action;
    if (["accept", "reject", "validate"].indexOf(action) === -1)
      return res.status(400).json({ error: "Invalid action" });
    var newStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "valid";
    await queryDB(entiteDB, "INSERT INTO order_responses (id_order, id_entite_responder, action, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
      [orderId, responderId, action]
    );
    await queryDB(entiteDB, "UPDATE orders SET status = ? WHERE id_order = ?", [newStatus, orderId]);
    if (action === "validate") {
      // Move from invalid to valid
      // Note: mapping from invalid_orders to orders requires matching schema or manual mapping.
      // Assuming invalid_orders contains the raw data needed.
      const invalidOrder = await queryDB(entiteDB, "SELECT * FROM invalid_orders WHERE id_order = ?", [orderId]);
      if (invalidOrder.length > 0) {
         const io = invalidOrder[0];
         // We need to construct the orders row. WARNING: invalid_orders might miss columns like id_entite_buyer
         // Best effort mapping:
         await queryDB(entiteDB, 
            "INSERT INTO orders (num_commande, order_number, id_entite_buyer, id_entite_seller, status, total_ht, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", 
            [io.num_order, io.num_order, io.id_entite, io.id_fournisseur, 'new', io.total_ht]
         );
         await queryDB(entiteDB, "DELETE FROM invalid_orders WHERE id_order = ?", [orderId]);
      }
    }
    res.json({ success: true, newStatus: newStatus });
  } catch (err) {
    console.error("response error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 7. DELETE ORDER (like suppcmd in commande_valide_Historique.php)
app.delete("/api/orders/:id", async function (req, res) {
  try {
    var orderId = Number(req.params.id);
    await queryDB(entiteDB, "DELETE FROM Orders WHERE id_order = ?", [orderId]);
    await queryDB(entiteDB, "DELETE FROM order_lines WHERE id_order = ?", [orderId]);
    res.json({ success: true });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== NOTIFICATIONS PROXY ENDPOINT ====================
// Proxy endpoint to fetch notifications from the notifications server
// This avoids CORS issues by making the request server-side

// Throttle mechanism to avoid log pollution when server is down
let notificationsServerDown = false;
let lastNotificationError = 0;
const NOTIFICATION_ERROR_COOLDOWN = 30000; // 30 seconds

app.get('/api/proxy/notifications', async (req, res) => {
  try {
    res.set('Cache-Control', 'private, max-age=30');
    const { id_compte } = req.query;
    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }
    const sql = 'SELECT id_notification, contenu, type, created_at, `read` FROM notifications WHERE id_compte = ? ORDER BY created_at DESC';
    const rows = await queryDB(entiteDB, sql, [parseInt(id_compte)]);
    res.json(rows);
  } catch (err) {
    console.error('[NOTIFICATIONS PROXY] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications', details: safeErrDetails(err) });
  }
});

// Proxy endpoint for creating a notification
app.post('/api/proxy/notifications', async (req, res) => {
  try {
    const { contenu, type, id_compte, link } = req.body;
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
    console.error('[NOTIFICATIONS PROXY] Error creating notification:', err.message);
    res.status(500).json({ error: 'Failed to create notification', details: safeErrDetails(err) });
  }
});

// Proxy endpoint for marking notification as read
app.put('/api/proxy/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_compte } = req.body;
    if (!id_compte || isNaN(id_compte)) {
      return res.status(400).json({ error: 'Valid id_compte is required' });
    }
    const updateSql = 'UPDATE notifications SET `read` = 1 WHERE id_notification = ? AND id_compte = ?';
    const result = await queryDB(entiteDB, updateSql, [parseInt(id), parseInt(id_compte)]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or unauthorized' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[NOTIFICATIONS PROXY] Error marking as read:', err.message);
    res.status(500).json({ error: 'Failed to update notification', details: safeErrDetails(err) });
  }
});

// ==================== EDI TRANSMISSIONS MANAGEMENT ====================

// GET /api/edi/transmissions/:orderId - Get all transmissions for an order
app.get('/api/edi/transmissions/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const transmissions = await getEdiTransmissions(entiteDB, orderId, 'ORDER');
    
    res.json({ 
      orderId,
      count: transmissions.length,
      transmissions 
    });
  } catch (err) {
    console.error('[EDI] Error fetching transmissions:', err);
    res.status(500).json({ error: 'Failed to fetch transmissions', details: safeErrDetails(err) });
  }
});

// POST /api/edi/transmissions/:id/retry - Retry a failed transmission
app.post('/api/edi/transmissions/:id/retry', async (req, res) => {
  try {
    const transmissionId = parseInt(req.params.id);
    if (isNaN(transmissionId)) {
      return res.status(400).json({ error: 'Invalid transmission ID' });
    }

    // Increment retry count
    await incrementRetryCount(entiteDB, transmissionId);
    
    // Update status back to PENDING for retry
    await updateEdiTransmissionStatus(
      entiteDB, 
      transmissionId, 
      'PENDING', 
      `Retry requested by user at ${new Date().toISOString()}`
    );
    
    console.log(`[EDI] Transmission #${transmissionId} queued for retry`);
    res.json({ success: true, message: 'Transmission queued for retry', transmissionId });
  } catch (err) {
    console.error('[EDI] Error retrying transmission:', err);
    res.status(500).json({ error: 'Failed to retry transmission', details: safeErrDetails(err) });
  }
});

// POST /api/edi/transmissions/:id/reset - Reset ERROR transmission for immediate retry
app.post('/api/edi/transmissions/:id/reset', async (req, res) => {
  try {
    const transmissionId = parseInt(req.params.id);
    if (isNaN(transmissionId)) {
      return res.status(400).json({ error: 'Invalid transmission ID' });
    }

    // Reset retry_count to 0 and update timestamp for immediate processing
    await runUpdate(
      entiteDB,
      'UPDATE edi_transmissions SET retry_count = 0, status = ?, updated_at = CURRENT_TIMESTAMP, logs = ? WHERE id = ?',
      ['PENDING', `Reset for immediate retry at ${new Date().toISOString()}`, transmissionId]
    );
    
    console.log(`[EDI] Transmission #${transmissionId} reset for immediate retry`);
    res.json({ 
      success: true, 
      message: 'Transmission reset and queued for immediate retry (no delay)', 
      transmissionId 
    });
  } catch (err) {
    console.error('[EDI] Error resetting transmission:', err);
    res.status(500).json({ error: 'Failed to reset transmission', details: safeErrDetails(err) });
  }
});

// GET /api/edi/worker-logs - Get worker logs with filters
app.get('/api/edi/worker-logs', async (req, res) => {
  try {
    const { getWorkerLogs } = require('./edi_worker_logger');
    const { workerType, level, transmissionId, hours = 24, limit = 100 } = req.query;

    const logs = await getWorkerLogs(entiteDB, {
      workerType,
      level,
      transmissionId: transmissionId ? parseInt(transmissionId) : null,
      hours: parseInt(hours),
      limit: parseInt(limit)
    });

    res.json({
      count: logs.length,
      filters: { workerType, level, transmissionId, hours, limit },
      logs
    });
  } catch (err) {
    console.error('[EDI] Error fetching worker logs:', err);
    res.status(500).json({ error: 'Failed to fetch worker logs', details: safeErrDetails(err) });
  }
});

// GET /api/edi/worker-stats - Get worker statistics
app.get('/api/edi/worker-stats', async (req, res) => {
  try {
    const { getWorkerStats } = require('./edi_worker_logger');
    const { hours = 24 } = req.query;

    const stats = await getWorkerStats(entiteDB, parseInt(hours));

    res.json({
      period_hours: parseInt(hours),
      stats
    });
  } catch (err) {
    console.error('[EDI] Error fetching worker stats:', err);
    res.status(500).json({ error: 'Failed to fetch worker stats', details: safeErrDetails(err) });
  }
});

// Helper: parse EANCOM date string (YYYYMMDD or YYMMDD) to JS Date
function parseEancomDateStr(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (s.length === 8) {
    // YYYYMMDD
    return new Date(`${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}`);
  } else if (s.length === 6) {
    // YYMMDD - assume 20xx century
    return new Date(`20${s.substring(0,2)}-${s.substring(2,4)}-${s.substring(4,6)}`);
  }
  return null;
}

// POST /api/edi/receive - Receive incoming EDI messages from external systems
app.post('/api/edi/receive', async (req, res) => {
  try {
    const { eancomContent, filename, partnerGln, senderGln } = req.body;
    
    // Prioritize senderGln (from Hub) over partnerGln, or fall back to unknown
    const incomingGln = senderGln || partnerGln;

    if (!eancomContent) {
      return res.status(400).json({ error: 'Missing EANCOM content' });
    }

    console.log(`[EDI RECEIVE] Processing incoming message from ${incomingGln || 'unknown'}`);

    // Parse EANCOM message
    const { parseEANCOM, validateParsedEANCOM } = require('./eancom_parser');
    const parsedData = parseEANCOM(eancomContent);
    
    console.log(`[EDI RECEIVE] Message type: ${parsedData.messageType}, Document: ${parsedData.documentNumber}`);

    // Validate parsed data
    const validation = validateParsedEANCOM(parsedData);
    if (!validation.valid) {
      console.error(`[EDI RECEIVE] Validation failed:`, validation.errors);
      
      // Record failed transmission
      const transmissionId = await createEdiTransmission(entiteDB, {
        related_id: null,
        related_type: parsedData.messageType === 'ORDERS' ? 'ORDER' : 
                      parsedData.messageType === 'INVOIC' ? 'INVOICE' :
                      parsedData.messageType === 'ORDRSP' ? 'ORDER_RESPONSE' :
                      parsedData.messageType === 'ORDCHG' ? 'ORDER_CHANGE' :
                      parsedData.messageType === 'DESADV' ? 'DESPATCH_ADVICE' : 'UNKNOWN',
        document_type: parsedData.messageType || 'UNKNOWN',
        direction: 'INBOUND',
        partner_gln: incomingGln || parsedData.supplier.gln || parsedData.buyer.gln,
        filename: filename || `inbound_${parsedData.messageType}_${Date.now()}.txt`,
        file_content: eancomContent,
        status: 'ERROR',
        logs: `Validation failed: ${validation.errors.join(', ')}`,
        error_message: validation.errors.join('; ')
      });

      return res.status(400).json({ 
        error: 'Invalid EANCOM message', 
        details: validation.errors,
        transmissionId
      });
    }

    // Look up partner entity
    const partnerGlnToUse = incomingGln || parsedData.supplier.gln || parsedData.buyer.gln;
    let partnerId = null;
    
    if (partnerGlnToUse) {
      const partnerCheck = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [partnerGlnToUse]);
      if (partnerCheck.length > 0) {
        partnerId = partnerCheck[0].id_entite;
      }
    }

    // Save file to disk (use configurable EDI_ORDERS_PATH)
    const ediOrdersPath = configService.getEdiOrdersPath();
    const inboundDir = path.join(ediOrdersPath, 'received', parsedData.messageType || 'UNKNOWN');
    if (!fs.existsSync(inboundDir)) {
      fs.mkdirSync(inboundDir, { recursive: true });
    }
    
    const finalFilename = filename || `inbound_${parsedData.messageType}_${parsedData.documentNumber}_${Date.now()}.txt`;
    const filePath = path.join(inboundDir, finalFilename);
    const relativeFilePath = path.join('received', parsedData.messageType || 'UNKNOWN', finalFilename);
    
    try {
      await fs.promises.writeFile(filePath, eancomContent, 'utf8');
      console.log(`[EDI RECEIVE] Saved inbound file to ${filePath}`);
    } catch (writeErr) {
      console.error('[EDI RECEIVE] Failed to write file to disk:', writeErr);
      // Continue anyway, we have the content in DB
    }

    // Record incoming transmission
    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: null, // Will be updated after processing
      related_type: parsedData.messageType === 'ORDERS' ? 'ORDER' : 
                    parsedData.messageType === 'INVOIC' ? 'INVOICE' :
                    parsedData.messageType === 'ORDRSP' ? 'ORDER_RESPONSE' :
                    parsedData.messageType === 'ORDCHG' ? 'ORDER_CHANGE' :
                    parsedData.messageType === 'DESADV' ? 'DESPATCH_ADVICE' : 'UNKNOWN',
      document_type: parsedData.messageType || 'UNKNOWN',
      direction: 'INBOUND',
      partner_id: partnerId,
      partner_gln: partnerGlnToUse,
      filename: finalFilename,
      file_path: relativeFilePath,
      file_content: eancomContent,
      status: 'RECEIVED',
      transmission_date: new Date(),
      logs: `Message received and parsed successfully. Items: ${parsedData.items.length}, Total: ${parsedData.totals.totalAmount || 'N/A'}`
    });

    console.log(`[EDI RECEIVE] âœ… Transmission #${transmissionId} recorded as RECEIVED`);

    // --- PHASE 2: Staging ---
    // If message is an ORDER, insert into edi_orders immediately after parsing
    if (parsedData.messageType === 'ORDERS') {
      try {
        // Check for duplicate order (same document_number and supplier_gln)
        const existingOrder = await queryDB(entiteDB, 
          "SELECT id FROM edi_orders WHERE document_number = ? AND supplier_gln = ?", 
          [parsedData.documentNumber, parsedData.supplier.gln]
        );
        
        if (existingOrder.length > 0) {
          console.log(`[EDI RECEIVE] âš ï¸ Duplicate order detected: ${parsedData.documentNumber} already exists (ID: ${existingOrder[0].id}). Skipping insertion.`);
          // Update transmission status to indicate duplicate
          await updateEdiTransmissionStatus(entiteDB, transmissionId, 'DUPLICATE', `Order ${parsedData.documentNumber} already exists in edi_orders`);
          
          return res.json({ 
            success: true, 
            message: 'EDI message received but order already exists (duplicate)',
            transmissionId,
            duplicate: true,
            existingOrderId: existingOrder[0].id
          });
        }

        const stagingResult = await runUpdate(entiteDB, `
          INSERT INTO edi_orders (
            transmission_id, 
            document_number, 
            buyer_gln, 
            supplier_gln, 
            order_date, 
            delivery_date, 
            currency, 
            total_amount, 
            status, 
            raw_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          transmissionId,
          parsedData.documentNumber || null,
          parsedData.buyer.gln || null,
          parsedData.supplier.gln || null,
          parsedData.documentDate || null,
          parsedData.deliveryDateRequested || null,
          parsedData.currency || null,
          parsedData.totals.totalAmount || 0,
          'PENDING_VALIDATION',
          JSON.stringify(parsedData)
        ]);

        const stagingId = stagingResult.lastID;
        console.log(`[EDI RECEIVE] âœ… Order staged in edi_orders (ID: ${stagingId}) for document ${parsedData.documentNumber}`);
        
        // Link the Transmission to the Staging Order
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'RECEIVED', null, null, stagingId);

        // Notify Supplier (the receiver of the order) if local
        console.log(`[EDI RECEIVE] ðŸ“‹ Notification routing: buyer_gln=${parsedData.buyer.gln}, supplier_gln=${parsedData.supplier.gln}`);
        if (parsedData.supplier.gln) {
            const sellerRows = await queryDB(entiteDB, "SELECT id_entite, raison_socialle FROM Entite WHERE gln = ?", [parsedData.supplier.gln]);
            console.log(`[EDI RECEIVE] ðŸ” Supplier lookup for GLN ${parsedData.supplier.gln}:`, sellerRows);
            if (sellerRows.length > 0) {
                const sellerId = sellerRows[0].id_entite;
                const sellerName = sellerRows[0].raison_socialle;
                
                // Resolve Buyer Name from DB if not in parsed data
                let buyerName = parsedData.buyer.name;
                if (!buyerName || buyerName === 'Unknown Buyer') {
                   const buyerRows = await queryDB(entiteDB, "SELECT raison_socialle FROM Entite WHERE gln = ?", [parsedData.buyer.gln]);
                   if (buyerRows.length > 0) {
                     buyerName = buyerRows[0].raison_socialle;
                   } else {
                     buyerName = 'Unknown Buyer';
                   }
                }

                const accounts = await queryDB(entiteDB, "SELECT id_compte, id_entite FROM comptes WHERE id_entite = ? AND is_suspended = 0", [sellerId]);
                console.log(`[EDI RECEIVE] ðŸ”” Sending 'order received' notification to ${accounts.length} account(s) of SUPPLIER entity #${sellerId} (${sellerName}), from buyer: ${buyerName}`);
                for (const acc of accounts) {
                    console.log(`[EDI RECEIVE]   â†’ Notifying account #${acc.id_compte} (entity #${acc.id_entite})`);
                    await notifyOrderReceived(entiteDB, acc.id_compte, parsedData.documentNumber, buyerName);
                }
                // Emit order:new globally so supplier frontend reloads order list immediately
                if (global.io) {
                    global.io.emit('order:new', {
                        sellerId: sellerId,
                        buyerName: buyerName,
                        numCommande: parsedData.documentNumber,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`[EDI RECEIVE] ðŸ“¡ WebSocket order:new emitted globally for supplier entity #${sellerId}`);
                }
            } else {
                console.log(`[EDI RECEIVE] âš ï¸ Supplier entity not found for GLN ${parsedData.supplier.gln}, no notification sent`);
            }
        } else {
            console.log(`[EDI RECEIVE] âš ï¸ No supplier GLN in parsed data, no notification sent`);
        }

      } catch (stageErr) {
        console.error(`[EDI RECEIVE] âš ï¸ Failed to stage order: ${stageErr.message}`);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'ERROR', `Staging Error: ${stageErr.message}`);
      }
    }

    /* PHASE 3 DEFERRAL - Orders now stop at edi_orders
    // PROCESS ORDERS: Insert into orders/order_lines tables
    // =================================================================
    let newOrderId = null;
    if (parsedData.messageType === 'ORDERS') {
       // ... (Original logic commented out to simulate distributed system where orders aren't auto-inserted)
       console.log('[EDI RECEIVE] ORDERS message staged. Production insertion deferred to validation phase.');
       
       // Notify Supplier (The User) via WebSocket if possible, or just rely on polling
        if (parsedData.supplier.gln) {
            const sellerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [parsedData.supplier.gln]);
            if (sellerRows.length > 0) {
                const sellerId = sellerRows[0].id_entite;
                const buyerName = parsedData.buyer.name || 'Unknown Buyer';
                const accounts = await queryDB(entiteDB, "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", [sellerId]);
                for (const acc of accounts) {
                    await notifyOrderReceived(entiteDB, acc.id_compte, parsedData.documentNumber, buyerName);
                }
            }
        }
    }
    */


    // PROCESS ORDRSP
    if (parsedData.messageType === 'ORDRSP') {
      try {
        console.log('[EDI RECEIVE] Processing ORDRSP message...');
        
        // Update transmission status
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PROCESSED', 'ORDRSP received and processed');

        // Notify Buyer if local
        if (parsedData.buyer.gln) {
            const buyerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [parsedData.buyer.gln]);
            if (buyerRows.length > 0) {
                const buyerId = buyerRows[0].id_entite;
                
                // Resolve Supplier Name
                let supplierName = parsedData.supplier.name;
                if (!supplierName || supplierName === 'Unknown Supplier') {
                   const supplierRows = await queryDB(entiteDB, "SELECT raison_socialle FROM Entite WHERE gln = ?", [parsedData.supplier.gln]);
                   if (supplierRows.length > 0) {
                     supplierName = supplierRows[0].raison_socialle;
                   } else {
                     supplierName = 'Unknown Supplier';
                   }
                }

                // Use orderReference if available (since ORDRSP is about an order), otherwise documentNumber
                const orderRef = parsedData.orderReference || parsedData.documentNumber;

                // -------------------------------------------------------------
                // UPDATE BUYER ORDER STATUS & COMMENT IN DATABASE
                // -------------------------------------------------------------
                const targetOrder = await queryOne(entiteDB, "SELECT id_order FROM orders WHERE num_commande = ? AND id_entite_buyer = ?", [orderRef, buyerId]);
                
                if (targetOrder) {
                   // Map EANCOM response code to internal status
                   let newStatus = 'received'; // default
                   if (parsedData.responseCode === '29') newStatus = 'accepted';
                   else if (parsedData.responseCode === '27') newStatus = 'rejected';
                   else if (parsedData.responseCode === '4') newStatus = 'modified';
                   
                   let dateLivraisonConfirmee = null;
                   if (parsedData.deliveryDateConfirmed) {
                     dateLivraisonConfirmee = parseEancomDateStr(parsedData.deliveryDateConfirmed);
                   } else if (parsedData.deliveryDateRequested) {
                     dateLivraisonConfirmee = parseEancomDateStr(parsedData.deliveryDateRequested);
                   }

                   // Update the order header
                   if (dateLivraisonConfirmee) {
                     await runUpdate(entiteDB, "UPDATE orders SET status = ?, comment = ?, date_livraison_confirmee = ?, updated_at = NOW() WHERE id_order = ?", [newStatus, parsedData.comment || null, dateLivraisonConfirmee, targetOrder.id_order]);
                   } else {
                     await runUpdate(entiteDB, "UPDATE orders SET status = ?, comment = ?, updated_at = NOW() WHERE id_order = ?", [newStatus, parsedData.comment || null, targetOrder.id_order]);
                   }
                   console.log(`[EDI RECEIVE] âœ… Updated buyer order ${orderRef} to status: ${newStatus} with date ${dateLivraisonConfirmee}`);

                   // Update the order lines with confirmed quantities and prices
                   if (parsedData.items && parsedData.items.length > 0) {
                      for (const item of parsedData.items) {
                         if (item.gtin) {
                            await runUpdate(entiteDB, 
                               "UPDATE order_lines SET confirmed_qty = ?, confirmed_price = ?, line_comment = ? WHERE id_order = ? AND gtin = ?", 
                               [item.qtyConfirmed !== undefined ? item.qtyConfirmed : item.qty, item.priceConfirmed !== undefined ? item.priceConfirmed : item.price, item.comment || null, targetOrder.id_order, item.gtin]
                            );
                         }
                      }
                   }
                   
                   // Emit WebSocket update for live UI refresh
                   if (global.io) {
                     const eventData = {
                       orderId: targetOrder.id_order,
                       status: newStatus,
                       comment: parsedData.comment || null,
                       timestamp: new Date().toISOString(),
                       buyerId: buyerId,
                       numCommande: orderRef,
                       fournisseurName: supplierName
                     };
                     global.io.emit('order:status:updated', eventData);
                     console.log(`[EDI RECEIVE] ðŸ“¡ WebSocket event emitted for ORDRSP update (buyer:${buyerId})`);
                   }
                } else {
                   console.log(`[EDI RECEIVE] âš ï¸ Buyer order ${orderRef} not found in database to update.`);
                }
                // -------------------------------------------------------------

                const accounts = await queryDB(entiteDB, "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", [buyerId]);
                for (const acc of accounts) {
                    await notifyOrderResponseReceived(entiteDB, acc.id_compte, orderRef, supplierName);
                }
                console.log(`[EDI RECEIVE] ðŸ”” Notified buyer ${buyerId} of ORDRSP for order ${orderRef} from ${supplierName}`);
            }
        }

      } catch (err) {
        console.error('[EDI RECEIVE] Error processing ORDRSP:', err);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'ERROR', `Processing Error: ${err.message}`);
      }
    }

    // PROCESS ORDCHG (Purchase Order Change)
    if (parsedData.messageType === 'ORDCHG') {
      try {
        console.log('[EDI RECEIVE] Processing ORDCHG message...');
        
        // Update transmission status
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PROCESSED', 'ORDCHG received and processed');

        // Supplier is the one receiving the ORDCHG
        if (parsedData.supplier.gln) {
            const supplierRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [parsedData.supplier.gln]);
            if (supplierRows.length > 0) {
                const sellerIds = supplierRows.map(row => row.id_entite);
                
                // Use orderReference if available, otherwise documentNumber
                const orderRef = parsedData.orderReference || parsedData.documentNumber;

                // UPDATE SUPPLIER ORDER STATUS
                // We search for the order belonging to ANY of the entities sharing this GLN
                const placeholders = sellerIds.map(() => '?').join(',');
                const targetOrder = await queryOne(entiteDB, 
                    `SELECT id_order, id_entite_seller FROM orders WHERE num_commande = ? AND id_entite_seller IN (${placeholders})`, 
                    [orderRef, ...sellerIds]
                );
                
                if (targetOrder) {
                   const sellerId = targetOrder.id_entite_seller;
                   const newStatus = 'accepted'; // Buyer accepted modifications
                   const commentMsg = parsedData.comment ? `Modifications acceptÃ©es : ${parsedData.comment}` : "Modifications acceptÃ©es par l'acheteur via ORDCHG";

                   await runUpdate(entiteDB, "UPDATE orders SET status = ?, comment = ?, updated_at = NOW() WHERE id_order = ?", [newStatus, commentMsg, targetOrder.id_order]);
                   console.log(`[EDI RECEIVE] âœ… Updated supplier order ${orderRef} to status: ${newStatus} via ORDCHG`);

                   // Update the order lines with confirmed quantities and prices from ORDCHG if provided
                   if (parsedData.items && parsedData.items.length > 0) {
                      for (const item of parsedData.items) {
                         if (item.gtin) {
                            await runUpdate(entiteDB, 
                               "UPDATE order_lines SET confirmed_qty = ?, confirmed_price = ? WHERE id_order = ? AND gtin = ?", 
                               [item.qtyConfirmed !== undefined ? item.qtyConfirmed : item.qty, item.priceConfirmed !== undefined ? item.priceConfirmed : item.price, targetOrder.id_order, item.gtin]
                            );
                         }
                      }
                   }
                   
                   // Emit WebSocket update for live UI refresh
                   if (global.io) {
                     const eventData = {
                       orderId: targetOrder.id_order,
                       status: newStatus,
                       comment: commentMsg,
                       timestamp: new Date().toISOString(),
                       sellerId: sellerId,
                       numCommande: orderRef
                     };
                     global.io.emit('order:status:updated', eventData);
                     console.log(`[EDI RECEIVE] ðŸ“¡ WebSocket event emitted for ORDCHG update (seller:${sellerId})`);
                   }

                    // Notify via accounts if needed
                    try {
                        const accounts = await queryDB(entiteDB, "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", [sellerId]);
                        for (const acc of accounts) {
                            const notifContent = `La modification de la commande ${orderRef} a Ã©tÃ© acceptÃ©e par l'acheteur.`;
                            await runUpdate(entiteDB, "INSERT INTO notifications (id_compte, contenu, type, created_at, `read`) VALUES (?, ?, 'success', NOW(), 0)", [acc.id_compte, notifContent]);
                        }
                        console.log(`[EDI RECEIVE] ðŸ”” Notified ${accounts.length} accounts for order ${orderRef}`);
                    } catch (notifErr) {
                        console.error('[EDI RECEIVE] âš ï¸ Failed to send notifications:', notifErr.message);
                    }

                } else {
                   console.log(`[EDI RECEIVE] âš ï¸ Supplier order ${orderRef} not found in database to update.`);
                }
            }
        }

      } catch (err) {
        console.error('[EDI RECEIVE] Error processing ORDCHG:', err);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'ERROR', `Processing Error: ${err.message}`);
      }
    }

    // PROCESS DESADV
    if (parsedData.messageType === 'DESADV') {
      try {
        console.log('[EDI RECEIVE] Processing DESADV message...');
        const desadvInsertSql = `
          INSERT INTO edi_desadv (
            desadv_number, original_order_number, 
            buyer_gln, seller_gln, delivery_gln, 
            shipping_date, delivery_date, 
            direction, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INBOUND', 'RECEIVED', NOW())
        `;
        
        const desadvParams = [
          parsedData.documentNumber || null, parsedData.orderReference || null,
          parsedData.buyer.gln || null, parsedData.supplier.gln || null, (parsedData.deliveryParty && parsedData.deliveryParty.gln) || null,
          parseEancomDateStr(parsedData.documentDate),
          parseEancomDateStr(parsedData.deliveryDateRequested)
        ];

        const desadvResult = await runUpdate(entiteDB, desadvInsertSql, desadvParams);
        const desadvId = desadvResult.lastID;

        // Insert Packages (with weight, batch, SSCC)
        if (parsedData.packages && parsedData.packages.length > 0) {
           for (const pkg of parsedData.packages) {
               const pkgResult = await runUpdate(entiteDB, 
                 `INSERT INTO edi_packages (id_desadv, sscc, package_type, weight) VALUES (?, ?, ?, ?)`, 
                 [desadvId, pkg.sscc || null, pkg.type || null, pkg.weight || null]);
               const pkgId = pkgResult.lastID;

               // Insert items within this package
               if (pkg.items && pkg.items.length > 0) {
                 for (const item of pkg.items) {
                   await runUpdate(entiteDB, `
                     INSERT INTO edi_desadv_lines (
                       id_desadv, id_package, line_number, gtin,
                       qty_dispatched, qty_ordered,
                       libelle, batch_number, expiry_date
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                     [
                       desadvId, pkgId, item.lineNumber || null, item.gtin || null,
                       item.qtyDispatched || item.qty || null, item.qtyOrdered || null,
                       item.description || null, item.batchNumber || null,
                       item.expiryDate ? parseEancomDateStr(item.expiryDate) : null
                     ]
                   );
                 }
               }
           }
        }

        // Insert top-level Lines (items not inside packages)
        if (parsedData.items && parsedData.items.length > 0) {
            for (const item of parsedData.items) {
                await runUpdate(entiteDB, `
                    INSERT INTO edi_desadv_lines (
                        id_desadv, line_number, gtin, 
                        qty_dispatched, qty_ordered, 
                        libelle, batch_number, expiry_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        desadvId, item.lineNumber || null, item.gtin || null,
                        item.qtyDispatched || item.qty || null, item.qtyOrdered || null,
                        item.description || null, item.batchNumber || null,
                        item.expiryDate ? parseEancomDateStr(item.expiryDate) : null
                    ]
                );
            }
        }
        console.log(`[EDI RECEIVE] Processed DESADV #${desadvId}`);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PROCESSED', null, null, desadvId);
        
        // Notify
        if (partnerId) {
             const accounts = await queryDB(entiteDB, "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", [partnerId]);
             for (const acc of accounts) {
                // Reuse order notification or create new one
                // await notifyDesadvReceived...
             }
        }

      } catch (err) {
        console.error('[EDI RECEIVE] Error processing DESADV:', err);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'ERROR', `DB Error: ${err.message}`);
      }
    }
    
    // PROCESS INVOIC
    else if (parsedData.messageType === 'INVOIC') {
      try {
        console.log('[EDI RECEIVE] Processing INVOIC message...');
        const invoicInsertSql = `
          INSERT INTO edi_invoic (
            invoic_number, type_code, date_facture, 
            buyer_gln, seller_gln, 
            order_reference, desadv_reference, 
            currency, total_ht, total_tax, total_ttc,
            direction, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INBOUND', 'RECEIVED', NOW())
        `;
        
        const invoicParams = [
            parsedData.documentNumber || null, '380',
            parseEancomDateStr(parsedData.documentDate),
            parsedData.buyer.gln || null, parsedData.supplier.gln || null,
            parsedData.orderReference || null, parsedData.desadvReference || null,
            parsedData.currency || null,
            parsedData.totals.lineAmount || null, parsedData.totals.taxAmount || null, parsedData.totals.totalAmount || null
        ];

        const invoicResult = await runUpdate(entiteDB, invoicInsertSql, invoicParams);
        const invoicId = invoicResult.lastID;

        // Insert Lines
        if (parsedData.items && parsedData.items.length > 0) {
            for (const item of parsedData.items) {
                await runUpdate(entiteDB, `
                    INSERT INTO edi_invoic_lines (
                        id_invoic, line_number, gtin, 
                        description, quantity, unit_price, 
                        tax_rate, line_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        invoicId, item.lineNumber || null, item.gtin || null,
                        item.description || null, item.qtyInvoiced || item.qty || null, item.price || null,
                        item.taxRate || null, item.lineAmount || null
                    ]
                );
            }
        }
        console.log(`[EDI RECEIVE] Processed INVOIC #${invoicId}`);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PROCESSED', null, null, invoicId);

        // Notify buyer accounts about received invoice
        try {
          const buyerGln = parsedData.buyer?.gln;
          const sellerGln = parsedData.supplier?.gln;
          const invoiceNumber = parsedData.documentNumber || 'N/A';
          let supplierName = sellerGln || 'Fournisseur';
          
          if (sellerGln) {
            const sellerRows = await queryDB(entiteDB, "SELECT raison_socialle FROM Entite WHERE gln = ?", [sellerGln]);
            if (sellerRows.length > 0) supplierName = sellerRows[0].raison_socialle;
          }

          if (buyerGln) {
            const buyerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [buyerGln]);
            if (buyerRows.length > 0) {
              const buyerId = buyerRows[0].id_entite;
              const accounts = await queryDB(entiteDB, "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", [buyerId]);
              for (const acc of accounts) {
                await notifyInvoiceReceived(entiteDB, acc.id_compte, invoiceNumber, supplierName);
              }
              console.log(`[EDI RECEIVE] ðŸ”” Notified ${accounts.length} buyer accounts for INVOIC ${invoiceNumber} from ${supplierName}`);
            }
          }
        } catch (notifErr) {
          console.warn('[EDI RECEIVE] Invoice notification error (non-fatal):', notifErr.message);
        }

      } catch (err) {
        console.error('[EDI RECEIVE] Error processing INVOIC:', err);
        await updateEdiTransmissionStatus(entiteDB, transmissionId, 'ERROR', `DB Error: ${err.message}`);
      }
    }

    // Send response after all processing is complete
    res.json({ 
      success: true, 
      message: 'EDI message received and processed',
      transmissionId,
      messageType: parsedData.messageType,
      documentNumber: parsedData.documentNumber
    });

  } catch (err) {
    console.error('[EDI RECEIVE] Error processing incoming message:', err);
    res.status(500).json({ error: 'Failed to process EDI message', details: safeErrDetails(err) });
  }
});

// ============================================================================
// GS1 UTILITIES: SSCC Generation, Labeling (Etiquetage), Marking (Marquage)
// ============================================================================

// Helper: Calculate GS1 check digit (Modulo 10 / Luhn-like for GS1)
function gs1CheckDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = parseInt(digits[i], 10);
    // Positions are 1-indexed from right; even positions (from right) get x1, odd get x3
    // For GS1: starting from right, alternate multipliers 3,1,3,1...
    sum += d * ((digits.length - i) % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

// GET /api/utils/sscc - Generate SSCC-18 per GS1 standard
// SSCC = Extension Digit (1) + GS1 Company Prefix (7-10) + Serial Ref (remaining) + Check Digit (1)
// Total = 18 digits
app.get('/api/utils/sscc', async (req, res) => {
  try {
    const prefix = req.query.prefix || '00000000'; // GS1 company prefix (7-10 digits)
    const extensionDigit = req.query.ext || '0';    // Extension digit (0-9)

    // Serial reference: fill remaining digits with timestamp + random
    const prefixClean = String(prefix).replace(/\D/g, '').substring(0, 10);
    const serialLength = 16 - prefixClean.length; // 18 - 1(ext) - prefix - 1(check)
    const timestamp = String(Date.now()).slice(-serialLength);
    const serial = timestamp.padStart(serialLength, '0');

    const withoutCheck = `${extensionDigit}${prefixClean}${serial}`;
    const checkDigit = gs1CheckDigit(withoutCheck);
    const sscc = `${withoutCheck}${checkDigit}`;

    res.json({
      sscc,
      formatted: `(00) ${sscc}`,
      ai: '00',
      extensionDigit,
      companyPrefix: prefixClean,
      serialReference: serial,
      checkDigit: String(checkDigit)
    });
  } catch (err) {
    console.error('[SSCC] Error generating SSCC:', err);
    res.status(500).json({ error: 'Failed to generate SSCC', details: safeErrDetails(err) });
  }
});

// â”€â”€ GS1 check digit helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Recomputes and replaces the last digit so the string satisfies GS1 Mod-10
function computeGS1CheckDigit(digits) {
  const s = String(digits);
  const payload = s.slice(0, s.length - 1); // all digits except the last
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    const d = parseInt(payload[payload.length - 1 - i], 10);
    sum += (i % 2 === 0) ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return payload + String(check);
}

// Pad to target length then fix check digit (for GTIN-14 and SSCC-18)
function fixGS1(value, targetLen) {
  const padded = String(value).replace(/\D/g, '').padStart(targetLen, '0');
  return computeGS1CheckDigit(padded);
}

// POST /api/edi/label/generate - Generate GS1-128 logistics label data (Etiquetage)
// Returns structured data for printing a GS1 logistics label per GS1 General Specifications
app.post('/api/edi/label/generate', async (req, res) => {
  try {
    const { sscc, packageData, shipmentData, items } = req.body;

    if (!sscc) {
      return res.status(400).json({ error: 'SSCC is required' });
    }

    // GS1 Application Identifiers for the label
    const barcodes = [];

    // AI (00) - SSCC (18 digits, valid check digit)
    const ssccFixed = fixGS1(sscc, 18);
    barcodes.push({ ai: '00', value: ssccFixed, hrp: `(00) ${ssccFixed}` });

    // AI (02) + (37) - GTIN of contained items + count (if homogeneous package)
    if (items && items.length === 1) {
      const gtin = fixGS1(items[0].gtin, 14);
      barcodes.push({ ai: '02', value: gtin, hrp: `(02) ${gtin}` });
      barcodes.push({ ai: '37', value: String(items[0].quantity), hrp: `(37) ${items[0].quantity}` });
    }

    // AI (10) - Batch/Lot Number
    if (items && items.length > 0 && items[0].batchNumber) {
      barcodes.push({ ai: '10', value: items[0].batchNumber, hrp: `(10) ${items[0].batchNumber}` });
    }

    // AI (17) - Expiry Date (YYMMDD)
    if (items && items.length > 0 && items[0].expiryDate) {
      const exp = new Date(items[0].expiryDate);
      const yymmdd = `${String(exp.getFullYear()).slice(-2)}${String(exp.getMonth()+1).padStart(2,'0')}${String(exp.getDate()).padStart(2,'0')}`;
      barcodes.push({ ai: '17', value: yymmdd, hrp: `(17) ${yymmdd}` });
    }

    // AI (3302) - Net weight in kg (6 digits, 2 decimal places)
    if (packageData && packageData.weight) {
      const weightVal = String(Math.round(packageData.weight * 100)).padStart(6, '0');
      barcodes.push({ ai: '3302', value: weightVal, hrp: `(3302) ${weightVal}` });
    }

    // Build GS1-128 barcode string (concatenated AIs with FNC1 separator)
    const gs1128String = barcodes.map(b => `(${b.ai})${b.value}`).join('');

    // Barcode URL for rendering (using bwipjs API)
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=gs1-128&text=${encodeURIComponent(gs1128String)}&scale=3&height=30&includetext&textxalign=center`;

    const label = {
      sscc,
      ssccFormatted: `(00) ${sscc}`,
      sender: shipmentData?.sender || {},
      receiver: shipmentData?.receiver || {},
      carrier: shipmentData?.carrier || null,
      dateExpedition: shipmentData?.dateExpedition || null,
      packageType: packageData?.type === 'PX' ? 'PALETTE' : 'CARTON',
      grossWeight: packageData?.weight || 0,
      items: items || [],
      barcodes,
      gs1128String,
      barcodeUrl,
      labelFormat: 'GS1_LOGISTICS_LABEL',
      standard: 'GS1 General Specifications v23'
    };

    res.json({ success: true, label });
  } catch (err) {
    console.error('[LABEL] Error generating label:', err);
    res.status(500).json({ error: 'Failed to generate label', details: safeErrDetails(err) });
  }
});

// POST /api/edi/marking/generate - Generate product marking data (Marquage)
// Returns GS1 DataMatrix / GS1-128 data for unit-level product marking
// Per GS1 General Specifications: GTIN + Batch + Expiry + Serial (if serialized)
app.post('/api/edi/marking/generate', async (req, res) => {
  try {
    const { gtin, batchNumber, expiryDate, serialNumber, netWeight, netContent, productionDate } = req.body;

    if (!gtin) {
      return res.status(400).json({ error: 'GTIN is required' });
    }

    const gtinPadded = fixGS1(gtin, 14);
    const elements = [];

    // AI (01) - GTIN
    elements.push({ ai: '01', value: gtinPadded, hrp: `(01) ${gtinPadded}` });

    // AI (10) - Batch/Lot Number (up to 20 alphanumeric)
    if (batchNumber) {
      elements.push({ ai: '10', value: String(batchNumber).substring(0, 20), hrp: `(10) ${batchNumber}` });
    }

    // AI (17) - Expiry Date (YYMMDD)
    if (expiryDate) {
      const exp = new Date(expiryDate);
      const yymmdd = `${String(exp.getFullYear()).slice(-2)}${String(exp.getMonth()+1).padStart(2,'0')}${String(exp.getDate()).padStart(2,'0')}`;
      elements.push({ ai: '17', value: yymmdd, hrp: `(17) ${yymmdd}` });
    }

    // AI (11) - Production Date (YYMMDD)
    if (productionDate) {
      const pd = new Date(productionDate);
      const yymmdd = `${String(pd.getFullYear()).slice(-2)}${String(pd.getMonth()+1).padStart(2,'0')}${String(pd.getDate()).padStart(2,'0')}`;
      elements.push({ ai: '11', value: yymmdd, hrp: `(11) ${yymmdd}` });
    }

    // AI (21) - Serial Number (for unit-level traceability)
    if (serialNumber) {
      elements.push({ ai: '21', value: String(serialNumber).substring(0, 20), hrp: `(21) ${serialNumber}` });
    }

    // AI (3103) - Net weight in grams
    if (netWeight) {
      const weightGrams = String(Math.round(netWeight * 1000)).padStart(6, '0');
      elements.push({ ai: '3103', value: weightGrams, hrp: `(3103) ${weightGrams}` });
    }

    // AI (3302) - Net weight in kg
    if (netContent && !netWeight) {
      const weightKg = String(Math.round(netContent * 100)).padStart(6, '0');
      elements.push({ ai: '3302', value: weightKg, hrp: `(3302) ${weightKg}` });
    }

    // Build GS1 element string
    const gs1String = elements.map(e => `(${e.ai})${e.value}`).join('');

    // Barcode URLs
    const gs1128Url = `https://bwipjs-api.metafloor.com/?bcid=gs1-128&text=${encodeURIComponent(gs1String)}&scale=3&height=25&includetext&textxalign=center`;
    const dataMatrixUrl = `https://bwipjs-api.metafloor.com/?bcid=gs1datamatrix&text=${encodeURIComponent(gs1String)}&scale=5&includetext`;

    const marking = {
      gtin: gtinPadded,
      batchNumber: batchNumber || null,
      expiryDate: expiryDate || null,
      serialNumber: serialNumber || null,
      elements,
      gs1String,
      gs1128BarcodeUrl: gs1128Url,
      dataMatrixUrl,
      markingFormat: 'GS1_PRODUCT_MARKING',
      standard: 'GS1 General Specifications v23'
    };

    res.json({ success: true, marking });
  } catch (err) {
    console.error('[MARKING] Error generating marking:', err);
    res.status(500).json({ error: 'Failed to generate marking', details: safeErrDetails(err) });
  }
});

// GET /api/edi/desadv - List DESADV records
app.get('/api/edi/desadv', async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const direction = req.query.direction || null;
    let sql = 'SELECT * FROM edi_desadv';
    const params = [];
    if (direction) {
      sql += ' WHERE direction = ?';
      params.push(direction);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const rows = await queryDB(entiteDB, sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DESADV LIST] Error:', err);
    res.status(500).json({ error: 'Failed to list DESADV', details: safeErrDetails(err) });
  }
});

// GET /api/edi/desadv/:id/packages - Get packages for a DESADV
app.get('/api/edi/desadv/:id/packages', async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, 'SELECT * FROM edi_packages WHERE id_desadv = ? ORDER BY id', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DESADV PACKAGES] Error:', err);
    res.status(500).json({ error: 'Failed to get packages', details: safeErrDetails(err) });
  }
});

// GET /api/edi/desadv/:id/lines - Get lines for a DESADV
app.get('/api/edi/desadv/:id/lines', async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, 'SELECT * FROM edi_desadv_lines WHERE id_desadv = ? ORDER BY line_number, id', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[DESADV LINES] Error:', err);
    res.status(500).json({ error: 'Failed to get lines', details: safeErrDetails(err) });
  }
});

// POST /api/edi/desadv/send - Generate and Send DESADV
app.post('/api/edi/desadv/send', async (req, res) => {
  try {
    const data = req.body;
    
    // Basic validation
    if (!data.desadvNumber || !data.buyer || !data.seller) {
      return res.status(400).json({ error: 'Missing required DESADV data' });
    }

    console.log(`[EDI SEND] Generating DESADV ${data.desadvNumber}`);

    // 1. Generate EANCOM content
    const eancomContent = generateDesadvEANCOM(data);
    
    // 2. Save to file using configurable EDI_ORDERS_PATH
    const ediOrdersPath = configService.getEdiOrdersPath();
    const outboundDir = path.join(ediOrdersPath, 'desadv', data.seller.gln);
    await fs.promises.mkdir(outboundDir, { recursive: true });
    const filename = `DESADV_${data.desadvNumber}_${Date.now()}.txt`;
    const filePath = path.join(outboundDir, filename);
    await fs.promises.writeFile(filePath, eancomContent, 'utf8');

    // 3. Resolve Partner ID (Buyer)
    let partnerId = null;
    if (data.buyer.gln) {
      const partnerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [data.buyer.gln]);
      if (partnerRows.length > 0) partnerId = partnerRows[0].id_entite;
    }

    // 4. Record Transmission (PENDING - will be sent async)
    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: null,
      related_type: 'DESPATCH_ADVICE',
      document_type: 'DESADV',
      direction: 'OUTBOUND',
      partner_id: partnerId,
      partner_gln: data.buyer.gln,
      sender_gln: data.seller.gln,
      filename: filename,
      file_path: filePath,
      file_content: eancomContent,
      status: 'PENDING',
      logs: `Generated DESADV ${data.desadvNumber}`
    });

    // 5. Insert into DB (edi_desadv)
    const desadvInsertSql = `
      INSERT INTO edi_desadv (
        desadv_number, original_order_number, id_order,
        buyer_gln, seller_gln, delivery_gln, 
        shipping_date, delivery_date, 
        total_packages, total_weight,
        direction, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OUTBOUND', 'SENT', NOW())
    `;
    
    // Calculate totals
    const totalPackages = data.packages ? data.packages.length : 0;
    const totalWeight = data.packages ? data.packages.reduce((acc, p) => acc + (p.weight || 0), 0) : 0;

    const desadvParams = [
      data.desadvNumber || null, data.orderNumber || null, data.orderId || null,
      data.buyer.gln || null, data.seller.gln || null, (data.delivery && data.delivery.gln) || null,
      data.dateExpedition ? new Date(data.dateExpedition) : null,
      data.dateDelivery ? new Date(data.dateDelivery) : null,
      totalPackages, totalWeight
    ];

    const desadvResult = await runUpdate(entiteDB, desadvInsertSql, desadvParams);
    const desadvId = desadvResult.lastID;

    // 5b. Insert Packages and their items
    const packageIdMap = {}; // sscc -> db id
    if (data.packages && data.packages.length > 0) {
       for (const pkg of data.packages) {
           const pkgResult = await runUpdate(entiteDB, `INSERT INTO edi_packages (id_desadv, sscc, package_type, weight, tracking_number) VALUES (?, ?, ?, ?, ?)`, 
           [desadvId, pkg.sscc || null, pkg.type || null, pkg.weight || null, pkg.trackingNumber || null]);
           const pkgId = pkgResult.lastID;
           if (pkg.sscc) packageIdMap[pkg.sscc] = pkgId;

           // Insert items within this package
           if (pkg.items && pkg.items.length > 0) {
             for (const item of pkg.items) {
               await runUpdate(entiteDB, `
                 INSERT INTO edi_desadv_lines (
                   id_desadv, id_package, id_order_line, line_number, gtin,
                   qty_dispatched, qty_ordered,
                   libelle, batch_number, expiry_date
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                 [
                   desadvId, pkgId, item.orderLineId || null, item.lineNumber || null, item.gtin || null,
                   item.quantity || null, item.orderedQuantity || null,
                   item.description || null, item.batchNumber || null, item.expiryDate ? new Date(item.expiryDate) : null
                 ]
               );
             }
           }
       }
    }

    // 5c. Insert top-level lines (items not inside packages)
    if (data.items && data.items.length > 0) {
        for (const item of data.items) {
            await runUpdate(entiteDB, `
                INSERT INTO edi_desadv_lines (
                    id_desadv, id_order_line, line_number, gtin, 
                    qty_dispatched, qty_ordered, 
                    libelle, batch_number, expiry_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    desadvId, item.orderLineId || null, item.lineNumber || null, item.gtin || null,
                    item.quantity || null, item.orderedQuantity || null,
                    item.description || null, item.batchNumber || null, item.expiryDate ? new Date(item.expiryDate) : null
                ]
            );
        }
    }

    // Update transmission with related ID
    await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PENDING', null, null, desadvId);

    // 6. Send to EDI Server (Async) - Use dynamic routing
    const ediTarget = await configService.getEdiTargetUrl(entiteDB, data.buyer.gln);
    const ediServerUrl = ediTarget.url;
    
    console.log(`[DESADV SEND] ðŸŽ¯ EDI Routing: ${data.buyer.gln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);
    
    setImmediate(async () => {
      try {
        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: eancomContent,
          filename: filename,
          partnerGln: data.buyer.gln,
          senderGln: data.seller.gln
        }, {
          headers: serviceAuthHeaders(),
          timeout: 30000
        });

        console.log(`[DESADV SEND] âœ… Sent to EDI server. Response:`, ediResponse.data);
        
        await updateEdiTransmissionStatus(
          entiteDB, 
          transmissionId, 
          'SENT',
          `Successfully sent to EDI server at ${new Date().toISOString()}`,
          null
        );
      } catch (ediErr) {
        console.error(`[DESADV SEND] âŒ Failed to send to EDI server:`, ediErr.message);
        
        await updateEdiTransmissionStatus(
          entiteDB,
          transmissionId,
          'ERROR',
          `Failed to send to EDI server at ${new Date().toISOString()}`,
          ediErr.message
        );
        
        await incrementRetryCount(entiteDB, transmissionId);
      }
    });

    // 7. Return response
    res.json({
      success: true,
      message: 'DESADV generated and queued for sending',
      transmissionId,
      desadvId,
      content: eancomContent
    });

  } catch (err) {
    console.error('[EDI SEND] Error generating DESADV:', err);
    res.status(500).json({ error: 'Failed to generate DESADV', details: safeErrDetails(err) });
  }
});

// POST /api/edi/invoic/send - Generate and Send INVOIC
app.post('/api/edi/invoic/send', async (req, res) => {
  try {
    const data = req.body;
    
    // Basic validation
    if (!data.invoiceNumber || !data.buyer || !data.seller) {
      return res.status(400).json({ error: 'Missing required INVOIC data' });
    }

    console.log(`[EDI SEND] Generating INVOIC ${data.invoiceNumber}`);

    // 1. Generate EANCOM content
    const eancomContent = generateInvoicEANCOM(data);
    
    // 2. Save to file using configurable EDI_ORDERS_PATH
    const ediOrdersPath = configService.getEdiOrdersPath();
    const outboundDir = path.join(ediOrdersPath, 'invoices', data.seller.gln);
    await fs.promises.mkdir(outboundDir, { recursive: true });
    const filename = `INVOIC_${data.invoiceNumber}_${Date.now()}.txt`;
    const filePath = path.join(outboundDir, filename);
    await fs.promises.writeFile(filePath, eancomContent, 'utf8');

    // 3. Resolve Partner ID (Buyer)
    let partnerId = null;
    if (data.buyer.gln) {
      const partnerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [data.buyer.gln]);
      if (partnerRows.length > 0) partnerId = partnerRows[0].id_entite;
    }

    // 4. Record Transmission (PENDING - will be sent async)
    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: null,
      related_type: 'INVOICE',
      document_type: 'INVOIC',
      direction: 'OUTBOUND',
      partner_id: partnerId,
      partner_gln: data.buyer.gln,
      sender_gln: data.seller.gln,
      filename: filename,
      file_path: filePath,
      file_content: eancomContent,
      status: 'PENDING',
      logs: `Generated INVOIC ${data.invoiceNumber}`
    });

    // 5. Insert into DB (edi_invoic)
    const invoicInsertSql = `
      INSERT INTO edi_invoic (
        invoic_number, type_code, date_facture, date_echeance,
        buyer_gln, seller_gln, 
        order_reference, desadv_reference, id_order,
        currency, total_ht, total_tax, total_ttc,
        direction, status, created_at
      ) VALUES (?, '380', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OUTBOUND', 'SENT', NOW())
    `;
    
    const invoicParams = [
        data.invoiceNumber || null,
        data.dateInvoice ? new Date(data.dateInvoice) : null,
        data.dateDue ? new Date(data.dateDue) : null,
        data.buyer.gln || null, data.seller.gln || null,
        data.orderNumber || null, data.desadvNumber || null, data.orderId || null,
        data.currency || 'EUR',
        data.totals.totalLines || null, data.totals.totalTax || null, data.totals.totalPayable || null
    ];

    const invoicResult = await runUpdate(entiteDB, invoicInsertSql, invoicParams);
    const invoicId = invoicResult.lastID;

    // 5b. Insert Lines
    if (data.items && data.items.length > 0) {
        for (const item of data.items) {
            await runUpdate(entiteDB, `
                INSERT INTO edi_invoic_lines (
                    id_invoic, id_order_line, line_number, gtin, 
                    description, quantity, unit_price, 
                    tax_rate, line_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoicId, item.orderLineId || null, item.lineNumber || null, item.gtin || null,
                    item.description || null, item.quantity || null, item.unitPrice || null,
                    item.taxRate || null, item.lineAmount || null
                ]
            );
        }
    }

    // Update transmission with related ID
    await updateEdiTransmissionStatus(entiteDB, transmissionId, 'PENDING', null, null, invoicId);

    // 6. Send to EDI Server (Async) - Use dynamic routing
    const ediTarget = await configService.getEdiTargetUrl(entiteDB, data.buyer.gln);
    const ediServerUrl = ediTarget.url;
    
    console.log(`[INVOIC SEND] ðŸŽ¯ EDI Routing: ${data.buyer.gln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);
    
    setImmediate(async () => {
      try {
        const ediResponse = await axios.post(ediServerUrl, {
          eancomContent: eancomContent,
          filename: filename,
          partnerGln: data.buyer.gln,
          senderGln: data.seller.gln
        }, {
          headers: serviceAuthHeaders(),
          timeout: 30000
        });

        console.log(`[INVOIC SEND] âœ… Sent to EDI server. Response:`, ediResponse.data);
        
        await updateEdiTransmissionStatus(
          entiteDB, 
          transmissionId, 
          'SENT',
          `Successfully sent to EDI server at ${new Date().toISOString()}`,
          null
        );
      } catch (ediErr) {
        console.error(`[INVOIC SEND] âŒ Failed to send to EDI server:`, ediErr.message);
        
        await updateEdiTransmissionStatus(
          entiteDB,
          transmissionId,
          'ERROR',
          `Failed to send to EDI server at ${new Date().toISOString()}`,
          ediErr.message
        );
        
        await incrementRetryCount(entiteDB, transmissionId);
      }
    });

    // 7. Return response
    res.json({
      success: true,
      message: 'INVOIC generated and queued for sending',
      transmissionId,
      invoicId,
      content: eancomContent
    });

  } catch (err) {
    console.error('[EDI SEND] Error generating INVOIC:', err);
    res.status(500).json({ error: 'Failed to generate INVOIC', details: safeErrDetails(err) });
  }
});

// GET /api/edi/invoices/list - List all invoices from edi_invoic (both sent and received)
app.get("/api/edi/invoices/list", async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, 'SELECT * FROM edi_invoic ORDER BY created_at DESC LIMIT 200', []);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[INVOICES LIST] Error:', err);
    res.status(500).json({ error: 'Failed to list invoices', details: safeErrDetails(err) });
  }
});

// GET /api/edi/invoices/:id/lines - Get lines for an invoice
app.get("/api/edi/invoices/:id/lines", async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    const rows = await queryDB(entiteDB, 'SELECT * FROM edi_invoic_lines WHERE id_invoic = ? ORDER BY line_number, id', [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[INVOICE LINES] Error:', err);
    res.status(500).json({ error: 'Failed to get invoice lines', details: safeErrDetails(err) });
  }
});

// DELETE /api/edi/invoices/:id - Delete an invoice (only DRAFT allowed)
app.delete("/api/edi/invoices/:id", async (req, res) => {
  try {
    if (!entiteDB) return res.status(503).json({ error: 'Database unavailable' });
    // Check current status â€” only DRAFT invoices can be deleted
    const rows = await queryDB(entiteDB, 'SELECT status, invoic_number FROM edi_invoic WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const { status, invoic_number } = rows[0];
    if ((status || '').toUpperCase() !== 'DRAFT') {
      return res.status(403).json({
        error: `Suppression impossible : la facture ${invoic_number} est en statut "${status}". Seules les factures en brouillon peuvent Ãªtre supprimÃ©es.`
      });
    }
    await runUpdate(entiteDB, 'DELETE FROM edi_invoic_lines WHERE id_invoic = ?', [req.params.id]);
    await runUpdate(entiteDB, 'DELETE FROM edi_invoic WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[INVOICE DELETE] Error:', err);
    res.status(500).json({ error: 'Failed to delete invoice', details: safeErrDetails(err) });
  }
});

// POST /api/edi/invoices/:id/send - Send an existing draft invoice via EDI
app.post("/api/edi/invoices/:id/send", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch Invoice Data
    const invoiceRows = await queryDB(entiteDB, "SELECT * FROM edi_invoic WHERE id = ?", [id]);
    if (!invoiceRows || invoiceRows.length === 0) return res.status(404).json({ error: "Invoice not found" });
    const invoice = invoiceRows[0];

    const lineRows = await queryDB(entiteDB, "SELECT * FROM edi_invoic_lines WHERE id_invoic = ?", [id]);

    // 2. Construct Payload for EANCOM Generation
    const payload = {
        invoiceNumber: invoice.invoic_number,
        dateInvoice: invoice.date_facture,
        dateDue: invoice.date_echeance,
        buyer: { gln: invoice.buyer_gln },
        seller: { gln: invoice.seller_gln },
        orderNumber: invoice.order_reference,
        desadvNumber: invoice.desadv_reference,
        currency: invoice.currency,
        totals: {
            totalLines: invoice.total_ht,
            totalTax: invoice.total_tax,
            totalPayable: invoice.total_ttc
        },
        items: lineRows.map(l => ({
            lineNumber: l.line_number,
            gtin: l.gtin,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unit_price,
            taxRate: l.tax_rate,
            lineAmount: l.line_amount
        }))
    };

    console.log(`[EDI SEND] Sending existing Draft INVOIC ${payload.invoiceNumber}`);

    // 3. Generate EANCOM
    const eancomContent = generateInvoicEANCOM(payload);

    // 4. Save to file using configurable EDI_ORDERS_PATH
    const ediOrdersPath = configService.getEdiOrdersPath();
    const outboundDir = path.join(ediOrdersPath, 'invoices', payload.seller.gln);
    await fs.promises.mkdir(outboundDir, { recursive: true });
    const filename = `INVOIC_${payload.invoiceNumber}_${Date.now()}.txt`;
    const filePath = path.join(outboundDir, filename);
    await fs.promises.writeFile(filePath, eancomContent, 'utf8');

    // 5. Record Transmission
    let partnerId = null;
    if (invoice.buyer_gln) {
      const partnerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [invoice.buyer_gln]);
      if (partnerRows.length > 0) partnerId = partnerRows[0].id_entite;
    }

    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: invoice.id,
      related_type: 'INVOICE',
      document_type: 'INVOIC',
      direction: 'OUTBOUND',
      partner_id: partnerId,
      partner_gln: invoice.buyer_gln,
      sender_gln: invoice.seller_gln,
      filename: filename,
      file_path: path.join('uploads', 'eancom', 'outbound', filename),
      file_content: eancomContent,
      status: 'SENT',
      transmission_date: new Date(),
      logs: `Sent existing Draft INVOIC ${payload.invoiceNumber}`
    });

    // 6. Update Invoice Status
    await runUpdate(entiteDB, "UPDATE edi_invoic SET status = 'SENT', updated_at = NOW() WHERE id = ?", [id]);

    res.json({
      success: true,
      message: 'INVOIC sent successfully',
      transmissionId,
      content: eancomContent
    });

  } catch (err) {
    console.error("Error sending draft invoice:", err);
    res.status(500).json({ error: err.message });
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

// DEBUG ENDPOINT: List last orders
app.get("/api/debug/orders", async (req, res) => {
  try {
    const orders = await queryDB(entiteDB, "SELECT id_order, num_commande, id_entite_buyer, id_entite_seller, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DEBUG ENDPOINT: List entities
app.get("/api/debug/entities", async (req, res) => {
  try {
    const entities = await queryDB(entiteDB, "SELECT id_entite, gln, raison_socialle FROM Entite LIMIT 50");
    res.json(entities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ?? GET /api/products â€” Fetch all with filters + pagination
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
      SELECT fp.id, fp.brand, fp.subBrand, fp.description, fp.gtin, fp.libelle, fp.short_libelle,
             fp.countryOfOrigin, fp.idEntreprise, fp.images, fp.nb_images, fp.prix_min, fp.prix_max,
             fp.code_cader, fp.codeClasse, fp.codebrique, fp.date_mis_a_jour_fp,
             fp.tradeItemSynchronisationDates, fp.date_create_fp, fp.activ_prix, fp.status, fp.done_new,
             COALESCE(dc.cnt, 0) AS declinaison_count
      FROM fiche_produit fp
      LEFT JOIN (SELECT id_produit, COUNT(*) AS cnt FROM declinaison GROUP BY id_produit) dc ON dc.id_produit = fp.id
      ${whereClause}
      ORDER BY fp.\`${sortBy}\` ${sortDir}
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
    res.status(500).json({ error: "Failed to fetch products", details: safeErrDetails(err) });
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
    res.status(500).json({ error: "Failed to create product", details: safeErrDetails(err) });
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
    const conn = await mysql.createConnection(dbConfig);
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
    const conn = await mysql.createConnection(dbConfig);
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

    const conn = await mysql.createConnection(dbConfig);

    const [rows] = await conn.query(`
      SELECT 
        codeBrique,
        COALESCE(CONVERT(libelleBrique USING utf8mb4), '(Sans libellÃ©)') AS libelleBrique,
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
    res.status(500).json({ error: "Failed to delete", details: safeErrDetails(err) });
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
    res.status(500).json({ error: "Failed to update status", details: safeErrDetails(err) });
  }
});

// ============================================================
app.get('/api/classes', async (req, res) => {
  const { codeFamille } = req.query;
  try {
    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch classes', details: safeErrDetails(err) });
  }
});



// ?? GET /api/briques-by-class/:codeClasse â€” Fetch briques for a specific class
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
// TEMPLATE â€“ /api/products/template
// ---------------------------------------------------------------
app.get("/api/products/template", async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const axios = require("axios");

    const base = `${req.protocol}://${req.get("host")}`;

    // ---- 1. FETCH LIVE DATA ------------------------------------
    const [pRes, cRes, bRes] = await Promise.all([
      axios.get(`${base}/api/pays`,    { headers: serviceAuthHeaders() }),
      axios.get(`${base}/api/classes`, { headers: serviceAuthHeaders() }),
      axios.get(`${base}/api/bricks`,  { headers: serviceAuthHeaders() })
    ]);

    const pays = pRes.data.map(p => `${p.libelle} - ${p.isoNumeric}`);
    const classes = cRes.data
      .filter(c => c.status === 1)
      .map(c => `${c.code} - ${c.libelle}`);
    const briques = bRes.data
      .filter(b => b.status === 1)
      .map(b => `${b.code} - ${b.libelle}`);

    // ---- 2. CREATE WORKBOOK ------------------------------------
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("ModÃ¨le Import Produits");

    // ----- headers ------------------------------------------------
    const headers = [
      "brand", "subBrand", "description", "gtin", "libelle",
      "short_libelle", "countryOfOrigin", "prix_min", "prix_max",
      "code_cader", "codeClasse", "codebrique", "activ_prix"
    ];
    const hr = ws.addRow(headers);
    hr.font = { bold: true };
    ws.columns = headers.map(() => ({ width: 35 }));

    // ----- hidden sheet with raw lists -----------------------------
    const lists = wb.addWorksheet("_lists", { state: "veryHidden" });

    // row 1 ? countries (displayed text)
    lists.getRow(1).values = ["countryOfOrigin", ...pays];
    // row 2 ? classes
    lists.getRow(2).values = ["codeClasse", ...classes];
    // row 3 ? briques
    lists.getRow(3).values = ["codebrique", ...briques];
    // row 4 ? activ_prix
    lists.getRow(4).values = ["activ_prix", "0", "1"];

    // ----- helper: make a CSV string safe for Excel --------------
    const csv = arr => arr.map(s => `"${s.replace(/"/g, '""')}"`).join(",");

    // ----- helper: write a long list to a hidden column and return INDIRECT formula
    // (Excel limit Ëœ 255 chars ? we use a hidden column when > 30 items)
    const makeList = (arr, colLetter) => {
      if (arr.length <= 30) {
        return `=${csv(arr)}`;
      }
      // write values vertically in the hidden column
      arr.forEach((v, i) => lists.getCell(`${colLetter}${i + 10}`).value = v);
      const last = 9 + arr.length;
      return `=INDIRECT("_lists!${colLetter}10:${colLetter}${last}")`;
    };

    const countryFormula = makeList(pays, "Z");   // column Z hidden
    const classeFormula = makeList(classes, "AA");
    const briqueFormula = makeList(briques, "AB");

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
    res.status(500).json({ error: "Failed to generate template", details: safeErrDetails(err) });
  }
});
app.post("/api/products/import", async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || !products.length) {
      return res.status(400).json({ error: "No products provided" });
    }

    const conn = await mysql.createConnection(dbConfig);
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
      message: `${inserted} produit(s) importÃ©(s), ${skipped} ignorÃ©(s)`
    });

  } catch (err) {
    console.error("POST /api/products/import ERROR:", err);
    res.status(500).json({ error: "Server error", details: safeErrDetails(err) });
  }
});

// ================== DECLINAISON CONSTANTS ==================

const PACKAGING_TYPES = [
  "Carton", "Plastique", "Verre", "MÃ©tal", "Bois",
  "Papier", "Sachet", "Film plastique", "Barquette", "Bouteille"
];

const PALLET_TYPES = [
  "EUR/EPAL", "CP1", "CP2", "CP3", "CP4",
  "CP5", "CP6", "CP7", "CP8", "CP9", "Palette personnalisÃ©e"
];

// HiÃ©rarchies GS1
const HIERARCHY_OPTIONS = {
  PK: "PK (Lot Consommateur HomogÃ¨ne)",
  AP: "AP (Lot Consommateur HÃ©tÃ©rogÃ¨ne)",
  CA: "CA (Colis HomogÃ¨ne)",
  DS: "DS (Colis HÃ©tÃ©rogÃ¨ne)",
  PL: "PL (Palette HomogÃ¨ne)",
  MX: "MX (Palette HÃ©tÃ©rogÃ¨ne)"
};

const HIERARCHY_FIELDS = {
  PK: [
    "gtin_d", "childTradeItem", "quantityofNextLowerLevelTradeItem",
    "quantityOfCompleteLayersContainedInATradeItem",
    "quantityOfTradeItemsContainedInACompleteLayer",
    "isTradeItemADespatchUnit", "isTradeItemAnInvoiceUnit",
    "isTradeItemAnOrderableUnit", "isTradeItemAModel",
    "isTradeItemADivisibleItem", "hasDisplayReadyPackaging",
    "isTradeItemPackedIrregularly", "compositionDepthValue",
    "compositionWidthValue", "alimentaryProduct",
    "TradeItemDisplayDimensions", "contactGLN",
    "orderingUnitOfMeasure", "invoicingUnitOfMeasure",
    "packageMarksDietAllergen", "cataloguePriceBasisQuantity",
    "cataloguePriceBasisUnitOfMeasure", "tradeItemWeight",
    "tradeItemVolume", "packagingMaterial",
    "stackingFactor", "maxStackingWeight",
    "palletLayerQuantity", "type_emballage", "palletTypeCode"
  ],

  AP: [
    "unite_logistique_ap", "unite_facturable_ap",
    "unite_commandable_ap", "isTradeItemAModel_ap",
    "isTradeItemADivisibleItem_ap", "hasDisplayReadyPackaging_ap",
    "isTradeItemPackedIrregularly_ap", "compositionDepthValue_ap",
    "compositionWidthValue_ap", "alimentaryProduct_ap",
    "TradeItemDisplayDimensions_ap", "contactGLN_ap",
    "orderingUnitOfMeasure_ap", "invoicingUnitOfMeasure_ap",
    "gtin_d_ap", "childTradeItem_ap",
    "quantityofNextLowerLevelTradeItem_ap",
    "packageMarksDietAllergen_ap", "tradeItemWeight_ap",
    "tradeItemVolume_ap", "packagingMaterial_ap",
    "stackingFactor_ap", "type_emballage", "palletTypeCode"
  ],

  CA: [
    "gtin_d_ca", "childTradeItem_ca",
    "quantityofNextLowerLevelTradeItem_ca", "packagingTypeCode",
    "palletTypeCode", "quantityOfCompleteLayersContainedInATradeItem_ca",
    "quantityOfTradeItemsContainedInACompleteLayer_ca",
    "isTradeItemAConsumerUnit", "unite_facturable_ca",
    "unite_commandable_ca", "isTradeItemAFullDisplayStand",
    "hasDisplayReadyPackaging_ca", "isTradeItemPackedIrregularly_ca",
    "compositionDepthValue_ca", "compositionWidthValue_ca",
    "alimentaryProduct_ca", "contactGLN_ca",
    "orderingUnitOfMeasure_ca", "invoicingUnitOfMeasure_ca",
    "tradeItemWeight_ca", "tradeItemVolume_ca",
    "packagingMaterial_ca", "maxStackingWeight_ca",
    "palletLayerQuantity_ca", "type_emballage"
  ],

  DS: [
    "quantityofNextLowerLevelTradeItem_ds", "packagingTypeCode",
    "palletTypeCode", "quantityOfCompleteLayersContainedInATradeItem_ds",
    "quantityOfTradeItemsContainedInACompleteLayer_ds",
    "unite_facturable_ds", "isTradeItemAFullDisplayStand_ds",
    "hasDisplayReadyPackaging_ds", "isTradeItemPackedIrregularly_ds",
    "compositionDepthValue_ds", "compositionWidthValue_ds",
    "contactGLN_ds", "orderingUnitOfMeasure_ds",
    "invoicingUnitOfMeasure_ds", "tradeItemWeight_ds",
    "tradeItemVolume_ds", "packagingMaterial_ds",
    "maxStackingWeight_ds", "palletLayerQuantity_ds",
    "type_emballage"
  ],

  PL: [
    "gtin_d_pl", "childTradeItem_pl",
    "quantityofNextLowerLevelTradeItem_pl",
    "quantityOfCompleteLayersContainedInATradeItem_pl",
    "quantityOfTradeItemsContainedInACompleteLayer_pl",
    "isTradeItemAnInvoiceUnit_pl", "isTradeItemAnOrderableUnit_pl",
    "isTradeItemAFullDisplayStand_pl", "hasDisplayReadyPackaging_pl",
    "isTradeItemPackedIrregularly_pl", "compositionDepthValue_pl",
    "compositionWidthValue_pl", "contactGLN_pl",
    "orderingUnitOfMeasure_pl", "invoicingUnitOfMeasure_pl",
    "palletTypeCode", "palletLayerQuantity_pl",
    "tradeItemWeight_pl", "tradeItemVolume_pl",
    "packagingMaterial_pl", "maxStackingWeight_pl",
    "stackingFactor_pl", "palletDimensions_pl",
    "type_emballage"
  ],

  MX: [
    "gtin_d_mx", "childTradeItem1",
    "quantityofNextLowerLevelTradeItem1", "childTradeItem2",
    "quantityofNextLowerLevelTradeItem2", "childTradeItem3",
    "quantityofNextLowerLevelTradeItem3", "childTradeItem4",
    "quantityofNextLowerLevelTradeItem4",
    "quantityOfCompleteLayersContainedInATradeItem_mx",
    "quantityOfTradeItemsContainedInACompleteLayer_mx",
    "isTradeItemAnInvoiceUnit_mx", "isTradeItemAFullDisplayStand_mx",
    "hasDisplayReadyPackaging_mx", "isTradeItemPackedIrregularly_mx",
    "compositionDepthValue_mx", "compositionWidthValue_mx",
    "contactGLN_mx", "orderingUnitOfMeasure_mx",
    "invoicingUnitOfMeasure_mx", "palletTypeCode",
    "palletLayerQuantity_mx", "tradeItemWeight_mx",
    "tradeItemVolume_mx", "packagingMaterial_mx",
    "maxStackingWeight_mx", "stackingFactor_mx",
    "palletDimensions_mx", "type_emballage"
  ]
};

app.post("/api/declinaisons", async (req, res) => {
  try {
    const {
      id_produit,
      hierarchy_code,
      parent_id,
      gtin,
      packaging_type,
      pallet_type,
      hierarchy_fields
    } = req.body;

    if (!id_produit || !hierarchy_code || !hierarchy_fields)
      return res.status(400).json({ error: "Missing required fields" });

    if (!HIERARCHY_FIELDS[hierarchy_code])
      return res.status(400).json({ error: "Invalid hierarchy_code" });

    // ðŸ”’ Nettoyage sÃ©curisÃ©
    const allowed = HIERARCHY_FIELDS[hierarchy_code];
    const cleaned = {};
    for (const k of allowed) {
      if (hierarchy_fields[k] !== undefined)
        cleaned[k] = hierarchy_fields[k];
    }

    const sql = `
      INSERT INTO declinaison
      (id_produit, hierarchy_code, hierarchy_label,
       parent_id, gtin, packaging_type, pallet_type, hierarchy_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await runUpdate(entiteDB, sql, [
      id_produit,
      hierarchy_code,
      HIERARCHY_OPTIONS[hierarchy_code],
      parent_id || null,
      gtin || null,
      packaging_type || null,
      pallet_type || null,
      JSON.stringify(cleaned)
    ]);

    res.json({ id: result.lastID });
  } catch (err) {
    console.error("POST /api/declinaisons", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/products/:id/declinaisons", async (req, res) => {
  try {
    const rows = await queryDB(
      entiteDB,
      "SELECT * FROM declinaison WHERE id_produit=? ORDER BY parent_id ASC, id ASC",
      [req.params.id]
    );

    res.json(rows.map(r => ({
      ...r,
      hierarchy_fields: typeof r.hierarchy_fields === 'string' ? JSON.parse(r.hierarchy_fields) : (r.hierarchy_fields || {})
    })));
  } catch (err) {
    console.error("GET declinaisons", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/declinaisons/:id", async (req, res) => {
  try {
    const { hierarchy_fields, gtin, packaging_type, pallet_type } = req.body;

    const row = await queryDB(
      entiteDB,
      "SELECT hierarchy_code FROM declinaison WHERE id=?",
      [req.params.id]
    );

    if (!row.length)
      return res.status(404).json({ error: "Declinaison not found" });

    const allowed = HIERARCHY_FIELDS[row[0].hierarchy_code];
    const cleaned = {};
    for (const k of allowed) {
      if (hierarchy_fields?.[k] !== undefined)
        cleaned[k] = hierarchy_fields[k];
    }

    await runUpdate(
      entiteDB,
      `
      UPDATE declinaison SET
        gtin=?, packaging_type=?, pallet_type=?, hierarchy_fields=?
      WHERE id=?
      `,
      [
        gtin || null,
        packaging_type || null,
        pallet_type || null,
        JSON.stringify(cleaned),
        req.params.id
      ]
    );

    res.json({ updated: true });
  } catch (err) {
    console.error("PUT declinaison", err);
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/declinaisons/:id", async (req, res) => {
  try {
    const result = await runUpdate(
      entiteDB,
      "DELETE FROM declinaison WHERE id=?",
      [req.params.id]
    );

    res.json({ deleted: result.changes });
  } catch (err) {
    console.error("DELETE declinaison", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/declinaisons/meta", (req, res) => {
  res.json({
    hierarchyOptions: HIERARCHY_OPTIONS,
    hierarchyFields: HIERARCHY_FIELDS,
    packagingTypes: PACKAGING_TYPES,
    palletTypes: PALLET_TYPES
  });
});



// ---------------- ORDERS ----------------
router.get("/orders", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });
  try {
    const orders = await queryDB(entiteDB, "SELECT * FROM orders ORDER BY id_order DESC", []);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders", details: safeErrDetails(err) });
  }
});

router.get("/orders/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });
  try {
    const rows = await queryDB(entiteDB, "SELECT * FROM orders WHERE id_order=?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order", details: safeErrDetails(err) });
  }
});

router.post("/orders", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });
  const { num_order, id_fournisseur, id_entite, date_order, total_ht, statut } = req.body;
  try {
    // Assuming id_entite is buyer, id_fournisseur is seller
    const result = await runUpdate(
      entiteDB,
      "INSERT INTO orders (num_commande, order_number, id_entite_buyer, id_entite_seller, date_commande, total_ht, status, created_at) VALUES (?,?,?,?,?,?,?, NOW())",
      [num_order, num_order, id_entite, id_fournisseur, date_order, total_ht, statut || 'new']
    );
    res.json({ id_order: result.lastID });
  } catch (err) {
    res.status(500).json({ error: "Failed to create order", details: safeErrDetails(err) });
  }
});

router.put("/orders/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });
  const { num_order, id_fournisseur, id_entite, date_order, total_ht, statut } = req.body;
  try {
    await runUpdate(
      entiteDB,
      "UPDATE orders SET num_commande=?, order_number=?, id_entite_seller=?, id_entite_buyer=?, date_commande=?, total_ht=?, status=? WHERE id_order=?",
      [num_order, num_order, id_fournisseur, id_entite, date_order, total_ht, statut, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order", details: safeErrDetails(err) });
  }
});

router.delete("/orders/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "Database unavailable" });
  try {
    await runUpdate(entiteDB, "DELETE FROM orders WHERE id_order=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete order", details: safeErrDetails(err) });
  }
});

// ---------------- ORDER LINES ----------------
router.get("/order/:id/lines", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    const rows = await queryDB(entiteDB, "SELECT * FROM order_lines WHERE id_order=?", [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order lines", details: safeErrDetails(err) });
  }
});

router.post("/order/:id/lines", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { line_number, gtin, quantity, unit, price, libelle } = req.body;
  try {
    const result = await runUpdate(entiteDB, "INSERT INTO order_lines (id_order,line_number,gtin,quantity,unit,price,libelle) VALUES (?,?,?,?,?,?,?)",
      [req.params.id, line_number, gtin, quantity, unit, price, libelle]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: "Failed to add order line", details: safeErrDetails(err) });
  }
});

router.put("/order/line/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { line_number, gtin, quantity, unit, price, libelle } = req.body;
  try {
    await runUpdate(entiteDB, "UPDATE order_lines SET line_number=?,gtin=?,quantity=?,unit=?,price=?,libelle=? WHERE id=?",
      [line_number, gtin, quantity, unit, price, libelle, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order line", details: safeErrDetails(err) });
  }
});

router.delete("/order/line/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    await runUpdate(entiteDB, "DELETE FROM order_lines WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete order line", details: safeErrDetails(err) });
  }
});

// ---------------- SHIPMENTS ----------------
router.get("/shipments", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    const rows = await queryDB(entiteDB, "SELECT * FROM edi_shipments ORDER BY id DESC", []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch shipments", details: safeErrDetails(err) });
  }
});

router.post("/shipments", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { num_expedition, id_avis_expedition, id_order, status, carrier, vehicle, date_expedition } = req.body;
  try {
    const result = await runUpdate(entiteDB, "INSERT INTO edi_shipments (num_expedition,id_avis_expedition,id_order,status,carrier,vehicle,date_expedition) VALUES (?,?,?,?,?,?,?)",
      [num_expedition, id_avis_expedition, id_order, status, carrier, vehicle, date_expedition]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: "Failed to create shipment", details: safeErrDetails(err) });
  }
});

router.put("/shipments/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { num_expedition, id_avis_expedition, id_order, status, carrier, vehicle, date_expedition } = req.body;
  try {
    await runUpdate(entiteDB, "UPDATE edi_shipments SET num_expedition=?,id_avis_expedition=?,id_order=?,status=?,carrier=?,vehicle=?,date_expedition=? WHERE id=?",
      [num_expedition, id_avis_expedition, id_order, status, carrier, vehicle, date_expedition, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update shipment", details: safeErrDetails(err) });
  }
});

router.delete("/shipments/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    await runUpdate(entiteDB, "DELETE FROM edi_shipments WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete shipment", details: safeErrDetails(err) });
  }
});

// ---------------- INVOICES ----------------
router.get("/invoices", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    const rows = await queryDB(entiteDB, "SELECT * FROM edi_invoices ORDER BY id DESC", []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invoices", details: safeErrDetails(err) });
  }
});

router.post("/invoices", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const d = req.body;
  try {
    // Support both legacy simple fields and full InvoiceFormData from InvoiceCreationModal
    if (d.invoic_number || d.buyer_gln || d.seller_gln) {
      // Full InvoiceFormData â€” insert into edi_invoic + edi_invoic_lines
      const result = await runUpdate(entiteDB,
        `INSERT INTO edi_invoic (invoic_number, type_code, date_facture, date_echeance, buyer_gln, seller_gln, order_reference, desadv_reference, id_order, currency, total_ht, total_tax, total_ttc, direction, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OUTBOUND', 'DRAFT')`,
        [
          d.invoic_number || null,
          d.type_code || '380',
          d.date_facture || null,
          d.date_echeance || null,
          d.buyer_gln || null,
          d.seller_gln || null,
          d.order_reference || null,
          d.desadv_reference || null,
          d.id_order || null,
          d.currency || 'EUR',
          d.total_ht || null,
          d.total_tax || null,
          d.total_ttc || null
        ]);
      const invoicId = result.lastID;

      // Insert lines
      if (d.lines && Array.isArray(d.lines)) {
        for (const line of d.lines) {
          await runUpdate(entiteDB,
            `INSERT INTO edi_invoic_lines (id_invoic, line_number, gtin, description, quantity, unit_price, tax_rate, line_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoicId,
              line.line_number || null,
              line.gtin || null,
              line.description || null,
              line.quantity || 0,
              line.unit_price || 0,
              line.tax_rate || 0,
              line.line_amount || 0
            ]);
        }
      }

      console.log(`[INVOICE] Created edi_invoic #${invoicId} with ${(d.lines || []).length} lines`);
      res.json({ success: true, id: invoicId });
    } else {
      // Legacy simple insert into edi_invoices
      const { num_facture, id_facture_legacy, id_order, id_shipment, total_ht } = d;
      const result = await runUpdate(entiteDB, "INSERT INTO edi_invoices (num_facture,id_facture_legacy,id_order,id_shipment,total_ht) VALUES (?,?,?,?,?)",
        [num_facture || null, id_facture_legacy || null, id_order || null, id_shipment || null, total_ht || null]);
      res.json({ success: true, id: result.lastID });
    }
  } catch (err) {
    console.error("[INVOICE] Error creating invoice:", err);
    res.status(500).json({ error: "Failed to create invoice", details: safeErrDetails(err) });
  }
});

// POST /api/invoices/:id/send â€” Proxy to /api/edi/invoices/:id/send
router.post("/invoices/:id/send", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    const { id } = req.params;

    // 1. Fetch Invoice Data from edi_invoic
    const invoiceRows = await queryDB(entiteDB, "SELECT * FROM edi_invoic WHERE id = ?", [id]);
    if (!invoiceRows || invoiceRows.length === 0) return res.status(404).json({ error: "Invoice not found in edi_invoic" });
    const invoice = invoiceRows[0];

    const lineRows = await queryDB(entiteDB, "SELECT * FROM edi_invoic_lines WHERE id_invoic = ?", [id]);

    // 2. Construct Payload for EANCOM Generation
    const payload = {
      invoiceNumber: invoice.invoic_number,
      dateInvoice: invoice.date_facture,
      dateDue: invoice.date_echeance,
      buyer: { gln: invoice.buyer_gln },
      seller: { gln: invoice.seller_gln },
      orderNumber: invoice.order_reference,
      desadvNumber: invoice.desadv_reference,
      currency: invoice.currency,
      totals: {
        totalLines: invoice.total_ht,
        totalTax: invoice.total_tax,
        totalPayable: invoice.total_ttc
      },
      items: lineRows.map(l => ({
        lineNumber: l.line_number,
        gtin: l.gtin,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        taxRate: l.tax_rate,
        lineAmount: l.line_amount
      }))
    };

    console.log(`[INVOICE SEND] Sending Draft INVOIC #${id} â€” ${payload.invoiceNumber}`);

    // 3. Generate EANCOM
    const eancomContent = generateInvoicEANCOM(payload);

    // 4. Save to file
    const ediOrdersPath = configService.getEdiOrdersPath();
    const outboundDir = path.join(ediOrdersPath, 'invoices', payload.seller.gln);
    await fs.promises.mkdir(outboundDir, { recursive: true });
    const filename = `INVOIC_${payload.invoiceNumber}_${Date.now()}.txt`;
    const filePath = path.join(outboundDir, filename);
    await fs.promises.writeFile(filePath, eancomContent, 'utf8');

    // 5. Record Transmission
    let partnerId = null;
    if (invoice.buyer_gln) {
      const partnerRows = await queryDB(entiteDB, "SELECT id_entite FROM Entite WHERE gln = ?", [invoice.buyer_gln]);
      if (partnerRows.length > 0) partnerId = partnerRows[0].id_entite;
    }

    const transmissionId = await createEdiTransmission(entiteDB, {
      related_id: invoice.id,
      related_type: 'INVOICE',
      document_type: 'INVOIC',
      direction: 'OUTBOUND',
      partner_id: partnerId,
      partner_gln: invoice.buyer_gln,
      sender_gln: invoice.seller_gln,
      filename: filename,
      file_path: path.join('uploads', 'eancom', 'outbound', filename),
      file_content: eancomContent,
      status: 'PENDING',
      transmission_date: new Date(),
      logs: `Queued INVOIC ${payload.invoiceNumber} via /api/invoices/:id/send`
    });

    // 6. Update Invoice Status to PENDING
    await runUpdate(entiteDB, "UPDATE edi_invoic SET status = 'PENDING', updated_at = NOW() WHERE id = ?", [id]);

    // 7. Queue for delivery
    try {
      await axios.post(`http://localhost:${configService.get('PORT') || 5001}/api/edi/queue-send`, {
        eancomContent: eancomContent,
        filename: filename,
        partnerGln: invoice.buyer_gln,
        senderGln: invoice.seller_gln
      }, {
        headers: serviceAuthHeaders()
      });
    } catch (queueErr) {
      console.warn('[INVOICE SEND] Queue send failed (will retry via worker):', queueErr.message);
    }

    res.json({
      success: true,
      message: `INVOIC ${payload.invoiceNumber} sent successfully`,
      invoiceId: id,
      transmissionId: transmissionId
    });
  } catch (err) {
    console.error("[INVOICE SEND] Error:", err);
    res.status(500).json({ error: "Failed to send invoice", details: safeErrDetails(err) });
  }
});

router.put("/invoices/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { num_facture, id_facture_legacy, id_order, id_shipment, total_ht } = req.body;
  try {
    await runUpdate(entiteDB, "UPDATE edi_invoices SET num_facture=?,id_facture_legacy=?,id_order=?,id_shipment=?,total_ht=? WHERE id=?",
      [num_facture, id_facture_legacy, id_order, id_shipment, total_ht, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update invoice", details: safeErrDetails(err) });
  }
});

router.delete("/invoices/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    await runUpdate(entiteDB, "DELETE FROM edi_invoices WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete invoice", details: safeErrDetails(err) });
  }
});

// ---------------- TRACKING ----------------
router.get("/tracking/:shipment", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    const rows = await queryDB(entiteDB, "SELECT * FROM edi_tracking WHERE id_shipment=?", [req.params.shipment]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tracking", details: safeErrDetails(err) });
  }
});

router.post("/tracking/:shipment", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { event_code, event_label, event_datetime, location } = req.body;
  try {
    const result = await runUpdate(entiteDB, "INSERT INTO edi_tracking (id_shipment,event_code,event_label,event_datetime,location) VALUES (?,?,?,?,?)",
      [req.params.shipment, event_code, event_label, event_datetime, location]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: "Failed to create tracking event", details: safeErrDetails(err) });
  }
});

router.put("/tracking/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  const { event_code, event_label, event_datetime, location } = req.body;
  try {
    await runUpdate(entiteDB, "UPDATE edi_tracking SET event_code=?,event_label=?,event_datetime=?,location=? WHERE id=?",
      [event_code, event_label, event_datetime, location, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update tracking", details: safeErrDetails(err) });
  }
});

router.delete("/tracking/:id", async (req, res) => {
  if (!entiteDB) return res.status(503).json({ error: "DB unavailable" });
  try {
    await runUpdate(entiteDB, "DELETE FROM edi_tracking WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete tracking", details: safeErrDetails(err) });
  }
});

// ======================================
//  CARACTÃ‰RISTIQUES IMAGE UPLOADER (CJS VERSION)
// ======================================
// Folder for uploads
const CARAC_DIR = process.env.CARAC_DIR || path.join(__dirname, 'uploads', 'caracteristiques');

// Ensure folder exists
if (!fs.existsSync(CARAC_DIR)) {
  fs.mkdirSync(CARAC_DIR, { recursive: true });
}

// -------------------------------------------
// UPLOAD HANDLER (Images + Videos)
// -------------------------------------------
const storageCaracteristique = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, CARAC_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  }
});

const caracteristiqueUpload = multer({
  storage: storageCaracteristique,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB images/videos
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp",
      "video/mp4", "video/webm"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Invalid file type (jpg/png/webp/mp4/webm only)"));
    }
    cb(null, true);
  }
});

// =====================================================
// GET ALL CARACTERISTIQUES
// =====================================================
app.get("/api/caracteristiques", async (req, res) => {
  try {
    const {
      search,
      id_entite,
      nature,
      sortBy = "id_carac",
      sortDir = "DESC",
      page = "1",
      limit = "25"
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = [];
    const params = [];

    if (id_entite) { where.push("id_entite=?"); params.push(id_entite); }
    if (nature) { where.push("nature=?"); params.push(nature); }

    if (search) {
      const s = `%${search}%`;
      where.push("(identification LIKE ? OR utilite LIKE ?)");
      params.push(s, s);
    }

    const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";
    const allowedSort = ["id_carac", "identification", "nature", "date_lancement", "created_at"];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : "id_carac";
    const safeSortDir = sortDir.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const sql = `SELECT * FROM caracteristiques ${whereSQL} ORDER BY ${safeSortBy} ${safeSortDir} LIMIT ? OFFSET ?`;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [caracteristiques] = await conn.query(sql, [...params, parseInt(limit), offset]);
    await conn.end();

    res.json({ caracteristiques });

  } catch (err) {
    console.error('[GET /api/caracteristiques]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// GET ONE CARACTERISTIQUE BY ID
// =====================================================
app.get("/api/caracteristiques/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [[carac]] = await conn.query("SELECT * FROM caracteristiques WHERE id_carac=?", [id]);
    const [elements] = await conn.query("SELECT * FROM caracteristiques_elements WHERE id_carac=?", [id]);
    const [illustrations] = await conn.query("SELECT * FROM caracteristiques_illustrations WHERE id_carac=?", [id]);
    await conn.end();
    res.json({ carac, elements, illustrations });
  } catch (err) {
    console.error('[GET /api/caracteristiques/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// CREATE CARACTERISTIQUE
// =====================================================
app.post("/api/caracteristiques", async (req, res) => {
  try {
    const {
      id_entite,
      identification,
      description_fr,
      description_en,
      description_ar,
      nature,
      utilite,
      date_lancement,
      elements = [],
      illustrations = []
    } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [result] = await conn.query(
      `INSERT INTO caracteristiques 
       (id_entite, identification, description_fr, description_en, description_ar, nature, utilite, date_lancement)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_entite,
        identification,
        description_fr,
        description_en,
        description_ar,
        nature,
        utilite,
        date_lancement
      ]
    );

    const id_carac = result.insertId;

    for (const el of elements) {
      await conn.query(
        `INSERT INTO caracteristiques_elements (id_carac, nom_element, type_element, options_element, valeur_default) VALUES (?, ?, ?, ?, ?)`,
        [id_carac, el.nom, el.type, el.options ? JSON.stringify(el.options) : null, el.defaultValue || null]
      );
    }
    for (const file of illustrations) {
      await conn.query(
        `INSERT INTO caracteristiques_illustrations (id_carac, filename, type, url) VALUES (?, ?, ?, ?)`,
        [id_carac, file.filename, file.type, file.url]
      );
    }
    await conn.end();
    res.json({ success: true, id_carac });

  } catch (err) {
    console.error('[POST /api/caracteristiques]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// UPDATE CARACTERISTIQUE
// =====================================================
app.put("/api/caracteristiques/:id", async (req, res) => {
  try {
    const id_carac = req.params.id;
    const { identification, description_fr, description_en, description_ar, nature, utilite, date_lancement, elements = [], illustrations = [] } = req.body;

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query(
      `UPDATE caracteristiques SET identification=?, description_fr=?, description_en=?, description_ar=?, nature=?, utilite=?, date_lancement=? WHERE id_carac=?`,
      [identification, description_fr, description_en, description_ar, nature, utilite, date_lancement, id_carac]
    );
    await conn.query("DELETE FROM caracteristiques_elements WHERE id_carac=?", [id_carac]);
    await conn.query("DELETE FROM caracteristiques_illustrations WHERE id_carac=?", [id_carac]);

    for (const el of elements) {
      await conn.query(
        `INSERT INTO caracteristiques_elements (id_carac, nom_element, type_element, options_element, valeur_default) VALUES (?, ?, ?, ?, ?)`,
        [id_carac, el.nom, el.type, el.options ? JSON.stringify(el.options) : null, el.defaultValue || null]
      );
    }
    for (const file of illustrations) {
      await conn.query(
        `INSERT INTO caracteristiques_illustrations (id_carac, filename, type, url) VALUES (?, ?, ?, ?)`,
        [id_carac, file.filename, file.type, file.url]
      );
    }
    await conn.end();
    res.json({ success: true });

  } catch (err) {
    console.error('[PUT /api/caracteristiques/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// DELETE CARACTERISTIQUE
// =====================================================
app.delete("/api/caracteristiques/:id", async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    await conn.query("DELETE FROM caracteristiques_elements WHERE id_carac=?", [req.params.id]);
    await conn.query("DELETE FROM caracteristiques_illustrations WHERE id_carac=?", [req.params.id]);
    await conn.query("DELETE FROM caracteristiques WHERE id_carac=?", [req.params.id]);
    await conn.end();
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// UPLOAD ROUTE
// =====================================================
app.post("/api/caracteristiques/upload", caracteristiqueUpload.single("file"), (req, res) => {
  try {
    const file = req.file;

    const type = file.mimetype.startsWith("video") ? "video" : "image";

    const url = `https://fp.codeonline-info.com/caracteristiques/images/${file.filename}`;

    res.json({
      success: true,
      filename: file.filename,
      type,
      url
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
// GED LOG FUNCTION â€” needed for tracking uploads, downloads, deletes, etc.
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
// GED LOGS (HISTORY) â€” French + real emails + folder names
// ============================================================
app.get('/api/ged/:id/logs', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID GED invalide' });

    const conn = await mysql.createConnection(dbConfig);

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
        } catch { }
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
        'UPLOAD': 'TÃ©lÃ©chargement',
        'DOWNLOAD': 'TÃ©lÃ©chargement',
        'VIEW': 'Visualisation',
        'SOFT_DELETE': 'Suppression (temporaire)',
        'HARD_DELETE': 'Suppression dÃ©finitive',
        'RESTORE': 'Restauration',
        'UPDATE_METADATA': 'Mise Ã  jour des mÃ©tadonnÃ©es',
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
    res.status(500).json({ error: 'Erreur lors de la rÃ©cupÃ©ration des logs', details: safeErrDetails(err) });
  }
});


// ============================================================
// GED LIST (pagination + folder + search + restricted by entite)
// ============================================================
// GED LIST (per-entity isolation â€” strict filtering)
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
      return res.status(400).json({ error: 'id_entite requis pour la requÃªte.' });
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

    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query(sql, params);
    await conn.end();

    res.json(rows);
  } catch (err) {
    console.error('GET /api/ged/list error:', err);
    res.status(500).json({
      error: 'Erreur lors de la rÃ©cupÃ©ration des fichiers',
      details: safeErrDetails(err)
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

    conn = await mysql.createConnection(dbConfig);
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
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error('POST /api/ged/upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED DOWNLOAD (forces download + log)
// ============================================================
app.get('/api/ged/:id/download', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.query;

    const conn = await mysql.createConnection(dbConfig);
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
    const logConn = await mysql.createConnection(dbConfig);
    await gedLog(logConn, id, 'DOWNLOAD', id_compte ? parseInt(id_compte) : null);
    await logConn.end();

    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('GED Download Error:', err);
    res.status(500).json({ error: 'Failed to download file', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED VIEW (inline preview)
// ============================================================
app.get('/api/ged/:id/view', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.query;

    const conn = await mysql.createConnection(dbConfig);
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
    const logConn = await mysql.createConnection(dbConfig);
    await gedLog(logConn, id, 'VIEW', id_compte ? parseInt(id_compte) : null);
    await logConn.end();

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (err) {
    console.error('GED View Error:', err);
    res.status(500).json({ error: 'Failed to preview file', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED SOFT DELETE
// ============================================================
app.delete('/api/ged/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query('SELECT * FROM ged_documents WHERE id_ged = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    const deleted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await conn.query('UPDATE ged_documents SET deleted_at = ?, modified_at = ? WHERE id_ged = ?', [deleted_at, deleted_at, id]);
    await gedLog(conn, id, 'SOFT_DELETE', id_compte ? parseInt(id_compte) : null);
    await conn.end();

    res.json({ message: 'File soft deleted' });
  } catch (err) {
    console.error('GED Soft Delete Error:', err);
    res.status(500).json({ error: 'Failed to soft delete', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED RESTORE
// ============================================================
app.post('/api/ged/:id/restore', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(dbConfig);
    await conn.query('UPDATE ged_documents SET deleted_at = NULL, modified_at = NOW() WHERE id_ged = ?', [id]);
    await gedLog(conn, id, 'RESTORE', id_compte ? parseInt(id_compte) : null);
    await conn.end();

    res.json({ message: 'File restored' });
  } catch (err) {
    console.error('GED Restore Error:', err);
    res.status(500).json({ error: 'Failed to restore file', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED HARD DELETE
// ============================================================
app.delete('/api/ged/:id/hard', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to hard delete file', details: safeErrDetails(err) });
  }
});

// ============================================================
// GED UPDATE METADATA
// ============================================================
app.put('/api/ged/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { category, tags, description, id_compte } = req.body;

    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to update metadata', details: safeErrDetails(err) });
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

    const conn = await mysql.createConnection(dbConfig);
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
    res.status(500).json({ error: 'Failed to fetch folders', details: safeErrDetails(err) });
  }
});

// ===== GED CREATE FOLDER =====
app.post('/api/ged/folders', async (req, res) => {
  try {
    const { name, parent_id = null, id_compte } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query(`INSERT INTO ged_folders (name,parent_id,uploaded_by,created_at) VALUES (?,?,?,?)`, [name, parent_id, id_compte, created_at]);
    await conn.end();
    res.status(201).json({ message: 'Folder created', id_folder: result.insertId });
  } catch (err) {
    console.error('GED Create Folder Error:', err);
    res.status(500).json({ error: 'Failed to create folder', details: safeErrDetails(err) });
  }
});

// ===== GED ADD FILE TO FOLDER =====
app.post('/api/ged/folders/:id/files', async (req, res) => {
  try {
    const id_folder = Number(req.params.id);
    const { id_ged } = req.body;

    const conn = await mysql.createConnection(dbConfig);
    await conn.query('INSERT IGNORE INTO ged_folder_files (id_folder,id_ged) VALUES (?,?)', [id_folder, id_ged]);
    await conn.end();
    res.json({ message: 'File added to folder' });
  } catch (err) {
    console.error('GED Add File Error:', err);
    res.status(500).json({ error: 'Failed to add file', details: safeErrDetails(err) });
  }
});

// ===== GED REMOVE FILE FROM FOLDER =====
app.delete('/api/ged/folders/:id/files/:ged_id', async (req, res) => {
  try {
    const id_folder = Number(req.params.id);
    const id_ged = Number(req.params.ged_id);

    const conn = await mysql.createConnection(dbConfig);
    await conn.query('DELETE FROM ged_folder_files WHERE id_folder=? AND id_ged=?', [id_folder, id_ged]);
    await conn.end();
    res.json({ message: 'File removed from folder' });
  } catch (err) {
    console.error('GED Remove File Error:', err);
    res.status(500).json({ error: 'Failed to remove file', details: safeErrDetails(err) });
  }
});

// ===== GED SOFT DELETE FOLDER =====
app.delete('/api/ged/folders/:id', async (req, res) => {
  try {
    const id_folder = Number(req.params.id);
    const { id_compte } = req.body;
    const deleted_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const conn = await mysql.createConnection(dbConfig);
    await conn.query('UPDATE ged_folders SET deleted_at=? WHERE id_folder=?', [deleted_at, id_folder]);
    await conn.end();
    res.json({ message: 'Folder soft deleted' });
  } catch (err) {
    console.error('GED Soft Delete Folder Error:', err);
    res.status(500).json({ error: 'Failed to soft delete folder', details: safeErrDetails(err) });
  }
});

// ===== GED RESTORE FOLDER =====
app.post('/api/ged/folders/:id/restore', async (req, res) => {
  try {
    const id_folder = Number(req.params.id);

    const conn = await mysql.createConnection(dbConfig);
    await conn.query('UPDATE ged_folders SET deleted_at=NULL WHERE id_folder=?', [id_folder]);
    await conn.end();
    res.json({ message: 'Folder restored' });
  } catch (err) {
    console.error('GED Restore Folder Error:', err);
    res.status(500).json({ error: 'Failed to restore folder', details: safeErrDetails(err) });
  }
});

// ===== GED HARD DELETE FOLDER =====
app.delete('/api/ged/folders/:id/hard', async (req, res) => {
  try {
    const id_folder = parseInt(req.params.id);
    const { id_compte } = req.body;

    const conn = await mysql.createConnection(dbConfig);
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
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error('GED Hard Delete Folder Error:', err);
    res.status(500).json({ error: 'Failed to hard delete folder', details: safeErrDetails(err) });
  }
});
//notifications 
// Get all notifications for a compte
// ? Notifications Endpoints (MySQL-compatible version)
app.get('/api/notifications', async (req, res) => {
  try {
    // Cache pour 30 secondes pour limiter la frÃ©quence d'appel
    res.set('Cache-Control', 'private, max-age=30');
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
    res.status(500).json({ error: 'Failed to fetch notifications', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to create notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to update notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to delete notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to clear notifications', details: safeErrDetails(err) });
  }
});

// ==================================================
// ðŸ“¢ FLASH NOTIFICATIONS (notifaction_flashmobile + notif_responses)
// ==================================================
// Tables already exist in production DB (created by dev2).
// We use the same table names but add PIN auth + mysql.createConnection pattern.

// GET all active notifs
app.get('/api/notifs', async (req, res) => {
  try {
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query('SELECT * FROM notifaction_flashmobile WHERE status = 1 ORDER BY date_notif DESC');
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/notifs error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// GET single notif
app.get('/api/notifs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid notification ID' });
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.query('SELECT * FROM notifaction_flashmobile WHERE id_notif = ?', [id]);
    await conn.end();
    if (rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/notifs/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// POST create notif
app.post('/api/notifs', async (req, res) => {
  try {
    const { titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en } = req.body;
    if (!titre_notif_ar || !texte_notif_ar || !titre_notif_fr || !texte_notif_fr || !titre_notif_en || !texte_notif_en) {
      return res.status(400).json({ error: 'All notification fields are required' });
    }
    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query(
      'INSERT INTO notifaction_flashmobile (titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en, date_notif, status) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)',
      [titre_notif_ar, texte_notif_ar, titre_notif_fr, texte_notif_fr, titre_notif_en, texte_notif_en]
    );
    const [newRow] = await conn.query('SELECT * FROM notifaction_flashmobile WHERE id_notif = ?', [result.insertId]);
    await conn.end();
    res.status(201).json(newRow[0]);
  } catch (err) {
    console.error('POST /api/notifs error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// PUT update notif (dynamic fields + date_m_notif)
app.put('/api/notifs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid notification ID' });
    const allowedFields = ['titre_notif_ar', 'texte_notif_ar', 'titre_notif_fr', 'texte_notif_fr', 'titre_notif_en', 'texte_notif_en', 'status'];
    const fields = [];
    const values = [];
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'At least one field must be provided for update' });
    fields.push('date_m_notif = NOW()');
    values.push(id);
    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query(`UPDATE notifaction_flashmobile SET ${fields.join(', ')} WHERE id_notif = ?`, values);
    await conn.end();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification updated' });
  } catch (err) {
    console.error('PUT /api/notifs/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// DELETE notif
app.delete('/api/notifs/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid notification ID' });
    const conn = await mysql.createConnection(dbConfig);
    await conn.query('DELETE FROM notif_responses WHERE id_notif = ?', [id]);
    const [result] = await conn.query('DELETE FROM notifaction_flashmobile WHERE id_notif = ?', [id]);
    await conn.end();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /api/notifs/:id error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// GET notif_responses (all or filtered by entite)
app.get('/api/notif_responses', async (req, res) => {
  try {
    const { entite } = req.query;
    const conn = await mysql.createConnection(dbConfig);
    let rows;
    if (entite) {
      [rows] = await conn.query(
        'SELECT * FROM notif_responses WHERE id_entite = ? ORDER BY date_response DESC',
        [Number(entite)]
      );
    } else {
      [rows] = await conn.query(
        'SELECT nr.*, e.raison_socialle FROM notif_responses nr LEFT JOIN Entite e ON nr.id_entite = e.id_entite ORDER BY nr.date_response DESC'
      );
    }
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/notif_responses error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// POST notif_response (upsert: one response per entite per notif)
app.post('/api/notif_responses', async (req, res) => {
  try {
    const { id_notif, id_entite, response } = req.body;
    if (!id_notif || !id_entite || !response || !['interesse', 'participe'].includes(response)) {
      return res.status(400).json({ error: 'id_notif, id_entite required, and response must be "interesse" or "participe"' });
    }
    const conn = await mysql.createConnection(dbConfig);
    await conn.query(
      'INSERT INTO notif_responses (id_notif, id_entite, response, date_response) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE response = VALUES(response), date_response = NOW()',
      [id_notif, id_entite, response]
    );
    await conn.end();
    res.status(201).json({ message: 'Response recorded' });
  } catch (err) {
    console.error('POST /api/notif_responses error:', err);
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
  }
});

// api login + comptes 

app.get('/api/comptes', async (req, res) => {
  try {
    // Check PIN header
    const conn = await mysql.createConnection(dbConfig);

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
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
  }
});

// ? GET single compte
app.get('/api/comptes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(dbConfig);

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
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
  }
});

// ? GET account permissions (new endpoint for frontend)
app.get("/api/account-permissions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(dbConfig);

    const [accountRows] = await conn.query("SELECT profile_id FROM comptes WHERE id_compte = ?", [id]);
    if (accountRows.length === 0) {
      await conn.end();
      return res.status(404).json({ error: "Compte not found" });
    }

    const profileId = accountRows[0].profile_id;

    const sql = `
      SELECT 
        ap.page_id, ap.can_read AS \`read\`, ap.can_write AS \`write\`, ap.is_hidden AS hide,
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
    res.status(500).json({ error: "Failed to fetch permissions", details: safeErrDetails(err) });
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

    conn = await mysql.createConnection(dbConfig);
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
        from: getFromEmail(),
        to: email,
        subject: 'Nouveau compte crÃ©Ã©',
        text: `Votre compte a Ã©tÃ© crÃ©Ã©.\nEmail: ${email}\nMot de passe: ${password}\nCerticode: ${certicode || 'N/A'}\nLien: https://edi-dev.codeonline-info.com/`
      });
    } catch (mailErr) {
      console.error('Email send error:', mailErr.message);
    }

    res.status(201).json({ id_compte: newId, email, password });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error('POST /api/comptes error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
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

    conn = await mysql.createConnection(dbConfig);
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

    res.json({ message: 'Compte mis Ã  jour avec succÃ¨s', id_compte: id });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error('PUT /api/comptes/:id error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
  }
});

// ? Suspend / Reactivate compte
app.patch('/api/comptes/:id_compte/suspend', async (req, res) => {
  const { id_compte } = req.params;
  const { is_suspended } = req.body;

  try {
    const conn = await mysql.createConnection(dbConfig);
    const [result] = await conn.query('UPDATE comptes SET is_suspended = ? WHERE id_compte = ?', [is_suspended, id_compte]);
    await conn.end();

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ id_compte, is_suspended });
  } catch (err) {
    console.error('PATCH /api/comptes/:id_compte/suspend error:', err);
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
  }
});

// ? DELETE compte
app.delete('/api/comptes/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await mysql.createConnection(dbConfig);
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
      await conn.rollback().catch(() => { });
      await conn.end().catch(() => { });
    }
    console.error("? DELETE /api/comptes/:id error:", err);
    res.status(500).json({ error: "Failed to delete compte", details: safeErrDetails(err) });
  }
});

// ? Current user
app.get('/api/current-user/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const conn = await mysql.createConnection(dbConfig);

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
    res.status(500).json({ error: 'Erreur interne du serveur', details: safeErrDetails(err) });
  }
});

// Login endpoint - CERTICODE DISABLED
app.post('/api/login', async (req, res) => {
  if (!entiteDB) {
    console.error('Login failed: entiteDB unavailable');
    return res.status(503).json({ error: 'Database unavailable - try again later' });
  }

  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Fetch account
    const accounts = await queryDB(entiteDB, `
      SELECT c.id_compte, c.email, c.password, c.role, c.profile_id,
             c.is_suspended, c.created_at, p.id_entite,
             c.prenom, c.name AS nom,
             c.certicode, c.certicode_generated_at,
             p.raison_socialle AS producer_name,
             p.gln
      FROM comptes c
      LEFT JOIN Entite p ON c.id_entite = p.id_entite
      WHERE c.email = ?
    `, [email]);

    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const account = accounts[0];

    // Debug: Log GLN retrieval
    console.log('LOGIN DEBUG - User:', email);
    console.log('LOGIN DEBUG - id_entite:', account.id_entite);
    console.log('LOGIN DEBUG - GLN récupéré:', account.gln);
    console.log('LOGIN DEBUG - Producer name:', account.producer_name);

    // Verify password
    if (password) {
      const passwordMatch = await bcrypt.compare(password, account.password);

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else {
      return res.status(400).json({ error: 'Password required' });
    }

    // Suspended account
    if (account.is_suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    // CERTICODE BYPASSED
    console.log('CERTICODE BYPASSED - Direct login:', email);

    // Fetch permissions
    const permissions = await queryDB(entiteDB, `
      SELECT ap.page_id, ap.can_read, ap.can_write, ap.is_hidden
      FROM autorisation_profile_page ap
      WHERE ap.id_profile = ?
    `, [account.profile_id || account.id_compte]);

    const tokenPayload = {
      id_compte: account.id_compte,
      email: account.email,
      id_entite: account.id_entite,
      profile_id: account.profile_id,
      role: account.role,
      gln: account.gln || ''
    };

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
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
      id_entite: account.id_entite,
      gln: account.gln || ''
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      error: 'Login failed',
      details: safeErrDetails(err)
    });
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
    res.status(500).json({ error: 'Failed to fetch notifications', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to fetch notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to add notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to update notification', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to fetch responses', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to add response', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to delete notification', details: safeErrDetails(err) });
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
        from: getFromEmail(),
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
    res.status(500).json({ error: 'Failed to update profile', details: safeErrDetails(err) });
  }
});



// Logout endpoint
app.post('/api/logout', async (req, res) => {
  try {
    res.clearCookie('session', { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', { error: err.message });
    res.status(500).json({ error: 'Failed to logout', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to fetch producer', details: safeErrDetails(err) });
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

app.post('/api/reset-password-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'Email is required'
    });
  }

  let conn;

  try {
    conn = await mysql.createConnection(dbConfig);

    const [rows] = await conn.query(
      'SELECT * FROM comptes WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      await conn.end();

      return res.status(404).json({
        error: 'Compte introuvable'
      });
    }

    const account = rows[0];

    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';

    let newPassword = '';

    for (let i = 0; i < 10; i++) {
      newPassword += chars.charAt(
        Math.floor(Math.random() * chars.length)
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await conn.query(
      'UPDATE comptes SET password = ? WHERE id_compte = ?',
      [hashed, account.id_compte]
    );

    await transporter.sendMail({
      from: getFromEmail(),
      to: email,
      subject: 'Réinitialisation du mot de passe',
      text: `
Bonjour ${account.prenom || ''},

Votre mot de passe a été réinitialisé.

Nouveau mot de passe :
${newPassword}

Cordialement,
Le support CodeOnline
      `
    });

    await conn.end();

    res.json({
      message: 'Mot de passe envoyé par email'
    });

  } catch (err) {
    console.error(err);

    if (conn) {
      await conn.end().catch(() => {});
    }

    res.status(500).json({
      error: err.message
    });
  }
});
// ? FINAL FIXED ENDPOINT: Send connection info PDF (MySQL + frontend match)
app.post('/api/send-connection-info', async (req, res) => {
  console.log('?? /api/send-connection-info body:', req.body);
  const { email, password } = req.body;
  console.log('?? email received:', email);

  if (!email) return res.status(400).json({ error: 'Email is required' });
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
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

    const pdfUint8 = await generateFichePDF(account, company, newPassword);
    const pdfBuffer = Buffer.from(pdfUint8); // Convert Uint8Array ? Buffer for nodemailer
    console.log('?? PDF generated successfully, size:', pdfBuffer.length);

    await transporter.sendMail({
      from: getFromEmail(),
      to: email,
      subject: 'Vos informations de connexion',
      text: `Bonjour ${account.prenom || ''},\n\nVeuillez trouver ci-joint votre fiche de connexion.\n\nCordialement,\nLe support CodeOnline.`,
      attachments: [
        { filename: 'fiche_connexion.pdf', content: pdfBuffer, contentType: 'application/pdf' }
      ]
    });
    console.log('? Email sent to', email);

    await conn.end();
    const pdfBase64 = pdfBuffer.toString('base64');
    res.json({ message: 'Fiche connexion envoyée avec succès', email, pdfBase64 });
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
    res.status(500).json({ error: 'Failed to check model', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to fetch model JSON', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to generate model template', details: safeErrDetails(err) });
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
    res.status(500).json({ error: 'Failed to save model', details: safeErrDetails(err) });
  }
});
// Fetch permissions for a specific account (id_compte)

app.get("/api/account-permissions/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id_compte" });

  try {
    const conn = await mysql.createConnection(dbConfig);

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
      details: safeErrDetails(err),
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
    res.status(500).json({ error: 'Failed to fetch delegations', details: safeErrDetails(err) });
  }
});
// Close database connections on shutdown
process.on('SIGINT', () => {
  console.log('Closing database connections...');
  const dbs = [
    { db: entiteDB, name: 'fieldrules.db' },
    { db: entiteDB, name: 'allgpc.db' },
    { db: entiteDB, name: 'users.db' },
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

// Mount Settings routes FIRST (for global configuration parameters)
app.use('/api/settings', settingsRoutes);

// Initialize EDI Worker
let ediWorker = null;

// Mount EDI Worker routes
app.use('/api/edi-worker', ediWorkerRouter);

// Mount the main router for CRUD operations (Orders, Transport, Shipments, Invoices, Tracking)
app.use('/api', router);

// Mount API Proxy routes (centralized proxy for all API calls)
app.use('/api', apiProxyRoutes);

// Start server


// ============================================================================
// DEV2 ROUTES - Integrated from UpdateDevelopper2
// ============================================================================


// Fetch delegation (from Region_national)
app.get('/api/delegation', async (req, res) => {
  const { region } = req.query;

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    let sql = `
      SELECT DISTINCT delegation
      FROM Region_national
      WHERE delegation IS NOT NULL
    `;
    const params = [];

    if (region && region !== 'all') {
      sql += ' AND gouvernorat = ?';
      params.push(decodeURIComponent(region));
    }

    sql += ' ORDER BY delegation ASC';

    const [rows] = await conn.query(sql, params);
    await conn.end();

    res.json(rows.map(r => ({ delegation: r.delegation })));
  } catch (err) {
    console.error('Error fetching delegation:', err);
    res.status(500).json({
      error: 'Failed to fetch delegation',
      details: safeErrDetails(err)
    });
  }
});



// Fetch localites by delegation + code postal
app.get('/api/localite', async (req, res) => {
  const { delegation } = req.query;

  if (!delegation) {
    return res.status(400).json({ error: 'delegation is required' });
  }

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const sql = `
      SELECT DISTINCT localite, code_postal
      FROM Region_national
      WHERE delegation = ?
        AND localite IS NOT NULL
      ORDER BY localite ASC
    `;

    const [rows] = await conn.query(sql, [decodeURIComponent(delegation)]);
    await conn.end();

    res.json(
      rows.map(r => ({
        localite: r.localite,
        code_postal: r.code_postal,
      }))
    );
  } catch (err) {
    console.error('Error fetching localites:', err);
    res.status(500).json({
      error: 'Failed to fetch localites',
      details: safeErrDetails(err),
    });
  }
});

// OPTIONAL Ã¢â‚¬â€œ fetch everything (not required)
app.get('/api/region-national', async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(`
      SELECT gouvernorat, delegation, localite, code_postal
      FROM Region_national
      WHERE gouvernorat IS NOT NULL
        AND delegation IS NOT NULL
        AND localite IS NOT NULL
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADD THESE ENDPOINTS TO YOUR server.js
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// GET /api/models/by-brick/:brickCode
// Load all models where rayon_code = brickCode (since rayon_code = brick code in your DB)
app.get('/api/models/by-brick/:brickCode', async (req, res) => {
  try {
    const { brickCode } = req.params;

    // Query models table where rayon_code matches the brick code
    const query = 'SELECT rayon_code, model_json, libelle, created_at, updated_at, is_complete FROM `models` WHERE rayon_code = ?';
    
    const results = await new Promise((resolve, reject) => {
      connection.query(query, [brickCode], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Return empty array if no models found (don't error)
    res.json(results || []);
  } catch (error) {
    console.error('Error fetching models by brick:', error);
    res.status(500).json({ 
      error: 'Failed to fetch models',
      message: error.message 
    });
  }
});


// GET /api/models/exists?codes=code1,code2,code3
// Check which bricks/rayons have models
app.get('/api/models/exists', async (req, res) => {
  try {
    const { codes } = req.query;
    
    if (!codes) {
      return res.json({});
    }

    const codeArray = codes.split(',');
    const placeholders = codeArray.map(() => '?').join(',');
    
    const query = `
      SELECT DISTINCT rayon_code 
      FROM \`models\` 
      WHERE rayon_code IN (${placeholders})
    `;

    const results = await new Promise((resolve, reject) => {
      connection.query(query, codeArray, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Transform to object with boolean values
    const existsMap = {};
    codeArray.forEach(code => {
      existsMap[code] = results.some(r => r.rayon_code === code);
    });

    res.json(existsMap);
  } catch (error) {
    console.error('Error checking model existence:', error);
    res.status(500).json({ 
      error: 'Failed to check model existence',
      message: error.message 
    });
  }
});


// POST /api/models/save
// Save or update a model for a brick/rayon
app.post('/api/models/save', async (req, res) => {
  try {
    const { rayonCode, modelJson, libelle, isComplete } = req.body;

    if (!rayonCode || !modelJson) {
      return res.status(400).json({ error: 'rayon_code and modelJson are required' });
    }

    // Check if model exists
    const checkQuery = 'SELECT rayon_code FROM `models` WHERE rayon_code = ?';
    const existing = await new Promise((resolve, reject) => {
      connection.query(checkQuery, [rayonCode], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const now = new Date();

    if (existing && existing.length > 0) {
      // UPDATE
      const updateQuery = `
        UPDATE \`models\` 
        SET model_json = ?, libelle = ?, is_complete = ?, updated_at = ?
        WHERE rayon_code = ?
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery,
          [
            JSON.stringify(modelJson),
            libelle || '',
            isComplete ? 1 : 0,
            now,
            rayonCode
          ],
          (err) => {
            if (err) reject(err);
            else resolve(null);
          }
        );
      });

      res.json({ 
        success: true, 
        message: 'Model updated successfully',
        rayon_code: rayonCode 
      });
    } else {
      // INSERT
      const insertQuery = `
        INSERT INTO \`models\` (rayon_code, model_json, libelle, is_complete, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await new Promise((resolve, reject) => {
        connection.query(
          insertQuery,
          [
            rayonCode,
            JSON.stringify(modelJson),
            libelle || '',
            isComplete ? 1 : 0,
            now,
            now
          ],
          (err) => {
            if (err) reject(err);
            else resolve(null);
          }
        );
      });

      res.json({ 
        success: true, 
        message: 'Model created successfully',
        rayon_code: rayonCode 
      });
    }
  } catch (error) {
    console.error('Error saving model:', error);
    res.status(500).json({ 
      error: 'Failed to save model',
      message: error.message 
    });
  }
});


// DELETE /api/models/:rayonCode
// Delete a model
app.delete('/api/models/:rayonCode', async (req, res) => {
  try {
    const { rayonCode } = req.params;

    const deleteQuery = 'DELETE FROM `models` WHERE rayon_code = ?';
    
    await new Promise((resolve, reject) => {
      connection.query(deleteQuery, [rayonCode], (err) => {
        if (err) reject(err);
        else resolve(null);
      });
    });

    res.json({ 
      success: true, 
      message: 'Model deleted successfully',
      rayon_code: rayonCode 
    });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ 
      error: 'Failed to delete model',
      message: error.message 
    });
  }
});


app.get('/api/sites/:id_entite', async (req, res) => {
  if (!checkPin(req, res)) return;
  const id_entite = Number(req.params.id_entite);
  if (isNaN(id_entite)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT * FROM Site WHERE id_entite = ? ORDER BY principal DESC, id_site ASC', [id_entite]);
    await conn.end();
    res.json(rows.map(r => ({ ...r, principal: Number(r.principal) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.put('/api/sites/:id_site', async (req, res) => {
  if (!checkPin(req, res)) return;

  const id_site = Number(req.params.id_site);
  if (isNaN(id_site)) {
    return res.status(400).json({ error: 'Invalid site ID' });
  }

  try {
    const site = normalizeSitePayload(req.body);

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [result] = await conn.query(
      `UPDATE Site SET
        nom_site = ?,
        gln = ?,
        adresse = ?,
        region = ?,
        delegation = ?,
        localite = ?,
        code_postal = ?,
        principal = ?
      WHERE id_site = ?`,
      [
        site.nom_site,
        site.gln,
        site.adresse,
        site.region,
        site.delegation,
        site.localite,
        site.code_postal,
        site.principal,
        id_site,
      ]
    );

    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Site not found' });
    }

    res.json({ message: 'Updated successfully' });

  } catch (err) {
    console.error('UPDATE SITE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});


app.delete('/api/sites/:id_site', async (req, res) => {
  if (!checkPin(req, res)) return;
  const id_site = Number(req.params.id_site);
  if (isNaN(id_site)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [result] = await conn.query('DELETE FROM Site WHERE id_site = ?', [id_site]);
    await conn.end();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.put('/api/sites/:id_entite/set-primary/:id_site', async (req, res) => {
  if (!checkPin(req, res)) return;
  const id_entite = Number(req.params.id_entite);
  const id_site = Number(req.params.id_site);
  if (isNaN(id_entite) || isNaN(id_site)) return res.status(400).json({ error: 'Invalid IDs' });

  const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
  let transaction;
  try {
    transaction = await conn.beginTransaction();
    await conn.query('UPDATE site SET principal = 0 WHERE id_entite = ?', [id_entite]);
    const [result] = await conn.query('UPDATE site SET principal = 1 WHERE id_site = ? AND id_entite = ?', [id_site, id_entite]);
    await conn.commit();
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Primary set successfully' });
  } catch (err) {
    if (transaction) await conn.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    await conn.end();
  }
});


app.post('/api/create-supervisor-profile', async (req, res) => {
  if (!checkPin(req, res)) return;
  const { id_entite, raison_socialle } = req.body;
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    // Example: Insert into a 'supervisors' table - adjust schema
    await conn.query('INSERT INTO supervisors (id_entite, name) VALUES (?, ?)', [id_entite, raison_socialle]);
    await conn.end();
    res.json({ message: 'Supervisor profile created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/send-connection', async (req, res) => {
  if (!checkPin(req, res)) return;
  const { email } = req.body;
  try {
    // Implement email sending (e.g., with nodemailer)
    console.log(`Sending connection details to ${email}`);
    res.json({ message: 'Connection sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/supervisor-profiles/exists', async (req, res) => {
  if (!checkPin(req, res)) return;
  const { companyIds } = req.body;
  if (!Array.isArray(companyIds)) return res.status(400).json({ error: 'Invalid input' });

  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query(
      'SELECT id_entite FROM supervisors WHERE id_entite IN (?)',
      [companyIds]
    );
    await conn.end();
    const exists = {};
    companyIds.forEach(id => exists[id] = false);
    rows.forEach(r => exists[r.id_entite] = true);
    res.json(exists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: 'Server error', details: safeErrDetails(err) });
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
       VALUES (?, ?, ?, 0, NOW())`,
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
      details: safeErrDetails(err),
    });
  }
});


// ============================================================================
// NEW ENDPOINT: Get ONLY products for one specific entite/company
// Usage: GET /api/entite-products?id=34
//        â†’ Returns flat array of products [ {id, libelle, gtin, ...}, ... ]
//        â†’ No pagination, no search, no admin override â€” simple & fast
// ============================================================================
app.get("/api/entite-products", async (req, res) => {
  try {
    if (!entiteDB) {
      return res.status(503).json({ error: "Database connection unavailable" });
    }

    const { id } = req.query;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: "Valid 'id' (entite ID) is required" });
    }

    const entiteId = Number(id);

    const sql = `
      SELECT 
        id, brand, subBrand, description, gtin, libelle, short_libelle,
        countryOfOrigin, idEntreprise, images, nb_images, prix_min, prix_max,
        code_cader, codeClasse, codebrique, date_mis_a_jour_fp,
        tradeItemSynchronisationDates, date_create_fp, activ_prix, status, done_new
      FROM fiche_produit
      WHERE idEntreprise = ?
      ORDER BY libelle ASC;
    `;

    const products = await queryDB(entiteDB, sql, [entiteId]);

    console.log(`[entite-products] Fetched ${products.length} products for entite ID ${entiteId}`);

    res.json(products);  // flat array â€” easy for frontend Autocomplete
  } catch (err) {
    console.error("[/api/entite-products] Error:", err);
    res.status(500).json({ 
      error: "Failed to fetch entite products", 
      details: safeErrDetails(err) 
    });
  }
});


// GET /api/rayongpc - Get rayons by brick code
app.get('/api/rayongpc', async (req, res) => {
  try {
    const { brick_code } = req.query;

    if (!brick_code) {
      return res.status(400).json({ error: 'brick_code required' });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);

    const [rows] = await conn.query(`
      SELECT 
        rayon_code,
        rayon_libelle,
        brick_code
      FROM rayongpc
      WHERE brick_code = ?
      ORDER BY rayon_code ASC
    `, [brick_code]);

    await conn.end();
    res.json(rows || []);

  } catch (err) {
    console.error('GET /api/rayongpc error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// âœ¨ SIMPLE IMPORT FOR BASIC TEMPLATE (NEW - Use this one!)
// ============================================================================
app.post("/api/products/import-simple", multer().single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const ws = workbook.worksheets[0]; // Get first sheet
    if (!ws) return res.status(400).json({ error: "No worksheet found" });

    // Row 1 = section titles, Row 2 = field names, Row 3+ = data
    const headerRow = ws.getRow(2);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      headers[colNum - 1] = String(cell.value || "").trim();
    });

    console.log("Headers:", headers);

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    let inserted = 0;
    let failed = 0;
    const anomalies = [];

    // Process data rows starting from row 3
    for (let rowNum = 3; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);
      const rowData = {};
      let hasData = false;

      // Get cell values
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const header = headers[colNum - 1];
        if (header && cell.value !== null && cell.value !== undefined) {
          rowData[header] = String(cell.value).trim();
          if (rowData[header]) hasData = true;
        }
      });

      if (!hasData) continue; // Skip empty rows

      // Validate mandatory fields
      const brand = rowData['brand'];
      const libelle = rowData['libelle'];
      const codebrique = rowData['codebrique'];

      if (!brand || !libelle || !codebrique) {
        failed++;
        anomalies.push({
          rowNumber: rowNum - 2,
          brand: brand || 'N/A',
          libelle: libelle || 'N/A',
          errors: [
            !brand ? 'Brand obligatoire' : '',
            !libelle ? 'Libelle obligatoire' : '',
            !codebrique ? 'Codebrique obligatoire' : ''
          ].filter(e => e),
          warnings: []
        });
        continue;
      }

      try {
        // Build extra fields from non-base fields
        const extraFields = {};
        const baseFieldsSet = new Set(['brand', 'subBrand', 'description', 'gtin', 'libelle', 'short_libelle', 'countryOfOrigin', 'prix_min', 'prix_max', 'code_cader', 'codeClasse', 'codebrique', 'activ_prix']);

        for (const [key, value] of Object.entries(rowData)) {
          if (!baseFieldsSet.has(key) && value) {
            // Determine section and add to extra_fields
            let section = null;
            for (const [sec, data] of Object.entries(CATALOG_SECTIONS)) {
              if (data.fields.includes(key)) {
                section = sec;
                break;
              }
            }
            if (section) {
              if (!extraFields[section]) extraFields[section] = {};
              extraFields[section][key] = value;
            }
          }
        }

        const insertData = {
          brand: brand || '',
          subBrand: rowData['subBrand'] || '',
          description: rowData['description'] || '',
          gtin: rowData['gtin'] || '',
          libelle: libelle || '',
          short_libelle: rowData['short_libelle'] || '',
          countryOfOrigin: rowData['countryOfOrigin'] || '',
          idEntreprise: 1, // Default enterprise
          images: '',
          nb_images: 0,
          prix_min: Number(rowData['prix_min']) || 0,
          prix_max: Number(rowData['prix_max']) || 0,
          code_cader: rowData['code_cader'] || '',
          codeClasse: Number(rowData['codeClasse']) || 0,
          codebrique: codebrique || '',
          date_mis_a_jour_fp: now,
          date_create_fp: now,
          activ_prix: Number(rowData['activ_prix']) || 0,
          status: 0,
          done_new: 0,
          extra_fields: Object.keys(extraFields).length > 0 ? JSON.stringify(extraFields) : JSON.stringify({})
        };

        await conn.query("INSERT INTO fiche_produit SET ?", insertData);
        inserted++;
        console.log(`âœ… Row ${rowNum - 2} inserted: ${libelle}`);

      } catch (err) {
        failed++;
        console.error(`âŒ Row ${rowNum - 2} error:`, err.message);
        anomalies.push({
          rowNumber: rowNum - 2,
          brand: brand || 'N/A',
          libelle: libelle || 'N/A',
          errors: [err.message.slice(0, 100)],
          warnings: []
        });
      }
    }

    await conn.end();

    // Generate anomalies report if needed
    let anomaliesFile = null;
    if (anomalies.length > 0) {
      const aWb = new ExcelJS.Workbook();
      const aWs = aWb.addWorksheet('Anomalies');
      
      const aHeaders = ['Ligne', 'Brand', 'Libelle', 'Erreurs'];
      aWs.columns = aHeaders.map((h) => ({ header: h, width: 30 }));
      
      const aHeaderRow = aWs.getRow(1);
      aHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCC0000' }
      };
      aHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      for (const anomaly of anomalies) {
        aWs.addRow([
          anomaly.rowNumber,
          anomaly.brand,
          anomaly.libelle,
          anomaly.errors?.join('; ') || 'N/A'
        ]);
      }

      const buffer = await aWb.xlsx.writeBuffer();
      anomaliesFile = `anomalies-${Date.now()}.xlsx`;
      const anomaliesPath = path.join(GED_DIR, anomaliesFile);
      fs.writeFileSync(anomaliesPath, buffer);
    }

    res.json({
      success: true,
      total: inserted + failed,
      inserted,
      failed,
      anomalies: anomalies,
      anomaliesFile: anomaliesFile ? `/api/download-anomalies/${anomaliesFile}` : null,
      message: `âœ… ${inserted}/${inserted + failed} produit(s) importÃ©(s) avec succÃ¨s`
    });

  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Import failed", details: safeErrDetails(err) });
  }
});


// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Manual export endpoint (for testing or on-demand)
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
app.post("/api/products/:id/export-xml", async (req, res) => {
  try {
    const productId = Number(req.params.id);

    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: "ID produit invalide" });
    }

    const result = await exportProduitXML(productId);

    res.json({
      success: true,
      message: "Export XML terminÃƒÂ© avec succÃƒÂ¨s",
      directory: `/var/www/produits/${result.entite}/${result.gtin}`,
      file: `${result.gtin}.xml`,
      size: result.size || 0
    });
  } catch (err) {
    console.error("[EXPORT-XML-ENDPOINT] Error", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Ãƒâ€°chec de l'export XML"
    });
  }
});

/**
 * GET /api/tarification
 * List tarifications by fiche produit (with filters)
 * ?fiche_produit_id=123&type_tarif=VENTE&statut=ACTIF
 */
app.get("/api/tarification", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database connection unavailable" });

    const {
      fiche_produit_id,
      type_tarif,
      statut,
      sortBy = "created_at",
      sortDir = "DESC"
    } = req.query;

    if (!fiche_produit_id)
      return res.status(400).json({ error: "fiche_produit_id required" });

    const allowedSortKeys = [
      "id_tarification",
      "libelle_tarif",
      "type_tarif",
      "statut",
      "created_at",
      "updated_at"
    ];

    const safeSortBy = allowedSortKeys.includes(sortBy)
      ? sortBy
      : "created_at";

    const safeSortDir =
      String(sortDir).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const where = ["id_fiche_produit = ?"];
    const params = [Number(fiche_produit_id)];

    if (type_tarif) {
      where.push("type_tarif = ?");
      params.push(type_tarif);
    }

    if (statut) {
      where.push("statut = ?");
      params.push(statut);
    }

    const sql = `
      SELECT *
      FROM tarification
      WHERE ${where.join(" AND ")}
      ORDER BY ${safeSortBy} ${safeSortDir}
    `;

    const rows = await queryDB(entiteDB, sql, params);

    // ? PARSE JSON DATA
    rows.forEach(r => {
      r.data = JSON.parse(r.data || "{}");
    });

    res.json(rows);
  } catch (err) {
    console.error("GET /api/tarification error:", err);
    res.status(500).json({
      error: "Failed to fetch tarifications",
      details: safeErrDetails(err)
    });
  }
});


/**
 * GET /api/tarification/:id
 * Get single tarification (edit view)
 */
app.get("/api/tarification/:id", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const { id } = req.params;

    const rows = await queryDB(
      entiteDB,
      "SELECT * FROM tarification WHERE id_tarification = ?",
      [id]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Tarification not found" });

    const row = rows[0];
    row.data = JSON.parse(row.data || "{}");

    res.json(row);
  } catch (err) {
    console.error("GET /api/tarification/:id error:", err);
    res.status(500).json({ error: "Failed to fetch tarification" });
  }
});


/**
 * POST /api/tarification
 * Create tarification
 */
app.post("/api/tarification", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const {
      id_fiche_produit,
      code_tarif,
      libelle_tarif,
      type_tarif,
      statut,
      data
    } = req.body;

    if (!id_fiche_produit || !libelle_tarif || !type_tarif || !data) {
      return res.status(400).json({
        error:
          "Required fields: id_fiche_produit, libelle_tarif, type_tarif, data"
      });
    }

    const allowedStatuts = ["BROUILLON", "ACTIF", "ARCHIVE"];
    if (statut && !allowedStatuts.includes(statut)) {
      return res.status(400).json({ error: "Invalid statut" });
    }

    const sql = `
      INSERT INTO tarification
      (id_fiche_produit, code_tarif, libelle_tarif, type_tarif, statut, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      Number(id_fiche_produit),
      code_tarif || null,
      libelle_tarif,
      type_tarif,
      statut || "ACTIF",
      JSON.stringify(data)
    ];

    const result = await runUpdate(entiteDB, sql, params);

    res.json({
      id_tarification: result.lastID,
      id_fiche_produit: Number(id_fiche_produit),
      code_tarif,
      libelle_tarif,
      type_tarif,
      statut: statut || "ACTIF",
      data
    });
  } catch (err) {
    console.error("POST /api/tarification error:", err);
    res.status(500).json({
      error: "Failed to create tarification",
      details: safeErrDetails(err)
    });
  }
});


/**
 * PUT /api/tarification/:id
 * Update tarification
 */
app.put("/api/tarification/:id", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const { id } = req.params;

    const existing = await queryDB(
      entiteDB,
      "SELECT * FROM tarification WHERE id_tarification = ?",
      [id]
    );

    if (!existing.length)
      return res.status(404).json({ error: "Tarification not found" });

    const fields = [];
    const params = [];
    const forbidden = ["id_tarification", "created_at"];

    Object.entries(req.body).forEach(([key, value]) => {
      if (forbidden.includes(key)) return;

      if (key === "data") {
        fields.push("data = ?");
        params.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (!fields.length)
      return res.status(400).json({ error: "No fields to update" });

    params.push(id);

    const sql = `
      UPDATE tarification
      SET ${fields.join(", ")}
      WHERE id_tarification = ?
    `;

    await runUpdate(entiteDB, sql, params);

    res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/tarification/:id error:", err);
    res.status(500).json({
      error: "Failed to update tarification",
      details: safeErrDetails(err)
    });
  }
});


/**
 * DELETE /api/tarification/:id
 * Delete tarification
 */
app.delete("/api/tarification/:id", async (req, res) => {
  try {
    if (!entiteDB)
      return res.status(503).json({ error: "Database unavailable" });

    const { id } = req.params;

    const result = await runUpdate(
      entiteDB,
      "DELETE FROM tarification WHERE id_tarification = ?",
      [id]
    );

    if (result.changes === 0)
      return res.status(404).json({ error: "Tarification not found" });

    res.json({ message: "Tarification deleted" });
  } catch (err) {
    console.error("DELETE /api/tarification/:id error:", err);
    res.status(500).json({
      error: "Failed to delete tarification",
      details: safeErrDetails(err)
    });
  }
});






// -----------------------------------------------------------------------------
// SINGLE BRICK: GET /api/generate-smart-model?rayonCode=XXXXX
// -----------------------------------------------------------------------------
app.get('/api/generate-smart-model', async (req, res) => {
  const { rayonCode } = req.query;
  if (!rayonCode) return res.status(400).json({ error: 'rayonCode requis' });
  try {
    const rows = await queryDB(entiteDB,
      `SELECT b.codeBrique, b.libelleBrique, b.libelleBrique_en,
              c.libelleClasse, c.libelleClasse_en,
              f.libelleFamille, f.libelleFamille_en,
              s.libelleSegment, s.libelleSegment_e AS libelleSegment_en
       FROM brickgpc b
       LEFT JOIN classegpc c ON b.codeClasse = c.codeClasse
       LEFT JOIN famillegpc f ON c.codeFamille = f.codeFamille
       LEFT JOIN segmentgpc s ON f.codeSegment = s.codeSegment
       WHERE b.codeBrique = ?`, [rayonCode]
    );
    if (!rows.length) return res.status(404).json({ error: 'Brick introuvable' });
    const modelData = await generateModelForBrick(rows[0]);
    res.json(modelData);
  } catch (err) {
    console.error('generate-smart-model error:', err);
    res.status(500).json({ error: 'Ã‰chec gÃ©nÃ©ration IA', details: safeErrDetails(err) });
  }
});


// -----------------------------------------------------------------------------
// BULK GENERATE: GET /api/generate-all-models
// Streams Server-Sent Events: progress updates + results in real-time
// Query params: segmentCode, familleCode, classeCode (all optional â€” filter scope)
// overwrite=true to regenerate even existing models
// -----------------------------------------------------------------------------
app.get('/api/generate-all-models', async (req, res) => {
  const { segmentCode, familleCode, classeCode, overwrite } = req.query;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Build query to get all bricks in scope with full hierarchy
    let sql = `
      SELECT b.codeBrique, b.libelleBrique, b.libelleBrique_en,
             c.libelleClasse, c.libelleClasse_en,
             f.libelleFamille, f.libelleFamille_en,
             s.libelleSegment, s.libelleSegment_e AS libelleSegment_en,
             s.codeSegment, f.codeFamille, c.codeClasse
      FROM brickgpc b
      LEFT JOIN classegpc c ON b.codeClasse = c.codeClasse
      LEFT JOIN famillegpc f ON c.codeFamille = f.codeFamille
      LEFT JOIN segmentgpc s ON f.codeSegment = s.codeSegment
      WHERE b.status_br = 1
    `;
    const params = [];
    if (classeCode)   { sql += ' AND c.codeClasse = ?';    params.push(classeCode); }
    else if (familleCode) { sql += ' AND f.codeFamille = ?'; params.push(familleCode); }
    else if (segmentCode) { sql += ' AND s.codeSegment = ?'; params.push(segmentCode); }
    sql += ' ORDER BY s.codeSegment, f.codeFamille, c.codeClasse, b.ordre_brique';

    const allBricks = await queryDB(entiteDB, sql, params);
    const total = allBricks.length;

    if (total === 0) {
      send({ type: 'error', message: 'Aucun brick actif trouvÃ© pour cette sÃ©lection.' });
      res.end();
      return;
    }

    send({ type: 'start', total });

    let done = 0;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    for (const brick of allBricks) {
      const rayonCode = brick.codeBrique;
      const brickName = brick.libelleBrique || brick.libelleBrique_en || rayonCode;

      // Check if model already exists (skip unless overwrite=true)
      const existing = await queryDB(entiteDB, 'SELECT rayon_code FROM models WHERE rayon_code = ?', [rayonCode]);
      if (existing.length > 0 && overwrite !== 'true') {
        done++;
        skipped++;
        send({ type: 'progress', done, total, succeeded, skipped, failed, rayonCode, brickName, status: 'skipped' });
        continue;
      }

      try {
        send({ type: 'progress', done, total, succeeded, skipped, failed, rayonCode, brickName, status: 'generating' });

        const modelData = await generateModelForBrick(brick);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const modelJson = JSON.stringify(modelData);

        if (existing.length > 0) {
          await runUpdate(entiteDB,
            'UPDATE models SET model_json = ?, libelle = ?, updated_at = ? WHERE rayon_code = ?',
            [modelJson, modelData.libelle, now, rayonCode]
          );
        } else {
          await runUpdate(entiteDB,
            'INSERT INTO models (rayon_code, model_json, libelle, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [rayonCode, modelJson, modelData.libelle, now, now]
          );
        }

        done++;
        succeeded++;
        send({ type: 'progress', done, total, succeeded, skipped, failed, rayonCode, brickName, status: 'done' });

        // 500ms delay â€” 3 rotating keys give us 36k tokens/min combined
        await new Promise(r => setTimeout(r, 500));

      } catch (brickErr) {
        done++;
        failed++;
        console.error(`Failed to generate model for ${rayonCode}:`, brickErr.message);
        send({ type: 'progress', done, total, succeeded, skipped, failed, rayonCode, brickName, status: 'error', error: brickErr.message });
        // Continue to next brick even on error
        await new Promise(r => setTimeout(r, 500));
      }
    }

    send({ type: 'complete', done, total, succeeded, skipped, failed });
  } catch (err) {
    console.error('generate-all-models error:', err);
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TARIFICATION ENDPOINTS - Per Product Ã— Per Buyer
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€â”€ 1. GET /api/tarifications â”€â”€â”€
// Get all tarifications for a specific product and entite
// Query params: id_fiche_produit, id_entite
app.get('/api/tarifications', async (req, res) => {
  try {
    const { id_fiche_produit, id_entite } = req.query;

    if (!id_fiche_produit || !id_entite) {
      return res.status(400).json({ error: 'id_fiche_produit and id_entite are required' });
    }

    const query = `
      SELECT 
        t.id_tarification,
        t.id_fiche_produit,
        t.id_buyer_entite,
        e.raison_socialle as buyer_name,
        e.email as buyer_email,
        t.libelle_tarif,
        t.code_tarif,
        t.type_tarif,
        t.statut,
        t.data,
        t.created_at,
        t.updated_at
      FROM tarifications t
      JOIN entites e ON t.id_buyer_entite = e.id_entite
      WHERE t.id_fiche_produit = ? AND t.id_entite = ?
      ORDER BY t.created_at DESC
    `;

    const results = await new Promise((resolve, reject) => {
      connection.query(query, [id_fiche_produit, id_entite], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Parse JSON data fields
    const parsedResults = results.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));

    res.json(parsedResults || []);
  } catch (error) {
    console.error('Error fetching tarifications:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tarifications',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 2. POST /api/tarifications â”€â”€â”€
// Create a new tarification for a product and buyer
app.post('/api/tarifications', async (req, res) => {
  try {
    const {
      id_fiche_produit,
      id_buyer_entite,
      id_entite,
      libelle_tarif,
      code_tarif,
      type_tarif,
      statut,
      data
    } = req.body;

    if (!id_fiche_produit || !id_buyer_entite || !libelle_tarif) {
      return res.status(400).json({ 
        error: 'Missing required fields: id_fiche_produit, id_buyer_entite, libelle_tarif' 
      });
    }

    const entiteId = id_entite;
    
    if (!entiteId) {
      return res.status(401).json({ error: 'Entite ID not found' });
    }

    const dataJson = JSON.stringify(data || {});
    const now = new Date();

    const insertQuery = `
      INSERT INTO tarifications (
        id_fiche_produit,
        id_buyer_entite,
        id_entite,
        libelle_tarif,
        code_tarif,
        type_tarif,
        statut,
        data,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await new Promise((resolve, reject) => {
      connection.query(
        insertQuery,
        [
          id_fiche_produit,
          id_buyer_entite,
          entiteId,
          libelle_tarif,
          code_tarif || null,
          type_tarif || 'VENTE',
          statut || 'ACTIF',
          dataJson,
          now,
          now
        ],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.json({
      success: true,
      message: 'Tarification created successfully',
      id_tarification: result.insertId
    });
  } catch (error) {
    console.error('Error creating tarification:', error);
    res.status(500).json({ 
      error: 'Failed to create tarification',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 3. PUT /api/tarifications/:id â”€â”€â”€
// Update an existing tarification
app.put('/api/tarifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      id_fiche_produit,
      id_buyer_entite,
      libelle_tarif,
      code_tarif,
      type_tarif,
      statut,
      data
    } = req.body;

    if (!libelle_tarif) {
      return res.status(400).json({ error: 'libelle_tarif is required' });
    }

    const dataJson = JSON.stringify(data || {});
    const now = new Date();

    const updateQuery = `
      UPDATE tarifications SET
        id_fiche_produit = COALESCE(?, id_fiche_produit),
        id_buyer_entite = COALESCE(?, id_buyer_entite),
        libelle_tarif = ?,
        code_tarif = ?,
        type_tarif = COALESCE(?, type_tarif),
        statut = COALESCE(?, statut),
        data = ?,
        updated_at = ?
      WHERE id_tarification = ?
    `;

    await new Promise((resolve, reject) => {
      connection.query(
        updateQuery,
        [
          id_fiche_produit,
          id_buyer_entite,
          libelle_tarif,
          code_tarif || null,
          type_tarif,
          statut,
          dataJson,
          now,
          id
        ],
        (err) => {
          if (err) reject(err);
          else resolve(null);
        }
      );
    });

    res.json({
      success: true,
      message: 'Tarification updated successfully',
      id_tarification: id
    });
  } catch (error) {
    console.error('Error updating tarification:', error);
    res.status(500).json({ 
      error: 'Failed to update tarification',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 4. DELETE /api/tarifications/:id â”€â”€â”€
// Delete a tarification
app.delete('/api/tarifications/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleteQuery = 'DELETE FROM tarifications WHERE id_tarification = ?';

    await new Promise((resolve, reject) => {
      connection.query(deleteQuery, [id], (err) => {
        if (err) reject(err);
        else resolve(null);
      });
    });

    res.json({
      success: true,
      message: 'Tarification deleted successfully',
      id_tarification: id
    });
  } catch (error) {
    console.error('Error deleting tarification:', error);
    res.status(500).json({ 
      error: 'Failed to delete tarification',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 5. GET /api/tarifications/:id â”€â”€â”€
// Get a specific tarification by ID
app.get('/api/tarifications/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        t.id_tarification,
        t.id_fiche_produit,
        t.id_buyer_entite,
        e.raison_socialle as buyer_name,
        e.email as buyer_email,
        t.libelle_tarif,
        t.code_tarif,
        t.type_tarif,
        t.statut,
        t.data,
        t.created_at,
        t.updated_at
      FROM tarifications t
      JOIN entites e ON t.id_buyer_entite = e.id_entite
      WHERE t.id_tarification = ?
    `;

    const result = await new Promise((resolve, reject) => {
      connection.query(query, [id], (err, results) => {
        if (err) reject(err);
        else resolve(results?.[0]);
      });
    });

    if (!result) {
      return res.status(404).json({ error: 'Tarification not found' });
    }

    result.data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

    res.json(result);
  } catch (error) {
    console.error('Error fetching tarification:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tarification',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 6. GET /api/tarifications/product/:id_product â”€â”€â”€
// Get all tarifications for a product (all buyers)
app.get('/api/tarifications/product/:id_product', async (req, res) => {
  try {
    const { id_product } = req.params;

    const query = `
      SELECT 
        t.id_tarification,
        t.id_fiche_produit,
        t.id_buyer_entite,
        e.raison_socialle as buyer_name,
        e.email as buyer_email,
        t.libelle_tarif,
        t.code_tarif,
        t.type_tarif,
        t.statut,
        t.data,
        t.created_at,
        t.updated_at
      FROM tarifications t
      JOIN entites e ON t.id_buyer_entite = e.id_entite
      WHERE t.id_fiche_produit = ?
      ORDER BY t.created_at DESC
    `;

    const results = await new Promise((resolve, reject) => {
      connection.query(query, [id_product], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const parsedResults = results.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));

    res.json(parsedResults || []);
  } catch (error) {
    console.error('Error fetching tarifications:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tarifications',
      message: error.message 
    });
  }
});


// â”€â”€â”€ 7. GET /api/tarifications/buyer/:id_buyer â”€â”€â”€
// Get all tarifications for a buyer (all products)
app.get('/api/tarifications/buyer/:id_buyer', async (req, res) => {
  try {
    const { id_buyer } = req.params;

    const query = `
      SELECT 
        t.id_tarification,
        t.id_fiche_produit,
        fp.libelle as product_libelle,
        fp.gtin,
        t.id_buyer_entite,
        e.raison_socialle as buyer_name,
        t.libelle_tarif,
        t.code_tarif,
        t.type_tarif,
        t.statut,
        t.data,
        t.created_at,
        t.updated_at
      FROM tarifications t
      JOIN entites e ON t.id_buyer_entite = e.id_entite
      JOIN fiche_produits fp ON t.id_fiche_produit = fp.id
      WHERE t.id_buyer_entite = ?
      ORDER BY t.created_at DESC
    `;

    const results = await new Promise((resolve, reject) => {
      connection.query(query, [id_buyer], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    const parsedResults = results.map(row => ({
      ...row,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
    }));

    res.json(parsedResults || []);
  } catch (error) {
    console.error('Error fetching tarifications:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tarifications',
      message: error.message 
    });
  }
});




// ============================================================================
// âœ… TEMPLATE DOWNLOAD ENDPOINTS
// ============================================================================

// GET /api/model_by_brick?codebrique=XXXXX
app.get("/api/model_by_brick", async (req, res) => {
  try {
    const { codebrique } = req.query;
    if (!codebrique) {
      return res.status(400).json({ error: "codebrique parameter required" });
    }
    
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [results] = await conn.query(
      `SELECT model_json, libelle FROM models WHERE rayon_code = ? LIMIT 1`,
      [codebrique]
    );
    await conn.end();
    
    if (results.length === 0) {
      return res.json({ fields: [], libelle: null });
    }
    
    const modelRow = results[0];
    let fields = [];
    try {
      if (modelRow.model_json) {
        const parsed = JSON.parse(modelRow.model_json);
        fields = Array.isArray(parsed) ? parsed : parsed.fields || [];
      }
    } catch (parseErr) {
      console.warn(`Invalid JSON for brick ${codebrique}:`, parseErr.message);
    }
    
    res.json({ fields, libelle: modelRow.libelle });
  } catch (err) {
    console.error("[/api/model_by_brick] Error:", err);
    res.status(500).json({ error: "Failed to fetch model", details: safeErrDetails(err) });
  }
});


// POST /api/products/import-advanced
app.post("/api/products/import-advanced", async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || !products.length) {
      return res.status(400).json({ error: "No products array provided" });
    }

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (let idx = 0; idx < products.length; idx++) {
      try {
        const p = products[idx];
        
        if (!p.brand || !p.gtin || !p.libelle || !p.codebrique) {
          skipped++;
          errors.push({ row: idx + 1, reason: "Missing required fields" });
          continue;
        }

        let extraFields = null;
        if (p.extra_fields) {
          try {
            extraFields = typeof p.extra_fields === "string" 
              ? JSON.parse(p.extra_fields) 
              : p.extra_fields;
          } catch (e) {
            console.warn(`Invalid extra_fields at row ${idx + 1}:`, e.message);
          }
        }

        const sql = `
          INSERT INTO fiche_produit (
            brand, subBrand, description, gtin, libelle, short_libelle,
            countryOfOrigin, idEntreprise, images, nb_images,
            prix_min, prix_max, code_cader, codeClasse, codebrique,
            date_mis_a_jour_fp, tradeItemSynchronisationDates, date_create_fp,
            activ_prix, status, done_new, extra_fields
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
          p.brand || "", p.subBrand || "", p.description || "",
          p.gtin || "", p.libelle || "", p.short_libelle || "",
          p.countryOfOrigin || "", Number(p.idEntreprise || 0),
          "", 0, Number(p.prix_min || 0), Number(p.prix_max || 0),
          p.code_cader || "", Number(p.codeClasse || 0),
          p.codebrique || "", now, p.tradeItemSynchronisationDates || "",
          now, Number(p.activ_prix || 0), 0, 0,
          extraFields ? JSON.stringify(extraFields) : null
        ];

        await conn.query(sql, params);
        inserted++;
      } catch (err) {
        console.error(`Row ${idx + 1} error:`, err.message);
        skipped++;
        errors.push({ row: idx + 1, reason: err.message });
      }
    }

    await conn.end();

    res.json({
      success: true,
      inserted,
      skipped,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${inserted}/${products.length} produit(s) importÃ©(s)`
    });
  } catch (err) {
    console.error("[POST /api/products/import-advanced] Error:", err);
    res.status(500).json({ error: "Import failed", details: safeErrDetails(err) });
  }
});


    
// ========== FAMILY & CLASS BY SEGMENT/FAMILLE ==========
app.get("/api/familles_by_segment", async (req, res) => {
  try {
    const { codeSegment } = req.query;
    if (!codeSegment) return res.status(400).json({ error: "codeSegment required" });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [familles] = await conn.query(
      `SELECT DISTINCT codeFamille, libelleFamille FROM famillegpc WHERE codeSegment = ? ORDER BY codeFamille`,
      [codeSegment]
    );
    await conn.end();
    res.json(familles || []);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/classes_by_famille", async (req, res) => {
  try {
    const { codeFamille } = req.query;
    if (!codeFamille) return res.status(400).json({ error: "codeFamille required" });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [classes] = await conn.query(
      `SELECT codeClasse, libelleClasse FROM classegpc WHERE codeFamille = ? AND status_c = 1 ORDER BY ordre_classe ASC`,
      [codeFamille]
    );
    await conn.end();
    res.json(classes || []);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ========== MODEL BY BRICK ==========
app.get("/api/model_by_brick", async (req, res) => {
  try {
    const { codebrique } = req.query;
    if (!codebrique) return res.status(400).json({ error: "codebrique required" });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [results] = await conn.query(`SELECT model_json FROM models WHERE rayon_code = ? LIMIT 1`, [codebrique]);
    await conn.end();
    if (!results?.length) return res.json({ fields: [] });
    try {
      const fields = JSON.parse(results[0].model_json);
      res.json({ fields: Array.isArray(fields) ? fields : fields.fields || [] });
    } catch (e) {
      res.json({ fields: [] });
    }
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// TEMPLATE HELPERS â€” libellÃ©s franÃ§ais, helpers Excel
// ============================================================================
const FR_FIELD_LABELS = {
  brand:"Marque", subBrand:"Sous-marque", description:"Description produit",
  gtin:"GTIN", libelle:"LibellÃ© produit", short_libelle:"LibellÃ© court",
  countryOfOrigin:"Pays d'origine", prix_min:"Prix minimum (DT)",
  prix_max:"Prix maximum (DT)", code_cader:"Code CADER",
  activ_prix:"Prix activÃ© (0/1)", codeClasse:"Code classe",
  codebrique:"Code brique / rayon",
  segment:"Segment", family:"Famille", class:"Classe", brick:"Brique", rayon:"Rayon",
  gln:"GLN", marque:"Marque", sous_marque:"Sous-marque",
  libelle_court:"LibellÃ© court", pays_d_origine:"Pays d'origine",
  libelle_internet:"LibellÃ© internet", type_de_marque:"Type de marque",
  description_produit:"Description produit", mode_emploi:"Mode d'emploi",
  precautions_emploi:"PrÃ©cautions d'emploi",
  dimensions_hors_emballage:"Dimensions hors emballage",
  type_d_emballage:"Type d'emballage",
  mesures_unite_commerciale:"Mesures unitÃ© commerciale",
  unite_consommateur:"UnitÃ© consommateur",
  prix_unitaire:"Prix unitaire", unite_legale:"UnitÃ© lÃ©gale",
  type_de_taxe:"Type de taxe",
  code_nomenclature_douaniere:"Code nomenclature douaniÃ¨re",
  gtin_d:"GTIN enfant", childTradeItem:"Article enfant",
  quantityofNextLowerLevelTradeItem:"QtÃ© niv. infÃ©rieur",
  quantityOfCompleteLayersContainedInATradeItem:"Nb couches complÃ¨tes",
  quantityOfTradeItemsContainedInACompleteLayer:"Articles par couche",
  isTradeItemADespatchUnit:"UnitÃ© d'expÃ©dition",
  isTradeItemAnInvoiceUnit:"UnitÃ© de facturation",
  isTradeItemAnOrderableUnit:"UnitÃ© commandable",
  isTradeItemAModel:"Article modÃ¨le", isTradeItemADivisibleItem:"Article divisible",
  hasDisplayReadyPackaging:"Emballage prÃªt expo",
  isTradeItemPackedIrregularly:"ConditionnÃ© irrÃ©guliÃ¨rement",
  compositionDepthValue:"Profondeur composition", compositionWidthValue:"Largeur composition",
  alimentaryProduct:"Produit alimentaire", TradeItemDisplayDimensions:"Dimensions affichage",
  contactGLN:"GLN contact", orderingUnitOfMeasure:"UM commande",
  invoicingUnitOfMeasure:"UM facturation", packageMarksDietAllergen:"Marquage allergÃ¨nes",
  cataloguePriceBasisQuantity:"QtÃ© base prix",
  cataloguePriceBasisUnitOfMeasure:"UM base prix",
  tradeItemWeight:"Poids article", tradeItemVolume:"Volume article",
  packagingMaterial:"MatÃ©riau emballage", stackingFactor:"Facteur empilement",
  maxStackingWeight:"Poids max empilement", palletLayerQuantity:"QtÃ© couche palette",
  type_emballage:"Type emballage", palletTypeCode:"Code type palette",
  packagingTypeCode:"Code type emballage",
  unite_logistique_ap:"UL AP", unite_facturable_ap:"UnitÃ© fact. AP",
  unite_commandable_ap:"UnitÃ© cmd. AP", isTradeItemAModel_ap:"Article modÃ¨le AP",
  isTradeItemADivisibleItem_ap:"Article divisible AP",
  hasDisplayReadyPackaging_ap:"Emballage expo AP",
  isTradeItemPackedIrregularly_ap:"Cond. irrÃ©g. AP",
  compositionDepthValue_ap:"Prof. compo AP", compositionWidthValue_ap:"Larg. compo AP",
  alimentaryProduct_ap:"Prod. alim. AP", TradeItemDisplayDimensions_ap:"Dim. affich. AP",
  contactGLN_ap:"GLN contact AP", orderingUnitOfMeasure_ap:"UM commande AP",
  invoicingUnitOfMeasure_ap:"UM fact. AP", gtin_d_ap:"GTIN enfant AP",
  childTradeItem_ap:"Article enfant AP",
  quantityofNextLowerLevelTradeItem_ap:"QtÃ© niv. inf. AP",
  packageMarksDietAllergen_ap:"AllergÃ¨nes AP",
  tradeItemWeight_ap:"Poids AP", tradeItemVolume_ap:"Volume AP",
  packagingMaterial_ap:"MatÃ©riau AP", stackingFactor_ap:"Facteur emp. AP",
  gtin_d_ca:"GTIN enfant CA", childTradeItem_ca:"Article enfant CA",
  quantityofNextLowerLevelTradeItem_ca:"QtÃ© niv. inf. CA",
  quantityOfCompleteLayersContainedInATradeItem_ca:"Nb couches CA",
  quantityOfTradeItemsContainedInACompleteLayer_ca:"Articles/couche CA",
  isTradeItemAConsumerUnit:"UnitÃ© conso", unite_facturable_ca:"UnitÃ© fact. CA",
  unite_commandable_ca:"UnitÃ© cmd. CA", isTradeItemAFullDisplayStand:"PrÃ©sentoir complet",
  hasDisplayReadyPackaging_ca:"Emballage expo CA",
  isTradeItemPackedIrregularly_ca:"Cond. irrÃ©g. CA",
  compositionDepthValue_ca:"Prof. compo CA", compositionWidthValue_ca:"Larg. compo CA",
  alimentaryProduct_ca:"Prod. alim. CA", contactGLN_ca:"GLN contact CA",
  orderingUnitOfMeasure_ca:"UM commande CA", invoicingUnitOfMeasure_ca:"UM fact. CA",
  tradeItemWeight_ca:"Poids CA", tradeItemVolume_ca:"Volume CA",
  packagingMaterial_ca:"MatÃ©riau CA", maxStackingWeight_ca:"Poids max CA",
  palletLayerQuantity_ca:"QtÃ© couche CA",
  quantityofNextLowerLevelTradeItem_ds:"QtÃ© niv. inf. DS",
  quantityOfCompleteLayersContainedInATradeItem_ds:"Nb couches DS",
  quantityOfTradeItemsContainedInACompleteLayer_ds:"Articles/couche DS",
  unite_facturable_ds:"UnitÃ© fact. DS", isTradeItemAFullDisplayStand_ds:"PrÃ©sentoir DS",
  hasDisplayReadyPackaging_ds:"Emballage expo DS",
  isTradeItemPackedIrregularly_ds:"Cond. irrÃ©g. DS",
  compositionDepthValue_ds:"Prof. compo DS", compositionWidthValue_ds:"Larg. compo DS",
  contactGLN_ds:"GLN contact DS", orderingUnitOfMeasure_ds:"UM commande DS",
  invoicingUnitOfMeasure_ds:"UM fact. DS",
  tradeItemWeight_ds:"Poids DS", tradeItemVolume_ds:"Volume DS",
  packagingMaterial_ds:"MatÃ©riau DS", maxStackingWeight_ds:"Poids max DS",
  palletLayerQuantity_ds:"QtÃ© couche DS",
  gtin_d_pl:"GTIN enfant PL", childTradeItem_pl:"Article enfant PL",
  quantityofNextLowerLevelTradeItem_pl:"QtÃ© niv. inf. PL",
  quantityOfCompleteLayersContainedInATradeItem_pl:"Nb couches PL",
  quantityOfTradeItemsContainedInACompleteLayer_pl:"Articles/couche PL",
  isTradeItemAnInvoiceUnit_pl:"UnitÃ© fact. PL",
  isTradeItemAnOrderableUnit_pl:"UnitÃ© cmd. PL",
  isTradeItemAFullDisplayStand_pl:"PrÃ©sentoir PL",
  hasDisplayReadyPackaging_pl:"Emballage expo PL",
  isTradeItemPackedIrregularly_pl:"Cond. irrÃ©g. PL",
  compositionDepthValue_pl:"Prof. compo PL", compositionWidthValue_pl:"Larg. compo PL",
  contactGLN_pl:"GLN contact PL", orderingUnitOfMeasure_pl:"UM commande PL",
  invoicingUnitOfMeasure_pl:"UM fact. PL", palletLayerQuantity_pl:"QtÃ© couche PL",
  tradeItemWeight_pl:"Poids PL", tradeItemVolume_pl:"Volume PL",
  packagingMaterial_pl:"MatÃ©riau PL", maxStackingWeight_pl:"Poids max PL",
  stackingFactor_pl:"Facteur emp. PL", palletDimensions_pl:"Dim. palette PL",
  gtin_d_mx:"GTIN enfant MX", childTradeItem1:"Article enfant 1 MX",
  quantityofNextLowerLevelTradeItem1:"QtÃ© enfant 1 MX",
  childTradeItem2:"Article enfant 2 MX",
  quantityofNextLowerLevelTradeItem2:"QtÃ© enfant 2 MX",
  childTradeItem3:"Article enfant 3 MX",
  quantityofNextLowerLevelTradeItem3:"QtÃ© enfant 3 MX",
  childTradeItem4:"Article enfant 4 MX",
  quantityofNextLowerLevelTradeItem4:"QtÃ© enfant 4 MX",
  quantityOfCompleteLayersContainedInATradeItem_mx:"Nb couches MX",
  quantityOfTradeItemsContainedInACompleteLayer_mx:"Articles/couche MX",
  isTradeItemAnInvoiceUnit_mx:"UnitÃ© fact. MX",
  isTradeItemAFullDisplayStand_mx:"PrÃ©sentoir MX",
  hasDisplayReadyPackaging_mx:"Emballage expo MX",
  isTradeItemPackedIrregularly_mx:"Cond. irrÃ©g. MX",
  compositionDepthValue_mx:"Prof. compo MX", compositionWidthValue_mx:"Larg. compo MX",
  contactGLN_mx:"GLN contact MX", orderingUnitOfMeasure_mx:"UM commande MX",
  invoicingUnitOfMeasure_mx:"UM fact. MX", palletLayerQuantity_mx:"QtÃ© couche MX",
  tradeItemWeight_mx:"Poids MX", tradeItemVolume_mx:"Volume MX",
  packagingMaterial_mx:"MatÃ©riau MX", maxStackingWeight_mx:"Poids max MX",
  stackingFactor_mx:"Facteur emp. MX", palletDimensions_mx:"Dim. palette MX",
};

function frLabel(key) {
  return FR_FIELD_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function excelCol(n) {
  let s = '';
  while (n > 0) { const r = (n-1)%26; s = String.fromCharCode(65+r)+s; n = Math.floor((n-1)/26); }
  return s;
}

const COUNTRIES_LIST = [
  "Afghanistan","Afrique du Sud","Albanie","Algerie","Allemagne","Andorre","Angola",
  "Arabie Saoudite","Argentine","Armenie","Australie","Autriche","Azerbaidjan",
  "Bahamas","Bahrein","Bangladesh","Barbade","Belgique","Belize","Benin","Bolivie",
  "Bosnie-Herzegovine","Bresil","Brunei","Bulgarie","Burkina Faso","Burundi",
  "Cambodge","Cameroun","Canada","Chili","Chine","Chypre","Colombie","Comores",
  "Coree du Nord","Coree du Sud","Costa Rica","Cote d Ivoire","Croatie","Cuba",
  "Danemark","Djibouti","Dominique","Egypte","Emirats arabes unis","Equateur",
  "Erythree","Espagne","Estonie","Eswatini","Etats-Unis","Ethiopie","Fidji",
  "Finlande","France","Gabon","Gambie","Georgie","Ghana","Grece","Grenade",
  "Guatemala","Guinee","Guinee-Bissau","Guinee equatoriale","Guyana","Haiti",
  "Honduras","Hongrie","Inde","Indonesie","Irak","Iran","Irlande","Islande",
  "Israel","Italie","Jamaique","Japon","Jordanie","Kazakhstan","Kenya","Kiribati",
  "Koweit","Laos","Lesotho","Lettonie","Liban","Liberia","Libye","Liechtenstein",
  "Lituanie","Luxembourg","Macedoine du Nord","Madagascar","Malaisie","Malawi",
  "Maldives","Mali","Malte","Maroc","Marshall","Maurice","Mauritanie","Mexique",
  "Micronesie","Moldavie","Monaco","Mongolie","Montenegro","Mozambique","Myanmar",
  "Namibie","Nauru","Nepal","Nicaragua","Niger","Nigeria","Norvege",
  "Nouvelle-Zelande","Oman","Ouganda","Ouzbekistan","Pakistan","Palaos","Panama",
  "Papouasie-Nouvelle-Guinee","Paraguay","Pays-Bas","Perou","Philippines","Pologne",
  "Portugal","Qatar","Republique centrafricaine","Rep dem du Congo",
  "Republique dominicaine","Republique tcheque","Roumanie","Royaume-Uni","Russie",
  "Rwanda","Saint-Kitts-et-Nevis","Saint-Marin","Saint-Vincent","Sainte-Lucie",
  "Salvador","Samoa","Sao Tome-et-Principe","Senegal","Serbie","Seychelles",
  "Sierra Leone","Singapour","Slovaquie","Slovenie","Somalie","Soudan",
  "Soudan du Sud","Sri Lanka","Suede","Suisse","Suriname","Syrie","Tadjikistan",
  "Tanzanie","Tchad","Thailande","Timor oriental","Togo","Tonga",
  "Trinite-et-Tobago","Tunisie","Turkmenistan","Turquie","Tuvalu","Ukraine",
  "Uruguay","Vanuatu","Vatican","Venezuela","Viet Nam","Yemen","Zambie","Zimbabwe"
];


// ============================================================================
// GET /api/model_by_rayon â€” Alias for model_by_brick (frontend uses rayon_code param)
// ============================================================================
app.get("/api/model_by_rayon", async (req, res) => {
  try {
    const { rayon_code } = req.query;
    if (!rayon_code) return res.status(400).json({ error: "rayon_code required" });
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [results] = await conn.query(`SELECT model_json FROM models WHERE rayon_code = ? LIMIT 1`, [rayon_code]);
    await conn.end();
    if (!results?.length) return res.json({ fields: [] });
    try {
      const fields = JSON.parse(results[0].model_json);
      res.json({ fields: Array.isArray(fields) ? fields : fields.fields || [] });
    } catch (e) {
      res.json({ fields: [] });
    }
  } catch (err) {
    console.error("[/api/model_by_rayon] Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// GET /api/products/parents_select â€” List products for parent selection (dÃ©clinaisons)
// ============================================================================
app.get("/api/products/parents_select", async (req, res) => {
  try {
    const { id_entite, exclude_id, current_type } = req.query;
    if (!id_entite) return res.status(400).json({ error: "id_entite required" });

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    let sql = `SELECT id, gtin, libelle, brand, codebrique FROM fiche_produit WHERE idEntreprise = ?`;
    const params = [id_entite];

    if (exclude_id) {
      sql += ` AND id != ?`;
      params.push(exclude_id);
    }

    sql += ` ORDER BY libelle ASC LIMIT 500`;

    const [rows] = await conn.query(sql, params);
    await conn.end();
    res.json(rows || []);
  } catch (err) {
    console.error("[/api/products/parents_select] Error:", err);
    res.status(500).json({ error: "Failed to fetch parent products", details: safeErrDetails(err) });
  }
});


// ============================================================================
// TÃ‰LÃ‰CHARGEMENT DU MODÃˆLE EXCEL â€” template-advanced
// Ordre : [DonnÃ©es de base] â†’ [Classification prÃ©-remplie]
//       â†’ [Sections modÃ¨le JSON] â†’ [HiÃ©rarchie logistique]
// Palette sombre/plate Â· ligne 1 = titres section Â· libellÃ©s ASCII (sans accents)
// pour Ã©viter tout problÃ¨me d'encodage Ã  la rÃ©importation
// ============================================================================
app.get("/api/products/template-advanced", async (req, res) => {
  try {
    const { rayon_code, model_key, codeSegment, codeClasse, codeFamille } = req.query;
    if (!model_key) return res.status(400).json({ error: "model_key requis" });

    let conn;
    try { conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG); }
    catch (e) { return res.status(500).json({ error: "Connexion BDD echouee" }); }

    // â”€â”€ 1. ModÃ¨le JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [modelResults] = await conn.query(
      `SELECT model_json FROM models WHERE rayon_code = ? LIMIT 1`, [model_key]
    );
    let modelData = {};
    if (modelResults?.length && modelResults[0].model_json) {
      try { modelData = JSON.parse(modelResults[0].model_json); } catch(e) {}
    }

    // â”€â”€ 2. LibellÃ©s pour prÃ©-remplissage + nom fichier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let libelleSegment = "", libelleClasse = "", libelleRayon = "";
    try {
      if (rayon_code) {
        const [rR] = await conn.query(`SELECT rayon_libelle FROM rayongpc WHERE rayon_code = ? LIMIT 1`, [rayon_code]);
        if (rR.length) libelleRayon = rR[0].rayon_libelle || "";
      }
      if (codeSegment) {
        const [rS] = await conn.query(`SELECT libelleSegment FROM segmentgpc WHERE codeSegment = ? LIMIT 1`, [codeSegment]);
        if (rS.length) libelleSegment = rS[0].libelleSegment || "";
      }
      if (codeClasse) {
        const [rC] = await conn.query(`SELECT libelleClasse FROM classegpc WHERE codeClasse = ? LIMIT 1`, [codeClasse]);
        if (rC.length) libelleClasse = rC[0].libelleClasse || "";
      }
    } catch(e) { /* non bloquant */ }
    await conn.end();

    // â”€â”€ 3. Valeurs prÃ©-remplies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const PREFILL = {};
    if (codeSegment) PREFILL["segment"]    = libelleSegment ? `${codeSegment} - ${libelleSegment}` : codeSegment;
    if (codeClasse)  PREFILL["codeClasse"] = libelleClasse  ? `${codeClasse} - ${libelleClasse}`   : String(codeClasse);
    if (codeClasse)  PREFILL["classe"]     = PREFILL["codeClasse"];
    if (rayon_code)  PREFILL["codebrique"] = libelleRayon   ? `${rayon_code} - ${libelleRayon}`   : rayon_code;
    if (rayon_code)  PREFILL["brick"]      = PREFILL["codebrique"];
    if (rayon_code)  PREFILL["rayon"]      = PREFILL["codebrique"];

    // â”€â”€ 4. Palette sombre/plate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const PAL = {
      BASE:            { hc:"1E3A5F", fc:"FFFFFF", dc:"EBF0F7" },
      Classification:  { hc:"2D4739", fc:"FFFFFF", dc:"E8F0EB" },
      IDENTIFICATION:  { hc:"4A2060", fc:"FFFFFF", dc:"F0EBF6" },
      SPECIFIQUE:      { hc:"7A3B00", fc:"FFFFFF", dc:"FDF0E0" },
      CONDITIONNEMENT: { hc:"1A4D5C", fc:"FFFFFF", dc:"E5F2F6" },
      TARIFAIRE:       { hc:"5C1A1A", fc:"FFFFFF", dc:"F6E5E5" },
      PK: { hc:"4B3000", fc:"FFFFFF", dc:"FDF5E0" },
      AP: { hc:"3D0000", fc:"FFFFFF", dc:"FDF0F0" },
      CA: { hc:"003D1A", fc:"FFFFFF", dc:"E6F7EC" },
      DS: { hc:"003D3D", fc:"FFFFFF", dc:"E0F5F5" },
      PL: { hc:"1A003D", fc:"FFFFFF", dc:"EEE8F7" },
      MX: { hc:"2D2D00", fc:"FFFFFF", dc:"F7F5E0" },
    };

    // ClÃ©s dÃ©jÃ  dans donnÃ©es de base â†’ ne pas dupliquer
    const BASE_KEYS_SET = new Set([
      "segment","codeSegment","code_segment","family","famille","codeFamille",
      "classe","codeClasse","class","code_classe","codebrique","brick","brique",
      "rayon","code_brique","gtin","gln","marque","brand","sous_marque","subBrand",
      "libelle","libelle_court","short_libelle","libelle_internet",
      "pays_d_origine","countryOfOrigin",
    ]);
    const normKey = s => s.toLowerCase().replace(/[^a-z0-9]/g,"");
    const BASE_KEYS_NORM = new Set([...BASE_KEYS_SET].map(normKey));

    // â”€â”€ 5. Construction des colonnes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const columns = [];

    // 5a. DONNÃ‰ES DE BASE (libellÃ©s ASCII pur â€” CRITIQUE pour encodage)
    const BASE_DEF = [
      { key:"brand",           label:"Marque *"           },
      { key:"subBrand",        label:"Sous-marque"        },
      { key:"gtin",            label:"GTIN *"             },
      { key:"libelle",         label:"Libelle produit *"  },
      { key:"short_libelle",   label:"Libelle court"      },
      { key:"description",     label:"Description produit"},
      { key:"countryOfOrigin", label:"Pays d'origine",    dvPays:true },
      { key:"prix_min",        label:"Prix minimum (DT)"  },
      { key:"prix_max",        label:"Prix maximum (DT)"  },
      { key:"code_cader",      label:"Code CADER"         },
      { key:"activ_prix",      label:"Prix active (0/1)"  },
    ];
    for (const f of BASE_DEF) {
      columns.push({ key:f.key, label:f.label, section:"BASE",
        sectionLabel:"DONNEES DE BASE", pal:PAL.BASE,
        prefill:PREFILL[f.key]||null, dvPays:f.dvPays||false });
    }

    // 5b. CLASSIFICATION prÃ©-remplie
    const CLASS_DEF = [
      { key:"segment",    label:"Segment"          },
      { key:"codeClasse", label:"Code classe"      },
      { key:"codebrique", label:"Code brique/rayon"},
    ];
    for (const f of CLASS_DEF) {
      columns.push({ key:f.key, label:f.label, section:"Classification",
        sectionLabel:"CLASSIFICATION", pal:PAL.Classification,
        prefill:PREFILL[f.key]||null, dvPays:false });
    }

    // 5c. SECTIONS DU MODÃˆLE JSON
    const MODEL_SECTION_ORDER = [
      "Donnees d'identification",
      "Donnees specifiques du produit",
      "Conditionnement & Logistique",
      "Donnees tarifaires",
    ];
    const MODEL_SECTION_PAL = {
      "Donnees d'identification":       PAL.IDENTIFICATION,
      "Donnees specifiques du produit": PAL.SPECIFIQUE,
      "Conditionnement & Logistique":   PAL.CONDITIONNEMENT,
      "Donnees tarifaires":             PAL.TARIFAIRE,
    };
    const MODEL_SECTION_LABEL = {
      "Donnees d'identification":       "DONNEES D'IDENTIFICATION",
      "Donnees specifiques du produit": "DONNEES SPECIFIQUES DU PRODUIT",
      "Conditionnement & Logistique":   "CONDITIONNEMENT & LOGISTIQUE",
      "Donnees tarifaires":             "DONNEES TARIFAIRES",
    };

    if (modelData.sections) {
      for (const secName of MODEL_SECTION_ORDER) {
        const secData = modelData.sections[secName];
        if (!secData?.fields?.length) continue;
        const pal      = MODEL_SECTION_PAL[secName]   || PAL.SPECIFIQUE;
        const secLabel = MODEL_SECTION_LABEL[secName] || secName.toUpperCase();
        for (const fieldName of secData.fields) {
          if (BASE_KEYS_SET.has(fieldName) || BASE_KEYS_NORM.has(normKey(fieldName))) continue;
          const rule = modelData.fieldRules?.[fieldName] || {};
          const isMand = rule.validation === "OB";
          // Use description from fieldRules if available, else frLabel â€” both ASCII-safe
          const displayLabel = (rule.description || frLabel(fieldName)) + (isMand ? " *" : "");
          columns.push({ key:fieldName, label:displayLabel, section:secName,
            sectionLabel:secLabel, pal, prefill:PREFILL[fieldName]||null, dvPays:false });
        }
      }
    }

    // 5d. HIÃ‰RARCHIE LOGISTIQUE
    const HIER_DEFS = [
      { code:"PK", label:"PK - LOT CONSOMMATEUR HOMOGENE", pal:PAL.PK,
        fields:["gtin_d","childTradeItem","quantityofNextLowerLevelTradeItem","quantityOfCompleteLayersContainedInATradeItem","quantityOfTradeItemsContainedInACompleteLayer","isTradeItemADespatchUnit","isTradeItemAnInvoiceUnit","isTradeItemAnOrderableUnit","isTradeItemAModel","isTradeItemADivisibleItem","hasDisplayReadyPackaging","isTradeItemPackedIrregularly","compositionDepthValue","compositionWidthValue","alimentaryProduct","TradeItemDisplayDimensions","contactGLN","orderingUnitOfMeasure","invoicingUnitOfMeasure","packageMarksDietAllergen","cataloguePriceBasisQuantity","cataloguePriceBasisUnitOfMeasure","tradeItemWeight","tradeItemVolume","packagingMaterial","stackingFactor","maxStackingWeight","palletLayerQuantity","type_emballage","palletTypeCode"] },
      { code:"AP", label:"AP - LOT CONSOMMATEUR HETEROGENE", pal:PAL.AP,
        fields:["unite_logistique_ap","unite_facturable_ap","unite_commandable_ap","isTradeItemAModel_ap","isTradeItemADivisibleItem_ap","hasDisplayReadyPackaging_ap","isTradeItemPackedIrregularly_ap","compositionDepthValue_ap","compositionWidthValue_ap","alimentaryProduct_ap","TradeItemDisplayDimensions_ap","contactGLN_ap","orderingUnitOfMeasure_ap","invoicingUnitOfMeasure_ap","gtin_d_ap","childTradeItem_ap","quantityofNextLowerLevelTradeItem_ap","packageMarksDietAllergen_ap","tradeItemWeight_ap","tradeItemVolume_ap","packagingMaterial_ap","stackingFactor_ap","type_emballage","palletTypeCode"] },
      { code:"CA", label:"CA - COLIS HOMOGENE", pal:PAL.CA,
        fields:["gtin_d_ca","childTradeItem_ca","quantityofNextLowerLevelTradeItem_ca","packagingTypeCode","palletTypeCode","quantityOfCompleteLayersContainedInATradeItem_ca","quantityOfTradeItemsContainedInACompleteLayer_ca","isTradeItemAConsumerUnit","unite_facturable_ca","unite_commandable_ca","isTradeItemAFullDisplayStand","hasDisplayReadyPackaging_ca","isTradeItemPackedIrregularly_ca","compositionDepthValue_ca","compositionWidthValue_ca","alimentaryProduct_ca","contactGLN_ca","orderingUnitOfMeasure_ca","invoicingUnitOfMeasure_ca","tradeItemWeight_ca","tradeItemVolume_ca","packagingMaterial_ca","maxStackingWeight_ca","palletLayerQuantity_ca","type_emballage"] },
      { code:"DS", label:"DS - COLIS HETEROGENE", pal:PAL.DS,
        fields:["quantityofNextLowerLevelTradeItem_ds","packagingTypeCode","palletTypeCode","quantityOfCompleteLayersContainedInATradeItem_ds","quantityOfTradeItemsContainedInACompleteLayer_ds","unite_facturable_ds","isTradeItemAFullDisplayStand_ds","hasDisplayReadyPackaging_ds","isTradeItemPackedIrregularly_ds","compositionDepthValue_ds","compositionWidthValue_ds","contactGLN_ds","orderingUnitOfMeasure_ds","invoicingUnitOfMeasure_ds","tradeItemWeight_ds","tradeItemVolume_ds","packagingMaterial_ds","maxStackingWeight_ds","palletLayerQuantity_ds","type_emballage"] },
      { code:"PL", label:"PL - PALETTE HOMOGENE", pal:PAL.PL,
        fields:["gtin_d_pl","childTradeItem_pl","quantityofNextLowerLevelTradeItem_pl","quantityOfCompleteLayersContainedInATradeItem_pl","quantityOfTradeItemsContainedInACompleteLayer_pl","isTradeItemAnInvoiceUnit_pl","isTradeItemAnOrderableUnit_pl","isTradeItemAFullDisplayStand_pl","hasDisplayReadyPackaging_pl","isTradeItemPackedIrregularly_pl","compositionDepthValue_pl","compositionWidthValue_pl","contactGLN_pl","orderingUnitOfMeasure_pl","invoicingUnitOfMeasure_pl","palletTypeCode","palletLayerQuantity_pl","tradeItemWeight_pl","tradeItemVolume_pl","packagingMaterial_pl","maxStackingWeight_pl","stackingFactor_pl","palletDimensions_pl","type_emballage"] },
      { code:"MX", label:"MX - PALETTE HETEROGENE", pal:PAL.MX,
        fields:["gtin_d_mx","childTradeItem1","quantityofNextLowerLevelTradeItem1","childTradeItem2","quantityofNextLowerLevelTradeItem2","childTradeItem3","quantityofNextLowerLevelTradeItem3","childTradeItem4","quantityofNextLowerLevelTradeItem4","quantityOfCompleteLayersContainedInATradeItem_mx","quantityOfTradeItemsContainedInACompleteLayer_mx","isTradeItemAnInvoiceUnit_mx","isTradeItemAFullDisplayStand_mx","hasDisplayReadyPackaging_mx","isTradeItemPackedIrregularly_mx","compositionDepthValue_mx","compositionWidthValue_mx","contactGLN_mx","orderingUnitOfMeasure_mx","invoicingUnitOfMeasure_mx","palletTypeCode","palletLayerQuantity_mx","tradeItemWeight_mx","tradeItemVolume_mx","packagingMaterial_mx","maxStackingWeight_mx","stackingFactor_mx","palletDimensions_mx","type_emballage"] },
    ];
    const seenHK = new Set();
    for (const hd of HIER_DEFS) {
      for (const fk of hd.fields) {
        const uk = `${hd.code}_${fk}`;
        if (seenHK.has(uk)) continue;
        seenHK.add(uk);
        columns.push({ key:`${fk}__${hd.code}`, label:frLabel(fk),
          section:`HIER_${hd.code}`, sectionLabel:hd.label,
          pal:hd.pal, prefill:null, dvPays:false });
      }
    }

    const N = columns.length;
    const REF_PAYS = `Pays!$A$2:$A$${COUNTRIES_LIST.length + 1}`;

    // â”€â”€ 6. Classeur ExcelJS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const wb = new ExcelJS.Workbook();

    // Feuille Pays (masquÃ©e)
    const wsPays = wb.addWorksheet("Pays", { tabColor:{ argb:"FF999999" }, state:"hidden" });
    wsPays.getCell(1,1).value = "[Liste Pays - Ne pas modifier]";
    wsPays.getCell(1,1).font = { bold:true, color:{ argb:"FF999999" }, size:8 };
    COUNTRIES_LIST.forEach((c,i) => { wsPays.getCell(i+2,1).value = c; });
    wsPays.getColumn(1).width = 40;

    // Feuille principale
    const ws = wb.addWorksheet("Modele Produits", { tabColor:{ argb:"FF1E3A5F" } });
    wb.views = [{ activeTab:1 }];

    // â”€â”€ 6a. Ligne 1 â€” Titres de section (fusionnÃ©es) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sectionRanges = [];
    let prevSec = null, startC = 1;
    for (let j = 0; j < N; j++) {
      const sec = columns[j].section;
      if (!prevSec) { prevSec = sec; startC = j+1; }
      else if (sec !== prevSec) {
        sectionRanges.push({ label:columns[j-1].sectionLabel, startCol:startC, endCol:j, pal:columns[j-1].pal });
        prevSec = sec; startC = j+1;
      }
    }
    sectionRanges.push({ label:columns[N-1].sectionLabel, startCol:startC, endCol:N, pal:columns[N-1].pal });

    const secTitleRow = ws.addRow(new Array(N).fill(null));
    secTitleRow.height = 20;
    for (const sr of sectionRanges) {
      if (sr.startCol < sr.endCol) ws.mergeCells(1, sr.startCol, 1, sr.endCol);
      const cell = secTitleRow.getCell(sr.startCol);
      cell.value = sr.label;
      cell.font  = { bold:true, size:9, color:{ argb:"FF"+sr.pal.fc } };
      cell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"CC"+sr.pal.hc } };
      cell.alignment = { horizontal:"center", vertical:"middle" };
      cell.border = {
        left:  { style:"medium", color:{ argb:"FF333333" } },
        right: { style:"medium", color:{ argb:"FF333333" } },
        bottom:{ style:"thin",   color:{ argb:"FF555555" } },
      };
    }

    // â”€â”€ 6b. Ligne 2 â€” En-tÃªtes colonnes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const headerRow = ws.addRow(columns.map(c => c.label));
    headerRow.height = 42;
    for (let j = 0; j < N; j++) {
      const cell = headerRow.getCell(j+1);
      const pal  = columns[j].pal;
      cell.font  = { bold:true, size:9, color:{ argb:"FF"+pal.fc } };
      cell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF"+pal.hc } };
      cell.alignment = { horizontal:"center", vertical:"middle", wrapText:true };
      cell.border = {
        left:  { style:"thin",   color:{ argb:"FF444444" } },
        right: { style:"thin",   color:{ argb:"FF444444" } },
        top:   { style:"medium", color:{ argb:"FF222222" } },
        bottom:{ style:"medium", color:{ argb:"FF222222" } },
      };
    }

    // â”€â”€ 6c. Ligne 3 â€” Instruction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const instrRow = ws.addRow(new Array(N).fill(null));
    instrRow.height = 16;
    if (N > 1) ws.mergeCells(3,1,3,N);
    const instrCell = instrRow.getCell(1);
    instrCell.value = "(*) = Obligatoire  |  Champs verts pre-remplis = ne pas modifier  |  Pays = liste deroulante  |  Saisie a partir de la ligne 4";
    instrCell.font  = { italic:true, size:8, color:{ argb:"FF888888" } };
    instrCell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFF0F0F0" } };
    instrCell.alignment = { horizontal:"left", vertical:"middle" };

    // â”€â”€ 6d. Lignes 4-103 â€” DonnÃ©es â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let ri = 0; ri < 100; ri++) {
      const dataRow = ws.addRow(new Array(N).fill(null));
      dataRow.height = 18;
      const isEven = ri % 2 === 0;
      for (let j = 0; j < N; j++) {
        const cell = dataRow.getCell(j+1);
        const col  = columns[j];
        if (col.prefill) {
          cell.value = col.prefill;
          cell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFD5E8D4" } };
          cell.font  = { color:{ argb:"FF2D6A2D" }, italic:true, size:9 };
          cell.protection = { locked:true };
        } else {
          const bg = isEven ? ("FF"+col.pal.dc) : "FFFFFFFF";
          cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:bg } };
          cell.font = { size:9, color:{ argb:"FF1A1A2E" } };
        }
        cell.border = {
          left:  { style:"thin", color:{ argb:"FFDDDDDD" } },
          right: { style:"thin", color:{ argb:"FFDDDDDD" } },
          top:   { style:"thin", color:{ argb:"FFEEEEEE" } },
          bottom:{ style:"thin", color:{ argb:"FFEEEEEE" } },
        };
        cell.alignment = { vertical:"middle" };
      }
    }

    // â”€â”€ 6e. Validation listes Pays â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let j = 0; j < N; j++) {
      if (!columns[j].dvPays) continue;
      const sqref = `${excelCol(j+1)}4:${excelCol(j+1)}103`;
      try {
        ws.dataValidations.add(sqref, {
          type:"list", allowBlank:true, showDropDown:false, formulae:[REF_PAYS],
        });
      } catch(e) {}
    }

    // â”€â”€ 6f. Largeurs + gel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ws.columns = columns.map(c => ({
      key: c.key,
      width: Math.max(16, Math.min(38, c.label.replace(" *","").length + 4)),
    }));
    ws.views = [{ state:"frozen", xSplit:0, ySplit:3, activeCell:"A4" }];
    ws.pageSetup = { paperSize:9, orientation:"landscape", fitToPage:true, fitToWidth:1 };

    // â”€â”€ 7. Nom de fichier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const safePart = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-zA-Z0-9\-_]/g,"_").replace(/_+/g,"_").slice(0,35);
    const libBrique = safePart(libelleRayon || rayon_code || model_key);
    const libClass  = safePart(libelleClasse || codeClasse || "");
    const datePart  = new Date().toISOString().split("T")[0];
    const fileName  = libClass
      ? `Modele_${libClass}_${libBrique}_${datePart}.xlsx`
      : `Modele_${libBrique}_${datePart}.xlsx`;

    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="${encodeURIComponent(fileName)}"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("[template-advanced]", err);
    res.status(500).json({ error:"Erreur serveur", details: safeErrDetails(err) });
  }
});

// depuis des fichiers gÃ©nÃ©rÃ©s sur certains OS. La normalisation ci-dessous
// supprime TOUS les caractÃ¨res non-ASCII et non-alphanumÃ©riques avant
// comparaison, rendant le matching 100% robuste.
//
// Structure fichier attendue:
//   Ligne 1 = titres section (fusionnÃ©es) â†’ ignorÃ©e
//   Ligne 2 = en-tÃªtes colonnes           â†’ utilisÃ©e pour le mapping
//   Ligne 3 = instruction                 â†’ ignorÃ©e
//   Ligne 4+ = donnÃ©es produits
// ============================================================================
app.post("/api/products/import-template", multerMemory.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error:"Aucun fichier envoye" });

    const { id_entite } = req.body;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    // Trouver la feuille principale
    let ws = workbook.getWorksheet("Modele Produits");
    if (!ws) ws = workbook.worksheets.find(s => !["Pays"].includes(s.name));
    if (!ws) return res.status(400).json({ error:"Feuille 'Modele Produits' introuvable dans le fichier" });

    // â”€â”€ Lire les en-tÃªtes depuis la ligne 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // (ligne 1 = titres section, ligne 2 = col headers, ligne 3 = instruction)
    const headerRow = ws.getRow(2);
    const headers   = [];
    headerRow.eachCell({ includeEmpty:true }, (cell, colNum) => {
      let v = cell.value;
      if (v === null || v === undefined) { headers[colNum-1] = ""; return; }
      if (typeof v === "object") v = v.text || v.result || String(v);
      headers[colNum-1] = String(v).trim();
    });

    // Normalisation ROBUSTE: supprime accents, U+FFFD, astÃ©risques, espaces, ponctuation
    // RÃ©sultat: "LibellÃ© produit *" â†’ "libelleproduit"
    //           "Libell\uFFFD produit *" â†’ "libelleproduit"  (mÃªme rÃ©sultat!)
    const normH = s => s
      .normalize("NFD")                        // dÃ©composer accents
      .replace(/[\u0300-\u036f]/g, "")         // supprimer marques diacritiques
      .replace(/\ufffd/g, "")                  // supprimer U+FFFD (replacement char)
      .replace(/\*/g, "")                      // supprimer astÃ©risques
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");             // garder seulement alphanum

    // Mapping normalisÃ© â†’ champ BDD
    // Les clÃ©s sont dÃ©jÃ  normalisÃ©es (sans accents, sans espaces, lowercase)
    const FR_TO_DB = {
      "marque":               "brand",
      "gtin":                 "gtin",
      "libelleproduit":       "libelle",
      "libelle":              "libelle",
      "sousmarque":           "subBrand",
      "descriptionproduit":   "description",
      "description":          "description",
      "libellecourt":         "short_libelle",
      "paysdorigine":         "countryOfOrigin",
      "prixminimumdt":        "prix_min",
      "prixminimum":          "prix_min",
      "prixmaximumdt":        "prix_max",
      "prixmaximum":          "prix_max",
      "codecader":            "code_cader",
      "prixactive01":         "activ_prix",
      "prixactive":           "activ_prix",
      "prixactive01":         "activ_prix",
      "codebriquerayon":      "codebrique",
      "codebrique":           "codebrique",
      "rayon":                "codebrique",
      "brique":               "codebrique",
      "codeclasse":           "codeClasse",
      "classe":               "codeClasse",
      "segment":              "segment_code",
    };

    const BASE_DB_FIELDS = new Set([
      "brand","gtin","libelle","subBrand","description","short_libelle",
      "countryOfOrigin","prix_min","prix_max","code_cader","activ_prix",
      "codebrique","codeClasse","segment_code"
    ]);

    const baseColMap = {};  // dbField â†’ colIndex (0-based)
    const extraCols  = [];  // { label, colIndex } pour extra_fields

    headers.forEach((h, i) => {
      const nk  = normH(h);
      const dbF = FR_TO_DB[nk];
      if (dbF && BASE_DB_FIELDS.has(dbF)) {
        if (baseColMap[dbF] === undefined) baseColMap[dbF] = i;
      } else if (nk && nk !== "") {
        extraCols.push({ label:h, colIndex:i });
      }
    });

    // Debug log pour vÃ©rification
    console.log("[import-template] baseColMap:", JSON.stringify(baseColMap));
    console.log("[import-template] headers[0..14]:", headers.slice(0,14).map((h,i)=>`[${i}]${normH(h)}`));

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const now  = new Date().toISOString().slice(0,19).replace("T"," ");
    const results    = [];
    const failedRows = [];

    // Helper: lire valeur d'une cellule par index de colonne (0-based)
    const getCellVal = (row, colIdx) => {
      if (colIdx === undefined || colIdx === null) return null;
      const cell = row.getCell(colIdx + 1);
      if (cell.value === null || cell.value === undefined) return null;
      let v = cell.value;
      if (typeof v === "object" && v !== null) {
        if (v.text !== undefined)   v = v.text;
        else if (v.result !== undefined) v = v.result;
        else v = String(v);
      }
      return String(v).trim() || null;
    };

    // Extraire code seul depuis "CODE - Libelle" ou "CODE â€” Libelle" (prÃ©-remplis)
    const extractCode = v => {
      if (!v) return v;
      const m = v.match(/^(\S+)\s*[-â€”â€“]\s*.+$/);
      return m ? m[1] : v;
    };

    // DonnÃ©es Ã  partir de la ligne 4
    const totalRows = ws.rowCount;
    for (let ri = 4; ri <= totalRows; ri++) {
      const row = ws.getRow(ri);

      const brand   = getCellVal(row, baseColMap["brand"]);
      const gtin    = getCellVal(row, baseColMap["gtin"]);
      const libelle = getCellVal(row, baseColMap["libelle"]);

      // Ligne vraiment vide â†’ ignorer silencieusement
      if (!brand && !gtin && !libelle) continue;

      // Codes prÃ©-remplis: extraire juste le code
      let codebrique = extractCode(getCellVal(row, baseColMap["codebrique"]));
      let codeClasse  = extractCode(getCellVal(row, baseColMap["codeClasse"]));

      // Validation champs obligatoires
      const missing = [];
      if (!brand)      missing.push("Marque");
      if (!gtin)       missing.push("GTIN");
      if (!libelle)    missing.push("Libelle produit");
      if (!codebrique) missing.push("Code brique/rayon");

      if (missing.length) {
        results.push({ row:ri-3, status:"error", gtin:gtin||"â€”",
          error:`Champs obligatoires manquants : ${missing.join(", ")}` });
        failedRows.push(ri);
        continue;
      }

      // Champs optionnels
      const subBrand        = getCellVal(row, baseColMap["subBrand"])        || null;
      const description     = getCellVal(row, baseColMap["description"])     || null;
      const short_libelle   = getCellVal(row, baseColMap["short_libelle"])   || null;
      const countryOfOrigin = getCellVal(row, baseColMap["countryOfOrigin"]) || null;
      const prix_min        = Number(getCellVal(row, baseColMap["prix_min"])) || 0;
      const prix_max        = Number(getCellVal(row, baseColMap["prix_max"])) || 0;
      const code_cader      = getCellVal(row, baseColMap["code_cader"])      || "";
      const activ_prix      = Number(getCellVal(row, baseColMap["activ_prix"])) || 0;
      const codeClasseNum   = codeClasse ? (parseInt(codeClasse) || null) : null;
      const idEntreprise    = id_entite  ? parseInt(id_entite) : null;

      // Champs extra â†’ extra_fields JSON
      const extraFields = {};
      for (const ec of extraCols) {
        const val = getCellVal(row, ec.colIndex);
        if (val !== null && val !== "") extraFields[ec.label] = val;
      }

      try {
        // VÃ©rifier doublon GTIN
        const [existing] = await conn.query(
          `SELECT id FROM fiche_produit WHERE gtin = ? LIMIT 1`, [gtin]
        );
        if (existing.length) {
          results.push({ row:ri-3, status:"error", gtin,
            error:`GTIN '${gtin}' existe deja en base` });
          failedRows.push(ri);
          continue;
        }

        await conn.query(
          `INSERT INTO fiche_produit
            (brand, subBrand, description, gtin, libelle, short_libelle, countryOfOrigin,
             idEntreprise, prix_min, prix_max, code_cader, codeClasse, codebrique,
             date_mis_a_jour_fp, tradeItemSynchronisationDates, date_create_fp,
             activ_prix, status, done_new, extra_fields)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
          [brand, subBrand, description, gtin, libelle, short_libelle, countryOfOrigin,
           idEntreprise, prix_min, prix_max, code_cader, codeClasseNum, codebrique,
           now, now, now, activ_prix, JSON.stringify(extraFields)]
        );
        results.push({ row:ri-3, status:"success", gtin, libelle });

      } catch (err) {
        const errMsg = err.message.includes("Duplicate")
          ? `GTIN '${gtin}' en doublon (contrainte BDD)`
          : err.message.slice(0,140);
        results.push({ row:ri-3, status:"error", gtin:gtin||"â€”", error:errMsg });
        failedRows.push(ri);
      }
    }

    await conn.end();

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount   = results.filter(r => r.status === "error").length;

    // â”€â”€ GÃ©nÃ©ration fichier anomalies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let failedFileBase64 = null;
    let failedFileName   = null;

    if (failedRows.length > 0) {
      const fwb = new ExcelJS.Workbook();

      // Copier feuille Pays
      const wsPaysOrig = workbook.getWorksheet("Pays");
      if (wsPaysOrig) {
        const wsPaysNew = fwb.addWorksheet("Pays", { tabColor:{ argb:"FF999999" }, state:"hidden" });
        wsPaysOrig.eachRow((row, rn) => {
          const newRow = wsPaysNew.getRow(rn);
          row.eachCell({ includeEmpty:true }, (cell, cn) => {
            newRow.getCell(cn).value = cell.value;
          });
          newRow.commit();
        });
      }

      const fws = fwb.addWorksheet("Anomalies Import", { tabColor:{ argb:"FFCC0000" } });

      // Copier lignes 1, 2, 3 (structure entÃªte)
      for (let ri = 1; ri <= 3; ri++) {
        const origRow = ws.getRow(ri);
        const newRow  = fws.getRow(ri);
        origRow.eachCell({ includeEmpty:true }, (cell, cn) => {
          const nc = newRow.getCell(cn);
          nc.value = cell.value;
          try { if (cell.style) nc.style = JSON.parse(JSON.stringify(cell.style)); } catch(e) {}
        });
        newRow.height = origRow.height;
        newRow.commit();
      }

      // Ajouter colonne ERREUR dans la ligne 2
      const errColIdx  = headers.length + 1;
      const errHdrCell = fws.getRow(2).getCell(errColIdx);
      errHdrCell.value = "ERREUR D'IMPORT";
      errHdrCell.font  = { bold:true, size:9, color:{ argb:"FFFFFFFF" } };
      errHdrCell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFCC0000" } };
      errHdrCell.alignment = { horizontal:"center", vertical:"middle", wrapText:true };
      fws.getRow(2).commit();

      // Copier lignes en erreur + colonne erreur
      let newDataRow = 4;
      for (const ri of failedRows) {
        const origRow = ws.getRow(ri);
        const newRow  = fws.getRow(newDataRow);
        origRow.eachCell({ includeEmpty:true }, (cell, cn) => {
          const nc = newRow.getCell(cn);
          nc.value = cell.value;
          try { if (cell.style) nc.style = JSON.parse(JSON.stringify(cell.style)); } catch(e) {}
        });
        const entry = results.find(r => r.row === ri-3);
        const errCell = newRow.getCell(errColIdx);
        errCell.value = entry?.error || "Erreur inconnue";
        errCell.font  = { color:{ argb:"FFAA0000" }, size:8 };
        errCell.fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFFF0F0" } };
        newRow.commit();
        newDataRow++;
      }

      fws.columns = [
        ...headers.map(h => ({ width: Math.max(16, Math.min(36, h.length+4)) })),
        { width:55 },
      ];
      fws.views = [{ state:"frozen", xSplit:0, ySplit:3, activeCell:"A4" }];

      const buf = await fwb.xlsx.writeBuffer();
      failedFileBase64 = Buffer.from(buf).toString("base64");
      failedFileName   = `Anomalies_Import_${new Date().toISOString().split("T")[0]}.xlsx`;
    }

    res.json({
      success:         true,
      total:           results.length,
      inserted:        successCount,
      errors:          errorCount,
      results,
      failedFileBase64,
      failedFileName,
    });

  } catch (err) {
    console.error("[import-template]", err);
    res.status(500).json({ error:"Erreur import", details: safeErrDetails(err) });
  }
});


// ========== IMPORT ADVANCED ==========
app.post("/api/products/import-advanced", async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: "No products" });

    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    let inserted = 0, anomalies = [];

    for (let idx = 0; idx < products.length; idx++) {
      try {
        const p = products[idx];
        if (!p.brand || !p.gtin || !p.libelle || !p.brique) {
          anomalies.push({ row: idx + 1, error: "Champs obligatoires manquants" });
          continue;
        }

        let extraFields = {};
        const baseList = ["brand", "gtin", "libelle", "brique", "segment", "famille", "classe"];
        for (const col of Object.keys(p)) {
          if (!baseList.includes(col) && p[col]) extraFields[col] = p[col];
        }

        const sql = `INSERT INTO fiche_produit (brand, gtin, libelle, codebrique, date_create_fp, extra_fields) VALUES (?, ?, ?, ?, ?, ?)`;
        await conn.query(sql, [p.brand, p.gtin, p.libelle, p.brique, now, Object.keys(extraFields).length > 0 ? JSON.stringify(extraFields) : null]);
        inserted++;
      } catch (err) {
        anomalies.push({ row: idx + 1, error: err.message.slice(0, 100) });
      }
    }

    await conn.end();

    if (anomalies.length > 0) {
      const ExcelJS = require('exceljs');
      const awb = new ExcelJS.Workbook();
      const aws = awb.addWorksheet("Anomalies");
      const arow = aws.addRow(["Ligne", "Erreur"]);
      arow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      arow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
      anomalies.forEach(a => {
        const r = aws.addRow([a.row, a.error]);
        r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE6E6" } };
      });
      aws.columns = [{ width: 10 }, { width: 50 }];
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=Rapport_${new Date().toISOString().split('T')[0]}.xlsx`);
      await awb.xlsx.write(res);
      res.end();
    } else {
      res.json({ success: true, inserted, message: `${inserted} produit(s) importÃ©(s)` });
    }
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Import failed" });
  }
});


// ============================================================================
// âœ¨ DOWNLOAD ANOMALIES REPORT
// ============================================================================
app.get("/api/download-anomalies/:filename", (req, res) => {
  try {
    const filePath = path.join(GED_DIR, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="anomalies.xlsx"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download error" });
  }
});


const PORT = process.env.PORT || 5000;
async function startServer() {
  console.log(`[SERVER] ðŸš€ Attempting to start server on port ${PORT}...`);
  try {
    await initializeDatabases();
    app.set('entiteDB', entiteDB); // Expose DB to routes
    
    // Pass db to DiscoveryCache and KeyManager for local fallback
    discoveryCache.setDb(entiteDB);
    keyManager.setDb(entiteDB);
    auditLogger.setDb(entiteDB);
    console.log('[Services] âœ… DiscoveryCache & AuditLogger initialized with DB');

    await ensureOrdersColumns(); // Auto-create Orders date columns
    
    const { Worker } = require('worker_threads');

    // Initialize Singleton Services with DB
    discoveryCache.setDb(entiteDB);
    auditLogger.setDb(entiteDB);
    console.log('[Services] âœ… DiscoveryCache & AuditLogger initialized with DB');

    await ensureOrdersColumns(); // Auto-create Orders date columns
    

    // Initialize Orchestrator Routes (E2EE & Audit)
    try {
      const initOrchestratorRoutes = require('./routes/orchestrator_routes');
      app.use('/api/orchestrator', initOrchestratorRoutes(entiteDB));
      console.log('[Orchestrator] âœ… Routes initialized at /api/orchestrator');
    } catch (orchErr) {
      console.error('[Orchestrator] âš ï¸ Failed to initialize routes:', orchErr.message);
    }

    // Initialize P2P Routes (Receiver)
    try {
      const p2pRoutes = require('./routes/p2p');
      app.use('/api/p2p', p2pRoutes);
      console.log('[P2P] âœ… Routes initialized at /api/p2p');
    } catch (p2pErr) {
      console.error('[P2P] âš ï¸ Failed to initialize routes:', p2pErr.message);
    }
    
    // Initialize ConfigService with database connection
    try {
      await configService.initialize(entiteDB);
      console.log('[ConfigService] âœ… Global parameters loaded from database');
      
      // Start Background Workers (Discovery & Audit Sync)
      // Only start if not in dev/test mode that inhibits workers, or check a config flag
      const enableWorkers = configService.get('ENABLE_P2P_WORKERS') !== 'false';
      
      if (enableWorkers) {
          const discoveryWorkerPath = path.join(__dirname, 'workers/discovery_worker.js');
          const auditWorkerPath = path.join(__dirname, 'workers/audit_sync_worker.js');
          
          const workerConfig = {
              ORCHESTRATOR_URL: configService.get('ORCHESTRATOR_URL'),
              MY_GLN: configService.get('MY_GLN'),
              // Pass DB config for workers if they need their own connection
              dbConfig: require('./config/database').dbConfig
          };

          if (fs.existsSync(discoveryWorkerPath)) {
             new Worker(discoveryWorkerPath, { workerData: workerConfig });
             console.log('[Worker] Discovery Worker started');
          }
          
          if (fs.existsSync(auditWorkerPath)) {
             new Worker(auditWorkerPath, { workerData: workerConfig });
             console.log('[Worker] Audit Sync Worker started');
          }
      }

      // Initialize Mailer after config is ready
      await initMailer();
    } catch (err) {
      console.warn('[ConfigService] âš ï¸ Failed to initialize, using defaults:', err.message);
    }
    
    // Initialize and start EDI Worker
    if (ediWorkerConfig.startup.autoStart) {
      console.log('\nðŸ“¦ Initializing EDI Worker...');
      ediWorker = new EDIWorker(entiteDB);
      initEdiWorkerRoutes(ediWorker);
      ediWorker.start();
    }
    
    // --- DATA CORRECTION ROUTINE ---
    // Fix orders stuck in 'new' status despite being successfully sent via EDI
    try {
      console.log("[STARTUP] ðŸ”§ Running data correction for stuck orders...");
      const fixQuery = `
        UPDATE orders o
        JOIN edi_transmissions t ON t.related_id = o.id_order
        SET o.status = 'sent'
        WHERE o.status = 'new' 
        AND t.related_type = 'ORDER' 
        AND t.status = 'SENT'
        AND t.direction = 'OUTBOUND'
      `;
      
      if (entiteDB.pool) {
        const [result] = await entiteDB.pool.query(fixQuery);
        console.log(`[STARTUP] âœ… Fixed ${result.changedRows} orders status from 'new' to 'sent'`);
      } else {
        // SQLite fallback (SQLite does not support JOIN in UPDATE, use subquery)
        const sqliteFixQuery = `
          UPDATE orders
          SET status = 'sent'
          WHERE status = 'new'
          AND id_order IN (
            SELECT related_id 
            FROM edi_transmissions 
            WHERE related_type = 'ORDER' 
            AND status = 'SENT' 
            AND direction = 'OUTBOUND'
          )
        `;
        await runUpdate(entiteDB, sqliteFixQuery);
        console.log(`[STARTUP] âœ… Data correction query executed`);
      }
    } catch (err) {
      console.error("[STARTUP] âš ï¸ Data correction failed:", err.message);
    }

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`\nâœ… Server running successfully!`);
      console.log(`   â†’ Local:   http://localhost:${PORT}/`);
      console.log(`   â†’ Network: http://0.0.0.0:${PORT}/`);
      console.log(`   â†’ Health:  http://localhost:${PORT}/health`);
      console.log(`   â†’ WebSocket: âœ… Enabled`);
      console.log(`   â†’ EDI Worker: ${ediWorker ? 'âœ… Running' : 'â¸ï¸  Disabled'}\n`);
      console.log(`Server running on port ${PORT}`);
      console.log(`MODELES_DIR: ${MODELES_DIR}`);
      console.log(`FILES_JSON_PATH: ${FILES_JSON_PATH}`);
      const { dbConfig } = require('./config/database');
      console.log(`ENTITE: using MySQL host ${dbConfig.host}`);
      
      // Auto-publish this node's public key to the Orchestrator
      keyManager.publishKeyToOrchestrator().catch(e => console.error('[Startup] Failed to publish key:', e.message));
    });
    
    // Socket.IO connection handler with room-based targeting
    io.on('connection', (socket) => {
      const { id_compte, id_entite } = socket.handshake.query || {};
      
      // Join user-specific and entity-specific rooms for targeted emissions
      if (id_compte) {
        socket.join(`user:${id_compte}`);
        console.log(`[WebSocket] Client ${socket.id} joined room user:${id_compte}`);
      }
      if (id_entite) {
        socket.join(`entity:${id_entite}`);
        console.log(`[WebSocket] Client ${socket.id} joined room entity:${id_entite}`);
      }
      console.log(`[WebSocket] Client connected: ${socket.id} (user:${id_compte || '?'}, entity:${id_entite || '?'})`);
      
      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nðŸ›‘ SIGTERM received, shutting down gracefully...');
  if (ediWorker) {
    ediWorker.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nðŸ›‘ SIGINT received, shutting down gracefully...');
  if (ediWorker) {
    ediWorker.stop();
  }
  process.exit(0);
});

startServer();