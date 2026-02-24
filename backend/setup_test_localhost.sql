-- =====================================================
-- Configuration EDI pour TESTS LOCALHOST
-- =====================================================
-- À exécuter sur la BDD de développement
-- Host: 91.134.35.126 (ou votre BDD locale)
-- =====================================================

-- 1. Configuration pour simuler un environnement de test
-- Note: Adapter CURRENT_INSTANCE_CODE selon votre besoin (TUN ou SEN)

UPDATE app_parameters 
SET param_value = 'SEN' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

UPDATE app_parameters 
SET param_value = 'http://localhost:5001' 
WHERE param_key = 'LOCAL_API_URL';

-- 1.1 Configurer EDI_ORDERS_PATH pour localhost (Mac)
-- Utiliser un chemin relatif ou absolu accessible sans sudo
UPDATE app_parameters 
SET param_value = './edi_orders' 
WHERE param_key = 'EDI_ORDERS_PATH';

UPDATE app_parameters 
SET param_value = '{
  "TUN": {
    "name": "Tunisie",
    "country": "Tunisie",
    "countryCode": "TUN",
    "apiUrl": "http://localhost:5001",
    "ediUrl": "http://localhost:5001/api/edi/receive"
  },
  "SEN": {
    "name": "Sénégal",
    "country": "Sénégal",
    "countryCode": "SEN",
    "apiUrl": "http://localhost:5001",
    "ediUrl": "http://localhost:5001/api/edi/receive"
  }
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';

-- 2. Vérifier les entités de test existantes
SELECT '=== ENTITÉS TUNISIENNES ===' as section;
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Tunis%'
ORDER BY id_entite
LIMIT 5;

SELECT '=== ENTITÉS SÉNÉGALAISES ===' as section;
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Sénégal%' OR pays LIKE '%Senegal%'
ORDER BY id_entite
LIMIT 5;

-- 3. Créer des entités de test si nécessaire
-- DÉCOMMENTER ET ADAPTER SI BESOIN

/*
-- Entité Acheteur Tunisie
INSERT INTO Entite (raison_socialle, gln, pays, adresse, ville, code_postal, telephone, email)
VALUES ('Test Acheteur Tunisie', '6141411000001', 'Tunisie', 'Rue Test', 'Tunis', '1000', '+216 12345678', 'acheteur.tn@test.com');

-- Entité Fournisseur Tunisie
INSERT INTO Entite (raison_socialle, gln, pays, adresse, ville, code_postal, telephone, email)
VALUES ('Test Fournisseur Tunisie', '6141411000002', 'Tunisie', 'Avenue Test', 'Tunis', '1000', '+216 87654321', 'fournisseur.tn@test.com');

-- Entité Fournisseur Sénégal
INSERT INTO Entite (raison_socialle, gln, pays, adresse, ville, code_postal, telephone, email)
VALUES ('Test Fournisseur Sénégal', '6141412000001', 'Sénégal', 'Boulevard Test', 'Dakar', '10000', '+221 12345678', 'fournisseur.sn@test.com');

-- Créer des comptes utilisateurs pour ces entités
INSERT INTO comptes (username, password, email, id_entite, role, is_suspended)
VALUES 
  ('test_acheteur_tn', '$2b$10$abcdefghijklmnopqrstuvwxyz123456', 'acheteur.tn@test.com', LAST_INSERT_ID()-2, 'user', 0),
  ('test_fournisseur_tn', '$2b$10$abcdefghijklmnopqrstuvwxyz123456', 'fournisseur.tn@test.com', LAST_INSERT_ID()-1, 'user', 0),
  ('test_fournisseur_sn', '$2b$10$abcdefghijklmnopqrstuvwxyz123456', 'fournisseur.sn@test.com', LAST_INSERT_ID(), 'user', 0);

-- Créer des produits de test
INSERT INTO produits (id_entite, libelle, gtin, prix_unitaire, unite_mesure, description)
VALUES 
  (LAST_INSERT_ID()-1, 'Produit Test TN', '6141411234567', 25.50, 'PCE', 'Produit de test tunisien'),
  (LAST_INSERT_ID(), 'Produit Test SN', '6141412999999', 15.00, 'PCE', 'Produit de test sénégalais');
*/

-- 4. Vérification finale
SELECT '=== CONFIGURATION FINALE ===' as section;
SELECT param_key, 
       CASE 
         WHEN param_key = 'NETWORK_TOPOLOGY' THEN CONCAT(LEFT(param_value, 50), '...')
         ELSE param_value 
       END as param_value
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- =====================================================
-- FIN DE LA CONFIGURATION
-- =====================================================
