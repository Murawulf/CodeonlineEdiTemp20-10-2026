# 🛠️ Configuration Apache Requise - Serveur Sénégal

Le problème vient du fait que **Apache ne redirige pas les requêtes API vers votre application Node.js** qui tourne sur le port 5001. Apache cherche les fichiers dans le dossier `/api` qui n'existe pas, d'où l'erreur 404.

Vous devez modifier la configuration du VirtualHost Apache pour ajouter les directives `ProxyPass`.

## 1. Modifier le fichier de configuration Apache

Connectez-vous au serveur et éditez le fichier de configuration du site (généralement dans `/etc/apache2/sites-available/` ou `/etc/httpd/conf.d/`).

```bash
sudo nano /etc/apache2/sites-available/dev.codeonline-edi.net.conf
# OU
sudo nano /etc/apache2/sites-available/000-default.conf
```

Ajoutez les lignes suivantes à l'intérieur du bloc `<VirtualHost *:443>` (ou `*:80` si vous n'avez pas SSL, mais vous semblez être en HTTPS) :

```apache
<VirtualHost *:443>
    ServerName dev.codeonline-edi.net
    DocumentRoot /var/www/Edi-dev

    # ... vos configurations SSL existantes ...

    # ✅ CONFIGURATION REQUISE POUR NODE.JS (API & WebSocket)
    
    # Activer le proxy pour les WebSocket
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:5001/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*)           http://localhost:5001/$1 [P,L]

    # Proxy pour Socket.io (WebSocket)
    ProxyPass /socket.io/ http://localhost:5001/socket.io/
    ProxyPassReverse /socket.io/ http://localhost:5001/socket.io/

    # Proxy pour l'API
    ProxyPass /api/ http://localhost:5001/api/
    ProxyPassReverse /api/ http://localhost:5001/api/

    # Fallback pour le Frontend (SPA) - Gestion des routes React
    <Directory /var/www/Edi-dev>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        
        RewriteEngine On
        # Si ce n'est pas un fichier ou un dossier existant, rediriger vers index.html
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_URI} !^/api/
        RewriteCond %{REQUEST_URI} !^/socket.io/
        RewriteRule . /index.html [L]
    </Directory>

    # Logs
    ErrorLog ${APACHE_LOG_DIR}/codeonline-edi-error.log
    CustomLog ${APACHE_LOG_DIR}/codeonline-edi-access.log combined
</VirtualHost>
```

## 2. Activer les modules Apache requis

Assurez-vous que les modules proxy sont activés :

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod rewrite
```

## 3. Redémarrer Apache

```bash
sudo systemctl restart apache2
```

## 🔍 Pourquoi c'est nécessaire ?

- **Sans ProxyPass** : Apache cherche un dossier physique `/var/www/Edi-dev/api/settings`. Il n'existe pas → **404 Not Found**.
- **Avec ProxyPass** : Apache voit `/api/settings` et transmet la requête à `http://localhost:5001/api/settings` (votre application Node.js).
