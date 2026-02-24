-- =====================================================
-- UPDATE EXISTING TRANSPORT TABLES
-- Date: 2026-01-19
-- Description: Update existing edi_transport_orders and edi_tracking tables 
--              to match new requirements (add cost, timestamps, fix types).
-- =====================================================

USE Dev_Entitedb;

-- 0. Drop existing Foreign Keys to allow type changes and decoupling
-- We use a stored procedure to drop keys only if they exist (avoiding errors)
DROP PROCEDURE IF EXISTS DropFK;
DELIMITER $$
CREATE PROCEDURE DropFK (IN tableName VARCHAR(64), IN constraintName VARCHAR(64))
BEGIN
    IF EXISTS (
        SELECT * FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = tableName
        AND CONSTRAINT_NAME = constraintName
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        SET @query = CONCAT('ALTER TABLE ', tableName, ' DROP FOREIGN KEY ', constraintName);
        PREPARE stmt FROM @query;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL DropFK('edi_transport_orders', 'fk_ot_ship');
CALL DropFK('edi_transport_orders', 'fk_ot_order');
CALL DropFK('edi_tracking', 'fk_track_ship');

DROP PROCEDURE IF EXISTS DropFK;

-- 1. Update edi_transport_orders
-- Change status type, add cost, add timestamps
ALTER TABLE edi_transport_orders 
  MODIFY COLUMN status VARCHAR(20) DEFAULT 'PENDING' COMMENT 'PENDING, CONFIRMED, IN_TRANSIT, DELIVERED, CANCELLED',
  MODIFY COLUMN id_shipment VARCHAR(50) NULL COMMENT 'ID expédition (si disponible)',
  ADD COLUMN cost DECIMAL(10,2) COMMENT 'Coût transport (MOA+23)' AFTER driver,
  ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 2. Update edi_tracking
-- Change id_shipment to string to support various formats
ALTER TABLE edi_tracking
  MODIFY COLUMN id_shipment VARCHAR(50) NOT NULL COMMENT 'ID expédition ou transport_number',
  ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Verification
SELECT 'Tables updated' as status;
DESCRIBE edi_transport_orders;
DESCRIBE edi_tracking;
