CREATE TABLE IF NOT EXISTS app_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param_key VARCHAR(255) NOT NULL UNIQUE,
    param_value TEXT,
    param_type VARCHAR(50) DEFAULT 'string', -- string, number, boolean, json
    category VARCHAR(50) DEFAULT 'general',
    description TEXT,
    is_public BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults
INSERT OR IGNORE INTO app_parameters (param_key, param_value, param_type, is_public) VALUES 
('ORCHESTRATOR_URL', 'http://localhost:5005', 'string', 1),
('MY_GLN', '6191234567890', 'string', 1),
('ENABLE_P2P_WORKERS', 'true', 'boolean', 0);
