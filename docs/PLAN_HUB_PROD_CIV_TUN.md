# PLAN — Mise en PROD du Hub orchestrateur EDI (registry) + test EANCOM CIV PROD ↔ TUN PROD

> **But** : disposer d'un **Hub orchestrateur PROD** isolé du DEV, et prouver l'échange EANCOM (ORDERS + INVOIC) **CIV PROD ↔ TUN PROD** dans les deux sens.
> **Critère de succès mesurable** : 4 messages (ORDERS CIV→TUN, ORDERS TUN→CIV, INVOIC CIV→TUN, INVOIC TUN→CIV) en statut `DELIVERED` dans `transactions` du Hub PROD **et** persistés en `edi_transmissions` (INBOUND) chez le destinataire PROD. Aucune régression sur le trafic PROD existant.
> **Exécutant** : IA (Claude Code) ou dev. Cocher `[x]` = DoD vérifié sur sortie réelle.

---

## 0. État d'entrée (faits vérifiés le 2026-06-13)

### Connu (vérifié cette session)
- **CIV PROD** : serveur `37.27.62.103` (alias SSH `civ`, user `consultant`), repo `/var/www/Edi-prod`, **port 5000**, DB **`Entitedb`**, PM2 `codeonline-edi-cote-ivoire-prod`, domaine `https://civ.codeonline-edi.net`. **Code = n-1** de la version corrigée (commit `0c46958` sur `main`).
- **Hub DEV (référence)** : `/var/www/Edi-dev/edi_orchestrator/` sur serveur TUN DEV `217.182.94.86`, **port 5010**, DB **`codeonline_edi_db`**. Routes : `POST /api/orchestrator/relay` (+`/dispatch`), `/ack`, `/audit/sync`, `GET /discovery`, `GET /api/tracking/health`. Annuaire = table `partners(gln,name,country_code,target_url,status)`. Journal = table `transactions`.
- **Correctif Hub DEV appliqué** : `edi_orchestrator/services/routingService.js` mint un **JWT HS256** (module `crypto`, sans dépendance) + en-tête `Authorization: Bearer` à chaque relais ; `JWT_SECRET` ajouté à `edi_orchestrator/.env`. Sauvegarde `.bak.<ts>` sur serveur. **Le code Hub n'est PAS sous git** (à intégrer au repo principal).
- **Contrat de relais** (payload Hub `relay`, texte clair) : `{ senderGln, receiverGln, eancomContent, messageType, filename, transactionRef, orderRef }` → routé vers `target_url` du destinataire (`/api/edi/receive`).
- **Réception nœud** : `POST /api/edi/receive` (texte clair, `parseEANCOM` + persistance `edi_transmissions`) ; `POST /api/p2p/receive` (chiffré RSA, non utilisé ici).
- **Auth nœud** : middleware global `app.use('/api', verifyJWT)` avec allowlist `JWT_EXCLUDED_PATHS` (login, settings, companies/template). `/api/edi/receive` est protégé → exige Bearer JWT signé avec le `JWT_SECRET` du réseau.
- **GLN DEV (référence)** : TUN `6191234567890`, CIV `6181234567890`, SEN `SN02583102G3`.
- **Correctif repo** : `backend/scripts/init_db_params.js` rend `EDI_ORDERS_PATH` surchargeable via `process.env.EDI_ORDERS_PATH` (commit `0c46958`).

### INCONNU — à établir en P0 (ne pas supposer)
- **TUN PROD** : host/IP, user SSH, port Node, DB, domaine, chemin repo, version de code déployée, état de divergence vs `main`. *Mentionné comme « diverge de la dernière version ».*
- **GLN réels PROD** des entités CIV PROD et TUN PROD (peuvent différer des GLN DEV de test).
- **Emplacement cible du Hub PROD** : même serveur que TUN PROD (port dédié) ou serveur séparé.
- **`JWT_SECRET` PROD** : doit être un secret **distinct du DEV**, partagé par CIV PROD + TUN PROD + Hub PROD.
- **Exposition réseau** : le Hub PROD doit-il être public (sous-domaine `hub.codeonline-edi.net`) ou interne (IP:port + firewall) ?

### Règles NON NÉGOCIABLES
1. **Isolation DEV/PROD totale.** Hub PROD = DB séparée, port séparé, `JWT_SECRET` PROD distinct, annuaire `partners` PROD propre. Interdit de réutiliser la DB `codeonline_edi_db` DEV ou le secret DEV.
2. **Aucune régression sur le trafic PROD existant.** Toute modif d'un nœud PROD (CIV/TUN) doit être précédée d'un backup (DB + code + `.env`) et réversible. Déploiement applicatif PROD = fenêtre validée par GATE humain.
3. **Backups obligatoires avant toute opération destructive** (déploiement, migration, restart). Horodatés.
4. **Secrets jamais commités.** `JWT_SECRET` PROD et `.env` PROD restent hors git.
5. **Chiffres mesurés, jamais espérés.** Tout `DELIVERED`/`200`/compte de tables provient d'une sortie réellement lue.
6. **Données manquantes signalées, jamais inventées** (notamment GLN réels, coordonnées TUN PROD).
7. **Pas de test de charge / volume sur PROD.** Uniquement les 4 messages de validation, avec des `transactionRef` préfixés `TESTPROD-` pour traçabilité et nettoyage.

## Règles d'exécution (recopiées du skill plan-action)
1. **Cocher = prouvé.** Case cochée seulement après DoD vérifié sur sortie réelle.
2. **Ordre strict.** Tests unitaires d'une tâche verts AVANT la tâche suivante. Scénario de phase passé AVANT de cocher la phase.
3. **Échec ≠ contournement.** Test échoué → corriger ou documenter le blocage (tâche corrective ajoutée). Jamais affaiblir un test.
4. **Chiffres mesurés, jamais espérés.**
5. **Mettre à jour ce fichier** à chaque tâche finie (cocher + noter écarts) et committer (1 tâche = 1 commit).
6. **Ne pas halluciner** pour combler un manque.
7. **Respecter les règles non négociables** ci-dessus.

---

## P0 — Recon PROD & décisions d'architecture 🔴
**Objectif** : établir tous les faits PROD inconnus et figer les choix d'architecture avant toute modification.

- [ ] **P0.1 — Recensement TUN PROD**
  *Description* : récupérer host/IP, user SSH, port Node, DB, domaine, chemin repo, version de code (commit/hash ou date), PM2 name de l'instance TUN PROD. Vérifier présence des routes `/api/edi/receive` et `/api/orchestrator` côté TUN PROD.
  *Prompt exécutant* :
  > Tu dois documenter l'instance **TUN PROD** de Codeonline EDI. Demande à l'opérateur les coordonnées SSH si absentes. Une fois connecté : `pm2 list` (repérer l'app PROD TUN), lire `<repo_prod>/backend/.env` (DB_NAME, PORT, DB creds — ne pas les divulguer en clair dans le rapport, juste confirmer présence), `git -C <repo_prod> log -1 --oneline` si repo git, et `grep -nE "api/edi/receive|JWT_EXCLUDED_PATHS|app.use\('/api'" <repo_prod>/backend/server.js`. Produire un tableau : host, user, port, DB, domaine, repo path, PM2 name, version/commit, présence route receive (oui/non), allowlist JWT actuelle. Écrire le résultat dans `docs/PLAN_HUB_PROD_CIV_TUN.md` section P0.1 (remplacer les `<…>`).
  *Tests unitaires* : N/A (recon). Bloquant : le tableau doit être 100 % renseigné (aucun `<…>` restant) avant P0.2.
  *DoD* : tableau TUN PROD complet inscrit dans ce fichier ; accès SSH TUN PROD confirmé (`ssh <tun_prod> "echo ok"` → `ok`).
  *Vérif* : `ssh <tun_prod> "pm2 list | grep -i prod"` → ligne PM2 de l'app PROD affichée.

- [ ] **P0.2 — Recensement CIV PROD (confirmation)**
  *Description* : confirmer les faits CIV PROD connus + version exacte du code vs `main` (`0c46958`).
  *Prompt exécutant* :
  > Connecte-toi `ssh civ`. Vérifie : `pm2 info codeonline-edi-cote-ivoire-prod | grep -E 'cwd|status'`, `git -C /var/www/Edi-prod log -1 --oneline 2>/dev/null || echo "no-git"`, `grep -c "process.env.EDI_ORDERS_PATH" /var/www/Edi-prod/backend/scripts/init_db_params.js` (0 = version n-1 sans le correctif). Reporter dans P0.2 : commit/version CIV PROD, présence du correctif EDI_ORDERS_PATH (oui/non), chemin EDI_ORDERS_PATH actuel en base (`SELECT param_value FROM app_parameters WHERE param_key='EDI_ORDERS_PATH'` sur DB `Entitedb`).
  *Tests unitaires* : N/A. Bloquant avant P0.3.
  *DoD* : version CIV PROD + delta vs `main` documentés dans ce fichier.
  *Vérif* : `ssh civ "grep -c process.env.EDI_ORDERS_PATH /var/www/Edi-prod/backend/scripts/init_db_params.js"` → `0` ou `1` (valeur notée).

- [ ] **P0.3 — Inventaire des GLN réels PROD**
  *Description* : obtenir les GLN officiels des entités CIV PROD et TUN PROD à utiliser dans l'annuaire PROD. Si non disponibles, définir des GLN de test PROD dédiés (préfixés, distincts du DEV) et le documenter.
  *Prompt exécutant* :
  > Demande à l'opérateur les **GLN officiels** des entités émettrices/réceptrices CIV PROD et TUN PROD. À défaut, lis en base PROD un GLN d'entité réelle : `SELECT gln, raison_sociale FROM Entite WHERE gln IS NOT NULL LIMIT 5` sur CIV `Entitedb` et sur TUN PROD DB. Proposer un mapping GLN→pays pour l'annuaire PROD. Si aucun GLN réel, définir `TUNPROD-GLN`/`CIVPROD-GLN` explicitement marqués « test PROD ». Écrire le mapping dans P0.3.
  *Tests unitaires* : N/A. Bloquant avant P1.
  *DoD* : table `pays → GLN PROD → rôle` figée dans ce fichier.
  *Vérif* : section P0.3 contient au moins un GLN par pays.

- [ ] **P0.G — GATE humain : décisions d'architecture PROD**
  Décisions à valider par l'opérateur AVANT P1 (consigner la réponse dans ce fichier) :
  1. **Hébergement Hub PROD** : (a) même serveur que TUN PROD, port dédié `5012` ; (b) serveur séparé. → *Recommandation : (a) si TUN PROD a la ressource, sinon (b).*
  2. **Exposition** : (a) interne IP:port + firewall (CIV PROD doit pouvoir l'atteindre) ; (b) sous-domaine public `hub.codeonline-edi.net` + TLS. → *Recommandation : (b) avec TLS Let's Encrypt + restriction par service token (déjà en place).* 
  3. **Alignement de version des nœuds PROD** : (a) déployer la version corrigée `main` sur CIV PROD **et** TUN PROD (aligne tout, risque déploiement) ; (b) appliquer uniquement le minimum EDI (route receive + correctif path + GLN) sans déploiement applicatif complet. → *Recommandation : (a) pour CIV PROD (n-1, faible delta) ; pour TUN PROD, trancher après P0.1 selon l'ampleur de la divergence.*
  4. **`JWT_SECRET` PROD** : générer `openssl rand -base64 64` dédié PROD. Confirmer le canal de distribution sécurisé.
  **La phase P0 n'est cochable que si ces 4 décisions sont écrites dans ce fichier.**

- [ ] **P0.T — Scénario de test complet P0**
  1. `ssh <tun_prod> "echo ok"` → `ok`. 2. `ssh civ "echo ok"` → `ok`. 3. Les sections P0.1, P0.2, P0.3 ne contiennent plus aucun `<…>`. 4. Les 4 décisions du GATE sont consignées.
  Critères de réussite : 4/4. Phase cochable seulement si tout passe.

**GATE humain** : l'opérateur valide P0.G avant P1.

---

## P1 — Provisionner le Hub PROD (isolé) 🔴
**Objectif** : un Hub orchestrateur PROD opérationnel, isolé du DEV (DB, port, secret propres), répondant `health` 200.

- [ ] **P1.1 — Créer la DB Hub PROD**
  *Description* : créer `codeonline_edi_db_prod` + tables `partners`, `transactions` (+ celles requises par le Hub : `order_tracking_summary`, `tracking_api_keys`). Réutiliser le schéma du Hub DEV.
  *Prompt exécutant* :
  > Sur le serveur hôte du Hub PROD (cf. P0.G décision 1). Dump du schéma Hub DEV : `ssh <tun_dev> "MYSQL_PWD=… mysqldump --no-data codeonline_edi_db"` → charger dans une nouvelle DB `codeonline_edi_db_prod` sur l'hôte PROD. Créer un user MySQL dédié PROD (droits limités à cette DB). Vérifier `SHOW TABLES` = mêmes tables que DEV.
  *Tests unitaires* : `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='codeonline_edi_db_prod'` ≥ 4. Bloquant avant P1.2.
  *DoD* : DB `codeonline_edi_db_prod` existe avec le schéma Hub complet, `partners` vide.
  *Vérif* : `mysql -e "SHOW TABLES FROM codeonline_edi_db_prod"` → liste incluant `partners`, `transactions`.

- [ ] **P1.2 — Déployer le code Hub en PROD**
  *Description* : copier `edi_orchestrator/` (avec le correctif `routingService.js` mint-JWT) vers un répertoire PROD dédié (ex. `/var/www/Edi-prod/edi_orchestrator`). `.env` PROD : `PORT` dédié (ex. 5012), `DB_NAME=codeonline_edi_db_prod`, creds PROD, `JWT_SECRET=<secret PROD>`, `API_PIN` PROD.
  *Prompt exécutant* :
  > Copier le dossier Hub (source = Hub DEV corrigé `/var/www/Edi-dev/edi_orchestrator`, incluant `services/routingService.js` patché) vers `<hub_prod_path>`. Créer `<hub_prod_path>/.env` avec : PORT=<port décidé>, DB_HOST=127.0.0.1, DB_NAME=codeonline_edi_db_prod, DB_USER/DB_PASSWORD=<creds PROD>, JWT_SECRET=<secret PROD généré>, API_PIN=<pin PROD>. `npm install --production` dans le dossier. NE PAS réutiliser le secret/DB/PIN du DEV.
  *Tests unitaires* : `node -e "require('<hub_prod_path>/services/routingService.js')"` sans erreur ; `grep -c mintServiceToken <hub_prod_path>/services/routingService.js` = 1 (correctif présent). Bloquant avant P1.3.
  *DoD* : code Hub PROD en place, `.env` PROD rempli (secrets hors git), correctif mint-JWT présent.
  *Vérif* : `grep -c "Authorization.*Bearer" <hub_prod_path>/services/routingService.js` ≥ 1.

- [ ] **P1.3 — Démarrer le Hub PROD sous PM2 + (option) vhost TLS**
  *Description* : lancer `codeonline-edi-orchestrator-prod` sous PM2 (port dédié). Si décision P0.G.2 = public : vhost Apache `hub.codeonline-edi.net` + certbot, proxy vers le port Hub PROD. Sinon : ouvrir le port au seul CIV PROD (firewall).
  *Prompt exécutant* :
  > Démarrer le Hub PROD : `pm2 start <hub_prod_path>/server.js --name codeonline-edi-orchestrator-prod` puis `pm2 save`. Si exposition publique décidée : créer vhost Apache `hub.codeonline-edi.net` (proxy `/` → `http://localhost:<port>`), `certbot --webroot` pour TLS, recharger Apache (réutiliser le pattern de `fix_apache_cote_ivoire_v2_prod.sh`, NE PAS toucher aux vhosts existants). Sinon configurer le firewall pour autoriser l'IP CIV PROD vers le port Hub.
  *Tests unitaires* : `pm2 list | grep orchestrator-prod` = `online`. Bloquant avant P1.T.
  *DoD* : Hub PROD répond `health` 200 depuis le serveur CIV PROD.
  *Vérif* : `ssh civ "curl -s -m5 -o /dev/null -w '%{http_code}' <HUB_PROD_URL>/api/tracking/health"` → `200`.

- [ ] **P1.T — Scénario de test complet P1**
  1. `health` Hub PROD depuis CIV PROD → `200`. 2. `SELECT COUNT(*) FROM codeonline_edi_db_prod.partners` → `0`. 3. `pm2 list` → `codeonline-edi-orchestrator-prod` online. 4. Confirmer isolation : `JWT_SECRET` PROD ≠ DEV (`md5sum` des deux diffèrent), DB ≠ DEV, port ≠ 5010.
  Critères de réussite : 4/4. Phase cochable seulement si tout passe.

---

## P2 — Aligner CIV PROD (version corrigée + config EDI) 🔴
**Objectif** : CIV PROD sur la version corrigée, GLN PROD défini, chemin EANCOM inscriptible, pointant vers le Hub PROD.

- [ ] **P2.1 — Backup CIV PROD (code + DB + .env)**
  *Description* : sauvegarde complète avant tout changement PROD.
  *Prompt exécutant* :
  > `ssh civ` : `cp -r /var/www/Edi-prod/backend /var/www/Edi-prod/_BACKUPS/backend_$(date +%Y%m%d_%H%M%S)` ; `MYSQL_PWD=… mysqldump Entitedb > /var/www/Edi-prod/_BACKUPS/Entitedb_$(date +%Y%m%d_%H%M%S).sql` ; `cp /var/www/Edi-prod/backend/.env /var/www/Edi-prod/_BACKUPS/env_$(date +%Y%m%d_%H%M%S)`.
  *Tests unitaires* : les 3 fichiers backup existent et > 0 octet. Bloquant avant P2.2.
  *DoD* : backup code + dump DB + .env présents et non vides.
  *Vérif* : `ssh civ "ls -l /var/www/Edi-prod/_BACKUPS/ | tail -3"` → 3 entrées horodatées récentes.

- [ ] **P2.2 — Déployer la version corrigée sur CIV PROD**
  *Description* : déployer `main` (`0c46958`) sur CIV PROD via le script de déploiement PROD existant (`deploy_universal.sh deploy_configs/cote_ivoire_prod.conf`), qui build + rsync + `init_db_params` + restart PM2. (Décision P0.G.3.)
  *Prompt exécutant* :
  > Depuis le repo local à jour sur `main` : `bash deploy_universal.sh deploy_configs/cote_ivoire_prod.conf`. Surveiller PM2 ; si `Process not found` au reload, `pm2 delete codeonline-edi-cote-ivoire-prod` puis `pm2 start ecosystem.config.cjs && pm2 save` sur `civ`. NE PAS lancer `deploy_civ_prod.sh` (recrée la DB).
  *Tests unitaires* : `ssh civ "grep -c process.env.EDI_ORDERS_PATH /var/www/Edi-prod/backend/scripts/init_db_params.js"` = 1 (correctif déployé) ; smoke `curl -Ik https://civ.codeonline-edi.net/` → 200. Bloquant avant P2.3.
  *DoD* : CIV PROD tourne la version corrigée, site 200, PM2 online.
  *Vérif* : `curl -sk https://civ.codeonline-edi.net/api/settings | head -c 80` → JSON `success:true`.

- [ ] **P2.3 — Configurer GLN + chemin EANCOM + ORCHESTRATOR_URL PROD (CIV)**
  *Description* : en base `Entitedb`, fixer `MY_GLN` (GLN PROD CIV de P0.3), `ORCHESTRATOR_URL=<HUB_PROD_URL>`, `EDI_ORDERS_PATH` inscriptible. Ajouter `JWT_SECRET` PROD au `.env` CIV PROD. S'assurer du dossier inscriptible.
  *Prompt exécutant* :
  > `ssh civ`, DB `Entitedb` : `UPDATE app_parameters SET param_value='<CIV_PROD_GLN>' WHERE param_key='MY_GLN'` ; `UPDATE app_parameters SET param_value='<HUB_PROD_URL>' WHERE param_key='ORCHESTRATOR_URL'` ; vérifier/My positionner `EDI_ORDERS_PATH` sur un chemin inscriptible par `consultant` (créer le dossier si besoin sans sudo, ex. `/var/www/Edi-prod/backend/edi_orders`). Ajouter `JWT_SECRET=<secret PROD>` dans `/var/www/Edi-prod/backend/.env` (= secret du Hub PROD). `pm2 restart codeonline-edi-cote-ivoire-prod --update-env`.
  *Tests unitaires* : `SELECT param_value FROM app_parameters WHERE param_key IN ('MY_GLN','ORCHESTRATOR_URL','EDI_ORDERS_PATH')` = valeurs PROD attendues ; dossier EDI inscriptible (`ssh civ "touch <path>/.wtest && rm <path>/.wtest && echo ok"` → `ok`). Bloquant avant P2.T.
  *DoD* : CIV PROD configuré pour parler au Hub PROD avec son GLN PROD et un chemin inscriptible.
  *Vérif* : `ssh civ "MYSQL_PWD=… mysql -u <u> Entitedb -e \"SELECT param_key,param_value FROM app_parameters WHERE param_key IN ('MY_GLN','ORCHESTRATOR_URL')\""` → valeurs PROD.

- [ ] **P2.T — Scénario de test complet P2**
  1. Site CIV PROD 200 + `/api/settings` JSON. 2. `MY_GLN`, `ORCHESTRATOR_URL`, `EDI_ORDERS_PATH` = valeurs PROD. 3. Dossier EANCOM inscriptible. 4. `JWT_SECRET` CIV PROD == `JWT_SECRET` Hub PROD (`md5sum` égaux). 5. Backups P2.1 présents.
  Critères de réussite : 5/5. Phase cochable seulement si tout passe.

---

## P3 — Aligner TUN PROD 🔴
**Objectif** : TUN PROD capable d'émettre/recevoir via le Hub PROD (route receive opérationnelle, GLN PROD, secret PROD), sans casser l'existant. Stratégie selon divergence (décision P0.G.3).

- [ ] **P3.1 — Backup TUN PROD (code + DB + .env)**
  *Description* : identique à P2.1 pour TUN PROD.
  *Prompt exécutant* :
  > `ssh <tun_prod>` : backup `cp -r <repo_prod>/backend <repo_prod>/_BACKUPS/backend_$(date +%s)` ; `mysqldump <tun_prod_db> > <repo_prod>/_BACKUPS/db_$(date +%s).sql` ; `cp <repo_prod>/backend/.env <repo_prod>/_BACKUPS/env_$(date +%s)`.
  *Tests unitaires* : 3 backups > 0 octet. Bloquant avant P3.2.
  *DoD* : backups TUN PROD présents.
  *Vérif* : `ssh <tun_prod> "ls -l <repo_prod>/_BACKUPS | tail -3"` → 3 entrées récentes.

- [ ] **P3.2 — Décider et appliquer la stratégie d'alignement TUN PROD**
  *Description* : selon l'ampleur de divergence mesurée en P0.1 : (a) **déploiement complet** de `main` sur TUN PROD (créer `deploy_configs/tunisie_prod.conf` + `env/.env.tunisie_prod`, lancer `deploy_universal.sh`) ; ou (b) **patch minimal** : s'assurer que `/api/edi/receive` existe, que `JWT_EXCLUDED_PATHS` est compatible, et que le correctif `EDI_ORDERS_PATH` est appliqué.
  *Prompt exécutant (variante a)* :
  > Créer `deploy_configs/tunisie_prod.conf` (calqué sur `cote_ivoire_prod.conf` : REMOTE_HOST/USER ou SSH_ALIAS TUN PROD, REMOTE_ROOT=<repo_prod>, PM2_APP_NAME=codeonline-edi-tunisie-prod, PM2_PORT=<port TUN PROD>, DB_NAME=<tun_prod_db>, ENV_FILE=env/.env.tunisie_prod, API_PUBLIC_URL=<domaine TUN PROD>) et `env/.env.tunisie_prod` (mêmes clés que CIV PROD, JWT_SECRET=<secret PROD>). Backup déjà fait (P3.1). Lancer `bash deploy_universal.sh deploy_configs/tunisie_prod.conf`. Vérifier smoke 200.
  *Prompt exécutant (variante b)* :
  > Sur TUN PROD : confirmer `grep -n "api/edi/receive" <repo_prod>/backend/server.js`. Si absent → variante (a) obligatoire. Sinon : ajouter `JWT_SECRET=<secret PROD>` au `.env`, fixer `EDI_ORDERS_PATH` inscriptible, redémarrer PM2.
  *Tests unitaires* : `ssh <tun_prod> "curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/api/settings"` ∈ {200,401} ; route receive présente (`grep -c "api/edi/receive" server.js` ≥ 1). Bloquant avant P3.3.
  *DoD* : TUN PROD expose `/api/edi/receive` protégé par le `JWT_SECRET` PROD, sans régression (site PROD répond).
  *Vérif* : `curl -Ik <domaine TUN PROD>/` → 200.

- [ ] **P3.3 — Configurer GLN + chemin + ORCHESTRATOR_URL PROD (TUN)**
  *Description* : en base TUN PROD, `MY_GLN=<TUN_PROD_GLN>`, `ORCHESTRATOR_URL=<HUB_PROD_URL>`, `EDI_ORDERS_PATH` inscriptible ; `JWT_SECRET` PROD dans `.env`. Restart.
  *Prompt exécutant* :
  > `ssh <tun_prod>`, DB TUN PROD : `UPDATE app_parameters SET param_value='<TUN_PROD_GLN>' WHERE param_key='MY_GLN'` ; `... '<HUB_PROD_URL>' ... 'ORCHESTRATOR_URL'` ; `EDI_ORDERS_PATH` inscriptible (créer dossier sans sudo si besoin). `.env` : `JWT_SECRET=<secret PROD>`. `pm2 restart <tun_prod_pm2> --update-env`.
  *Tests unitaires* : params lus = valeurs PROD ; dossier inscriptible (`touch` test → ok). Bloquant avant P3.T.
  *DoD* : TUN PROD configuré pour le Hub PROD avec GLN PROD.
  *Vérif* : `ssh <tun_prod> "mysql … -e \"SELECT param_key,param_value FROM app_parameters WHERE param_key IN ('MY_GLN','ORCHESTRATOR_URL')\""` → valeurs PROD.

- [ ] **P3.T — Scénario de test complet P3**
  1. Site TUN PROD 200. 2. Route `/api/edi/receive` présente. 3. Params GLN/ORCHESTRATOR_URL/EDI_ORDERS_PATH = PROD. 4. `JWT_SECRET` TUN PROD == Hub PROD. 5. Backups P3.1 présents.
  Critères de réussite : 5/5. Phase cochable seulement si tout passe.

**GATE humain** : si variante (a) déploiement complet TUN PROD → l'opérateur valide la fenêtre de déploiement (impact PROD).

---

## P4 — Annuaire PROD (registry) + enregistrement des nœuds 🔴
**Objectif** : l'annuaire `partners` du Hub PROD contient CIV PROD et TUN PROD avec les bons GLN et `target_url`.

- [ ] **P4.1 — Enregistrer CIV PROD et TUN PROD dans le Hub PROD**
  *Description* : insérer les 2 lignes `partners` (gln, name, country_code, target_url=`<domaine>/api/edi/receive`, status=ACTIVE) dans `codeonline_edi_db_prod`.
  *Prompt exécutant* :
  > Sur la DB Hub PROD `codeonline_edi_db_prod` :
  > `INSERT INTO partners (gln,name,country_code,target_url,status) VALUES ('<CIV_PROD_GLN>','Cote Ivoire PROD','384','https://civ.codeonline-edi.net/api/edi/receive','ACTIVE'), ('<TUN_PROD_GLN>','Tunisie PROD','788','<domaine TUN PROD>/api/edi/receive','ACTIVE') ON DUPLICATE KEY UPDATE target_url=VALUES(target_url),status='ACTIVE';`
  > Vérifier `SELECT gln,country_code,target_url,status FROM partners`.
  *Tests unitaires* : `SELECT COUNT(*) FROM partners WHERE status='ACTIVE'` = 2 ; chaque `target_url` finit par `/api/edi/receive`. Bloquant avant P4.T.
  *DoD* : annuaire PROD = 2 nœuds actifs avec GLN PROD et URLs PROD.
  *Vérif* : `mysql codeonline_edi_db_prod -e "SELECT gln,target_url FROM partners"` → 2 lignes CIV/TUN PROD.

- [ ] **P4.T — Scénario de test complet P4**
  1. `partners` PROD = exactement 2 lignes ACTIVE (CIV, TUN). 2. `target_url` CIV = `https://civ.codeonline-edi.net/api/edi/receive`. 3. `target_url` TUN = `<domaine TUN PROD>/api/edi/receive`. 4. GLN = ceux de P0.3.
  Critères de réussite : 4/4. Phase cochable seulement si tout passe.

---

## P5 — Test E2E EANCOM CIV PROD ↔ TUN PROD 🔴
**Objectif** : prouver ORDERS + INVOIC dans les deux sens, `DELIVERED` au Hub PROD + persistés chez le destinataire.

- [ ] **P5.1 — Envoyer les 4 messages de validation via le Hub PROD**
  *Description* : POST `relay` au Hub PROD pour ORDERS CIV→TUN, ORDERS TUN→CIV, INVOIC CIV→TUN, INVOIC TUN→CIV. `transactionRef` préfixés `TESTPROD-`. EANCOM valides (réutiliser les gabarits ORDERS/INVOIC validés en DEV, avec GLN PROD).
  *Prompt exécutant* :
  > Construire 4 paquets `{senderGln,receiverGln,eancomContent,messageType,filename,transactionRef:"TESTPROD-…",orderRef}` avec les GLN PROD (P0.3) et des contenus EANCOM ORDERS/INVOIC valides (gabarits `docs/RAPPORT_FIX_HUB_EDI_2026-06-13.md`). POST chacun sur `<HUB_PROD_URL>/api/orchestrator/relay`. Émettre depuis un point ayant accès réseau au Hub PROD (serveur CIV PROD ou TUN PROD selon exposition). Collecter les réponses (`success`, `route`).
  *Tests unitaires* : les 4 réponses `success=true`. Bloquant avant P5.2.
  *DoD* : 4 relais acceptés par le Hub PROD.
  *Vérif* : 4 réponses JSON `"success":true` capturées.

- [ ] **P5.2 — Vérifier journal Hub PROD + persistance destinataires**
  *Description* : confirmer `DELIVERED` dans `transactions` PROD et lignes `INBOUND` correspondantes dans `edi_transmissions` de CIV PROD et TUN PROD.
  *Prompt exécutant* :
  > Hub PROD : `SELECT document_type,sender_gln,receiver_gln,status FROM transactions WHERE transaction_ref LIKE 'TESTPROD-%'` → 4 lignes `DELIVERED`. CIV PROD `Entitedb` : `SELECT document_type,partner_gln,status,filename FROM edi_transmissions WHERE direction='INBOUND' AND filename LIKE '%TESTPROD%'` → 2 lignes (ORDERS+INVOIC reçus de TUN). TUN PROD DB : idem → 2 lignes (reçus de CIV). Reporter le tableau de résultats dans ce fichier.
  *Tests unitaires* : 4 `DELIVERED` au Hub ; 2 INBOUND côté CIV ; 2 INBOUND côté TUN. Bloquant avant P5.T.
  *DoD* : matrice 2 docs × 2 sens entièrement verte (livré + persisté).
  *Vérif* : requêtes ci-dessus renvoient les comptes attendus (4 / 2 / 2).

- [ ] **P5.3 — Nettoyage des messages de test**
  *Description* : retirer/مarquer les transactions et transmissions `TESTPROD-` pour ne pas polluer le PROD.
  *Prompt exécutant* :
  > Optionnel selon politique : `DELETE FROM transactions WHERE transaction_ref LIKE 'TESTPROD-%'` (Hub PROD) ; `DELETE FROM edi_transmissions WHERE filename LIKE '%TESTPROD%'` (CIV+TUN). Supprimer les fichiers EANCOM de test sur disque. Documenter ce qui a été nettoyé.
  *Tests unitaires* : après nettoyage, `SELECT COUNT(*) … LIKE 'TESTPROD-%'` = 0 partout. Non bloquant (traçabilité).
  *DoD* : aucune donnée de test résiduelle (ou conservée volontairement et documentée).
  *Vérif* : compte `TESTPROD-` = 0.

- [ ] **P5.T — Scénario de test complet P5**
  1. ORDERS CIV→TUN : Hub `DELIVERED` + INBOUND chez TUN. 2. ORDERS TUN→CIV : `DELIVERED` + INBOUND chez CIV. 3. INVOIC CIV→TUN : `DELIVERED` + INBOUND chez TUN. 4. INVOIC TUN→CIV : `DELIVERED` + INBOUND chez CIV.
  Critères de réussite : 4/4 livrés ET persistés. Phase cochable seulement si tout passe.

---

## P6 — Durcissement & documentation 🟠
**Objectif** : sécuriser le Hub PROD et tracer l'opération.

- [ ] **P6.1 — Durcissement sécurité Hub PROD**
  *Description* : restreindre l'accès au relais (validation claim `instance`/IP source ou mTLS), TLS si public, rotation documentée du `JWT_SECRET` PROD.
  *Prompt exécutant* :
  > Mettre en place au minimum : restriction réseau (firewall IP source CIV/TUN PROD) OU validation côté Hub du claim service token. Si Hub public : confirmer TLS valide (`curl -Ik <HUB_PROD_URL>` cert Let's Encrypt). Documenter la procédure de rotation du `JWT_SECRET` PROD (simultanée sur Hub + CIV + TUN).
  *Tests unitaires* : un appel `relay` depuis une IP non autorisée échoue (si restriction IP) OU sans token échoue 401. 
  *DoD* : accès Hub PROD restreint + TLS (si public) vérifiés.
  *Vérif* : `curl` non autorisé → refusé ; `curl` autorisé → 200.

- [ ] **P6.2 — Documentation & versionnement**
  *Description* : consigner l'architecture PROD (coordonnées, GLN, secret-emplacement, URLs) dans `docs/`, et préparer l'intégration du code Hub au repo principal.
  *Prompt exécutant* :
  > Créer `docs/PROD_HUB_EDI.md` : topologie PROD (Hub host/port/DB, CIV PROD, TUN PROD, GLN PROD, HUB_PROD_URL), procédure de rotation secret, procédure d'ajout d'un nœud PROD. Ouvrir un ticket/commit pour importer `edi_orchestrator/` (avec le correctif mint-JWT) dans le repo GitHub principal.
  *Tests unitaires* : `docs/PROD_HUB_EDI.md` existe et couvre topologie + rotation + ajout nœud. 
  *DoD* : doc PROD écrite + plan d'import du Hub dans git acté.
  *Vérif* : `test -f docs/PROD_HUB_EDI.md && grep -c "rotation" docs/PROD_HUB_EDI.md` ≥ 1.

- [ ] **P6.T — Scénario de test complet P6**
  1. Accès Hub PROD restreint (test négatif refusé). 2. TLS valide si public. 3. `docs/PROD_HUB_EDI.md` complet. 4. Plan d'import Hub→git acté.
  Critères de réussite : 4/4.

---

## Ordre d'exécution
```
P0 (recon + GATE) ──► P1 (Hub PROD)
                       │
                       ├──► P2 (CIV PROD)  ┐
                       └──► P3 (TUN PROD)  ┘  (P2 ∥ P3 parallélisables après P1)
                                  │
                                  └──► P4 (annuaire) ──► P5 (E2E) ──► P6 (durcissement/doc)
```
- P2 et P3 sont **parallélisables** une fois P1 terminé.
- P4 exige P1 + P2 + P3 (besoin des GLN et URLs PROD réels).
- P5 exige P4. P6 exige P5.

## DoD globale
- [ ] Hub PROD en ligne, **isolé** du DEV (DB `codeonline_edi_db_prod`, port dédié, `JWT_SECRET` PROD distinct), `health` 200.
- [ ] CIV PROD sur la version corrigée, GLN PROD, chemin EANCOM inscriptible, pointant le Hub PROD.
- [ ] TUN PROD aligné (route receive OK, GLN PROD, secret PROD), sans régression du site PROD.
- [ ] Annuaire PROD = CIV PROD + TUN PROD actifs.
- [ ] **4/4** messages (ORDERS×2 sens, INVOIC×2 sens) `DELIVERED` au Hub PROD **et** persistés chez le destinataire.
- [ ] Données de test `TESTPROD-` nettoyées (ou conservées et documentées).
- [ ] Accès Hub PROD restreint + TLS (si public).
- [ ] `docs/PROD_HUB_EDI.md` écrite + import du code Hub dans git planifié.
- [ ] Backups CIV PROD et TUN PROD (code+DB+.env) présents et horodatés.
```
```
