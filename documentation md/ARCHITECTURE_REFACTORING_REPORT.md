# Rapport de Refactoring et Architecture Technique - Février 2026

**Date :** 07 Février 2026
**Auteur :** Majd Hakim (Chef de Projet)
**Objet :** Centralisation de la configuration Base de Données et Sécurisation

---

## 1. Contexte et Problématique

**Contexte :**
L'application Codeonline-EDI a évolué vers une architecture multi-clients et multi-environnements (Tunisie, Sénégal, etc.). Jusqu'à présent, la configuration de connexion à la base de données (IP, Utilisateur, Mot de passe) était dupliquée en dur ("hardcoded") dans de nombreux fichiers du backend :
*   `server.js` (Serveur principal)
*   Scripts de maintenance (`check_db.js`, `reprocess_transmissions.js`)
*   Scripts de debug (`debug_entities.js`, etc.)
*   Scripts de migration

**Problèmes identifiés :**
1.  **Risque de sécurité** : Mots de passe et adresses IP visibles dans le code source.
2.  **Maintenance complexe** : Pour changer l'adresse du serveur (ex: migration vers le serveur Sénégal `91.134.35.126`), il fallait modifier plus de 20 fichiers manuellement.
3.  **Incohérence** : Risque que certains scripts pointent vers l'ancienne base de données (Tunisie) alors que l'application tourne sur la nouvelle (Sénégal).

## 2. Solution Architecturale Mise en Œuvre

Nous avons procédé à un refactoring majeur de la couche d'accès aux données pour centraliser toute la configuration.

### 2.1. Module Centralisé (`backend/config/database.js`)

Un nouveau module unique est désormais responsable de la création des connexions à la base de données. Il tire ses paramètres exclusivement des variables d'environnement.

**Architecture :**
```javascript
// backend/config/database.js
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST,      // Configurable par environnement
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // ... options de pool (connexions simultanées, timeouts)
};

const pool = mysql.createPool(dbConfig); // Gestionnaire de connexions partagé

module.exports = { pool, dbConfig };
```

### 2.2. Standardisation via Variables d'Environnement (`.env`)

La configuration est désormais externalisée. Chaque environnement dispose de son propre fichier `.env` qui n'est pas versionné dans le code (sauf le template).

**Exemple de configuration Production (Sénégal) :**
```properties
DB_HOST=91.134.35.126
DB_USER=Consultant
DB_PASSWORD=***********
DB_NAME=Dev_Entitedb
```

## 3. Périmètre du Refactoring

L'ensemble des composants backend a été mis à jour pour consommer ce nouveau module central :

1.  **Serveur API (`server.js`)** :
    *   Suppression de l'objet `ENTITE_MYSQL_CONFIG` en dur.
    *   Utilisation du `pool` importé depuis `config/database.js`.

2.  **Scripts de Maintenance & Workers** :
    *   `reprocess_transmissions.js` (Retraitement EDI)
    *   `check_db.js`, `check_existing_glns.js` (Vérifications)
    *   `add_compte.js` (Gestion utilisateurs)

3.  **Scripts de Debug** :
    *   Tous les scripts `debug_*.js` utilisent maintenant la configuration dynamique.

4.  **Outils de Migration** :
    *   `run_deploy_config.js` et `run_migrations_phase3.js` s'adaptent automatiquement à l'environnement cible.

## 4. Bénéfices pour le Projet

| Bénéfice | Description |
| :--- | :--- |
| **Agilité de Déploiement** | Le déploiement sur un nouveau serveur (ex: Maroc, Côte d'Ivoire) ne nécessite plus aucune modification de code. Seul le fichier `.env` change. |
| **Sécurité Accrue** | Aucune IP ni mot de passe ne transite dans le gestionnaire de version (Git). |
| **Fiabilité** | Garantie que tous les scripts (API, Workers, Debug) tapent sur la même base de données. |
| **Scalabilité** | L'utilisation centralisée d'un `pool` de connexions optimise la gestion des ressources serveur. |

## 5. Instructions pour les Déploiements Futurs

Lors de l'installation sur un nouveau serveur :

1.  Cloner le code source.
2.  Copier le fichier modèle : `cp .env.example .env`.
3.  Éditer le `.env` avec les paramètres spécifiques du client/pays :
    *   `DB_HOST` : Adresse IP du serveur de BDD local.
    *   `DB_USER` / `DB_PASSWORD` : Identifiants locaux.
4.  Lancer l'application (`pm2 start ...`).

Aucune recompilation ou modification de fichier `.js` n'est nécessaire.
