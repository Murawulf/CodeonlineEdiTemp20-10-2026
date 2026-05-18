-- ============================================================================
-- FIX MISSING TABLES & COLUMNS - Run on both Tunisia and Senegal DBs
-- ============================================================================

-- 1. offline_audit_logs (used by AuditLogger for P2P offline sync)
CREATE TABLE IF NOT EXISTS offline_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    transaction_id VARCHAR(36),
    sender_gln VARCHAR(20),
    receiver_gln VARCHAR(20),
    message_type VARCHAR(20),
    status VARCHAR(20),
    transport_mode VARCHAR(20) DEFAULT 'P2P',
    error_reason TEXT,
    synced_to_hub TINYINT DEFAULT 0,
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. audit_ledger (used by OrchestratorController in backend)
CREATE TABLE IF NOT EXISTS audit_ledger (
    id VARCHAR(36) PRIMARY KEY,
    transaction_id VARCHAR(36),
    sender_gln VARCHAR(20),
    receiver_gln VARCHAR(20),
    message_type VARCHAR(20),
    document_ref VARCHAR(100),
    status VARCHAR(20) DEFAULT 'PENDING',
    error_message TEXT,
    transport_mode VARCHAR(20),
    hub_transaction_ref VARCHAR(36),
    payload_size INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. transactions (used by edi_orchestrator HubController)
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_ref VARCHAR(100) UNIQUE,
    sender_gln VARCHAR(20),
    receiver_gln VARCHAR(20),
    document_type VARCHAR(20),
    status VARCHAR(20) DEFAULT 'PENDING',
    error_message TEXT,
    payload_size INT DEFAULT 0,
    transport_mode VARCHAR(20) DEFAULT 'ORCHESTRATOR',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. partners (used by edi_orchestrator routing)
CREATE TABLE IF NOT EXISTS partners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    gln VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    country_code VARCHAR(10),
    target_url VARCHAR(255),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Ensure network_directory has public_key column
-- (already exists on both servers, but be safe)
-- ALTER TABLE network_directory ADD COLUMN IF NOT EXISTS public_key TEXT;
-- Note: MySQL < 8.0.19 doesn't support IF NOT EXISTS for ADD COLUMN, so skip if it exists

-- 6. Seed partners table with known nodes (if empty)
INSERT IGNORE INTO partners (gln, name, country_code, target_url, status) VALUES
    ('6191234567890', 'Tunisie Hub', '788', 'https://edi-dev.codeonline-info.com/api/edi/receive', 'ACTIVE'),
    ('6191907700002', 'Tunisie Buyer', '788', 'https://edi-dev.codeonline-info.com/api/edi/receive', 'ACTIVE'),
    ('SN02583102G3', 'Senegal Hub', '686', 'https://dev.codeonline-edi.net/api/edi/receive', 'ACTIVE'),
    ('SN02583102G4', 'Senegal Supplier', '686', 'https://dev.codeonline-edi.net/api/edi/receive', 'ACTIVE');

-- 7. Ensure network_directory has entries for both nodes
INSERT IGNORE INTO network_directory (gln, name, country_code, api_url) VALUES
    ('6191234567890', 'Tunisie Hub', '788', 'https://edi-dev.codeonline-info.com'),
    ('6191907700002', 'Tunisie Buyer', '788', 'https://edi-dev.codeonline-info.com'),
    ('SN02583102G3', 'Senegal Hub', '686', 'https://dev.codeonline-edi.net'),
    ('SN02583102G4', 'Senegal Supplier', '686', 'https://dev.codeonline-edi.net');
