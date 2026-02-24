# Fix : Login utilise localhost au lieu du serveur Sénégal

## Problème
Le login tentait de se connecter à `http://localhost:5001/api/login` au lieu de `https://dev.codeonline-edi.net/api/login`

## Cause
Les variables d'environnement Vite ne sont chargées qu'au démarrage du serveur de développement. Si le `.env` a été modifié après le démarrage, il faut redémarrer Vite.

## Solution Appliquée

### 1. Configuration `.env` ✅
Le fichier `.env` contient déjà la bonne URL :
```bash
VITE_API_BASE_URL=https://dev.codeonline-edi.net
```

### 2. Corrections dans `SettingsContext.tsx` ✅

**Ligne 83 - DEFAULT_SETTINGS :**
```typescript
LOCAL_API_URL: import.meta.env.VITE_API_BASE_URL || 'https://dev.codeonline-edi.net',
```

**Ligne 190 - getLocalApiUrl() :**
```typescript
return settings.LOCAL_API_URL || settings.API_URL_BUYER || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
```

## 🚀 Actions Requises

### **IMPORTANT : Redémarrer le serveur Vite**

Les variables d'environnement Vite (`import.meta.env.*`) sont injectées au **build time**, pas au runtime. Il faut donc redémarrer le serveur de développement :

```bash
# Arrêter le serveur Vite actuel (Ctrl+C)
# Puis relancer :
npm run dev
# ou
yarn dev
```

### Vérification après redémarrage

1. **Ouvrir la console du navigateur** (F12)
2. **Avant de vous connecter**, vérifier que l'URL est correcte :
   ```javascript
   console.log(import.meta.env.VITE_API_BASE_URL)
   // Devrait afficher : https://dev.codeonline-edi.net
   ```

3. **Tenter de se connecter** et vérifier dans l'onglet Network :
   - La requête POST doit aller vers : `https://dev.codeonline-edi.net/api/login` ✅
   - Et non vers : `http://localhost:5001/api/login` ❌

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend (Vite + React)            │
│  https://dev.codeonline-edi.net     │
│                                     │
│  .env:                              │
│  VITE_API_BASE_URL=                 │
│    https://dev.codeonline-edi.net   │
└──────────────┬──────────────────────┘
               │
               │ POST /api/login
               ▼
┌─────────────────────────────────────┐
│  Backend (Node.js + Express)        │
│  https://dev.codeonline-edi.net     │
│  Port: 5000                         │
└─────────────────────────────────────┘
```

## Ordre de priorité des URLs

Le `getLocalApiUrl()` utilise cette cascade :

1. **`settings.LOCAL_API_URL`** - Chargé depuis la BDD via `/api/settings`
2. **`settings.API_URL_BUYER`** - Legacy fallback
3. **`import.meta.env.VITE_API_BASE_URL`** - Variable d'environnement Vite (`.env`)
4. **`'http://localhost:5000'`** - Dernier fallback (dev local uniquement)

## Notes pour le déploiement en production

Sur le serveur Sénégal, assurez-vous que :

1. Le fichier `.env` ou `.env.production` contient :
   ```bash
   VITE_API_BASE_URL=https://dev.codeonline-edi.net
   ```

2. Le build Vite est fait **après** avoir configuré le `.env` :
   ```bash
   npm run build
   ```

3. Les fichiers statiques sont servis depuis le même domaine que le backend pour éviter les problèmes CORS.

## Dépannage

### Si le login utilise encore localhost après redémarrage :

1. **Vider le cache du navigateur** (Ctrl+Shift+Delete)
2. **Hard refresh** (Ctrl+Shift+R ou Cmd+Shift+R sur Mac)
3. Vérifier dans la console :
   ```javascript
   console.log(import.meta.env.VITE_API_BASE_URL)
   ```
4. Si undefined, vérifier que le fichier `.env` est à la racine du projet (même niveau que `package.json`)

### Si les settings ne se chargent pas depuis `/api/settings` :

Le `SettingsContext` essaie de charger les paramètres depuis `https://dev.codeonline-edi.net/api/settings` au démarrage. Si cet appel échoue, il utilise les valeurs par défaut.

Vérifier dans la console Network que cet appel réussit (status 200).
