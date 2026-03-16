#!/bin/bash

# ==============================================================================
# 🌍 SCRIPT DE DÉPLOIEMENT : HUB ORCHESTRATOR
# Usage: ./deploy_hub.sh deploy_configs/hub.conf
# ==============================================================================

# 1. Chargement de la configuration
CONFIG_FILE=$1

if [ -z "$CONFIG_FILE" ]; then
    echo "❌ Erreur : Veuillez spécifier un fichier de configuration."
    echo "Usage : ./deploy_hub.sh deploy_configs/hub.conf"
    exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Erreur : Fichier de configuration introuvable ($CONFIG_FILE)"
    exit 1
fi

# Chargement des variables
source "$CONFIG_FILE"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Démarrage du déploiement pour : $COUNTRY_NAME${NC}"
echo -e "${YELLOW}📄 Configuration : $CONFIG_FILE${NC}"
echo -e "${YELLOW}🎯 Cible : $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/edi_orchestrator${NC}"

# 2. Vérification des variables obligatoires
REQUIRED_VARS=("REMOTE_USER" "REMOTE_HOST" "REMOTE_PORT" "REMOTE_ROOT" "PM2_APP_NAME" "PM2_PORT" "DB_NAME")
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo -e "${RED}⛔️ Erreur : La variable $VAR n'est pas définie dans le fichier de config.${NC}"
        exit 1
    fi
done

# 3. Génération dynamique de ecosystem.config.cjs pour le Hub
echo -e "${YELLOW}⚙️  Génération de la configuration PM2...${NC}"
cat > ecosystem.hub.generated.cjs << EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: './server.js',
    cwd: '$REMOTE_ROOT/edi_orchestrator',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: $PM2_PORT,
      DB_NAME: '$DB_NAME',
      DB_HOST: '127.0.0.1',
      DB_USER: 'Consultant',
      // Note: DB_PASSWORD must be set in .env on server or handled securely
    },
    error_file: '$REMOTE_ROOT/logs/${PM2_APP_NAME}-error.log',
    out_file: '$REMOTE_ROOT/logs/${PM2_APP_NAME}-out.log',
    merge_logs: true,
    autorestart: true
  }]
}
EOF
echo -e "${GREEN}✅ Fichier ecosystem généré.${NC}"

# 4. Connexion SSH & Backup
echo -e "${YELLOW}🔌 Vérification SSH & Backup...${NC}"
ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST << EOF
    mkdir -p $REMOTE_ROOT/_BACKUPS
    mkdir -p $REMOTE_ROOT/edi_orchestrator
    mkdir -p $REMOTE_ROOT/logs
    if [ -d "$REMOTE_ROOT/edi_orchestrator" ]; then
        cp -r $REMOTE_ROOT/edi_orchestrator $REMOTE_ROOT/_BACKUPS/orchestrator_\$(date +%Y%m%d_%H%M%S)
    fi
EOF

# 5. Transfert des fichiers
echo -e "${YELLOW}📤 Transfert des fichiers vers $REMOTE_ROOT/edi_orchestrator...${NC}"

rsync -avz -e "ssh -p $REMOTE_PORT" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    edi_orchestrator/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/edi_orchestrator/

# Config PM2
rsync -avz -e "ssh -p $REMOTE_PORT" ecosystem.hub.generated.cjs $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/edi_orchestrator/ecosystem.config.cjs

rm ecosystem.hub.generated.cjs
echo -e "${GREEN}✅ Transfert terminé.${NC}"

# 6. Installation & Redémarrage
echo -e "${YELLOW}🔄 Finalisation sur le serveur...${NC}"
ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST << EOF
    # Hub Install
    cd $REMOTE_ROOT/edi_orchestrator
    echo "📦 Installation dépendances..."
    npm install --production

    # Vérification .env
    if [ ! -f .env ]; then
        echo "⚠️  ATTENTION: Fichier .env manquant. Création d'un template..."
        echo "DB_HOST=127.0.0.1" > .env
        echo "DB_USER=Consultant" >> .env
        echo "DB_NAME=$DB_NAME" >> .env
        echo "PORT=$PM2_PORT" >> .env
        echo "# DB_PASSWORD=... (A Remplir)" >> .env
    fi

    # PM2
    echo "🔄 Redémarrage complet PM2 ($PM2_APP_NAME)..."
    pm2 delete $PM2_APP_NAME || true
    pm2 start ecosystem.config.cjs --update-env
    pm2 save

EOF

echo -e "${GREEN}🎉 DÉPLOIEMENT HUB TERMINÉ !${NC}"
echo -e "${YELLOW}👉 Port : $PM2_PORT${NC}"
