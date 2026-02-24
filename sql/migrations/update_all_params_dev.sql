-- Script de mise à jour global des paramètres pour l'environnement DEV (dev.codeonline-edi.net)
-- Exécuter ce script sur la base de données pour corriger toutes les URLs et Ports

-- 1. Mettre à jour les URLs principales
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_SENEGAL', 'https://dev.codeonline-edi.net', 'servers', 'URL du serveur Sénégal (Dev)', 1),
('API_URL_TUNISIA', 'http://localhost:5000', 'servers', 'URL du serveur Tunisie (Local)', 1),
('WEBSOCKET_URL', 'https://dev.codeonline-edi.net', 'servers', 'URL du serveur WebSocket', 1),
('LOCAL_API_URL', 'http://localhost:5000', 'servers', 'URL du serveur backend local', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 2. Mettre à jour les rôles (Sénégal = Acheteur, Tunisie = Fournisseur)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_BUYER', 'https://dev.codeonline-edi.net/api', 'servers', 'URL du serveur backend Acheteur', 1),
('API_URL_SUPPLIER', 'http://localhost:5000', 'servers', 'URL du serveur backend Fournisseur (Local)', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value);

-- 3. Mettre à jour les paramètres Email (si nécessaire)
-- Remplacez les valeurs si elles sont différentes
INSERT INTO app_parameters (param_key, param_value, category, is_public) 
VALUES 
('SMTP_HOST', 'smtp-relay.brevo.com', 'email', 0),
('SMTP_PORT', '587', 'email', 0),
('SMTP_USER', '948ac0001@smtp-brevo.com', 'email', 0)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value);

-- 4. Vérification
SELECT param_key, param_value FROM app_parameters WHERE category = 'servers';
