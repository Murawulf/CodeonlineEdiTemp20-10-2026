<?php
/**
 * sync_registry.php — Déclencheur d'ingestion produit -> Hub PAESN, via URL sécurisée.
 *
 * À déposer dans le WEBROOT de codeonline-fp (/var/www/codeonline-fp/).
 * Appel : https://<domaine-fp>/sync_registry.php?key=<SECURITY_CODE>
 *
 * Lit la base produits locale (fiche_produit, via la config CodeIgniter) et
 * pousse le catalogue (upsert) vers le Hub. Idempotent.
 *
 * ⚠️ Un fichier PAR PAYS : ne change que COUNTRY_CODE (+ HUB/clé selon env).
 *    Ne pas committer ce fichier avec de vraies clés dans un dépôt public.
 */

// ============================ CONFIG (à régler par pays) ====================
const SECURITY_CODE = 'SYNC-2026-CHANGEME';                 // code attendu dans ?key=
const COUNTRY_CODE  = '384';                                // 384=CIV / 788=TUN / 686=SEN
const HUB_URL       = 'http://217.182.94.86:5010';          // Hub (DEV). PROD: Hetzner
const REGISTRY_KEY  = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';
const BATCH         = 200;
// ===========================================================================

header('Content-Type: application/json; charset=utf-8');

// --- Auth ---
if (!isset($_GET['key']) || !hash_equals(SECURITY_CODE, (string)$_GET['key'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden (bad key)']);
    exit;
}

// --- Creds DB locale : depuis la config CodeIgniter (groupe dbEntite) ---
$cfgFile = __DIR__ . '/application/config/database.php';
if (!is_file($cfgFile)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'database.php introuvable']);
    exit;
}
if (!defined('BASEPATH')) define('BASEPATH', true);
if (!defined('ENVIRONMENT')) define('ENVIRONMENT', 'production'); // requis par database.php
$db = [];
$active_group = 'default';
$query_builder = true;
require $cfgFile;                         // peuple $db
$c = $db['dbEntite'] ?? ($db['default'] ?? null);
if (!$c) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'config DB absente']);
    exit;
}

// --- Connexion ---
mysqli_report(MYSQLI_REPORT_OFF);
$link = @mysqli_connect($c['hostname'], $c['username'], $c['password'], $c['database']);
if (!$link) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'connexion DB échouée']);
    exit;
}
mysqli_set_charset($link, 'utf8mb4');

// --- Requête catalogue (briques/pays optionnels via sous-requêtes ; Entite requis) ---
$sql = "
  SELECT
    fp.gtin,
    fp.brand,
    fp.subBrand        AS sub_brand,
    fp.libelle         AS product_name,
    fp.short_libelle   AS short_name,
    fp.images,
    (SELECT p.libelle FROM pays p WHERE p.isoNumeric = fp.countryOfOrigin LIMIT 1)        AS country_origin,
    fp.codebrique      AS brick_code,
    (SELECT b.libelleBrique    FROM brickgpc b WHERE b.codeBrique = fp.codebrique LIMIT 1) AS brick_fr,
    (SELECT b.libelleBrique_ar FROM brickgpc b WHERE b.codeBrique = fp.codebrique LIMIT 1) AS brick_ar,
    (SELECT b.libelleBrique_en FROM brickgpc b WHERE b.codeBrique = fp.codebrique LIMIT 1) AS brick_en,
    fp.prix_min, fp.prix_max,
    fp.code_cader,
    Entite.raison_socialle AS company_name,
    Entite.gln             AS source_gln,
    Entite.adresse, Entite.telephone, Entite.email, Entite.site,
    fp.status
  FROM fiche_produit fp
  JOIN Entite ON Entite.id_entite = fp.idEntreprise
  WHERE fp.status = 2
";
$res = mysqli_query($link, $sql);
if (!$res) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'requête échouée: ' . mysqli_error($link)]);
    exit;
}
$rows = [];
while ($r = mysqli_fetch_assoc($res)) { $rows[] = $r; }
mysqli_close($link);

// --- Fix images relatives -> URL absolues (host du node qui sert /images/) pour APK + cross-pays.
//     Base lue depuis la config CI par pays ($config['images_base_url']) SANS include (BASEPATH). ---
$IMG_BASE  = '';
$__cfgTxt  = is_file(__DIR__ . '/application/config/config.php') ? file_get_contents(__DIR__ . '/application/config/config.php') : '';
if (preg_match("/\\\$config\\['images_base_url'\\]\\s*=\\s*'([^']*)'/", $__cfgTxt, $__m)) {
    $IMG_BASE = rtrim($__m[1], '/');
}
// Hub registry + clé lus depuis la config par pays (fallback sur les constantes si non configuré).
$__hubUrl = preg_match("/\\\$config\\['registry_hub_url'\\]\\s*=\\s*'([^']*)'/", $__cfgTxt, $__u) ? rtrim($__u[1], '/') : HUB_URL;
$__hubKey = preg_match("/\\\$config\\['registry_hub_key'\\]\\s*=\\s*'([^']*)'/", $__cfgTxt, $__k) ? $__k[1] : REGISTRY_KEY;
define('SYNC_HUB_URL', $__hubUrl);
define('SYNC_HUB_KEY', $__hubKey);
$__cc = preg_match("/\\\$config\\['country_code'\\]\\s*=\\s*'([^']*)'/", $__cfgTxt, $__ccm) ? $__ccm[1] : COUNTRY_CODE;
define('SYNC_COUNTRY_CODE', $__cc);
if ($IMG_BASE !== '') {
    foreach ($rows as &$__r) {
        if (!empty($__r['images']) && strpos($__r['images'], '://') === false) {
            $__r['images'] = str_replace('/images/', $IMG_BASE . '/images/', $__r['images']);
        }
    }
    unset($__r);
}

// --- Push batch -> Hub ---
function hub_post(array $products): array {
    $payload = json_encode(['country_code' => SYNC_COUNTRY_CODE, 'products' => $products]);
    $ch = curl_init(SYNC_HUB_URL . '/api/registry/fp/sync');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-registry-key: ' . SYNC_HUB_KEY,
        ],
    ]);
    $out  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, json_decode($out, true)];
}

$total = count($rows);
$sent = 0; $upserted = 0; $failed = 0; $http_err = 0;
for ($i = 0; $i < $total; $i += BATCH) {
    $slice = array_slice($rows, $i, BATCH);
    [$code, $resp] = hub_post($slice);
    if ($code === 200 && is_array($resp)) {
        $sent     += count($slice);
        $upserted += $resp['upserted'] ?? 0;
        $failed   += $resp['failed'] ?? 0;
    } else {
        $http_err += count($slice);
    }
}

echo json_encode([
    'success'      => $http_err === 0,
    'country_code' => SYNC_COUNTRY_CODE,
    'db'           => $c['database'],
    'total'        => $total,
    'sent'         => $sent,
    'upserted'     => $upserted,
    'failed'       => $failed,
    'http_errors'  => $http_err,
], JSON_PRETTY_PRINT);
