-- Purge P1 : données de test (refs TESTDES*/TESTAPK*/TESTUI*/TESTREG*/PROBE*)
-- Backup dans *_test_bak_p1 avant suppression. Idempotent.

CREATE TABLE IF NOT EXISTS edi_desadv_test_bak_p1 AS
  SELECT * FROM edi_desadv WHERE desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
CREATE TABLE IF NOT EXISTS edi_desadv_lines_test_bak_p1 AS
  SELECT l.* FROM edi_desadv_lines l JOIN edi_desadv d ON l.id_desadv = d.id
  WHERE d.desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
CREATE TABLE IF NOT EXISTS edi_packages_test_bak_p1 AS
  SELECT p.* FROM edi_packages p JOIN edi_desadv d ON p.id_desadv = d.id
  WHERE d.desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
CREATE TABLE IF NOT EXISTS edi_transmissions_test_bak_p1 AS
  SELECT * FROM edi_transmissions
  WHERE filename REGEXP '(TESTDES|TESTAPK|TESTUI|TESTREG|PROBE|test_desadv|test_aperak|APERAK_UNKNOWN)'
     OR file_content REGEXP 'BGM\\+(220|351)\\+(TESTDES|TESTAPK|TESTUI|TESTREG)';
CREATE TABLE IF NOT EXISTS edi_orders_test_bak_p1 AS
  SELECT * FROM edi_orders WHERE document_number REGEXP '^TESTREG';

DELETE l FROM edi_desadv_lines l JOIN edi_desadv d ON l.id_desadv = d.id
  WHERE d.desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
DELETE p FROM edi_packages p JOIN edi_desadv d ON p.id_desadv = d.id
  WHERE d.desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
DELETE FROM edi_desadv WHERE desadv_number REGEXP '^(TESTDES|TESTAPK|TESTUI)';
DELETE FROM edi_transmissions
  WHERE filename REGEXP '(TESTDES|TESTAPK|TESTUI|TESTREG|PROBE|test_desadv|test_aperak|APERAK_UNKNOWN)'
     OR file_content REGEXP 'BGM\\+(220|351)\\+(TESTDES|TESTAPK|TESTUI|TESTREG)';
DELETE FROM edi_orders WHERE document_number REGEXP '^TESTREG';

SELECT 'desadv_restant' AS what, COUNT(*) AS n FROM edi_desadv WHERE desadv_number LIKE 'TEST%'
UNION ALL SELECT 'transmissions_test_restant', COUNT(*) FROM edi_transmissions WHERE filename LIKE '%TEST%'
UNION ALL SELECT 'orders_test_restant', COUNT(*) FROM edi_orders WHERE document_number LIKE 'TEST%';
