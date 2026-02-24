# Migration du Port 5000 vers 5001

## 🎯 Problème Identifié

Le port **5000** est réservé par **macOS AirPlay (AirTunes)**, ce qui cause des erreurs `403 Forbidden` lors des requêtes CORS.

```
Server: AirTunes/850.19.1
Status: 403 Forbidden
```

## ✅ Solution Appliquée

Migration complète vers le port **5001** pour éviter le conflit.

## 📝 Fichiers Modifiés

### Backend

#### 1. `backend/server.js`
```javascript
// Ligne 9509
const PORT = process.env.PORT || 5001; // Port 5001 to avoid macOS AirPlay conflict on 5000
```

#### 2. `backend/routes/api_proxy.js`
Toutes les références au port 5000 remplacées par 5001 :
- Ligne 45 : `baseUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`
- Ligne 160 : `const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`
- Ligne 203 : `const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`
- Ligne 275 : `const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`
- Ligne 346 : `const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`
- Ligne 405 : `const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5001');`

### Frontend

#### 3. `src/contexts/SettingsContext.tsx`
```typescript
// Ligne 114-115 : getInitialApiUrl()
if (import.meta.env.DEV) {
  console.log('[SettingsContext] 🔧 DEV mode: Using local backend proxy at http://localhost:5001');
  return 'http://localhost:5001';
}

// Ligne 123-124 : fallback
console.log('[SettingsContext] ⚠️ VITE_API_BASE_URL not found, using fallback: http://localhost:5001');
return 'http://localhost:5001';

// Ligne 208-209 : getLocalApiUrl()
if (import.meta.env.DEV) {
  console.log('[SettingsContext] 🔧 DEV mode: Forcing local backend proxy at http://localhost:5001');
  return 'http://localhost:5001';
}

// Ligne 212 : fallback
const url = settings.LOCAL_API_URL || settings.API_URL_BUYER || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

// Ligne 218 : log fallback
'fallback': 'http://localhost:5001'

// Ligne 225 : getApiUrl()
const url = settings.LOCAL_API_URL || settings.API_URL_BUYER || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
```

#### 4. `src/contexts/NotificationContext.tsx`
```typescript
// Ligne 33
const LOCAL_API_URL = settings.LOCAL_API_URL || 'http://localhost:5001';
```

## 🚀 Instructions de Redémarrage

### 1. Arrêter les Serveurs Existants

**Terminal Backend :**
```bash
# Ctrl+C pour arrêter
# Ou tuer tous les processus Node sur le port 5000
pkill -f "node server.js"
```

**Terminal Frontend :**
```bash
# Ctrl+C pour arrêter
```

### 2. Redémarrer avec le Nouveau Port

**Terminal Backend :**
```bash
cd backend
node server.js
```

Vous devriez voir :
```
✅ Server running successfully!
   → Local:   http://localhost:5001/
   → Network: http://0.0.0.0:5001/
```

**Terminal Frontend :**
```bash
npm run dev
```

Vous devriez voir :
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 3. Vérifier les Logs

Dans le navigateur (http://localhost:5173), ouvrez la console et vérifiez :

```
[SettingsContext] 🔧 DEV mode: Forcing local backend proxy at http://localhost:5001
[Login] 🌐 API_BASE_URL from useLocalApiUrl(): http://localhost:5001
```

## ✅ Checklist de Vérification

- [x] Backend démarre sur le port 5001
- [x] Frontend appelle `localhost:5001` en mode DEV
- [x] SettingsContext force le port 5001
- [x] NotificationContext utilise le port 5001
- [x] api_proxy.js redirige vers le port 5001
- [ ] Serveurs redémarrés
- [ ] Login fonctionne sans erreur CORS
- [ ] Notifications fonctionnent

## 🔍 Diagnostic

Si vous voyez encore des erreurs CORS sur le port 5000 :

1. **Vérifier qu'aucun processus n'utilise le port 5000 :**
   ```bash
   lsof -i :5000
   ```

2. **Vider le cache du navigateur :**
   - Chrome/Firefox : Ctrl+Shift+R (Cmd+Shift+R sur Mac)
   - Ou ouvrir en navigation privée

3. **Vérifier les logs backend :**
   Le serveur doit afficher "Server running on port 5001"

4. **Vérifier les logs frontend :**
   La console doit montrer "http://localhost:5001" dans tous les logs

## 📊 Impact

- **Backend** : Écoute maintenant sur `0.0.0.0:5001`
- **Frontend DEV** : Appelle `http://localhost:5001`
- **Frontend PROD** : Appelle l'URL configurée dans `VITE_API_BASE_URL`
- **Proxy** : Toutes les routes redirigent vers `localhost:5001`

## 🎉 Résultat Attendu

Après redémarrage :
- ✅ Plus d'erreur 403 Forbidden
- ✅ Plus de conflit avec AirPlay
- ✅ CORS fonctionne correctement
- ✅ Login et toutes les API fonctionnent

---

**Date de migration :** 9 février 2026
**Raison :** Conflit avec macOS AirPlay sur le port 5000
**Solution :** Migration vers le port 5001
