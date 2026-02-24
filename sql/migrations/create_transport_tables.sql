-- =====================================================
-- CREATE TRANSPORT AND TRACKING TABLES
-- Date: 2026-01-19
-- Description: Create tables for managing transport orders and tracking events
--              referenced in server.js but missing from previous migrations.
-- =====================================================

USE Dev_Entitedb;

-- =====================================================
-- 1. EDI TRANSPORT ORDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS edi_transport_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transport_number VARCHAR(50) NOT NULL COMMENT 'Numéro ordre de transport',
  id_order INT COMMENT 'ID de la commande associée',
  id_shipment VARCHAR(50) COMMENT 'ID de l''expédition (si disponible)',
  transporteur VARCHAR(255) COMMENT 'Nom ou GLN du transporteur',
  vehicule VARCHAR(100) COMMENT 'Immatriculation ou ID véhicule',
  driver VARCHAR(100) COMMENT 'Nom du chauffeur',
  cost DECIMAL(10,2) COMMENT 'Coût transport (MOA+23)',
  status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING, CONFIRMED, IN_TRANSIT, DELIVERED, CANCELLED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_order (id_order),
  INDEX idx_transport_number (transport_number),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. EDI TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS edi_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_shipment VARCHAR(50) NOT NULL COMMENT 'ID expédition ou transport_number',
  event_code VARCHAR(10) COMMENT 'Code événement (ex: 24=Depart, 14=Arrivee)',
  event_label VARCHAR(100) COMMENT 'Libellé événement',
  event_datetime DATETIME COMMENT 'Date/heure événement',
  location VARCHAR(255) COMMENT 'Lieu de l''événement',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_shipment (id_shipment),
  INDEX idx_event_code (event_code),
  INDEX idx_datetime (event_datetime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Verification
-- =====================================================
SELECT 'Tables created' as status;
DESCRIBE edi_transport_orders;
DESCRIBE edi_tracking;
