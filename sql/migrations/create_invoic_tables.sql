-- INVOIC Header Table
CREATE TABLE IF NOT EXISTS edi_invoic (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoic_number VARCHAR(35) NOT NULL,
  type_code VARCHAR(3) DEFAULT '380', -- 380 = Commercial Invoice
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
  status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, GENERATED, SENT, RECEIVED, PROCESSED, PAID, REJECTED
  direction VARCHAR(10) DEFAULT 'OUTBOUND', -- OUTBOUND, INBOUND
  id_order INT, -- Link to internal order
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- INVOIC Lines
CREATE TABLE IF NOT EXISTS edi_invoic_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  line_number INT,
  gtin VARCHAR(14),
  supplier_item_code VARCHAR(35),
  description VARCHAR(255),
  quantity DECIMAL(10,3),
  unit_price DECIMAL(12,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(12,2),
  line_amount DECIMAL(12,2), -- Quantity * Unit Price
  id_order_line INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tax Summary (VAT Breakdown)
CREATE TABLE IF NOT EXISTS edi_tax_summary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_invoic INT NOT NULL,
  tax_rate DECIMAL(5,2),
  tax_category VARCHAR(3), -- S = Standard, E = Exempt, etc.
  taxable_amount DECIMAL(12,2),
  tax_amount DECIMAL(12,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
