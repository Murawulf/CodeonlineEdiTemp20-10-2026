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

## P1 — DSADV complet : flux web bout-en-bout + réception/ACK 🔴 (jalon 30% — volet DSADV)
**Objectif** : composer un DSADV depuis l'app web à partir d'une commande, l'envoyer via le Hub, le destinataire le reçoit → parse → persiste (edi_desadv/lines/packages) → renvoie un APERAK ; statut visible côté émetteur.

- [ ] **P1.1 — Vérifier/compléter la réception DESADV (persistance métier)**
  *Description* : sur le backend pays (réf `/var/www/Edi-prod/backend/server.js`, route `POST /api/edi/receive`), s'assurer qu'un DESADV entrant, après parse, est persisté dans `edi_desadv` + `edi_desadv_lines` + `edi_packages` (pas seulement `edi_transmissions`). Ajouter le mapping parser→tables s'il manque.
  *Prompt exécutant* :
  > Sur le serveur `civ` (ssh civ), fichier `/var/www/Edi-prod/backend/server.js`, route `POST /api/edi/receive`. Après `parseEANCOM` + `validateParsedEANCOM`, si `messageType==='DESADV'`, insérer l'entête dans `edi_desadv`, les lignes dans `edi_desadv_lines`, les colis dans `edi_packages` (voir schémas via `SHOW COLUMNS`). Backup server.js avant modif. Ne toucher qu'au bloc DESADV. Redémarrer pm2 `codeonline-edi-cote-ivoire-prod`. Utiliser les creds DB du `.env` (`Entitedb`/`admin`).
  *Tests unitaires* : `test/desadv_receive.test.js` — poster un DESADV valide (généré par `generateDesadvEANCOM`) sur `/api/edi/receive`, vérifier 1 ligne `edi_desadv`, N lignes `edi_desadv_lines`, M `edi_packages`. Cas limite : DESADV sans colis (0 package) accepté. Bloquant avant P1.2.
  *DoD* : un DESADV reçu crée des enregistrements métier dans les 3 tables.
  *Vérif* : `ssh civ 'MYSQL_PWD=… mysql -uadmin Entitedb -e "SELECT COUNT(*) FROM edi_desadv WHERE created_at>NOW()-INTERVAL 5 MINUTE"'` → ≥ 1 après test.

- [ ] **P1.2 — APERAK automatique de retour**
  *Description* : à la réception d'un DESADV valide, le nœud génère un APERAK (accusé 313) et le renvoie à l'émetteur via le Hub (`/api/orchestrator/dispatch` avec messageType APERAK, receiver = sender du DESADV). En cas d'invalidité, APERAK de rejet (314).
  *Prompt exécutant* :
  > Backend pays : après persistance DESADV (P1.1), appeler un générateur APERAK (créer `generateAperakEANCOM.js` s'il n'existe pas côté nœud — réf : le hub `AckController` sait déjà en produire) avec function code 313 (ACK) ou 314 (NACK) + référence du document reçu. Dispatcher via `POST https://registry.codeonline-edi.net/api/orchestrator/dispatch` (senderGln = receiver du DESADV, receiverGln = sender du DESADV, messageType=APERAK). Logger la transmission APERAK OUTBOUND.
  *Tests unitaires* : `test/aperak.test.js` — DESADV valide → APERAK 313 émis ; DESADV invalide → APERAK 314. Vérifier le dispatch (mock hub ou vrai). Bloquant avant P1.3.
  *DoD* : chaque DESADV reçu génère un APERAK dispatché à l'émetteur.
  *Vérif* : logs `pm2 logs …-prod` montrent `APERAK dispatched` + transaction APERAK sur le hub.

- [ ] **P1.3 — UI web : composer + envoyer un DSADV depuis une commande**
  *Description* : écran React (app `/var/www/Edi-prod` frontend, repo source local `~/Travail/netconsulting/civapk`? NON — le frontend EDI web = build servi ; source = repo Codeonline-EDI). Ajouter un écran « Créer avis d'expédition » à partir d'une commande validée : sélection commande → lignes → colis/SSCC → génération DSADV → bouton Envoyer (appelle `/api/edi/desadv/send`).
  *Prompt exécutant* :
  > Dans le repo source du frontend EDI (React, celui qui build `/var/www/Edi-prod/assets`), ajouter la page « Créer DSADV » sous le menu Opérations : formulaire (commande source, lignes livrées, colis avec SSCC + poids/mesures), preview de l'EANCOM généré, bouton « Envoyer » → `POST /api/edi/desadv/send` avec le body attendu par la route existante. Rebuild + déployer sur le serveur cible.
  *Tests unitaires* : test composant (formulaire → payload correct) + e2e : remplir → envoyer → transmission OUTBOUND créée. Bloquant avant P1.4.
  *DoD* : un utilisateur crée et envoie un DSADV depuis l'UI sans passer par l'API à la main.
  *Vérif* : capture d'écran de l'écran + `edi_transmissions` OUTBOUND DESADV après envoi UI.

- [ ] **P1.4 — Suivi statut DSADV côté émetteur (UI + APERAK)**
  *Description* : afficher dans l'app le statut d'un DSADV envoyé (ENVOYÉ → LIVRÉ/ACQUITTÉ via l'APERAK reçu, ou REJETÉ). Consommer l'APERAK entrant pour mettre à jour `edi_transmissions.status`.
  *Prompt exécutant* :
  > Backend : à la réception d'un APERAK (`/api/edi/receive`, messageType APERAK), retrouver la transmission DESADV référencée et passer son statut à ACKNOWLEDGED (313) ou REJECTED (314). Frontend : colonne statut dans la liste des expéditions + badge. Déployer.
  *Tests unitaires* : APERAK 313 → statut ACKNOWLEDGED ; 314 → REJECTED. Bloquant avant P1.T.
  *DoD* : le statut d'un DSADV reflète l'APERAK reçu, visible dans l'UI.
  *Vérif* : requête statut transmission après cycle complet.

- [ ] **P1.T — Scénario de test complet P1 (bout-en-bout cross-pays)**
  1. Sur l'app CIV, créer un DSADV pour une commande (2 lignes, 1 colis SSCC) à destination TUN → attendu : EANCOM généré, envoi 200, transmission OUTBOUND.
  2. Le Hub route vers TUN → attendu : transaction DELIVERED sur le hub.
  3. TUN reçoit → parse → persiste (`edi_desadv`=1, lines=2, packages=1) → attendu : PROCESSED.
  4. TUN renvoie un APERAK 313 → CIV le reçoit → attendu : statut DSADV = ACKNOWLEDGED côté CIV.
  5. Vérifier l'UI CIV affiche « Acquitté ».
  Critères : 5/5 étapes OK, 0 erreur log, données cohérentes dans les 3 tables. Phase cochable seulement si tout passe.

---

## P2 — App Tracking (Flutter, base civapk) — 3 rôles 🔴 (jalon 15%)
**Objectif** : app mobile Flutter qui consomme l'API tracking du Hub, avec 3 profils (partenaire entreprise, interne Codeonline, transporteur), authentifiée par clé/API du hub.

- [ ] **P2.1 — Compléter/sécuriser l'API tracking du Hub (auth + rôles + données livraison)**
  *Description* : sur le hub (`/var/www/Edi-prod/edi_orchestrator`, `TrackingController.js` + `routes/tracking.js`), (a) vérifier l'auth par `tracking_api_keys` (header clé) sur tous les endpoints ; (b) ajouter la notion de **rôle** (partner/internal/carrier) à la clé + filtrage des données par rôle (un partenaire ne voit que ses GLN) ; (c) exposer les données de **livraison** (statut colis/DSADV/transport) en plus des transactions.
  *Prompt exécutant* :
  > Hub (ssh hub-prod, `/var/www/Edi-prod/edi_orchestrator`). Middleware auth : valider `x-tracking-key` contre `tracking_api_keys` (ajouter colonne `role` + `scope_gln` à la table si absent). Endpoints : filtrer `/transactions`, `/orders`, `/partners/:gln/timeline` selon le rôle/scope. Ajouter `GET /api/orchestrator/tracking/deliveries` (statut livraisons depuis `order_tracking_summary` + DESADV/transport). pm2 restart orchestrateur. Backup .env + code.
  *Tests unitaires* : `test/tracking_auth.test.js` — clé partner ne voit que ses GLN ; clé internal voit tout ; clé absente → 401. Bloquant avant P2.2.
  *DoD* : API tracking authentifiée, filtrée par rôle, expose transactions + livraisons.
  *Vérif* : `curl` avec clé partner vs internal → jeux de données différents ; sans clé → 401.

- [ ] **P2.2 — Projet Flutter Tracking (structure + auth + config)**
  *Description* : nouvelle app Flutter (repo `~/Travail/netconsulting/tracking-app` OU nouveau flavor/module dans civapk — décider : app SÉPARÉE). Écran login (clé/compte → rôle), config `hubApiBase = https://registry.codeonline-edi.net`, stockage sécurisé du token/clé.
  *Prompt exécutant* :
  > Créer une app Flutter dédiée `~/Travail/netconsulting/tracking-app` (base réutilisée de civapk pour le style/HTTP). Écran d'authentification → récupère la clé tracking + rôle. `AppConfig.hubApiBase='https://registry.codeonline-edi.net'`. Client HTTP ajoutant `x-tracking-key`. Stockage sécurisé (flutter_secure_storage). targetSdk 36, pas de cleartext.
  *Tests unitaires* : login OK → token stocké ; login KO → message. `flutter analyze` 0 erreur. Bloquant avant P2.3.
  *DoD* : l'app démarre, s'authentifie contre le hub, mémorise le rôle.
  *Vérif* : lancer sur émulateur, login avec une vraie clé → dashboard vide accessible.

- [ ] **P2.3 — Écran suivi transactions EDI (liste + détail + timeline)**
  *Description* : liste des transactions (ORDERS/INVOIC/DESADV/APERAK) avec filtres (type, statut, date, partenaire), détail d'une transaction, timeline (`/transactions/:ref/history`).
  *Prompt exécutant* :
  > App tracking : écran « Transactions » → `GET /api/orchestrator/tracking/transactions` (filtré par rôle). Cartes par transaction (type, sender→receiver, statut, date). Tap → détail + timeline via `/transactions/:ref/history`. Pull-to-refresh.
  *Tests unitaires* : rendu liste depuis réponse API mockée ; filtre par type. Bloquant avant P2.4.
  *DoD* : les transactions réelles du réseau s'affichent, filtrables, avec timeline.
  *Vérif* : capture écran avec vraies transactions du hub.

- [ ] **P2.4 — Écran suivi livraison (colis / DSADV / transport)**
  *Description* : suivi des expéditions : statut DSADV, colis/SSCC, et (quand P3 livré) statut transport. Recherche par référence commande/expédition.
  *Prompt exécutant* :
  > App tracking : écran « Livraisons » → `GET .../tracking/deliveries`. Vue par expédition : produits, colis (SSCC), statut (préparé→expédié→en transit→livré). Recherche par réf. Prévoir le champ statut transport (aliment. par P3).
  *Tests unitaires* : rendu depuis API ; recherche par réf. Bloquant avant P2.5.
  *DoD* : l'utilisateur suit une livraison de bout en bout.
  *Vérif* : capture écran d'une livraison réelle (DSADV de P1).

- [ ] **P2.5 — Rôles/permissions + alertes**
  *Description* : adapter l'UI selon le rôle (partenaire : ses données ; interne : monitoring réseau global + alertes ; transporteur : ses ordres de transport + maj statut). Écran alertes (`/alerts`).
  *Prompt exécutant* :
  > App tracking : router les écrans/menus selon le rôle récupéré au login. Interne → onglet « Réseau » (stats globales, alertes `/alerts`). Transporteur → onglet « Mes transports » (préparation P3). Partenaire → ses transactions/livraisons. Notifications locales sur nouvelle alerte.
  *Tests unitaires* : 3 rôles → 3 jeux d'écrans/menus. Bloquant avant P2.T.
  *DoD* : chaque rôle a son expérience ; interne voit les alertes réseau.
  *Vérif* : captures des 3 rôles.

- [ ] **P2.T — Scénario de test complet P2 (émulateur, vraies API hub)**
  1. Login rôle **partenaire** (clé scoped GLN CIV) → attendu : ne voit que les transactions CIV.
  2. Login rôle **interne** → attendu : voit les 3 pays + alertes réseau.
  3. Ouvrir une transaction DESADV (celle de P1) → timeline complète affichée.
  4. Écran livraisons → l'expédition de P1 apparaît avec son statut.
  5. Build APK release + install émulateur, pas de crash, HTTPS-only.
  Critères : 5/5, isolation des données par rôle prouvée, APK installable. Phase cochable seulement si tout passe.

---

## P3 — IFTMIN Ordre de Transport + adaptateurs transporteurs (mutualisés sur le Hub) 🔴 (jalon 30% — volet Transport)
**Objectif** : générer un IFTMIN valide, le Hub sélectionne le transporteur (par pays/critère), appelle son API via un adaptateur mutualisé, et remonte le statut dans le tracking. Extensible 3→10→20 pays.

**[FM-1]** Credentials + doc API des transporteurs requis pour P3.4/P3.5 (appel réel). Sinon adaptateur mock explicite.

- [ ] **P3.1 — Générateur + parser IFTMIN (message EANCOM transport)**
  *Description* : créer `generateIftminEANCOM.js` (nœud pays ou hub) produisant un IFTMIN valide (segments UNH+IFTMIN, BGM, DTM, TDT/EQD, NAD parties, GID/PAC marchandise, LOC lieux, RFF réf commande/DSADV). Étendre `eancom_parser.js` pour parser IFTMIN.
  *Prompt exécutant* :
  > Créer `/var/www/Edi-prod/backend/generateIftminEANCOM.js` : fonction `generateIftminEANCOM(data)` → IFTMIN:D:xx:UN. Segments : UNH, BGM+610, DTM, TDT (mode transport), LOC (enlèvement/livraison), NAD (expéditeur/destinataire/transporteur), GID/PAC/MEA (colis), RFF (commande + DSADV liés). Étendre `eancom_parser.js` : `case 'IFTMIN'` + segments LOC/GID/TDT/EQD. Ajouter IFTMIN à `validateParsedEANCOM` (champs requis : transporteur, lieux, colis).
  *Tests unitaires* : `test/iftmin.test.js` — générer puis parser un IFTMIN → round-trip cohérent ; validation rejette IFTMIN sans lieu de livraison. Bloquant avant P3.2.
  *DoD* : IFTMIN généré + reparsé sans perte, validé.
  *Vérif* : `node test/iftmin.test.js` → tous verts.

- [ ] **P3.2 — Modèle « Ordre de Transport » (DB + statut)**
  *Description* : compléter `edi_transport_orders` (colonnes : ref, order_ref, desadv_ref, carrier_id, country_code, status, iftmin_content, tracking_number, created_at, updated_at). Statuts : CREATED → SENT_TO_CARRIER → ACCEPTED → IN_TRANSIT → DELIVERED / FAILED.
  *Prompt exécutant* :
  > Sur le hub (les ordres de transport sont mutualisés) : `ALTER/CREATE edi_transport_orders` (voir colonnes ci-dessus) dans `codeonline_edi_db_prod`. Backup avant. Créer le modèle d'accès (CRUD + transitions de statut).
  *Tests unitaires* : insert + transitions de statut valides ; transition illégale rejetée. Bloquant avant P3.3.
  *DoD* : table + CRUD + machine à états opérationnels.
  *Vérif* : `SELECT` structure + test transitions.

- [ ] **P3.3 — Couche adaptateurs transporteurs (interface commune, mutualisée sur le Hub)**
  *Description* : sur le hub, créer `services/carriers/` avec une **interface commune** `CarrierAdapter` (méthodes `createShipment(iftmin)`, `getStatus(trackingNumber)`, `cancel()`), un **registry** (résolution par pays + transporteur), et la config credentials par `.env` (jamais commit). Chaque transporteur = 1 fichier adaptateur implémentant l'interface.
  *Prompt exécutant* :
  > Hub `/var/www/Edi-prod/edi_orchestrator/services/carriers/` : `CarrierAdapter.js` (interface/contrat), `registry.js` (map `{country_code, carrier_code} -> adapter`), lecture credentials depuis `.env` (`CARRIER_<CODE>_API_KEY`…). Un adaptateur défaillant ne casse pas les autres (try/catch + statut FAILED). Documenter le contrat pour ajouter un transporteur en < 1 fichier.
  *Tests unitaires* : `test/carrier_registry.test.js` — résolution par pays+code ; adaptateur inconnu → erreur claire ; isolation (1 adapter throw → les autres OK). Bloquant avant P3.4.
  *DoD* : ajouter un transporteur = créer 1 fichier adaptateur + 1 entrée registry + creds .env.
  *Vérif* : test registry vert + doc `services/carriers/README.md`.

- [ ] **P3.4 — Premier adaptateur transporteur pilote (1 pays)**
  *Description* : implémenter 1 adaptateur réel pour 1 transporteur d'un pays adhérent (via [FM-1] credentials). Mappe IFTMIN → payload API transporteur → crée l'expédition → récupère tracking number + statut. Si credentials indisponibles : adaptateur **mock** documenté (à remplacer).
  *Prompt exécutant* :
  > Implémenter `services/carriers/<pays>_<transporteur>.js` selon la doc API fournie ([FM-1]) : `createShipment(iftmin)` → POST API transporteur → retourne `{trackingNumber, status}`. `getStatus()` → GET statut. Gérer auth (clé/token du .env), erreurs, timeouts. Si pas de credentials : mock renvoyant des statuts simulés, marqué `// MOCK — remplacer dès credentials [FM-1]`.
  *Tests unitaires* : createShipment → trackingNumber non vide ; getStatus → statut normalisé. Bloquant avant P3.5.
  *DoD* : 1 transporteur réel (ou mock explicite) crée une expédition depuis un IFTMIN.
  *Vérif* : appel réel/mock → trackingNumber + statut retournés.

- [ ] **P3.5 — Route Hub « créer ordre de transport » (orchestration complète)**
  *Description* : `POST /api/orchestrator/transport/create` : reçoit une demande (order_ref/desadv_ref + transporteur choisi) → génère l'IFTMIN → enregistre `edi_transport_orders` → appelle l'adaptateur → stocke trackingNumber + statut → journalise dans `transactions`.
  *Prompt exécutant* :
  > Hub : route `POST /api/orchestrator/transport/create` (auth JWT réseau ou clé). Pipeline : valider → `generateIftminEANCOM` → insert `edi_transport_orders` (CREATED) → `registry.resolve(country, carrier).createShipment` → update (SENT_TO_CARRIER + trackingNumber) → log transaction. Endpoint `GET /transport/:ref` (statut) + `POST /transport/:ref/refresh` (poll adaptateur `getStatus`).
  *Tests unitaires* : create → 200 + trackingNumber + edi_transport_orders SENT_TO_CARRIER ; carrier down → status FAILED + 502 propre. Bloquant avant P3.6.
  *DoD* : un ordre de transport se crée de bout en bout via 1 appel.
  *Vérif* : `curl POST /transport/create` → trackingNumber + ligne DB.

- [ ] **P3.6 — Remontée statut transport → Tracking (P2)**
  *Description* : le statut transport (`edi_transport_orders.status` + trackingNumber) est exposé par l'API tracking et affiché dans l'app Tracking (écran Livraisons P2.4 + onglet transporteur P2.5).
  *Prompt exécutant* :
  > Hub : inclure les données `edi_transport_orders` dans `GET .../tracking/deliveries` (statut transport + trackingNumber) et créer `GET .../tracking/transports` (rôle carrier : ses ordres ; maj statut via `POST .../transports/:ref/status`). App Tracking : afficher le statut transport dans Livraisons + onglet « Mes transports » (rôle transporteur) avec action maj statut.
  *Tests unitaires* : deliveries inclut le statut transport ; carrier met à jour un statut → reflété. Bloquant avant P3.T.
  *DoD* : le statut transport est visible dans l'app Tracking et modifiable par le transporteur.
  *Vérif* : capture écran Livraisons + Mes transports avec statut réel.

- [ ] **P3.T — Scénario de test complet P3 (bout-en-bout)**
  1. Depuis un DSADV existant (P1), créer un ordre de transport via `POST /transport/create` (transporteur pilote) → attendu : 200, IFTMIN généré, `edi_transport_orders` CREATED→SENT_TO_CARRIER, trackingNumber présent.
  2. Round-trip IFTMIN : générer → parser → champs cohérents (transporteur, lieux, colis, réf DSADV).
  3. `getStatus` via adaptateur → statut normalisé (IN_TRANSIT).
  4. App Tracking (rôle transporteur) → l'ordre apparaît, maj statut → DELIVERED.
  5. App Tracking (rôle partenaire) → la livraison montre « Livré » + trackingNumber.
  Critères : 5/5, IFTMIN valide, adaptateur isolé, statut propagé jusqu'à l'app. Phase cochable seulement si tout passe.

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

## DoD globale
- [ ] **DSADV** : composé/envoyé depuis l'UI, reçu+persisté+acquitté (APERAK) cross-pays, statut visible (P1.T vert).
- [ ] **App Tracking** : APK Flutter, 3 rôles, transactions + livraisons réelles du hub, isolation par rôle prouvée (P2.T vert).
- [ ] **IFTMIN/Transport** : ordre de transport créé de bout en bout, IFTMIN valide, ≥ 1 adaptateur transporteur (réel ou mock explicite), statut remonté au tracking (P3.T vert).
- [ ] Aucun régression sur ORDERS/INVOIC/DESADV/dispatch existants (re-test rapide après chaque phase).
- [ ] Architecture adaptateurs documentée (ajout d'un transporteur = 1 fichier) — prêt pour 10→20 pays.
- [ ] Ce fichier coché au réel + committé ; aucun secret dans le repo.
