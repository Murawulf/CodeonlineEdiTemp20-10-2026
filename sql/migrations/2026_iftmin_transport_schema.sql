-- 2026_iftmin_transport_schema.sql
-- Schéma RÉEL de production (hub PAESN — DB codeonline_edi_db_prod) pour les ordres
-- de transport IFTMIN. Rapatrié le 2026-07-15 depuis `SHOW CREATE TABLE` prod.
-- Idempotent (CREATE TABLE IF NOT EXISTS). C'est CE fichier qui fait référence,
-- PAS les anciennes migrations staging (sql/migrations/_ARCHIVE/…, schéma incompatible).
-- Code associé : edi_orchestrator/controllers/TransportController.js
--                edi_orchestrator/services/TransportOrderModel.js
-- NB prod : la table edi_tracking n'existe PAS (le suivi est porté par status +
--           tracking_number de edi_transport_orders). Ne pas la recréer sans besoin.

CREATE TABLE IF NOT EXISTS `edi_transport_orders` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ref` varchar(64) NOT NULL,
  `order_ref` varchar(64) DEFAULT NULL,
  `desadv_ref` varchar(64) DEFAULT NULL,
  `carrier_code` varchar(32) NOT NULL,
  `country_code` varchar(3) NOT NULL,
  `requester_gln` varchar(13) DEFAULT NULL,
  `status` enum('CREATED','SENT_TO_CARRIER','ACCEPTED','IN_TRANSIT','DELIVERED','FAILED','CANCELLED') NOT NULL DEFAULT 'CREATED',
  `iftmin_content` mediumtext DEFAULT NULL,
  `tracking_number` varchar(64) DEFAULT NULL,
  `carrier_response` text DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ref` (`ref`),
  KEY `idx_eto_status` (`status`),
  KEY `idx_eto_carrier` (`carrier_code`),
  KEY `idx_eto_order` (`order_ref`),
  KEY `idx_eto_desadv` (`desadv_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
