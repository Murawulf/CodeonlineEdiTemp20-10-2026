-- Directory for the Orchestrator to resolve GLN -> URL
CREATE TABLE IF NOT EXISTS network_directory (
    gln VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    country_code VARCHAR(10),
    api_url VARCHAR(255),
    public_key TEXT, -- Optional: cache public key here
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed some initial data
INSERT IGNORE INTO network_directory (gln, name, country_code, api_url)
VALUES 
('SN02583102G3', 'SENEGAL HUB', 'SN', 'http://91.134.35.126:5001'),
('GLN_TEST_123', 'TEST NODE', 'TN', 'http://localhost:5001');
