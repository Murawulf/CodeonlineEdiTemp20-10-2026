# Checklist — Installation Hub PAESN Registry PROD (Hetzner)

**But :** déployer l'orchestrateur + le service `registry_fp` en PROD sur le serveur dédié Hetzner, indexer les vrais catalogues `Entitedb` de chaque pays, et brancher les API produits PROD dessus.
**Règle d'or :** PROD totalement isolée de la DEV (DB, secrets, hub URL distincts). On ne touche pas au hub DEV existant.

---

## P0 — Décisions & infos à réunir (AVANT)

- [ ] **IP / domaine** du serveur Hetzner PROD : `__________`
- [ ] **Accès SSH** (user + clé) au serveur Hetzner : `__________`
- [ ] **Accès SSH** aux serveurs FP **PROD** de chaque pays (CIV / TUN / SEN)
- [ ] **DB produits PROD** par pays = `Entitedb` (confirmer host/user/pass sur chaque)
- [ ] **Exposition hub** : domaine public + TLS (`https://hub.codeonline-edi.net`) **ou** IP:port derrière firewall ? `__________`
- [ ] **`JWT_SECRET` PROD** (nouveau, ≠ DEV) — pour le relais EDI
- [ ] **`REGISTRY_API_KEY` PROD** (nouvelle, ≠ DEV) — pour `registry_fp`
- [ ] **GLN réels PROD** des pays (pour la table `partners` si on active aussi le relais EDI)

---

## P1 — Provisionner le serveur Hetzner

- [ ] Node.js (≥ 18) + npm
- [ ] PM2 (`npm i -g pm2`) + `pm2 startup` (démarrage au boot)
- [ ] MySQL/MariaDB + créer la DB **`codeonline_edi_db_prod`**
- [ ] Reverse-proxy (Nginx/Apache) + TLS Let's Encrypt si exposition publique
- [ ] Pare-feu : n'ouvrir le port hub qu'aux IP des serveurs pays (ou TLS public)

---

## P2 — Déployer l'orchestrateur

- [ ] Renseigner `edi_orchestrator/deploy/orchestrator.prod.conf` :
  - `REMOTE_HOST` = IP Hetzner · `PUBLIC_URL` = domaine/URL hub PROD
  - (déjà fixés : `REMOTE_DIR=/var/www/Edi-prod/edi_orchestrator`, `PM2_PORT=5012`, `DB_NAME=codeonline_edi_db_prod`, `PM2_APP_NAME=codeonline-edi-orchestrator-prod`)
- [ ] Créer le `.env` PROD sur le serveur (depuis `.env.example`), renseigner :
      `DB_*` (→ `codeonline_edi_db_prod`), `PORT=5012`, **`JWT_SECRET` PROD**, `API_PIN`, `TRACKING_API_KEY`, **`REGISTRY_API_KEY` PROD**
- [ ] Déployer : `./edi_orchestrator/deploy/deploy_orchestrator.sh prod`
- [ ] Vérifier : `HEALTH_LOCAL=200` + health externe 200

---

## P3 — Migrations DB PROD (`codeonline_edi_db_prod`)

Appliquer dans l'ordre (présents dans `edi_orchestrator/sql/`) :
- [ ] `schema.sql` (partners, transactions)
- [ ] `tracking_migration.sql` + `order_tracking_migration.sql` (tracking)
- [ ] **`product_index_migration.sql`** (index produit)
- [ ] ⚠️ Dans `tracking_migration.sql` : **roter la clé mobile par défaut** (`TRK-EDI-2026…`) — ne pas garder le seed en PROD
- [ ] Vérifier : `SHOW TABLES;` → partners, transactions, tracking_api_keys, product_index (+ vue order_tracking_summary)

---

## P4 — (Optionnel) Annuaire EDI PROD

Si le hub PROD sert aussi le relais EANCOM :
- [ ] Insérer les **GLN réels PROD** dans `partners` (gln, name, country_code, target_url=`https://<pays-prod>/api/edi/receive`, status=ACTIVE)

---

## P5 — Ingestion produits PROD (le cœur du registry)

Pour **chaque pays**, exécuter `ingest_products.js` **sur le serveur pays** (accès localhost à `Entitedb`), en pointant le **hub PROD** :

- [ ] **CIV** : `COUNTRY_CODE=384  FP_DB_NAME=Entitedb  HUB_URL=<hub PROD>  REGISTRY_KEY=<clé PROD>  node ingest_products.js`
- [ ] **TUN** : `COUNTRY_CODE=788  FP_DB_NAME=Entitedb  …`
- [ ] **SEN** : `COUNTRY_CODE=686  FP_DB_NAME=Entitedb  …` *(seulement si SEN a un vrai catalogue Entitedb ; sinon skip)*
- [ ] Vérifier : `SELECT country_code, COUNT(*) FROM product_index GROUP BY country_code;` → comptes par pays cohérents, **catalogues distincts** (≠ DEV où tout est un clone TUN)

> En PROD les catalogues sont réels et distincts → le fallback cross-pays a sa vraie valeur (pas besoin de produit témoin).

---

## P6 — Brancher les API produits PROD

- [ ] Intégrer le proxy `registry_fp` (réf : `edi_orchestrator/integrations/codeonline-fp_registry_fp.php`) dans le `V1_fp.php` **du FP PROD** (idéalement **via le dépôt git de codeonline-fp**, pas à la main).
- [ ] Renseigner les valeurs PROD dans `registry_call()` (branche `ENVIRONMENT === 'production'`) : **URL hub Hetzner** + **clé PROD**.
- [ ] Vérifier que `ENVIRONMENT=production` sur le FP PROD (CI_ENV) → la branche PROD est bien prise.

---

## P7 — Test E2E PROD (validation)

Sur un serveur pays (ex. CIV PROD), via l'API produits PROD :
- [ ] Chercher un **GTIN** d'un produit existant **dans un autre pays** (ex. TUN) mais absent du catalogue CIV → doit revenir avec `serveur` = code du pays source.
- [ ] Idem **marque** : `fiche_produit_marque_categorie_by_brand?brand=<marque TUN>` → fallback → catégories.
- [ ] Idem **produits** : `fiche_produit_by_brand_category?brand=…&categoryCode=…` → items du pays source.

---

## P8 — Durcissement & exploitation

- [ ] `REGISTRY_API_KEY` / `JWT_SECRET` PROD stockés hors git (`.env`), distincts DEV
- [ ] Hub PROD non exposé au mobile (appelé uniquement par les serveurs pays)
- [ ] TLS + restriction IP source (firewall) ou mTLS
- [ ] **Mettre `codeonline-fp` sous git** (sinon le proxy `registry_fp` saute à chaque déploiement — déjà arrivé 3× en DEV)
- [ ] Planifier l'ingestion en **cron** (deltas `updated_at`) pour garder l'index frais
- [ ] `pm2 save` + vérifier le redémarrage au boot

---

## Rappels d'état (au moment de l'écriture)
- Hub **DEV** : `217.182.94.86:5010`, DB `codeonline_edi_db`, index = CIV 26 (Entitedb) + TUN 96 + 1 produit témoin TUN `OLIVA TUNISIE` (gtin 6191999999999, à supprimer si besoin).
- Proxy PHP DEV : ré-appliqué sur CIV mais **non versionné dans codeonline-fp** → fragile.
- Endpoints registry : `GET /api/registry/fp?gtin=`, `GET /api/registry/fp/brand-categories?brand=`, `GET /api/registry/fp/products?brand=&categoryCode=&page=`, `POST /api/registry/fp/sync`.
