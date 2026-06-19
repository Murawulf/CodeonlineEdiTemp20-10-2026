-- =====================================================
-- MIGRATION: Order Tracking
-- Adds order_ref column to link all EDI steps of a
-- single purchase order, and a computed order_status.
-- Run once on codeonline_edi_db
-- =====================================================

-- 1. Add order_ref safely (idempotent — skip if column already exists)
DROP PROCEDURE IF EXISTS _add_order_ref;
DELIMITER $$
CREATE PROCEDURE _add_order_ref()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name   = 'transactions'
      AND column_name  = 'order_ref'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN order_ref VARCHAR(64) NULL DEFAULT NULL
      COMMENT 'Business order reference shared across all EDI steps of a PO';
  END IF;
END$$
DELIMITER ;
CALL _add_order_ref();
DROP PROCEDURE IF EXISTS _add_order_ref;

-- 2. Index for fast order lookups (safe — only if not already present)
DROP PROCEDURE IF EXISTS _add_order_idx;
DELIMITER $$
CREATE PROCEDURE _add_order_idx()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name   = 'transactions'
      AND index_name   = 'idx_order_ref'
  ) THEN
    ALTER TABLE transactions ADD INDEX idx_order_ref (order_ref);
  END IF;
END$$
DELIMITER ;
CALL _add_order_idx();
DROP PROCEDURE IF EXISTS _add_order_idx;

-- 3. View: order_tracking_summary
--    One row per order_ref showing all steps and computed lifecycle status
CREATE OR REPLACE VIEW order_tracking_summary AS
SELECT
  order_ref,
  MIN(sender_gln)                                         AS buyer_gln,
  -- Supplier is the one sending the response back
  MAX(CASE WHEN document_type = 'ORDRSP' THEN sender_gln
           WHEN document_type = 'DESADV' THEN sender_gln
           WHEN document_type = 'INVOIC' THEN sender_gln END) AS supplier_gln,
  MIN(created_at)                                         AS order_date,
  MAX(created_at)                                         AS last_activity,
  COUNT(*)                                                AS total_steps,
  -- Presence of each document type
  MAX(document_type = 'ORDERS')  = 1                      AS has_orders,
  MAX(document_type = 'ORDRSP')  = 1                      AS has_ordrsp,
  MAX(document_type = 'DESADV')  = 1                      AS has_desadv,
  MAX(document_type = 'RECADV')  = 1                      AS has_recadv,
  MAX(document_type = 'INVOIC')  = 1                      AS has_invoic,
  MAX(document_type = 'APERAK')  = 1                      AS has_aperak,
  -- Computed lifecycle status
  CASE
    WHEN MAX(document_type = 'APERAK') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'COMPLETED'
    WHEN MAX(document_type = 'INVOIC') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'INVOICED'
    WHEN MAX(document_type = 'RECADV') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'RECEIVED'
    WHEN MAX(document_type = 'DESADV') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'SHIPPED'
    WHEN MAX(document_type = 'ORDRSP') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'CONFIRMED'
    WHEN MAX(document_type = 'ORDERS') = 1 AND MAX(status = 'DELIVERED') = 1 THEN 'ORDERED'
    WHEN MAX(status = 'FAILED') = 1                                            THEN 'ERROR'
    ELSE 'IN_PROGRESS'
  END                                                     AS lifecycle_status,
  -- Any failed step?
  MAX(status = 'FAILED') = 1                              AS has_errors,
  SUM(status = 'FAILED')                                  AS failed_steps
FROM transactions
WHERE order_ref IS NOT NULL
GROUP BY order_ref;
