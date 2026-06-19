-- =====================================================
-- MIGRATION: EDI Tracking API — Mobile App Keys
-- Run once on the Hub Orchestrator DB (codeonline_edi_db)
-- =====================================================

-- Table to manage per-app API keys for the mobile tracking API
-- The master key (env TRACKING_API_KEY) is always valid regardless of this table.
CREATE TABLE IF NOT EXISTS tracking_api_keys (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  api_key    VARCHAR(128) NOT NULL UNIQUE,
  app_name   VARCHAR(100) NOT NULL,            -- e.g. "Codeonline Mobile Android", "iOS App"
  scope      ENUM('full', 'readonly') DEFAULT 'readonly',
  status     ENUM('ACTIVE', 'REVOKED') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,                    -- NULL = never expires
  notes      TEXT,
  INDEX idx_api_key (api_key),
  INDEX idx_status  (status)
);

-- ── Optional: indexes on `transactions` to speed up tracking queries ──────────
-- These are safe to run even if they already exist (IF NOT EXISTS syntax)

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS aperak_status ENUM('PENDING','ACK','NACK') NULL
  COMMENT 'ACK/NACK result from receiving node (set by AckController)';

-- Composite index for the most common tracking query pattern
CREATE INDEX IF NOT EXISTS idx_tracking_lookup
  ON transactions (sender_gln, receiver_gln, created_at);

CREATE INDEX IF NOT EXISTS idx_tracking_status_date
  ON transactions (status, created_at);

-- ── Seed: example mobile app key (change before production!) ─────────────────
INSERT IGNORE INTO tracking_api_keys (api_key, app_name, scope, status, notes)
VALUES
  ('TRK-EDI-2026-CODEONLINE-MOBILE', 'Codeonline Mobile App', 'readonly', 'ACTIVE', 'Default key — replace in production');
