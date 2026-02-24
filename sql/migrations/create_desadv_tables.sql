-- DESADV Header Table
CREATE TABLE IF NOT EXISTS edi_desadv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  desadv_number VARCHAR(35) NOT NULL,
  original_order_number VARCHAR(35),
  id_order INT, -- Internal link to orders table
  buyer_gln VARCHAR(13),
  seller_gln VARCHAR(13),
  delivery_gln VARCHAR(13),
  shipping_date DATETIME,
  delivery_date DATETIME,
  total_packages INT DEFAULT 0,
  total_weight DECIMAL(10,3),
  status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, GENERATED, SENT, RECEIVED, PROCESSED
  direction VARCHAR(10) DEFAULT 'OUTBOUND', -- OUTBOUND, INBOUND
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Handling Units / Packages (SSCC)
CREATE TABLE IF NOT EXISTS edi_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desadv INT NOT NULL,
  sscc VARCHAR(18) NOT NULL,
  package_type VARCHAR(3) DEFAULT 'CT', -- CT = Carton, PX = Palette
  weight DECIMAL(10,3),
  tracking_number VARCHAR(50),
  parent_sscc VARCHAR(18), -- For nested packaging (e.g. carton on pallet)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DESADV Lines (Items within packages)
CREATE TABLE IF NOT EXISTS edi_desadv_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_desadv INT NOT NULL,
  id_package INT, -- Link to specific package/SSCC
  id_order_line INT, -- Link to original order line
  line_number INT,
  gtin VARCHAR(14),
  supplier_item_code VARCHAR(35),
  libelle VARCHAR(255),
  qty_dispatched DECIMAL(10,3),
  qty_ordered DECIMAL(10,3),
  batch_number VARCHAR(35),
  expiry_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
