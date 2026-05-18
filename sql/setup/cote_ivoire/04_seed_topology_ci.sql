-- ==============================================================================
-- 🇨🇮 ÉTAPE 4 — IDENTITÉ + TOPOLOGIE RÉSEAU (NETWORK_TOPOLOGY)
-- ==============================================================================
-- À exécuter UNE SEULE FOIS sur la base de données du serveur Côte d'Ivoire.
-- Adapte la table `app_parameters` pour :
--   1. Définir l'identité de ce serveur (CURRENT_INSTANCE_CODE = 'cote_ivoire')
--   2. Mettre à jour la topologie réseau partagée (Tunisie + Sénégal + CI)
--
-- ⚠️  Avant exécution, remplacer le placeholder :
--   __API_PUBLIC_URL_CI__   (ex: https://dev.codeonline-edi.ci)
--
-- Idempotent : utilise INSERT … ON DUPLICATE KEY UPDATE.
-- ==============================================================================

-- 1) Identité de l'instance courante
INSERT INTO `app_parameters` (param_key, param_value, param_type, description, is_public)
VALUES ('CURRENT_INSTANCE_CODE', 'cote_ivoire', 'string', 'Identifiant unique du serveur courant', 1)
ON DUPLICATE KEY UPDATE
  param_value = VALUES(param_value),
  param_type  = VALUES(param_type),
  description = VALUES(description),
  is_public   = VALUES(is_public);

-- 2) Topologie réseau (Tunisie + Sénégal + Côte d'Ivoire)
INSERT INTO `app_parameters` (param_key, param_value, param_type, description, is_public)
VALUES ('NETWORK_TOPOLOGY',
'{
  "tunisia": {
    "name": "Tunisie",
    "apiUrl": "https://edi-dev.codeonline-info.com",
    "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive",
    "countryCode": "TUN",
    "country": "Tunisie"
  },
  "senegal": {
    "name": "Sénégal",
    "apiUrl": "https://dev.codeonline-edi.net",
    "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive",
    "countryCode": "SEN",
    "country": "Senegal"
  },
  "cote_ivoire": {
    "name": "Côte d''Ivoire",
    "apiUrl": "__API_PUBLIC_URL_CI__",
    "ediUrl": "__API_PUBLIC_URL_CI__/api/edi/receive",
    "countryCode": "CIV",
    "country": "Côte d''Ivoire"
  }
}',
'json', 'Topologie réseau globale (routage EDI inter-pays)', 1)
ON DUPLICATE KEY UPDATE
  param_value = VALUES(param_value),
  param_type  = VALUES(param_type),
  description = VALUES(description),
  is_public   = VALUES(is_public);

-- 3) URL locale de l'API (utilisée par le backend pour s'auto-référencer)
INSERT INTO `app_parameters` (param_key, param_value, param_type, description, is_public)
VALUES ('LOCAL_API_URL', '__API_PUBLIC_URL_CI__', 'string', 'URL publique de cette instance', 1)
ON DUPLICATE KEY UPDATE param_value = VALUES(param_value);

SELECT '✅ Identité + Topologie Côte d''Ivoire configurées' AS status;
