-- ==============================================================================
-- 🌱 DONNÉES D'INITIALISATION (SEED DATA)
-- Ce fichier est utilisé pour peupler une nouvelle base de données avec
-- des données fictives pour les tests et la configuration réseau initiale.
-- ==============================================================================

-- 1. Configuration Réseau (Topologie)
-- Les placeholders __INSTANCE_CODE__, __COUNTRY_NAME__, __API_PUBLIC_URL__ seront remplacés par le script de setup
INSERT INTO app_parameters (param_key, param_value, category, description, param_type, is_public) 
VALUES 
('CURRENT_INSTANCE_CODE', '__INSTANCE_CODE__', 'system', 'Code identifiant ce serveur', 'string', 1),
('NETWORK_TOPOLOGY', '{
  "tunisia":     { "name": "Tunisie",        "apiUrl": "https://edi-dev.codeonline-info.com", "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive" },
  "senegal":     { "name": "Sénégal",        "apiUrl": "https://dev.codeonline-edi.net",      "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive" },
  "cote_ivoire": { "name": "Côte d''Ivoire", "apiUrl": "https://dev.codeonline-edi.ci",       "ediUrl": "https://dev.codeonline-edi.ci/api/edi/receive" },
  "__INSTANCE_CODE__": { "name": "__COUNTRY_NAME__", "apiUrl": "__API_PUBLIC_URL__", "ediUrl": "__API_PUBLIC_URL__/api/edi/receive" }
}', 'system', 'Topologie réseau (générée automatiquement)', 'json', 1)
ON DUPLICATE KEY UPDATE param_value = VALUES(param_value);

-- 2. Fournisseurs Fictifs
INSERT INTO Entite (id_entite, raison_socialle, gln, email, type_entite, pays, city, adresse, region, date_create, pwd) VALUES
(1001, 'Fournisseur A (__COUNTRY_NAME__)', '6191001000001', 'contact@alpha.test', 'fournisseur', '__COUNTRY_NAME__', 'Ville A', '1 Rue du Test', 'Region A', NOW(), '123456'),
(1002, 'Fournisseur B (__COUNTRY_NAME__)', '6191002000002', 'contact@beta.test', 'fournisseur', '__COUNTRY_NAME__', 'Ville B', '2 Av. des Tests', 'Region B', NOW(), '123456'),
(1003, 'Fournisseur C (__COUNTRY_NAME__)', '6191003000003', 'contact@gamma.test', 'fournisseur', '__COUNTRY_NAME__', 'Ville C', '3 Bd de l''Exemple', 'Region C', NOW(), '123456')
ON DUPLICATE KEY UPDATE raison_socialle = VALUES(raison_socialle);

-- Liaison aux segments (Segment 47000000: Produits d'Entretien/Nettoyage - valeur par défaut)
INSERT INTO Entite_segment (id_entite, id_segment) VALUES
(1001, '47000000'),
(1002, '47000000'),
(1003, '47000000')
ON DUPLICATE KEY UPDATE id_segment = VALUES(id_segment);

-- 3. Utilisateurs (1 par fournisseur, mot de passe '123456')
-- Hash: $2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa
-- Profile ID 13 = "Admin Entité" (Standard pour les admins fournisseurs)
INSERT INTO comptes (id_compte, email, name, password, role, profile_id, id_entite, is_suspended, created_at) VALUES
(101, 'user1@test.com', 'User Alpha', '$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 1001, 0, NOW()),
(102, 'user2@test.com', 'User Beta', '$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 1002, 0, NOW()),
(103, 'user3@test.com', 'User Gamma', '$2b$10$OBPOX0AGuOXWJ72dU3B9fOB8PhH9uneDhFlvam3/Xl7zB4nQXexKa', 'Admin', 13, 1003, 0, NOW())
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- 4. Produits (2 par fournisseur)
INSERT INTO fiche_produit (id, gtin, libelle, idEntreprise, prix_min, code_cader, status, date_create_fp, date_mis_a_jour_fp, tradeItemSynchronisationDates) VALUES
(2001, '6191001000010', 'Produit A1 (__COUNTRY_NAME__)', 1001, 100, 'Libre', 2, NOW(), NOW(), ''),
(2002, '6191001000020', 'Produit A2 (__COUNTRY_NAME__)', 1001, 200, 'Libre', 2, NOW(), NOW(), ''),
(2003, '6191002000010', 'Produit B1 (__COUNTRY_NAME__)', 1002, 150, 'Libre', 2, NOW(), NOW(), ''),
(2004, '6191002000020', 'Produit B2 (__COUNTRY_NAME__)', 1002, 250, 'Libre', 2, NOW(), NOW(), ''),
(2005, '6191003000010', 'Produit C1 (__COUNTRY_NAME__)', 1003, 300, 'Libre', 2, NOW(), NOW(), ''),
(2006, '6191003000020', 'Produit C2 (__COUNTRY_NAME__)', 1003, 400, 'Libre', 2, NOW(), NOW(), '')
ON DUPLICATE KEY UPDATE libelle = VALUES(libelle);
