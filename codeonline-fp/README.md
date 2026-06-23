# codeonline-fp — intégration versionnée (proxy registry_fp)

`codeonline-fp` est l'**API produits mobile** (CodeIgniter 3), une application
**distincte** de l'app EDI (Node) de ce dépôt. Elle vit sur les serveurs pays à
`/var/www/codeonline-fp` et n'a **pas son propre git** → ses déploiements
écrasent les modifications manuelles (le proxy `registry_fp` a déjà sauté 3×).

Ce dossier **versionne ici** le fichier patché pour le protéger et permettre une
restauration rapide.

## Contenu
- `application/controllers/api_fp/V1_fp.php` — contrôleur API produits **avec le
  proxy `registry_fp`** (fallback cross-pays vers le Hub PAESN) :
  - `fiche_produit_by_gtin_get` → fallback **produit par GTIN**
  - `fiche_produit_marque_categorie_by_brand_get` → fallback **marques + catégories**
  - `fiche_produit_by_brand_category_get` → fallback **produits par marque+catégorie**
  - méthodes proxy `registry_fp* / registry_call` (URL+clé du Hub **selon `ENVIRONMENT`** : DEV vs PROD)

## Restauration après un écrasement
```bash
rsync -az codeonline-fp/application/controllers/api_fp/V1_fp.php \
  <user>@<serveur-pays>:/var/www/codeonline-fp/application/controllers/api_fp/V1_fp.php
ssh <serveur-pays> "php -l /var/www/codeonline-fp/application/controllers/api_fp/V1_fp.php"
```

## Pérenniser (recommandé)
- Faire en sorte que `codeonline-fp` soit **déployé depuis le contrôle de version**
  (ce fichier comme source de vérité du proxy), ou intégrer le proxy dans le dépôt
  propre de `codeonline-fp`.
- Avant PROD : renseigner l'URL du Hub Hetzner + la `REGISTRY_API_KEY` PROD dans la
  branche `ENVIRONMENT === 'production'` de `registry_call()`.

> Réf du patch seul (snippets + points d'insertion) : `edi_orchestrator/integrations/codeonline-fp_registry_fp.php`.
