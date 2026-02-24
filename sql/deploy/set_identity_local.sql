-- Script de configuration pour le Développement LOCAL
-- À exécuter sur votre machine de dev

-- 1. Définir l'identité de ce serveur (Mode simulation)
-- Valeurs possibles pour tester : 'local_dev' (défaut), 'tunisia' (simule la Tunisie), 'senegal' (simule le Sénégal)
UPDATE app_parameters 
SET param_value = 'local_dev' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 2. Mise à jour topologie
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

SELECT '✅ Environnement configuré en : LOCAL DEV' as status;
