-- =============================================================================
-- Migration : ajout des tables legacy précédemment hébergées dans users.db
-- (SQLite). Étape de la suppression complète des BDD SQLite côté backend.
-- Idempotente : CREATE TABLE IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id_user`             INT NOT NULL AUTO_INCREMENT,
  `email`               VARCHAR(255) NOT NULL,
  `name`                VARCHAR(255) NOT NULL,
  `password`            VARCHAR(255) NOT NULL,
  `raison_sociale`      VARCHAR(255) DEFAULT NULL,
  `nb_produits`         INT DEFAULT NULL,
  `contact_tel`         VARCHAR(64)  DEFAULT NULL,
  `adresse`             TEXT         DEFAULT NULL,
  `code_imei`           VARCHAR(64)  DEFAULT NULL,
  `idRole`              INT NOT NULL,
  `segment`             VARCHAR(255) DEFAULT NULL,
  `id_region`           INT DEFAULT NULL,
  `id_municipalite`     INT DEFAULT NULL,
  `id_marche`           INT DEFAULT NULL,
  `id_mg_ref`           INT DEFAULT NULL,
  `id_mg_ref_per`       INT DEFAULT NULL,
  `id_mg_ref_per2`      INT DEFAULT NULL,
  `id_mgp_ref`          INT DEFAULT NULL,
  `id_mgp_ref_per`      INT DEFAULT NULL,
  `id_mgp_ref_per2`     INT DEFAULT NULL,
  `stus`                INT DEFAULT 1,
  `date_mis_a_jour_u`   VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id_user`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `municipalite` (
  `id_municipalite`           INT NOT NULL AUTO_INCREMENT,
  `libelle_municipalite_fr`   VARCHAR(255) NOT NULL,
  `libelle_municipalite_ar`   VARCHAR(255) DEFAULT NULL,
  `id_region`                 INT DEFAULT NULL,
  PRIMARY KEY (`id_municipalite`),
  KEY `idx_municipalite_region` (`id_region`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `marche_ref` (
  `id_marche`           INT NOT NULL AUTO_INCREMENT,
  `libelle_marche_fr`   VARCHAR(255) NOT NULL,
  `libelle_marche_ar`   VARCHAR(255) DEFAULT NULL,
  `id_region`           INT DEFAULT NULL,
  PRIMARY KEY (`id_marche`),
  KEY `idx_marche_region` (`id_region`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `user_marche` (
  `id`     INT NOT NULL AUTO_INCREMENT,
  `user`   INT DEFAULT NULL,
  `marche` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_marche_user`   (`user`),
  KEY `idx_user_marche_marche` (`marche`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `autoris_profil_page` (
  `Id_profil`     INT NOT NULL,
  `Id_page`       INT NOT NULL,
  `Autorisation`  VARCHAR(255) NOT NULL,
  `code_octal`    INT NOT NULL,
  PRIMARY KEY (`Id_profil`,`Id_page`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT '✅ Migration legacy users tables : OK' AS status;
