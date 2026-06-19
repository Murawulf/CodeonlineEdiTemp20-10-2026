#!/usr/bin/env bash
# ============================================================================
# 🚀 deploy_orchestrator.sh — Déploiement EDI Orchestrator (PAESN Registry)
# ----------------------------------------------------------------------------
# Déploiement incrémental : rsync du code → npm install → reload PM2 → health.
# Les secrets (.env) ne sont JAMAIS poussés : ils doivent préexister sur le
# serveur cible. Le script s'arrête si le .env distant est absent.
#
# Usage :
#   ./deploy/deploy_orchestrator.sh dev
#   ./deploy/deploy_orchestrator.sh prod
#   ./deploy/deploy_orchestrator.sh deploy/orchestrator.dev.conf   # chemin explicite
# ============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
err()  { echo -e "${RED}❌ $*${NC}" >&2; }
info() { echo -e "${BLUE}➜  $*${NC}"; }
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }

# --- Résolution des chemins ---------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../edi_orchestrator/deploy
ORCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                     # .../edi_orchestrator

# --- Argument : env ou chemin de conf ----------------------------------------
if [ $# -lt 1 ]; then
  err "Usage : $0 <dev|prod|chemin_conf>"
  exit 1
fi

ARG="$1"
case "$ARG" in
  dev)  CONF="$SCRIPT_DIR/orchestrator.dev.conf" ;;
  prod) CONF="$SCRIPT_DIR/orchestrator.prod.conf" ;;
  *)    CONF="$ARG" ;;
esac

if [ ! -f "$CONF" ]; then
  err "Fichier de config introuvable : $CONF"
  exit 1
fi

# shellcheck disable=SC1090
source "$CONF"

# --- Validation de la config --------------------------------------------------
for var in ENV_NAME REMOTE_HOST REMOTE_PORT REMOTE_USER REMOTE_DIR LOG_DIR PM2_APP_NAME PM2_PORT DB_NAME; do
  if [ -z "${!var:-}" ]; then err "Variable manquante dans $CONF : $var"; exit 1; fi
done

if [[ "$REMOTE_HOST" == *"A_RENSEIGNER"* ]]; then
  err "REMOTE_HOST non renseigné dans $CONF (déploiement $ENV_NAME). Renseigner l'IP du serveur."
  exit 1
fi

SSH="ssh -o ConnectTimeout=10 -p ${REMOTE_PORT} ${REMOTE_USER}@${REMOTE_HOST}"

echo ""
info "Déploiement Orchestrator [${ENV_NAME}]"
echo "    Serveur  : ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}"
echo "    Cible    : ${REMOTE_DIR}"
echo "    PM2      : ${PM2_APP_NAME}  (port ${PM2_PORT})"
echo "    DB       : ${DB_NAME}"
echo ""

# --- 1. Pré-flight : .env distant présent ? ----------------------------------
info "Vérification du .env distant…"
if ! $SSH "test -f '${REMOTE_DIR}/.env'"; then
  err "Le fichier ${REMOTE_DIR}/.env est ABSENT sur le serveur."
  err "Le déploiement ne pousse pas de secrets. Créer le .env d'abord :"
  err "  scp ${ORCH_DIR}/.env.example ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.env   puis renseigner les valeurs."
  exit 1
fi
ok ".env distant présent (secrets conservés)."

# --- 2. rsync du code (sans secrets ni node_modules) -------------------------
info "Synchronisation du code…"
rsync -az --delete \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='.env.bak*' \
  --exclude='*.bak.*' \
  --exclude='deploy/' \
  --exclude='logs/' \
  --exclude='.git/' \
  -e "ssh -p ${REMOTE_PORT}" \
  "${ORCH_DIR}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
ok "Code synchronisé."

# --- 3. npm install + reload PM2 + health (côté serveur) ---------------------
info "Installation des dépendances + reload PM2…"
$SSH bash -s <<REMOTE
set -e
cd "${REMOTE_DIR}"
mkdir -p "${LOG_DIR}"
npm install --production --no-audit --no-fund >/dev/null 2>&1 || npm install --production
ORCH_PM2_NAME="${PM2_APP_NAME}" ORCH_PORT="${PM2_PORT}" ORCH_LOG_DIR="${LOG_DIR}" \
  pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null 2>&1 || true
sleep 3
CODE=\$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PM2_PORT}${HEALTH_PATH:-/api/tracking/health}" || echo 000)
echo "HEALTH_LOCAL=\$CODE"
REMOTE

# --- 4. Health check externe (best-effort) -----------------------------------
if [ -n "${PUBLIC_URL:-}" ] && [[ "$PUBLIC_URL" != *"A_RENSEIGNER"* ]]; then
  info "Health externe : ${PUBLIC_URL}${HEALTH_PATH:-/api/tracking/health}"
  EXT=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "${PUBLIC_URL}${HEALTH_PATH:-/api/tracking/health}" || echo 000)
  if [ "$EXT" = "200" ]; then ok "Health externe : 200"; else warn "Health externe : ${EXT} (peut être firewall — vérifier le HEALTH_LOCAL ci-dessus)"; fi
fi

echo ""
ok "Déploiement Orchestrator [${ENV_NAME}] terminé."
