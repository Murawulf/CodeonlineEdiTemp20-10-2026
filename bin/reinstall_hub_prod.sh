#!/usr/bin/env bash
# ============================================================================
# reinstall_hub_prod.sh — Réinstall/migration COMPLETE du Hub PROD (PAESN Registry)
#   vers un NOUVEAU serveur (celui qui aura enfin une IPv4).
# ----------------------------------------------------------------------------
# Reproduit à l'identique l'actuel hub-prod (IPv6-only) sur une nouvelle box :
#   - Node 20 (nodesource) + PM2 + orchestrateur (code + .env + node_modules via npm ci)
#   - MariaDB + base codeonline_edi_db_prod + user coprod + DONNÉES (mysqldump)
#   - Apache reverse-proxy (registry.conf) → :5010
#   - certbot Let's Encrypt (marche cette fois : le nouveau serveur a une IPv4)
#   - pm2 startup + save (resurrection au boot)
#
# Principe : STAGE depuis l'ancien (hub-prod) -> Mac -> PUSH vers le nouveau.
# Aucun secret n'est écrit en dur ici : les creds DB sont lus depuis le .env
# transféré (qui contient JWT_SECRET, API keys, etc. — à réutiliser tel quel).
#
# LANCER DEPUIS LE MAC :  bash reinstall_hub_prod.sh
# ============================================================================
set -euo pipefail

# ============================ CONFIG (à régler) =============================
OLD="hub-prod"                                   # alias SSH actuel (IPv6 via ProxyJump civ) — NE PAS toucher
NEW="root@NOUVELLE_IPV4_ICI"                      # <-- nouveau serveur (root@IP). Mets d'abord ta clé : ssh-copy-id $NEW
DOMAIN="registry.codeonline-edi.net"
EMAIL="majd.hakim@gmail.com"
REMOTE_PARENT="/var/www/Edi-prod"                # dossier parent de l'app (identique à l'ancien)
APP="edi_orchestrator"
DB_NAME="codeonline_edi_db_prod"
PM2_NAME="codeonline-edi-orchestrator-prod"
PORT="5010"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"                 # =1 si l'IPv4 n'est pas encore active / DNS pas prêt
STAGE="/tmp/hubprod_migrate"                      # dossier de staging sur le Mac
# ===========================================================================

G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; R='\033[0;31m'; N='\033[0m'
info(){ echo -e "${B}➜  $*${N}"; }
ok(){ echo -e "${G}✅ $*${N}"; }
warn(){ echo -e "${Y}⚠️  $*${N}"; }
die(){ echo -e "${R}❌ $*${N}" >&2; exit 1; }

[ "$NEW" = "root@NOUVELLE_IPV4_ICI" ] && die "Édite NEW= avec l'IP du nouveau serveur (et fais ssh-copy-id d'abord)."

# --- 0. Préflight -----------------------------------------------------------
info "Vérif accès ancien serveur ($OLD)…"
ssh -o ConnectTimeout=15 "$OLD" 'echo ok' >/dev/null || die "Ancien serveur $OLD injoignable."
info "Vérif accès nouveau serveur ($NEW)…"
ssh -o ConnectTimeout=15 "$NEW" 'echo ok' >/dev/null || die "Nouveau serveur $NEW injoignable (clé SSH posée ?)."
mkdir -p "$STAGE"

# --- 1. STAGE : récupérer code + dump DB depuis l'ancien --------------------
info "Export du code app depuis $OLD (hors node_modules/logs)…"
ssh "$OLD" "tar czf - -C '$REMOTE_PARENT' --exclude='$APP/node_modules' --exclude='$APP/logs' '$APP'" > "$STAGE/app.tgz"
ok "app.tgz $(du -h "$STAGE/app.tgz" | cut -f1)"

info "Dump base $DB_NAME depuis $OLD (structure + données)…"
ssh "$OLD" "mysqldump -uroot --databases '$DB_NAME' --single-transaction --routines --events 2>/dev/null" > "$STAGE/db.sql"
[ -s "$STAGE/db.sql" ] || die "Dump DB vide — vérifier accès mysql root sur l'ancien."
ok "db.sql $(du -h "$STAGE/db.sql" | cut -f1)"

# --- 2. PUSH : envoyer vers le nouveau --------------------------------------
info "Transfert vers $NEW…"
ssh "$NEW" "mkdir -p /root/_migrate '$REMOTE_PARENT'"
scp -q "$STAGE/app.tgz" "$STAGE/db.sql" "$NEW:/root/_migrate/"
ok "fichiers copiés sur le nouveau serveur"

# --- 3. PROVISION : tout installer sur le nouveau ---------------------------
info "Provisioning du nouveau serveur…"
ssh "$NEW" "REMOTE_PARENT='$REMOTE_PARENT' APP='$APP' DB_NAME='$DB_NAME' PM2_NAME='$PM2_NAME' PORT='$PORT' DOMAIN='$DOMAIN' EMAIL='$EMAIL' SKIP_CERTBOT='$SKIP_CERTBOT' bash -s" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP_DIR="$REMOTE_PARENT/$APP"

echo "== paquets de base =="
apt-get update -y >/dev/null
apt-get install -y curl ca-certificates gnupg apache2 mariadb-server >/dev/null

echo "== Node 20 (nodesource) =="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null
fi
echo "node $(node -v) / npm $(npm -v)"

echo "== PM2 =="
command -v pm2 >/dev/null 2>&1 || npm i -g pm2 >/dev/null 2>&1
echo "pm2 $(pm2 -v)"

echo "== déploiement code app =="
mkdir -p "$REMOTE_PARENT"
tar xzf /root/_migrate/app.tgz -C "$REMOTE_PARENT"
[ -f "$APP_DIR/.env" ] || { echo "!! .env manquant après extraction"; exit 1; }
chmod 600 "$APP_DIR/.env"

echo "== creds DB (lus depuis le .env transféré, pas de secret en dur) =="
DB_USER="$(grep -E '^DB_USER='     "$APP_DIR/.env" | cut -d= -f2-)"
DB_PASS="$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2-)"
DB_NAME_ENV="$(grep -E '^DB_NAME=' "$APP_DIR/.env" | cut -d= -f2-)"
DB_NAME="${DB_NAME_ENV:-$DB_NAME}"

echo "== import base $DB_NAME =="
systemctl enable --now mariadb >/dev/null 2>&1 || true
mysql -uroot < /root/_migrate/db.sql
mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "tables importées :"; mysql -uroot -N -e "SHOW TABLES FROM \`$DB_NAME\`;"

echo "== dépendances node (npm ci, prod) =="
cd "$APP_DIR"
if [ -f package-lock.json ]; then npm ci --omit=dev >/dev/null 2>&1 || npm ci >/dev/null 2>&1; else npm install --omit=dev >/dev/null 2>&1; fi

echo "== démarrage PM2 (prod) =="
mkdir -p "$APP_DIR/logs"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
ORCH_PM2_NAME="$PM2_NAME" ORCH_PORT="$PORT" ORCH_LOG_DIR="$APP_DIR/logs" \
  pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 | tail -1 || true
systemctl enable pm2-root >/dev/null 2>&1 || true
sleep 2
curl -s -o /dev/null -w "orchestrateur localhost:$PORT -> HTTP %{http_code}\n" "http://localhost:$PORT/" || true

echo "== Apache reverse-proxy =="
a2enmod proxy proxy_http proxy_wstunnel ssl rewrite headers >/dev/null 2>&1 || true
cat > /etc/apache2/sites-available/registry.conf <<VH
<VirtualHost *:80>
    ServerName $DOMAIN
    ProxyPreserveHost On
    ProxyPass /.well-known/acme-challenge/ !
    ProxyPass / http://localhost:$PORT/
    ProxyPassReverse / http://localhost:$PORT/
    DocumentRoot /var/www/html
    ErrorLog \${APACHE_LOG_DIR}/registry_error.log
    CustomLog \${APACHE_LOG_DIR}/registry_access.log combined
</VirtualHost>
VH
a2ensite registry.conf >/dev/null 2>&1
a2dissite 000-default >/dev/null 2>&1 || true
apache2ctl configtest && systemctl reload apache2 && systemctl enable apache2 >/dev/null 2>&1

echo "== pare-feu (si ufw actif) =="
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null 2>&1 || true; ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true
fi

echo "== certbot =="
if [ "$SKIP_CERTBOT" = "1" ]; then
  echo ">> SKIP_CERTBOT=1 : cert non émis (fais-le quand le DNS A pointe vers ce serveur)."
else
  apt-get install -y certbot python3-certbot-apache >/dev/null
  certbot --apache -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring || \
    echo ">> certbot a échoué (DNS A pas encore sur cette IP ?). Relance plus tard : certbot --apache -d $DOMAIN --redirect"
fi

echo "== FIN PROVISION =="
REMOTE

# --- 4. Vérif finale depuis le Mac ------------------------------------------
info "Vérif finale…"
ssh "$NEW" 'echo "pm2:"; pm2 list 2>/dev/null | grep -E "orchestr|online"; echo "apache: $(systemctl is-active apache2)"; echo "mariadb: $(systemctl is-active mariadb)"'
ok "Migration terminée. Prochaine étape : pointer le DNS ($DOMAIN A -> nouvelle IPv4) puis, si SKIP_CERTBOT était à 1, lancer certbot sur le serveur."
warn "Ne décommissionne l'ancien serveur qu'après validation complète du nouveau."
