#!/usr/bin/env bash
# ============================================================================
# deploy_registry_fp_proxy.sh
# ----------------------------------------------------------------------------
# Déploie le proxy "registry_fp" (fallback cross-pays vers le Hub PAESN) dans
# le contrôleur V1_fp.php de codeonline-fp. Conçu pour TUN PROD (et réutilisable
# CIV/SEN PROD/DEV).
#
# Ce que le script fait AUTOMATIQUEMENT (sûr) :
#   1. Backup de V1_fp.php
#   2. Insère les 4 méthodes proxy (registry_fp* + registry_call) — env-aware
#      (PROD -> Hub Hetzner / DEV -> Hub 217.182.94.86:5010)
#   3. Branche le fallback GTIN automatiquement (remplace l'appel gs1_FP)
#   4. php -l (lint) — rollback automatique si erreur
#
# Ce qui reste MANUEL (2 petits hooks marque/catégorie, imprimés à la fin) :
#   - fiche_produit_marque_categorie_by_brand_get
#   - fiche_produit_by_brand_category_get
#   (corps de méthode variables -> snippets fournis, à coller par le dev)
#
# Le proxy NE TOUCHE PAS aux images : il relaie la réponse du Hub telle quelle
# (le Hub renvoie déjà des URLs absolues par pays source). NE RIEN ajouter ici
# pour les images.
#
# Usage :
#   sudo ./deploy_registry_fp_proxy.sh <V1_fp.php> <HUB_URL_PROD> <REGISTRY_KEY_PROD>
#
# Exemple TUN PROD (renseigner l'URL Hub Hetzner + la clé PROD) :
#   sudo ./deploy_registry_fp_proxy.sh \
#     /var/www/codeonline-fp/application/controllers/api_fp/V1_fp.php \
#     https://hub.codeonline-edi.net  REG-PROD-xxxxxxxx
# ============================================================================
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
err(){ echo -e "${RED}❌ $*${NC}" >&2; }
ok(){ echo -e "${GREEN}✅ $*${NC}"; }
info(){ echo -e "${BLUE}➜  $*${NC}"; }
warn(){ echo -e "${YELLOW}⚠️  $*${NC}"; }

if [ $# -lt 3 ]; then
  err "Usage : $0 <V1_fp.php> <HUB_URL_PROD> <REGISTRY_KEY_PROD>"
  exit 1
fi
FILE="$1"; HUB_URL_PROD="$2"; REG_KEY_PROD="$3"

[ -f "$FILE" ] || { err "Fichier introuvable : $FILE"; exit 1; }
command -v php >/dev/null 2>&1 || { err "php (CLI) introuvable."; exit 1; }
if [ -w "$FILE" ]; then :; else err "Pas les droits d'écriture sur $FILE (lancer avec sudo / bon user)."; exit 1; fi

TS="$(date +%Y%m%d_%H%M%S)"; BAK="${FILE}.bak_${TS}"
cp -p "$FILE" "$BAK"; ok "Backup : $BAK"

restore(){ cp -p "$BAK" "$FILE"; err "Restauré depuis le backup. Aucune modif conservée."; }

# --- 1) Méthodes proxy (idempotent) ------------------------------------------
if grep -q "function registry_call" "$FILE"; then
  warn "registry_call déjà présent → méthodes non réinsérées (idempotent)."
else
  info "Insertion des 4 méthodes proxy…"
  METHODS_FILE="$(mktemp)"
  cat > "$METHODS_FILE" <<PHP

    // === registry_fp (fallback PAESN) — généré par deploy_registry_fp_proxy.sh ===
    private function registry_fp(\$gtin) {
        return \$this->registry_call('/api/registry/fp?gtin=' . urlencode(\$gtin));
    }
    private function registry_fp_brand_categories(\$brand) {
        return \$this->registry_call('/api/registry/fp/brand-categories?brand=' . urlencode(\$brand));
    }
    private function registry_fp_products(\$brand, \$categoryCode, \$page) {
        return \$this->registry_call('/api/registry/fp/products?brand=' . urlencode(\$brand)
            . '&categoryCode=' . urlencode(\$categoryCode) . '&page=' . urlencode(\$page));
    }
    // Appel générique. URL+clé du Hub selon ENVIRONMENT. NE TOUCHE PAS aux images.
    private function registry_call(\$path) {
        if (ENVIRONMENT === 'production') {
            \$hub_url = '${HUB_URL_PROD}';
            \$hub_key = '${REG_KEY_PROD}';
        } else {
            \$hub_url = 'http://217.182.94.86:5010';
            \$hub_key = 'REG-EDI-2026-9b9909f7d244d103ef4d09cb';
        }
        \$xlang = \$this->input->get_request_header('x-lang');
        \$ch = curl_init(\$hub_url . \$path);
        curl_setopt_array(\$ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 4,
            CURLOPT_HTTPHEADER     => array('x-registry-key: ' . \$hub_key, 'x-lang: ' . \$xlang),
        ));
        \$out = curl_exec(\$ch); \$code = curl_getinfo(\$ch, CURLINFO_HTTP_CODE); curl_close(\$ch);
        if (\$out === false || \$code != 200) { return null; }
        return json_decode(\$out, true);
    }
    // === fin registry_fp ===
PHP

  # Insertion avant la DERNIÈRE accolade fermante du fichier (fin de classe)
  TMP="$(mktemp)"
  awk -v mf="$METHODS_FILE" '
    { lines[NR]=$0; if ($0 ~ /^[[:space:]]*}[[:space:]]*$/) last=NR }
    END {
      if (!last){ print "NO_BRACE" > "/dev/stderr"; exit 3 }
      for (i=1;i<=NR;i++){ if (i==last){ while ((getline l < mf) > 0) print l } print lines[i] }
    }
  ' "$FILE" > "$TMP" || { err "Pas d'accolade de fin de classe trouvée."; rm -f "$TMP" "$METHODS_FILE"; restore; exit 1; }
  cat "$TMP" > "$FILE"; rm -f "$TMP" "$METHODS_FILE"
  ok "Méthodes proxy insérées (Hub PROD = ${HUB_URL_PROD})."
fi

# --- 2) Hook GTIN (auto) ------------------------------------------------------
if grep -q "registry_fp(\$this->get('gtin'))" "$FILE"; then
  warn "Hook GTIN déjà présent → non rebranché."
else
  if grep -qF "\$this->gs1_FP(\$this->get('gtin'));" "$FILE"; then
    info "Branchement du fallback GTIN (remplace le 1er appel gs1_FP)…"
    TARGET="\$this->gs1_FP(\$this->get('gtin'));"
    REPL="\$hub = \$this->registry_fp(\$this->get('gtin')); if (!empty(\$hub)) { \$this->response(\$hub, REST_Controller::HTTP_OK); } else { \$this->gs1_FP(\$this->get('gtin')); }"
    TARGET="$TARGET" REPL="$REPL" perl -0777 -i -pe 'my $n=0; s{\Q$ENV{TARGET}\E}{ $n++ ? $& : $ENV{REPL} }ge' "$FILE"
    ok "Fallback GTIN branché."
  else
    warn "Appel gs1_FP(\$this->get('gtin')) introuvable → brancher le hook GTIN manuellement (voir ci-dessous)."
  fi
fi

# --- 3) Lint + rollback si KO -------------------------------------------------
info "php -l…"
if ! php -l "$FILE"; then
  err "Erreur de syntaxe PHP."
  restore
  exit 1
fi
ok "php -l OK."

# --- 4) Hooks manuels (marque/catégorie) -------------------------------------
cat <<'MANUAL'

──────────────────────────────────────────────────────────────────────────────
 HOOKS RESTANTS À COLLER MANUELLEMENT (2) — marque & catégorie (phase 2)
──────────────────────────────────────────────────────────────────────────────

A) Dans fiche_produit_marque_categorie_by_brand_get() :
   À l'endroit où, quand AUCUNE marque locale n'est trouvée, on renvoie 404
   (ex: "$this->response((object) [], REST_Controller::HTTP_NOT_FOUND);"),
   insérer AVANT le 404 :

       $hub = $this->registry_fp_brand_categories($this->get('brand'));
       if (!empty($hub)) { $this->response($hub, REST_Controller::HTTP_OK); return; }

B) Dans fiche_produit_by_brand_category_get() :
   Juste APRÈS la ligne "$total = intval($total_fiche_produit['totalFP']);" :

       if ($total == 0) {
           $hub = $this->registry_fp_products($brand, $categoryCode, $page);
           if (!empty($hub) && !empty($hub['items'])) { $this->response($hub, REST_Controller::HTTP_OK); return; }
       }

(Le hook GTIN, lui, a été branché automatiquement.)
Si l'appel gs1_FP n'a pas été trouvé, hook GTIN à coller dans le else de
fiche_produit_by_gtin_get() :

       $hub = $this->registry_fp($this->get('gtin'));
       if (!empty($hub)) { $this->response($hub, REST_Controller::HTTP_OK); }
       else              { $this->gs1_FP($this->get('gtin')); }
──────────────────────────────────────────────────────────────────────────────
MANUAL

echo ""
ok "Terminé. Backup : $BAK"
info "Vérifs : ENVIRONMENT=production sur ce serveur ; le Hub PROD ($HUB_URL_PROD) joignable ; clé PROD valide."
warn "Le proxy NE doit PAS préfixer les images (le Hub renvoie déjà des URLs absolues par pays source)."
info "Rollback : cp -p '$BAK' '$FILE'"
