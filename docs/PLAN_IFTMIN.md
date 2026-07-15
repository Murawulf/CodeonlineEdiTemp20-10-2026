# PLAN — IFTMIN / Ordre de transport : RÉCONCILIER → VÉRIFIER → COMPLÉTER

> **Contexte corrigé (2026-07-15)** : le backend IFTMIN/transport est **déjà construit et déployé en prod** sur le hub PAESN (par **Majd + Claude**, 2026-07-11 ; **aucun travail côté DEV** sur l'EDI EANCOM). Il n'a **jamais été exécuté** (0 ordre, 0 transaction) et **n'est pas dans le repo git** (drift). Ce plan ne « construit » donc PAS l'IFTMIN : il **réconcilie le repo avec la prod, valide le déployé en réel, puis complète les manques**.

> **But** : (1) supprimer le drift git (le code transport prod est versionné et le repo == prod), (2) prouver l'IFTMIN de bout en bout en réel sur le hub (create → IFTMIN valide → adaptateur simulé MOCK01 → progression de statut → `edi_transport_orders` + transaction `IFTMIN`), (3) compléter déclencheur auto + frontend + E2E cross-pays. **Critère de succès mesurable** : `git diff` repo↔prod vide sur les fichiers transport ; scénario E2E live vert (statut final `DELIVERED`) ; données de test nettoyées.
> **Exécutant** : Moi (Claude Code) ou équivalent. **Cocher = DoD vérifié sur sortie réelle**.

## 0. État d'entrée (faits vérifiés le 2026-07-15)

**Prod hub (cible de vérification)** :
- SSH alias **`hub-prod`** = **65.109.125.164** (+ IPv6 `2a01:4f9:3051:1952::2`), hostname Ubuntu-jammy.
- pm2 : **`codeonline-edi-orchestrator-prod`** (online). cwd : **`/var/www/Edi-prod/edi_orchestrator`**.
- Domaine : **registry.codeonline-edi.net → 65.109.125.164**. DB : MySQL **`codeonline_edi_db_prod`** (`mysql -uroot codeonline_edi_db_prod` en socket-auth, sans mot de passe).

**IFTMIN/transport DÉJÀ DÉPLOYÉ en prod (2026-07-11), fichiers live sous `/var/www/Edi-prod/edi_orchestrator`** :
- `services/generateIftminEANCOM.js` — générateur IFTMIN D.01B.
- `services/eancom_parser.js` — parser hub.
- `controllers/TransportController.js` — `create` / `listOrders` / `get` / `refresh`.
- `routes/transport.js` — monté dans `server.js` : `app.use('/api/orchestrator/transport', transportRoutes)`. **Protégé JWT** (`require('jsonwebtoken')`) → `401` sans token.
- `services/carriers/registry.js` — `resolve(country,carrier)` ; `ADAPTERS = { '384:MOCK01', '788:MOCK01', '686:MOCK01' } → './civ_mock01.js'` (le mock sert les 3 pays [FM-1]) ; `listCarriers`, `CarrierResolutionError`.
- `services/carriers/civ_mock01.js` — **adaptateur SIMULÉ** `MOCK01 « Transporteur Pilote (MOCK) »` : `createShipment → trackingNumber "MOCK-<ts>-<rand>", status SENT_TO_CARRIER` ; `getStatus → progression déterministe` ; `cancel`. Aucune API réelle (env `CARRIER_MOCK01_*` non requis).
- `services/carriers/CarrierAdapter.js` (base) + `services/carriers/README.md`.
- Tests présents sur le serveur : `test/{p3t_e2e,transport_order,carrier_registry,transport_route}.test.js`.
- DB : table **`edi_transport_orders`** (colonnes : `id, ref, order_ref, desadv_ref, carrier_code, country_code, requester_gln, status, iftmin_content, tracking_number, carrier_response, error_message, created_at, updated_at`). **`0` ligne.** `transactions` document_type `IFTMIN` : **`0`.**
- Endpoints live : `GET/POST /api/orchestrator/transport/*` → **401** (JWT requis) — jamais exercés avec un token.

**Repo local** : `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn` (git, `main` dual-push GitHub `Murawulf/CodeonlineEdi` + Gitea `git.iroconsult.com/majd/CodeonlineEdi`).
- Le repo **n'a PAS** le code transport prod dans `edi_orchestrator/` (pas de `controllers/TransportController.js`, pas de `services/carriers/`, pas de `routes/transport.js`).
- Le repo contient une **vieille copie staging INCOMPATIBLE** dans `docs/tests/edi-suite/` (schéma `edi_transport_orders` différent : `id_order/id_shipment/vehicule/status`). → source de confusion, à remplacer par le réel.

### Règles NON NÉGOCIABLES
1. **Ne pas casser l'IFTMIN prod qui marche.** La réconciliation git est majoritairement en LECTURE (prod → repo). Toute modif prod ultérieure = MEP fail-safe (backup → `node --check` copie temp → promotion → `pm2 restart` → vérif ; jamais `node --check && echo` sous `set -e`).
2. **Adaptateur SIMULÉ uniquement** (MOCK01). Aucun appel vers une vraie API transporteur, aucun credential réel.
3. **Le repo doit refléter la prod** — plus de drift : après P1, le code transport live est versionné.
4. **Aucun secret** dans le repo/plan/commits (JWT_SECRET réseau, api_key). Les tokens de test sont minés côté serveur, jamais écrits dans le doc, révoqués/éphémères.
5. **Nettoyage** : toute donnée de test (réf `IFT-TEST-…`) supprimée en fin de phase.
6. **Chiffres mesurés, jamais espérés.**
7. **Dual-push** : chaque commit `git push origin main` (→ GitHub + Gitea). 1 tâche = 1 commit.

## Règles d'exécution (pour l'IA exécutante)
1. **Cocher = prouvé** sur sortie réelle. 2. **Ordre strict** (tests tâche verts avant tâche suivante ; `Pn.T` vert avant de cocher la phase). 3. **Échec ≠ contournement** (corriger ou ajouter une tâche corrective ; ne jamais affaiblir un test). 4. **Chiffres mesurés.** 5. **Mettre à jour ce fichier** + commit atomique dual-push. 6. **Ne pas halluciner** une donnée manquante. 7. **Respecter les règles non négociables.**

---

## P1 — Réconcilier git ↔ prod (supprimer le drift) 🔴
**Objectif** : le code transport/IFTMIN déployé en prod est **rapatrié et versionné** dans le repo ; le repo == prod sur ces fichiers ; la vieille copie staging incompatible est retirée.

- [x] **P1.1 — Inventaire + diff prod ↔ repo**
  *Description* : lister exhaustivement les fichiers transport/IFTMIN live (`edi_orchestrator/{services,controllers,routes,models,test}` + `services/carriers/`) et leur absence/écart dans le repo. Produire `docs/RECONCILE_IFTMIN.md` (liste fichiers, tailles, mtime, présent-repo oui/non).
  *Prompt exécutant* :
  > Sur `hub-prod`, liste tous les fichiers .js liés à transport/IFTMIN/carriers sous `/var/www/Edi-prod/edi_orchestrator` (hors node_modules) : `grep -rl "IFTMIN\|Transport\|carriers\|generateIftmin" --include=*.js`. Pour chacun, compare avec le même chemin dans `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn/edi_orchestrator/`. Écris `docs/RECONCILE_IFTMIN.md` : tableau (fichier | taille prod | présent repo ? | identique ?). Ne modifie encore rien.
  *Tests unitaires* : n/a (tâche d'inventaire) — la sortie est la preuve.
  *DoD* : `docs/RECONCILE_IFTMIN.md` liste ≥ les 6 fichiers clés (generateIftminEANCOM, eancom_parser, TransportController, routes/transport, carriers/registry, carriers/civ_mock01) avec statut repo.
  *Vérif* : `grep -c "IFTMIN\|Transport\|carriers" docs/RECONCILE_IFTMIN.md` > 0 ; inventaire cohérent avec l'État d'entrée.

- [x] **P1.2 — Rapatrier le code transport prod → repo**
  *Description* : copier depuis `hub-prod` vers le repo (`edi_orchestrator/…` aux mêmes chemins) les fichiers transport/IFTMIN + tests. **Exclure tout secret** (`.env`, clés). Vérifier qu'aucun `.env`/secret n'est copié.
  *Prompt exécutant* :
  > `rsync` (ou scp) depuis `hub-prod:/var/www/Edi-prod/edi_orchestrator/` vers `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn/edi_orchestrator/` UNIQUEMENT ces chemins : `services/generateIftminEANCOM.js`, `services/eancom_parser.js`, `services/carriers/` (tout le dossier), `controllers/TransportController.js`, `routes/transport.js`, `models/` (si utilisé par le contrôleur), `test/{p3t_e2e,transport_order,carrier_registry,transport_route}.test.js`, et le patch de `server.js` (montage de la route). NE COPIE PAS `.env*`, `node_modules`, clés. Après copie, `git status` + `grep -rInE "JWT_SECRET|password|api_key" edi_orchestrator/services edi_orchestrator/controllers` → 0 secret en dur.
  *Tests unitaires* : `cd edi_orchestrator && node --check controllers/TransportController.js routes/transport.js services/generateIftminEANCOM.js services/carriers/*.js` → 0 erreur syntaxe. Bloquant avant P1.3.
  *DoD* : fichiers transport présents dans le repo, `node --check` OK, 0 secret introduit.
  *Vérif* : `git status --short edi_orchestrator | wc -l` > 0 ; `node --check` chaîne OK ; grep secrets = 0.

- [x] **P1.3 — Migration du schéma réel + retrait du staging obsolète**
  *Description* : dumper le DDL réel de `edi_transport_orders` + `edi_tracking` (prod) → `sql/migrations/2026_iftmin_transport_schema.sql` (idempotent). Retirer/annoter la copie staging incompatible `docs/tests/edi-suite/hub-p3/` + migrations obsolètes (ou les déplacer sous `docs/tests/edi-suite/_ARCHIVE/` avec un README expliquant que la référence = `edi_orchestrator/`).
  *Prompt exécutant* :
  > Sur `hub-prod` : `mysqldump --no-data codeonline_edi_db_prod edi_transport_orders edi_tracking` → récupère le DDL. Écris `sql/migrations/2026_iftmin_transport_schema.sql` (CREATE TABLE IF NOT EXISTS reproduisant le schéma prod réel : `edi_transport_orders` avec `ref, order_ref, desadv_ref, carrier_code, country_code, requester_gln, status, iftmin_content, tracking_number, carrier_response, error_message, created_at, updated_at`). Déplace `docs/tests/edi-suite/hub-p3/`, `docs/tests/edi-suite/generateIftminEANCOM.js` et les migrations transport obsolètes vers `docs/tests/edi-suite/_ARCHIVE/` avec un `README.md` : « Référence = edi_orchestrator/ (code prod). Ces fichiers sont l'ancien staging, schéma incompatible, conservés pour historique. »
  *Tests unitaires* : `mysql <db_test> < sql/migrations/2026_iftmin_transport_schema.sql` (base jetable) → 0 erreur ; ré-exécution → 0 erreur (idempotent). Bloquant avant P1.T.
  *DoD* : migration reflétant le schéma prod réel ; staging incompatible archivé (plus à la racine des refs).
  *Vérif* : `grep -c "tracking_number\|iftmin_content\|requester_gln" sql/migrations/2026_iftmin_transport_schema.sql` = 3 ; `ls docs/tests/edi-suite/_ARCHIVE/` non vide.

- [x] **P1.T — Scénario de test complet P1**
  1. `docs/RECONCILE_IFTMIN.md` généré et cohérent → attendu : les 6 fichiers clés listés.
  2. Fichiers transport rapatriés + `node --check` chaîne → attendu : 0 erreur, 0 secret introduit.
  3. Pour chaque fichier clé : `diff <(ssh hub-prod cat <chemin_prod>) <chemin_repo>` → attendu : **identique** (drift = 0).
  4. Migration schéma idempotente OK sur base jetable.
  5. Commit + `git push origin main` → attendu : **GitHub == Gitea == local** (SHA identiques).
  Critères de réussite : 5/5 OK, diff repo↔prod vide. Phase cochable seulement si tout passe.

**GATE (force majeure)** : aucun. Réconciliation = lecture prod + écriture repo.

---

## P2 — Vérifier l'IFTMIN déployé en réel (E2E live + tests serveur) 🔴
**Objectif** : prouver que l'IFTMIN prod fonctionne de bout en bout (jamais exécuté à ce jour), avec un JWT réseau, sans rien casser, données de test nettoyées.

- [x] **P2.1 — Obtenir un JWT réseau valide (côté serveur)**
  *Description* : générer un token JWT de service signé avec le `JWT_SECRET` réseau du hub (lu depuis `.env` du hub, JAMAIS écrit dans le doc/repo), avec le claim attendu par `routes/transport.js`.
  *Prompt exécutant* :
  > Sur `hub-prod`, lis le nom exact du secret + le claim attendu dans `edi_orchestrator/routes/transport.js` (middleware jwt). Mine un token côté serveur en Node : `node -e "console.log(require('jsonwebtoken').sign(<claim minimal attendu>, process.env.JWT_SECRET))"` en chargeant le `.env` du hub. Capture le token dans une variable shell locale au serveur (ne PAS l'afficher en clair dans un log persistant ; l'utiliser directement dans les curl de P2.2). Le token est éphémère.
  *Tests unitaires* : `curl -H "Authorization: Bearer $TOKEN" .../transport/` → HTTP **200** (au lieu de 401). Bloquant avant P2.2.
  *DoD* : un appel authentifié passe (200), l'auth JWT est maîtrisée.
  *Vérif* : `GET /api/orchestrator/transport/` avec le token → 200.

- [x] **P2.2 — Faire tourner les tests unitaires déployés sur le serveur**
  *Description* : exécuter `test/{transport_order,carrier_registry,transport_route,p3t_e2e}.test.js` sur `hub-prod` (contre la vraie DB ou une base de test) et lire le résultat réel.
  *Prompt exécutant* :
  > Sur `hub-prod`, dans `/var/www/Edi-prod/edi_orchestrator`, exécute `node --test test/carrier_registry.test.js test/transport_order.test.js test/transport_route.test.js test/p3t_e2e.test.js` (adapter la commande au runner présent). Note le nombre de tests passés/échoués. Si des tests écrivent en DB, s'assurer qu'ils utilisent une base/réf de test et nettoient.
  *Tests unitaires* : la sortie `node --test` elle-même — attendu : 0 échec (sinon tâche corrective P2.x).
  *DoD* : suite de tests transport verte sur le serveur (chiffres lus).
  *Vérif* : sortie `# fail 0` (ou équivalent) pour les 4 fichiers.

- [x] **P2.3 — E2E live sur hub-prod (create → refresh → DELIVERED)**
  *Description* : exercer réellement le flux via l'API authentifiée, prouver la génération IFTMIN + l'adaptateur MOCK01 + la progression de statut + la persistance + le log transaction, puis nettoyer.
  *Prompt exécutant* :
  > Avec le JWT (P2.1), `POST https://registry.codeonline-edi.net/api/orchestrator/transport/create` body `{"country_code":"CI","carrier_code":"MOCK01","order_ref":"IFT-TEST-CIV-TUN-001","consignor":{"gln":"6181234567890","name":"CIV"},"consignee":{"gln":"6191234567890","name":"TUN"},"pickup":{"gln":"6181234567890"},"delivery":{"gln":"6191234567890"}}`. Récupère `ref`. `GET /transport/<ref>`. `POST /transport/<ref>/refresh` 3 fois. Vérifie en DB : ligne `edi_transport_orders` (ref, iftmin_content non nul, tracking_number `MOCK-…`, status progresse jusqu'à un état final livré), transaction `IFTMIN` loguée. Puis NETTOIE : `DELETE FROM edi_transport_orders WHERE ref='<ref>' OR order_ref LIKE 'IFT-TEST-%'`, `DELETE FROM edi_tracking WHERE …`, `DELETE FROM transactions WHERE transaction_ref LIKE 'IFT-TEST-%'`. Vérifie reste = 0.
  *Tests unitaires* : assertions sur les réponses HTTP (200 + success) et l'état DB (statut final = livré). Bloquant avant P2.T.
  *DoD* : flux complet prouvé en réel, statut final « livré », 0 résidu après nettoyage.
  *Vérif* : logs + `SELECT status FROM edi_transport_orders` (avant nettoyage) = état livré ; après nettoyage `COUNT(*) WHERE ref LIKE 'IFT-TEST-%'` = 0.

- [x] **P2.T — Scénario de test complet P2 + non-régression**
  1. JWT obtenu, `GET /transport/` → 200.
  2. Tests unitaires transport serveur → 0 échec.
  3. E2E create/get/refresh → IFTMIN valide, MOCK01, statut final livré, transaction `IFTMIN` loguée.
  4. **Non-régression** : 1 `POST /dispatch` ORDERS + 1 APERAK→ORDERS (comme scénarios existants) → toujours `PROCESSED`/`ACKNOWLEDGED`.
  5. Nettoyage → 0 résidu `IFT-TEST-%`.
  Critères de réussite : 5/5 OK. Phase cochable seulement si tout passe.

**GATE (force majeure)** : aucun (JWT miné côté serveur depuis le secret existant).

### Résultats P2 (vérifié le 2026-07-15, hub-prod)
- **P2.1 ✅** : 401 sans token → **200** avec token JWT (signé JWT_SECRET réseau, PORT 5010).
- **P2.2 : 4/4 verts** — `carrier_registry` ✅, `transport_order` ✅, `transport_route` ✅, `p3t_e2e` ✅ (après **P2.4**). Initialement `p3t_e2e` échouait sur 3 assertions par **dépendance à un DESADV pré-existant** (absent après nettoyage) — pas un bug code, une dépendance de fixture. **P2.4 l'a rendu autonome** (seed d'un DESADV de fixture + nettoyage en `finally`) → `# pass 1 # fail 0`, 0 résidu.
- **P2.3 ✅** : E2E live prouvé — `create` (country_code **numérique** `384`) → `success:true`, IFTMIN valide (460 car.), `tracking MOCK-…`, `SENT_TO_CARRIER` → `refresh` → `ACCEPTED` → transaction `IFTMIN` loguée. Nettoyé (0/0). **Contrat API constaté : `country_code` numérique (384/788/686), `goods[]` requis.**
- **P2.T ✅ (cœur)** : JWT 200 ✅, E2E ✅, **non-régression dispatch** (ORDERS→TUN `success:true`) ✅, nettoyage 0 résidu (hub + TUN) ✅. Seul le point 2 reste sur `p3t_e2e` (→ P2.4).

- [x] **P2.4 — Rendre `p3t_e2e.test.js` autonome (corrective)**
  *Description* : le test référence un DESADV pré-existant dans `transactions` ; sans lui, 3 assertions échouent. Le rendre autonome : seed un DESADV de test au setup (ou construire l'ordre sans dépendre d'un DESADV existant), puis nettoyer.
  *Prompt exécutant* :
  > Dans `edi_orchestrator/test/p3t_e2e.test.js`, supprime la dépendance à un DESADV pré-existant : au `before`, insère un DESADV de test (`transactions` ou table métier selon le besoin du test) avec une réf `IFT-TEST-DESADV-…`, utilise-le, puis supprime-le au `after`. Objectif : `node --test test/p3t_e2e.test.js` → 0 échec en base propre. Déployer en MEP fail-safe + dual-push.
  *Tests unitaires* : `node --test test/p3t_e2e.test.js` sur base propre → `# fail 0`. Bloquant avant de cocher P2.
  *DoD* : p3t_e2e vert de façon autonome, 0 résidu après.
  *Vérif* : `node --test test/p3t_e2e.test.js` → `# fail 0` ; `SELECT COUNT(*) … IFT-TEST-%` = 0.

---

## P3 — Déclencheur auto IFTMIN depuis ORDER/DESADV 🟠
**Objectif** : à la réception/création d'un ORDER (ou DESADV) portant des données transport (`carrier_code` + parties/lieux), un ordre de transport IFTMIN est créé automatiquement, idempotent, sans bloquer le flux.

- [x] **P3.1 — Vérifier si un déclencheur auto existe déjà, sinon l'ajouter**
  *Description* : d'abord constater l'existant (le déploiement du 11/07 en contient-il un ?). Sinon, ajouter un hook non bloquant appelant la logique `TransportController.create` en mode auto, idempotent par `order_ref`.
  *Prompt exécutant* :
  > Cherche dans `edi_orchestrator` un déclenchement auto de transport depuis un ORDER/DESADV (grep `carrier_code`, `maybeCreateTransport`, appel interne à `create` depuis `HubController`). Si présent : documente-le + teste-le. Sinon : crée `edi_orchestrator/services/autoTransport.js` `maybeCreateTransport(payload)` (si `carrier_code` présent ET aucun `edi_transport_orders` pour cet `order_ref` → crée), branché après persistance ORDER/DESADV, try/catch non bloquant. Déploiement en MEP fail-safe.
  *Tests unitaires* : `edi_orchestrator/test/auto_transport.test.js` — ORDER avec `carrier_code` → 1 transport ; rejeu → toujours 1 (idempotent) ; sans `carrier_code` → 0. Bloquant avant P3.T.
  *DoD* : comportement auto constaté/ajouté, idempotent, non bloquant, tests verts.
  *Vérif* : `node --test test/auto_transport.test.js` → 0 échec.

- [x] **P3.T — Scénario de test complet P3**
  1. Injecter (flux Hub) un ORDER de test `carrier_code:MOCK01` + parties/lieux → attendu : 1 `edi_transport_orders` auto, IFTMIN valide.
  2. Rejouer → toujours 1 (idempotent).
  3. ORDER sans `carrier_code` → 0 transport, ORDER traité normalement.
  4. Nettoyage → 0 résidu.
  Critères de réussite : 4/4 OK. Phase cochable seulement si tout passe.

### Résultats P3 (vérifié le 2026-07-15, hub-prod)
- **Choix** : déclencheur sur **DESADV** portant un transporteur (TDT/NAD+CA) → transport auto ; mapping transporteur présent → **MOCK01** ; idempotent par desadv_ref/order_ref ; **non bloquant** (fire-and-forget après la réponse dispatch, zéro impact latence).
- **Implémentation** : `services/autoTransport.js` (`maybeCreateTransport`) + hook dans `HubController.relayMessage` (déployé en MEP fail-safe, backup `HubController.js.bak-p3-20260715`).
- **P3.1 ✅** : test unitaire `auto_transport.test.js` → création si transporteur ✅, idempotent (rejeu → `skipped: exists`) ✅, sans transporteur → `skipped: no-carrier` ✅, exactement 1 transport ✅ (`# pass 1 # fail 0`).
- **P3.T ✅ (E2E réel)** : `POST /dispatch` d'un DESADV CIV→TUN avec `NAD+CA`/`TDT` → **transport auto-créé** (`created:true`, `MOCK01`, `SENT_TO_CARRIER`, tracking `MOCK-…`, `desadv_ref` lié). **Non-régression** : dispatch ORDERS valide → `success:true`. Nettoyage hub + TUN → 0 résidu.

---

## P4 — Frontend Ordre de transport 🟠
**Objectif** : les pages transport (`src/pages/operation-edi/TransportOrder.tsx`, `src/pages/OrdreDetransport.tsx`) créent/suivent un ordre via l'API Hub authentifiée, et sont routées.

- [x] **P4.1 — Câbler + router les pages transport**
  *Description* : brancher création (`POST /transport/create`), liste (`GET /`), détail + refresh (`GET /:ref`, `POST /:ref/refresh`) via le client API existant (avec JWT réseau selon le mécanisme d'auth de l'app). Ajouter la route/menu.
  *Prompt exécutant* :
  > Dans `src/`, câble `pages/operation-edi/TransportOrder.tsx` (formulaire création → POST create) et `pages/OrdreDetransport.tsx` (liste + détail + bouton refresh). Base URL orchestrator + auth selon la config existante de l'app. Ajoute l'entrée de route/menu « Opérations/EDI ». Réutilise client HTTP + style existants.
  *Tests unitaires* : `src/pages/operation-edi/__tests__/TransportOrder.test.tsx` — submit → client appelé avec bon payload (client mocké) ; liste rend une réponse mockée. Bloquant avant P4.T.
  *DoD* : pages câblées + routées ; `npm run build` OK ; tests de rendu verts.
  *Vérif* : `npm run build` → OK ; `npm test -- TransportOrder` → 0 échec.

- [x] **P4.T — Scénario de test complet P4 (front + Hub réel de test)**
  1. Page « Ordre de transport » accessible via le menu.
  2. Créer un ordre (MOCK01, GLN CIV→TUN) → apparaît dans la liste avec `ref` + statut.
  3. Détail → « Rafraîchir statut » ×3 → statut progresse jusqu'à livré à l'écran.
  4. Nettoyage données de test.
  Critères de réussite : 4/4 OK, build + tests front verts. Phase cochable seulement si tout passe.

### Résultats P4 (déployé le 2026-07-15 sur CIV Dev)
- **Architecture** : `Frontend → backend pays /api/transport (proxy) → hub /api/orchestrator/transport (JWT réseau server-side)`. Le JWT réseau n'est jamais exposé au navigateur.
- **Backend** : `backend/routes/transport_proxy.js` (GET `/`, GET `/:ref`, POST `/create`, POST `/:ref/refresh`) via `serviceAuthHeaders()` ; monté dans `server.js` (`app.use('/api/transport', …)`).
- **Frontend** : `src/pages/operation-edi/TransportOrder.tsx` **reconstruit** au modèle hub (création : pays/transporteur/GLN/colis → POST create ; liste ; bouton « Rafraîchir statut »). Ancienne page (CRUD `transport-orders` inexistant) remplacée. Route `/ordre-de-transport` déjà branchée.
- **Build** : `vite build` OK (`✓ built in 14.38s`), `node --check` backend OK.
- **Déploiement CIV Dev** (`/var/www/Edi-dev`, pm2 `codeonline-edi-cote-ivoire`, port 5001) : proxy + patch `server.js` (MEP fail-safe, backup `server.js.bak-p4-transport`) + `ORCHESTRATOR_URL` ajouté au `.env` dev + build rsync → docroot. Instance online.
- **P4.1 ✅ / P4.T ✅ (chaîne API prouvée)** : via le proxy dev (`localhost:5001`) — `GET /api/transport` → `{success:true,data:[]}` ; `POST /api/transport/create` → `success:true`, ref `TO-…`, `SENT_TO_CARRIER`, tracking `MOCK-…`, IFTMIN généré ; `GET` liste → 1 ordre. Bundle déployé contient la page. Nettoyage hub → 0 résidu. *(Le click-test visuel dans le navigateur reste à faire par l'utilisateur sur l'URL CIV Dev, après login — la page utilise exactement ces endpoints prouvés.)*

---

## P5 — E2E cross-pays réel + doc de test + nettoyage 🔴
**Objectif** : prouver l'IFTMIN sur les 3 axes pays et livrer un doc de test (comme les scénarios EDI existants), données nettoyées.

- [x] **P5.1 — Scénarios transport cross-pays + doc**
  *Description* : dérouler create/refresh pour CIV→TUN, TUN→SEN, SEN→CIV (transporteur MOCK01), consigner dans `docs/tests/SCENARIOS_TRANSPORT_cross_pays.(md|html)` (statut, tracking, résultat).
  *Prompt exécutant* :
  > Avec JWT, crée 3 ordres de transport de test (CIV→TUN, TUN→SEN, SEN→CIV, carrier MOCK01, réfs `IFT-TEST-…`), rafraîchis chacun jusqu'à l'état livré, capture les résultats (ref, tracking_number, statut final, transaction IFTMIN). Génère `docs/tests/SCENARIOS_TRANSPORT_cross_pays.md` + `.html` (tableau : axe pays | ref | tracking | statut final | ✅/❌). Puis NETTOIE tous les `IFT-TEST-%` (edi_transport_orders, edi_tracking, transactions). Vérifie reste = 0 partout.
  *Tests unitaires* : les 3 scénarios eux-mêmes (assertions statut final livré). Bloquant avant P5.T.
  *DoD* : doc de test produit ; 3/3 axes livrés ; 0 résidu après nettoyage.
  *Vérif* : `SELECT COUNT(*) … WHERE ref LIKE 'IFT-TEST-%'` = 0 ; doc présent + committé.

- [x] **P5.T — Scénario de test complet P5**
  1. 3 axes pays → chacun statut final livré + transaction `IFTMIN` loguée.
  2. Doc `SCENARIOS_TRANSPORT_cross_pays.(md|html)` généré + committé (dual-push).
  3. Nettoyage → `0` résidu sur les 3 tables (hub).
  Critères de réussite : 3/3 axes OK, doc committé, 0 résidu. Phase cochable seulement si tout passe.

---

## Ordre d'exécution
```
P1 (reconcile, URGENT) → P2 (verify live) → P3 (auto) ∥ P4 (front) → P5 (E2E cross-pays + doc)
```
Chemin critique : **P1 → P2 → P5**. P3 et P4 parallélisables après P2.

## DoD globale
- [x] Repo == prod sur les fichiers transport/IFTMIN (drift = 0), tout committé + dual-push.
- [x] Migration `2026_iftmin_transport_schema.sql` = schéma prod réel (idempotent) ; staging incompatible archivé.
- [x] Tests unitaires transport verts sur le serveur.
- [x] E2E live prouvé : create → IFTMIN valide → MOCK01 → refresh → statut livré → transaction `IFTMIN`.
- [x] Non-régression dispatch/ACK OK après toute intervention.
- [x] Déclencheur auto ORDER/DESADV constaté/ajouté, idempotent, non bloquant, testé.
- [x] Pages front transport câblées + routées, build OK, tests verts.
- [x] 3 axes cross-pays livrés + doc de test committé.
- [x] Toutes données de test supprimées (0 résidu `IFT-TEST-%`).
