# 🌍 Guide de Déploiement Multi-Pays & Gestion des Ports

Ce document répond aux questions techniques sur les ports, la configuration multi-pays et la procédure de modification.

---

## ❓ 1. Pourquoi ne pas utiliser `127.0.0.1:5000` si `0.0.0.0:5000` est pris ?

**La réponse technique :**
En réseau TCP/IP, l'adresse `0.0.0.0` est une "Wildcard" (Joker) qui signifie **"Toutes les adresses IP de la machine"**.

*   Si un processus écoute sur `0.0.0.0:5000`, il occupe le port 5000 sur l'IP publique, sur le réseau local, **ET** sur `127.0.0.1`.
*   Le port est donc **totalement verrouillé** par ce processus.
*   Il est impossible de lancer un autre processus sur `127.0.0.1:5000` tant que le premier processus (celui qui écoute sur `0.0.0.0`) n'est pas arrêté.

**Conclusion :** Comme nous ne pouvons pas arrêter le processus root qui bloque le port 5000, nous sommes obligés d'utiliser un port libre (ex: **5001**).

---

## 🛠 2. Checklist : Revenir au Port 5001

Pour configurer l'application sur le port 5001 (Standard DEV), voici exactement les 3 endroits à modifier.

### A. Fichiers de l'Application (À modifier dans le code)
Ces modifications ont déjà été appliquées sur votre environnement actuel.

| Fichier | Modification |
| :--- | :--- |
| **1. `backend/.env`** | Changer `PORT=5000` en `PORT=5001` |
| **2. `ecosystem.senegal.config.cjs`** | Dans la section `env`, mettre `PORT: 5001` |

### B. Configuration Serveur (À faire par l'Admin)
C'est la partie manquante actuelle sur le serveur Sénégal.

| Fichier | Modification |
| :--- | :--- |
| **3. Config Apache** | `/etc/apache2/sites-available/dev.codeonline-edi.net.conf` |

**Code à modifier dans Apache :**
```apache
<VirtualHost *:80>
    # ...
    
    # ❌ ANCIEN (Port bloqué)
    # ProxyPass /api http://localhost:5000/api
    # ProxyPassReverse /api http://localhost:5000/api
    
    # ✅ NOUVEAU (Port libre)
    ProxyPass /api http://localhost:5001/api
    ProxyPassReverse /api http://localhost:5001/api
    
    # De même pour les WebSockets si configurés
    # RewriteRule /(.*) ws://localhost:5001/$1 [P,L]
    
    # ...
</VirtualHost>
```

---

## 🚀 3. Procédure pour déployer un NOUVEAU PAYS (ex: Cameroun)

Si vous devez installer l'application pour un autre pays sur le même serveur, vous devez créer une **nouvelle instance totalement séparée**.

### 📋 Résumé des Prérequis
*   **Nouveau Dossier :** `/var/www/Edi-cameroun`
*   **Nouvelle Base de Données :** `Cameroun_Entitedb`
*   **Nouveau Port :** `5002` (Car 5000 et 5001 sont pris)
*   **Nouveau Sous-domaine :** `cameroun.codeonline-edi.net`

### 👣 Étapes pas à pas

#### 1. Préparer le Code Local
Créez un fichier de config PM2 spécifique : `ecosystem.cameroun.config.cjs`
```javascript
module.exports = {
  apps: [{
    name: 'codeonline-edi-cameroun', // Nom unique
    cwd: '/var/www/Edi-cameroun/backend', // Dossier unique
    script: './server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 5002, // ⚠️ PORT UNIQUE OBLIGATOIRE
      DB_NAME: 'Cameroun_Entitedb'
    }
  }]
}
```

#### 2. Préparer le Serveur
Connectez-vous et créez l'architecture :
```bash
# Création du dossier
mkdir -p /var/www/Edi-cameroun

# Copie des fichiers (via votre script de déploiement adapté)
# ...
```

#### 3. Configurer Apache (Admin)
Demandez à l'admin de créer un nouveau VirtualHost qui pointe vers le **Port 5002**.

```apache
<VirtualHost *:80>
    ServerName cameroun.codeonline-edi.net
    
    # Redirection vers le port 5002
    ProxyPass /api http://localhost:5002/api
    ProxyPassReverse /api http://localhost:5002/api
</VirtualHost>
```

---

## � 4. Déploiement Simplifié (Nouveau Script Universel)

Nous avons créé un script unique **`deploy_universal.sh`** pour gérer tous les pays.

### Comment ça marche ?
Au lieu de modifier le script de déploiement, vous créez simplement un fichier de **configuration** dans le dossier `deploy_configs/`.

### Exemple pour ajouter le Cameroun :

1.  **Copier le template** :
    ```bash
    cp deploy_configs/template.conf deploy_configs/cameroun.conf
    ```

2.  **Modifier `deploy_configs/cameroun.conf`** :
    ```bash
    COUNTRY_NAME="Cameroun"
    REMOTE_ROOT="/var/www/Edi-cameroun"
    PM2_APP_NAME="codeonline-edi-cameroun"
    PM2_PORT=5002  # ⚠️ Port Unique
    DB_NAME="Cameroun_Entitedb"
    API_PUBLIC_URL="https://cameroun.codeonline-edi.net"
    ```

3.  **Lancer le déploiement** :
    ```bash
    ./deploy_universal.sh deploy_configs/cameroun.conf
    ```

Ce script va automatiquement :
*   Construire le Frontend avec la bonne URL API.
*   Générer le fichier `ecosystem.config.cjs` avec le bon PORT et DB.
*   Transférer les fichiers.
*   Installer les dépendances et redémarrer PM2.

*(Note : La création du VirtualHost Apache par l'admin reste nécessaire).*

---

## �📊 Tableau Récapitulatif des Ports

| Pays | Environnement | Port Node.js | Base de Données |
| :--- | :--- | :--- | :--- |
| **Tunisie** | Prod | 5000 | `EntiteDb` |
| **Tunisie** | Dev | 5001 | `Dev_Entitedb` |
| **Sénégal** | Dev | **5001** | `Dev_Entitedb` |
| *Futur Pays* | Prod | **5002** | `Cameroun_Entitedb` |
