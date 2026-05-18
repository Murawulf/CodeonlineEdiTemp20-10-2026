-- Create audit_ledger table for Orchestrator
CREATE TABLE IF NOT EXISTS audit_ledger (
    id VARCHAR(36) PRIMARY KEY, -- UUID
    transaction_id VARCHAR(36) NOT NULL, -- UUID from sender
    sender_gln VARCHAR(20) NOT NULL,
    receiver_gln VARCHAR(20) NOT NULL,
    message_type VARCHAR(50), -- ORDERS, DESADV, INVOIC
    status VARCHAR(20) DEFAULT 'RECEIVED_BY_HUB', -- RECEIVED_BY_HUB, IN_QUEUE, DELIVERED, FAILED
    transport_mode VARCHAR(20) DEFAULT 'ORCHESTRATOR', -- ORCHESTRATOR, P2P
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at DATETIME,
    error_reason TEXT
);

-- Index for faster lookups (IF NOT EXISTS removed for MySQL 5.7 compatibility)
-- Note: These might fail if they already exist, which is acceptable in this migration script context
CREATE INDEX idx_audit_sender ON audit_ledger(sender_gln);
CREATE INDEX idx_audit_receiver ON audit_ledger(receiver_gln);
CREATE INDEX idx_audit_transaction ON audit_ledger(transaction_id);
