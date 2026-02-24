# Guide d'Architecture API - Distinction Local vs Remote

## 🎯 Vue d'Ensemble

Notre application utilise **deux types d'appels API distincts** qu'il est crucial de bien comprendre et d'utiliser correctement :

### 1️⃣ API Backend Local (`LOCAL_API_URL`)
**Définition** : Notre propre serveur backend qui gère la logique métier de l'application.

**Cas d'usage** :
- ✅ Authentification et gestion des sessions
- ✅ Gestion des comptes utilisateurs
- ✅ Notifications système
- ✅ Catalogue produits (PIM)
- ✅ Gestion documentaire (GED)
- ✅ Toute opération CRUD sur nos propres données

**Configuration** :
- Paramètre BDD : `LOCAL_API_URL`
- Valeur par défaut : `http://localhost:5001`
- Hook React : `useLocalApiUrl()`

### 2️⃣ API Serveurs Distants (`API_URL_SENEGAL`, `API_URL_TUNISIA`)
**Définition** : Serveurs d'autres pays pour les appels mutuels inter-pays.

**Cas d'usage** :
- ✅ Récupération de commandes EDI depuis un autre pays
- ✅ Synchronisation de données entre pays
- ✅ Consultation de catalogues distants
- ✅ Échanges B2B inter-pays

**Configuration** :
- Paramètres BDD : `API_URL_SENEGAL`, `API_URL_TUNISIA`
- Valeurs par défaut :
  - Sénégal : `https://codeonline-edi.net`
  - Tunisie : `https://edi-dev.codeonline-info.com`
- Hook React : `useRemoteServerUrl('senegal')` ou `useRemoteServerUrl('tunisia')`

---

## 📚 Guide d'Utilisation

### Pour les Développeurs Frontend (React)

#### Appels au Backend Local

```tsx
import { useLocalApiUrl } from '@/contexts/SettingsContext';
import axios from 'axios';

function MyComponent() {
  const localApiUrl = useLocalApiUrl();
  
  // Exemple : Récupérer la liste des comptes
  const fetchAccounts = async () => {
    const response = await axios.get(`${localApiUrl}/api/comptes`, {
      withCredentials: true,
      headers: { 'x-api-pin': localStorage.getItem('pin') || '3311' }
    });
    return response.data;
  };
  
  // Exemple : Authentification
  const login = async (email: string, password: string) => {
    const response = await axios.post(`${localApiUrl}/api/login`, {
      email,
      password
    }, { withCredentials: true });
    return response.data;
  };
}
```

#### Appels aux Serveurs Distants

```tsx
import { useRemoteServerUrl } from '@/contexts/SettingsContext';
import axios from 'axios';

function EDIComponent() {
  const senegalUrl = useRemoteServerUrl('senegal');
  const tunisiaUrl = useRemoteServerUrl('tunisia');
  
  // Exemple : Récupérer des commandes depuis le Sénégal
  const fetchOrdersFromSenegal = async () => {
    const response = await axios.get(`${senegalUrl}/api/orders/incoming`, {
      headers: { 'x-api-pin': localStorage.getItem('pin') || '3311' }
    });
    return response.data;
  };
  
  // Exemple : Synchroniser avec la Tunisie
  const syncWithTunisia = async (orderId: string) => {
    const response = await axios.post(`${tunisiaUrl}/api/sync/order`, {
      orderId
    }, {
      headers: { 'x-api-pin': localStorage.getItem('pin') || '3311' }
    });
    return response.data;
  };
}
```

#### Utilisation Avancée : Accès Direct aux Settings

```tsx
import { useSettings } from '@/contexts/SettingsContext';

function AdvancedComponent() {
  const { settings, getLocalApiUrl, getRemoteServerUrl } = useSettings();
  
  // Accès aux URLs
  const localUrl = getLocalApiUrl();
  const senegalUrl = getRemoteServerUrl('senegal');
  
  // Accès à d'autres paramètres
  const appName = settings.APP_NAME;
  const timeout = settings.API_TIMEOUT;
  const currency = settings.DEFAULT_CURRENCY;
  
  return (
    <div>
      <h1>{appName}</h1>
      <p>Timeout: {timeout}ms</p>
      <p>Currency: {currency}</p>
    </div>
  );
}
```

---

### Pour les Développeurs Backend (Node.js)

#### Accès aux Paramètres via ConfigService

```javascript
const configService = require('./services/configService');

// Récupérer LOCAL_API_URL
const localApiUrl = configService.get('LOCAL_API_URL');

// Récupérer les URLs des serveurs distants
const senegalUrl = configService.get('API_URL_SENEGAL');
const tunisiaUrl = configService.get('API_URL_TUNISIA');

// Récupérer le PIN (non public)
const apiPin = configService.get('API_PIN');

// Exemple : Faire un appel à un serveur distant
const axios = require('axios');

async function fetchFromRemoteServer(country) {
  const remoteUrl = country === 'senegal' 
    ? configService.get('API_URL_SENEGAL')
    : configService.get('API_URL_TUNISIA');
    
  const response = await axios.get(`${remoteUrl}/api/data`, {
    headers: { 'x-api-pin': configService.get('API_PIN') }
  });
  
  return response.data;
}
```

---

## 🔧 Configuration et Déploiement

### Étape 1 : Exécuter la Migration SQL

```bash
cd backend
node run_migration_local_api.js
```

Cette migration ajoute le paramètre `LOCAL_API_URL` à la table `app_parameters`.

### Étape 2 : Configurer les URLs selon l'Environnement

#### Environnement de Développement Local

```sql
UPDATE app_parameters SET param_value = 'http://localhost:5001' WHERE param_key = 'LOCAL_API_URL';
UPDATE app_parameters SET param_value = 'https://codeonline-edi.net' WHERE param_key = 'API_URL_SENEGAL';
UPDATE app_parameters SET param_value = 'https://edi-dev.codeonline-info.com' WHERE param_key = 'API_URL_TUNISIA';
```

#### Environnement de Production Sénégal

```sql
UPDATE app_parameters SET param_value = 'https://codeonline-edi.net/api' WHERE param_key = 'LOCAL_API_URL';
UPDATE app_parameters SET param_value = 'https://codeonline-edi.net' WHERE param_key = 'API_URL_SENEGAL';
UPDATE app_parameters SET param_value = 'https://edi-dev.codeonline-info.com' WHERE param_key = 'API_URL_TUNISIA';
```

#### Environnement de Production Tunisie

```sql
UPDATE app_parameters SET param_value = 'https://edi-dev.codeonline-info.com/api' WHERE param_key = 'LOCAL_API_URL';
UPDATE app_parameters SET param_value = 'https://codeonline-edi.net' WHERE param_key = 'API_URL_SENEGAL';
UPDATE app_parameters SET param_value = 'https://edi-dev.codeonline-info.com' WHERE param_key = 'API_URL_TUNISIA';
```

### Étape 3 : Redémarrer le Serveur Backend

```bash
# Arrêter le serveur actuel
pm2 stop codeonline-edi

# Redémarrer avec rechargement des paramètres
pm2 restart codeonline-edi
```

### Étape 4 : Vérifier le Chargement des Paramètres

Consulter les logs du serveur pour confirmer :
```
[ConfigService] ✅ Initialized with X parameters
[ConfigService] Loaded parameters: LOCAL_API_URL, API_URL_SENEGAL, API_URL_TUNISIA, ...
```

---

## 🚨 Erreurs Courantes et Solutions

### Erreur : "useSettings must be used within a SettingsProvider"

**Cause** : Le composant utilise `useLocalApiUrl()` ou `useRemoteServerUrl()` en dehors du `SettingsProvider`.

**Solution** : Vérifier que `App.tsx` enveloppe bien l'application avec `SettingsProvider` :

```tsx
// src/App.tsx
import { SettingsProvider } from '@/contexts/SettingsContext';

function App() {
  return (
    <SettingsProvider>
      {/* Reste de l'application */}
    </SettingsProvider>
  );
}
```

### Erreur : "Cannot read property 'LOCAL_API_URL' of undefined"

**Cause** : Les paramètres ne sont pas encore chargés depuis la BDD.

**Solution** : Utiliser `isReady` pour attendre le chargement :

```tsx
import { useSettings } from '@/contexts/SettingsContext';

function MyComponent() {
  const { isReady, isLoading } = useSettings();
  
  if (isLoading || !isReady) {
    return <div>Chargement des paramètres...</div>;
  }
  
  // Utiliser les paramètres en toute sécurité
}
```

### Erreur : "Mixed Content" (HTTPS/HTTP)

**Cause** : Tentative d'appel HTTP depuis une page HTTPS.

**Solution** : Configurer les URLs avec HTTPS en production :

```sql
UPDATE app_parameters SET param_value = 'https://codeonline-edi.net/api' WHERE param_key = 'LOCAL_API_URL';
```

---

## 📋 Checklist de Migration

Lors de la migration d'un fichier avec URLs en dur :

- [ ] Identifier le type d'appel : Local ou Remote ?
- [ ] Importer le bon hook : `useLocalApiUrl()` ou `useRemoteServerUrl()`
- [ ] Remplacer les URLs en dur par les hooks
- [ ] Tester les appels API en environnement local
- [ ] Vérifier que `SettingsProvider` est bien configuré dans `App.tsx`
- [ ] Tester en environnement de développement
- [ ] Documenter les changements si nécessaire

---

## 🔍 Références

- **Audit complet** : `HARDCODED_URLS_AUDIT.md`
- **Documentation globale** : `GLOBAL_SETTINGS_README.md`
- **Guide de déploiement** : `DEPLOYMENT_GUIDE.md`
- **Migration SQL** : `backend/migrations/add_local_api_url.sql`
- **SettingsContext** : `src/contexts/SettingsContext.tsx`
- **ConfigService** : `backend/services/configService.js`

---

## 💡 Bonnes Pratiques

1. **Toujours utiliser les hooks** : Ne jamais coder en dur les URLs, même temporairement.

2. **Distinguer Local vs Remote** : Bien identifier le type d'appel avant de choisir le hook.

3. **Gérer le chargement** : Toujours vérifier `isReady` avant d'utiliser les paramètres dans les composants critiques.

4. **Sécurité** : Ne jamais exposer `API_PIN` côté client. Utiliser `localStorage.getItem('pin')` comme fallback.

5. **Tests** : Tester les appels API dans tous les environnements (local, dev, prod).

6. **Documentation** : Documenter tout nouveau paramètre ajouté à `app_parameters`.

---

**Date de création** : 2026-02-02  
**Dernière mise à jour** : 2026-02-02  
**Version** : 1.0.0
