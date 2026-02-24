-- Migration: Create app_parameters table for global configuration
-- This table stores all application parameters that can be modified without code changes

CREATE TABLE IF NOT EXISTS app_parameters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    param_key VARCHAR(100) NOT NULL UNIQUE,
    param_value TEXT NOT NULL,
    param_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    category VARCHAR(50) DEFAULT 'general',
    description TEXT,
    is_public TINYINT(1) DEFAULT 1 COMMENT 'If 1, parameter is exposed to frontend',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default parameters
INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public) VALUES
-- Server URLs
('API_URL_BUYER', 'https://dev.codeonline-edi.net/api', 'string', 'servers', 'URL du serveur backend Acheteur', 1),
('API_URL_SUPPLIER', 'https://dev.codeonline-edi.net/api', 'string', 'servers', 'URL du serveur backend Fournisseur', 1),
('API_URL_SENEGAL', 'https://dev.codeonline-edi.net', 'string', 'servers', 'URL du serveur Sénégal (Dev)', 1),
('API_URL_TUNISIA', 'http://localhost:5000', 'string', 'servers', 'URL du serveur Tunisie (Local)', 1),
('WEBSOCKET_URL', 'https://dev.codeonline-edi.net', 'string', 'servers', 'URL du serveur WebSocket', 1),

-- API Configuration
('API_PIN', '3311', 'string', 'security', 'PIN de sécurité API', 0),
('API_TIMEOUT', '30000', 'number', 'api', 'Timeout des requêtes API en ms', 1),

-- EANCOM Configuration
('EANCOM_BASE_DIR', '/var/www/formation/ecomfournisseur', 'string', 'eancom', 'Répertoire de base EANCOM', 0),

-- Email Configuration (SMTP)
('SMTP_HOST', 'smtp-relay.brevo.com', 'string', 'email', 'Serveur SMTP', 0),
('SMTP_PORT', '587', 'number', 'email', 'Port SMTP', 0),
('SMTP_USER', '948ac0001@smtp-brevo.com', 'string', 'email', 'Utilisateur SMTP', 0),
('FROM_EMAIL', 'netconsultingeurope20@gmail.com', 'string', 'email', 'Email expéditeur', 0),

-- File Upload Configuration
('MAX_FILE_SIZE_MB', '100', 'number', 'uploads', 'Taille max des fichiers en MB', 1),
('MAX_LOGO_SIZE_MB', '10', 'number', 'uploads', 'Taille max des logos en MB', 1),

-- Application Settings
('APP_NAME', 'CodeOnline EDI', 'string', 'general', 'Nom de l''application', 1),
('APP_VERSION', '1.0.0', 'string', 'general', 'Version de l''application', 1),
('DEFAULT_CURRENCY', 'TND', 'string', 'general', 'Devise par défaut', 1),
('DEFAULT_LANGUAGE', 'fr', 'string', 'general', 'Langue par défaut', 1),

-- Feature Flags
('FEATURE_EDI_WORKER', 'true', 'boolean', 'features', 'Activer le worker EDI', 1),
('FEATURE_NOTIFICATIONS', 'true', 'boolean', 'features', 'Activer les notifications', 1),

-- Pagination
('DEFAULT_PAGE_SIZE', '20', 'number', 'pagination', 'Nombre d''éléments par page par défaut', 1),
('MAX_PAGE_SIZE', '100', 'number', 'pagination', 'Nombre max d''éléments par page', 1)

ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description),
    is_public = VALUES(is_public),
    updated_at = CURRENT_TIMESTAMP;

-- Create index for faster lookups
-- Note: 'IF NOT EXISTS' removed for compatibility with older MySQL versions
CREATE INDEX idx_app_parameters_category ON app_parameters(category);
CREATE INDEX idx_app_parameters_is_public ON app_parameters(is_public);
