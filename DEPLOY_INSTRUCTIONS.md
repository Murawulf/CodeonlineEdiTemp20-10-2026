# Instructions de Déploiement - Fix Login URL

## 🔍 Problème Identifié

L'application tente de charger les settings depuis `http://localhost:5001/api/settings` au lieu de `https://dev.codeonline-edi.net/api/settings`.

**Cause :** Les variables d'environnement Vite (`import.meta.env.*`) sont injectées au **moment du build**, pas au runtime. Si l'application a été buildée sans la variable `VITE_API_BASE_URL`, elle utilisera le fallback `localhost:5000`.

## ✅ Solution Appliquée

### 1. Logs de Débogage Ajoutés

Des logs détaillés ont été ajoutés dans :
- **`SettingsContext.tsx`** : Trace le chargement des settings et l'URL utilisée
- **`Login.tsx`** : Trace l'URL utilisée lors de la tentative de connexion

### 2. Fichiers Modifiés

| Fichier | Modifications |
|---------|---------------|
| `src/contexts/SettingsContext.tsx` | Logs dans `getInitialApiUrl()`, `loadSettings()`, `getLocalApiUrl()` |
| `src/pages/Login.tsx` | Logs au montage du composant et lors du login |
| `.env` | Contient `VITE_API_BASE_URL=https://dev.codeonline-edi.net` |

## 🚀 Déploiement sur le Serveur Distant

### Étape 1 : Vérifier le fichier .env

```bash
# Sur le serveur Sénégal
cd /var/www/Edi-dev  # ou le chemin de votre application

# Vérifier que le .env existe et contient la bonne URL
cat .env
```

Le fichier doit contenir :
```bash
VITE_API_BASE_URL=https://dev.codeonline-edi.net
```

Si le fichier n'existe pas ou est incorrect :
```bash
echo "VITE_API_BASE_URL=https://dev.codeonline-edi.net" > .env
```

### Étape 2 : Rebuild l'Application

**Option A : Utiliser le script automatique**
```bash
# Rendre le script exécutable (déjà fait)
chmod +x build-production.sh

# Exécuter le build
./build-production.sh
```

**Option B : Build manuel**
```bash
# Exporter la variable d'environnement
export VITE_API_BASE_URL=https://dev.codeonline-edi.net

# Nettoyer l'ancien build
rm -rf dist

# Build
npm run build

# Vérifier que la variable a été injectée
grep -r "dev.codeonline-edi.net" dist/
```

### Étape 3 : Déployer les Fichiers Statiques

```bash
# Si vous utilisez nginx
sudo cp -r dist/* /var/www/html/

# Ou si vous avez un dossier spécifique
sudo cp -r dist/* /var/www/Edi-dev/frontend/

# Ajuster les permissions
sudo chown -R www-data:www-data /var/www/html/
# ou
sudo chown -R www-data:www-data /var/www/Edi-dev/frontend/
```

### Étape 4 : Vérifier la Configuration Nginx

Votre configuration nginx doit servir les fichiers statiques et proxifier les requêtes API vers le backend :

```nginx
server {
    listen 80;
    server_name dev.codeonline-edi.net;

    # Redirection HTTPS (si configuré)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name dev.codeonline-edi.net;

    # Certificats SSL
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend (fichiers statiques Vite)
    root /var/www/html;  # ou /var/www/Edi-dev/frontend
    index index.html;

    # Servir les fichiers statiques
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxifier les requêtes API vers le backend Node.js
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support (si nécessaire)
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Recharger nginx :
```bash
sudo nginx -t  # Tester la configuration
sudo systemctl reload nginx
```

## 🔍 Vérification et Débogage

### 1. Ouvrir la Console du Navigateur (F12)

Après le rebuild et le déploiement, accédez à `https://dev.codeonline-edi.net` et ouvrez la console.

Vous devriez voir ces logs :

```
[SettingsContext] 🔍 getInitialApiUrl() called
[SettingsContext] 📦 import.meta.env.VITE_API_BASE_URL: https://dev.codeonline-edi.net
[SettingsContext] ✅ Using VITE_API_BASE_URL: https://dev.codeonline-edi.net
[SettingsContext] 🌐 Loading settings from: https://dev.codeonline-edi.net/api/settings
[SettingsContext] 📥 Settings response: { success: true, data: {...} }
[SettingsContext] ✅ Settings loaded from API: X parameters
```

### 2. Vérifier l'Onglet Network

Dans l'onglet **Network** (Réseau), vous devriez voir :
- ✅ `GET https://dev.codeonline-edi.net/api/settings` → Status 200
- ❌ PAS de `GET http://localhost:5001/api/settings`

### 3. Tester le Login

Lors de la tentative de connexion, vous devriez voir :

```
[Login] 🔑 Component mounted
[Login] 🌐 API_BASE_URL from useLocalApiUrl(): https://dev.codeonline-edi.net
[Login] 🚀 Starting login process
[Login] 📧 Email: votre@email.com
[Login] 🌐 POST request to: https://dev.codeonline-edi.net/api/login
```

Dans l'onglet Network :
- ✅ `POST https://dev.codeonline-edi.net/api/login` → Status 200
- ❌ PAS de `POST http://localhost:5001/api/login`

## ⚠️ Si le Problème Persiste

### Cas 1 : Toujours localhost dans les logs

Si vous voyez encore `localhost` dans les logs après le rebuild :

```bash
# Vérifier que la variable est bien dans le .env
cat .env

# Vérifier que le build a bien utilisé la variable
grep -r "localhost:5000" dist/

# Si vous trouvez des références à localhost, le build n'a pas pris en compte le .env
# Solution : Rebuild en exportant explicitement la variable
export VITE_API_BASE_URL=https://dev.codeonline-edi.net
npm run build
```

### Cas 2 : Cache du Navigateur

```bash
# Vider le cache du navigateur
Ctrl+Shift+Delete (ou Cmd+Shift+Delete sur Mac)

# Ou faire un Hard Refresh
Ctrl+Shift+R (ou Cmd+Shift+R sur Mac)
```

### Cas 3 : Le Backend ne Répond Pas

Vérifier que le backend est bien démarré :

```bash
# Vérifier que le backend tourne
pm2 list
# ou
ps aux | grep node

# Vérifier les logs du backend
pm2 logs codeonline-backend

# Tester l'endpoint directement
curl https://dev.codeonline-edi.net/api/settings
```

## 📋 Checklist de Déploiement

- [ ] Fichier `.env` contient `VITE_API_BASE_URL=https://dev.codeonline-edi.net`
- [ ] Build exécuté avec `./build-production.sh` ou `npm run build`
- [ ] Aucune référence à `localhost` dans le dossier `dist/`
- [ ] Fichiers `dist/` copiés vers le dossier web
- [ ] Nginx configuré pour servir les fichiers statiques et proxifier `/api/`
- [ ] Backend Node.js démarré sur le port 5000
- [ ] Console du navigateur affiche les bons logs avec l'URL de production
- [ ] Login fonctionne sans erreur 404 ou CORS

## 🎯 Résumé

**Le problème :** Variables d'environnement Vite non injectées au build  
**La solution :** Rebuild avec `VITE_API_BASE_URL` correctement définie  
**La vérification :** Logs dans la console montrent l'URL de production  

Une fois le rebuild effectué et déployé, l'application utilisera automatiquement `https://dev.codeonline-edi.net` pour toutes les requêtes API, y compris le login.
