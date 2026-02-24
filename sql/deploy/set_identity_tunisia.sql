-- Script de déploiement pour le serveur TUNISIE
-- À exécuter une seule fois sur la base de données du serveur TUNISIE

-- 1. Définir l'identité de ce serveur
UPDATE app_parameters 
SET param_value = 'tunisia' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 2. S'assurer que la topologie est à jour (Copie locale de l'annuaire réseau)
-- Si les URLs changent, on met à jour ce JSON sur tous les serveurs
UPDATE app_parameters 
SET param_value = '{
  "tunisia": { 
    "name": "Tunisie", 
    "apiUrl": "https://edi-dev.codeonline-info.com", 
    "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive" 
  },
  "senegal": { 
    "name": "Sénégal", 
    "apiUrl": "https://dev.codeonline-edi.net", 
    "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive" 
  },
  "local_dev": { 
    "name": "Localhost", 
    "apiUrl": "http://localhost:5000", 
    "ediUrl": "http://localhost:5000/api/edi/receive" 
  }
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';

SELECT '✅ Serveur configuré en tant que : TUNISIE' as status;
