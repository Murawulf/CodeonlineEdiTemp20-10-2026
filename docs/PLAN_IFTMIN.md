# PLAN — IFTMIN / Ordre de transport (Hub PAESN)

> **But** : livrer le message EANCOM **IFTMIN** (ordre de transport) de bout en bout sur le Hub PAESN — génération, validation, persistance, orchestration vers un **adaptateur transporteur (simulé)** avec suivi de statut, déclenchement auto depuis un ORDER/DESADV, et UI. **Critère de succès mesurable** : un `POST /api/orchestrator/transport/create` produit un IFTMIN D.01B valide, crée une ligne `edi_transport_orders` en statut `CREATED`, appelle l'adaptateur simulé, transitionne le statut (`CREATED→CONFIRMED→IN_TRANSIT→DELIVERED` via `refresh`), logue une transaction `IFTMIN`, et l'UI affiche l'ordre + son suivi — le tout prouvé par un scénario E2E vert sur hub-prod, données de test ensuite nettoyées.
> **Exécutant** : Moi (Claude Code) ou équivalent. **Cocher = DoD vérifié sur sortie réelle** (test vert, réponse HTTP, ligne DB).

## 0. État d'entrée (faits vérifiés le 2026-07-15)

**Repo local** : `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn` (git). `main = 4e9e716`. Dual-push actif : `git push origin main` → GitHub (`Murawulf/CodeonlineEdi`) **et** Gitea (`git.iroconsult.com/majd/CodeonlineEdi`).

**Code P3 déjà scaffoldé mais ISOLÉ dans `docs/tests/edi-suite/` (non intégré au live)** :
- `docs/tests/edi-suite/generateIftminEANCOM.js` — générateur IFTMIN **D.01B** complet (`UNB/UNH+IFTMIN/BGM+610/DTM/TDT+20/RFF+ON,DQ/NAD+CZ,CN,CA/LOC+9,7/EQD/GID+PAC/MEA/UNT/UNZ`). Signature : `generateIftminEANCOM(data)` où `data = { iftminNumber, orderNumber?, desadvNumber?, consignor:{gln,name}, consignee:{gln,name}, carrier:{code,name}, mode?, pickup:{gln|address,date?}, delivery:{gln|address,date?}, equipment?:{type,id}, packages?:[{...}], freeText? }`.
- `docs/tests/edi-suite/hub-p3/TransportController.js` — `create` / `listOrders` / `get` / `refresh`. `create` : valide body → génère IFTMIN → insère `edi_transport_orders` (CREATED) → `resolve(country_code, carrier_code)` depuis `../services/carriers/registry` → `adapter.createShipment(parsed, iftmin)` → statut `DELIVERED|FAILED` → `logTransaction(...,'IFTMIN',...)`.
- `docs/tests/edi-suite/hub-p3/transport.js` — routes : `POST /create`, `GET /`, `GET /:ref`, `POST /:ref/refresh`.
- `docs/tests/edi-suite/hub-p3/TransportOrderModel.js` — accès DB `edi_transport_orders`.
- `docs/tests/edi-suite/hub-p3/CarrierAdapter.js` — **classe de base** d'adaptateur (interface `createShipment`, `getStatus`).
- Tests : `docs/tests/edi-suite/{iftmin.test.js, transport_order.test.js, transport_route.test.js, carrier_registry.test.js}`.
- Migrations : `sql/migrations/create_transport_tables.sql` (crée `edi_transport_orders`{id, id_order, id_shipment, vehicule, status PENDING|CONFIRMED|IN_TRANSIT|DELIVERED|CANCELLED} + `edi_tracking`{id, id_shipment, ...}) et `sql/migrations/update_existing_transport_tables.sql`.
- Frontend : `src/pages/OrdreDetransport.tsx`, `src/pages/operation-edi/TransportOrder.tsx` (non routées / non câblées à l'API).

**Hub live (cible)** :
- SSH : alias **`hub-prod`** (65.109.125.164, root). pm2 : **`codeonline-edi-orchestrator-prod`**. cwd : **`/var/www/Edi-prod/edi_orchestrator`**. Runtime Node (fork).
- DB Hub : **MySQL `codeonline_edi_db_prod`** (accès `mysql -uroot codeonline_edi_db_prod` en socket-auth sur hub-prod, sans mot de passe). Tables existantes : `partners`(gln,name,country_code,target_url,api_key,status), `transactions`(transaction_ref,sender_gln,receiver_gln,document_type,status,transport_mode,payload_size,order_ref,created_at,delivered_at,aperak_status).
- Endpoint dispatch existant : `POST https://registry.codeonline-edi.net/api/orchestrator/dispatch` (sans auth appelant). GLN routage : CIV `6181234567890` (384), TUN `6191234567890` (788), SEN `SN02583102G3` (686).
- `edi_orchestrator/routes/` live contient DÉJÀ un `transport.js` + `controllers/{HubController,TrackingController,AckController}.js` + `services/routingService.js`. **Il N'Y A PAS de `controllers/TransportController.js` ni `services/carriers/` en live** → à intégrer/réconcilier avec le `routes/transport.js` déjà présent.

**Écarts d'intégration connus (à traiter, ne pas ignorer)** :
1. **Schéma** : `TransportController` (staged) attend des colonnes `ref`, `iftmin_number`, `carrier_code`, `country_code`, `status`(CREATED…), `carrier_response`, `id_shipment`, `updated_at` sur `edi_transport_orders`. La migration `create_transport_tables.sql` crée un schéma DIFFÉRENT (id_order, id_shipment, vehicule, status PENDING…). → **réconcilier** (P1) avant tout branchement, sinon crash type « Unknown column ».
2. **Registry/adaptateurs** : `TransportController` requiert `../services/carriers/registry` (`resolve(country,carrier)`) qui **n'existe pas encore** ; seule la base `CarrierAdapter.js` est scaffoldée. → à créer (P3).
3. **Route live vs staged** : `routes/transport.js` live ≠ `hub-p3/transport.js` staged → réconcilier (P4).

### Règles NON NÉGOCIABLES
1. **Adaptateur SIMULÉ uniquement** : aucun appel réseau vers une vraie API transporteur, aucun credential transporteur réel. Le simulateur transitionne les statuts de façon déterministe.
2. **MEP hub-prod fail-safe** : sur hub-prod, toute modif = `cp` backup → `node --check` sur COPIE temp → promotion seulement si valide → `pm2 restart codeonline-edi-orchestrator-prod` → vérif santé. Jamais de fichier non validé en live. (Leçon SEN : ne pas utiliser `node --check && echo` sous `set -e`.)
3. **Aucun secret** en clair dans le repo/plan/commits (JWT_SECRET réseau, api_key partenaires). `.env` git-ignoré.
4. **Nettoyage** : toute donnée de test créée pendant un scénario est supprimée à la fin de la phase (par préfixe de réf distinctif `IFT-TEST-…`).
5. **Chiffres mesurés, jamais espérés** (sortie réelle lue).
6. **Dual-push** : chaque commit `git push origin main` (→ GitHub + Gitea). 1 tâche = 1 commit.
7. **Ne pas casser l'existant hub** (dispatch/ACK/tracking doivent rester verts après chaque déploiement).

## Règles d'exécution (pour l'IA exécutante)
1. **Cocher = prouvé** sur sortie réelle (disque, test vert, HTTP). Jamais sur intention.
2. **Ordre strict** : tests unitaires de la tâche verts AVANT la tâche suivante ; scénario de phase `Pn.T` vert AVANT de cocher la phase.
3. **Échec ≠ contournement** : un test échoue → corriger ou ajouter une tâche corrective `Pn.m+1`. Jamais affaiblir/supprimer un test.
4. **Chiffres mesurés** uniquement.
5. **Mettre à jour ce fichier** à chaque tâche finie (cocher `[x]`, noter écarts) + commit atomique (dual-push).
6. **Ne pas halluciner** une donnée manquante — la signaler.
7. **Respecter les règles non négociables** ci-dessus même si ça ralentit.

---

## P1 — Schéma DB transport (réconciliation + migrations) 🔴
**Objectif** : disposer sur `codeonline_edi_db_prod` (et en local de test) d'un schéma `edi_transport_orders` + `edi_tracking` compatible avec `TransportController`, sans casser l'existant.

- [ ] **P1.1 — Figer le schéma cible `edi_transport_orders`**
  *Description* : définir le DDL final réconcilié couvrant les colonnes attendues par le contrôleur : `id` (PK auto), `ref` (VARCHAR unique), `iftmin_number` (VARCHAR), `id_order` (INT null), `desadv_ref` (VARCHAR null), `country_code` (VARCHAR), `carrier_code` (VARCHAR), `carrier_name` (VARCHAR null), `consignor_gln`/`consignee_gln` (VARCHAR), `id_shipment` (VARCHAR null), `vehicule` (VARCHAR null), `status` (VARCHAR default 'CREATED' — valeurs CREATED|CONFIRMED|IN_TRANSIT|DELIVERED|FAILED|CANCELLED), `carrier_response` (TEXT null), `iftmin_content` (MEDIUMTEXT null), `created_at`/`updated_at` (TIMESTAMP). Écrire `sql/migrations/2026_iftmin_transport_schema.sql` (idempotent : `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pour réconcilier une table existante).
  *Prompt exécutant* :
  > Dans le repo `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn`, lis `sql/migrations/create_transport_tables.sql`, `sql/migrations/update_existing_transport_tables.sql` et `docs/tests/edi-suite/hub-p3/{TransportController.js,TransportOrderModel.js}` pour relever TOUTES les colonnes de `edi_transport_orders` réellement lues/écrites par le code. Produis `sql/migrations/2026_iftmin_transport_schema.sql` : DDL idempotent (CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS) créant `edi_transport_orders` avec au minimum les colonnes listées dans la tâche P1.1, et `edi_tracking`(id, id_shipment/transport_ref, status, event_label, event_time, raw). Ne supprime aucune colonne existante. Ajoute un commentaire d'en-tête.
  *Tests unitaires* : `sql/migrations/verify_iftmin_schema.sql` (SELECT sur `information_schema.columns` prouvant présence de chaque colonne cible). Bloquant avant P1.2.
  *DoD* : fichier `2026_iftmin_transport_schema.sql` présent ; exécuté sur une DB MySQL de test → 0 erreur.
  *Vérif* : `mysql <db_test> < sql/migrations/2026_iftmin_transport_schema.sql && mysql <db_test> < sql/migrations/verify_iftmin_schema.sql` → toutes colonnes = présentes.

- [ ] **P1.2 — Appliquer la migration sur une DB MySQL locale de test**
  *Description* : créer une base de test `codeonline_edi_test` (MySQL local ou conteneur), y appliquer la migration + un extrait de `partners`/`transactions` compatibles, servant d'environnement de test pour P2–P5.
  *Prompt exécutant* :
  > Monte une base MySQL locale `codeonline_edi_test` (MySQL/MariaDB local ou `docker run mariadb`). Applique `sql/migrations/2026_iftmin_transport_schema.sql`. Crée les tables minimales `partners` et `transactions` (mêmes colonnes que hub-prod, cf. État d'entrée §0) pour que `TransportController.logTransaction` fonctionne. Documente la chaîne de connexion de test dans `docs/tests/edi-suite/README_TEST_DB.md` (SANS mot de passe réel : variable d'env `TEST_DB_URL`).
  *Tests unitaires* : script `node docs/tests/edi-suite/_check_test_db.js` qui se connecte via `TEST_DB_URL` et `SELECT 1 FROM edi_transport_orders LIMIT 0`. Bloquant avant P2.
  *DoD* : `codeonline_edi_test` accessible, `edi_transport_orders` + `edi_tracking` + `partners` + `transactions` présentes.
  *Vérif* : `node docs/tests/edi-suite/_check_test_db.js` → `DB OK`.

- [ ] **P1.T — Scénario de test complet P1**
  1. Exécuter `2026_iftmin_transport_schema.sql` sur `codeonline_edi_test` → attendu : 0 erreur, ré-exécution idempotente (2ᵉ passage : 0 erreur, 0 changement destructeur).
  2. `verify_iftmin_schema.sql` → attendu : chaque colonne cible listée présente.
  3. `INSERT` d'une ligne `edi_transport_orders` de test avec toutes les colonnes du contrôleur → attendu : succès, `status` défaut `CREATED`. Puis `DELETE` la ligne.
  Critères de réussite : 3/3 étapes OK, schéma idempotent. Phase cochable seulement si tout passe.

---

## P2 — Générateur + validateur IFTMIN (Hub) 🔴
**Objectif** : le Hub sait générer un IFTMIN D.01B valide et le valider structurellement, en lib réutilisable, testée.

- [ ] **P2.1 — Intégrer le générateur IFTMIN dans le Hub**
  *Description* : copier `docs/tests/edi-suite/generateIftminEANCOM.js` → `edi_orchestrator/services/generateIftminEANCOM.js` (chemin requis par le contrôleur). Vérifier l'échappement EANCOM (`?` devant `+ : ' ?`), les segments obligatoires, et exposer `module.exports = { generateIftminEANCOM }`.
  *Prompt exécutant* :
  > Copie `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn/docs/tests/edi-suite/generateIftminEANCOM.js` vers `edi_orchestrator/services/generateIftminEANCOM.js`. Assure `module.exports = { generateIftminEANCOM }`. Ne change PAS la logique de segments (BGM+610, TDT+20, RFF+ON/DQ, NAD+CZ/CN/CA, LOC+9/7). Ajoute une validation d'entrée : si `data.consignor.gln`, `data.consignee.gln`, `data.carrier.code` ou `data.iftminNumber` manquent → throw `Error('IFTMIN: champ requis manquant: <nom>')`.
  *Tests unitaires* : `edi_orchestrator/test/iftmin_generate.test.js` (adapter `docs/tests/edi-suite/iftmin.test.js`) — cas : IFTMIN complet contient `UNH…IFTMIN:D:01B`, `BGM+610`, `NAD+CZ`, `NAD+CN`, `NAD+CA`, `LOC+7` ; champ requis manquant → throw. Bloquant avant P2.2.
  *DoD* : générateur en place, `node -e "require('./edi_orchestrator/services/generateIftminEANCOM')"` OK, tests verts.
  *Vérif* : `cd edi_orchestrator && node --test test/iftmin_generate.test.js` → tests passés (0 échec).

- [ ] **P2.2 — Validateur structurel IFTMIN**
  *Description* : créer `edi_orchestrator/services/validateIftmin.js` : `validateIftmin(eancomString) → { valid:boolean, errors:[] }` vérifiant présence des segments obligatoires + cohérence GLN (14 car. ou format SEN). Utilisé par `TransportController.create` avant persistance.
  *Prompt exécutant* :
  > Crée `edi_orchestrator/services/validateIftmin.js` exportant `validateIftmin(str)`. Découpe par `'` (gérer l'échappement `?'`). Retourne `{valid, errors}` : erreur si absence de `UNH` contenant `IFTMIN`, de `BGM+610`, de `NAD+CZ`, `NAD+CN`, `NAD+CA`, ou de `LOC+7`. Aucune dépendance externe.
  *Tests unitaires* : `edi_orchestrator/test/iftmin_validate.test.js` — IFTMIN généré par P2.1 → `valid:true, errors:[]` ; IFTMIN amputé du `NAD+CA` → `valid:false` avec erreur explicite. Bloquant avant P3.
  *DoD* : validateur en place, tests verts.
  *Vérif* : `cd edi_orchestrator && node --test test/iftmin_validate.test.js` → 0 échec.

- [ ] **P2.T — Scénario de test complet P2**
  1. Générer un IFTMIN réaliste (consignor CIV `6181234567890`, consignee TUN `6191234567890`, carrier `SIMU`, orderNumber `ORD-TEST-1`) → attendu : chaîne EANCOM non vide, terminée par `UNZ`.
  2. Passer cette chaîne à `validateIftmin` → attendu : `{valid:true, errors:[]}`.
  3. Muter la chaîne (retirer `NAD+CA`) → `validateIftmin` → attendu : `valid:false`, erreur mentionnant `NAD+CA`/transporteur.
  Critères de réussite : 3/3 OK, tous les tests unitaires P2 verts. Phase cochable seulement si tout passe.

---

## P3 — Registry + adaptateur transporteur SIMULÉ 🔴
**Objectif** : `resolve(country_code, carrier_code)` renvoie un adaptateur conforme à l'interface `CarrierAdapter`, avec un adaptateur **simulé** déterministe (aucun appel réseau réel).

- [ ] **P3.1 — Classe de base CarrierAdapter**
  *Description* : intégrer `docs/tests/edi-suite/hub-p3/CarrierAdapter.js` → `edi_orchestrator/services/carriers/CarrierAdapter.js`. Interface : `code`, `name`, `async createShipment(parsedIftmin, rawIftmin) → {shipmentId, status, raw}`, `async getStatus(shipmentId) → {status, events:[], raw}`.
  *Prompt exécutant* :
  > Copie `docs/tests/edi-suite/hub-p3/CarrierAdapter.js` vers `edi_orchestrator/services/carriers/CarrierAdapter.js`. Garantis l'interface : constructeur `{code,name}` ; méthodes `createShipment` et `getStatus` qui lèvent `Error('not implemented')` par défaut (classe abstraite).
  *Tests unitaires* : `edi_orchestrator/test/carrier_adapter.test.js` — instancier la base, appeler `createShipment` → throw `not implemented`. Bloquant avant P3.2.
  *DoD* : fichier en place, test vert.
  *Vérif* : `cd edi_orchestrator && node --test test/carrier_adapter.test.js` → 0 échec.

- [ ] **P3.2 — Adaptateur simulé (SimulatedCarrierAdapter)**
  *Description* : créer `edi_orchestrator/services/carriers/SimulatedCarrierAdapter.js` étendant `CarrierAdapter`, code `SIMU`. `createShipment` : génère un `shipmentId` déterministe (`SIM-<hash court de iftminNumber>`), retourne `status:'CONFIRMED'`. `getStatus(shipmentId)` : machine à états déterministe basée sur le nombre d'appels/temps simulé passé en paramètre → `CONFIRMED → IN_TRANSIT → DELIVERED` (transition à chaque `refresh`). Aucun `Date.now()`/réseau : état persisté via la ligne DB (`edi_transport_orders.status`), la transition est « statut suivant dans l'ordre ».
  *Prompt exécutant* :
  > Crée `edi_orchestrator/services/carriers/SimulatedCarrierAdapter.js` (classe étendant `./CarrierAdapter`, `code='SIMU'`, `name='Transporteur Simulé'`). `createShipment(parsed, raw)` : retourne `{shipmentId:'SIM-'+<8 hex dérivés de parsed.iftminNumber ou raw>, status:'CONFIRMED', raw:{simulated:true}}`. `getStatus(shipmentId, currentStatus)` : retourne le statut SUIVANT dans l'ordre `CONFIRMED→IN_TRANSIT→DELIVERED` (si déjà `DELIVERED`, reste `DELIVERED`), avec `events:[{status, label}]`. Déterminisme total, aucune I/O réseau, aucun `Date.now()`/`Math.random()`.
  *Tests unitaires* : `edi_orchestrator/test/carrier_simu.test.js` — `createShipment` renvoie shipmentId stable pour un même IFTMIN ; `getStatus` progresse CONFIRMED→IN_TRANSIT→DELIVERED puis se stabilise. Bloquant avant P3.3.
  *DoD* : adaptateur simulé déterministe, tests verts.
  *Vérif* : `cd edi_orchestrator && node --test test/carrier_simu.test.js` → 0 échec.

- [ ] **P3.3 — Registry des transporteurs**
  *Description* : créer `edi_orchestrator/services/carriers/registry.js` exportant `resolve(countryCode, carrierCode)` + `CarrierResolutionError`. Table de résolution : `{ '*': { SIMU: SimulatedCarrierAdapter } }` (fallback tous pays → SIMU) extensible par pays. `resolve` lève `CarrierResolutionError` si (pays,transporteur) inconnu.
  *Prompt exécutant* :
  > Crée `edi_orchestrator/services/carriers/registry.js` : `class CarrierResolutionError extends Error{}` ; `const REGISTRY = { '*': { SIMU: () => new (require('./SimulatedCarrierAdapter'))() } }` ; `function resolve(country, carrier){ const c=(carrier||'').toUpperCase(); const byCountry = REGISTRY[country] || REGISTRY['*']; const f = (byCountry && byCountry[c]) || REGISTRY['*'][c]; if(!f) throw new CarrierResolutionError('Carrier inconnu: '+country+'/'+carrier); return f(); }` ; `module.exports={resolve,CarrierResolutionError}`.
  *Tests unitaires* : `edi_orchestrator/test/carrier_registry.test.js` (adapter le staged) — `resolve('CI','SIMU')` renvoie un adaptateur `code==='SIMU'` ; `resolve('CI','FEDEX')` → throw `CarrierResolutionError`. Bloquant avant P4.
  *DoD* : registry en place, tests verts.
  *Vérif* : `cd edi_orchestrator && node --test test/carrier_registry.test.js` → 0 échec.

- [ ] **P3.T — Scénario de test complet P3**
  1. `resolve('*','SIMU').createShipment(<parsed IFTMIN de P2>, <raw>)` → attendu : `{shipmentId:/^SIM-/, status:'CONFIRMED'}`.
  2. `getStatus(shipmentId,'CONFIRMED')` → `IN_TRANSIT` ; ré-appel avec `'IN_TRANSIT'` → `DELIVERED` ; ré-appel avec `'DELIVERED'` → `DELIVERED`.
  3. `resolve('CI','TRANSPORTEUR_INEXISTANT')` → attendu : throw `CarrierResolutionError`.
  Critères de réussite : 3/3 OK, tests P3 verts. Phase cochable seulement si tout passe.

---

## P4 — TransportController + routes live (Hub) 🔴
**Objectif** : les endpoints `/api/orchestrator/transport/{create,,:ref,:ref/refresh}` fonctionnent contre `codeonline_edi_test`, en réutilisant générateur (P2) + registry (P3) + schéma (P1).

- [ ] **P4.1 — Intégrer TransportOrderModel + TransportController**
  *Description* : copier `hub-p3/TransportOrderModel.js` → `edi_orchestrator/models/TransportOrderModel.js` et `hub-p3/TransportController.js` → `edi_orchestrator/controllers/TransportController.js`. Aligner les `require` (générateur P2.1, validateur P2.2, registry P3.3, model). Câbler `create` : validate body → generate → validateIftmin → INSERT `edi_transport_orders` (CREATED) → resolve → `createShipment` → UPDATE (id_shipment, status, carrier_response) → logTransaction. `refresh` : lit statut courant → `adapter.getStatus` → UPDATE statut + INSERT `edi_tracking`.
  *Prompt exécutant* :
  > Copie `docs/tests/edi-suite/hub-p3/TransportOrderModel.js` → `edi_orchestrator/models/TransportOrderModel.js` et `hub-p3/TransportController.js` → `edi_orchestrator/controllers/TransportController.js`. Corrige tous les `require` relatifs pour pointer vers `../services/generateIftminEANCOM`, `../services/validateIftmin`, `../services/carriers/registry`, `../models/TransportOrderModel`. Aligne les colonnes SQL sur le schéma P1 (`ref, iftmin_number, country_code, carrier_code, consignor_gln, consignee_gln, id_shipment, status, carrier_response, iftmin_content, updated_at`). Assure que `refresh` fait progresser le statut via `adapter.getStatus(shipmentId, currentStatus)` et insère une ligne `edi_tracking`.
  *Tests unitaires* : `edi_orchestrator/test/transport_order.test.js` (adapter staged) contre `codeonline_edi_test` — création → ligne CREATED puis statut post-createShipment ; get → renvoie l'ordre ; refresh → statut avance + ligne `edi_tracking` ajoutée. Bloquant avant P4.2.
  *DoD* : contrôleur + model intégrés, `node --check` OK, tests verts contre la DB de test.
  *Vérif* : `cd edi_orchestrator && TEST_DB_URL=... node --test test/transport_order.test.js` → 0 échec.

- [ ] **P4.2 — Monter la route transport dans le serveur Hub**
  *Description* : réconcilier `routes/transport.js` : router Express (`POST /create`, `GET /`, `GET /:ref`, `POST /:ref/refresh`) branché sur `TransportController` ; monter sous `/api/orchestrator/transport` dans `edi_orchestrator/server.js` (à côté de `dispatch`, `tracking`).
  *Prompt exécutant* :
  > Aligne `edi_orchestrator/routes/transport.js` sur les 4 routes de `docs/tests/edi-suite/hub-p3/transport.js`, en `require('../controllers/TransportController')`. Dans `edi_orchestrator/server.js`, vérifie/ajoute `app.use('/api/orchestrator/transport', require('./routes/transport'))`. Ne touche pas aux autres montages (dispatch, ack, tracking, registry).
  *Tests unitaires* : `edi_orchestrator/test/transport_route.test.js` (adapter staged, supertest ou http local) — `POST /api/orchestrator/transport/create` avec body minimal valide → HTTP 200 + `success:true` + `ref` ; `GET /:ref` → l'ordre ; `POST /:ref/refresh` → statut avancé ; `POST /create` sans `carrier_code` → HTTP 400. Bloquant avant P4.T.
  *DoD* : route montée, serveur démarre (`node --check server.js` OK), tests route verts.
  *Vérif* : `cd edi_orchestrator && node --check server.js && TEST_DB_URL=... node --test test/transport_route.test.js` → 0 échec.

- [ ] **P4.T — Scénario de test complet P4 (contre codeonline_edi_test)**
  1. Démarrer le Hub en local pointant `codeonline_edi_test`. `POST /api/orchestrator/transport/create` `{country_code:'CI', carrier_code:'SIMU', consignor:{gln:'6181234567890'}, consignee:{gln:'6191234567890'}, order_ref:'ORD-TEST-1', pickup:{gln:'6181234567890'}, delivery:{gln:'6191234567890'}}` → attendu : HTTP 200, `success:true`, `ref` retourné, ligne `edi_transport_orders` créée avec `iftmin_number` non nul, `status` ∈ {CREATED,CONFIRMED}, transaction `IFTMIN` loguée.
  2. `GET /api/orchestrator/transport/<ref>` → attendu : l'ordre + `iftmin_content` présent + validé.
  3. `POST /api/orchestrator/transport/<ref>/refresh` x3 → attendu : statut progresse `…→IN_TRANSIT→DELIVERED`, 1 ligne `edi_tracking` par refresh.
  4. `POST /create` sans `carrier_code` → attendu : HTTP 400, `success:false`.
  5. `DELETE` des lignes de test (`ref LIKE 'IFT-TEST-%'` ou l'IFTMIN généré).
  Critères de réussite : 5/5 OK, tous les tests P4 verts. Phase cochable seulement si tout passe.

---

## P5 — Déclencheur auto IFTMIN depuis ORDER/DESADV 🟠
**Objectif** : à la création/réception d'un ORDER (ou DESADV) portant des données transport, un IFTMIN est généré automatiquement via `TransportController.create`.

- [ ] **P5.1 — Hook de génération auto**
  *Description* : ajouter dans le flux ORDER/DESADV du Hub un déclencheur : si le message porte `carrier_code` + parties/lieux, appeler en interne `TransportController.create` (mode auto, `source:'AUTO'`). Idempotent (pas de doublon si un transport existe déjà pour cet `order_ref`).
  *Prompt exécutant* :
  > Identifie dans `edi_orchestrator` le point où un ORDER/DESADV est traité (HubController.relayMessage ou un post-traitement). Ajoute un module `edi_orchestrator/services/autoTransport.js` : `maybeCreateTransport({order_ref, desadv_ref, country_code, carrier_code, consignor, consignee, pickup, delivery})` qui, si `carrier_code` présent ET aucun `edi_transport_orders` pour cet `order_ref`, appelle la logique de `TransportController.create`. Branche l'appel après persistance de l'ORDER/DESADV. Ne bloque pas le flux principal en cas d'échec transport (try/catch + log).
  *Tests unitaires* : `edi_orchestrator/test/auto_transport.test.js` — ORDER avec `carrier_code` → 1 `edi_transport_orders` créé ; même ORDER rejoué → toujours 1 (idempotent) ; ORDER sans `carrier_code` → 0. Bloquant avant P5.T.
  *DoD* : hook en place, non bloquant, idempotent, tests verts.
  *Vérif* : `cd edi_orchestrator && TEST_DB_URL=... node --test test/auto_transport.test.js` → 0 échec.

- [ ] **P5.T — Scénario de test complet P5**
  1. Injecter un ORDER de test (via le flux Hub) portant `carrier_code:'SIMU'` + parties/lieux → attendu : 1 ligne `edi_transport_orders` auto (`source AUTO`), statut CONFIRMED, IFTMIN valide.
  2. Rejouer le même ORDER → attendu : toujours 1 ligne (pas de doublon).
  3. Injecter un ORDER sans `carrier_code` → attendu : 0 transport auto, flux ORDER inchangé (ORDER toujours traité normalement).
  4. Nettoyer les données de test.
  Critères de réussite : 4/4 OK, tests P5 verts. Phase cochable seulement si tout passe.

---

## P6 — Frontend Ordre de transport 🟠
**Objectif** : les pages `TransportOrder.tsx` / `OrdreDetransport.tsx` créent et suivent un ordre de transport via l'API Hub, et sont routées dans l'app.

- [ ] **P6.1 — Câbler les pages transport à l'API**
  *Description* : brancher `src/pages/operation-edi/TransportOrder.tsx` (création : formulaire → `POST /api/orchestrator/transport/create`) et `src/pages/OrdreDetransport.tsx` (liste + détail + bouton refresh → `GET /` et `POST /:ref/refresh`). Ajouter la route dans le routeur de l'app (menu « Opérations/EDI »). Utiliser le client API existant du projet.
  *Prompt exécutant* :
  > Dans `/Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn/src`, câble `pages/operation-edi/TransportOrder.tsx` et `pages/OrdreDetransport.tsx` à l'API Hub transport (base URL = orchestrator, cf. config existante). Formulaire de création (pays, transporteur=SIMU, consignor/consignee GLN, order_ref, lieux) → POST create. Liste des ordres → GET `/`. Détail → GET `/:ref` + bouton « Rafraîchir statut » → POST `/:ref/refresh`. Ajoute l'entrée de route/menu. Réutilise le client HTTP et le style existants (ne pas réinventer).
  *Tests unitaires* : test de rendu (`src/pages/operation-edi/__tests__/TransportOrder.test.tsx`) — le formulaire submit appelle le client avec le bon payload (client mocké) ; la liste affiche les ordres d'une réponse mockée. Bloquant avant P6.T.
  *DoD* : pages câblées + routées ; `npm run build` (ou équivalent) réussit ; tests de rendu verts.
  *Vérif* : `cd /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn && npm run build` → build OK ; `npm test -- TransportOrder` → 0 échec.

- [ ] **P6.T — Scénario de test complet P6 (contre Hub local + codeonline_edi_test)**
  1. Lancer le front (dev) pointant le Hub local. Ouvrir la page « Ordre de transport » → attendu : formulaire affiché, route accessible depuis le menu.
  2. Créer un ordre (carrier SIMU, GLN CIV→TUN) → attendu : succès, l'ordre apparaît dans la liste avec un `ref` + statut.
  3. Ouvrir le détail → « Rafraîchir statut » 2-3× → attendu : le statut progresse jusqu'à DELIVERED à l'écran.
  4. Nettoyer les données de test.
  Critères de réussite : 4/4 OK, build + tests front verts. Phase cochable seulement si tout passe.

---

## P7 — Déploiement hub-prod (fail-safe) + E2E cross-pays + nettoyage 🔴
**Objectif** : IFTMIN opérationnel sur hub-prod sans casser l'existant, prouvé par un E2E réel, données de test nettoyées.

- [ ] **P7.1 — Migration schéma sur hub-prod**
  *Description* : appliquer `2026_iftmin_transport_schema.sql` sur `codeonline_edi_db_prod` (idempotent), après backup logique des tables transport existantes.
  *Prompt exécutant* :
  > Sur `hub-prod` : `mysqldump codeonline_edi_db_prod edi_transport_orders edi_tracking > /root/backup_transport_$(date +%s).sql` (si les tables existent). Applique `2026_iftmin_transport_schema.sql`. Vérifie via `information_schema.columns` que toutes les colonnes cibles existent. Ne touche à AUCUNE autre table.
  *Tests unitaires* : requête de vérif colonnes (P1.1) exécutée sur `codeonline_edi_db_prod` → toutes présentes. Bloquant avant P7.2.
  *DoD* : schéma transport à jour sur hub-prod, backup présent.
  *Vérif* : `ssh hub-prod 'mysql codeonline_edi_db_prod < verify_iftmin_schema.sql'` → colonnes présentes ; backup listé.

- [ ] **P7.2 — Déploiement code Hub (fail-safe)**
  *Description* : déployer sur `/var/www/Edi-prod/edi_orchestrator` les fichiers P2–P5 (générateur, validateur, carriers/, model, controller, route, autoTransport) via la procédure fail-safe (copie temp → `node --check` de chaque fichier + `node --check server.js` → promotion → `pm2 restart`).
  *Prompt exécutant* :
  > Déploie sur `hub-prod:/var/www/Edi-prod/edi_orchestrator` : `services/generateIftminEANCOM.js`, `services/validateIftmin.js`, `services/carriers/*.js`, `models/TransportOrderModel.js`, `controllers/TransportController.js`, `routes/transport.js`, `services/autoTransport.js`, et le patch `server.js`. Procédure OBLIGATOIRE fail-safe : rsync vers un dossier temp → `node --check` sur CHAQUE .js + `node --check` sur une copie temp de `server.js` patché → si tout valide, `cp` backups horodatés des fichiers live puis promotion → `pm2 restart codeonline-edi-orchestrator-prod` → attendre 5s. NE PAS utiliser `node --check && echo` sous `set -e` (utiliser `if ! node --check ...; then exit 1; fi`).
  *Tests unitaires* : après restart — `curl -s hub health` (endpoint santé existant) → 200 ; `POST /api/orchestrator/dispatch` d'un ORDERS témoin (non-IFTMIN) → `success:true` (non-régression). Bloquant avant P7.T.
  *DoD* : orchestrateur `online` post-restart, dispatch existant OK, route transport répond.
  *Vérif* : `ssh hub-prod 'pm2 list | grep orchestrator'` → online ; `curl … /api/orchestrator/transport/` → 200 (liste, éventuellement vide).

- [ ] **P7.T — Scénario E2E complet sur hub-prod (données de test)**
  1. `POST https://registry.codeonline-edi.net/api/orchestrator/transport/create` `{country_code:'CI', carrier_code:'SIMU', consignor:{gln:'6181234567890',name:'CIV'}, consignee:{gln:'6191234567890',name:'TUN'}, order_ref:'IFT-TEST-CIV-TUN-001', pickup:{gln:'6181234567890'}, delivery:{gln:'6191234567890'}}` → attendu : HTTP 200, `success:true`, `ref`, IFTMIN valide, ligne `edi_transport_orders` CREATED/CONFIRMED, transaction `IFTMIN` loguée.
  2. `GET …/transport/<ref>` → attendu : ordre + IFTMIN + statut.
  3. `POST …/transport/<ref>/refresh` ×3 → attendu : statut progresse jusqu'à `DELIVERED`, lignes `edi_tracking` ajoutées.
  4. Vérifier non-régression : envoyer 1 ORDERS + 1 APERAK→ORDERS via dispatch (comme les scénarios existants) → attendu : toujours `PROCESSED`/`ACKNOWLEDGED`, aucune erreur.
  5. **Nettoyage** : `DELETE FROM edi_transport_orders WHERE ref LIKE 'IFT-TEST-%' OR order_ref LIKE 'IFT-TEST-%'` ; `DELETE FROM edi_tracking WHERE …` ; `DELETE FROM transactions WHERE transaction_ref LIKE 'IFT-TEST-%'`. Vérifier reste = 0.
  Critères de réussite : étapes 1-4 OK (statut final DELIVERED, non-régression verte), étape 5 → 0 résidu. Phase cochable seulement si tout passe.

---

## Ordre d'exécution
```
P1 → P2 → P3 → P4 → P5 → P6 → P7
              (P2 ∥ P3 partiellement : P3 ne dépend que de P1 ; P4 dépend de P1+P2+P3)
              (P6 dépend de P4 ; peut se faire ∥ P5)
```
Chemin critique : **P1 → P2 → P4 → P7**. P3 en parallèle de P2. P5 et P6 après P4. P7 (prod) en dernier.

## DoD globale
- [ ] `edi_transport_orders` + `edi_tracking` au schéma cible sur `codeonline_edi_test` ET `codeonline_edi_db_prod` (idempotent).
- [ ] Générateur IFTMIN D.01B + validateur intégrés au Hub, tests verts.
- [ ] Registry + adaptateur simulé déterministe, tests verts.
- [ ] Endpoints `/api/orchestrator/transport/{create,,:ref,:ref/refresh}` fonctionnels (200/400 attendus), tests route verts.
- [ ] Déclencheur auto IFTMIN depuis ORDER/DESADV, idempotent, non bloquant, tests verts.
- [ ] Pages front Ordre de transport câblées + routées, build OK, tests de rendu verts.
- [ ] Déployé sur hub-prod en fail-safe, dispatch/ACK/tracking existants non régressés.
- [ ] Scénario E2E hub-prod vert : create → IFTMIN valide → simulé → refresh → DELIVERED, transaction `IFTMIN` loguée.
- [ ] Données de test supprimées (0 résidu `IFT-TEST-%`).
- [ ] Tous les commits poussés sur GitHub **et** Gitea (dual-push).
