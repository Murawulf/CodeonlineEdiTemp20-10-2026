-- =====================================================
-- CORRECTIF URGENT : Configuration Serveur SÉNÉGAL
-- =====================================================
-- À exécuter sur la base de données du serveur Sénégal
-- pour corriger l'affichage du drapeau et les erreurs 404

-- 1. Vérifier la configuration actuelle
SELECT 
    param_key,
    LEFT(param_value, 100) as param_value,
    CASE 
        WHEN param_key = 'CURRENT_INSTANCE_CODE' AND param_value = 'SEN' THEN '✅ OK'
        WHEN param_key = 'CURRENT_INSTANCE_CODE' THEN '❌ INCORRECT (doit être SEN)'
        WHEN param_key = 'LOCAL_API_URL' AND param_value = 'https://dev.codeonline-edi.net' THEN '✅ OK'
        WHEN param_key = 'LOCAL_API_URL' THEN '❌ INCORRECT'
        ELSE '?'
    END as status
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- 2. CORRIGER CURRENT_INSTANCE_CODE (Sénégal)
UPDATE app_parameters 
SET param_value = 'SEN' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 3. CORRIGER LOCAL_API_URL (Sénégal)
UPDATE app_parameters 
SET param_value = 'https://dev.codeonline-edi.net' 
WHERE param_key = 'LOCAL_API_URL';

-- 4. Vérifier que NETWORK_TOPOLOGY contient bien les deux serveurs
SELECT 
    param_key,
    param_value,
    CASE 
        WHEN param_value LIKE '%tunisia%' AND param_value LIKE '%senegal%' THEN '✅ OK'
        ELSE '❌ Topologie incomplète'
    END as status
FROM app_parameters 
WHERE param_key = 'NETWORK_TOPOLOGY';

-- 5. Vérification finale
SELECT 
    param_key,
    LEFT(param_value, 100) as param_value
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- =====================================================
-- APRÈS AVOIR EXÉCUTÉ CE SCRIPT :
-- 1. Redémarrer PM2 : pm2 restart codeonline-edi-senegal
-- 2. Vider le cache du navigateur (Ctrl+Shift+R)
-- =====================================================
