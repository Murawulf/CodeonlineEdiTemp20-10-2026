-- =====================================================
-- Script de Vérification Rapide - Configuration EDI
-- =====================================================
-- À exécuter sur CHAQUE serveur pour vérifier la config
-- =====================================================

-- 1. Configuration Système
SELECT '=== CONFIGURATION SYSTÈME ===' as section;
SELECT 
    param_key,
    CASE 
        WHEN param_key = 'NETWORK_TOPOLOGY' THEN 
            CONCAT('JSON (', LENGTH(param_value), ' chars)')
        ELSE param_value 
    END as param_value,
    CASE 
        WHEN param_key = 'CURRENT_INSTANCE_CODE' AND param_value IN ('TUN', 'SEN') THEN '✅ OK'
        WHEN param_key = 'CURRENT_INSTANCE_CODE' THEN '❌ INCORRECT (doit être TUN ou SEN)'
        WHEN param_key = 'LOCAL_API_URL' AND param_value LIKE 'https://%' THEN '✅ OK'
        WHEN param_key = 'LOCAL_API_URL' THEN '⚠️  WARNING (devrait être https://)'
        WHEN param_key = 'NETWORK_TOPOLOGY' AND param_value LIKE '%TUN%' AND param_value LIKE '%SEN%' THEN '✅ OK'
        WHEN param_key = 'NETWORK_TOPOLOGY' THEN '❌ INCORRECT'
        ELSE '?'
    END as status
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- 2. Répartition des Entités par Pays
SELECT '=== RÉPARTITION DES ENTITÉS ===' as section;
SELECT 
    COALESCE(pays, '(NULL)') as pays,
    COUNT(*) as nb_entites,
    CASE 
        WHEN pays IS NULL OR pays = '' THEN '❌ À CORRIGER'
        WHEN pays LIKE '%Tunis%' THEN '✅ OK (Tunisie)'
        WHEN pays LIKE '%Sénégal%' OR pays LIKE '%Senegal%' THEN '✅ OK (Sénégal)'
        ELSE '⚠️  Vérifier'
    END as status
FROM Entite
GROUP BY pays
ORDER BY nb_entites DESC;

-- 3. Entités SANS pays (À CORRIGER)
SELECT '=== ENTITÉS SANS PAYS ===' as section;
SELECT id_entite, raison_socialle, gln, 
       COALESCE(pays, '(NULL)') as pays,
       '❌ À CORRIGER' as action
FROM Entite 
WHERE pays IS NULL OR pays = ''
LIMIT 10;

-- 4. Entités avec Comptes Utilisateurs
SELECT '=== ENTITÉS AVEC COMPTES ===' as section;
SELECT 
    e.pays,
    COUNT(DISTINCT e.id_entite) as nb_entites,
    COUNT(c.id_compte) as nb_comptes,
    CASE 
        WHEN COUNT(c.id_compte) > 0 THEN '✅ OK'
        ELSE '⚠️  Aucun compte'
    END as status
FROM Entite e
LEFT JOIN comptes c ON e.id_entite = c.id_entite AND c.is_suspended = 0
WHERE e.pays IS NOT NULL AND e.pays != ''
GROUP BY e.pays
ORDER BY e.pays;

-- 5. Dernières Transmissions EDI
SELECT '=== DERNIÈRES TRANSMISSIONS EDI ===' as section;
SELECT 
    id_transmission,
    document_type,
    direction,
    partner_gln,
    status,
    CASE 
        WHEN status = 'SENT' THEN '✅ OK'
        WHEN status = 'PENDING' THEN '⏳ En cours'
        WHEN status = 'ERROR' THEN '❌ Erreur'
        ELSE status
    END as status_display,
    created_at,
    SUBSTRING(COALESCE(error_message, 'N/A'), 1, 50) as error_preview
FROM edi_transmissions 
ORDER BY created_at DESC 
LIMIT 5;

-- 6. Dernières Notifications
SELECT '=== DERNIÈRES NOTIFICATIONS ===' as section;
SELECT 
    n.id_notification,
    n.type,
    e.raison_socialle,
    e.pays,
    n.created_at,
    '✅' as status
FROM notifications n
JOIN comptes c ON n.id_compte = c.id_compte
JOIN Entite e ON c.id_entite = e.id_entite
ORDER BY n.created_at DESC
LIMIT 5;

-- 7. Résumé Global
SELECT '=== RÉSUMÉ GLOBAL ===' as section;
SELECT 
    'Total Entités' as metric,
    COUNT(*) as value,
    CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END as status
FROM Entite
UNION ALL
SELECT 
    'Entités avec pays',
    COUNT(*),
    CASE WHEN COUNT(*) > 0 THEN '✅' ELSE '❌' END
FROM Entite
WHERE pays IS NOT NULL AND pays != ''
UNION ALL
SELECT 
    'Entités SANS pays',
    COUNT(*),
    CASE WHEN COUNT(*) = 0 THEN '✅' ELSE '❌ À CORRIGER' END
FROM Entite
WHERE pays IS NULL OR pays = ''
UNION ALL
SELECT 
    'Transmissions EDI (24h)',
    COUNT(*),
    CASE WHEN COUNT(*) >= 0 THEN '✅' ELSE '?' END
FROM edi_transmissions
WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
UNION ALL
SELECT 
    'Notifications (24h)',
    COUNT(*),
    CASE WHEN COUNT(*) >= 0 THEN '✅' ELSE '?' END
FROM notifications
WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- =====================================================
-- FIN DE LA VÉRIFICATION
-- =====================================================
