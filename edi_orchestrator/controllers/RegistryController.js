'use strict';

/**
 * RegistryController.js
 *
 * Service "registry_fp" — index produit cross-pays du PAESN Registry.
 *
 *   GET  /api/registry/fp?gtin=        Recherche d'une fiche produit par GTIN (toutes pays).
 *   POST /api/registry/fp/sync         Upsert batch (ingestion depuis un serveur pays).
 *
 * La réponse de la recherche est déjà à la "shape mobile" (mêmes clés que
 * l'API produits locale), pour que le proxy PHP la relaie sans transformation.
 */

const db = require('../config/db');

// Colonnes persistées de product_index (hors id / updated_at auto).
const COLS = [
  'country_code', 'source_gln', 'gtin', 'brand', 'sub_brand', 'product_name',
  'short_name', 'images', 'country_origin', 'brick_code', 'brick_fr', 'brick_ar',
  'brick_en', 'prix_min', 'prix_max', 'code_cader', 'company_name', 'adresse',
  'telephone', 'email', 'site', 'status',
];

// code_cader -> libellé arabe (réplique la logique de l'API locale).
function caderAr(code) {
  switch (code) {
    case 'Libre':        return 'حر';
    case 'Subventionne': return 'مدعم';
    case 'Encadre':      return 'مؤطر';
    default:             return '';
  }
}

// x-lang / ?lang -> clé de brique (fr | en | ar), défaut fr.
function resolveLang(req) {
  const raw = (req.headers['x-lang'] || req.query.lang || '').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('ar')) return 'ar';
  return 'fr';
}

// Ligne product_index -> fiche à la shape mobile.
function toMobileShape(row, lang) {
  const images = row.images ? String(row.images).split(';').filter(Boolean) : [];
  const brick =
    lang === 'en' ? row.brick_en :
    lang === 'ar' ? row.brick_ar :
    row.brick_fr;

  return {
    images,
    brand:           row.brand || '',
    subBrand:        row.sub_brand || '',
    productName:     row.product_name || '',
    shortName:       row.short_name || '',
    gtin:            row.gtin || '',
    countryOfOrigin: row.country_origin || '',
    libelleBrique:   brick || '',
    prixMin:         row.prix_min,
    prixMax:         row.prix_max,
    codeCader:       row.code_cader || '',
    codeCaderAr:     caderAr(row.code_cader),
    companyName:     row.company_name || '',
    gln:             row.source_gln || '',
    adresse:         row.adresse || '',
    telephone:       row.telephone || '',
    email:           row.email || '',
    site:            row.site || '',
    netContent:      '',
    unitCodeNetContent: '',
    serveur:         row.country_code || 'hub',
  };
}

/**
 * GET /api/registry/fp?gtin=
 * Match exact sur le GTIN. Si présent dans plusieurs pays, on renvoie la fiche
 * la plus récemment mise à jour.
 */
async function searchByGtin(req, res) {
  const gtin = (req.query.gtin || '').trim();
  if (!gtin) {
    return res.status(400).json({ success: false, error: 'Paramètre gtin requis.' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT * FROM product_index WHERE gtin = ? AND status = 2 ORDER BY updated_at DESC LIMIT 1',
      [gtin]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Produit introuvable dans le registre.' });
    }
    return res.status(200).json(toMobileShape(rows[0], resolveLang(req)));
  } catch (err) {
    console.error('[Registry] searchByGtin error:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
}

/**
 * POST /api/registry/fp/sync
 * Body : { country_code: "384", products: [ { gtin, source_gln, brand, ... }, ... ] }
 * Upsert idempotent sur (country_code, gtin).
 */
async function syncBatch(req, res) {
  const { country_code, products } = req.body || {};
  if (!country_code || !Array.isArray(products)) {
    return res.status(400).json({ success: false, error: 'Body attendu : { country_code, products: [] }.' });
  }
  if (!products.length) {
    return res.status(200).json({ success: true, upserted: 0 });
  }

  const placeholders = COLS.map(() => '?').join(', ');
  const updates = COLS.filter((c) => c !== 'country_code' && c !== 'gtin')
    .map((c) => `${c} = VALUES(${c})`)
    .join(', ');
  const sql =
    `INSERT INTO product_index (${COLS.join(', ')}) VALUES (${placeholders}) ` +
    `ON DUPLICATE KEY UPDATE ${updates}`;

  let upserted = 0;
  let failed = 0;
  const conn = await db.getConnection();
  try {
    for (const p of products) {
      const row = { ...p, country_code };
      // status défaut 2 si absent
      if (row.status === undefined || row.status === null) row.status = 2;
      const values = COLS.map((c) => (row[c] === undefined ? null : row[c]));
      try {
        await conn.execute(sql, values);
        upserted += 1;
      } catch (e) {
        failed += 1;
        if (failed <= 3) console.error('[Registry] sync row error:', e.message);
      }
    }
  } finally {
    conn.release();
  }

  return res.status(200).json({ success: true, country_code, received: products.length, upserted, failed });
}

module.exports = { searchByGtin, syncBatch };
