#!/bin/bash
# ==============================================================================
# 🔄 use-env.sh — Switcher d'environnement local
# ==============================================================================
# Copie env/.env.<instance> vers backend/.env (avec backup automatique).
# Permet de basculer rapidement le backend local entre les DB distantes
# de Tunisie / Sénégal / Côte d'Ivoire / Libye.
#
# Usage :
#   ./bin/use-env.sh tunisia
#   ./bin/use-env.sh senegal
#   ./bin/use-env.sh cote_ivoire
#   ./bin/use-env.sh libya
#   ./bin/use-env.sh --list           # liste les env disponibles
#   ./bin/use-env.sh --current        # affiche l'instance actuellement active
# ==============================================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

# Se placer dans la racine du projet (parent de bin/)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ $# -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    cat <<EOF
Usage: $0 <instance_code>
       $0 --list
       $0 --current

Instance codes disponibles :
$(ls env/.env.* 2>/dev/null | grep -v '\.example$' | sed -E 's|env/\.env\.|  - |')
EOF
    exit 0
fi

# --- Listing ---
if [ "$1" == "--list" ]; then
    echo -e "${YELLOW}Environnements disponibles dans env/ :${NC}"
    for f in env/.env.*; do
        [ -f "$f" ] || continue
        name=$(basename "$f" | sed 's/^.env.//')
        if [ "$name" == "example" ]; then
            echo "  📋 $name (template public)"
        else
            instance=$(grep -E "^CURRENT_INSTANCE_CODE=" "$f" | cut -d= -f2)
            url=$(grep -E "^LOCAL_API_URL=" "$f" | cut -d= -f2)
            echo "  🌍 $name  →  CURRENT_INSTANCE_CODE=$instance  ($url)"
        fi
    done
    exit 0
fi

# --- Current ---
if [ "$1" == "--current" ]; then
    if [ -f backend/.env ]; then
        instance=$(grep -E "^CURRENT_INSTANCE_CODE=" backend/.env | cut -d= -f2)
        echo -e "${GREEN}backend/.env actif : CURRENT_INSTANCE_CODE=$instance${NC}"
    else
        echo -e "${RED}backend/.env n'existe pas.${NC}"
        exit 1
    fi
    exit 0
fi

# --- Switch ---
INSTANCE=$1
SOURCE="env/.env.$INSTANCE"
TARGET="backend/.env"

if [ ! -f "$SOURCE" ]; then
    echo -e "${RED}❌ Fichier introuvable : $SOURCE${NC}"
    echo -e "${YELLOW}   Environnements disponibles :${NC}"
    ls env/.env.* 2>/dev/null | grep -v '\.example$' | sed 's/^/     /'
    exit 1
fi

# Backup .env existant
if [ -f "$TARGET" ]; then
    TS=$(date +%Y%m%d_%H%M%S)
    BAK="${TARGET}.bak_${TS}"
    cp "$TARGET" "$BAK"
    echo -e "${YELLOW}📦 Backup .env actuel : $BAK${NC}"
fi

# Copy
cp "$SOURCE" "$TARGET"
echo -e "${GREEN}✅ backend/.env remplacé par $SOURCE${NC}"

# Affichage des info clés (sans password)
INSTANCE_CODE=$(grep -E "^CURRENT_INSTANCE_CODE=" "$TARGET" | cut -d= -f2)
DB_HOST=$(grep -E "^DB_HOST=" "$TARGET" | cut -d= -f2)
DB_USER=$(grep -E "^DB_USER=" "$TARGET" | cut -d= -f2)
DB_NAME=$(grep -E "^DB_NAME=" "$TARGET" | cut -d= -f2)
LOCAL_URL=$(grep -E "^LOCAL_API_URL=" "$TARGET" | cut -d= -f2)
echo ""
echo -e "${GREEN}Configuration active :${NC}"
echo "  CURRENT_INSTANCE_CODE = $INSTANCE_CODE"
echo "  DB                    = $DB_USER@$DB_HOST/$DB_NAME"
echo "  LOCAL_API_URL         = $LOCAL_URL"
echo ""
echo -e "${YELLOW}💡 Pour démarrer le backend : cd backend && npm start${NC}"
