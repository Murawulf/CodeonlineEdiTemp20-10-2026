# Système de Paramètres Globaux

## Vue d'ensemble

Ce système permet de gérer tous les paramètres de configuration de l'application (URLs des serveurs, timeouts, feature flags, etc.) depuis la base de données, sans avoir à modifier le code source.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Base de données                          │
│                    (table: app_parameters)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Node.js)                            │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │   ConfigService     │───▶│  /api/settings (routes)     │    │
│  │   (cache mémoire)   │    │  GET /api/settings          │    │
│  └─────────────────────┘    │  GET /api/settings/servers  │    │
│                             │  PUT /api/settings/:key     │    │
│                             └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React)                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  SettingsProvider   │───▶│  useSettings() hook         │    │
│  │  (Context React)    │    │  useApiUrl() hook           │    │
│  └─────────────────────┘    │  useServerUrls() hook       │    │
│                             └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Exécuter la migration de la base de données

```bash
cd backend
node run_migration_app_parameters.js
```

Cette commande va :
- Créer la table `app_parameters`
- Insérer les paramètres par défaut
- Afficher un résumé des paramètres créés

### 2. Redémarrer le serveur backend

```bash
cd backend
node server.js
```

Le serveur va automatiquement charger les paramètres depuis la base de données au démarrage.

## Utilisation

### Backend (Node.js)

```javascript
const configService = require('./services/configService');

// Obtenir un paramètre
const apiUrl = configService.get('API_URL_BUYER', 'http://localhost:5001');

// Obtenir tous les paramètres publics
const publicConfig = configService.getPublicConfig();

// Obtenir les URLs des serveurs
const servers = configService.getServerUrls();

// Mettre à jour un paramètre
await configService.set('API_TIMEOUT', 60000);

// Recharger depuis la base de données
await configService.reload();
```

### Frontend (React)

```tsx
import { useSettings, useApiUrl, useServerUrls } from '@/contexts/SettingsContext';

function MyComponent() {
  // Accès complet aux settings
  const { settings, isLoading, get, getServerUrl, reload } = useSettings();

  // Ou utiliser les hooks utilitaires
  const apiUrl = useApiUrl();
  const serverUrls = useServerUrls();

  // Obtenir un paramètre spécifique
  const timeout = get('API_TIMEOUT', 30000);
  const currency = get('DEFAULT_CURRENCY', 'TND');

  // Obtenir l'URL d'un serveur spécifique
  const senegalUrl = getServerUrl('senegal');

  if (isLoading) {
    return <div>Chargement des paramètres...</div>;
  }

  return (
    <div>
      <p>API URL: {apiUrl}</p>
      <p>Timeout: {timeout}ms</p>
      <p>Devise: {currency}</p>
    </div>
  );
}
```

### Utiliser le hook useApi

```tsx
import { useApi, useServerApi } from '@/hooks/useApi';

function OrderComponent() {
  const api = useApi(); // API du serveur actuel (buyer ou supplier selon le port)
  const senegalApi = useServerApi('senegal'); // API spécifique Sénégal

  const fetchOrders = async () => {
    const response = await api.get('/api/orders');
    return response.data;
  };

  const fetchFromSenegal = async () => {
    const response = await senegalApi.get('/api/orders');
    return response.data;
  };
}
```

## Paramètres disponibles

### Serveurs (`category: servers`)

| Clé | Description | Public |
|-----|-------------|--------|
| `API_URL_BUYER` | URL du serveur backend Acheteur | ✅ |
| `API_URL_SUPPLIER` | URL du serveur backend Fournisseur | ✅ |
| `API_URL_SENEGAL` | URL du serveur Sénégal (Production) | ✅ |
| `API_URL_TUNISIA` | URL du serveur Tunisie | ✅ |
| `WEBSOCKET_URL` | URL du serveur WebSocket | ✅ |

### API (`category: api`)

| Clé | Description | Public |
|-----|-------------|--------|
| `API_TIMEOUT` | Timeout des requêtes API en ms | ✅ |

### Sécurité (`category: security`)

| Clé | Description | Public |
|-----|-------------|--------|
| `API_PIN` | PIN de sécurité API | ❌ |

### Général (`category: general`)

| Clé | Description | Public |
|-----|-------------|--------|
| `APP_NAME` | Nom de l'application | ✅ |
| `APP_VERSION` | Version de l'application | ✅ |
| `DEFAULT_CURRENCY` | Devise par défaut | ✅ |
| `DEFAULT_LANGUAGE` | Langue par défaut | ✅ |

### Features (`category: features`)

| Clé | Description | Public |
|-----|-------------|--------|
| `FEATURE_EDI_WORKER` | Activer le worker EDI | ✅ |
| `FEATURE_NOTIFICATIONS` | Activer les notifications | ✅ |

### Pagination (`category: pagination`)

| Clé | Description | Public |
|-----|-------------|--------|
| `DEFAULT_PAGE_SIZE` | Nombre d'éléments par page par défaut | ✅ |
| `MAX_PAGE_SIZE` | Nombre max d'éléments par page | ✅ |

### Uploads (`category: uploads`)

| Clé | Description | Public |
|-----|-------------|--------|
| `MAX_FILE_SIZE_MB` | Taille max des fichiers en MB | ✅ |
| `MAX_LOGO_SIZE_MB` | Taille max des logos en MB | ✅ |

## API REST

### GET /api/settings
Récupère tous les paramètres publics.

```json
{
  "success": true,
  "data": {
    "API_URL_BUYER": "http://localhost:5001",
    "API_URL_SUPPLIER": "http://localhost:5002",
    "API_TIMEOUT": 30000,
    ...
  },
  "timestamp": "2025-01-28T17:00:00.000Z"
}
```

### GET /api/settings/servers
Récupère uniquement les URLs des serveurs.

```json
{
  "success": true,
  "data": {
    "buyer": "http://localhost:5001",
    "supplier": "http://localhost:5002",
    "senegal": "https://codeonline-edi.net",
    "tunisia": "https://edi-dev.codeonline-info.com",
    "websocket": "http://localhost:5001"
  }
}
```

### GET /api/settings/:key
Récupère un paramètre spécifique.

### PUT /api/settings/:key
Met à jour un paramètre.

```json
{
  "value": "nouvelle_valeur"
}
```

### POST /api/settings/reload
Recharge tous les paramètres depuis la base de données.

## Ajouter un nouveau paramètre

1. **Insérer dans la base de données** :

```sql
INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public)
VALUES ('NEW_PARAM', 'value', 'string', 'general', 'Description du paramètre', 1);
```

2. **Utiliser dans le code** :

```javascript
// Backend
const value = configService.get('NEW_PARAM', 'default');

// Frontend
const { get } = useSettings();
const value = get('NEW_PARAM', 'default');
```

## Déploiement sur Serveur de Développement (Scénario Mixte)

Si vous déployez l'application sur un serveur distant (ex: `https://dev.codeonline-edi.net`) tout en voulant communiquer avec un backend local (ex: `http://localhost:5001`), suivez ces étapes :

### 1. Configuration de la base de données
Nous avons préparé un script pour configurer automatiquement les URLs pour ce scénario spécifique (Sénégal = Dev, Tunisie = Local).

```bash
cd backend
# Assurez-vous que DB_HOST pointe vers la base de données du serveur de dev
node run_deploy_config.js
```

### 2. Attention : Mixed Content (HTTPS vs HTTP)
Si votre serveur de dev est en **HTTPS** (`https://dev.codeonline-edi.net`), les navigateurs bloqueront par sécurité les requêtes vers votre API locale en **HTTP** (`http://localhost:5001`).

**Solutions :**
1. **Accéder au site en HTTP** : Si possible, utilisez `http://dev.codeonline-edi.net` pour vos tests.
2. **Tunnel Sécurisé** : Utilisez `ngrok` pour exposer votre localhost en HTTPS.
   ```bash
   ngrok http 5001
   ```
   Puis mettez à jour `API_URL_TUNISIA` dans la base de données avec l'URL ngrok (`https://xxxx.ngrok.io`).
3. **Désactiver la sécurité (Déconseillé)** : Lancer Chrome avec `--allow-running-insecure-content` (uniquement pour le débogage rapide).

### 3. Vérification
Une fois déployé, allez dans l'écran "Nouvelle Commande" et vérifiez dans la liste des serveurs que :
- "Sénégal" pointe bien vers `https://dev.codeonline-edi.net`
- "Tunisie" pointe bien vers `http://localhost:5001` (ou votre tunnel HTTPS)
