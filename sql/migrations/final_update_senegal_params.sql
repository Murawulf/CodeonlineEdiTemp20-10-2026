-- Script de mise à jour des paramètres pour le serveur SENEGAL (Production/Dev)
-- Ce script configure les URLs spécifiques par PAYS (API Directe vs EDI)

-- 1. Configuration Locale (Sénégal)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('LOCAL_API_URL', 'http://localhost:5000', 'servers', 'URL du serveur backend local', 1),
('WEBSOCKET_URL', 'https://dev.codeonline-edi.net', 'servers', 'URL du serveur WebSocket (Public)', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 2. Configuration SENEGAL (Ici = Local/Public)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_SENEGAL', 'https://dev.codeonline-edi.net', 'servers', 'API Directe Sénégal (Data/Images)', 1),
('EDI_URL_SENEGAL', 'https://dev.codeonline-edi.net/api/edi/receive', 'servers', 'Point de terminaison EDI Sénégal', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 3. Configuration TUNISIE (Distant)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_TUNISIA', 'https://edi-dev.codeonline-info.com', 'servers', 'API Directe Tunisie (Data/Images)', 1),
('EDI_URL_TUNISIA', 'https://edi-dev.codeonline-info.com/api/edi/receive', 'servers', 'Point de terminaison EDI Tunisie', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 4. Configuration Email & PIN (Standards)
INSERT INTO app_parameters (param_key, param_value, category, is_public) 
VALUES 
('SMTP_HOST', 'smtp-relay.brevo.com', 'email', 0),
('SMTP_PORT', '587', 'email', 0),
('SMTP_USER', '948ac0001@smtp-brevo.com', 'email', 0),
('API_PIN', '3311', 'security', 0)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value);

-- 4. Vérification
SELECT param_key, param_value FROM app_parameters WHERE category = 'servers';
