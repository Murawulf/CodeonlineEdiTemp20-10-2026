-- Script FINAL de mise à jour des paramètres pour l'environnement LOCALHOST (Dev Tunisie)
-- Ce script configure les URLs spécifiques par PAYS (API Directe vs EDI)

-- 1. Configuration Locale
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('LOCAL_API_URL', 'http://localhost:5000', 'servers', 'URL du serveur backend local', 1),
('WEBSOCKET_URL', 'http://localhost:5000', 'servers', 'URL du serveur WebSocket local', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 2. Configuration TUNISIE (Ici = Localhost)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_TUNISIA', 'http://localhost:5000', 'servers', 'API Directe Tunisie (Data/Images)', 1),
('EDI_URL_TUNISIA', 'http://localhost:5000/api/edi/receive', 'servers', 'Point de terminaison EDI Tunisie', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 3. Configuration SENEGAL (Distant)
INSERT INTO app_parameters (param_key, param_value, category, description, is_public) 
VALUES 
('API_URL_SENEGAL', 'https://dev.codeonline-edi.net', 'servers', 'API Directe Sénégal (Data/Images)', 1),
('EDI_URL_SENEGAL', 'https://dev.codeonline-edi.net/api/edi/receive', 'servers', 'Point de terminaison EDI Sénégal', 1)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description);

-- 4. Nettoyage des anciens paramètres de rôles fixes (Optionnel mais recommandé)
-- DELETE FROM app_parameters WHERE param_key IN ('API_URL_BUYER', 'API_URL_SUPPLIER');

-- 5. Configuration Email & PIN (Standards)
INSERT INTO app_parameters (param_key, param_value, category, is_public) 
VALUES 
('SMTP_HOST', 'smtp-relay.brevo.com', 'email', 0),
('SMTP_PORT', '587', 'email', 0),
('SMTP_USER', '948ac0001@smtp-brevo.com', 'email', 0),
('API_PIN', '3311', 'security', 0)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value);
