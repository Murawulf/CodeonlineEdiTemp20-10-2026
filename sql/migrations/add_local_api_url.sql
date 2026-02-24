-- Migration: Ajouter LOCAL_API_URL pour distinguer les appels backend locaux des appels serveurs distants
-- Date: 2026-02-02
-- Description: Cette migration ajoute le paramètre LOCAL_API_URL pour clarifier l'architecture API

-- Ajouter le paramètre LOCAL_API_URL
INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public) 
VALUES ('LOCAL_API_URL', 'http://localhost:5000', 'string', 'servers', 'URL du serveur backend local (notre API)', 1)
ON DUPLICATE KEY UPDATE 
  param_value = VALUES(param_value),
  description = VALUES(description),
  updated_at = CURRENT_TIMESTAMP;

-- Mettre à jour les descriptions pour clarifier la distinction
UPDATE app_parameters 
SET description = 'URL du serveur distant Sénégal (pour appels inter-pays)'
WHERE param_key = 'API_URL_SENEGAL';

UPDATE app_parameters 
SET description = 'URL du serveur distant Tunisie (pour appels inter-pays)'
WHERE param_key = 'API_URL_TUNISIA';

-- Ajouter des commentaires explicatifs
-- LOCAL_API_URL : Pour les appels à notre propre backend (authentification, données locales, etc.)
-- API_URL_SENEGAL / API_URL_TUNISIA : Pour les appels mutuels entre pays (récupération de données distantes)
