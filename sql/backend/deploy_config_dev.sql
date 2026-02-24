-- Configuration pour le déploiement sur 'dev.codeonline-edi.net' (Serveur SENEGAL)
-- Ce script configure les URLs pour que :
-- 1. SENEGAL soit l'instance principale (https://dev.codeonline-edi.net)
-- 2. TUNISIE soit l'instance secondaire locale (http://localhost:5000)

-- Mise à jour des URLs des serveurs régionaux
UPDATE app_parameters 
SET param_value = 'https://dev.codeonline-edi.net' 
WHERE param_key = 'API_URL_SENEGAL';

UPDATE app_parameters 
SET param_value = 'http://localhost:5000' 
WHERE param_key = 'API_URL_TUNISIA';

-- Mise à jour des rôles (Qui est Acheteur ? Qui est Fournisseur ?)
-- Si Sénégal = Acheteur
UPDATE app_parameters 
SET param_value = 'https://dev.codeonline-edi.net' 
WHERE param_key = 'API_URL_BUYER';

-- Si Tunisie = Fournisseur
UPDATE app_parameters 
SET param_value = 'http://localhost:5000' 
WHERE param_key = 'API_URL_SUPPLIER';

-- Mise à jour de l'URL WebSocket (généralement la même que l'API locale du serveur)
UPDATE app_parameters 
SET param_value = 'https://dev.codeonline-edi.net' 
WHERE param_key = 'WEBSOCKET_URL';

-- Désactiver le mode "Simulation" des ports si nécessaire (non géré par DB pour l'instant mais bon à savoir)
-- NOTE: Pensez à redémarrer le serveur Node.js après avoir exécuté ce script !
