# 📝 Rapport de Refactoring & État des Lieux

## 1. 🚨 État Critique des Serveurs (Action Requise)

Les serveurs de Développement (Sénégal et Tunisie) sont actuellement **inopérants pour l'API** à cause d'une configuration Apache non mise à jour.

| Serveur | URL | Problème | Solution Requise |
| :--- | :--- | :--- | :--- |
| **Sénégal** | `dev.codeonline-edi.net` | Pointe vers le port **5000** (Prod) au lieu de **5001** (Dev) | Exécuter `sudo bash /tmp/setup_proxy_admin.sh` |
| **Tunisie** | `edi-dev.codeonline-info.com` | Erreur 404 (Probable manque de ProxyPass) | Vérifier config Apache et appliquer le même fix |

**Tant que l'administrateur système n'exécute pas le script de correction, le site de DEV ne fonctionnera pas correctement.**

---

## 2. 🛠️ Refactoring du Code (Réalisé)

Conformément à votre demande, j'ai audité et modifié le code pour remplacer les valeurs en dur par une configuration dynamique gérée via la base de données (`app_parameters`).

### ✅ Backend (`backend/server.js` & `workers/edi_worker.js`)

*   **API PIN** :
    *   AVANT : `const API_PIN = '3311';` (En dur)
    *   APRÈS : `configService.get('API_PIN')` (Dynamique)
*   **Email (Brevo/SMTP)** :
    *   AVANT : Constantes `BREVO_SMTP_USER`, `BREVO_API_KEY`, `FROM_EMAIL` en dur.
    *   APRÈS : Nouvelle fonction `initMailer()` qui charge ces identifiants depuis la base de données au démarrage.
*   **Chemins de fichiers** :
    *   AVANT : Chemins fixes pour `EANCOM_BASE_DIR`.
    *   APRÈS : `configService.getEdiOrdersPath()` permettant de changer le dossier de stockage sans toucher au code.
*   **Routing EDI** :
    *   Utilisation généralisée de `configService.getEdiTargetUrl()` pour déterminer dynamiquement où envoyer les fichiers (Sénégal/Tunisie/Local) selon le GLN du partenaire.

### ✅ Frontend (`src/`)

*   **URLs d'API** :
    *   L'application utilise déjà `SettingsContext` (`src/contexts/SettingsContext.tsx`) pour charger l'URL de l'API dynamiquement.
    *   J'ai vérifié `src/pages/operation-edi/Order.tsx` et `src/contexts/NotificationContext.tsx`, ils utilisent correctement `useSettings()` ou des configurations relatives.
    *   Les références à `localhost` restantes sont dans des commentaires ou des fichiers de documentation/tests, ce qui est normal.

## 3. 🚀 Prochaines Étapes pour Vous

1.  **URGENT** : Relancer l'administrateur système pour appliquer le script Apache sur le serveur Sénégal.
2.  **Base de Données** : Assurez-vous que la table `app_parameters` contient bien les clés suivantes (sinon les valeurs par défaut du code seront utilisées) :
    *   `API_PIN`
    *   `BREVO_SMTP_USER`
    *   `BREVO_API_KEY`
    *   `FROM_EMAIL`
    *   `LOCAL_API_URL` (ex: `https://dev.codeonline-edi.net`)

Le code est maintenant beaucoup plus robuste, sécurisé et configurable sans redéploiement.
