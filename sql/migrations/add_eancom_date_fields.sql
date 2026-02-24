-- Migration: Add EANCOM date fields and transport fees to valid_order table
-- Date: 2026-01-08
-- Description: Add columns for delivery date requested, earliest, latest, and transport fees


-- Add new date columns
ALTER TABLE valid_order 
ADD COLUMN date_livraison_demandee DATETIME NULL COMMENT 'Date de livraison demandée (DTM+2)',
ADD COLUMN date_livraison_plus_tot DATETIME NULL COMMENT 'Date de livraison au plus tôt (DTM+64)',
ADD COLUMN date_livraison_plus_tard DATETIME NULL COMMENT 'Date de livraison au plus tard (DTM+63)',
ADD COLUMN frais_transport DECIMAL(10,2) NULL COMMENT 'Frais de transport proposés (MOA+23)';

-- Verify columns were added
DESCRIBE valid_order;

-- Show sample data
SELECT id_order, num_order, date_livraison, date_livraison_demandee, date_livraison_plus_tot, date_livraison_plus_tard, frais_transport
FROM valid_order
LIMIT 5;
