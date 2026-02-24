# 🚀 Guide de Déploiement Production - CodeOnline EDI

## 🔴 Problème Rencontré

**Erreur** : `Le chargement du module à l'adresse « https://dev.codeonline-edi.net/src/main.tsx » a été bloqué en raison d'un type MIME interdit`

**Cause** : Le serveur essaie de servir les fichiers source TypeScript (`.tsx`) au lieu des fichiers buildés JavaScript.

**Solution** : Builder l'application React/Vite et configurer correctement le serveur web.

---

## 📦 Architecture de Déploiement

```
Serveur Physique (dev.codeonline-edi.net)
├── Frontend (React/Vite) - Port 80/443 (HTTPS)
│   └── Fichiers statiques buildés dans /dist
└── Backend (Node.js/Express) - Port 5001
    └── API REST + WebSocket
```

---

## ✅ Étape 1 : Builder l'Application Frontend

### 1.1 En Local (avant transfert)

```bash
# Aller dans le répertoire du projet
cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn

# Installer les dépendances (si nécessaire)
npm install

# Builder pour la production
npm run build

# Résultat : dossier /dist créé avec les fichiers statiques optimisés
```

**Contenu du dossier `dist/`** :
```
dist/
├── index.html              # Point d'entrée
├── assets/
│   ├── index-[hash].js    # JavaScript compilé et minifié
│   ├── index-[hash].css   # CSS compilé et minifié
│   └── [autres assets]
└── [autres fichiers statiques]
```

### 1.2 Vérification du Build

```bash
# Tester en local avec le serveur de preview Vite
npm run preview

# Ouvrir http://localhost:4173 pour vérifier
```

---

## 🌐 Étape 2 : Configuration du Serveur Web (Nginx)

### 2.1 Créer le fichier de configuration Nginx

Créez le fichier `/etc/nginx/sites-available/codeonline-edi` sur le serveur :

```nginx
# Configuration Nginx pour CodeOnline EDI
server {
    listen 80;
    listen [::]:80;
    server_name dev.codeonline-edi.net;
    
    # Redirection HTTP vers HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dev.codeonline-edi.net;

    # Certificats SSL (Let's Encrypt ou autre)
    ssl_certificate /etc/letsencrypt/live/dev.codeonline-edi.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.codeonline-edi.net/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Répertoire des fichiers statiques (Frontend React buildé)
    root /var/www/codeonline-edi/dist;
    index index.html;

    # Logs
    access_log /var/log/nginx/codeonline-edi-access.log;
    error_log /var/log/nginx/codeonline-edi-error.log;

    # Compression Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Cache des assets statiques
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy vers le backend Node.js pour les API
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Proxy pour Socket.IO (WebSocket)
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Servir les fichiers uploadés (GED, logos, etc.)
    location /uploads/ {
        alias /var/www/Edi-dev/uploads/;
        expires 1M;
        add_header Cache-Control "public";
    }

    location /modeles/ {
        alias /var/www/Edi-dev/Modeles/;
        expires 1M;
        add_header Cache-Control "public";
    }

    # React Router - Toutes les autres routes vers index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Sécurité - Cacher les fichiers sensibles
    location ~ /\. {
        deny all;
    }

    location ~ \.(env|git|sql|db)$ {
        deny all;
    }
}
```

### 2.2 Activer la configuration

```bash
# Créer le lien symbolique
sudo ln -s /etc/nginx/sites-available/codeonline-edi /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

---

## 📤 Étape 3 : Déployer les Fichiers sur le Serveur

### 3.1 Transférer le dossier `dist/`

**Option A : Via SCP**
```bash
# Depuis votre machine locale
scp -r dist/* user@dev.codeonline-edi.net:/var/www/codeonline-edi/dist/
```

**Option B : Via SFTP (FileZilla, WinSCP)**
- Connectez-vous au serveur
- Uploadez le contenu du dossier `dist/` vers `/var/www/codeonline-edi/dist/`

**Option C : Via Git**
```bash
# Sur le serveur
cd /var/www/codeonline-edi
git pull origin main
npm install
npm run build
```

### 3.2 Vérifier les permissions

```bash
# Sur le serveur
sudo chown -R www-data:www-data /var/www/codeonline-edi/dist
sudo chmod -R 755 /var/www/codeonline-edi/dist
```

---

## 🔧 Étape 4 : Configuration du Backend Node.js

### 4.1 Variables d'environnement

Créez/modifiez le fichier `/var/www/Edi-dev/backend/.env` :

```bash
# Base de données MySQL
DB_HOST=217.182.94.86
DB_USER=Consultant
DB_PASSWORD=A4b6xb1s*
DB_NAME=Dev_Entitedb

# Serveur
PORT=5000
NODE_ENV=production

# Chemins
MODELES_DIR=/var/www/Edi-dev/Modeles
ALLGPC_DB_PATH=/var/www/Edi-dev/backend/allgpc.db
FIELDRULES_DB_PATH=/var/www/Edi-dev/backend/fieldrules.db
USERS_DB_PATH=/var/www/Edi-dev/backend/users.db
GED_DIR=/var/www/Edi-dev/uploads/ged
EANCOM_BASE_DIR=/var/www/Edi-dev/eancom

# Email (Brevo)
BREVO_SMTP_USER=948ac0001@smtp-brevo.com
BREVO_SMTP_PASSWORD=votre_password
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587

# Sécurité
API_PIN=3311
```

### 4.2 Démarrer le Backend avec PM2

```bash
# Installer PM2 (si pas déjà fait)
sudo npm install -g pm2

# Démarrer le backend
cd /var/www/Edi-dev/backend
pm2 start server.js --name codeonline-backend

# Sauvegarder la config PM2
pm2 save

# Configurer le démarrage automatique
pm2 startup
```

### 4.3 Vérifier le statut

```bash
# Voir les logs
pm2 logs codeonline-backend

# Voir le statut
pm2 status

# Redémarrer si nécessaire
pm2 restart codeonline-backend
```

---

## 🔐 Étape 5 : Configuration SSL (HTTPS)

### 5.1 Installer Certbot (Let's Encrypt)

```bash
# Installer Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Obtenir un certificat SSL
sudo certbot --nginx -d dev.codeonline-edi.net

# Renouvellement automatique (déjà configuré par défaut)
sudo certbot renew --dry-run
```

---

## 🧪 Étape 6 : Tests et Vérification

### 6.1 Tests Frontend

```bash
# Ouvrir dans le navigateur
https://dev.codeonline-edi.net

# Vérifier dans la console du navigateur (F12)
# - Pas d'erreurs de chargement
# - Pas d'erreurs MIME
# - Tous les assets chargés correctement
```

### 6.2 Tests Backend

```bash
# Tester l'API
curl https://dev.codeonline-edi.net/api/segments

# Vérifier les logs backend
pm2 logs codeonline-backend
```

### 6.3 Tests WebSocket

```javascript
// Dans la console du navigateur
const socket = io('https://dev.codeonline-edi.net');
socket.on('connect', () => console.log('✅ WebSocket connecté'));
```

---

## 🔄 Script de Déploiement Automatisé

Créez le fichier `deploy.sh` à la racine du projet :

```bash
#!/bin/bash

echo "🚀 Déploiement CodeOnline EDI - Environnement DEV"

# Variables
SERVER="user@dev.codeonline-edi.net"
REMOTE_DIR="/var/www/codeonline-edi"
BACKEND_DIR="/var/www/Edi-dev/backend"

# 1. Build local
echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# 2. Transfert des fichiers
echo "📤 Transferring files to server..."
rsync -avz --delete dist/ $SERVER:$REMOTE_DIR/dist/

# 3. Redémarrage du backend (si nécessaire)
echo "🔄 Restarting backend..."
ssh $SERVER "cd $BACKEND_DIR && pm2 restart codeonline-backend"

# 4. Vérification
echo "✅ Deployment completed!"
echo "🌐 Visit: https://dev.codeonline-edi.net"
```

Rendre le script exécutable :
```bash
chmod +x deploy.sh
```

Utilisation :
```bash
./deploy.sh
```

---

## 🐛 Dépannage

### Problème : Erreur MIME type

**Symptôme** : `Le chargement du module à l'adresse ... a été bloqué en raison d'un type MIME interdit`

**Solution** :
1. Vérifier que le build a été fait : `ls -la dist/`
2. Vérifier que Nginx pointe vers `/dist` et non `/src`
3. Vérifier la config Nginx : `sudo nginx -t`
4. Recharger Nginx : `sudo systemctl reload nginx`

### Problème : Page blanche

**Symptôme** : La page charge mais reste blanche

**Solution** :
1. Ouvrir la console navigateur (F12)
2. Vérifier les erreurs JavaScript
3. Vérifier que les chemins des assets sont corrects
4. Vérifier les logs Nginx : `sudo tail -f /var/log/nginx/codeonline-edi-error.log`

### Problème : API ne répond pas

**Symptôme** : Erreurs 502 Bad Gateway ou timeout

**Solution** :
1. Vérifier que le backend tourne : `pm2 status`
2. Vérifier les logs backend : `pm2 logs codeonline-backend`
3. Vérifier la connexion DB : 
   Recupérez les identifiants dans le fichier `.env` et testez la connexion :
   `mysql -h $DB_HOST -u $DB_USER -p $DB_NAME`
4. Redémarrer le backend : `pm2 restart codeonline-backend`

### Problème : WebSocket ne se connecte pas

**Symptôme** : Erreurs de connexion Socket.IO

**Solution** :
1. Vérifier la config Nginx pour `/socket.io/`
2. Vérifier que le backend écoute sur le bon port
3. Vérifier les CORS dans `server.js`

---

## 📊 Checklist de Déploiement

- [ ] Build frontend réussi (`npm run build`)
- [ ] Fichiers `dist/` transférés sur le serveur
- [ ] Configuration Nginx créée et activée
- [ ] Certificat SSL installé (Let's Encrypt)
- [ ] Backend Node.js démarré avec PM2
- [ ] Variables d'environnement configurées
- [ ] Permissions fichiers correctes (`www-data`)
- [ ] Tests frontend (chargement page)
- [ ] Tests backend (API répond)
- [ ] Tests WebSocket (connexion OK)
- [ ] Logs vérifiés (pas d'erreurs)

---

## 📚 Commandes Utiles

```bash
# Frontend
npm run build              # Builder pour production
npm run preview            # Tester le build en local

# Backend
pm2 start server.js        # Démarrer
pm2 restart codeonline-backend  # Redémarrer
pm2 stop codeonline-backend     # Arrêter
pm2 logs codeonline-backend     # Voir les logs
pm2 monit                  # Monitoring en temps réel

# Nginx
sudo nginx -t              # Tester la config
sudo systemctl reload nginx     # Recharger
sudo systemctl restart nginx    # Redémarrer
sudo tail -f /var/log/nginx/codeonline-edi-error.log  # Logs erreurs

# SSL
sudo certbot renew         # Renouveler certificats
sudo certbot certificates  # Voir les certificats

# Système
df -h                      # Espace disque
free -h                    # Mémoire
htop                       # Monitoring CPU/RAM
```

---

## 🔗 Ressources

- [Vite Build Guide](https://vitejs.dev/guide/build.html)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

**Date de création** : 5 février 2025  
**Auteur** : Équipe Technique CodeOnline  
**Environnement** : dev.codeonline-edi.net (Serveur Sénégal)
