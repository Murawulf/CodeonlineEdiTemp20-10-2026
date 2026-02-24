# 🚀 Guide de Déploiement Frontend (Apache)

Ce guide explique comment déployer l'application Frontend React sur un serveur **Apache**.

## 📋 Prérequis

- Serveur Apache installé (`sudo apt install apache2`)
- Modules Proxy activés (`proxy`, `proxy_http`, `rewrite`, `headers`)
- Backend Node.js tournant sur le port **5001**

---

## 🛠️ Étape 1 : Activer les Modules Apache Requis

Connectez-vous au serveur et activez les modules nécessaires :

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod proxy_wstunnel  # Important pour Socket.IO
sudo systemctl restart apache2
```

---

## 📤 Étape 2 : Préparer et Transférer les Fichiers

1. **Build local** (si ce n'est pas déjà fait) :
   ```bash
   npm run build
   ```
   *(Assurez-vous que le fichier `public/.htaccess` a bien été copié dans `dist/`. Si non, copiez-le manuellement).*

2. **Créer le dossier sur le serveur** :
   ```bash
   sudo mkdir -p /var/www/codeonline-edi/dist
   sudo chown -R $USER:$USER /var/www/codeonline-edi
   ```

3. **Transférer les fichiers** (depuis votre machine locale) :
   ```bash
   scp -r dist/* user@votre-serveur:/var/www/codeonline-edi/dist/
   scp public/.htaccess user@votre-serveur:/var/www/codeonline-edi/dist/
   ```

---

## ⚙️ Étape 3 : Configuration Apache (VirtualHost)

J'ai préparé un fichier `apache-codeonline.conf` adapté.

1. **Envoyer le fichier de config sur le serveur** :
   ```bash
   scp apache-codeonline.conf user@votre-serveur:/tmp/codeonline-edi.conf
   ```

2. **Installer la configuration** (sur le serveur) :
   ```bash
   sudo mv /tmp/codeonline-edi.conf /etc/apache2/sites-available/codeonline-edi.conf
   
   # Activer le site
   sudo a2ensite codeonline-edi.conf
   
   # Vérifier la syntaxe
   sudo apache2ctl configtest
   ```

3. **Redémarrer Apache** :
   Si le test est "Syntax OK" :
   ```bash
   sudo systemctl reload apache2
   ```

---

## 🔐 Étape 4 : SSL (HTTPS)

Si vous utilisez Certbot pour le HTTPS, lancez-le maintenant. Il détectera automatiquement la configuration Apache et l'adaptera :

```bash
sudo certbot --apache -d dev.codeonline-edi.net
```

---

## 🔍 Vérification

Ouvrez **https://dev.codeonline-edi.net**.

1. **Application React** : Doit se charger correctement.
2. **Navigation** : En cliquant sur les liens, le rechargement de la page (F5) ne doit pas faire d'erreur 404 (grâce au `.htaccess`).
3. **API Backend** : Les appels API doivent réussir (proxy vers localhost:5001).
4. **WebSocket** : Socket.IO doit se connecter.

---

## ⚠️ Dépannage

**Erreur 404 sur les API ?**
Vérifiez que le module proxy est bien chargé :
```bash
sudo apache2ctl -M | grep proxy
```

**Erreur 500 ou 502 ?**
Vérifiez que le backend Node.js tourne bien sur le port 5001 :
```bash
curl http://localhost:5001/api/settings
```
S'il ne répond pas, vérifiez PM2 : `pm2 status`.
