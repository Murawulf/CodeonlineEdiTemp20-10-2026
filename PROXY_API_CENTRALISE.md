# Proxy API Centralisé - Documentation

## 🎯 Objectif

Centraliser tous les appels API du frontend via le backend pour :
- ✅ **Éviter les problèmes CORS** en développement local
- ✅ **Améliorer la sécurité** (pas d'exposition directe des URLs)
- ✅ **Faciliter le monitoring** et le logging centralisé
- ✅ **Simplifier la maintenance** (un seul point de configuration)

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + Vite)            │
│  localhost:5173 (dev)               │
│  ou https://dev.codeonline-edi.net  │
└──────────────┬──────────────────────┘
               │
               │ Tous les appels API
               │ passent par le backend local
               ▼
┌─────────────────────────────────────┐
│  Backend Proxy (Node.js)            │
│  localhost:5000                     │
│                                     │
│  Routes:                            │
│  - /api/settings                    │
│  - /api/login                       │
│  - /api/proxy/:target/*             │
└──────────────┬──────────────────────┘
               │
               │ Le backend forward
               │ vers les serveurs appropriés
               ▼
┌─────────────────────────────────────┐
│  Serveurs Distants                  │
│  - Sénégal: dev.codeonline-edi.net  │
│  - Tunisie: edi-dev.codeonline...   │
└─────────────────────────────────────┘
```

## 📁 Fichiers Créés/Modifiés

### 1. **Nouveau Fichier : `backend/routes/api_proxy.js`**

Module de proxy centralisé avec :
- Route générique : `/api/proxy/:target/*`
- Routes spécifiques : `/api/settings`, `/api/login`
- Gestion des erreurs (timeout, connexion, etc.)
- Logging détaillé

### 2. **Modifié : `backend/server.js`**

Ajout du module proxy :
```javascript
const apiProxyRoutes = require('./routes/api_proxy');
app.use('/api', apiProxyRoutes);
```

### 3. **Modifié : `src/contexts/SettingsContext.tsx`**

Détection automatique de l'environnement :
```typescript
if (import.meta.env.DEV) {
  // En dev : utiliser le backend local comme proxy
  return 'http://localhost:5000';
}
// En prod : utiliser l'URL configurée
return import.meta.env.VITE_API_BASE_URL;
```

## 🔌 Utilisation du Proxy

### Route Générique

**Format :** `/api/proxy/:target/:path`

**Exemples :**

```javascript
// Appel vers le serveur local
GET /api/proxy/local/companies
→ Forward vers: http://localhost:5000/api/companies

// Appel vers le serveur Sénégal
GET /api/proxy/senegal/products
→ Forward vers: https://dev.codeonline-edi.net/api/products

// Appel vers le serveur Tunisie
GET /api/proxy/tunisia/orders
→ Forward vers: https://edi-dev.codeonline-info.com/api/orders
```

**Targets disponibles :**
- `local` - Serveur local/principal
- `senegal` / `sn` - Serveur Sénégal
- `tunisia` / `tn` - Serveur Tunisie
- `settings` - Raccourci pour les settings
- `login` - Raccourci pour le login
- `notifications` - Raccourci pour les notifications

### Routes Spécifiques (Raccourcis)

#### 1. Settings
```javascript
// Frontend
GET /api/settings

// Backend proxy forward vers
GET {LOCAL_API_URL}/api/settings
```

#### 2. Login
```javascript
// Frontend
POST /api/login
Body: { email, password }

// Backend proxy forward vers
POST {LOCAL_API_URL}/api/login
```

## 🔧 Configuration

### Environnement de Développement

**`.env` (frontend) :**
```bash
# Pas besoin de VITE_API_BASE_URL en dev
# Le code détecte automatiquement DEV=true
```

**Backend :**
```bash
# Le backend doit tourner sur localhost:5000
node server.js
```

### Environnement de Production

**`.env` (frontend) :**
```bash
VITE_API_BASE_URL=https://dev.codeonline-edi.net
```

**Build :**
```bash
./build-production.sh
```

## 📊 Flux de Données

### Développement Local

```
1. Frontend (localhost:5173)
   ↓ GET /api/settings
   
2. Backend Local (localhost:5000)
   ↓ Proxy vers https://dev.codeonline-edi.net/api/settings
   
3. Serveur Sénégal
   ↓ Retourne les settings
   
4. Backend Local
   ↓ Forward la réponse
   
5. Frontend
   ✅ Settings reçus sans erreur CORS
```

### Production

```
1. Frontend (https://dev.codeonline-edi.net)
   ↓ GET /api/settings
   
2. Backend (même serveur, même domaine)
   ↓ Pas de proxy nécessaire, appel direct
   
3. Retourne les settings
   ✅ Pas de CORS (même origine)
```

## 🚀 Avantages

### 1. **Pas de CORS en Développement**
Le frontend appelle toujours `localhost:5000`, donc même origine.

### 2. **Sécurité Améliorée**
Les URLs des serveurs distants ne sont pas exposées au frontend.

### 3. **Logging Centralisé**
Tous les appels API sont loggés au même endroit :
```
[API Proxy] 📡 GET /api/proxy/senegal/products
[API Proxy] 🌐 Forwarding to: https://dev.codeonline-edi.net/api/products
[API Proxy] ✅ Response: 200
```

### 4. **Gestion d'Erreurs Uniforme**
- Timeout automatique (10s)
- Retry logic possible
- Messages d'erreur cohérents

### 5. **Facilité de Maintenance**
Un seul fichier à modifier pour changer les URLs : `backend/routes/api_proxy.js`

## 🧪 Tests

### Test 1 : Settings en Local

```bash
# Terminal 1 : Backend
cd backend
node server.js

# Terminal 2 : Frontend
npm run dev

# Navigateur : http://localhost:5173
# Console devrait montrer :
[SettingsContext] 🔧 DEV mode: Using local backend proxy at http://localhost:5000
[SettingsContext] 🌐 Loading settings from: http://localhost:5000/api/settings
[SettingsContext] ✅ Settings loaded from API
```

### Test 2 : Login en Local

```bash
# Ouvrir http://localhost:5173
# Tenter de se connecter
# Console devrait montrer :
[Login] 🌐 API_BASE_URL from useLocalApiUrl(): http://localhost:5000
[Login] 🌐 POST request to: http://localhost:5000/api/login
[App] 📤 HTTP Request: POST http://localhost:5000/api/login
[App] 📥 HTTP Response: POST http://localhost:5000/api/login - Status: 200
```

### Test 3 : Proxy Générique

```javascript
// Dans le frontend, tester un appel via le proxy
const response = await axios.get('/api/proxy/senegal/companies', {
  params: { id_entite: 123 }
});

// Backend devrait logger :
[API Proxy] 📡 GET /api/proxy/senegal/companies
[API Proxy] 🌐 Forwarding to: https://dev.codeonline-edi.net/api/companies
[API Proxy] ✅ Response: 200
```

## 🔍 Débogage

### Problème : CORS persiste

**Vérifier :**
1. Le backend tourne sur `localhost:5000`
2. Le frontend détecte bien `DEV=true`
3. Les logs montrent `http://localhost:5000` et non l'URL distante

### Problème : 503 Service Unavailable

**Cause :** Le backend ne peut pas joindre le serveur distant

**Solution :**
1. Vérifier la connexion internet
2. Vérifier que le serveur distant est accessible
3. Vérifier les paramètres dans la BDD (`app_parameters`)

### Problème : Timeout

**Cause :** Le serveur distant met trop de temps à répondre

**Solution :**
Augmenter le timeout dans `api_proxy.js` :
```javascript
const DEFAULT_TIMEOUT = 30000; // 30 secondes au lieu de 10
```

## 📝 Migration des Appels Existants

Pour migrer un appel API existant vers le proxy :

### Avant
```typescript
// Appel direct au serveur distant
const response = await axios.get(
  'https://dev.codeonline-edi.net/api/companies'
);
```

### Après (Option 1 : Via proxy générique)
```typescript
// Via le proxy backend
const response = await axios.get(
  '/api/proxy/senegal/companies'
);
```

### Après (Option 2 : Via settings)
```typescript
// Utiliser l'URL locale qui sera proxifiée
const API_BASE_URL = useLocalApiUrl(); // Retourne localhost:5000 en dev
const response = await axios.get(
  `${API_BASE_URL}/api/companies`
);
```

## 🎯 Prochaines Étapes

1. ✅ Créer le module proxy (`api_proxy.js`)
2. ✅ Intégrer dans `server.js`
3. ✅ Modifier `SettingsContext.tsx`
4. ⏳ Tester en local
5. ⏳ Déployer en production
6. ⏳ Migrer progressivement les autres appels API

## 📚 Références

- Module proxy : `backend/routes/api_proxy.js`
- Configuration backend : `backend/server.js:9700-9705`
- Configuration frontend : `src/contexts/SettingsContext.tsx:105-120`
- Service de config : `backend/services/configService.js`

---

**Note :** Cette architecture est évolutive. On peut facilement ajouter :
- Cache côté backend
- Rate limiting
- Authentication/Authorization centralisée
- Monitoring et métriques
- Load balancing entre plusieurs serveurs
