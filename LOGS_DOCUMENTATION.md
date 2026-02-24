# Documentation des Logs de Débogage

## 🎯 Objectif

Des logs détaillés ont été ajoutés dans toute l'application pour tracer le flux complet depuis le login jusqu'au chargement de la page d'accueil. Cela permet de débugger le problème d'URL localhost vs serveur de production.

## 📋 Fichiers Modifiés avec Logs

### 1. **Login.tsx** (Page de Connexion)
**Emplacement :** `src/pages/Login.tsx`

**Logs ajoutés :**
- 🔑 Montage du composant
- 🌐 URL API récupérée via `useLocalApiUrl()`
- 🚀 Début du processus de login
- 📧 Email de l'utilisateur
- 🏢 Détection backoffice
- 🔐 Inclusion du certicode
- 🌐 URL complète de la requête POST `/api/login`
- 📦 Payload envoyé (sans le mot de passe)
- ✅ Succès du login avec données reçues

**Exemple de sortie console :**
```
[Login] 🔑 Component mounted
[Login] 🌐 API_BASE_URL from useLocalApiUrl(): https://dev.codeonline-edi.net
[Login] 🚀 Starting login process
[Login] 📧 Email: user@example.com
[Login] 🏢 Is backoffice: false
[Login] 🌐 POST request to: https://dev.codeonline-edi.net/api/login
[Login] 📦 Payload: { email: 'user@example.com', hasPassword: true, hasCerticode: false }
[Login] ✅ Login successful, received data: {...}
```

---

### 2. **SettingsContext.tsx** (Gestion des Paramètres)
**Emplacement :** `src/contexts/SettingsContext.tsx`

**Logs ajoutés :**
- 🔍 Appel de `getInitialApiUrl()`
- 📦 Valeur de `import.meta.env.VITE_API_BASE_URL`
- 📦 Toutes les variables `import.meta.env`
- ✅ URL utilisée pour charger les settings
- 🌐 Requête GET vers `/api/settings`
- 📥 Réponse du serveur
- 🔗 URL retournée par `getLocalApiUrl()` avec chaîne de priorité
- 🔗 URL retournée par `getApiUrl()`

**Exemple de sortie console :**
```
[SettingsContext] 🔍 getInitialApiUrl() called
[SettingsContext] 📦 import.meta.env.VITE_API_BASE_URL: https://dev.codeonline-edi.net
[SettingsContext] 📦 All import.meta.env: { MODE: 'production', ... }
[SettingsContext] ✅ Using VITE_API_BASE_URL: https://dev.codeonline-edi.net
[SettingsContext] 🌐 Loading settings from: https://dev.codeonline-edi.net/api/settings
[SettingsContext] 📥 Settings response: { success: true, data: {...} }
[SettingsContext] ✅ Settings loaded from API: 15 parameters
[SettingsContext] 🔗 getLocalApiUrl() returning: https://dev.codeonline-edi.net
[SettingsContext] 🔗 Priority chain: {
  'settings.LOCAL_API_URL': 'https://dev.codeonline-edi.net',
  'settings.API_URL_BUYER': undefined,
  'import.meta.env.VITE_API_BASE_URL': 'https://dev.codeonline-edi.net',
  'fallback': 'http://localhost:5000'
}
```

---

### 3. **App.tsx** (Application Principale)
**Emplacement :** `src/App.tsx`

**Logs ajoutés :**
- 🚀 Montage de l'application
- 🔍 Vérification du localStorage
- 📦 Parsing de l'utilisateur stocké
- 👤 Données de l'utilisateur parsé
- ✅ Utilisateur défini avec `id_compte`
- 🔐 Header global `x-api-pin` défini
- 🔌 Configuration des intercepteurs Axios
- 📤 Requêtes HTTP sortantes (méthode + URL)
- 📥 Réponses HTTP (méthode + URL + status)
- ❌ Erreurs HTTP (méthode + URL + status)

**Exemple de sortie console :**
```
[App] 🚀 Application mounted
[App] 🔍 Checking localStorage for currentUser...
[App] 📦 Found user in localStorage, parsing...
[App] 👤 Parsed user: { id_compte: 123, email: 'user@example.com', name: 'John Doe', profile_id: 2 }
[App] ✅ currentUser set with id_compte: 123
[App] 🔐 Set global x-api-pin header: 3311
[App] 🔌 Setting up Axios interceptors...
[App] 📤 HTTP Request [1]: GET https://dev.codeonline-edi.net/api/settings
[App] 📥 HTTP Response [0]: GET https://dev.codeonline-edi.net/api/settings - Status: 200
```

---

### 4. **ProtectedRoute** (Garde de Route)
**Emplacement :** `src/App.tsx`

**Logs ajoutés :**
- 🚪 Vérification d'accès à une route
- 👤 Présence de l'utilisateur dans localStorage
- ⚠️ Redirection vers `/login` si pas d'utilisateur
- ✅ Accès accordé à la route

**Exemple de sortie console :**
```
[ProtectedRoute] 🚪 Checking access to: /
[ProtectedRoute] 👤 User in localStorage: EXISTS
[ProtectedRoute] ✅ Access granted to: /
```

---

### 5. **RouteChangeHandler** (Changement de Route)
**Emplacement :** `src/App.tsx`

**Logs ajoutés :**
- 🛣️ Changement de route détecté

**Exemple de sortie console :**
```
[RouteChangeHandler] 🛣️ Route changed to: /
[RouteChangeHandler] 🛣️ Route changed to: /operation-edi/order
```

---

### 6. **DashboardLayout** (Layout Principal)
**Emplacement :** `src/components/layout/DashboardLayout.tsx`

**Logs ajoutés :**
- 🏠 Montage du composant
- 👤 Utilisateur reçu en props

**Exemple de sortie console :**
```
[DashboardLayout] 🏠 Component mounted
[DashboardLayout] 👤 Current user: {
  id_compte: 123,
  email: 'user@example.com',
  name: 'John Doe',
  profile_id: 2
}
```

---

### 7. **Header** (En-tête de l'Application)
**Emplacement :** `src/components/layout/Header.tsx`

**Logs ajoutés :**
- 🏛️ Montage du composant
- 🚪 Déconnexion de l'utilisateur
- ➡️ Redirection vers `/login`

**Exemple de sortie console :**
```
[Header] 🏛️ Component mounted
[Header] 🚪 Logging out user...
[Header] ➡️ Redirecting to /login
```

---

### 8. **Index** (Page d'Accueil/Dashboard)
**Emplacement :** `src/pages/Index.tsx`

**Logs ajoutés :**
- 🏠 Montage de la page dashboard
- 🌐 URL API utilisée
- 🔐 PIN API utilisé

**Exemple de sortie console :**
```
[Index] 🏠 Dashboard page mounted
[Index] 🌐 API_BASE_URL: https://dev.codeonline-edi.net
[Index] 🔐 API_PIN: 3311
```

---

### 9. **NotificationContext** (Gestion des Notifications)
**Emplacement :** `src/contexts/NotificationContext.tsx`

**Logs ajoutés :**
- 🔔 Montage du provider avec `compteId`
- 🌐 URL API utilisée
- 📡 Fetch des notifications
- ⚠️ Conditions de skip (pas de compteId, déjà en cours, serveur down)

**Exemple de sortie console :**
```
[NotificationContext] 🔔 Provider mounted with compteId: 123
[NotificationContext] 🌐 Using API URL: https://dev.codeonline-edi.net
[NotificationContext] 📡 Fetching notifications from: https://dev.codeonline-edi.net/api/proxy/notifications?id_compte=123
```

---

## 🔍 Comment Utiliser les Logs

### 1. Ouvrir la Console du Navigateur
Appuyez sur **F12** ou **Ctrl+Shift+I** (Cmd+Option+I sur Mac)

### 2. Aller dans l'Onglet Console

### 3. Filtrer les Logs
Vous pouvez filtrer par composant en tapant dans la barre de recherche :
- `[Login]` - Voir uniquement les logs du login
- `[SettingsContext]` - Voir uniquement les logs des settings
- `[App]` - Voir uniquement les logs de l'application
- `localhost` - Rechercher toutes les références à localhost
- `dev.codeonline-edi.net` - Rechercher les références au serveur

### 4. Flux Typique d'un Login Réussi

```
1. [SettingsContext] 🔍 getInitialApiUrl() called
2. [SettingsContext] 📦 import.meta.env.VITE_API_BASE_URL: https://dev.codeonline-edi.net
3. [SettingsContext] 🌐 Loading settings from: https://dev.codeonline-edi.net/api/settings
4. [App] 🚀 Application mounted
5. [App] 🔍 Checking localStorage for currentUser...
6. [App] ⚠️ No user found in localStorage
7. [Login] 🔑 Component mounted
8. [Login] 🌐 API_BASE_URL from useLocalApiUrl(): https://dev.codeonline-edi.net
9. [Login] 🚀 Starting login process
10. [Login] 🌐 POST request to: https://dev.codeonline-edi.net/api/login
11. [App] 📤 HTTP Request [1]: POST https://dev.codeonline-edi.net/api/login
12. [App] 📥 HTTP Response [0]: POST https://dev.codeonline-edi.net/api/login - Status: 200
13. [Login] ✅ Login successful, received data: {...}
14. [RouteChangeHandler] 🛣️ Route changed to: /
15. [ProtectedRoute] 🚪 Checking access to: /
16. [ProtectedRoute] 👤 User in localStorage: EXISTS
17. [ProtectedRoute] ✅ Access granted to: /
18. [DashboardLayout] 🏠 Component mounted
19. [DashboardLayout] 👤 Current user: {...}
20. [Index] 🏠 Dashboard page mounted
21. [Index] 🌐 API_BASE_URL: https://dev.codeonline-edi.net
```

---

## 🚨 Problèmes à Rechercher

### Si vous voyez `localhost` dans les logs :

1. **Dans `[SettingsContext]`** :
   ```
   [SettingsContext] ⚠️ VITE_API_BASE_URL not found, using fallback: http://localhost:5000
   ```
   → **Problème :** La variable d'environnement n'a pas été injectée au build
   → **Solution :** Rebuild avec `./build-production.sh`

2. **Dans `[Login]`** :
   ```
   [Login] 🌐 API_BASE_URL from useLocalApiUrl(): http://localhost:5000
   ```
   → **Problème :** Les settings n'ont pas été chargés depuis la BDD
   → **Solution :** Vérifier que `/api/settings` retourne les bons paramètres

3. **Dans `[App]` HTTP Request** :
   ```
   [App] 📤 HTTP Request [1]: GET http://localhost:5001/api/settings
   ```
   → **Problème :** L'application utilise le mauvais port
   → **Solution :** Rebuild nécessaire

### Si le login échoue :

1. **Vérifier l'URL de la requête** :
   ```
   [Login] 🌐 POST request to: ???
   ```
   Doit être : `https://dev.codeonline-edi.net/api/login`

2. **Vérifier la réponse HTTP** :
   ```
   [App] 📥 HTTP Response [0]: POST ... - Status: ???
   ```
   Doit être : Status 200

3. **Vérifier les erreurs** :
   ```
   [App] ❌ HTTP Error [0]: POST ... - Status: 404
   ```
   → Endpoint introuvable ou mauvaise URL

---

## 📊 Légende des Emojis

| Emoji | Signification |
|-------|---------------|
| 🚀 | Démarrage/Initialisation |
| 🔍 | Recherche/Vérification |
| 📦 | Données/Payload |
| 🌐 | URL/Réseau |
| 🔐 | Sécurité/Authentification |
| 👤 | Utilisateur |
| ✅ | Succès |
| ❌ | Erreur |
| ⚠️ | Avertissement |
| 📤 | Requête sortante |
| 📥 | Réponse entrante |
| 🚪 | Navigation/Redirection |
| 🏠 | Page d'accueil |
| 🔔 | Notifications |
| 🔌 | Connexion/WebSocket |
| 🛣️ | Changement de route |

---

## 🎯 Prochaines Étapes

1. **Rebuild l'application** avec les bonnes variables d'environnement
2. **Déployer** les nouveaux fichiers sur le serveur
3. **Ouvrir la console** du navigateur
4. **Tenter de se connecter**
5. **Analyser les logs** pour identifier où le problème se situe
6. **Partager les logs** avec l'équipe si nécessaire

Tous les logs sont préfixés avec le nom du composant entre crochets `[ComponentName]` pour faciliter le filtrage et le débogage.
