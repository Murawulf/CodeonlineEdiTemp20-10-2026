-- =====================================================
-- PHASE 1: EANCOM GS1 Standard Improvements
-- Database Migration Script
-- Date: 2026-01-13
-- =====================================================

USE EntiteDb;

-- =====================================================
-- 1. EDI TRANSMISSIONS TABLE
-- =====================================================
-- Table pour tracer toutes les transmissions EDI (ORDERS, INVOIC, ORDRSP, DESADV, etc.)

CREATE TABLE IF NOT EXISTS edi_transmissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  related_id INT COMMENT 'ID de l\'objet métier (ex: id_order, id_invoice) - NULL pour messages entrants non encore traités',
  related_type VARCHAR(50) COMMENT 'Type d\'objet (ORDER, INVOICE, DESADV, etc.)',
  document_type VARCHAR(20) NOT NULL COMMENT 'Type message EDI (ORDERS, INVOIC, ORDRSP, DESADV)',
  direction VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND' COMMENT 'INBOUND (reçu) ou OUTBOUND (envoyé)',
  partner_id INT COMMENT 'ID entité partenaire (destinataire si OUTBOUND, expéditeur si INBOUND)',
  partner_gln VARCHAR(13) COMMENT 'GLN du partenaire',
  filename VARCHAR(255) COMMENT 'Nom du fichier physique',
  file_path TEXT COMMENT 'Chemin complet du fichier sur le serveur',
  file_content MEDIUMTEXT COMMENT 'Contenu du fichier EANCOM',
  status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING, SENT, ERROR, ACKNOWLEDGED, RECEIVED, PROCESSED',
  transmission_date DATETIME COMMENT 'Date/heure d\'envoi/réception effectif',
  acknowledgment_date DATETIME COMMENT 'Date/heure de l\'accusé réception',
  processing_date DATETIME COMMENT 'Date/heure de traitement du message (pour INBOUND)',
  logs TEXT COMMENT 'Logs de transmission/traitement (succès, erreurs, etc.)',
  error_message TEXT COMMENT 'Message d\'erreur détaillé si échec',
  retry_count INT DEFAULT 0 COMMENT 'Nombre de tentatives de renvoi/traitement',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_related (related_id, related_type),
  INDEX idx_status (status),
  INDEX idx_direction (direction),
  INDEX idx_partner (partner_id),
  INDEX idx_document_type (document_type),
  INDEX idx_created (created_at),
  
  FOREIGN KEY (partner_id) REFERENCES Entite(id_entite) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Traçabilité des transmissions EDI entrantes et sortantes (ORDERS, INVOIC, ORDRSP, DESADV)';

-- =====================================================
-- 2. ORDERS TABLE - NEW FIELDS
-- =====================================================
-- NOTE: MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- If columns already exist, the script will show errors but continue
-- You can ignore "Duplicate column name" errors

-- Références contractuelles
ALTER TABLE orders ADD COLUMN contract_reference VARCHAR(50) 
  COMMENT 'Référence contrat (RFF+CT)' AFTER currency;
  
ALTER TABLE orders ADD COLUMN contract_date DATE 
  COMMENT 'Date du contrat' AFTER contract_reference;
  
ALTER TABLE orders ADD COLUMN price_list_reference VARCHAR(50) 
  COMMENT 'Référence liste de prix (RFF+PL)' AFTER contract_date;
  
ALTER TABLE orders ADD COLUMN buyer_vat_number VARCHAR(20) 
  COMMENT 'N° TVA acheteur (RFF+VA)' AFTER price_list_reference;
  
ALTER TABLE orders ADD COLUMN supplier_vat_number VARCHAR(20) 
  COMMENT 'N° TVA fournisseur (RFF+VA)' AFTER buyer_vat_number;

-- Instructions paiement
ALTER TABLE orders ADD COLUMN payment_terms_code VARCHAR(10) 
  COMMENT 'Code conditions paiement (PAI: 42=virement, 10=espèces, 20=chèque)' AFTER supplier_vat_number;
  
ALTER TABLE orders ADD COLUMN payment_means VARCHAR(50) 
  COMMENT 'Moyen de paiement détaillé' AFTER payment_terms_code;

-- Contact
ALTER TABLE orders ADD COLUMN order_contact_name VARCHAR(100) 
  COMMENT 'Nom contact commande (CTA)' AFTER payment_means;
  
ALTER TABLE orders ADD COLUMN order_contact_phone VARCHAR(20) 
  COMMENT 'Téléphone contact (COM)' AFTER order_contact_name;
  
ALTER TABLE orders ADD COLUMN order_contact_email VARCHAR(100) 
  COMMENT 'Email contact (COM)' AFTER order_contact_phone;

-- NOTE: Transport fields removed - transport is managed in separate table edi_transport_orders
-- See /api/transport-orders endpoints for transport management

-- Conditions additionnelles
ALTER TABLE orders ADD COLUMN group_conditions_code VARCHAR(10) 
  COMMENT 'Code conditions groupe (ALI)' AFTER order_contact_email;
  
ALTER TABLE orders ADD COLUMN free_text TEXT 
  COMMENT 'Texte libre instructions (FTX)' AFTER group_conditions_code;

-- Taux de change
ALTER TABLE orders ADD COLUMN exchange_rate DECIMAL(10,6) 
  COMMENT 'Taux de change (CUX)' AFTER free_text;
  
ALTER TABLE orders ADD COLUMN exchange_rate_currency VARCHAR(3) 
  COMMENT 'Devise taux de change (ex: EUR, USD)' AFTER exchange_rate;
  
ALTER TABLE orders ADD COLUMN exchange_rate_period_start DATE 
  COMMENT 'Début période validité taux' AFTER exchange_rate_currency;
  
ALTER TABLE orders ADD COLUMN exchange_rate_period_end DATE 
  COMMENT 'Fin période validité taux' AFTER exchange_rate_period_start;

-- Totaux et taxes
ALTER TABLE orders ADD COLUMN total_line_amount DECIMAL(12,2) 
  COMMENT 'Montant total lignes HT (MOA+79)' AFTER exchange_rate_period_end;
  
ALTER TABLE orders ADD COLUMN total_tax_amount DECIMAL(12,2) 
  COMMENT 'Montant total TVA (MOA+176)' AFTER total_line_amount;
  
ALTER TABLE orders ADD COLUMN total_amount_with_tax DECIMAL(12,2) 
  COMMENT 'Montant total TTC (MOA+128)' AFTER total_tax_amount;
  
ALTER TABLE orders ADD COLUMN tax_rate DECIMAL(5,2) 
  COMMENT 'Taux TVA principal (%)' AFTER total_amount_with_tax;

-- Emballage
ALTER TABLE orders ADD COLUMN package_count INT 
  COMMENT 'Nombre total de colis (PAC)' AFTER tax_rate;
  
ALTER TABLE orders ADD COLUMN package_type VARCHAR(10) 
  COMMENT 'Type emballage (CS=carton, PAL=palette, BOX=boîte)' AFTER package_count;
  
ALTER TABLE orders ADD COLUMN package_marking_instructions TEXT 
  COMMENT 'Instructions marquage colis (PCI: 14=date expiration, etc.)' AFTER package_type;

-- =====================================================
-- 3. ORDER_LINES TABLE - NEW FIELDS
-- =====================================================

-- Identification produit
ALTER TABLE order_lines ADD COLUMN buyer_product_code VARCHAR(50) 
  COMMENT 'Code produit acheteur (PIA+IN)' AFTER price;
  
ALTER TABLE order_lines ADD COLUMN supplier_product_code VARCHAR(50) 
  COMMENT 'Code produit fournisseur (PIA+SA)' AFTER buyer_product_code;
  
ALTER TABLE order_lines ADD COLUMN product_description TEXT 
  COMMENT 'Description produit (IMD)' AFTER supplier_product_code;

-- Montants ligne
ALTER TABLE order_lines ADD COLUMN line_net_amount DECIMAL(12,2) 
  COMMENT 'Montant net ligne HT (MOA+203)' AFTER product_description;
  
ALTER TABLE order_lines ADD COLUMN line_tax_amount DECIMAL(12,2) 
  COMMENT 'Montant TVA ligne' AFTER line_net_amount;
  
ALTER TABLE order_lines ADD COLUMN line_tax_rate DECIMAL(5,2) 
  COMMENT 'Taux TVA ligne (%)' AFTER line_tax_amount;

-- Emballage ligne
ALTER TABLE order_lines ADD COLUMN line_package_count INT 
  COMMENT 'Nombre colis pour cette ligne (PAC)' AFTER line_tax_rate;
  
ALTER TABLE order_lines ADD COLUMN line_package_type VARCHAR(10) 
  COMMENT 'Type emballage ligne (CS, PAL, BOX)' AFTER line_package_count;

-- Prix détaillé
ALTER TABLE order_lines ADD COLUMN price_qualifier VARCHAR(10) 
  COMMENT 'Type prix (AAA=net, AAB=brut, AAE=information)' AFTER line_package_type;
  
ALTER TABLE order_lines ADD COLUMN price_unit VARCHAR(10) 
  COMMENT 'Unité prix (KGM, PCE, LTR, MTR, etc.)' AFTER price_qualifier;

-- =====================================================
-- 4. ORDER_LINE_DELIVERIES TABLE
-- =====================================================
-- Pour gérer les livraisons multiples par ligne (LOC+7)

CREATE TABLE IF NOT EXISTS order_line_deliveries (
  id_delivery INT AUTO_INCREMENT PRIMARY KEY,
  id_line INT NOT NULL COMMENT 'Référence ligne de commande',
  delivery_location_gln VARCHAR(13) NOT NULL COMMENT 'GLN lieu livraison (LOC+7)',
  delivery_location_name VARCHAR(255) COMMENT 'Nom du lieu de livraison',
  delivery_qty INT NOT NULL COMMENT 'Quantité pour ce lieu (QTY+11)',
  delivery_date DATE COMMENT 'Date livraison demandée (DTM+2)',
  delivery_status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING, CONFIRMED, DELIVERED',
  notes TEXT COMMENT 'Notes spécifiques à cette livraison',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_line (id_line),
  INDEX idx_gln (delivery_location_gln),
  INDEX idx_date (delivery_date),
  INDEX idx_status (delivery_status),
  
  FOREIGN KEY (id_line) REFERENCES order_lines(id_line) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Livraisons multiples par ligne de commande (GS1 multi-delivery)';

-- =====================================================
-- 5. VERIFICATION SCRIPT
-- =====================================================

-- Vérifier que toutes les colonnes ont été ajoutées
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'EntiteDb'
  AND TABLE_NAME IN ('orders', 'order_lines', 'edi_transmissions', 'order_line_deliveries')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Compter les nouvelles colonnes ajoutées
SELECT 
  'orders' as table_name,
  COUNT(*) as new_columns_count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'EntiteDb'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN (
    'contract_reference', 'contract_date', 'price_list_reference', 
    'buyer_vat_number', 'supplier_vat_number', 'payment_terms_code',
    'payment_means', 'order_contact_name', 'order_contact_phone',
    'order_contact_email', 'group_conditions_code',
    'free_text', 'exchange_rate', 'exchange_rate_currency',
    'exchange_rate_period_start', 'exchange_rate_period_end',
    'total_line_amount', 'total_tax_amount', 'total_amount_with_tax',
    'tax_rate', 'package_count', 'package_type', 'package_marking_instructions'
  )
UNION ALL
SELECT 
  'order_lines' as table_name,
  COUNT(*) as new_columns_count
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'EntiteDb'
  AND TABLE_NAME = 'order_lines'
  AND COLUMN_NAME IN (
    'buyer_product_code', 'supplier_product_code', 'product_description',
    'line_net_amount', 'line_tax_amount', 'line_tax_rate',
    'line_package_count', 'line_package_type', 'price_qualifier', 'price_unit'
  );

-- =====================================================
-- 6. ROLLBACK SCRIPT (À utiliser en cas de problème)
-- =====================================================

/*
-- ATTENTION: N'exécuter ce script que si vous devez annuler la migration

-- Supprimer les nouvelles tables
DROP TABLE IF EXISTS order_line_deliveries;
DROP TABLE IF EXISTS edi_transmissions;

-- Supprimer les nouvelles colonnes de orders
ALTER TABLE orders 
  DROP COLUMN IF EXISTS contract_reference,
  DROP COLUMN IF EXISTS contract_date,
  DROP COLUMN IF EXISTS price_list_reference,
  DROP COLUMN IF EXISTS buyer_vat_number,
  DROP COLUMN IF EXISTS supplier_vat_number,
  DROP COLUMN IF EXISTS payment_terms_code,
  DROP COLUMN IF EXISTS payment_means,
  DROP COLUMN IF EXISTS order_contact_name,
  DROP COLUMN IF EXISTS order_contact_phone,
  DROP COLUMN IF EXISTS order_contact_email,
  DROP COLUMN IF EXISTS group_conditions_code,
  DROP COLUMN IF EXISTS free_text,
  DROP COLUMN IF EXISTS exchange_rate,
  DROP COLUMN IF EXISTS exchange_rate_currency,
  DROP COLUMN IF EXISTS exchange_rate_period_start,
  DROP COLUMN IF EXISTS exchange_rate_period_end,
  DROP COLUMN IF EXISTS total_line_amount,
  DROP COLUMN IF EXISTS total_tax_amount,
  DROP COLUMN IF EXISTS total_amount_with_tax,
  DROP COLUMN IF EXISTS tax_rate,
  DROP COLUMN IF EXISTS package_count,
  DROP COLUMN IF EXISTS package_type,
  DROP COLUMN IF EXISTS package_marking_instructions;

-- Supprimer les nouvelles colonnes de order_lines
ALTER TABLE order_lines
  DROP COLUMN IF EXISTS buyer_product_code,
  DROP COLUMN IF EXISTS supplier_product_code,
  DROP COLUMN IF EXISTS product_description,
  DROP COLUMN IF EXISTS line_net_amount,
  DROP COLUMN IF EXISTS line_tax_amount,
  DROP COLUMN IF EXISTS line_tax_rate,
  DROP COLUMN IF EXISTS line_package_count,
  DROP COLUMN IF EXISTS line_package_type,
  DROP COLUMN IF EXISTS price_qualifier,
  DROP COLUMN IF EXISTS price_unit;
*/

-- =====================================================
-- FIN DU SCRIPT DE MIGRATION PHASE 1
-- =====================================================
