# Bundle SQL — Côte d'Ivoire

Tous les scripts d'initialisation BDD pour l'instance **Côte d'Ivoire**.

## Fichiers

| # | Fichier | Rôle | Privilèges requis |
|---|---------|------|-------------------|
| 1 | `01_create_db_and_user.sql.template` | Crée la BDD + l'utilisateur applicatif | **MySQL root** |
| 2 | *(dump partagé)* `../../backend/Dev_Entitedb.sql` | Structure de toutes les tables (~58) | **MySQL root** ou app user |
| 3 | `03_seed_pays_ci.sql` | Insère la ligne Côte d'Ivoire dans `pays` | App user |
| 4 | `04_seed_topology_ci.sql` | Configure `CURRENT_INSTANCE_CODE` + `NETWORK_TOPOLOGY` | App user |
| 5 | `05_import_referentiels.sh` | Importe les 4 fichiers GPC (Segments/Familles/Classes/Bricks) | App user |
| 6 | `06_seed_test_data_ci.sql` | **(optionnel)** 3 fournisseurs + 3 comptes admins de test | App user |
| ★ | `install_complete_ci.sh` | **Orchestrateur** qui exécute 1 → 6 dans l'ordre | App user + root MySQL |

## Utilisation rapide (tout-en-un)

```bash
cd /chemin/vers/Codeonline-InfoTn/sql/setup/cote_ivoire

./install_complete_ci.sh \
  127.0.0.1 \
  3306 \
  root \
  'MotDePasseRoot' \
  Dev_Entitedb \
  consultant_ci \
  'MotDePasseAppFort!' \
  https://dev.codeonline-edi.ci \
  --with-test-data
```

## Utilisation pas à pas (manuel)

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=Dev_Entitedb
DB_APP_USER=consultant_ci
DB_APP_PASS='MotDePasseAppFort!'
API_URL_CI='https://dev.codeonline-edi.ci'

# 1) Créer la BDD + utilisateur (en tant que root MySQL)
sed -e "s|__DB_NAME__|$DB_NAME|g" \
    -e "s|__DB_APP_USER__|$DB_APP_USER|g" \
    -e "s|__DB_APP_PASS__|$DB_APP_PASS|g" \
    01_create_db_and_user.sql.template > /tmp/01_ci.sql
mysql -u root -p < /tmp/01_ci.sql

# 2) Importer la structure (toutes les tables)
sed -e 's/DEFINER=[^*]*\*/\*/' ../../backend/Dev_Entitedb.sql | \
  mysql -u root -p $DB_NAME

# 3) Insérer le pays
mysql -u $DB_APP_USER -p"$DB_APP_PASS" $DB_NAME < 03_seed_pays_ci.sql

# 4) Identité + topologie
sed -e "s|__API_PUBLIC_URL_CI__|$API_URL_CI|g" \
    04_seed_topology_ci.sql > /tmp/04_ci.sql
mysql -u $DB_APP_USER -p"$DB_APP_PASS" $DB_NAME < /tmp/04_ci.sql

# 5) Référentiels GPC
./05_import_referentiels.sh $DB_HOST $DB_PORT $DB_APP_USER "$DB_APP_PASS" $DB_NAME

# 6) (optionnel) Données de test
mysql -u $DB_APP_USER -p"$DB_APP_PASS" $DB_NAME < 06_seed_test_data_ci.sql
```

## Idempotence

Tous les scripts SQL utilisent `INSERT … ON DUPLICATE KEY UPDATE` ou `IF NOT EXISTS`.
Vous pouvez les ré-exécuter sans risque (sauf l'import structure qui suppose des tables vides).

## Topologie résultante

Après l'étape 4, la table `app_parameters` contient :

```json
{
  "tunisia":     { "name": "Tunisie",        "apiUrl": "https://edi-dev.codeonline-info.com", … },
  "senegal":     { "name": "Sénégal",        "apiUrl": "https://dev.codeonline-edi.net",      … },
  "cote_ivoire": { "name": "Côte d'Ivoire",  "apiUrl": "https://dev.codeonline-edi.ci",       … }
}
```

Les trois instances peuvent alors se router des messages EDI entre elles automatiquement.
