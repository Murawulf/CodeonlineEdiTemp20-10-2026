# 🇹🇳 DIAGNOSTIC & PROCÉDURE DE RÉPARATION : SERVEUR TUNISIE

## 🚨 DIAGNOSTIC CRITIQUE (217.182.94.86)

Le serveur Tunisie est actuellement hors service pour l'environnement DEV. Voici les 3 problèmes majeurs identifiés :

1.  **❌ Fichier de Configuration ABSENT**
    *   Le fichier `/var/www/Edi-dev/backend/.env` **n'existe pas**.
    *   Conséquence : L'application ne connaît ni le port (5001), ni la base de données, ni les clés secrètes. Elle plante ou démarre mal.

2.  **⚠️ Processus Fantôme en ROOT**
    *   Un processus Node.js tourne avec l'utilisateur **root** (PID `1160294`).
    *   C'est dangereux et cela empêche votre utilisateur `Consultant` de reprendre la main correctement.

3.  **🔌 Ports Inaccessibles**
    *   À cause de l'absence de `.env`, l'application ne sait pas qu'elle doit écouter sur le port 5001.

---

## 🛠 PROCÉDURE DE REMISE EN ROUTE (Pas à pas)

Cette procédure est divisée en deux parties : ce que l'ADMIN doit faire (car il faut être root), et ce que VOUS devez faire.

### ÉTAPE 1 : Action ADMINISTRATEUR (Obligatoire)
Transmettez ce message exact à votre administrateur :

> **Demande d'intervention Serveur Tunisie (217.182.94.86)**
>
> 1. **Tuer le processus bloquant :** Un processus Node tourne en root et bloque le déploiement.
>    `kill -9 1160294` (ou `pkill -f "node /var/www/Edi-dev/backend/server.js"`)
>
> 2. **Nettoyer les permissions (si nécessaire) :** S'assurer que tout le dossier appartient bien à Consultant.
>    `chown -R Consultant:Consultant /var/www/Edi-dev`

---

### ÉTAPE 2 : Action CONSULTANT (Une fois l'étape 1 faite)

Dès que l'admin a tué le processus root, connectez-vous et exécutez ces commandes pour recréer la configuration et relancer l'app.

#### 1. Créer le fichier `.env` manquant
Connectez-vous en SSH :
```bash
ssh -p 22 Consultant@217.182.94.86
```

Créez le fichier `.env` (Copiez-collez ce bloc entier) :
```bash
cat > /var/www/Edi-dev/backend/.env << EOF
PORT=5001
NODE_ENV=development
DB_NAME=Dev_Entitedb
DB_USER=root
DB_PASS=
DB_HOST=127.0.0.1
JWT_SECRET=votre_secret_jwt_ici
UPLOAD_DIR=uploads
EOF
```
*(⚠️ Modifiez `DB_PASS` et `JWT_SECRET` avec les vraies valeurs si vous les connaissez, ou reprenez celles du serveur Sénégal).*

#### 2. Installer et Démarrer proprement avec PM2
Toujours connecté en SSH :

```bash
cd /var/www/Edi-dev/backend

# Installer les dépendances (au cas où)
npm install --production

# Lancer avec PM2 sur le bon port
pm2 start server.js --name "codeonline-edi-dev-tunisie" --watch --env PORT=5001

# Sauvegarder pour le redémarrage auto
pm2 save
```

#### 3. Vérifier
```bash
# Doit retourner un JSON de config
curl http://localhost:5001/api/settings
```
