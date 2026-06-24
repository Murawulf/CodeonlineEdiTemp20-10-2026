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

// --- Absolutisation des URLs d'images -------------------------------------
// Un produit renvoyé en fallback vient d'un AUTRE pays : ses images doivent
// être des URLs ABSOLUES (vers le serveur du pays source), pas des chemins
// relatifs (que le mobile résoudrait contre son propre pays = cassé).
// Base par pays surchargeable via env REGISTRY_IMG_BASE_<code> (ex. _788).
const IMG_BASE_DEFAULTS = {
  '788': 'https://fp.codeonline-info.com/images', // Tunisie (observé dans la data)
  // '384': 'https://...'  // Côte d'Ivoire — à confirmer
  // '686': 'https://...'  // Sénégal — à confirmer
};
function imgBase(countryCode) {
  return process.env['REGISTRY_IMG_BASE_' + countryCode] || IMG_BASE_DEFAULTS[countryCode] || '';
}
function absolutize(img, countryCode) {
  if (!img) return img;
  if (/^https?:\/\//i.test(img)) return img;            // déjà absolue → on garde
  const base = imgBase(countryCode);
  if (!base) return img;                                 // pas de base connue → on laisse tel quel
  return base.replace(/\/+$/, '') + '/' + String(img).replace(/^\/+/, '');
}
// "a.jpg;b.jpg" -> [url absolue, ...]
function splitImages(raw, countryCode) {
  return raw
    ? String(raw).split(';').map(s => s.trim()).filter(Boolean).map(i => absolutize(i, countryCode))
    : [];
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
  const images = splitImages(row.images, row.country_code);
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

// Ligne product_index -> carte produit (shape des listes par marque/catégorie).
function toProductCard(row, lang) {
  const images = splitImages(row.images, row.country_code);
  return {
    images,
    brand:           row.brand || '',
    subBrand:        row.sub_brand || '',
    productName:     row.product_name || '',
    shortName:       row.short_name || '',
    gtin:            row.gtin || '',
    countryOfOrigin: row.country_origin || '',
    companyName:     row.company_name || '',
    libelleBrique:   row.brick_fr || '',
    codeBrique:      row.brick_code || '',
    serveur:         row.country_code || 'hub',
  };
}

/**
 * GET /api/registry/fp/brand-categories?brand=
 * Marques (LIKE) cross-pays + catégories (briques GPC mappées) de chaque marque.
 * Shape : [ { brand, categories: [ { name, name_ar, code } ] } ].
 */
async function searchBrandCategories(req, res) {
  const q = (req.query.brand || '').trim();
  if (!q) return res.status(400).json({ success: false, error: 'Paramètre brand requis.' });
  const lang = resolveLang(req);
  try {
    const [brands] = await db.execute(
      "SELECT brand FROM product_index WHERE brand LIKE ? AND status = 2 AND brand IS NOT NULL AND brand <> '' GROUP BY brand ORDER BY brand",
      [`%${q}%`]
    );
    if (!brands.length) return res.status(404).json([]);

    const out = [];
    for (const b of brands) {
      const [cats] = await db.execute(
        "SELECT brick_code, brick_fr, brick_en, brick_ar FROM product_index " +
          "WHERE brand = ? AND status = 2 AND brick_code IS NOT NULL AND brick_fr IS NOT NULL " +
          "GROUP BY brick_code, brick_fr, brick_en, brick_ar",
        [b.brand]
      );
      const categories = cats.map((c) => ({
        name:    (lang === 'en' ? c.brick_en : lang === 'ar' ? c.brick_ar : c.brick_fr) || '',
        name_ar: c.brick_ar || '',
        code:    c.brick_code,
      }));
      out.push({ brand: b.brand, categories });
    }
    return res.status(200).json(out);
  } catch (err) {
    console.error('[Registry] searchBrandCategories error:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
}

/**
 * GET /api/registry/fp/products?brand=&categoryCode=&page=
 * Produits cross-pays d'une marque (exacte) + catégorie (brick_code), paginés.
 * Shape : { items: [ carte produit ], total, pageSize }.
 */
async function searchProductsByBrandCategory(req, res) {
  const brand = (req.query.brand || '').trim();
  const cat = (req.query.categoryCode || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const pageSize = 40;
  if (!brand || !cat) {
    return res.status(400).json({ success: false, error: 'Paramètres brand et categoryCode requis.' });
  }
  const lang = resolveLang(req);
  try {
    const [[cnt]] = await db.execute(
      'SELECT COUNT(*) AS total FROM product_index WHERE brand = ? AND brick_code = ? AND status = 2',
      [brand, cat]
    );
    const total = Number(cnt.total) || 0;

    let rows = [];
    if (total > 0) {
      if (total <= pageSize) {
        [rows] = await db.execute(
          'SELECT * FROM product_index WHERE brand = ? AND brick_code = ? AND status = 2 ORDER BY product_name DESC',
          [brand, cat]
        );
      } else {
        const start = pageSize * page - pageSize;
        [rows] = await db.execute(
          `SELECT * FROM product_index WHERE brand = ? AND brick_code = ? AND status = 2 ` +
            `ORDER BY product_name DESC LIMIT ${pageSize} OFFSET ${start}`,
          [brand, cat]
        );
      }
    }
    const items = rows.map((r) => toProductCard(r, lang));
    return res.status(200).json({ items, total: items.length ? total : 0, pageSize });
  } catch (err) {
    console.error('[Registry] searchProductsByBrandCategory error:', err.message);
    return res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
}

module.exports = { searchByGtin, syncBatch, searchBrandCategories, searchProductsByBrandCategory };
