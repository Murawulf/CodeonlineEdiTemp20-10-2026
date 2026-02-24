-- =====================================================
-- Configuration EDI pour SERVEUR TUNISIE
-- =====================================================
-- Host: 217.182.94.86
-- Database: Dev_Entitedb
-- User: Consultant
-- Instance: TUN
-- =====================================================

-- 1. Configuration CURRENT_INSTANCE_CODE
UPDATE app_parameters 
SET param_value = 'TUN' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 2. Configuration LOCAL_API_URL
UPDATE app_parameters 
SET param_value = 'https://edi-dev.codeonline-info.com' 
WHERE param_key = 'LOCAL_API_URL';

-- 3. Configuration NETWORK_TOPOLOGY
UPDATE app_parameters 
SET param_value = '{
  "TUN": {
    "name": "Tunisie",
    "country": "Tunisie",
    "countryCode": "TUN",
    "apiUrl": "https://edi-dev.codeonline-info.com",
    "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive"
  },
  "SEN": {
    "name": "Sénégal",
    "country": "Sénégal",
    "countryCode": "SEN",
    "apiUrl": "https://dev.codeonline-edi.net",
    "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive"
  }
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';

-- 4. Vérification de la configuration
SELECT 
    param_key,
    CASE 
        WHEN param_key = 'NETWORK_TOPOLOGY' THEN CONCAT(LEFT(param_value, 50), '...')
        ELSE param_value 
    END as param_value
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- 5. Vérifier les entités tunisiennes
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Tunis%'
ORDER BY id_entite;

-- 6. Corriger les entités sans pays (ADAPTER SELON VOS DONNÉES)
-- UPDATE Entite SET pays = 'Tunisie' WHERE id_entite IN (31, 33, 35);

-- 7. Vérifier les comptes utilisateurs
SELECT e.id_entite, e.raison_socialle, e.gln, e.pays,
       COUNT(c.id_compte) as nb_comptes
FROM Entite e
LEFT JOIN comptes c ON e.id_entite = c.id_entite AND c.is_suspended = 0
WHERE e.pays LIKE '%Tunis%'
GROUP BY e.id_entite, e.raison_socialle, e.gln, e.pays
ORDER BY e.id_entite;

-- 8. Statistiques
SELECT 
    'Total Entités' as metric,
    COUNT(*) as value
FROM Entite
UNION ALL
SELECT 
    'Entités Tunisie',
    COUNT(*)
FROM Entite
WHERE pays LIKE '%Tunis%'
UNION ALL
SELECT 
    'Entités Sénégal',
    COUNT(*)
FROM Entite
WHERE pays LIKE '%Sénégal%' OR pays LIKE '%Senegal%'
UNION ALL
SELECT 
    'Entités sans pays',
    COUNT(*)
FROM Entite
WHERE pays IS NULL OR pays = '';

-- =====================================================
-- FIN DE LA CONFIGURATION
-- =====================================================
