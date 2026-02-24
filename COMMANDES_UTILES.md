# 🛠️ Liste des Commandes Utiles (Mémo)

Ce document regroupe toutes les commandes système, de diagnostic et de maintenance utilisées pour les serveurs de développement (Sénégal et Tunisie).

---

## 🌍 1. Connexion SSH

### Serveur Sénégal (Dev)
```bash
ssh -p 22 Consultant@91.134.35.126
```

### Serveur Tunisie (Dev)
```bash
ssh -p 22 Consultant@217.182.94.86
```

---

## 🚀 2. Commandes Rapides (One-Liners)
*Commandes à copier-coller pour diagnostiquer sans ouvrir de shell interactif.*

### 🔍 Diagnostic Système & Réseau
```bash
# Vérifier les ports en écoute (Backend doit être sur 5001)
ssh -p 22 Consultant@91.134.35.126 "sudo netstat -tulpn | grep 500"

# Santé du serveur (Disque & RAM)
ssh -p 22 Consultant@91.134.35.126 "df -h && free -m"
```

### 🌐 Apache & Certificats
```bash
# Vérifier la syntaxe Apache
ssh -p 22 Consultant@91.134.35.126 "sudo apache2ctl -t"

# Voir la config Apache actuelle du site Dev
ssh -p 22 Consultant@91.134.35.126 "cat /etc/apache2/sites-available/dev.codeonline-edi.net.conf"

# Identifier le fichier de config actif pour le domaine
ssh -p 22 Consultant@91.134.35.126 "grep -l 'ServerName codeonline-edi.net' /etc/apache2/sites-available/*.conf"

# Vérifier la présence des certificats SSL
ssh -p 22 Consultant@91.134.35.126 "sudo ls -la /etc/letsencrypt/live/dev.codeonline-edi.net/"

# Lire les 50 dernières erreurs Apache
ssh -p 22 Consultant@91.134.35.126 "tail -n 50 /var/log/apache2/error.log"
```

### 📦 Backend Node.js & PM2
```bash
# Lister les processus PM2
ssh -p 22 Consultant@91.134.35.126 "pm2 list"

# Redémarrer le backend (avec update-env pour prendre en compte les changements)
ssh -p 22 Consultant@91.134.35.126 "cd /var/www/Edi-dev && pm2 startOrReload ecosystem.config.cjs --update-env"

# Tester si l'API répond localement (Port 5001)
ssh -p 22 Consultant@91.134.35.126 "curl -v http://localhost:5001/api/settings"

# Tester la connexion WebSocket (Polling)
ssh -p 22 Consultant@91.134.35.126 "curl -v 'http://localhost:5001/socket.io/?EIO=4&transport=polling'"
```

### 🗄️ Base de Données
```bash
# Vérifier la configuration en base (app_parameters)
ssh -p 22 Consultant@91.134.35.126 "mysql -u utilisateur_db -p nom_base_de_donnees -e 'SELECT * FROM app_parameters'"
```

### 📂 Fichiers & Permissions
```bash
# Vérifier le dossier Frontend (dist)
ssh -p 22 Consultant@91.134.35.126 "ls -la /var/www/html/codeonline/dist"

# Vérifier les permissions Uploads (GED)
ssh -p 22 Consultant@91.134.35.126 "ls -ld /var/www/html/codeonline/backend/uploads"

# Vérifier le fichier .env (Présence uniquement)
ssh -p 22 Consultant@91.134.35.126 "ls -la /var/www/html/codeonline/backend/.env"
```

---

## 🆘 3. Troubleshooting Rapide

| Symptôme | Cause Probable | Commande de vérification | Action Corrective |
| :--- | :--- | :--- | :--- |
| **Erreur 502 / 503** | Backend éteint ou crashé | `pm2 list` | `pm2 restart backend` |
| **Erreur 404 sur /api/** | Proxy Apache mal configuré | `cat /etc/apache2/...conf` | Lancer `setup_proxy_admin.sh` |
| **Page blanche (Frontend)** | Fichiers `dist` manquants | `ls -la .../dist` | Redéployer le frontend |
| **Socket déconnecté** | WebSocket non proxifié | `curl .../socket.io/...` | Fixer config Apache (ProxyPass) |
| **Erreur Upload** | Droits d'écriture manquants | `ls -ld .../uploads` | `chmod 755 .../uploads` |

---

## 📂 4. Chemins Importants

| Description | Chemin sur le serveur |
| :--- | :--- |
| **Racine du projet** | `/var/www/html/codeonline/` |
| **Backend (Node.js)** | `/var/www/html/codeonline/backend/` |
| **Frontend (React Build)** | `/var/www/html/codeonline/dist/` |
| **Logs Apache** | `/var/log/apache2/` |
| **Config Apache** | `/etc/apache2/sites-available/` |
| **Uploads / GED** | `/var/www/html/codeonline/backend/uploads/` |
| **Certificats SSL** | `/etc/letsencrypt/live/dev.codeonline-edi.net/` |

---

## 🛠️ 5. Actions de Maintenance (Détaillées)

### 📥 Déploiement du Correctif Apache
Si vous devez appliquer le correctif de proxy :
```bash
# 1. Uploader le script
scp -P 22 setup_proxy_admin.sh Consultant@91.134.35.126:/tmp/

# 2. Exécuter le script (Admin)
ssh -p 22 Consultant@91.134.35.126 "sudo bash /tmp/setup_proxy_admin.sh"

# 3. Vérifier le résultat
ssh -p 22 Consultant@91.134.35.126 "curl -I -k https://dev.codeonline-edi.net/api/settings"
```

### 📥 Correction Base de Données
Si vous devez corriger les paramètres `app_parameters` :
```bash
# 1. Uploader le SQL
scp -P 22 fix_senegal_config.sql Consultant@91.134.35.126:/tmp/

# 2. Importer
ssh -p 22 Consultant@91.134.35.126 "mysql -u utilisateur_db -p nom_base_de_donnees < /tmp/fix_senegal_config.sql"

# 3. Redémarrer le backend
ssh -p 22 Consultant@91.134.35.126 "pm2 restart backend"
