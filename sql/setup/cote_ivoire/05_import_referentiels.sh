#!/bin/bash
# ==============================================================================
# 🇨🇮 ÉTAPE 5 — IMPORT DES RÉFÉRENTIELS GPC (Segments / Familles / Classes / Bricks)
# ==============================================================================
# Importe les 4 fichiers GPC depuis sql/backend/ vers la base CI.
# Ces référentiels sont identiques pour tous les pays (norme GS1 mondiale).
#
# Usage:
#   ./05_import_referentiels.sh <DB_HOST> <DB_PORT> <DB_USER> <DB_PASS> <DB_NAME>
#
# Exemple:
#   ./05_import_referentiels.sh 127.0.0.1 3306 consultant_ci 'MotDePasse!' Dev_Entitedb
# ==============================================================================

set -e

DB_HOST=${1:-127.0.0.1}
DB_PORT=${2:-3306}
DB_USER=${3:?DB_USER manquant}
DB_PASS=${4:?DB_PASS manquant}
DB_NAME=${5:?DB_NAME manquant}

# Localisation des fichiers source (depuis ce script: ../../backend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/../../backend"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

REFERENTIELS=(
  "segmentgpc.sql:Segments GPC"
  "famillegpc.sql:Familles GPC"
  "classegpc.sql:Classes GPC"
  "brickgpc.sql:Bricks GPC"
)

echo -e "${YELLOW}📦 Import des référentiels GPC dans ${DB_NAME}...${NC}"

for entry in "${REFERENTIELS[@]}"; do
    file="${entry%%:*}"
    label="${entry#*:}"
    full_path="$SRC_DIR/$file"

    if [ ! -f "$full_path" ]; then
        echo -e "${RED}❌ Fichier manquant: $full_path${NC}"
        exit 1
    fi

    echo -e "${YELLOW}  ↪ Import ${label} (${file})...${NC}"
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$full_path"
    echo -e "${GREEN}  ✅ ${label} importé${NC}"
done

echo -e "${GREEN}🎉 Tous les référentiels GPC ont été importés avec succès.${NC}"
