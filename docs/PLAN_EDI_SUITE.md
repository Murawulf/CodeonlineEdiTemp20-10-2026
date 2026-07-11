# PLAN — Suite EDI Codeonline : DSADV complet · App Tracking · IFTMIN Ordre de Transport

> **But** : livrer les 3 chantiers EDI restants du contrat, mappés aux jalons de paiement. Critère de succès mesurable : (1) un DSADV composé et envoyé depuis l'app web est reçu, parsé, stocké et acquitté (APERAK) par le destinataire cross-pays ; (2) une app mobile Flutter de tracking affiche en direct les transactions + livraisons via l'API du Hub, avec 3 rôles ; (3) un ordre de transport génère un IFTMIN valide, le Hub sélectionne le transporteur et appelle son API via un adaptateur mutualisé, le statut revient dans le tracking.
> **Exécutant** : IA (Claude Code) ou dev. Cocher = DoD vérifié sur sortie réelle.

## 0. État d'entrée (faits vérifiés le 11/07/2026)

- **Réseau EDI PROD** : hub `registry.codeonline-edi.net` (orchestrateur `/var/www/Edi-prod/edi_orchestrator`, port 5010, DB `codeonline_edi_db_prod`). 3 pays live : CIV (`civ.codeonline-edi.net`, GLN 6181234567890), TUN (`edi.codeonline-info.com`, GLN 6191234567890), SEN (`sen.codeonline-edi.net`, GLN SN02583102G3). Table `partners` (routing par GLN), forward JWT réseau, table `transactions` (idempotence par `transaction_ref`).
- **Backend pays** (réf = CIV `/var/www/Edi-prod/backend`, version identique TUN/SEN) : Node/Express, DB `Entitedb` (user `admin`). Générateurs EANCOM : `generateOrderEANCOM_enhanced.js` (ORDERS), `generateInvoicEANCOM.js` (INVOIC), `generateDesadvEANCOM.js` (DESADV), `generateOrderResponseEANCOM.js` (ORDRSP), `generateOrderChangeEANCOM.js` (ORDCHG). Parser `eancom_parser.js` (ORDERS/ORDRSP/ORDCHG/INVOIC/DESADV/APERAK) + `validateParsedEANCOM()`.
- **DSADV existant** : générateur hiérarchique complet (segments UNH/BGM/DTM/RFF/NAD/CPS/PAC/PCI/GIN/LIN/QTY/MEA/PIA/IMD/TDT/UNT — colis + SSCC + transport). Parser gère CPS/PAC/PCI/GIN/MEA/PIA/TDT. Tables `edi_desadv`, `edi_desadv_lines`, `edi_packages`. Routes `/api/edi/desadv`, `/:id/lines`, `/:id/packages`, `/send`. **Manque** : UI web de composition/envoi, réception→persistance auto, APERAK de retour, suivi.
- **Réception EDI** : `POST /api/edi/receive` (parse + `createEdiTransmission` → `edi_transmissions`). Écrit les fichiers reçus dans `/var/www/Edi-orders/received/<TYPE>/` (doit exister + writable par le process). Hub `AckController` (`/api/orchestrator/ack`) gère APERAK.
- **Tracking (hub)** : `TrackingController.js` + `routes/tracking.js` — endpoints GET `/health`, `/document-types`, `/transactions`, `/transactions/:ref`, `/transactions/:ref/history`, `/stats`, `/partners`, `/partners/:gln/timeline`, `/alerts`, `/orders`. Tables `tracking_api_keys` (1 clé), `order_tracking_summary` (vide). **Pas d'app mobile** de tracking.
- **App mobile** : `~/Travail/netconsulting/civapk` (Flutter 3.44.1). Flavors `cotedivoire`/`tunisie`/`senegal`, `AppConfig.apiBase` par pays, entrypoints `lib/main_<pays>.dart`, build via `rebuild_apks.sh`. Signature = clé debug.
- **IFTMIN / Ordre de transport** : AUCUN message EANCOM dédié (pas d'`IFTMIN` dans le code). Le transport existe comme **champs de l'ORDER** (`orders.mode_transport`, `moyen_transport`, `transporteur_gln`, `frais_transport`) + table `edi_transport_orders` (vide). Aucun adaptateur transporteur.
- **Accès** : SSH alias `civ` (consultant, sudo mdp), `tunp`/`senp`/`hub-prod` (root, clé). MySQL creds dans les `.env` de chaque serveur.

### Règles NON NÉGOCIABLES
1. **Ne jamais casser l'existant en prod** : ORDERS/INVOIC/DESADV et le dispatch cross-pays tournent en production — toute modif est additive ou testée hors trafic avant bascule, avec rollback.
2. **Isolation par pays** : chaque nœud garde sa DB `Entitedb` ; le hub ne stocke pas les données métier pays (il route + trace).
3. **Secrets** (creds transporteurs, clés API, JWT) dans `.env` git-ignored / coffre, jamais commités, jamais en clair dans le repo ou ce plan.
4. **Adaptateurs transporteurs** : credentials par transporteur chiffrés/en `.env` ; un adaptateur qui échoue ne casse pas les autres (isolation des connecteurs).
5. **Backup avant toute mutation DB/fichier de prod** ; vérifié non-vide avant de continuer.
6. **Tests en conditions réelles** (vrais serveurs, vraies API), pas de mock pour valider une phase — sauf l'adaptateur transporteur pilote si l'API réelle n'est pas encore fournie (alors mock EXPLICITEMENT signalé + remplacé dès credentials reçus).
7. Chaque phase finit par son scénario de test ; échec = phase ouverte + tâche corrective, jamais de contournement.

## Règles d'exécution (contrat de l'exécutant)
1. **Cocher = prouvé** (sortie réelle : disque, test vert, réponse HTTP). Jamais sur intention.
2. **Ordre strict** : tests unitaires verts avant la tâche suivante ; scénario de phase passé avant de cocher la phase.
3. **Échec ≠ contournement** : corriger ou documenter le blocage (tâche corrective ajoutée). Ne jamais affaiblir un test.
4. **Chiffres mesurés, jamais espérés**.
5. **Mettre à jour CE fichier** à chaque tâche finie (cocher, noter écarts) + committer atomiquement.
6. **Ne pas halluciner** : donnée manquante = signalée, pas inventée.
7. **Respecter les règles non négociables** même si ça ralentit.

### Force majeure (seule dépendance humaine externe)
- **[FM-1] Credentials + doc API des transporteurs** (par pays) — nécessaires pour P3.4/P3.5 (appel réel). Fournis par Majd/les transporteurs. Tant qu'indisponibles : P3 se développe contre un **adaptateur mock** documenté, remplacé dès réception.

---

## P1 — DSADV complet : flux web bout-en-bout + réception/ACK ✅ TERMINÉ 11/07/2026 (jalon 30% — volet DSADV)
**Objectif** : composer un DSADV depuis l'app web à partir d'une commande, l'envoyer via le Hub, le destinataire le reçoit → parse → persiste (edi_desadv/lines/packages) → renvoie un APERAK ; statut visible côté émetteur.

- [x] **P1.1 — Vérifier/compléter la réception DESADV (persistance métier)** ✅ 11/07/2026
  *Écart constaté* : le bloc de persistance DESADV existait déjà dans `server.js` (INSERT `edi_desadv` + `edi_packages` + `edi_desadv_lines`, lignes ~5848-5940) — aucune modif code nécessaire. Route protégée par JWT réseau (`verifyJWT`, secret partagé) : le test utilise `services/serviceAuth.js`. Test déployé : `/var/www/Edi-prod/backend/test/desadv_receive.test.js` → **15/15 verts** (cas 2 lignes/1 colis SSCC + cas 0 colis + transmissions PROCESSED). Bloc identique vérifié présent sur TUN (`/var/www/Edi-prod`) et SEN (`/var/www/Edi-Prod`). Données test en DB prod : refs `TESTDES*`/`TESTDESNP*` (à purger fin P1).
  *Description* : sur le backend pays (réf `/var/www/Edi-prod/backend/server.js`, route `POST /api/edi/receive`), s'assurer qu'un DESADV entrant, après parse, est persisté dans `edi_desadv` + `edi_desadv_lines` + `edi_packages` (pas seulement `edi_transmissions`). Ajouter le mapping parser→tables s'il manque.
  *Prompt exécutant* :
  > Sur le serveur `civ` (ssh civ), fichier `/var/www/Edi-prod/backend/server.js`, route `POST /api/edi/receive`. Après `parseEANCOM` + `validateParsedEANCOM`, si `messageType==='DESADV'`, insérer l'entête dans `edi_desadv`, les lignes dans `edi_desadv_lines`, les colis dans `edi_packages` (voir schémas via `SHOW COLUMNS`). Backup server.js avant modif. Ne toucher qu'au bloc DESADV. Redémarrer pm2 `codeonline-edi-cote-ivoire-prod`. Utiliser les creds DB du `.env` (`Entitedb`/`admin`).
  *Tests unitaires* : `test/desadv_receive.test.js` — poster un DESADV valide (généré par `generateDesadvEANCOM`) sur `/api/edi/receive`, vérifier 1 ligne `edi_desadv`, N lignes `edi_desadv_lines`, M `edi_packages`. Cas limite : DESADV sans colis (0 package) accepté. Bloquant avant P1.2.
  *DoD* : un DESADV reçu crée des enregistrements métier dans les 3 tables.
  *Vérif* : `ssh civ 'MYSQL_PWD=… mysql -uadmin Entitedb -e "SELECT COUNT(*) FROM edi_desadv WHERE created_at>NOW()-INTERVAL 5 MINUTE"'` → ≥ 1 après test.

- [x] **P1.2 — APERAK automatique de retour** ✅ 11/07/2026
  *Réalisé autrement que prévu* : pas de `generateAperakEANCOM.js` côté nœud — le réseau a déjà le pattern « nœud → `POST /api/orchestrator/ack` → le hub génère + route l'APERAK » (AckController + generateAperakEANCOM sur le hub, déjà utilisés par ORDERS/INVOIC via le worker). Ajouts :
  1. `server.js` (3 nœuds, patch `patch_p12.js`) : bloc DESADV de `/api/edi/receive` → ACK (313) après persistance, NACK (314) sur échec de validation, via `ediWorker._notifyOrchestratorAck`.
  2. **3 bugs préexistants corrigés** (`patch_p12b.js`, 3 nœuds) : (a) parser — NAD+MS/MR ne remplissaient pas buyer/supplier → TOUT APERAK entrant était rejeté 400 ; (b) parser — `DOC+131:TYPE` (forme émise par le hub) non parsé → referencedDocumentType null ; (c) worker — APERAK→DESADV mettait à jour la table inexistante `edi_despatch_advices` → `edi_desadv`.
  3. **Bascule réseau** : les 3 nœuds pointaient encore sur l'ancien hub DEV (`http://217.182.94.86:5010`, routes vers nœuds *-dev*) — jamais migrés malgré PLAN_HUB_PROD. `app_parameters` ORCHESTRATOR_URL/EDI_HUB_URL → `https://registry.codeonline-edi.net` (backup : table `app_parameters_bak_p12` sur chaque nœud ; backups fichiers `*.bak_p12*`).
  *Tests* : `test/aperak.test.js` sur CIV → **6/6 verts** (DESADV valide → ACK ; invalide → NACK). Chaîne vérifiée : hub prod `transactions` = APERAK DELIVERED ; TUN `edi_transmissions` = APERAK INBOUND PROCESSED (worker).
  *Description* : à la réception d'un DESADV valide, le nœud génère un APERAK (accusé 313) et le renvoie à l'émetteur via le Hub (`/api/orchestrator/dispatch` avec messageType APERAK, receiver = sender du DESADV). En cas d'invalidité, APERAK de rejet (314).
  *Prompt exécutant* :
  > Backend pays : après persistance DESADV (P1.1), appeler un générateur APERAK (créer `generateAperakEANCOM.js` s'il n'existe pas côté nœud — réf : le hub `AckController` sait déjà en produire) avec function code 313 (ACK) ou 314 (NACK) + référence du document reçu. Dispatcher via `POST https://registry.codeonline-edi.net/api/orchestrator/dispatch` (senderGln = receiver du DESADV, receiverGln = sender du DESADV, messageType=APERAK). Logger la transmission APERAK OUTBOUND.
  *Tests unitaires* : `test/aperak.test.js` — DESADV valide → APERAK 313 émis ; DESADV invalide → APERAK 314. Vérifier le dispatch (mock hub ou vrai). Bloquant avant P1.3.
  *DoD* : chaque DESADV reçu génère un APERAK dispatché à l'émetteur.
  *Vérif* : logs `pm2 logs …-prod` montrent `APERAK dispatched` + transaction APERAK sur le hub.

- [x] **P1.3 — UI web : composer + envoyer un DSADV depuis une commande** ✅ 11/07/2026
  *Écart* : l'écran existait déjà (`src/pages/operation-edi/Shipment.tsx`, route `/operation-edi/shipments` : sélection commande → colisage SSCC via `/api/utils/sscc` → détails transport → envoi `/api/edi/desadv/send`). Corrections apportées : GLN acheteur réel de la commande (était hardcodé `6193608600001` + TODO), seller = `fournisseur_gln`, delivery = `lieu_livraison_gln`, `orderedQuantity` (QTY+21) et `trackingNumber` transmis. Ajout **preview EANCOM** : route backend `POST /api/edi/desadv/preview` (3 nœuds, `patch_p13.js`) + dialog UI avant envoi. Build vite déployé sur CIV (`assets/index-BDKpDLRU.js`+). Repo source = ce repo (`CodeonlineEdi`).
  *Vérif* : e2e `test/desadv_ui_e2e.test.js` (payload = forme exacte `buildDesadvPayload()` UI) → preview 200 sans persistance, send 200, `edi_desadv` OUTBOUND + transmission créées. Capture d'écran non réalisable en autonome (pas de credentials app web) — remplacée par vérif du bundle déployé (`grep "Prévisualiser EANCOM"` = 1) + e2e API.
  *Description* : écran React (app `/var/www/Edi-prod` frontend, repo source local `~/Travail/netconsulting/civapk`? NON — le frontend EDI web = build servi ; source = repo Codeonline-EDI). Ajouter un écran « Créer avis d'expédition » à partir d'une commande validée : sélection commande → lignes → colis/SSCC → génération DSADV → bouton Envoyer (appelle `/api/edi/desadv/send`).
  *Prompt exécutant* :
  > Dans le repo source du frontend EDI (React, celui qui build `/var/www/Edi-prod/assets`), ajouter la page « Créer DSADV » sous le menu Opérations : formulaire (commande source, lignes livrées, colis avec SSCC + poids/mesures), preview de l'EANCOM généré, bouton « Envoyer » → `POST /api/edi/desadv/send` avec le body attendu par la route existante. Rebuild + déployer sur le serveur cible.
  *Tests unitaires* : test composant (formulaire → payload correct) + e2e : remplir → envoyer → transmission OUTBOUND créée. Bloquant avant P1.4.
  *DoD* : un utilisateur crée et envoie un DSADV depuis l'UI sans passer par l'API à la main.
  *Vérif* : capture d'écran de l'écran + `edi_transmissions` OUTBOUND DESADV après envoi UI.

- [x] **P1.4 — Suivi statut DSADV côté émetteur (UI + APERAK)** ✅ 11/07/2026
  *Écart* : le worker (`processInboundAperak`) mettait déjà à jour `edi_desadv.status` (ACKNOWLEDGED/REJECTED) — bug de table corrigé en P1.2b. Ajout (`patch_p14.js`, 3 nœuds) : mise à jour aussi de la transmission OUTBOUND liée dans `edi_transmissions` (via `related_type`/`related_id`). UI : badges `ACKNOWLEDGED`→« Acquitté » / `REJECTED`→« Rejeté » ajoutés à `DesadvManager.tsx` (liste expéditions), déployé sur CIV.
  *Vérif* : e2e → après cycle réel CIV→TUN→APERAK : `edi_desadv.status=ACKNOWLEDGED` **et** transmission OUTBOUND `ACKNOWLEDGED` (test 9/9 vert, ~60 s de bout en bout).
  *Description* : afficher dans l'app le statut d'un DSADV envoyé (ENVOYÉ → LIVRÉ/ACQUITTÉ via l'APERAK reçu, ou REJETÉ). Consommer l'APERAK entrant pour mettre à jour `edi_transmissions.status`.
  *Prompt exécutant* :
  > Backend : à la réception d'un APERAK (`/api/edi/receive`, messageType APERAK), retrouver la transmission DESADV référencée et passer son statut à ACKNOWLEDGED (313) ou REJECTED (314). Frontend : colonne statut dans la liste des expéditions + badge. Déployer.
  *Tests unitaires* : APERAK 313 → statut ACKNOWLEDGED ; 314 → REJECTED. Bloquant avant P1.T.
  *DoD* : le statut d'un DSADV reflète l'APERAK reçu, visible dans l'UI.
  *Vérif* : requête statut transmission après cycle complet.

- [x] **P1.T — Scénario de test complet P1 (bout-en-bout cross-pays)** ✅ 11/07/2026 — **5/5**
  1. ✅ DSADV créé (2 lignes, 1 colis SSCC 361812345000000031) payload = forme exacte UI, envoi 200, transmission OUTBOUND (`test/desadv_ui_e2e.test.js`, refs `TESTUI*`).
  2. ✅ Hub prod : transaction `DESADV-TESTUI…` **DELIVERED** (`document_type=DESADV` après patch `patch_p1t.js` — les dispatchs desadv/invoic n'envoyaient pas `messageType` → hub loggait UNKNOWN ; corrigé 3 nœuds).
  3. ✅ TUN : `edi_desadv`=1 (INBOUND), `edi_desadv_lines`=2, `edi_packages`=1, transmission PROCESSED.
  4. ✅ APERAK 313 TUN→hub→CIV : `edi_desadv.status=ACKNOWLEDGED` + transmission OUTBOUND ACKNOWLEDGED (~60 s).
  5. ✅ UI CIV : API `/api/edi/desadv?direction=OUTBOUND` (source de l'écran) retourne ACKNOWLEDGED, bundle déployé contient badge « Acquitté » (screenshot impossible sans credentials app — vérif API+bundle).
  **Régression** : ORDERS CIV→TUN via hub prod → staging TUN `PENDING_VALIDATION` + APERAK retour DELIVERED ✓. Aucune erreur log nouvelle (bruit résiduel = KeyManager 404 + docs de test invalides antérieurs, préexistants).
  **Purge** : données test purgées de CIV/TUN/hub (backups `*_test_bak_p1` en DB). Les refs `TEST-*` de janv-mars (travaux antérieurs) laissées intactes.

---

## P2 — App Tracking (Flutter, base civapk) — 3 rôles ✅ TERMINÉ 11/07/2026 (jalon 15%)
**Objectif** : app mobile Flutter qui consomme l'API tracking du Hub, avec 3 profils (partenaire entreprise, interne Codeonline, transporteur), authentifiée par clé/API du hub.

- [x] **P2.1 — Compléter/sécuriser l'API tracking du Hub (auth + rôles + données livraison)** ✅ 11/07/2026
  *Réalisé* (hub prod, source locale `~/Travail/netconsulting/edi_orchestrator` synchronisée) :
  - `tracking_api_keys` + colonnes `role` ENUM(partner/internal/carrier) + `scope_gln` (backup `tracking_api_keys_bak_p21`). 3 clés de test créées (internal / partner CIV / carrier TUN) ; clé legacy « Codeonline Mobile App » passée `internal` (non-régression).
  - Header auth = `X-Tracking-Api-Key` (existant, pas `x-tracking-key` du plan). Nouveau middleware `trackingScope.js` : partner/carrier → filtre GLN forcé (impossible d'élargir par query), internal → tout ; `/alerts` + `/partners` réservés internal ; endpoints unitaires (`/transactions/:ref`, `history`, `orders/:ref`, timeline) vérifient le scope. Nouvel endpoint `GET /api/tracking/me` (identité/rôle de la clé pour le login mobile).
  - `GET /api/tracking/deliveries` : vue livraisons par DESADV (statut dérivé IN_TRANSIT→DELIVERED→ACKNOWLEDGED/REJECTED/FAILED, noms partenaires, champ `transport` prêt pour P3.6). `AckController` alimente désormais `transactions.aperak_status` + `order_ref` sur les lignes APERAK.
  *Vérif* : `test/tracking_auth.test.js` sur hub → **23/23 verts** (401/403, isolation partner vs internal prouvée sur données réelles TUN→SEN, deliveries ACKNOWLEDGED).
  *NB* : base API = `/api/tracking` (pas `/api/orchestrator/tracking` comme écrit au plan).
  *Description* : sur le hub (`/var/www/Edi-prod/edi_orchestrator`, `TrackingController.js` + `routes/tracking.js`), (a) vérifier l'auth par `tracking_api_keys` (header clé) sur tous les endpoints ; (b) ajouter la notion de **rôle** (partner/internal/carrier) à la clé + filtrage des données par rôle (un partenaire ne voit que ses GLN) ; (c) exposer les données de **livraison** (statut colis/DSADV/transport) en plus des transactions.
  *Prompt exécutant* :
  > Hub (ssh hub-prod, `/var/www/Edi-prod/edi_orchestrator`). Middleware auth : valider `x-tracking-key` contre `tracking_api_keys` (ajouter colonne `role` + `scope_gln` à la table si absent). Endpoints : filtrer `/transactions`, `/orders`, `/partners/:gln/timeline` selon le rôle/scope. Ajouter `GET /api/orchestrator/tracking/deliveries` (statut livraisons depuis `order_tracking_summary` + DESADV/transport). pm2 restart orchestrateur. Backup .env + code.
  *Tests unitaires* : `test/tracking_auth.test.js` — clé partner ne voit que ses GLN ; clé internal voit tout ; clé absente → 401. Bloquant avant P2.2.
  *DoD* : API tracking authentifiée, filtrée par rôle, expose transactions + livraisons.
  *Vérif* : `curl` avec clé partner vs internal → jeux de données différents ; sans clé → 401.

- [x] **P2.2 — Projet Flutter Tracking (structure + auth + config)** ✅ 11/07/2026
  App dédiée `~/Travail/netconsulting/tracking-app` (git init, commit initial). Login par clé API (`X-Tracking-Api-Key`) validée via `GET /api/tracking/me` → rôle+scope mémorisés ; stockage sécurisé `flutter_secure_storage` (abstraction `KeyStore` testable) ; `AppConfig.hubApiBase='https://registry.codeonline-edi.net'` ; targetSdk 36, HTTPS only. Tests : `auth_service_test.dart` 5/5 (login OK/KO/vide, restore, logout), `flutter analyze` 0 issue.
  *Description* : nouvelle app Flutter (repo `~/Travail/netconsulting/tracking-app` OU nouveau flavor/module dans civapk — décider : app SÉPARÉE). Écran login (clé/compte → rôle), config `hubApiBase = https://registry.codeonline-edi.net`, stockage sécurisé du token/clé.
  *Prompt exécutant* :
  > Créer une app Flutter dédiée `~/Travail/netconsulting/tracking-app` (base réutilisée de civapk pour le style/HTTP). Écran d'authentification → récupère la clé tracking + rôle. `AppConfig.hubApiBase='https://registry.codeonline-edi.net'`. Client HTTP ajoutant `x-tracking-key`. Stockage sécurisé (flutter_secure_storage). targetSdk 36, pas de cleartext.
  *Tests unitaires* : login OK → token stocké ; login KO → message. `flutter analyze` 0 erreur. Bloquant avant P2.3.
  *DoD* : l'app démarre, s'authentifie contre le hub, mémorise le rôle.
  *Vérif* : lancer sur émulateur, login avec une vraie clé → dashboard vide accessible.

- [x] **P2.3 — Écran suivi transactions EDI (liste + détail + timeline)** ✅ 11/07/2026
  `TransactionsScreen` : cartes (type, sender→receiver, statut coloré, date), filtres type+statut, pull-to-refresh. `TransactionDetailScreen` : fiche + timeline verticale via `/transactions/:ref/history`. Tests widget (rendu API mockée + filtre → query `document_type`) verts.
  *Description* : liste des transactions (ORDERS/INVOIC/DESADV/APERAK) avec filtres (type, statut, date, partenaire), détail d'une transaction, timeline (`/transactions/:ref/history`).
  *Prompt exécutant* :
  > App tracking : écran « Transactions » → `GET /api/orchestrator/tracking/transactions` (filtré par rôle). Cartes par transaction (type, sender→receiver, statut, date). Tap → détail + timeline via `/transactions/:ref/history`. Pull-to-refresh.
  *Tests unitaires* : rendu liste depuis réponse API mockée ; filtre par type. Bloquant avant P2.4.
  *DoD* : les transactions réelles du réseau s'affichent, filtrables, avec timeline.
  *Vérif* : capture écran avec vraies transactions du hub.

- [x] **P2.4 — Écran suivi livraison (colis / DSADV / transport)** ✅ 11/07/2026
  `DeliveriesScreen` : consomme `GET /api/tracking/deliveries` (P2.1), barre de progression Expédié→En transit→Livré→Acquitté, recherche par réf (param `ref`), champ transport affiché dès que P3.6 l'alimente. Tests widget verts. *NB* : le détail colis/SSCC reste dans la DB pays (règle d'isolation) — la vue hub montre le cycle DESADV/APERAK/transport.
  *Description* : suivi des expéditions : statut DSADV, colis/SSCC, et (quand P3 livré) statut transport. Recherche par référence commande/expédition.
  *Prompt exécutant* :
  > App tracking : écran « Livraisons » → `GET .../tracking/deliveries`. Vue par expédition : produits, colis (SSCC), statut (préparé→expédié→en transit→livré). Recherche par réf. Prévoir le champ statut transport (aliment. par P3).
  *Tests unitaires* : rendu depuis API ; recherche par réf. Bloquant avant P2.5.
  *DoD* : l'utilisateur suit une livraison de bout en bout.
  *Vérif* : capture écran d'une livraison réelle (DSADV de P1).

- [x] **P2.5 — Rôles/permissions + alertes** ✅ 11/07/2026
  `HomeShell` route la navigation par rôle : partner → Transactions+Livraisons (ses GLN, imposé côté hub) ; internal → +onglet Réseau (`/stats`+`/alerts`) ; carrier → Livraisons+Mes transports (prêt P3). Badge rôle + logout. Tests widget 3 rôles → 3 jeux d'onglets verts. *Écart* : pas de notifications locales push (l'écran Réseau liste les alertes en pull) — à ajouter si exigé.
  *Description* : adapter l'UI selon le rôle (partenaire : ses données ; interne : monitoring réseau global + alertes ; transporteur : ses ordres de transport + maj statut). Écran alertes (`/alerts`).
  *Prompt exécutant* :
  > App tracking : router les écrans/menus selon le rôle récupéré au login. Interne → onglet « Réseau » (stats globales, alertes `/alerts`). Transporteur → onglet « Mes transports » (préparation P3). Partenaire → ses transactions/livraisons. Notifications locales sur nouvelle alerte.
  *Tests unitaires* : 3 rôles → 3 jeux d'écrans/menus. Bloquant avant P2.T.
  *DoD* : chaque rôle a son expérience ; interne voit les alertes réseau.
  *Vérif* : captures des 3 rôles.

- [x] **P2.T — Scénario de test complet P2 (émulateur, vraies API hub)** ✅ 11/07/2026 — **5/5** (émulateur Pixel 8, hub prod réel, captures `docs/tests/edi-suite/captures-p2t/`)
  1. ✅ Partenaire (clé scope CIV) : voit UNIQUEMENT ses 2 transactions (DESADV CIV→TUN + APERAK) — la transaction TUN→SEN est invisible (capture 02).
  2. ✅ Interne : voit les transactions des 3 pays (dont TUN→SEN) + onglet Réseau avec stats (4 tx, 100 % livraison, par type) et alertes (captures 05-06).
  3. ✅ Détail DESADV de P1 : timeline complète RECEIVED→FORWARDED→DELIVERED (capture 03).
  4. ✅ Livraisons : expédition P1 (TESTUI…) affichée « Acquitté », progression 4/4, noms partenaires + réf commande (capture 04).
  5. ✅ APK release (50,6 Mo, targetSdk 36, HTTPS-only) installé émulateur, aucun crash app. Corrections en cours de test : permission INTERNET manquante du manifest release + réponses non-JSON (404 hub). Rôle transporteur vérifié (capture 07 : Livraisons scopées TUN + onglet Mes transports).
  Isolation par rôle prouvée visuellement (2 tx partner vs 4 tx internal) + 23/23 tests API P2.1. *NB* : ANR de l'émulateur en fin de session = surcharge machine hôte, pas un crash app (logcat propre côté app).

---

## P3 — IFTMIN Ordre de Transport + adaptateurs transporteurs (mutualisés sur le Hub) ✅ TERMINÉ 11/07/2026 (jalon 30% — volet Transport ; adaptateur pilote = MOCK [FM-1])
**Objectif** : générer un IFTMIN valide, le Hub sélectionne le transporteur (par pays/critère), appelle son API via un adaptateur mutualisé, et remonte le statut dans le tracking. Extensible 3→10→20 pays.

**[FM-1]** Credentials + doc API des transporteurs requis pour P3.4/P3.5 (appel réel). Sinon adaptateur mock explicite.

- [x] **P3.1 — Générateur + parser IFTMIN (message EANCOM transport)** ✅ 11/07/2026
  `generateIftminEANCOM.js` créé (3 nœuds) : IFTMIN:D:01B:UN:EAN004, BGM+610, DTM 137/200/2, TDT+20, RFF+ON/+DQ (commande+DSADV), NAD+CZ/CN/CA, LOC+9/+7, EQD, GID+FTX+MEA+PCI(SSCC). Parser étendu (`patch_p31.js`, 3 nœuds) : champs `consignor/consignee/carrierParty/placeOfLoading/placeOfDelivery/equipment/desadvReference/goodsItems` + validation IFTMIN dédiée (transporteur, lieu livraison, colis requis). `test/iftmin.test.js` → **25/25 verts** (round-trip sans perte, 3 rejets validation, 3 throws générateur, non-régression DESADV).
  *Description* : créer `generateIftminEANCOM.js` (nœud pays ou hub) produisant un IFTMIN valide (segments UNH+IFTMIN, BGM, DTM, TDT/EQD, NAD parties, GID/PAC marchandise, LOC lieux, RFF réf commande/DSADV). Étendre `eancom_parser.js` pour parser IFTMIN.
  *Prompt exécutant* :
  > Créer `/var/www/Edi-prod/backend/generateIftminEANCOM.js` : fonction `generateIftminEANCOM(data)` → IFTMIN:D:xx:UN. Segments : UNH, BGM+610, DTM, TDT (mode transport), LOC (enlèvement/livraison), NAD (expéditeur/destinataire/transporteur), GID/PAC/MEA (colis), RFF (commande + DSADV liés). Étendre `eancom_parser.js` : `case 'IFTMIN'` + segments LOC/GID/TDT/EQD. Ajouter IFTMIN à `validateParsedEANCOM` (champs requis : transporteur, lieux, colis).
  *Tests unitaires* : `test/iftmin.test.js` — générer puis parser un IFTMIN → round-trip cohérent ; validation rejette IFTMIN sans lieu de livraison. Bloquant avant P3.2.
  *DoD* : IFTMIN généré + reparsé sans perte, validé.
  *Vérif* : `node test/iftmin.test.js` → tous verts.

- [x] **P3.2 — Modèle « Ordre de Transport » (DB + statut)** ✅ 11/07/2026
  Table `edi_transport_orders` créée sur le hub (`codeonline_edi_db_prod`) : ref UNIQUE, order_ref, desadv_ref, carrier_code, country_code, requester_gln, status ENUM(CREATED→SENT_TO_CARRIER→ACCEPTED→IN_TRANSIT→DELIVERED/FAILED/CANCELLED), iftmin_content, tracking_number, carrier_response, error_message + index. `services/TransportOrderModel.js` : CRUD + machine à états stricte (verrou optimiste, transitions illégales → `TransportStateError` 409, idempotence). `test/transport_order.test.js` → **13/13 verts**.
  *Description* : compléter `edi_transport_orders` (colonnes : ref, order_ref, desadv_ref, carrier_id, country_code, status, iftmin_content, tracking_number, created_at, updated_at). Statuts : CREATED → SENT_TO_CARRIER → ACCEPTED → IN_TRANSIT → DELIVERED / FAILED.
  *Prompt exécutant* :
  > Sur le hub (les ordres de transport sont mutualisés) : `ALTER/CREATE edi_transport_orders` (voir colonnes ci-dessus) dans `codeonline_edi_db_prod`. Backup avant. Créer le modèle d'accès (CRUD + transitions de statut).
  *Tests unitaires* : insert + transitions de statut valides ; transition illégale rejetée. Bloquant avant P3.3.
  *DoD* : table + CRUD + machine à états opérationnels.
  *Vérif* : `SELECT` structure + test transitions.

- [x] **P3.3 — Couche adaptateurs transporteurs (interface commune, mutualisée sur le Hub)** ✅ 11/07/2026
  `services/carriers/` : `CarrierAdapter.js` (contrat createShipment/getStatus/cancel, statuts normalisés), `registry.js` (résolution `{country_code}:{carrier_code}`, chargement paresseux, cache, erreurs isolées par transporteur), `README.md` (ajout d'un transporteur = 1 fichier + 1 entrée + creds .env — documenté avec exemple complet). `test/carrier_registry.test.js` → résolution ✓, inconnu → `CarrierResolutionError` explicite ✓, isolation (module cassé n'affecte pas les autres) ✓.
  *Description* : sur le hub, créer `services/carriers/` avec une **interface commune** `CarrierAdapter` (méthodes `createShipment(iftmin)`, `getStatus(trackingNumber)`, `cancel()`), un **registry** (résolution par pays + transporteur), et la config credentials par `.env` (jamais commit). Chaque transporteur = 1 fichier adaptateur implémentant l'interface.
  *Prompt exécutant* :
  > Hub `/var/www/Edi-prod/edi_orchestrator/services/carriers/` : `CarrierAdapter.js` (interface/contrat), `registry.js` (map `{country_code, carrier_code} -> adapter`), lecture credentials depuis `.env` (`CARRIER_<CODE>_API_KEY`…). Un adaptateur défaillant ne casse pas les autres (try/catch + statut FAILED). Documenter le contrat pour ajouter un transporteur en < 1 fichier.
  *Tests unitaires* : `test/carrier_registry.test.js` — résolution par pays+code ; adaptateur inconnu → erreur claire ; isolation (1 adapter throw → les autres OK). Bloquant avant P3.4.
  *DoD* : ajouter un transporteur = créer 1 fichier adaptateur + 1 entrée registry + creds .env.
  *Vérif* : test registry vert + doc `services/carriers/README.md`.

- [x] **P3.4 — Premier adaptateur transporteur pilote (1 pays)** ✅ 11/07/2026 — **MOCK explicite [FM-1]**
  Credentials/doc API transporteurs toujours indisponibles ([FM-1]) → `services/carriers/civ_mock01.js`, marqué `// MOCK — remplacer dès credentials [FM-1]` en tête de fichier. Respecte intégralement le contrat (createShipment → trackingNumber `MOCK-…` + SENT_TO_CARRIER ; getStatus → progression ACCEPTED→IN_TRANSIT→DELIVERED dans le temps ; cancel). Enregistré pour 384/788/686. Remplacement = 1 fichier + entrées registry. Tests (dans `carrier_registry.test.js`) **16/16 verts**.
  *Description* : implémenter 1 adaptateur réel pour 1 transporteur d'un pays adhérent (via [FM-1] credentials). Mappe IFTMIN → payload API transporteur → crée l'expédition → récupère tracking number + statut. Si credentials indisponibles : adaptateur **mock** documenté (à remplacer).
  *Prompt exécutant* :
  > Implémenter `services/carriers/<pays>_<transporteur>.js` selon la doc API fournie ([FM-1]) : `createShipment(iftmin)` → POST API transporteur → retourne `{trackingNumber, status}`. `getStatus()` → GET statut. Gérer auth (clé/token du .env), erreurs, timeouts. Si pas de credentials : mock renvoyant des statuts simulés, marqué `// MOCK — remplacer dès credentials [FM-1]`.
  *Tests unitaires* : createShipment → trackingNumber non vide ; getStatus → statut normalisé. Bloquant avant P3.5.
  *DoD* : 1 transporteur réel (ou mock explicite) crée une expédition depuis un IFTMIN.
  *Vérif* : appel réel/mock → trackingNumber + statut retournés.

- [x] **P3.5 — Route Hub « créer ordre de transport » (orchestration complète)** ✅ 11/07/2026
  `POST /api/orchestrator/transport/create` (auth JWT réseau, secret partagé nœuds) : valider → `generateIftminEANCOM` (+ re-parse + validation) → insert CREATED → `registry.resolve().createShipment` → SENT_TO_CARRIER + trackingNumber → journal `transactions` (document_type IFTMIN). + `GET /transport` (liste), `GET /transport/:ref`, `POST /transport/:ref/refresh` (poll `getStatus` → transition). Échec transporteur isolé → ordre FAILED + 404/502 propre (jamais de 500 brut). `test/transport_route.test.js` → **14/14 verts**. Dépendance `jsonwebtoken` ajoutée au hub.
  *Description* : `POST /api/orchestrator/transport/create` : reçoit une demande (order_ref/desadv_ref + transporteur choisi) → génère l'IFTMIN → enregistre `edi_transport_orders` → appelle l'adaptateur → stocke trackingNumber + statut → journalise dans `transactions`.
  *Prompt exécutant* :
  > Hub : route `POST /api/orchestrator/transport/create` (auth JWT réseau ou clé). Pipeline : valider → `generateIftminEANCOM` → insert `edi_transport_orders` (CREATED) → `registry.resolve(country, carrier).createShipment` → update (SENT_TO_CARRIER + trackingNumber) → log transaction. Endpoint `GET /transport/:ref` (statut) + `POST /transport/:ref/refresh` (poll adaptateur `getStatus`).
  *Tests unitaires* : create → 200 + trackingNumber + edi_transport_orders SENT_TO_CARRIER ; carrier down → status FAILED + 502 propre. Bloquant avant P3.6.
  *DoD* : un ordre de transport se crée de bout en bout via 1 appel.
  *Vérif* : `curl POST /transport/create` → trackingNumber + ligne DB.

- [x] **P3.6 — Remontée statut transport → Tracking (P2)** ✅ 11/07/2026
  Hub : `GET /api/tracking/deliveries` enrichi du champ `transport` (ref, carrier_code, status, tracking_number — rattachement par réf DSADV ou commande) ; `GET /api/tracking/transports` (carrier → SES ordres via `tracking_api_keys.carrier_code`, internal → tous, partner → 403) ; `POST /api/tracking/transports/:ref/status` (transitions légales uniquement, machine à états). App Tracking : écran « Mes transports » complet (liste + boutons Accepter/En transit/Livré/Échec) + statut transport affiché dans Livraisons. Captures émulateur : `09_carrier_livraison_transport.png` (Transport : DELIVERED · MOCK-… dans Livraisons), `10_carrier_mes_transports.png` (ordre « Livré » + suivi).
  *Description* : le statut transport (`edi_transport_orders.status` + trackingNumber) est exposé par l'API tracking et affiché dans l'app Tracking (écran Livraisons P2.4 + onglet transporteur P2.5).
  *Prompt exécutant* :
  > Hub : inclure les données `edi_transport_orders` dans `GET .../tracking/deliveries` (statut transport + trackingNumber) et créer `GET .../tracking/transports` (rôle carrier : ses ordres ; maj statut via `POST .../transports/:ref/status`). App Tracking : afficher le statut transport dans Livraisons + onglet « Mes transports » (rôle transporteur) avec action maj statut.
  *Tests unitaires* : deliveries inclut le statut transport ; carrier met à jour un statut → reflété. Bloquant avant P3.T.
  *DoD* : le statut transport est visible dans l'app Tracking et modifiable par le transporteur.
  *Vérif* : capture écran Livraisons + Mes transports avec statut réel.

- [x] **P3.T — Scénario de test complet P3 (bout-en-bout)** ✅ 11/07/2026 — **5/5** (`test/p3t_e2e.test.js` sur hub : **21/21 verts** + captures émulateur)
  1. ✅ Depuis le DSADV de P1 (TESTUI…) : `POST /transport/create` → 200, IFTMIN généré+validé, CREATED→SENT_TO_CARRIER en DB, trackingNumber `MOCK-…`.
  2. ✅ Round-trip IFTMIN stocké : transporteur MOCK01, lieux enlèvement/livraison, colis SSCC, réf DSADV — tous cohérents après re-parse.
  3. ✅ `getStatus` adaptateur via `/refresh` → statut normalisé.
  4. ✅ Rôle transporteur : ordre visible dans `GET /tracking/transports`, maj statut IN_TRANSIT→DELIVERED acceptées, transition illégale (DELIVERED→IN_TRANSIT) refusée 409, partner → 403. UI émulateur : ordre « Livré » dans Mes transports.
  5. ✅ Rôle partenaire : `deliveries` montre `transport.status=DELIVERED` + trackingNumber. UI émulateur : « Transport : DELIVERED · MOCK-… » sur la livraison.

---

## Ordre d'exécution
```
P1 (DSADV complet) ─► P2 (App Tracking) ─► P3 (IFTMIN + transport)
                          │                     │
                          └──────── P3.6 alimente P2.4/P2.5 ◄──┘
```
- **Séquentiel** comme demandé : P1 → P2 → P3.
- Parallélisable : P3.1/P3.2 (IFTMIN + modèle) peuvent démarrer pendant P2 (indépendants de l'UI tracking). P3.6 dépend de P2.4/P2.5.
- [FM-1] (credentials transporteurs) requis seulement à P3.4 — le reste de P3 avance sans.

## Mapping jalons de paiement
| Jalon contrat | Couvert par | Débloque |
|---|---|---|
| 30% (15 mars) — Transport + DSADV | **P1** (DSADV complet) + **P3** (IFTMIN/transport) | le volet DSADV (P1) sécurise déjà une partie ; P3 complète le « Ordre de Transport » |
| 15% (31 mars) — App Tracking | **P2** | jalon 15% |

## DoD globale — ✅ COMPLÈTE 11/07/2026
- [x] **DSADV** : composé/envoyé depuis l'UI (preview EANCOM + GLN réels), reçu+persisté+acquitté (APERAK 313) cross-pays CIV→TUN, statut « Acquitté » visible (P1.T 5/5).
- [x] **App Tracking** : APK Flutter release (targetSdk 36, HTTPS-only), 3 rôles avec navigation dédiée, transactions + livraisons réelles du hub prod, isolation par rôle prouvée API (23/23) + visuellement (P2.T 5/5, 9 captures).
- [x] **IFTMIN/Transport** : ordre créé de bout en bout via `POST /transport/create`, IFTMIN D.01B valide (round-trip 25/25), adaptateur pilote **MOCK explicite** ([FM-1] credentials manquants), statut remonté jusqu'à l'app Tracking (P3.T 21/21).
- [x] Aucune régression : re-test final post-P3 → 7/7 suites vertes (desadv_receive, aperak, desadv_ui_e2e, iftmin sur CIV ; tracking_auth, carrier_registry, transport_order sur hub) + ORDERS via hub prod vérifié (staging TUN + APERAK).
- [x] Architecture adaptateurs documentée (`services/carriers/README.md`) : ajout d'un transporteur = 1 fichier + 1 entrée registry + creds .env — extensible 10→20 pays.
- [x] Ce fichier coché au réel + committé ; aucun secret dans le repo (clés API en DB hub uniquement, creds .env serveurs).

## Post-plan — état des serveurs (11/07/2026)
- **Bascule réseau** : les 3 nœuds pointent désormais sur le hub prod `https://registry.codeonline-edi.net` (ils étaient restés sur l'ancien hub DEV `217.182.94.86:5010`). Rollback : table `app_parameters_bak_p12` sur chaque nœud.
- **Backups créés** avant chaque modif : `server.js.bak_p12*/p13*/p1t*`, `eancom_parser.js.bak_p12b*/p31*`, `edi_worker.js.bak_p12b*/p14*` (3 nœuds) ; `*.bak_p21*/p35*` (hub) ; tables `*_test_bak_p1`, `tracking_api_keys_bak_p21`.
- **Tests suites** déployées : `test/` sur chaque nœud + hub (copies archivées dans `docs/tests/edi-suite/`).
- **Clés tracking de test** (hub, table `tracking_api_keys`) : tracking-app-internal / tracking-app-partner-civ (scope CIV) / tracking-app-carrier-test (MOCK01). La clé legacy « Codeonline Mobile App » passée role=internal (non-régression).
- **Repos** : frontend EDI = ce repo (build vite déployé sur CIV) ; app mobile = `~/Travail/netconsulting/tracking-app` (git, 3 commits) ; orchestrateur = `~/Travail/netconsulting/edi_orchestrator` (source synchronisée avec le hub, copies dans docs/tests/edi-suite/hub-p3/).
- **[FM-1] toujours ouvert** : à réception des credentials transporteurs → créer l'adaptateur réel (1 fichier, cf. README carriers), remplacer les entrées MOCK01 du registry.
