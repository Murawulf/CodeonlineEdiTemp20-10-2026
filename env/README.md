# Dossier `env/` — Configuration multi-pays

Ce dossier contient **un fichier `.env.<instance_code>` par pays/instance**.
Il est la **source de vérité unique** pour la configuration runtime de chaque serveur.

## Architecture

```
env/
├── README.md              ← ce fichier
├── .env.example           ← template public (versionné)
├── .env.tunisia           ← prod TN  (gitignored)
├── .env.senegal           ← prod SN  (gitignored)
├── .env.cote_ivoire       ← prod CI  (gitignored)
└── .env.libya             ← prod LY  (gitignored, future)
```

Le suffixe **doit** correspondre exactement à `CURRENT_INSTANCE_CODE` à
l'intérieur du fichier (et au champ `CURRENT_INSTANCE_CODE` du `deploy_configs/<pays>.conf`).

## Cas d'usage

### 1. Déploiement vers un serveur

```bash
# Le script charge automatiquement env/.env.<instance_code>
./deploy_universal.sh deploy_configs/tunisie.conf
./deploy_universal.sh deploy_configs/senegal.conf
./deploy_universal.sh deploy_configs/cote_ivoire.conf
```

Le déploiement :
1. Lit `CURRENT_INSTANCE_CODE` dans le `.conf`
2. Récupère `env/.env.<instance_code>`
3. Backup le `.env` distant existant (`/var/www/Edi-dev/backend/.env.bak_<TS>`)
4. Pousse le nouveau `.env`
5. Restart PM2

### 2. Développement local pointant sur une DB distante

```bash
# Copie env/.env.tunisia vers backend/.env (avec backup auto)
./bin/use-env.sh tunisia

# Démarrer le backend qui se connectera à la DB Tunisie distante
cd backend && npm start
```

### 3. Ajouter un nouveau pays

```bash
# 1. Copier le template
cp env/.env.example env/.env.libya

# 2. Renseigner CURRENT_INSTANCE_CODE=libya, DB_*, URLs publiques, etc.

# 3. Créer la config de déploiement
cp deploy_configs/template.conf deploy_configs/libya.conf

# 4. Renseigner REMOTE_HOST, PM2_APP_NAME, PM2_PORT, etc.

# 5. Première installation
./setup_new_server.sh setup_configs/libya.conf

# 6. Déploiements suivants
./deploy_universal.sh deploy_configs/libya.conf
```

## Variables disponibles

Voir [`.env.example`](.env.example) pour la liste complète et commentée.

| Catégorie | Variables clés |
|-----------|----------------|
| **Identité** | `CURRENT_INSTANCE_CODE`, `PORT`, `NODE_ENV` |
| **Base de données** | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| **URLs** | `LOCAL_API_URL`, `FRONTEND_URL`, `VITE_API_BASE_URL` |
| **Email (Brevo)** | `BREVO_API_KEY` (auto-détecté `xkeysib-` REST vs `xsmtpsib-` SMTP), `BREVO_SMTP_USER`, `FROM_EMAIL` |
| **Sécurité** | `API_PIN`, `JWT_SECRET`, `JWT_EXPIRES_IN` |
| **Topologie** | `MOCK_REMOTE_NODES`, `TN_API_URL`, `SN_API_URL`, `CI_API_URL` (overrides optionnels) |

## Sécurité

- ✅ `env/.env.example` est **versionné** (template sans secrets)
- ❌ `env/.env.<pays>` est **gitignored** (contient mots de passe, JWT, clés Brevo)
- ⚠️ Pour rotation des secrets : éditer le fichier local puis redéployer.

Pour confirmer qu'un fichier ne sera pas commité :

```bash
git check-ignore -v env/.env.tunisia
# Doit afficher : .gitignore:N:env/.env.* env/.env.tunisia
```

## Sauvegarde des secrets

Les fichiers `env/.env.<pays>` ne sont pas dans git. Vous **devez** les
sauvegarder ailleurs (gestionnaire de mots de passe, vault, etc.) :

| Pays | Stockage recommandé |
|------|---------------------|
| Tunisie | 1Password vault « Codeonline-EDI » |
| Sénégal | 1Password vault « Codeonline-EDI » |
| Côte d'Ivoire | À définir lors du provisionnement |
| Libye | À définir lors du provisionnement |

Si un fichier est perdu, le reconstruire depuis `.env.example` + récupération
des secrets dans le vault.
