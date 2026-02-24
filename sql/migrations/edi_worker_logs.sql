-- =====================================================
-- EDI WORKER LOGS TABLE
-- Tracks all EDI worker activities with daily cleanup
-- Date: 2026-01-16
-- =====================================================

USE Dev_Entitedb;

-- Create worker logs table
CREATE TABLE IF NOT EXISTS edi_worker_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  log_type VARCHAR(20) NOT NULL COMMENT 'Type: CYCLE_START, CYCLE_END, TRANSMISSION, ERROR, INFO, WARNING',
  worker_type VARCHAR(20) NOT NULL COMMENT 'OUTBOUND, INBOUND, CLEANUP',
  transmission_id INT COMMENT 'Related transmission ID if applicable',
  level VARCHAR(10) DEFAULT 'INFO' COMMENT 'DEBUG, INFO, WARNING, ERROR',
  message TEXT NOT NULL COMMENT 'Log message',
  details JSON COMMENT 'Additional structured data (transmission info, errors, stats, etc.)',
  duration_ms INT COMMENT 'Duration in milliseconds for cycle/transmission processing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_created_at (created_at),
  INDEX idx_worker_type (worker_type),
  INDEX idx_log_type (log_type),
  INDEX idx_level (level),
  INDEX idx_transmission_id (transmission_id),
  INDEX idx_type_created (worker_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Detailed logs of EDI worker activities with automatic daily cleanup';

-- Create cleanup event (runs daily at 2 AM)
DROP EVENT IF EXISTS cleanup_edi_worker_logs;

DELIMITER $$
CREATE EVENT cleanup_edi_worker_logs
ON SCHEDULE EVERY 1 DAY
STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY + INTERVAL 2 HOUR)
DO BEGIN
  -- Delete logs older than 7 days
  DELETE FROM edi_worker_logs 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
  
  -- Log the cleanup action
  INSERT INTO edi_worker_logs (log_type, worker_type, level, message, details)
  VALUES (
    'INFO',
    'CLEANUP',
    'INFO',
    'Daily worker logs cleanup completed',
    JSON_OBJECT(
      'deleted_count', ROW_COUNT(),
      'retention_days', 7,
      'cleanup_time', NOW()
    )
  );
END$$
DELIMITER ;

-- Enable event scheduler if not already enabled
-- SET GLOBAL event_scheduler = ON;

-- Verification queries
SELECT 
  'edi_worker_logs table created' as status,
  COUNT(*) as row_count 
FROM edi_worker_logs;

SELECT 
  'Event scheduler status' as info,
  @@global.event_scheduler as status;

SELECT 
  EVENT_NAME,
  EVENT_DEFINITION,
  INTERVAL_VALUE,
  INTERVAL_FIELD,
  STATUS
FROM information_schema.EVENTS
WHERE EVENT_SCHEMA = 'Dev_Entitedb' 
  AND EVENT_NAME = 'cleanup_edi_worker_logs';

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
/*
DROP EVENT IF EXISTS cleanup_edi_worker_logs;
DROP TABLE IF EXISTS edi_worker_logs;
*/
