#!/bin/bash

# ==============================================================================
# SCRIPT DE CONFIGURATION APACHE - PROXY NODE.JS
# À exécuter par un administrateur système (root / sudo)
# ==============================================================================

if [ "$EUID" -ne 0 ]; then
  echo "❌ Ce script doit être exécuté en tant que root (sudo)"
  exit 1
fi

echo "🚀 Configuration du Proxy Apache pour Codeonline EDI..."

# 1. Activation des modules requis
echo "📦 Activation des modules Apache..."
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel
a2enmod rewrite

# 2. Recherche du fichier de configuration du site
CONF_FILE=$(grep -l "ServerName dev.codeonline-edi.net" /etc/apache2/sites-available/*.conf | head -n 1)

if [ -z "$CONF_FILE" ]; then
    echo "⚠️  Impossible de trouver automatiquement le fichier de conf pour dev.codeonline-edi.net"
    echo "🔍 Recherche dans les fichiers par défaut..."
    CONF_FILE="/etc/apache2/sites-available/000-default.conf"
fi

echo "📝 Fichier cible identifié : $CONF_FILE"

# 3. Sauvegarde
cp "$CONF_FILE" "$CONF_FILE.bak.$(date +%F_%T)"
echo "💾 Sauvegarde effectuée vers $CONF_FILE.bak.$(date +%F_%T)"

# 4. Vérification si la config existe déjà
if grep -q "ProxyPass /api/" "$CONF_FILE"; then
    echo "✅ La configuration Proxy semble déjà présente."
else
    echo "🔧 Injection de la configuration Proxy..."
    
    # On utilise sed pour insérer les règles avant la fermeture </VirtualHost>
    # C'est une approche basique, l'admin peut vérifier le fichier .bak
    
    PROXY_CONFIG='
    # --- CONFIGURATION PROXY NODE.JS (Ajouté par script) ---
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)           ws://localhost:5001/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /(.*)           http://localhost:5001/$1 [P,L]

    ProxyPass /socket.io/ http://localhost:5001/socket.io/
    ProxyPassReverse /socket.io/ http://localhost:5001/socket.io/

    ProxyPass /api/ http://localhost:5001/api/
    ProxyPassReverse /api/ http://localhost:5001/api/
    # -------------------------------------------------------
    '
    
    # Insertion avant la fin du VirtualHost
    sed -i "/<\/VirtualHost>/i \\
$PROXY_CONFIG" "$CONF_FILE"
    
    echo "✅ Configuration injectée."
fi

# 5. Vérification de la syntaxe et redémarrage
echo "🔍 Vérification de la configuration Apache..."
apache2ctl configtest

if [ $? -eq 0 ]; then
    echo "🔄 Redémarrage d'Apache..."
    systemctl restart apache2
    echo "🎉 Terminé ! Le proxy est actif."
else
    echo "❌ Erreur de configuration détectée. Restauration..."
    cp "$CONF_FILE.bak.*" "$CONF_FILE"
    echo "🔙 Fichier restauré. Veuillez vérifier les logs."
fi
