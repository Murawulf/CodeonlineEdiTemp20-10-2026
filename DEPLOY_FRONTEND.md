# 🚀 Guide de Déploiement Frontend (React/Vite)

Ce guide explique comment déployer l'application Frontend sur votre serveur de production.

## 📋 Prérequis

- Accès SSH au serveur distant
- Nginx installé sur le serveur
- Le backend doit déjà tourner sur le port **5001** (comme configuré précédemment)

---

## 🛠️ Étape 1 : Préparation du Build

Assurez-vous que votre fichier `.env.production` contient la bonne URL de l'API :

```ini
VITE_API_BASE_URL=https://dev.codeonline-edi.net
```

Générez le build de production sur votre machine locale :

```bash
npm run build
```

Cela va créer un dossier `dist/` contenant tous les fichiers statiques optimisés.

---

## 📤 Étape 2 : Transfert des Fichiers vers le Serveur

Vous devez copier le contenu du dossier `dist/` vers le dossier web de votre serveur (par exemple `/var/www/codeonline-edi/dist`).

### Option A : Via SCP (Ligne de commande)

Exécutez cette commande **depuis votre machine locale** :

```bash
# Créer le dossier distant s'il n'existe pas
ssh user@votre-serveur "mkdir -p /var/www/codeonline-edi/dist"

# Copier les fichiers
scp -r dist/* user@votre-serveur:/var/www/codeonline-edi/dist/
```
*(Remplacez `user@votre-serveur` par vos identifiants réels)*

### Option B : Via FileZilla / WinSCP
1. Connectez-vous à votre serveur.
2. Naviguez vers `/var/www/codeonline-edi/dist`.
3. Uploadez tout le contenu du dossier local `dist/`.

---

## ⚙️ Étape 3 : Configuration de Nginx

Le fichier `nginx.conf` du projet a été mis à jour pour utiliser le port **5001** pour le backend.

### 1. Copier la configuration sur le serveur

**Depuis votre machine locale :**
```bash
scp nginx.conf user@votre-serveur:/tmp/codeonline-edi.conf
```

### 2. Installer la configuration sur le serveur

Connectez-vous en SSH au serveur et exécutez :

```bash
# Déplacer le fichier au bon endroit
sudo mv /tmp/codeonline-edi.conf /etc/nginx/sites-available/codeonline-edi

# Créer un lien symbolique pour activer le site
sudo ln -s /etc/nginx/sites-available/codeonline-edi /etc/nginx/sites-enabled/

# Vérifier la configuration
sudo nginx -t
```

Si le test est concluant (`syntax is ok`), redémarrez Nginx :

```bash
sudo systemctl restart nginx
```

---

## 🔐 Étape 4 : SSL (HTTPS) avec Certbot

Si vous n'avez pas encore de certificat SSL pour `dev.codeonline-edi.net` :

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d dev.codeonline-edi.net
```

---

## 🔍 Vérification

Ouvrez votre navigateur sur `https://dev.codeonline-edi.net`.

1. **Frontend :** L'application doit se charger.
2. **API :** Les appels API (Login, etc.) doivent fonctionner (ils sont proxyés vers localhost:5001).
3. **Console :** Vérifiez qu'il n'y a pas d'erreurs rouges dans la console développeur (F12).

---

## 🔄 Mises à jour futures

Pour mettre à jour le frontend :
1. Faites vos modifications en local.
2. `npm run build`
3. Transférez le contenu de `dist/` sur le serveur (Étape 2).
4. (Pas besoin de redémarrer Nginx pour une simple mise à jour de fichiers statiques).
