-- Migration SQL pour ajouter les colonnes manquantes à la table valid_order
-- Base de données: EntiteDb
-- Serveur: Configuré dans .env

USE EntiteDb;

-- Ajouter la colonne date_livraison
ALTER TABLE valid_order 
ADD COLUMN date_livraison DATETIME NULL 
COMMENT 'Date de livraison demandée';

-- Ajouter la colonne date_reception  
ALTER TABLE valid_order 
ADD COLUMN date_reception DATETIME DEFAULT CURRENT_TIMESTAMP 
COMMENT 'Date de réception de la commande';

-- Vérifier que les colonnes ont été ajoutées
DESCRIBE valid_order;

-- Afficher les colonnes ajoutées
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'EntiteDb' 
  AND TABLE_NAME = 'valid_order'
  AND COLUMN_NAME IN ('date_livraison', 'date_reception');
