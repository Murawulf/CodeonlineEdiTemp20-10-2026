-- Local Audit Log for Offline/P2P transactions
CREATE TABLE IF NOT EXISTS offline_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    transaction_id VARCHAR(36) NOT NULL,
    sender_gln VARCHAR(20) NOT NULL,
    receiver_gln VARCHAR(20) NOT NULL,
    message_type VARCHAR(50),
    status VARCHAR(20), -- SENT, DELIVERED, FAILED
    transport_mode VARCHAR(20) DEFAULT 'P2P',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME,
    error_reason TEXT,
    synced_to_hub BOOLEAN DEFAULT 0,
    synced_at DATETIME
);
