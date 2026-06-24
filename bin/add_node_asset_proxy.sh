#!/usr/bin/env bash
# ============================================================================
# add_node_asset_proxy.sh
# ----------------------------------------------------------------------------
# Ajoute (de façon idempotente) le proxy Apache des chemins d'assets servis par
# Node (/images/logo_entite, /images/products, /images/uploads,
# /images/caracteristiques, /ged, /Modeles) DANS LE VHOST — pour que ça survive
# aux redéploiements frontend (qui écrasent le .htaccess).
#
# Backup -> insertion -> apachectl configtest -> reload. Rollback si configtest KO.
#
# À exécuter EN ROOT sur le serveur :
#   sudo ./add_node_asset_proxy.sh <vhost.conf> <port_backend> [url_test]
#
# Exemple CIV PROD :
#   sudo ./add_node_asset_proxy.sh \
#     /etc/apache2/sites-available/civ.codeonline-edi.net-ssl.conf 5000 \
#     https://civ.codeonline-edi.net/images/logo_entite/company_1782293379191_LOGO-CI-EXPORT.jpg
#
# (DEV : port 5001 ; TUN/SEN PROD : leur vhost + port respectifs.)
# ============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
err(){ echo -e "${RED}❌ $*${NC}" >&2; }
ok(){ echo -e "${GREEN}✅ $*${NC}"; }
info(){ echo -e "${BLUE}➜  $*${NC}"; }
warn(){ echo -e "${YELLOW}⚠️  $*${NC}"; }

MARKER_BEGIN="# >>> node-asset-proxy (managed by add_node_asset_proxy.sh) >>>"
MARKER_END="# <<< node-asset-proxy <<<"
ASSET_PATHS=(/images/logo_entite /images/products /images/uploads /images/caracteristiques /ged /Modeles)

# --- Args ---------------------------------------------------------------------
if [ $# -lt 2 ]; then
  err "Usage : sudo $0 <vhost.conf> <port_backend> [url_test]"
  exit 1
fi
VHOST="$1"; PORT="$2"; TEST_URL="${3:-}"

# --- Sanity -------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then err "À lancer en root (sudo)."; exit 1; fi
if [ ! -f "$VHOST" ]; then err "Vhost introuvable : $VHOST"; exit 1; fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then err "Port invalide : $PORT"; exit 1; fi

APACHECTL="$(command -v apachectl || command -v apache2ctl || true)"
if [ -z "$APACHECTL" ]; then err "apachectl/apache2ctl introuvable."; exit 1; fi

# mod_proxy chargé ? (best-effort)
if command -v a2query >/dev/null 2>&1; then
  a2query -m proxy_http >/dev/null 2>&1 || warn "mod_proxy_http peut-être non activé (a2enmod proxy proxy_http)."
fi

# --- Idempotence --------------------------------------------------------------
if grep -qF "$MARKER_BEGIN" "$VHOST"; then
  warn "Bloc déjà présent dans $VHOST → rien à insérer (idempotent)."
  info "Pour ré-appliquer : retirer le bloc entre les marqueurs puis relancer."
  exit 0
fi
if grep -qiE "ProxyPass\s+/images/logo_entite" "$VHOST"; then
  warn "Un ProxyPass /images/logo_entite existe déjà (hors marqueur) → on n'insère pas pour éviter un doublon."
  exit 0
fi

# --- Backup -------------------------------------------------------------------
TS="$(date +%Y%m%d_%H%M%S)"
BAK="${VHOST}.bak_${TS}"
cp -p "$VHOST" "$BAK"
ok "Backup : $BAK"

# --- Construction du bloc -----------------------------------------------------
BLOCK="$(
  printf '    %s\n' "$MARKER_BEGIN"
  for p in "${ASSET_PATHS[@]}"; do
    printf '    ProxyPass %s http://127.0.0.1:%s%s\n'        "$p" "$PORT" "$p"
    printf '    ProxyPassReverse %s http://127.0.0.1:%s%s\n' "$p" "$PORT" "$p"
  done
  printf '    %s\n' "$MARKER_END"
)"

# --- Insertion avant le DERNIER </VirtualHost> --------------------------------
TMP="$(mktemp)"
awk -v block="$BLOCK" '
  { lines[NR]=$0; if ($0 ~ /<\/VirtualHost>/) last=NR }
  END {
    if (!last) { print "NO_VHOST_CLOSE" > "/dev/stderr"; exit 3 }
    for (i=1;i<=NR;i++){ if (i==last) print block; print lines[i] }
  }
' "$VHOST" > "$TMP" || { err "Échec insertion (pas de </VirtualHost> ?)."; rm -f "$TMP"; exit 1; }

cat "$TMP" > "$VHOST"
rm -f "$TMP"
ok "Bloc proxy inséré (port $PORT) dans $VHOST"

# --- configtest + reload (rollback si KO) -------------------------------------
info "apachectl configtest…"
if ! "$APACHECTL" configtest; then
  err "configtest KO → restauration du backup."
  cp -p "$BAK" "$VHOST"
  err "Restauré. Aucun reload effectué."
  exit 1
fi
ok "configtest OK"

info "Reload Apache…"
if command -v systemctl >/dev/null 2>&1; then systemctl reload apache2; else "$APACHECTL" graceful; fi
ok "Apache rechargé."

# --- Test (optionnel) ---------------------------------------------------------
if [ -n "$TEST_URL" ]; then
  info "Test : $TEST_URL"
  CT="$(curl -sk -o /dev/null -w '%{http_code} %{content_type}' "$TEST_URL" || true)"
  echo "   → $CT"
  case "$CT" in
    2*\ image/*) ok "Image servie correctement." ;;
    *text/html*) warn "Renvoie du HTML (fallback SPA) — vérifier le fichier côté Node / le port." ;;
    *)           warn "Réponse inattendue : $CT" ;;
  esac
fi

echo ""
ok "Terminé. (Rollback manuel si besoin : cp -p '$BAK' '$VHOST' && $APACHECTL configtest && systemctl reload apache2)"
