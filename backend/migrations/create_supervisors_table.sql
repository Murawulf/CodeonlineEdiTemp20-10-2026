-- Migration: Create supervisors table for supervisor profiles feature
-- This table tracks which entities have supervisor profiles created

CREATE TABLE IF NOT EXISTS supervisors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_entite INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_entite (id_entite),
  FOREIGN KEY (id_entite) REFERENCES Entite(id_entite) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for faster lookups
CREATE INDEX idx_id_entite ON supervisors(id_entite);
