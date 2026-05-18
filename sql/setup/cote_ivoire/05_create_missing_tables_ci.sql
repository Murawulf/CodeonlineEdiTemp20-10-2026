-- ==============================================================================
-- 🇨🇮 CRÉATION DES TABLES MANQUANTES — CÔTE D'IVOIRE
-- ==============================================================================
-- Script idempotent (CREATE TABLE IF NOT EXISTS) : sans risque sur tables existantes.
-- Tables vérifiées absentes dans Dev_Entitedb au 04/05/2026 :
--   orders, order_lines, order_line_deliveries, network_directory, offline_audit_logs
-- ==============================================================================

USE Dev_Entitedb;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. orders
-- =========
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
  total_line_amount DECIMAL(12,2),
  currency VARCHAR(3),
  monnaie VARCHAR(3),
  date_commande DATETIME,
  date_livraison DATETIME,
  date_livraison_demandee DATETIME,
  date_livraison_confirmee DATETIME,
  date_livraison_plus_tot DATETIME,
  date_livraison_plus_tard DATETIME,
  contract_reference VARCHAR(50),
  contract_date DATE,
  price_list_reference VARCHAR(50),
  buyer_vat_number VARCHAR(20),
  supplier_vat_number VARCHAR(20),
  payment_terms_code VARCHAR(10),
  payment_means VARCHAR(50),
  order_contact_name VARCHAR(100),
  order_contact_phone VARCHAR(20),
  order_contact_email VARCHAR(100),
  group_conditions_code VARCHAR(10),
  free_text TEXT,
  exchange_rate DECIMAL(10,6),
  exchange_rate_currency VARCHAR(3),
  exchange_rate_period_start DATE,
  exchange_rate_period_end DATE,
  tax_rate DECIMAL(5,2),
  package_count INT,
  package_type VARCHAR(10),
  package_marking_instructions TEXT,
  type VARCHAR(20) DEFAULT 'Envoyée',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_buyer (id_entite_buyer),
  INDEX idx_seller (id_entite_seller)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. order_lines
-- ==============
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
  line_tax_amount DECIMAL(12,2),
  line_tax_rate DECIMAL(5,2),
  line_package_count INT,
  line_package_type VARCHAR(10),
  price_qualifier VARCHAR(10),
  price_unit VARCHAR(10),
  buyer_product_code VARCHAR(50),
  supplier_product_code VARCHAR(50),
  product_description TEXT,
  confirmed_qty DECIMAL(10,3),
  confirmed_price DECIMAL(12,2),
  line_comment TEXT,
  FOREIGN KEY (id_order) REFERENCES orders(id_order) ON DELETE CASCADE,
  INDEX idx_order (id_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. order_line_deliveries
-- ========================
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

-- 4. network_directory
-- ====================
CREATE TABLE IF NOT EXISTS network_directory (
  gln VARCHAR(20) PRIMARY KEY,
  api_url TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gln (gln(20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. offline_audit_logs
-- =====================
CREATE TABLE IF NOT EXISTS offline_audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  transaction_id VARCHAR(36),
  sender_gln VARCHAR(20),
  receiver_gln VARCHAR(20),
  message_type VARCHAR(50),
  status VARCHAR(20),
  transport_mode VARCHAR(20) DEFAULT 'P2P',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error_reason TEXT,
  synced_to_hub TINYINT(1) DEFAULT 0,
  synced_at DATETIME,
  INDEX idx_transaction (transaction_id),
  INDEX idx_synced (synced_to_hub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Tables manquantes créées avec succès.' AS result;
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = 'Dev_Entitedb'
  AND table_name IN ('orders','order_lines','order_line_deliveries','network_directory','offline_audit_logs')
ORDER BY table_name;
