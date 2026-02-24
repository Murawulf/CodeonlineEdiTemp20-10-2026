# Audit des URLs et Paramètres en Dur

## 🎯 Architecture des Appels API

### Deux Types d'Appels API Distincts

Notre application utilise **deux types d'appels API** qu'il est crucial de distinguer :

#### 1️⃣ **API Backend Local** (`LOCAL_API_URL`)
- **Usage** : Appels à notre propre serveur backend
- **Exemples** : Authentification, gestion des comptes, notifications, catalogue produits, PIM, etc.
- **Hook à utiliser** : `useLocalApiUrl()`
- **Valeur par défaut** : `http://localhost:5001`

#### 2️⃣ **API Serveurs Distants** (`API_URL_SENEGAL`, `API_URL_TUNISIA`)
- **Usage** : Appels mutuels entre pays pour récupérer des données propres à chaque pays
- **Exemples** : Récupération de commandes EDI depuis le Sénégal/Tunisie, synchronisation inter-pays
- **Hook à utiliser** : `useRemoteServerUrl('senegal')` ou `useRemoteServerUrl('tunisia')`
- **Valeurs par défaut** : 
  - Sénégal : `https://codeonline-edi.net`
  - Tunisie : `https://edi-dev.codeonline-info.com`

---

## Résumé Exécutif

Cette analyse a identifié **7 fichiers** contenant des URLs API ou des paramètres (`API_PIN`) codés en dur qui doivent être migrés vers le système de configuration dynamique (`SettingsContext`).

### Statut Actuel

✅ **Fichiers déjà migrés** (utilisant `SettingsContext`) :
- `src/pages/operation-edi/Order.tsx`
- `src/pages/operation-edi/Shipment.tsx`
- `src/pages/operation-edi/Invoice.tsx`
- `src/contexts/SettingsContext.tsx` (mis à jour avec `LOCAL_API_URL` et hooks distincts)

❌ **Fichiers à migrer** :
1. `src/components/PIMGeneratorApp.tsx` - 6 URLs en dur → **API Backend Local**
2. `src/contexts/NotificationContext.tsx` - 2 URLs en dur → **API Backend Local**
3. `src/pages/Catalogue.tsx` - 2 URLs en dur → **API Backend Local**
4. `src/pages/Index.tsx` - 2 URLs + 1 API_PIN en dur → **API Backend Local**
5. `src/pages/Login.tsx` - 2 URLs en dur → **API Backend Local**
6. `src/pages/comptes.tsx` - 1 API_PIN + 1 URL en dur → **À VÉRIFIER** (URL différente)

---

## Détails par Fichier

### 1. `src/components/PIMGeneratorApp.tsx`

**Problème** : 6 appels axios avec URLs en dur vers `http://localhost:5000`

**Lignes concernées** :
- L127 : `axios.get('http://localhost:5000/api/fieldrules')`
- L167 : `axios.get('http://localhost:5000/api/segments')`
- L184 : `axios.get('http://localhost:5000/api/families/${segment}')`
- L201 : `axios.get('http://localhost:5000/api/classes/${family}')`
- L217 : `axios.get('http://localhost:5000/api/bricks/${className}')`
- L232 : `axios.get('http://localhost:5000/api/rayons/${brick}')`

**Type d'API** : 🟢 **API Backend Local** (notre serveur)

**Solution recommandée** :
```tsx
import { useLocalApiUrl } from '@/contexts/SettingsContext';

// Dans le composant
const localApiUrl = useLocalApiUrl();

// Remplacer les appels par :
axios.get(`${localApiUrl}/api/fieldrules`)
axios.get(`${localApiUrl}/api/segments`)
axios.get(`${localApiUrl}/api/families/${segment}`)
axios.get(`${localApiUrl}/api/classes/${family}`)
axios.get(`${localApiUrl}/api/bricks/${className}`)
axios.get(`${localApiUrl}/api/rayons/${brick}`)
```

---

### 2. `src/contexts/NotificationContext.tsx`

**Problème** : Fonction `getProxyBase()` retourne des URLs en dur

**Lignes concernées** :
- L27-32 : Fonction `getProxyBase()` avec `localhost:5002` et `localhost:5001`

**Type d'API** : 🟢 **API Backend Local** (notre serveur)

**Solution recommandée** :
```tsx
import { useLocalApiUrl } from '@/contexts/SettingsContext';

// Dans NotificationProvider
const localApiUrl = useLocalApiUrl();
const PROXY_BASE = localApiUrl;

const API = {
  notifications: `${PROXY_BASE}/api/proxy/notifications`,
  markRead: (id: number) => `${PROXY_BASE}/api/proxy/notifications/${id}/read`,
};
```

**Note** : `NotificationProvider` doit être enfant de `SettingsProvider` dans `App.tsx` (déjà configuré).

---

### 3. `src/pages/Catalogue.tsx`

**Problème** : Fonction `getApiBaseUrl()` retourne des URLs en dur

**Lignes concernées** :
- L29-34 : Fonction `getApiBaseUrl()` avec `localhost:5002` et `localhost:5001`

**Type d'API** : 🟢 **API Backend Local** (notre serveur)

**Solution recommandée** :
```tsx
import { useLocalApiUrl } from '@/contexts/SettingsContext';

// Dans le composant
const API_BASE = useLocalApiUrl();
```

---

### 4. `src/pages/Index.tsx`

**Problème** : URLs et API_PIN en dur

**Lignes concernées** :
- L33-38 : Fonction `getApiBaseUrl()` avec `localhost:5002` et `localhost:5001`
- L41 : `const API_PIN_HEADER = "3311";`

**Type d'API** : 🟢 **API Backend Local** (notre serveur)

**Solution recommandée** :
```tsx
import { useSettings, useLocalApiUrl } from '@/contexts/SettingsContext';

// Dans le composant
const API_BASE_URL = useLocalApiUrl();
const { settings } = useSettings();
const API_PIN_HEADER = localStorage.getItem('pin') || settings.API_PIN || "3311";
```

**Note** : `API_PIN` n'est pas exposé publiquement par l'API pour des raisons de sécurité. Utiliser `localStorage.getItem('pin')` comme fallback.

---

### 5. `src/pages/Login.tsx`

**Problème** : Fonction `getApiBaseUrl()` retourne des URLs en dur

**Lignes concernées** :
- L9-14 : Fonction `getApiBaseUrl()` avec `localhost:5002` et `localhost:5001`

**Type d'API** : 🟢 **API Backend Local** (notre serveur)

**Solution recommandée** :
```tsx
import { useLocalApiUrl } from '@/contexts/SettingsContext';

// Dans le composant
const API_BASE_URL = useLocalApiUrl();
```

---

### 6. `src/pages/comptes.tsx`

**Problème** : API_PIN et URL en dur

**Lignes concernées** :
- L6 : `const API_PIN = '3311';`
- L47 : `const API_BASE_URL = 'https://codeonline-edi.net/api';`

**Type d'API** : ⚠️ **À VÉRIFIER** - L'URL `https://codeonline-edi.net/api` semble être un serveur distant

**Solution recommandée** :
```tsx
import { useSettings, useLocalApiUrl, useRemoteServerUrl } from '@/contexts/SettingsContext';

// Dans le composant
const { settings } = useSettings();
const API_PIN = localStorage.getItem('pin') || "3311";

// SI c'est pour appeler notre backend local :
const API_BASE_URL = useLocalApiUrl();

// OU SI c'est pour appeler le serveur Sénégal :
const API_BASE_URL = useRemoteServerUrl('senegal');
```

**⚠️ ACTION REQUISE** : Vérifier l'usage de cette URL dans `comptes.tsx` pour déterminer s'il s'agit d'appels locaux ou distants.

---

## Plan d'Action Recommandé

### Étape 1 : Vérifier l'ordre des Providers dans App.tsx
S'assurer que `SettingsProvider` englobe bien tous les autres providers, notamment `NotificationProvider`.

### Étape 2 : Migrer les fichiers par ordre de priorité

**Priorité Haute** (fichiers critiques pour l'EDI) :
1. `src/pages/Index.tsx` (Dashboard principal)
2. `src/pages/Login.tsx` (Authentification)
3. `src/pages/comptes.tsx` (Gestion des comptes)

**Priorité Moyenne** :
4. `src/contexts/NotificationContext.tsx` (Notifications globales)
5. `src/pages/Catalogue.tsx` (Catalogue produits)

**Priorité Basse** :
6. `src/components/PIMGeneratorApp.tsx` (Générateur PIM - module spécialisé)

### Étape 3 : Tests
Après chaque migration :
1. Vérifier que l'application charge correctement les paramètres depuis la BDD
2. Tester les appels API avec les nouvelles URLs dynamiques
3. Vérifier le bon fonctionnement en environnement local et dev

---

## Modèles de Code pour la Migration

###  Pour les appels à notre Backend Local

```tsx
// AVANT
const getApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.location.port === "8081") {
    return "http://localhost:5000";
  }
  return "http://localhost:5000";
};
const API_BASE_URL = getApiBaseUrl();
const API_PIN = "3311";

// APRÈS
import { useSettings, useLocalApiUrl } from '@/contexts/SettingsContext';

function MyComponent() {
  const localApiUrl = useLocalApiUrl();
  const { settings } = useSettings();
  const API_PIN = localStorage.getItem('pin') || "3311";
  
  // Utiliser localApiUrl dans les appels axios
  axios.get(`${localApiUrl}/api/comptes`, {
    headers: { 'x-api-pin': API_PIN }
  });
}
```

### 🔵 Pour les appels aux Serveurs Distants (Sénégal, Tunisie)

```tsx
// AVANT
const SENEGAL_URL = "https://codeonline-edi.net";
const TUNISIA_URL = "https://edi-dev.codeonline-info.com";

// APRÈS
import { useRemoteServerUrl } from '@/contexts/SettingsContext';

function MyComponent() {
  const senegalUrl = useRemoteServerUrl('senegal');
  const tunisiaUrl = useRemoteServerUrl('tunisia');
  
  // Récupérer des données depuis le Sénégal
  axios.get(`${senegalUrl}/api/orders/from-senegal`);
  
  // Récupérer des données depuis la Tunisie
  axios.get(`${tunisiaUrl}/api/orders/from-tunisia`);
}
```

---

## Conclusion

**6 fichiers** nécessitent une migration pour éliminer complètement les URLs et paramètres en dur. Une fois ces modifications effectuées, l'application sera entièrement pilotée par la configuration en base de données, facilitant les déploiements multi-environnements.
