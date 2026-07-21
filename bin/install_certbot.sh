#!/usr/bin/env bash
# ============================================================================
# install_certbot.sh — Apache + Let's Encrypt (certbot) + reverse-proxy
# ----------------------------------------------------------------------------
# Installe Apache + certbot, crée un vhost reverse-proxy vers l'app Node locale
# (avec WebSocket + exclusion du challenge ACME), émet le certificat TLS et
# active le renouvellement auto + la redirection http->https.
#
# À exécuter EN ROOT sur le serveur :  sudo bash install_certbot.sh
# (le serveur doit avoir une IPv4/IPv6 publique et le domaine doit résoudre
#  vers ce serveur — A et/ou AAAA — avant de lancer.)
# ============================================================================
set -euo pipefail

# ============================ CONFIG (à régler) =============================
EMAIL="majd.hakim@gmail.com"                 # email compte Let's Encrypt (notifs expiration)

# Domaines à sécuriser + backend local de chacun.
# Format : "domaine=port_backend"  (port de l'app Node à proxifier)
#          "domaine=static"        (site statique servi depuis /var/www/<domaine>)
# Ajoute autant de lignes que nécessaire.
DOMAINS=(
  "fp.codeonline-info.com=static"          # exemple : app produits (CodeIgniter) en statique docroot
  "edi.codeonline-info.com=5000"           # exemple : app EDI Node sur le port 5000
  # "registry-tn.codeonline-info.com=5010" # exemple : hub, etc.
)
# ===========================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
err(){ echo -e "${RED}❌ $*${NC}" >&2; }
ok(){ echo -e "${GREEN}✅ $*${NC}"; }
info(){ echo -e "${BLUE}➜  $*${NC}"; }
warn(){ echo -e "${YELLOW}⚠️  $*${NC}"; }

[ "$(id -u)" -eq 0 ] || { err "Lance en root (sudo)."; exit 1; }

# --- 1. Paquets -------------------------------------------------------------
info "Installation Apache + certbot…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y apache2 certbot python3-certbot-apache curl >/dev/null
a2enmod proxy proxy_http proxy_wstunnel ssl rewrite headers >/dev/null 2>&1 || true
ok "Apache $(apache2 -v | awk '/version/{print $3}') + certbot $(certbot --version 2>&1 | awk '{print $2}')"

# --- 2. Pare-feu (ouvrir 80/443 si ufw actif) -------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ok "ufw : 80/443 ouverts"
fi

# --- 3. Vhosts (port 80) ----------------------------------------------------
CERT_DOMAINS=()
for entry in "${DOMAINS[@]}"; do
  DOMAIN="${entry%%=*}"
  TARGET="${entry##*=}"
  CONF="/etc/apache2/sites-available/${DOMAIN}.conf"
  CERT_DOMAINS+=(-d "$DOMAIN")

  if [ "$TARGET" = "static" ]; then
    ROOT="/var/www/${DOMAIN}"
    mkdir -p "$ROOT"
    info "vhost STATIQUE $DOMAIN -> $ROOT"
    cat > "$CONF" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot ${ROOT}
    <Directory "${ROOT}">
        Options -Indexes
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}_error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}_access.log combined
</VirtualHost>
EOF
  else
    PORT="$TARGET"
    info "vhost PROXY $DOMAIN -> http://localhost:${PORT}"
    cat > "$CONF" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    ProxyPreserveHost On

    # Challenge Let's Encrypt : NON proxifié (servi en statique)
    ProxyPass /.well-known/acme-challenge/ !
    DocumentRoot /var/www/html

    # WebSocket (socket.io)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://localhost:${PORT}/\$1 [P,L]

    ProxyPass /.well-known/acme-challenge/ !
    ProxyPass / http://localhost:${PORT}/
    ProxyPassReverse / http://localhost:${PORT}/

    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}_error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}_access.log combined
</VirtualHost>
EOF
  fi
  a2ensite "${DOMAIN}.conf" >/dev/null 2>&1
done

a2dissite 000-default >/dev/null 2>&1 || true
apache2ctl configtest
systemctl reload apache2
ok "vhosts activés + Apache rechargé"

# --- 4. Certificats ---------------------------------------------------------
info "Émission des certificats (certbot --apache)…"
certbot --apache "${CERT_DOMAINS[@]}" \
  --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring
ok "Certificats émis + redirection http->https activée"

# --- 5. Renouvellement auto + vérif ----------------------------------------
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
info "Test de renouvellement (dry-run)…"
certbot renew --dry-run 2>&1 | tail -3 || warn "dry-run à vérifier"

echo ""
ok "Terminé."
certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" | sed 's/^/   /'
echo ""
info "Renouvellement auto : $(systemctl is-active certbot.timer 2>/dev/null) (certbot.timer)"
