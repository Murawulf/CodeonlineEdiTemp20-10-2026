-- =====================================================
-- SCRIPT COMPLET DE VÉRIFICATION ET CRÉATION DU SCHÉMA EDI
-- =====================================================
-- Ce script est idempotent : il crée les tables manquantes et ajoute les colonnes manquantes.
-- Compatible MySQL/MariaDB.
-- Usage: À exécuter sur la base de données cible (ex: via phpMyAdmin, Workbench, ou script Node).

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Tables Principales (Orders & Lines)
-- ======================================

CREATE TABLE IF NOT EXISTS orders (
  id_order INT AUTO_INCREMENT PRIMARY KEY,
  num_commande VARCHAR(50),
  order_number VARCHAR(50),
  id_entite_buyer INT,
  acheteur_gln VARCHAR(13),
  id_entite_seller INT,
  fournisseur_gln VARCHAR(13),
  seller_name VARCHAR(255),
  lieu_livraison_gln VARCHAR(13),
  status VARCHAR(50) DEFAULT 'new',
  total_ht DECIMAL(12,2),
  total_tax_amount DECIMAL(12,2),
  total_amount_with_tax DECIMAL(12,2),
  currency VARCHAR(3),
  monnaie VARCHAR(3),
  date_commande DATETIME,
  date_livraison DATETIME,
  contract_reference VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_lines (
  id_line INT AUTO_INCREMENT PRIMARY KEY,
  id_order INT,
  line_number INT,
  gtin VARCHAR(14),
  libelle VARCHAR(255),
  qty DECIMAL(10,3),
  unit VARCHAR(10),
  price DECIMAL(12,2),
  line_net_amount DECIMAL(12,2),
  FOREIGN KEY (id_order) REFERENCES orders(id_order) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_line_deliveries (
  id_delivery INT AUTO_INCREMENT PRIMARY KEY,
  id_line INT NOT NULL,
  delivery_location_gln VARCHAR(13) NOT NULL,
  delivery_location_name VARCHAR(255),
  delivery_qty DECIMAL(10,3) NOT NULL,
  delivery_date DATE,
  delivery_status VARCHAR(20) DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_line) REFERENCES order_lines(id_line) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tables EDI Transverses
-- =========================

CREATE TABLE IF NOT EXISTS app_parameters (
  param_key VARCHAR(50) PRIMARY KEY,
  param_value TEXT,
  param_type VARCHAR(20) DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  description VARCHAR(255),
  is_public TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_transmissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  related_id INT COMMENT 'ID de l''objet métier',
  related_type VARCHAR(50) COMMENT 'ORDER, INVOICE, DESADV',
  document_type VARCHAR(20) NOT NULL COMMENT 'ORDERS, INVOIC, ORDRSP, DESADV',
  direction VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND',
  partner_id INT,
  partner_gln VARCHAR(13),
  filename VARCHAR(255),
  file_path TEXT,
  file_content MEDIUMTEXT,
  status VARCHAR(20) DEFAULT 'PENDING',
  transmission_date DATETIME,
  acknowledgment_date DATETIME,
  processing_date DATETIME,
  logs TEXT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_doc_type (document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Transport & Logistique (DESADV)
-- ==================================

CREATE TABLE IF NOT EXISTS edi_transport_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transport_number VARCHAR(50) NOT NULL,
  id_order INT,
  id_shipment VARCHAR(50),
  transporteur VARCHAR(255),
  vehicule VARCHAR(100),
  driver VARCHAR(100),
  cost DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_shipment VARCHAR(50) NOT NULL,
  event_code VARCHAR(10),
  event_label VARCHAR(100),
  event_datetime DATETIME,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shipment (id_shipment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_desadv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  desadv_number VARCHAR(35) NOT NULL,
  original_order_number VARCHAR(35),
  id_order INT,
  buyer_gln VARCHAR(13),
  seller_gln VARCHAR(13),
  delivery_gln VARCHAR(13),
  shipping_date DATETIME,
  delivery_date DATETIME,
  total_packages INT DEFAULT 0,
  total_weight DECIMAL(10,3),
  status VARCHAR(20) DEFAULT 'DRAFT',
  direction VARCHAR(10) DEFAULT 'OUTBOUND',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desadv INT NOT NULL,
  sscc VARCHAR(18) NOT NULL,
  package_type VARCHAR(3) DEFAULT 'CT',
  weight DECIMAL(10,3),
  tracking_number VARCHAR(50),
  parent_sscc VARCHAR(18),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_desadv) REFERENCES edi_desadv(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_desadv_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desadv INT NOT NULL,
  id_package INT,
  id_order_line INT,
  line_number INT,
  gtin VARCHAR(14),
  supplier_item_code VARCHAR(35),
  libelle VARCHAR(255),
  qty_dispatched DECIMAL(10,3),
  qty_ordered DECIMAL(10,3),
  batch_number VARCHAR(35),
  expiry_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_desadv) REFERENCES edi_desadv(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Facturation (INVOIC)
-- =======================

CREATE TABLE IF NOT EXISTS edi_invoic (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoic_number VARCHAR(35) NOT NULL,
  type_code VARCHAR(3) DEFAULT '380',
  date_facture DATETIME,
  date_echeance DATETIME,
  buyer_gln VARCHAR(13),
  seller_gln VARCHAR(13),
  order_reference VARCHAR(35),
  desadv_reference VARCHAR(35),
  currency VARCHAR(3) DEFAULT 'EUR',
  total_ht DECIMAL(12,2),
  total_tax DECIMAL(12,2),
  total_ttc DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'DRAFT',
  direction VARCHAR(10) DEFAULT 'OUTBOUND',
  id_order INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_invoic_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  line_number INT,
  gtin VARCHAR(14),
  description VARCHAR(255),
  quantity DECIMAL(10,3),
  unit_price DECIMAL(12,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(12,2),
  line_amount DECIMAL(12,2),
  id_order_line INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_invoic) REFERENCES edi_invoic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edi_tax_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  tax_rate DECIMAL(5,2),
  tax_category VARCHAR(3),
  taxable_amount DECIMAL(12,2),
  tax_amount DECIMAL(12,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_invoic) REFERENCES edi_invoic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Procédure pour ajouter des colonnes manquantes
-- =================================================

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

DELIMITER //
CREATE PROCEDURE AddColumnIfNotExists(
    IN dbName VARCHAR(100),
    IN tableName VARCHAR(100),
    IN colName VARCHAR(100),
    IN colDef VARCHAR(255)
)
BEGIN
    DECLARE colCount INT;
    
    SELECT COUNT(*) INTO colCount
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = dbName
      AND TABLE_NAME = tableName
      AND COLUMN_NAME = colName;
      
    IF colCount = 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', colName, ' ', colDef);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        SELECT CONCAT('Column ', colName, ' added to ', tableName) AS status;
    ELSE
        SELECT CONCAT('Column ', colName, ' already exists in ', tableName) AS status;
    END IF;
END //
DELIMITER ;

-- 6. Mise à jour des colonnes de ORDERS
-- =====================================

SELECT DATABASE() INTO @current_db;

-- Identification et références
CALL AddColumnIfNotExists(@current_db, 'orders', 'contract_reference', 'VARCHAR(50) COMMENT \'Ref Contrat\'');
CALL AddColumnIfNotExists(@current_db, 'orders', 'contract_date', 'DATE');
CALL AddColumnIfNotExists(@current_db, 'orders', 'price_list_reference', 'VARCHAR(50)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'buyer_vat_number', 'VARCHAR(20)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'supplier_vat_number', 'VARCHAR(20)');

-- Paiement et Contact
CALL AddColumnIfNotExists(@current_db, 'orders', 'payment_terms_code', 'VARCHAR(10)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'payment_means', 'VARCHAR(50)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'order_contact_name', 'VARCHAR(100)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'order_contact_phone', 'VARCHAR(20)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'order_contact_email', 'VARCHAR(100)');

-- Conditions et Textes
CALL AddColumnIfNotExists(@current_db, 'orders', 'group_conditions_code', 'VARCHAR(10)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'free_text', 'TEXT');

-- Taux de change
CALL AddColumnIfNotExists(@current_db, 'orders', 'exchange_rate', 'DECIMAL(10,6)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'exchange_rate_currency', 'VARCHAR(3)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'exchange_rate_period_start', 'DATE');
CALL AddColumnIfNotExists(@current_db, 'orders', 'exchange_rate_period_end', 'DATE');

-- Montants
CALL AddColumnIfNotExists(@current_db, 'orders', 'total_line_amount', 'DECIMAL(12,2)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'total_tax_amount', 'DECIMAL(12,2)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'total_amount_with_tax', 'DECIMAL(12,2)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'tax_rate', 'DECIMAL(5,2)');

-- Colisage global
CALL AddColumnIfNotExists(@current_db, 'orders', 'package_count', 'INT');
CALL AddColumnIfNotExists(@current_db, 'orders', 'package_type', 'VARCHAR(10)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'package_marking_instructions', 'TEXT');

-- Champs système/compatibilité
CALL AddColumnIfNotExists(@current_db, 'orders', 'status', 'VARCHAR(50) DEFAULT \'new\'');
CALL AddColumnIfNotExists(@current_db, 'orders', 'id_entite_buyer', 'INT');
CALL AddColumnIfNotExists(@current_db, 'orders', 'id_entite_seller', 'INT');
CALL AddColumnIfNotExists(@current_db, 'orders', 'num_commande', 'VARCHAR(50)');
CALL AddColumnIfNotExists(@current_db, 'orders', 'monnaie', 'VARCHAR(3)');

-- 7. Mise à jour des colonnes de ORDER_LINES
-- ==========================================

CALL AddColumnIfNotExists(@current_db, 'order_lines', 'buyer_product_code', 'VARCHAR(50)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'supplier_product_code', 'VARCHAR(50)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'product_description', 'TEXT');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'line_net_amount', 'DECIMAL(12,2)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'line_tax_amount', 'DECIMAL(12,2)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'line_tax_rate', 'DECIMAL(5,2)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'line_package_count', 'INT');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'line_package_type', 'VARCHAR(10)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'price_qualifier', 'VARCHAR(10)');
CALL AddColumnIfNotExists(@current_db, 'order_lines', 'price_unit', 'VARCHAR(10)');

-- Nettoyage de la procédure
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Schema EDI verifie et mis a jour avec succes.' AS result;
