-- ==============================================================================
-- 🇨🇮 ÉTAPE 3 — INSERTION DU PAYS « CÔTE D'IVOIRE » DANS LA TABLE `pays`
-- ==============================================================================
-- Le dump Dev_Entitedb.sql contient déjà la liste mondiale des pays. Ce script
-- garantit que la ligne Côte d'Ivoire est présente, peu importe l'historique.
-- Idempotent : peut être ré-exécuté sans dommage.
-- ==============================================================================

INSERT INTO `pays` (`currencyCode`, `currencyName`, `currencySymbol`, `flag`,
                    `isoAlpha2`, `isoAlpha3`, `isoNumeric`, `libelle`)
VALUES ('XOF', 'CFA Franc BCEAO', 'CFA', 'CI.png',
        'CI', 'CIV', '384', 'Côte d''Ivoire')
ON DUPLICATE KEY UPDATE
  currencyCode   = VALUES(currencyCode),
  currencyName   = VALUES(currencyName),
  currencySymbol = VALUES(currencySymbol),
  flag           = VALUES(flag),
  libelle        = VALUES(libelle);

-- Pour les anciens schémas où isoAlpha3 n'est pas une clé unique, fallback :
UPDATE `pays`
   SET currencyCode = 'XOF',
       currencyName = 'CFA Franc BCEAO',
       currencySymbol = 'CFA',
       flag = 'CI.png',
       libelle = 'Côte d''Ivoire'
 WHERE isoAlpha3 = 'CIV';

SELECT '✅ Pays Côte d''Ivoire inséré / mis à jour' AS status;
