-- ==============================================================================
-- 🇨🇮 ÉTAPE 6 (OPTIONNELLE) — DONNÉES DE TEST CÔTE D'IVOIRE
-- ==============================================================================
-- Crée 3 fournisseurs fictifs + 3 comptes admins (mot de passe: 123456) pour
-- vérifier rapidement le bon fonctionnement de l'instance CI.
-- ⚠️  À NE PAS exécuter en environnement de production réel.
--
-- Hash bcrypt du mot de passe '123456' :
--   $2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa
-- ==============================================================================

-- 1) Trois fournisseurs CI (préfixe GLN '619' commun à toutes les instances de test)
INSERT INTO `Entite` (id_entite, raison_socialle, gln, email, type_entite, pays, city, adresse, region, date_create, pwd) VALUES
(3001, 'Fournisseur Abidjan SA',  '6193001000001', 'contact@abidjan-sa.test',  'fournisseur', 'Côte d''Ivoire', 'Abidjan',     '01 BP Plateau',          'Lagunes',    NOW(), '123456'),
(3002, 'Fournisseur Yamoussoukro','6193002000002', 'contact@yamoussoukro.test','fournisseur', 'Côte d''Ivoire', 'Yamoussoukro','Av. Houphouet-Boigny',   'Lacs',       NOW(), '123456'),
(3003, 'Fournisseur Bouaké',      '6193003000003', 'contact@bouake.test',      'fournisseur', 'Côte d''Ivoire', 'Bouaké',      'Quartier Commerce',      'Vallée du Bandama', NOW(), '123456')
ON DUPLICATE KEY UPDATE raison_socialle = VALUES(raison_socialle), pays = VALUES(pays);

-- 2) Liaison aux segments GPC (47000000 = Produits d'Entretien/Nettoyage par défaut)
INSERT INTO `Entite_segment` (id_entite, id_segment) VALUES
(3001, '47000000'),
(3002, '47000000'),
(3003, '47000000')
ON DUPLICATE KEY UPDATE id_segment = VALUES(id_segment);

-- 3) Comptes admins (un par fournisseur, profile_id 13 = "Admin Entité")
INSERT INTO `comptes` (id_compte, email, name, password, role, profile_id, id_entite, is_suspended, created_at) VALUES
(301, 'admin1.ci@codeonline.test', 'Admin Abidjan',     '$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 3001, 0, NOW()),
(302, 'admin2.ci@codeonline.test', 'Admin Yamoussoukro','$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 3002, 0, NOW()),
(303, 'admin3.ci@codeonline.test', 'Admin Bouaké',      '$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 3003, 0, NOW())
ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name);

-- 4) Quelques fiches produits de test
INSERT INTO `fiche_produit` (id, gtin, libelle, idEntreprise, prix_min, code_cader, status, date_create_fp, date_mis_a_jour_fp, tradeItemSynchronisationDates) VALUES
(4001, '6193001000010', 'Détergent Multi-Usage 1L (CI)', 3001, 1500, 'Libre', 2, NOW(), NOW(), ''),
(4002, '6193001000020', 'Eau de Javel 1L (CI)',          3001, 800,  'Libre', 2, NOW(), NOW(), ''),
(4003, '6193002000010', 'Savon de Marseille 200g (CI)',  3002, 500,  'Libre', 2, NOW(), NOW(), ''),
(4004, '6193003000010', 'Lessive 5kg (CI)',              3003, 4500, 'Libre', 2, NOW(), NOW(), '')
ON DUPLICATE KEY UPDATE libelle = VALUES(libelle);

SELECT '✅ Données de test Côte d''Ivoire insérées (3 fournisseurs, 3 comptes, 4 produits)' AS status;
