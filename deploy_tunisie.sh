#!/bin/bash
# ==============================================================================
# 🚀 SCRIPT DE DÉPLOIEMENT RAPIDE - TUNISIE
# Wrapper pour deploy_universal.sh avec la configuration Tunisie
# ==============================================================================

# Se placer dans le dossier racine du projet (là où se trouve ce script)
cd "$(dirname "$0")"

# Vérifier que le script universel existe
if [ ! -f "deploy_universal.sh" ]; then
    echo "❌ Erreur : deploy_universal.sh introuvable !"
    exit 1
fi

# Vérifier que la config existe
if [ ! -f "deploy_configs/tunisie.conf" ]; then
    echo "❌ Erreur : deploy_configs/tunisie.conf introuvable !"
    exit 1
fi

echo "🌍 Lancement du déploiement vers la TUNISIE..."
echo "📂 Configuration : deploy_configs/tunisie.conf"
echo "------------------------------------------------------"

# Exécuter le déploiement universel
./deploy_universal.sh deploy_configs/tunisie.conf
