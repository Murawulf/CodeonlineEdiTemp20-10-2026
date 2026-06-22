-- ============================================================================
-- PAESN Registry — Index produit cross-pays (product_index)
-- ----------------------------------------------------------------------------
-- Index central denormalisé des fiches produit de tous les pays.
-- Alimenté par push pays -> Hub via POST /api/registry/fp/sync.
-- Lu par GET /api/registry/fp?gtin= (fallback de l'API produits mobile).
-- DB cible : codeonline_edi_db
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_index (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  country_code   VARCHAR(3)  NOT NULL,          -- ISO 3166 num : 788 TUN / 686 SEN / 384 CIV
  source_gln     VARCHAR(13) NOT NULL,          -- GLN entreprise détentrice
  gtin           VARCHAR(14) NOT NULL,
  brand          VARCHAR(150),
  sub_brand      VARCHAR(150),
  product_name   VARCHAR(255),
  short_name     VARCHAR(255),
  images         TEXT,                            -- liste séparée par ';' (idem fiche_produit)
  country_origin VARCHAR(100),                     -- label pays d'origine (pays.libelle, résolu à l'ingestion)
  brick_code     VARCHAR(20),
  brick_fr       VARCHAR(255),
  brick_ar       VARCHAR(255),
  brick_en       VARCHAR(255),
  prix_min       DECIMAL(12,2),
  prix_max       DECIMAL(12,2),
  code_cader     VARCHAR(20),
  company_name   VARCHAR(255),
  adresse        VARCHAR(255),
  telephone      VARCHAR(50),
  email          VARCHAR(150),
  site           VARCHAR(150),
  status         TINYINT DEFAULT 2,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_country_gtin (country_code, gtin),
  KEY idx_gtin (gtin),
  KEY idx_brand (brand),
  KEY idx_brand_brick (brand, brick_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
