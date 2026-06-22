'use strict';

/**
 * routes/registry.js
 *
 * Service "registry_fp" — index produit cross-pays.
 * Base : /api/registry
 *
 * Toutes les routes exigent l'en-tête x-registry-key (registryAuth) :
 * appelées uniquement par des serveurs pays de confiance, jamais par le mobile.
 *
 *   GET  /fp?gtin=               Fiche produit par GTIN (shape mobile, fallback API pays)
 *   GET  /fp/brand-categories    Marques (LIKE) + catégories cross-pays
 *   GET  /fp/products            Produits par marque+catégorie, paginés
 *   POST /fp/sync                Upsert batch depuis un serveur pays
 */

const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/registryAuth');
const controller = require('../controllers/RegistryController');

router.use(auth);

router.get('/fp',                 (req, res) => controller.searchByGtin(req, res));
router.get('/fp/brand-categories',(req, res) => controller.searchBrandCategories(req, res));
router.get('/fp/products',        (req, res) => controller.searchProductsByBrandCategory(req, res));
router.post('/fp/sync',           (req, res) => controller.syncBatch(req, res));

module.exports = router;
