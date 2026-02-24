# Guide de Déploiement - Environnement de Développement

Ce document détaille la procédure pour déployer l'application et la base de données sur le serveur de développement (Sénégal - `dev.codeonline-edi.net`).

## Prérequis

- Accès au serveur de base de données MySQL distant.
- Node.js installé sur la machine qui exécutera les scripts de déploiement.
- Fichier `.env` configuré avec les accès à la base de données de dev.

## Étape 1 : Vérification et Mise à jour du Schéma de Base de Données

Avant de démarrer l'application, il faut s'assurer que la base de données contient toutes les tables et colonnes nécessaires pour le module EDI et Commandes.

Nous avons créé un script SQL **idempotent** (peut être exécuté plusieurs fois sans risque) qui :
1. Crée les tables manquantes (`orders`, `edi_transmissions`, `edi_desadv`, etc.).
2. Ajoute les colonnes manquantes dans les tables existantes.

### Méthode A : Via un client SQL (Workbench, phpMyAdmin, DBeaver)

1. Ouvrez votre client SQL et connectez-vous à la base de données de dev.
2. Ouvrez le fichier `backend/verify_edi_schema.sql`.
3. Exécutez tout le script.

### Méthode B : Via Node.js (Script personnalisé)

Vous pouvez créer un petit script runner si vous n'avez pas d'accès direct GUI.

```javascript
// backend/run_schema_update.js
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });
    
    const sql = fs.readFileSync('./verify_edi_schema.sql', 'utf8');
    await connection.query(sql);
    console.log('Schema update completed.');
    await connection.end();
}
run();
```

## Étape 2 : Configuration des Paramètres (URLs)

Une fois la structure de la base prête, il faut configurer les URLs pour que l'environnement fonctionne en mode hybride (Serveur Sénégal Distant + Client Tunisie Local).

1. Ouvrez le fichier `backend/deploy_config_dev.sql` (ou utilisez le runner `backend/run_deploy_config.js`).
2. Ce script va :
   - Définir `API_URL_SENEGAL` sur `https://dev.codeonline-edi.net`
   - Définir `API_URL_TUNISIA` sur `http://localhost:5001` (ou votre URL ngrok)
   - Configurer les rôles Acheteur/Fournisseur.

Exécution via Node.js :
```bash
cd backend
node run_deploy_config.js
```

## Étape 3 : Gestion du Mixed Content (HTTPS vs HTTP)

Le serveur de dev étant en **HTTPS**, il ne pourra pas appeler directement votre API locale en **HTTP** (blocage navigateur).

**Options :**
1. **Recommandé** : Utiliser **ngrok** pour exposer votre port 5001 en HTTPS.
   ```bash
   ngrok http 5001
   ```
   Mettez ensuite à jour l'URL Tunisie dans la base de données :
   ```sql
   UPDATE app_parameters SET param_value = 'https://xxxx.ngrok.io' WHERE param_key = 'API_URL_TUNISIA';
   ```
   (Puis rechargez la config via `/api/settings/reload`)

2. **Désactiver la sécurité** (Pour test rapide seulement) : Lancer Chrome avec `--allow-running-insecure-content`.

## Résumé des Fichiers

| Fichier | Description |
|---------|-------------|
| `backend/verify_edi_schema.sql` | Crée/Vérifie tables et colonnes (Idempotent). |
| `backend/deploy_config_dev.sql` | Configure les URLs pour l'env Dev/Sénégal. |
| `backend/run_deploy_config.js` | Script Node pour appliquer la config ci-dessus. |
