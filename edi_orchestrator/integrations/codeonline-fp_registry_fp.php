<?php
/**
 * ============================================================================
 * RÉFÉRENCE — Proxy registry_fp pour codeonline-fp (CodeIgniter 3)
 * ----------------------------------------------------------------------------
 * codeonline-fp n'est PAS versionné dans ce dépôt. Ce fichier conserve, pour
 * traçabilité et ré-application, le patch appliqué à :
 *   /var/www/codeonline-fp/application/controllers/api_fp/V1_fp.php  (serveur CIV)
 *
 * Principe : isolation stricte. Le PHP ne fait que des appels HTTP au service
 * Node registry_fp (Hub PAESN). Aucune logique métier. Fallback : local -> Hub.
 *
 * ⚠️ Fichier édité de façon concurrente par un autre développeur (a déjà
 * écrasé ce patch). À ré-appliquer après tout déploiement de codeonline-fp,
 * ou mettre codeonline-fp sous git.
 * ============================================================================
 */

/* ----------------------------------------------------------------------------
 * 1) MÉTHODES À AJOUTER dans la classe V1_fp (avant fiche_produit_get()).
 * -------------------------------------------------------------------------- */

/** Phase 1 — fiche produit par GTIN. */
private function registry_fp($gtin)
{
    $hub_url = 'http://217.182.94.86:5010';
    $hub_key = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';
    $xlang   = $this->input->get_request_header('x-lang');

    $ch = curl_init($hub_url . '/api/registry/fp?gtin=' . urlencode($gtin));
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_HTTPHEADER     => array('x-registry-key: ' . $hub_key, 'x-lang: ' . $xlang),
    ));
    $out  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($out === false || $code != 200) { return null; }
    return json_decode($out, true);
}

/** Appel générique au service registry_fp (Hub). */
private function registry_call($path)
{
    $hub_url = 'http://217.182.94.86:5010';
    $hub_key = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';
    $xlang   = $this->input->get_request_header('x-lang');
    $ch = curl_init($hub_url . $path);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 4,
        CURLOPT_HTTPHEADER     => array('x-registry-key: ' . $hub_key, 'x-lang: ' . $xlang),
    ));
    $out  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($out === false || $code != 200) { return null; }
    return json_decode($out, true);
}

/** Phase 2 — marques + catégories cross-pays. */
private function registry_fp_brand_categories($brand)
{
    return $this->registry_call('/api/registry/fp/brand-categories?brand=' . urlencode($brand));
}

/** Phase 2 — produits par marque+catégorie cross-pays. */
private function registry_fp_products($brand, $categoryCode, $page)
{
    return $this->registry_call('/api/registry/fp/products?brand=' . urlencode($brand)
        . '&categoryCode=' . urlencode($categoryCode) . '&page=' . urlencode($page));
}

/* ----------------------------------------------------------------------------
 * 2) INSERTIONS dans les méthodes existantes.
 * -------------------------------------------------------------------------- */

/*
 * --- fiche_produit_by_gtin_get() : branche else (local vide) ---
 *  }else{
 *      $hub = $this->registry_fp($this->get('gtin'));
 *      if(!empty($hub)){
 *          $this->response($hub, REST_Controller::HTTP_OK);
 *      }else{
 *          $this->gs1_FP($this->get('gtin'));   // dernier recours inchangé
 *      }
 *  }
 *
 * --- fiche_produit_marque_categorie_by_brand_get() : branche else (brands vides) ---
 *  }else{
 *      $hub = $this->registry_fp_brand_categories($this->get('brand'));
 *      if(!empty($hub)){
 *          $this->response($hub, REST_Controller::HTTP_OK);
 *      }else{
 *          $response = (object) [];
 *          $this->response($response, REST_Controller::HTTP_NOT_FOUND);
 *      }
 *  }
 *
 * --- fiche_produit_by_brand_category_get() : juste après $total=intval(...) ---
 *  if($total==0){
 *      $hub = $this->registry_fp_products($brand,$categoryCode,$page);
 *      if(!empty($hub) && !empty($hub['items'])){ $this->response($hub, REST_Controller::HTTP_OK); return; }
 *  }
 */
