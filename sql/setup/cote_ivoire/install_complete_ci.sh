#!/bin/bash
# ==============================================================================
# 🇨🇮 INSTALLATION COMPLÈTE BASE DE DONNÉES — CÔTE D'IVOIRE
# ==============================================================================
# Script orchestrateur qui exécute, dans l'ordre, toutes les étapes SQL :
#   1. Création BDD + utilisateur applicatif
#   2. Import du dump structurel partagé (Dev_Entitedb.sql)
#   3. Insertion du pays Côte d'Ivoire dans `pays`
#   4. Configuration de l'identité + topologie
#   5. Import des référentiels GPC
#   6. (Optionnel) Données de test CI
#
# Usage:
#   ./install_complete_ci.sh <DB_HOST> <DB_PORT> <DB_ROOT_USER> <DB_ROOT_PASS> \
#                            <DB_NAME> <DB_APP_USER> <DB_APP_PASS> <API_PUBLIC_URL_CI> \
#                            [--with-test-data]
#
# Exemple:
#   ./install_complete_ci.sh 127.0.0.1 3306 root 'rootPwd' Dev_Entitedb \
#                            consultant_ci 'AppPwd!' https://dev.codeonline-edi.ci \
#                            --with-test-data
# ==============================================================================

set -e

if [ $# -lt 8 ]; then
    echo "❌ Usage: $0 <DB_HOST> <DB_PORT> <DB_ROOT_USER> <DB_ROOT_PASS> <DB_NAME> <DB_APP_USER> <DB_APP_PASS> <API_PUBLIC_URL_CI> [--with-test-data]"
    exit 1
fi

DB_HOST=$1
DB_PORT=$2
DB_ROOT_USER=$3
DB_ROOT_PASS=$4
DB_NAME=$5
DB_APP_USER=$6
DB_APP_PASS=$7
API_PUBLIC_URL_CI=$8
WITH_TEST_DATA=${9:-""}

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

mysql_root() {
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_ROOT_USER" -p"$DB_ROOT_PASS" "$@"
}
mysql_app() {
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_APP_USER" -p"$DB_APP_PASS" "$DB_NAME" "$@"
}

echo -e "${YELLOW}🚀 Installation BDD Côte d'Ivoire — démarrage${NC}"
echo -e "  Host:  $DB_HOST:$DB_PORT"
echo -e "  DB:    $DB_NAME"
echo -e "  User:  $DB_APP_USER"
echo -e "  URL:   $API_PUBLIC_URL_CI"
echo "------------------------------------------------------"

# --- Étape 1: Création BDD + utilisateur ---
echo -e "${YELLOW}[1/6] Création BDD + utilisateur applicatif...${NC}"
sed -e "s|__DB_NAME__|$DB_NAME|g" \
    -e "s|__DB_APP_USER__|$DB_APP_USER|g" \
    -e "s|__DB_APP_PASS__|$DB_APP_PASS|g" \
    "$SCRIPT_DIR/01_create_db_and_user.sql.template" > "$TMP_DIR/01.sql"
mysql_root < "$TMP_DIR/01.sql"
echo -e "${GREEN}  ✅ BDD + utilisateur OK${NC}"

# --- Étape 2: Import structure (dump partagé) ---
DUMP_FILE="$ROOT_DIR/sql/backend/Dev_Entitedb.sql"
if [ ! -f "$DUMP_FILE" ]; then
    echo -e "${RED}❌ Dump structurel introuvable : $DUMP_FILE${NC}"
    exit 1
fi
echo -e "${YELLOW}[2/6] Import du dump structurel ($(du -h "$DUMP_FILE" | cut -f1))...${NC}"
# Nettoyage des DEFINER pour éviter les erreurs de droits
sed -e 's/DEFINER=[^*]*\*/\*/' -e 's/DEFINER=[^ ]* / /' "$DUMP_FILE" > "$TMP_DIR/structure_clean.sql"
mysql_root "$DB_NAME" < "$TMP_DIR/structure_clean.sql"
echo -e "${GREEN}  ✅ Structure importée (~58 tables)${NC}"

# --- Étape 3: Insertion pays Côte d'Ivoire ---
echo -e "${YELLOW}[3/6] Insertion du pays Côte d'Ivoire...${NC}"
mysql_app < "$SCRIPT_DIR/03_seed_pays_ci.sql"
echo -e "${GREEN}  ✅ Pays Côte d'Ivoire OK${NC}"

# --- Étape 4: Identité + Topologie ---
echo -e "${YELLOW}[4/6] Configuration identité + topologie réseau...${NC}"
sed -e "s|__API_PUBLIC_URL_CI__|$API_PUBLIC_URL_CI|g" \
    "$SCRIPT_DIR/04_seed_topology_ci.sql" > "$TMP_DIR/04.sql"
mysql_app < "$TMP_DIR/04.sql"
echo -e "${GREEN}  ✅ Topologie configurée${NC}"

# --- Étape 5: Référentiels GPC ---
echo -e "${YELLOW}[5/6] Import des référentiels GPC (Segments / Familles / Classes / Bricks)...${NC}"
"$SCRIPT_DIR/05_import_referentiels.sh" "$DB_HOST" "$DB_PORT" "$DB_APP_USER" "$DB_APP_PASS" "$DB_NAME"
echo -e "${GREEN}  ✅ Référentiels GPC OK${NC}"

# --- Étape 6: Données de test (optionnelle) ---
if [ "$WITH_TEST_DATA" == "--with-test-data" ]; then
    echo -e "${YELLOW}[6/6] Insertion des données de test CI...${NC}"
    mysql_app < "$SCRIPT_DIR/06_seed_test_data_ci.sql"
    echo -e "${GREEN}  ✅ Données de test insérées${NC}"
else
    echo -e "${YELLOW}[6/6] Données de test ignorées (passer --with-test-data pour les inclure)${NC}"
fi

echo "------------------------------------------------------"
echo -e "${GREEN}🎉 INSTALLATION BDD CÔTE D'IVOIRE TERMINÉE${NC}"
echo -e "  → BDD prête sur $DB_HOST:$DB_PORT/$DB_NAME"
echo -e "  → User applicatif : $DB_APP_USER"
echo -e "  → Étape suivante : déployer le code via setup_new_server.sh"
