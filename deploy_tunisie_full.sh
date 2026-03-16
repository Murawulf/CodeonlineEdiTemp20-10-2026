#!/bin/bash

# ==============================================================================
# 🇹🇳 SCRIPT DE DÉPLOIEMENT COMPLET : TUNISIE + HUB ORCHESTRATOR
# ==============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   🚀 DÉPLOIEMENT COMPLET : TUNISIE (APP + ORCHESTRATOR)        ${NC}"
echo -e "${CYAN}================================================================${NC}"

# 1. Déploiement du Hub Orchestrator (Infrastructure centrale)
echo -e "\n${YELLOW}📡 ÉTAPE 1/2 : Déploiement du Hub Orchestrator...${NC}"
./deploy_hub.sh deploy_configs/hub.conf

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Échec du déploiement du Hub. Arrêt.${NC}"
    exit 1
fi

# 2. Déploiement de l'Application Tunisie
echo -e "\n${YELLOW}🇹🇳 ÉTAPE 2/2 : Déploiement de l'Application Tunisie...${NC}"
./deploy_universal.sh deploy_configs/tunisie.conf

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Échec du déploiement de l'App Tunisie.${NC}"
    exit 1
fi

echo -e "\n${GREEN}✅✅✅ DÉPLOIEMENT GLOBAL TERMINÉ AVEC SUCCÈS !${NC}"
