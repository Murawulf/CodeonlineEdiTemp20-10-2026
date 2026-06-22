'use strict';

/**
 * ingest_products.js — Ingestion catalogue produit d'un serveur pays → Hub (PAESN Registry).
 *
 * À exécuter SUR le serveur pays (accès localhost à la base produits).
 * Lit `fiche_produit` (status=2) jointe à Entite/pays/brickgpc et pousse par
 * lots vers POST {HUB_URL}/api/registry/fp/sync (en-tête x-registry-key).
 *
 * Dépendance : mysql2 (présent dans les node_modules du backend EDI du pays).
 * Lancer depuis un dossier qui contient mysql2 (ex. /var/www/Edi-dev/backend).
 *
 * Variables d'environnement :
 *   COUNTRY_CODE   ISO 3166 num du pays source (ex. 384 = CIV)
 *   FP_DB_HOST     défaut 127.0.0.1
 *   FP_DB_USER, FP_DB_PASSWORD, FP_DB_NAME   accès base produits (ex. Entitedb)
 *   HUB_URL        ex. http://217.182.94.86:5010
 *   REGISTRY_KEY   clé x-registry-key
 *   BATCH          taille de lot (défaut 200)
 *   DRY_RUN        "1" pour ne rien pousser (compte seulement)
 */

const http = require('http');
const { URL } = require('url');
const mysql = require('mysql2/promise');

const CFG = {
  countryCode: process.env.COUNTRY_CODE,
  dbHost: process.env.FP_DB_HOST || '127.0.0.1',
  dbUser: process.env.FP_DB_USER,
  dbPass: process.env.FP_DB_PASSWORD,
  dbName: process.env.FP_DB_NAME,
  hubUrl: process.env.HUB_URL,
  key: process.env.REGISTRY_KEY,
  batch: parseInt(process.env.BATCH || '200', 10),
  dryRun: process.env.DRY_RUN === '1',
};

// Index = on veut TOUS les produits publiés (status=2). La catégorie (brickgpc)
// et le pays d'origine sont OPTIONNELS : sous-requêtes LIMIT 1 (évitent les
// doublons de `pays` et n'excluent pas les produits sans brique GPC mappée).
// Seul Entite est requis (gln + raison sociale).
const QUERY = `
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
`;

function postBatch(products) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ country_code: CFG.countryCode, products });
    const u = new URL(`${CFG.hubUrl}/api/registry/fp/sync`);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-registry-key': CFG.key,
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode === 200) resolve(JSON.parse(data || '{}'));
          else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const [k, v] of Object.entries(CFG)) {
    if (v === undefined || v === null || v === '') {
      if (['countryCode', 'dbUser', 'dbPass', 'dbName', 'hubUrl', 'key'].includes(k)) {
        console.error(`❌ Config manquante : ${k}`);
        process.exit(1);
      }
    }
  }

  const conn = await mysql.createConnection({
    host: CFG.dbHost, user: CFG.dbUser, password: CFG.dbPass, database: CFG.dbName,
  });
  console.log(`[ingest] connecté ${CFG.dbHost}/${CFG.dbName}, pays=${CFG.countryCode}, dryRun=${CFG.dryRun}`);

  const [rows] = await conn.query(QUERY);
  console.log(`[ingest] ${rows.length} fiches (status=2) à indexer`);

  let pushed = 0, upserted = 0, failed = 0;
  for (let i = 0; i < rows.length; i += CFG.batch) {
    const slice = rows.slice(i, i + CFG.batch);
    if (CFG.dryRun) { pushed += slice.length; continue; }
    try {
      const r = await postBatch(slice);
      pushed += slice.length;
      upserted += r.upserted || 0;
      failed += r.failed || 0;
      console.log(`[ingest] lot ${i}-${i + slice.length} → upserted=${r.upserted} failed=${r.failed}`);
    } catch (e) {
      failed += slice.length;
      console.error(`[ingest] lot ${i} échec : ${e.message}`);
    }
  }

  await conn.end();
  console.log(`[ingest] TERMINÉ — envoyés=${pushed} upserted=${upserted} failed=${failed}`);
  process.exit(0);
})().catch((e) => { console.error('[ingest] erreur fatale :', e.message); process.exit(1); });
