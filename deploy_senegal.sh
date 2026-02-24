#!/bin/bash
# ==============================================================================
# 🚀 SCRIPT DE DÉPLOIEMENT RAPIDE - SÉNÉGAL
# Wrapper pour deploy_universal.sh avec la configuration Sénégal
# ==============================================================================

# Se placer dans le dossier racine du projet (là où se trouve ce script)
cd "$(dirname "$0")"

# Vérifier que le script universel existe
if [ ! -f "deploy_universal.sh" ]; then
    echo "❌ Erreur : deploy_universal.sh introuvable !"
    exit 1
fi

# Vérifier que la config existe
if [ ! -f "deploy_configs/senegal.conf" ]; then
    echo "❌ Erreur : deploy_configs/senegal.conf introuvable !"
    exit 1
fi

echo "🌍 Lancement du déploiement vers le SÉNÉGAL..."
echo "📂 Configuration : deploy_configs/senegal.conf"
echo "------------------------------------------------------"

# Exécuter le déploiement universel
./deploy_universal.sh deploy_configs/senegal.conf
