# 📋 Proposition de Refactoring : server.js

## 🎯 Objectif

Découper le fichier monolithique `server.js` (~9800 lignes) en modules métiers et techniques distincts pour améliorer la maintenabilité, la lisibilité et la scalabilité du code.

---

## 📊 Analyse du Fichier Actuel

### Statistiques
- **Taille** : ~9800 lignes
- **Routes API** : ~150+ endpoints
- **Domaines métiers** : 8+ domaines distincts
- **Fonctions techniques** : Configuration, middleware, base de données, authentification

### Problèmes Identifiés
1. ❌ Fichier monolithique difficile à maintenir
2. ❌ Mélange de logique métier et technique
3. ❌ Duplication de code (connexions DB, validation)
4. ❌ Difficulté à tester unitairement
5. ❌ Risque de conflits Git en équipe
6. ❌ Temps de chargement et compréhension élevés

---

## 🏗️ Architecture Proposée

```
backend/
├── server.js                          # Point d'entrée principal (100-150 lignes)
├── config/
│   ├── database.js                    # Configuration MySQL/SQLite
│   ├── environment.js                 # Variables d'environnement
│   ├── multer.js                      # Configuration uploads
│   └── edi_worker_config.js          # ✅ Déjà existant
├── middleware/
│   ├── authentication.js              # Middleware authenticate
│   ├── errorHandler.js                # Gestion globale des erreurs
│   ├── logging.js                     # Logs API
│   └── validation.js                  # Validation des requêtes
├── services/
│   ├── configService.js               # ✅ Déjà existant
│   ├── databaseService.js             # Gestion connexions DB
│   ├── emailService.js                # Envoi emails (Brevo/Nodemailer)
│   ├── pdfService.js                  # Génération PDF
│   └── fileService.js                 # Gestion fichiers/GED
├── routes/
│   ├── index.js                       # Router principal
│   ├── settings_routes.js             # ✅ Déjà existant
│   ├── edi_worker_routes.js           # ✅ Déjà existant
│   ├── auth.routes.js                 # Authentification/Login
│   ├── gpc.routes.js                  # Segments/Familles/Classes/Bricks
│   ├── products.routes.js             # Produits/Catalogue/PIM
│   ├── accounts.routes.js             # Comptes/Profils/Permissions
│   ├── orders.routes.js               # Commandes EDI
│   ├── shipments.routes.js            # DESADV/Expéditions
│   ├── invoices.routes.js             # INVOIC/Factures
│   ├── transport.routes.js            # Transport/Tracking
│   ├── ged.routes.js                  # GED/Documents
│   ├── entities.routes.js             # Entités/Entreprises
│   └── regions.routes.js              # Régions/Délégations/Localités
├── controllers/
│   ├── auth.controller.js
│   ├── gpc.controller.js
│   ├── products.controller.js
│   ├── accounts.controller.js
│   ├── orders.controller.js
│   ├── shipments.controller.js
│   ├── invoices.controller.js
│   ├── transport.controller.js
│   ├── ged.controller.js
│   ├── entities.controller.js
│   └── regions.controller.js
├── models/                            # (Optionnel - si ORM)
│   ├── Order.js
│   ├── Account.js
│   └── ...
├── utils/
│   ├── db_utils.js                    # ✅ Déjà existant
│   ├── validators.js                  # Fonctions de validation
│   ├── generators.js                  # generatePassword, generateCerticode
│   └── helpers.js                     # Fonctions utilitaires
├── workers/
│   └── edi_worker.js                  # ✅ Déjà existant
└── helpers/
    ├── edi_transmission_helper.js     # ✅ Déjà existant
    └── notification_helper.js         # ✅ Déjà existant
```

---

## 📦 Découpage Détaillé par Module

### 1️⃣ **Modules Techniques** (Infrastructure)

#### `config/database.js`
```javascript
// Configuration centralisée des connexions DB
module.exports = {
  ENTITE_MYSQL_CONFIG: { ... },
  ALLGPC_DB_PATH: '...',
  FIELDRULES_DB_PATH: '...',
  USERS_DB_PATH: '...'
};
```

#### `config/environment.js`
```javascript
// Variables d'environnement
module.exports = {
  API_PIN: process.env.API_PIN || '3311',
  EANCOM_BASE_DIR: process.env.EANCOM_BASE_DIR || '...',
  MODELES_DIR: process.env.MODELES_DIR || '...',
  GED_DIR: process.env.GED_DIR || '...',
  BREVO_SMTP_USER: process.env.BREVO_SMTP_USER || '...',
  // ...
};
```

#### `config/multer.js`
```javascript
// Configuration uploads (GED, Logo, Facture, etc.)
const multer = require('multer');

const gedStorage = multer.diskStorage({ ... });
const logoStorage = multer.diskStorage({ ... });

module.exports = {
  uploadGed: multer({ storage: gedStorage, ... }),
  uploadLogo: multer({ storage: logoStorage, ... }),
  uploadFacture: multer({ ... })
};
```

#### `middleware/authentication.js`
```javascript
const { queryDB } = require('../utils/db_utils');

const authenticate = async (req, res, next) => {
  // Logique d'authentification
};

module.exports = { authenticate };
```

#### `middleware/logging.js`
```javascript
// Middleware de logging API
const apiLogger = (req, res, next) => {
  const start = Date.now();
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    console.log(`[API] ${req.method} ${req.originalUrl} => ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
};

module.exports = { apiLogger };
```

#### `services/databaseService.js`
```javascript
// Initialisation et gestion des connexions DB
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');

class DatabaseService {
  constructor() {
    this.connections = {};
  }

  async initializeDatabases() {
    // Logique d'initialisation
  }

  getConnection(name) {
    return this.connections[name];
  }
}

module.exports = new DatabaseService();
```

#### `services/emailService.js`
```javascript
// Service d'envoi d'emails
const nodemailer = require('nodemailer');

class EmailService {
  async sendCerticode(email, certicode) { ... }
  async sendPasswordReset(email, password) { ... }
  async sendWelcomeEmail(email, name) { ... }
}

module.exports = new EmailService();
```

#### `services/pdfService.js`
```javascript
// Génération de PDF (étiquettes, factures, etc.)
const { PDFDocument } = require('pdf-lib');

class PDFService {
  async generateShippingLabel(data) { ... }
  async generateInvoice(data) { ... }
}

module.exports = new PDFService();
```

#### `services/fileService.js`
```javascript
// Gestion fichiers et GED
const fs = require('fs').promises;

class FileService {
  async saveFile(path, content) { ... }
  async deleteFile(path) { ... }
  async listFiles(directory) { ... }
}

module.exports = new FileService();
```

---

### 2️⃣ **Modules Métiers** (Business Logic)

#### **Domaine : Authentification**
- **Routes** : `routes/auth.routes.js`
- **Controller** : `controllers/auth.controller.js`
- **Endpoints** :
  - `POST /api/login` - Connexion
  - `POST /api/request-certicode` - Demande certicode
  - `POST /api/verify-certicode` - Vérification certicode
  - `POST /api/change-password` - Changement mot de passe

#### **Domaine : GPC (Segments/Familles/Classes/Bricks)**
- **Routes** : `routes/gpc.routes.js`
- **Controller** : `controllers/gpc.controller.js`
- **Endpoints** :
  - `GET /api/segments` - Liste segments
  - `POST /api/update-segment` - Mise à jour segment
  - `POST /api/update-segment-status` - Activation/désactivation
  - `GET /api/familles` - Liste familles
  - `POST /api/update-famille` - Mise à jour famille
  - `GET /api/classes` - Liste classes
  - `GET /api/bricks` - Liste bricks
  - ... (10+ endpoints)

#### **Domaine : Produits/Catalogue/PIM**
- **Routes** : `routes/products.routes.js`
- **Controller** : `controllers/products.controller.js`
- **Endpoints** :
  - `GET /api/products` - Liste produits
  - `POST /api/products` - Créer produit
  - `PUT /api/products/:id` - Modifier produit
  - `DELETE /api/products/:id` - Supprimer produit
  - `GET /api/fieldrules` - Règles de champs PIM
  - `POST /api/upload-excel` - Import Excel
  - ... (20+ endpoints)

#### **Domaine : Comptes/Profils/Permissions**
- **Routes** : `routes/accounts.routes.js`
- **Controller** : `controllers/accounts.controller.js`
- **Endpoints** :
  - `GET /api/comptes` - Liste comptes
  - `POST /api/comptes` - Créer compte
  - `PUT /api/comptes/:id` - Modifier compte
  - `DELETE /api/comptes/:id` - Supprimer compte
  - `GET /api/profiles` - Liste profils
  - `POST /api/profiles` - Créer profil
  - `GET /api/account-permissions/:id` - Permissions compte
  - ... (15+ endpoints)

#### **Domaine : Commandes EDI (ORDERS)**
- **Routes** : `routes/orders.routes.js`
- **Controller** : `controllers/orders.controller.js`
- **Endpoints** :
  - `GET /api/orders/incoming` - Commandes reçues
  - `GET /api/orders/sent` - Commandes envoyées
  - `POST /api/orders` - Créer commande
  - `POST /api/orders/eancom` - Recevoir ORDERS EANCOM
  - `POST /api/orders/:id/send` - Envoyer commande
  - `POST /api/orders/:id/validate` - Valider commande
  - ... (10+ endpoints)

#### **Domaine : Expéditions (DESADV)**
- **Routes** : `routes/shipments.routes.js`
- **Controller** : `controllers/shipments.controller.js`
- **Endpoints** :
  - `GET /api/edi/desadv` - Liste DESADV
  - `POST /api/edi/desadv` - Créer DESADV
  - `POST /api/edi/desadv/send` - Envoyer DESADV
  - `POST /api/edi/desadv/:id/packages` - Ajouter colis
  - `GET /api/edi/desadv/:id/label` - Générer étiquette
  - ... (8+ endpoints)

#### **Domaine : Factures (INVOIC)**
- **Routes** : `routes/invoices.routes.js`
- **Controller** : `controllers/invoices.controller.js`
- **Endpoints** :
  - `GET /api/invoices` - Liste factures
  - `POST /api/invoices` - Créer facture
  - `POST /api/invoices/:id/send` - Envoyer facture
  - `GET /api/invoices/:id/pdf` - Générer PDF
  - ... (6+ endpoints)

#### **Domaine : Transport/Tracking**
- **Routes** : `routes/transport.routes.js`
- **Controller** : `controllers/transport.controller.js`
- **Endpoints** :
  - `GET /api/transport-orders` - Liste ordres transport
  - `POST /api/transport-orders` - Créer ordre transport
  - `GET /api/tracking/:shipmentId` - Suivi colis
  - `POST /api/tracking` - Ajouter événement tracking
  - ... (5+ endpoints)

#### **Domaine : GED (Gestion Électronique Documents)**
- **Routes** : `routes/ged.routes.js`
- **Controller** : `controllers/ged.controller.js`
- **Endpoints** :
  - `POST /api/ged/upload` - Upload document
  - `GET /api/ged/documents` - Liste documents
  - `GET /api/ged/documents/:id` - Télécharger document
  - `DELETE /api/ged/documents/:id` - Supprimer document
  - ... (8+ endpoints)

#### **Domaine : Entités/Entreprises**
- **Routes** : `routes/entities.routes.js`
- **Controller** : `controllers/entities.controller.js`
- **Endpoints** :
  - `GET /api/entites` - Liste entités
  - `POST /api/entites` - Créer entité
  - `PUT /api/entites/:id` - Modifier entité
  - `POST /api/entites/:id/logo` - Upload logo
  - ... (10+ endpoints)

#### **Domaine : Régions/Géographie**
- **Routes** : `routes/regions.routes.js`
- **Controller** : `controllers/regions.controller.js`
- **Endpoints** :
  - `GET /api/regions` - Liste régions
  - `GET /api/delegations` - Liste délégations
  - `POST /api/localites` - Liste localités
  - ... (3+ endpoints)

---

## 🔄 Plan de Migration

### Phase 1 : Préparation (Semaine 1)
1. ✅ Créer l'arborescence de dossiers
2. ✅ Créer les fichiers de configuration
3. ✅ Extraire les middlewares
4. ✅ Créer les services techniques

### Phase 2 : Migration Modules Techniques (Semaine 2)
1. ✅ Migrer `config/database.js`
2. ✅ Migrer `config/environment.js`
3. ✅ Migrer `config/multer.js`
4. ✅ Migrer `middleware/authentication.js`
5. ✅ Migrer `middleware/logging.js`
6. ✅ Migrer `services/emailService.js`
7. ✅ Migrer `services/pdfService.js`
8. ✅ Migrer `services/fileService.js`

### Phase 3 : Migration Modules Métiers (Semaines 3-5)
**Ordre de priorité** :

1. **Priorité Haute** (Semaine 3)
   - ✅ `auth.routes.js` + `auth.controller.js`
   - ✅ `orders.routes.js` + `orders.controller.js`
   - ✅ `accounts.routes.js` + `accounts.controller.js`

2. **Priorité Moyenne** (Semaine 4)
   - ✅ `shipments.routes.js` + `shipments.controller.js`
   - ✅ `invoices.routes.js` + `invoices.controller.js`
   - ✅ `transport.routes.js` + `transport.controller.js`
   - ✅ `gpc.routes.js` + `gpc.controller.js`

3. **Priorité Basse** (Semaine 5)
   - ✅ `products.routes.js` + `products.controller.js`
   - ✅ `ged.routes.js` + `ged.controller.js`
   - ✅ `entities.routes.js` + `entities.controller.js`
   - ✅ `regions.routes.js` + `regions.controller.js`

### Phase 4 : Refactoring server.js (Semaine 6)
1. ✅ Nettoyer `server.js` (garder uniquement l'initialisation)
2. ✅ Importer les routes
3. ✅ Monter les routes
4. ✅ Tests de régression

### Phase 5 : Tests et Validation (Semaine 7)
1. ✅ Tests unitaires par module
2. ✅ Tests d'intégration
3. ✅ Tests de charge
4. ✅ Validation métier

---

## 📝 Exemple de Refactoring

### AVANT : server.js (lignes 1067-1080)
```javascript
app.get('/api/regions', async (req, res) => {
  try {
    const conn = await mysql.createConnection(ENTITE_MYSQL_CONFIG);
    const [rows] = await conn.query('SELECT DISTINCT gouvernorat AS region FROM Region_national WHERE gouvernorat IS NOT NULL');
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching regions:', err.message);
    res.status(500).json({ error: 'Failed to fetch regions', details: err.message });
  }
});
```

### APRÈS : Structure modulaire

#### `routes/regions.routes.js`
```javascript
const express = require('express');
const router = express.Router();
const regionsController = require('../controllers/regions.controller');

router.get('/regions', regionsController.getRegions);
router.get('/delegations', regionsController.getDelegations);
router.post('/localites', regionsController.getLocalites);

module.exports = router;
```

#### `controllers/regions.controller.js`
```javascript
const databaseService = require('../services/databaseService');

exports.getRegions = async (req, res) => {
  try {
    const conn = await databaseService.getConnection('entite');
    const [rows] = await conn.query(
      'SELECT DISTINCT gouvernorat AS region FROM Region_national WHERE gouvernorat IS NOT NULL'
    );
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching regions:', err.message);
    res.status(500).json({ 
      error: 'Failed to fetch regions', 
      details: err.message 
    });
  }
};

exports.getDelegations = async (req, res) => { ... };
exports.getLocalites = async (req, res) => { ... };
```

#### `server.js` (nouveau - simplifié)
```javascript
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Configuration
const { apiLogger } = require('./middleware/logging');
const { authenticate } = require('./middleware/authentication');
const databaseService = require('./services/databaseService');
const configService = require('./services/configService');

// Routes
const authRoutes = require('./routes/auth.routes');
const gpcRoutes = require('./routes/gpc.routes');
const productsRoutes = require('./routes/products.routes');
const accountsRoutes = require('./routes/accounts.routes');
const ordersRoutes = require('./routes/orders.routes');
const shipmentsRoutes = require('./routes/shipments.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const transportRoutes = require('./routes/transport.routes');
const gedRoutes = require('./routes/ged.routes');
const entitiesRoutes = require('./routes/entities.routes');
const regionsRoutes = require('./routes/regions.routes');
const settingsRoutes = require('./routes/settings_routes');
const ediWorkerRoutes = require('./routes/edi_worker_routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Middleware global
app.use(express.json());
app.use(apiLogger);

// Routes publiques
app.use('/api/auth', authRoutes);

// Routes protégées
app.use('/api/gpc', authenticate, gpcRoutes);
app.use('/api/products', authenticate, productsRoutes);
app.use('/api/accounts', authenticate, accountsRoutes);
app.use('/api/orders', authenticate, ordersRoutes);
app.use('/api/shipments', authenticate, shipmentsRoutes);
app.use('/api/invoices', authenticate, invoicesRoutes);
app.use('/api/transport', authenticate, transportRoutes);
app.use('/api/ged', authenticate, gedRoutes);
app.use('/api/entities', authenticate, entitiesRoutes);
app.use('/api/regions', authenticate, regionsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/edi-worker', ediWorkerRoutes);

// Démarrage serveur
const PORT = process.env.PORT || 5001;
async function startServer() {
  await databaseService.initializeDatabases();
  await configService.initialize(databaseService.getConnection('entite'));
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

startServer();
```

---

## ✅ Avantages du Refactoring

### 1. **Maintenabilité**
- ✅ Code organisé par domaine métier
- ✅ Fichiers de taille raisonnable (100-300 lignes)
- ✅ Responsabilités claires (SRP - Single Responsibility Principle)

### 2. **Testabilité**
- ✅ Tests unitaires par controller
- ✅ Mocking facile des services
- ✅ Tests d'intégration par route

### 3. **Scalabilité**
- ✅ Ajout de nouvelles fonctionnalités facilité
- ✅ Réutilisation du code (services)
- ✅ Évolution indépendante des modules

### 4. **Collaboration**
- ✅ Moins de conflits Git
- ✅ Revues de code plus simples
- ✅ Onboarding développeurs facilité

### 5. **Performance**
- ✅ Chargement lazy possible
- ✅ Cache par module
- ✅ Optimisation ciblée

---

## ⚠️ Points d'Attention

### 1. **Rétrocompatibilité**
- Conserver les mêmes endpoints
- Maintenir les mêmes signatures de réponse
- Tests de régression complets

### 2. **Migration Progressive**
- Ne pas tout refactorer d'un coup
- Valider chaque module avant de passer au suivant
- Garder `server.js` fonctionnel pendant la migration

### 3. **Documentation**
- Documenter chaque module
- Mettre à jour le README
- Créer des guides pour les développeurs

### 4. **Tests**
- Tests unitaires pour chaque controller
- Tests d'intégration pour chaque route
- Tests de charge pour valider les performances

---

## 📊 Métriques de Succès

| Métrique | Avant | Après (Objectif) |
|----------|-------|------------------|
| Taille server.js | 9800 lignes | < 200 lignes |
| Nombre de fichiers | 1 fichier | ~40 fichiers |
| Taille moyenne fichier | 9800 lignes | 100-300 lignes |
| Couverture tests | 0% | > 80% |
| Temps onboarding | 2 semaines | 3 jours |
| Conflits Git/mois | 10+ | < 2 |

---

## 🚀 Prochaines Étapes

1. **Validation de la proposition** par l'équipe
2. **Création d'une branche** `refactor/server-modularization`
3. **Démarrage Phase 1** : Préparation de l'arborescence
4. **Migration progressive** module par module
5. **Tests et validation** à chaque étape
6. **Merge** après validation complète

---

## 📚 Ressources

- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Node.js Project Structure](https://github.com/goldbergyoni/nodebestpractices)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Date de création** : 3 février 2026  
**Auteur** : Équipe Technique CodeOnline  
**Statut** : 📋 Proposition - En attente de validation
