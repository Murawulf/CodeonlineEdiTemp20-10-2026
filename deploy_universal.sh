#!/bin/bash

# ==============================================================================
# 🌍 SCRIPT DE DÉPLOIEMENT UNIVERSEL (MULTI-PAYS)
# Usage: ./deploy_universal.sh deploy_configs/pays.conf
# ==============================================================================

# 1. Chargement de la configuration
CONFIG_FILE=$1

if [ -z "$CONFIG_FILE" ]; then
    echo "❌ Erreur : Veuillez spécifier un fichier de configuration."
    echo "Usage : ./deploy_universal.sh deploy_configs/mon_pays.conf"
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
echo -e "${YELLOW}🎯 Cible : $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT${NC}"

# 2. Vérification des variables obligatoires
REQUIRED_VARS=("REMOTE_USER" "REMOTE_HOST" "REMOTE_PORT" "REMOTE_ROOT" "PM2_APP_NAME" "PM2_PORT" "API_PUBLIC_URL" "DB_NAME")
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo -e "${RED}⛔️ Erreur : La variable $VAR n'est pas définie dans le fichier de config.${NC}"
        exit 1
    fi
done

# 3. Vérification Préliminaire (Mot de passe BDD local pour éviter les erreurs, optionnel)
if grep -q "VOTRE_MOT_DE_PASSE_ICI" backend/.env; then
    echo -e "${YELLOW}⚠️  ATTENTION : Le mot de passe BDD semble être celui par défaut dans backend/.env local.${NC}"
    echo -e "${YELLOW}   Assurez-vous que le fichier .env sur le serveur est correct.${NC}"
    read -p "   Continuer ? (o/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        exit 1
    fi
fi

# 4. Build du Frontend
echo -e "${YELLOW}📦 Construction du Frontend (Vite)...${NC}"

# Création d'un fichier .env.production temporaire pour le build
cat > .env.production << EOF
VITE_API_BASE_URL=$API_PUBLIC_URL
EOF

echo "  - Build avec API_URL=$API_PUBLIC_URL"
npm run build
BUILD_STATUS=$?
rm .env.production

if [ $BUILD_STATUS -ne 0 ]; then
    echo -e "${RED}❌ Erreur lors du build frontend.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build frontend terminé.${NC}"

# 5. Génération dynamique de ecosystem.config.cjs
echo -e "${YELLOW}⚙️  Génération de la configuration PM2...${NC}"
cat > ecosystem.generated.cjs << EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: './server.js',
    cwd: '$REMOTE_ROOT/backend',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: $PM2_PORT,
      DB_NAME: '$DB_NAME',
      DB_HOST: '127.0.0.1',
      CURRENT_INSTANCE_CODE: '$CURRENT_INSTANCE_CODE',
      LOCAL_API_URL: 'http://localhost:$PM2_PORT',
      FRONTEND_URL: '$API_PUBLIC_URL'
    },
    error_file: '$REMOTE_ROOT/logs/pm2-error.log',
    out_file: '$REMOTE_ROOT/logs/pm2-out.log',
    merge_logs: true,
    autorestart: true
  }]
}
EOF
echo -e "${GREEN}✅ Fichier ecosystem généré (Port: $PM2_PORT, DB: $DB_NAME).${NC}"

# 6. Connexion SSH & Backup
echo -e "${YELLOW}🔌 Vérification SSH & Backup...${NC}"
ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST << EOF
    mkdir -p $REMOTE_ROOT/_BACKUPS
    mkdir -p $REMOTE_ROOT/backend
    if [ -d "$REMOTE_ROOT/backend" ]; then
        cp -r $REMOTE_ROOT/backend $REMOTE_ROOT/_BACKUPS/backend_\$(date +%Y%m%d_%H%M%S)
    fi
EOF

# 7. Transfert des fichiers
echo -e "${YELLOW}📤 Transfert des fichiers vers $REMOTE_ROOT...${NC}"

# Frontend (dist)
rsync -avz -e "ssh -p $REMOTE_PORT" dist/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/

# Backend
rsync -avz -e "ssh -p $REMOTE_PORT" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'uploads' \
    --exclude 'Modeles' \
    --exclude '.env' \
    backend/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/backend/

# Config PM2
rsync -avz -e "ssh -p $REMOTE_PORT" ecosystem.generated.cjs $REMOTE_USER@$REMOTE_HOST:$REMOTE_ROOT/ecosystem.config.cjs

rm ecosystem.generated.cjs
echo -e "${GREEN}✅ Transfert terminé.${NC}"

# 8. Installation & Redémarrage
echo -e "${YELLOW}🔄 Finalisation sur le serveur...${NC}"
ssh -p $REMOTE_PORT $REMOTE_USER@$REMOTE_HOST << EOF
    # Préparation dossiers
    mkdir -p $REMOTE_ROOT/backend/uploads $REMOTE_ROOT/backend/Modeles $REMOTE_ROOT/backend/logs
    
    # Backend Install
    cd $REMOTE_ROOT/backend
    echo "📦 Installation dépendances..."
    npm install --production

    # Vérification .env
    if [ ! -f .env ]; then
        echo "⚠️  Création d'un .env vide (A CONFIGURER MANUELLEMENT !)"
        touch .env
    fi

    # Injection automatique des variables d'environnement nécessaires
    if ! grep -q "^CURRENT_INSTANCE_CODE=" .env; then
        echo "CURRENT_INSTANCE_CODE=$CURRENT_INSTANCE_CODE" >> .env
    else
        sed -i "s/^CURRENT_INSTANCE_CODE=.*/CURRENT_INSTANCE_CODE=$CURRENT_INSTANCE_CODE/" .env
    fi

    if ! grep -q "^LOCAL_API_URL=" .env; then
        echo "LOCAL_API_URL=http://localhost:$PM2_PORT" >> .env
    else
        sed -i "s|^LOCAL_API_URL=.*|LOCAL_API_URL=http://localhost:$PM2_PORT|" .env
    fi

    # Base de données (Paramétrage de l'instance)
    cd $REMOTE_ROOT/backend
    echo "⚙️ Initialisation des paramètres de la base de données..."
    node scripts/init_db_params.js

    # PM2
    cd $REMOTE_ROOT
    echo "🔄 Redémarrage PM2 ($PM2_APP_NAME)..."
    pm2 startOrReload ecosystem.config.cjs --update-env
    pm2 save

    # Permissions
    # chmod -R 755 $REMOTE_ROOT
EOF

echo -e "${GREEN}🎉 DÉPLOIEMENT TERMINÉ pour $COUNTRY_NAME !${NC}"
echo -e "${YELLOW}👉 Port Node.js : $PM2_PORT${NC}"
echo -e "${YELLOW}👉 URL Publique : $API_PUBLIC_URL${NC}"
