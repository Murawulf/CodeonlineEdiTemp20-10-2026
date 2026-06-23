<?php
/**
 * ============================================================================
 * RÉFÉRENCE — Proxy registry_fp pour codeonline-fp (CodeIgniter 3)
 * ----------------------------------------------------------------------------
 * codeonline-fp n'est PAS versionné dans ce dépôt et son V1_fp.php est
 * redéployé/édité régulièrement → ce patch a déjà été écrasé 3 fois.
 *
 *   >>> ACTION REQUISE : intégrer ce code DANS le dépôt de codeonline-fp
 *       (ou mettre codeonline-fp sous git) pour qu'il survive aux déploiements.
 *
 * Principe : isolation stricte. Le PHP ne fait que des appels HTTP au service
 * Node registry_fp (Hub PAESN). Aucune logique métier. Fallback local -> Hub.
 *
 * ⚠️ ENVIRONNEMENT : l'URL + la clé du Hub diffèrent DEV / PROD.
 *    registry_call() choisit automatiquement selon ENVIRONMENT (CodeIgniter).
 *    >>> Renseigner les valeurs PROD (Hub Hetzner) avant la bascule PROD.
 *
 * Cible : /var/www/codeonline-fp/application/controllers/api_fp/V1_fp.php
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
 * 1) MÉTHODES À AJOUTER dans la classe V1_fp (avant fiche_produit_get()).
 * -------------------------------------------------------------------------- */

/** Fallback fiche produit par GTIN (phase 1). */
private function registry_fp($gtin)
{
    return $this->registry_call('/api/registry/fp?gtin=' . urlencode($gtin));
}

/** Fallback marques + catégories cross-pays (phase 2). */
private function registry_fp_brand_categories($brand)
{
    return $this->registry_call('/api/registry/fp/brand-categories?brand=' . urlencode($brand));
}

/** Fallback produits par marque+catégorie cross-pays (phase 2). */
private function registry_fp_products($brand, $categoryCode, $page)
{
    return $this->registry_call('/api/registry/fp/products?brand=' . urlencode($brand)
        . '&categoryCode=' . urlencode($categoryCode) . '&page=' . urlencode($page));
}

/** Appel générique au service registry_fp (Hub). URL + clé selon ENVIRONMENT. */
private function registry_call($path)
{
    if (ENVIRONMENT === 'production') {
        $hub_url = 'https://hub.codeonline-edi.net';                 // TODO: Hub PROD Hetzner (à fixer ce soir)
        $hub_key = 'REG-PROD-A-DEFINIR';                             // TODO: REGISTRY_API_KEY PROD (distincte)
    } else {
        $hub_url = 'http://217.182.94.86:5010';                      // Hub DEV
        $hub_key = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';          // clé DEV
    }

    $xlang = $this->input->get_request_header('x-lang');
    $ch = curl_init($hub_url . $path);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,                                 // court : ne bloque pas le mobile
        CURLOPT_HTTPHEADER     => array('x-registry-key: ' . $hub_key, 'x-lang: ' . $xlang),
    ));
    $out  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($out === false || $code != 200) { return null; }
    return json_decode($out, true);
}

/* ----------------------------------------------------------------------------
 * 2) INSERTIONS dans les méthodes existantes (fallback déclenché si local vide).
 * -------------------------------------------------------------------------- */

/*
 * --- fiche_produit_by_gtin_get() : branche else (local vide) ---
 *  } else {
 *      $hub = $this->registry_fp($this->get('gtin'));
 *      if (!empty($hub)) { $this->response($hub, REST_Controller::HTTP_OK); }
 *      else              { $this->gs1_FP($this->get('gtin')); }   // dernier recours inchangé
 *  }
 *
 * --- fiche_produit_marque_categorie_by_brand_get() : branche else (brands vides) ---
 *  } else {
 *      $hub = $this->registry_fp_brand_categories($this->get('brand'));
 *      if (!empty($hub)) { $this->response($hub, REST_Controller::HTTP_OK); return; }
 *      $this->response((object) [], REST_Controller::HTTP_NOT_FOUND);
 *      return;
 *  }
 *
 * --- fiche_produit_by_brand_category_get() : juste après $total = intval(...) ---
 *  if ($total == 0) {
 *      $hub = $this->registry_fp_products($brand, $categoryCode, $page);
 *      if (!empty($hub) && !empty($hub['items'])) { $this->response($hub, REST_Controller::HTTP_OK); return; }
 *  }
 */
