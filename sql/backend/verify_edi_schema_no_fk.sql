-- =====================================================
-- SCRIPT SIMPLIFIÉ SANS CLÉS ÉTRANGÈRES
-- =====================================================
-- Version pour utilisateurs MySQL avec privilèges limités
-- Les clés étrangères sont commentées pour éviter l'erreur #1142

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Tables Principales (Orders & Lines)
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
  unit_price DECIMAL(12,2),
  total_line_amount DECIMAL(12,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_order) REFERENCES orders(id_order) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index manuel pour remplacer la clé étrangère
CREATE INDEX idx_order_lines_id_order ON order_lines(id_order);

-- 2. EDI Transmissions
CREATE TABLE IF NOT EXISTS edi_transmissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_type VARCHAR(10),
  direction VARCHAR(10),
  sender_gln VARCHAR(13),
  receiver_gln VARCHAR(13),
  document_number VARCHAR(50),
  status VARCHAR(20) DEFAULT 'PENDING',
  edi_content TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Transport Orders
CREATE TABLE IF NOT EXISTS edi_transport_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transport_order_number VARCHAR(50),
  id_order INT,
  carrier_name VARCHAR(255),
  carrier_gln VARCHAR(13),
  transport_mode VARCHAR(50),
  vehicle_registration VARCHAR(50),
  driver_name VARCHAR(255),
  driver_phone VARCHAR(20),
  pickup_date DATETIME,
  delivery_date DATETIME,
  pickup_address TEXT,
  delivery_address TEXT,
  instructions TEXT,
  status VARCHAR(50) DEFAULT 'PLANNED',
  cost DECIMAL(12,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_transport_orders_id_order ON edi_transport_orders(id_order);

CREATE TABLE IF NOT EXISTS edi_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_transport_order INT,
  event_type VARCHAR(50),
  event_date DATETIME,
  location VARCHAR(255),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_transport_order) REFERENCES edi_transport_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tracking_id_transport_order ON edi_tracking(id_transport_order);

-- 4. DESADV (Despatch Advice)
CREATE TABLE IF NOT EXISTS edi_desadv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  desadv_number VARCHAR(35) NOT NULL,
  id_order INT,
  order_reference VARCHAR(35),
  buyer_gln VARCHAR(13),
  seller_gln VARCHAR(13),
  delivery_party_gln VARCHAR(13),
  despatch_date DATETIME,
  estimated_delivery_date DATETIME,
  total_packages INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT',
  direction VARCHAR(10) DEFAULT 'OUTBOUND',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_desadv_id_order ON edi_desadv(id_order);

CREATE TABLE IF NOT EXISTS edi_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desadv INT NOT NULL,
  sscc VARCHAR(18) NOT NULL,
  package_type VARCHAR(3) DEFAULT 'CT',
  weight DECIMAL(10,3),
  tracking_number VARCHAR(50),
  parent_sscc VARCHAR(18),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_desadv) REFERENCES edi_desadv(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_packages_id_desadv ON edi_packages(id_desadv);

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_desadv) REFERENCES edi_desadv(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_desadv_lines_id_desadv ON edi_desadv_lines(id_desadv);
CREATE INDEX idx_desadv_lines_id_package ON edi_desadv_lines(id_package);

-- 5. INVOIC (Invoice)
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

CREATE INDEX idx_invoic_id_order ON edi_invoic(id_order);

CREATE TABLE IF NOT EXISTS edi_invoic_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  line_number INT,
  gtin VARCHAR(14),
  libelle VARCHAR(255),
  qty DECIMAL(10,3),
  unit_price DECIMAL(12,2),
  line_amount DECIMAL(12,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(12,2),
  total_line_amount DECIMAL(12,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_invoic) REFERENCES edi_invoic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invoic_lines_id_invoic ON edi_invoic_lines(id_invoic);

CREATE TABLE IF NOT EXISTS edi_invoic_tax_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  tax_category VARCHAR(3),
  tax_rate DECIMAL(5,2),
  taxable_amount DECIMAL(12,2),
  tax_amount DECIMAL(12,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  -- FOREIGN KEY (id_invoic) REFERENCES edi_invoic(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invoic_tax_id_invoic ON edi_invoic_tax_summary(id_invoic);

-- 6. App Parameters
CREATE TABLE IF NOT EXISTS app_parameters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  param_key VARCHAR(100) NOT NULL UNIQUE,
  param_value TEXT NOT NULL,
  param_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  is_public TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_app_parameters_category ON app_parameters(category);
CREATE INDEX idx_app_parameters_is_public ON app_parameters(is_public);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Schema EDI cree avec succes (sans cles etrangeres)' AS result;
