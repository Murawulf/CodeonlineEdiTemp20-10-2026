-- Migration pour ajouter la topologie réseau et l'instance courante
-- Permet une configuration 100% pilotée par la base de données

INSERT INTO app_parameters (param_key, param_value, category, description, param_type, is_public) 
VALUES 
-- 1. Instance Courante (par défaut 'local_dev', à changer selon le serveur)
('CURRENT_INSTANCE_CODE', 'local_dev', 'system', 'Code identifiant ce serveur dans la topologie (ex: tunisia, senegal, local_dev)', 'string', 1),

-- 2. Topologie Réseau (JSON)
('NETWORK_TOPOLOGY', '{
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
}', 'system', 'Définition des noeuds du réseau et leurs URLs', 'json', 1)

ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description),
    param_type = VALUES(param_type);
