#!/bin/bash

echo "🚀 Déploiement CodeOnline EDI - Environnement DEV"
echo "=================================================="

# Variables - À ADAPTER selon votre configuration
SERVER="user@dev.codeonline-edi.net"
REMOTE_DIR="/var/www/codeonline-edi"
BACKEND_DIR="/var/www/Edi-dev/backend"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les erreurs
error_exit() {
    echo -e "${RED}❌ $1${NC}" 1>&2
    exit 1
}

# Fonction pour afficher les succès
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Fonction pour afficher les infos
info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# 1. Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ]; then
    error_exit "Fichier package.json non trouvé. Êtes-vous dans le bon répertoire ?"
fi

# 2. Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    info "Installation des dépendances..."
    npm install || error_exit "Échec de l'installation des dépendances"
fi

# 3. Build du frontend
info "Building frontend..."
npm run build || error_exit "Échec du build frontend"

if [ ! -d "dist" ]; then
    error_exit "Le dossier dist n'a pas été créé. Le build a échoué."
fi

success "Build frontend réussi"

# 4. Vérifier la connexion au serveur
info "Vérification de la connexion au serveur..."
ssh -o ConnectTimeout=10 $SERVER "echo 'Connexion OK'" || error_exit "Impossible de se connecter au serveur"

# 5. Créer le répertoire distant si nécessaire
info "Création du répertoire distant si nécessaire..."
ssh $SERVER "mkdir -p $REMOTE_DIR/dist" || error_exit "Impossible de créer le répertoire distant"

# 6. Backup de l'ancienne version (optionnel)
info "Backup de l'ancienne version..."
ssh $SERVER "if [ -d $REMOTE_DIR/dist.old ]; then rm -rf $REMOTE_DIR/dist.old; fi"
ssh $SERVER "if [ -d $REMOTE_DIR/dist ]; then mv $REMOTE_DIR/dist $REMOTE_DIR/dist.old; fi"

# 7. Transfert des fichiers
info "Transfert des fichiers vers le serveur..."
rsync -avz --delete dist/ $SERVER:$REMOTE_DIR/dist/ || error_exit "Échec du transfert des fichiers"

success "Fichiers transférés avec succès"

# 8. Définir les permissions correctes
info "Configuration des permissions..."
ssh $SERVER "sudo chown -R www-data:www-data $REMOTE_DIR/dist && sudo chmod -R 755 $REMOTE_DIR/dist" || error_exit "Échec de la configuration des permissions"

# 9. Redémarrer le backend (optionnel)
read -p "Voulez-vous redémarrer le backend Node.js ? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Redémarrage du backend..."
    ssh $SERVER "cd $BACKEND_DIR && pm2 restart codeonline-backend" || error_exit "Échec du redémarrage du backend"
    success "Backend redémarré"
fi

# 10. Recharger Nginx
read -p "Voulez-vous recharger Nginx ? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Rechargement de Nginx..."
    ssh $SERVER "sudo nginx -t && sudo systemctl reload nginx" || error_exit "Échec du rechargement de Nginx"
    success "Nginx rechargé"
fi

# 11. Vérification finale
echo ""
echo "=================================================="
success "Déploiement terminé avec succès !"
echo "=================================================="
echo ""
echo "🌐 URL : https://dev.codeonline-edi.net"
echo ""
echo "📋 Prochaines étapes :"
echo "  1. Ouvrir https://dev.codeonline-edi.net dans votre navigateur"
echo "  2. Vérifier que l'application se charge correctement"
echo "  3. Tester les fonctionnalités principales"
echo "  4. Vérifier les logs si nécessaire :"
echo "     - Frontend : sudo tail -f /var/log/nginx/codeonline-edi-error.log"
echo "     - Backend  : pm2 logs codeonline-backend"
echo ""
