-- Migration: Add EDI_ORDERS_PATH parameter for configurable EANCOM document storage
-- This allows the application to store EDI documents in a configurable location
-- Default: ../Edi-orders (at the same level as the application folder)

-- Add the new parameter
INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public) 
VALUES (
    'EDI_ORDERS_PATH',
    '/var/www/Edi-orders',
    'string',
    'eancom',
    'Chemin du dossier de stockage des documents EDI EANCOM (doit être au même niveau que le dossier de l''application)',
    0
)
ON DUPLICATE KEY UPDATE 
    param_value = VALUES(param_value),
    description = VALUES(description),
    updated_at = CURRENT_TIMESTAMP;

-- Verify the parameter was added
SELECT * FROM app_parameters WHERE param_key = 'EDI_ORDERS_PATH';
