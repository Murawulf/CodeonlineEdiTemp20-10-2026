# PLAN — Upgrade app EDI TUN prod (version CIV) + schéma Entitedb

> **But** : remplacer sur le serveur TUN prod (`tunp`) l'ancienne app EDI (hardcodée `Dev_Entitedb`) par la **nouvelle version en prod sur CIV**, branchée sur **`Entitedb`** via `.env`, avec le schéma requis — **sans perdre une seule donnée FP existante** et avec rollback possible à tout instant.
> **Critère de succès mesurable** : `https://edi.codeonline-info.com` sert la nouvelle app (version identique CIV), `POST /api/login` répond 401/200 (lit `Entitedb`), l'app FP (`https://fp.codeonline-info.com`) répond 200 avec les MÊMES counts de données qu'avant (102 fiches, 93 entités, 8 comptes), rollback documenté testé.
> **Exécutant** : IA (Claude Code). Cocher = DoD vérifié sur sortie réelle.

## 0. État d'entrée (faits vérifiés le 05/07/2026)

- **tunp** = `root@65.109.104.178` (alias SSH `tunp`), Ubuntu 22.04, MariaDB 10.6.23, Node 20.20.2, pm2 root (`Edi-Prod`:5000 = ANCIENNE app, `tasks-app`:5009). MySQL root pwd : voir gestionnaire de secrets (connu de la session ; jamais l'écrire dans un fichier).
- **civ** = alias SSH `civ` (user `consultant`, clé `~/private_keyHakim.pem`). Nouvelle app EDI PROD : `/var/www/Edi-prod` (frontend dist à la racine + `backend/`), backend `.env` : `DB_HOST=127.0.0.1, DB_PORT=3306, DB_USER=admin, DB_NAME=Entitedb`, code env-based (`ENTITE_MYSQL_CONFIG = dbConfig`, server.js:350).
- **tunp `Entitedb`** : 74 tables, ANCIEN schéma — données FP vivantes : `fiche_produit`=102, `Entite`=93, `comptes`=8 (l'app fp.codeonline-info.com lit cette base, elle est EN PROD).
- **tunp `Dev_Entitedb`** : 82 tables (base de l'ancienne app EDI, restera en place, intouchée).
- **Schéma cible** = structure de `Entitedb` sur CIV (la base que la nouvelle app utilise réellement en prod). Tables/colonnes connues manquantes sur tunp : `transactions`, `partners`, `notifs`, `network_directory`, `audit_ledger` ; colonnes `valid_order.date_livraison*` + 7 autres, `fiche_produit.declinaisons`, `models.is_complete` (liste exacte produite en P2.2).
- Vhost tunp `edi.conf` : DocumentRoot `/var/www/Edi-prod`, `ProxyPass /api → localhost:5000`, HTTPS Let's Encrypt OK.
- L'ancien serveur TUN (`tunold`) n'est PAS concerné par ce plan (lecture interdite non nécessaire, écriture interdite).

### Règles NON NÉGOCIABLES
1. **Aucune donnée supprimée ou modifiée dans `Entitedb`** : uniquement des `CREATE TABLE` et `ALTER TABLE ... ADD` (additif pur). JAMAIS de `DROP`, `MODIFY`, `TRUNCATE`, `DELETE`, `UPDATE` sur les tables existantes.
2. **Aucune migration de données** dans ce plan (décision Majd : le dev s'en charge après).
3. **CIV = lecture seule stricte** (c'est une prod active d'un autre pays).
4. **`Dev_Entitedb` et l'ancienne app restent intactes sur tunp** (archivées, pas supprimées) tant que Majd n'a pas validé.
5. **Backup avant chaque mutation** (dump SQL + archive fichiers), vérifié non-vide avant de continuer.
6. Chaque phase se termine par son scénario de test ; échec = phase ouverte + tâche corrective, jamais de contournement.
7. Aucun secret (mot de passe, clé) écrit dans le repo git ou dans ce plan.

## Règles d'exécution (contrat de l'exécutant)
1. **Cocher = prouvé.** On ne coche qu'après avoir VÉRIFIÉ le DoD sur une sortie réelle (disque, test vert, réponse HTTP). Jamais sur intention.
2. **Ordre strict.** Vérifs de la tâche vertes AVANT la tâche suivante. Scénario de phase passé AVANT de cocher la phase.
3. **Échec ≠ contournement.** Test qui échoue → corriger ou documenter le blocage (tâche corrective ajoutée). Ne jamais affaiblir un test.
4. **Chiffres mesurés, jamais espérés.** Tout chiffre écrit provient d'une sortie réellement lue.
5. **Mettre à jour CE fichier** à chaque tâche finie (cocher, noter écarts) et committer atomiquement.
6. **Ne pas halluciner** : donnée manquante = signalée, pas inventée.
7. **Respecter les règles non négociables** même si elles ralentissent.

---

## P1 — Sauvegardes & état de référence 🔴
**Objectif** : pouvoir tout restaurer à l'identique en < 10 min, et figer les chiffres de référence anti-régression.

- [ ] **P1.1 — Dumps SQL de référence (tunp)**
  *Description* : dumper `Entitedb` et `Dev_Entitedb` de tunp vers `/root/_backup_upgrade_edi/<YYYYMMDD>/`.
  *Prompt exécutant* :
  > Sur `tunp` (ssh tunp, root) : `D=/root/_backup_upgrade_edi/$(date +%Y%m%d); mkdir -p $D` puis, avec le mot de passe MySQL root de tunp (env `MYSQL_PWD`, ne pas l'écrire sur disque) : `mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob --databases Entitedb | gzip > $D/Entitedb.sql.gz` et idem pour `Dev_Entitedb`. Vérifier les deux fichiers > 100 Ko.
  *Tests unitaires* : `ssh tunp 'ls -la /root/_backup_upgrade_edi/*/ && zcat /root/_backup_upgrade_edi/*/Entitedb.sql.gz | head -5 | grep -q "MySQL dump" && echo DUMP_OK'` — bloquant avant P1.2.
  *DoD* : 2 dumps .gz non vides, en-tête SQL valide.
  *Vérif* : commande du test → `DUMP_OK` + tailles affichées > 100 Ko.

- [ ] **P1.2 — Archive de l'app EDI actuelle (tunp)**
  *Description* : archiver `/var/www/Edi-prod` (app + backend + SQLite users.db/allgpc.db) AVANT tout remplacement.
  *Prompt exécutant* :
  > Sur `tunp` : `tar czf /root/_backup_upgrade_edi/$(date +%Y%m%d)/Edi-prod-OLD.tgz -C /var/www Edi-prod` (node_modules inclus — c'est le rollback complet). Vérifier la taille (> 50 Mo attendu, l'app fait ~407 Mo).
  *Tests unitaires* : `ssh tunp 'tar tzf /root/_backup_upgrade_edi/*/Edi-prod-OLD.tgz | head -3 && du -h /root/_backup_upgrade_edi/*/Edi-prod-OLD.tgz'` — listing OK + taille > 50 Mo. Bloquant.
  *DoD* : archive lisible contenant `Edi-prod/backend/server.js`.
  *Vérif* : `ssh tunp 'tar tzf /root/_backup_upgrade_edi/*/Edi-prod-OLD.tgz | grep -c "backend/server.js"'` → ≥ 1.

- [ ] **P1.3 — Chiffres de référence anti-régression (figés dans ce fichier)**
  *Description* : mesurer et NOTER ICI les counts avant intervention.
  *Prompt exécutant* :
  > Sur `tunp`, exécuter : `mysql -uroot -N -e "SELECT 'fiche_produit',COUNT(*) FROM Entitedb.fiche_produit; SELECT 'Entite',COUNT(*) FROM Entitedb.Entite; SELECT 'comptes',COUNT(*) FROM Entitedb.comptes; SELECT 'tables_Entitedb',COUNT(*) FROM information_schema.tables WHERE table_schema='Entitedb';"` et vérifier les statuts HTTP : `curl -sk -o /dev/null -w '%{http_code}' https://fp.codeonline-info.com/` et idem `edi.` et `codeonline-info.com`. Reporter les valeurs mesurées dans le plan (section ci-dessous).
  *Tests unitaires* : les 3 curl retournent un code ∈ {200} ; les counts sont non nuls. Bloquant.
  *DoD* : tableau ci-dessous rempli avec des valeurs MESURÉES.
  *Vérif* : relecture du tableau + cohérence avec l'état d'entrée (102/93/8/74 attendus).

  | Mesure de référence (P1.3) | Valeur mesurée |
  |---|---|
  | Entitedb.fiche_produit | *(à mesurer)* |
  | Entitedb.Entite | *(à mesurer)* |
  | Entitedb.comptes | *(à mesurer)* |
  | Tables dans Entitedb | *(à mesurer)* |
  | HTTP fp / edi / portail | *(à mesurer)* |

- [ ] **P1.T — Scénario de test complet P1**
  1. Restauration à blanc : créer `Entitedb_restoretest` sur tunp, y importer le dump `Entitedb.sql.gz` → attendu : import sans erreur, `COUNT(*)` de `fiche_produit` = valeur P1.3.
  2. `DROP DATABASE Entitedb_restoretest` (base de test uniquement — exception explicite à la règle 1, elle ne touche pas la prod).
  3. Extraire `backend/server.js` de l'archive tar vers /tmp et vérifier sa taille > 100 Ko.
  Critères : restauration prouvée fonctionnelle, archive prouvée exploitable. **Phase cochable seulement si tout passe.**

---

## P2 — Schéma Entitedb : upgrade additif (référence CIV) 🔴
**Objectif** : `Entitedb` (tunp) possède toutes les tables et colonnes que la nouvelle app requiert — sans toucher aux données existantes.

- [ ] **P2.1 — Dump STRUCTURE de la référence (CIV, lecture seule)**
  *Description* : récupérer la structure complète de `Entitedb` CIV (aucune donnée).
  *Prompt exécutant* :
  > Sur `civ` (ssh civ — lecture seule) : lire les creds MySQL dans `/var/www/Edi-prod/backend/.env` (DB_USER=admin) puis `mysqldump -h127.0.0.1 -uadmin -p'<pwd lu du .env>' --no-data --skip-triggers Entitedb | sed 's/utf8mb4_0900_ai_ci/utf8mb4_general_ci/g; s/utf8mb4_0900_bin/utf8mb4_bin/g' > /tmp/entitedb_struct_civ.sql`. Rapatrier vers tunp : `/root/_upgrade/entitedb_struct_civ.sql` (scp via Mac ou direct). Ne RIEN écrire d'autre sur civ, supprimer /tmp/entitedb_struct_civ.sql de civ après transfert.
  *Tests unitaires* : `ssh tunp 'grep -c "CREATE TABLE" /root/_upgrade/entitedb_struct_civ.sql'` → > 60 ; `grep -c "INSERT INTO"` → 0 (structure pure). Bloquant.
  *DoD* : fichier structure sur tunp, > 60 CREATE TABLE, 0 INSERT, collations MariaDB-compatibles.
  *Vérif* : commandes des tests + `grep -c utf8mb4_0900 …` → 0.

- [ ] **P2.2 — Diff de schéma exhaustif (tables + colonnes)**
  *Description* : produire la liste exacte : (a) tables présentes dans la structure CIV absentes de `Entitedb` tunp ; (b) colonnes manquantes dans les tables communes. Sortie = fichier `/root/_upgrade/diff_schema.txt`.
  *Prompt exécutant* :
  > Sur tunp : charger la structure CIV dans une base temporaire `Entitedb_ref` (`mysql -e "CREATE DATABASE Entitedb_ref"` puis import du fichier P2.1). Puis via information_schema, générer : tables manquantes (`IN Entitedb_ref NOT IN Entitedb`) et, pour chaque table commune, colonnes manquantes (avec type exact + DEFAULT + nullabilité lus de Entitedb_ref). Écrire le tout dans /root/_upgrade/diff_schema.txt. Ne PAS encore modifier Entitedb.
  *Tests unitaires* : le diff liste au minimum les 5 tables connues (`transactions`, `partners`, `notifs`, `network_directory`, `audit_ledger`) et les colonnes connues (`valid_order.date_livraison`, `fiche_produit.declinaisons`, `models.is_complete`) — sinon le diff est faux. Bloquant.
  *DoD* : `/root/_upgrade/diff_schema.txt` exhaustif et cohérent avec les manques déjà identifiés.
  *Vérif* : `ssh tunp 'grep -cE "transactions|partners|notifs|network_directory|audit_ledger" /root/_upgrade/diff_schema.txt'` → ≥ 5.

- [ ] **P2.3 — Script SQL additif + application**
  *Description* : générer `/root/_upgrade/upgrade_entitedb.sql` contenant UNIQUEMENT `CREATE TABLE IF NOT EXISTS` (copiés de la structure CIV) et `ALTER TABLE ... ADD COLUMN` (types exacts CIV, avec `DEFAULT NULL` ou le default CIV). L'appliquer sur `Entitedb`.
  *Prompt exécutant* :
  > Sur tunp : générer le script depuis le diff P2.2 + la structure P2.1. INTERDIT : DROP/MODIFY/CHANGE/TRUNCATE/DELETE/UPDATE. Contrôle automatique avant application : `grep -icE "drop |modify |change |truncate |delete |update " upgrade_entitedb.sql` DOIT retourner 0. Puis `mysql -uroot Entitedb < upgrade_entitedb.sql`. Enfin `DROP DATABASE Entitedb_ref` (base temporaire de référence uniquement).
  *Tests unitaires* : (1) le grep de mots interdits → 0 AVANT application ; (2) après application, les 5 tables existent dans Entitedb ; (3) `SHOW COLUMNS FROM Entitedb.valid_order LIKE 'date_livraison%'` → ≥ 1 ligne ; (4) counts P1.3 INCHANGÉS (fiche_produit=102, Entite=93, comptes=8). Bloquant.
  *DoD* : schéma complet, données intactes.
  *Vérif* : `ssh tunp 'mysql -uroot -N -e "SELECT COUNT(*) FROM Entitedb.fiche_produit; SELECT COUNT(*) FROM Entitedb.transactions;"'` → 102 (ou valeur P1.3) et 0.

- [ ] **P2.T — Scénario de test complet P2**
  1. Comparer table par table : chaque table de la structure CIV existe dans Entitedb tunp → attendu : 0 manquante.
  2. Comparer colonne par colonne sur les tables consommées par la nouvelle app (`comptes, Entite, fiche_produit, valid_order, invalid_orders, models, profiles, ged_documents, transactions, partners, notifs, network_directory, audit_ledger`) → attendu : 0 colonne manquante.
  3. Re-mesurer les counts P1.3 → attendu : identiques au tableau P1.3.
  4. `curl https://fp.codeonline-info.com/` → 200 (l'app FP n'a pas bougé).
  Critères : 0 manque de schéma, 0 delta de données, fp = 200. **Phase cochable seulement si tout passe.**

---

## P3 — Compte MySQL `admin` + .env TUN 🔴
**Objectif** : la nouvelle app aura son user MySQL dédié (fini le root applicatif) et son `.env` complet.

- [ ] **P3.1 — User MySQL `admin`@localhost sur tunp**
  *Description* : créer `admin` avec mot de passe généré (24+ chars), grants sur `Entitedb` uniquement.
  *Prompt exécutant* :
  > Sur tunp : générer un mot de passe (`openssl rand -hex 16`), puis `CREATE USER IF NOT EXISTS 'admin'@'localhost' IDENTIFIED BY '<pwd>'; CREATE USER IF NOT EXISTS 'admin'@'127.0.0.1' IDENTIFIED BY '<pwd>'; GRANT ALL PRIVILEGES ON Entitedb.* TO 'admin'@'localhost'; GRANT ALL PRIVILEGES ON Entitedb.* TO 'admin'@'127.0.0.1'; FLUSH PRIVILEGES;`. Le mot de passe ne va QUE dans le futur `.env` (P3.2). PAS de grant sur d'autres bases.
  *Tests unitaires* : `mysql -uadmin -p'<pwd>' -h127.0.0.1 Entitedb -e "SELECT COUNT(*) FROM comptes;"` → 8 ; `mysql -uadmin … Dev_Entitedb -e "SELECT 1;"` → ACCESS DENIED (preuve du périmètre). Bloquant.
  *DoD* : login admin OK sur Entitedb, refusé ailleurs.
  *Vérif* : les 2 commandes de test avec sorties attendues.

- [ ] **P3.2 — .env TUN de la nouvelle app**
  *Description* : construire le `.env` TUN sur le modèle du `.env` CIV (mêmes clés), adapté : `DB_USER=admin`, `DB_PASSWORD=<P3.1>`, `DB_NAME=Entitedb`, `PORT=5000`, URLs TUN. `chmod 600`.
  *Prompt exécutant* :
  > Lire `/var/www/Edi-prod/backend/.env` sur civ (lecture seule) pour la LISTE DES CLÉS (pas les valeurs secrètes CIV : JWT/SMTP CIV ne doivent PAS être copiés tels quels — générer un JWT_SECRET TUN neuf ; pour SMTP, reprendre les clés en les laissant vides ou valeurs TUN si connues, et NOTER dans le plan que SMTP reste à configurer). Écrire le fichier en staging sur tunp : `/root/_upgrade/env_tun` (chmod 600). Il sera posé en P4.
  *Tests unitaires* : `grep -E "^(DB_HOST|DB_PORT|DB_USER|DB_NAME|PORT)=" /root/_upgrade/env_tun | wc -l` → 5 ; `DB_NAME=Entitedb` présent ; aucune valeur CIV secrète copiée. Bloquant.
  *DoD* : env_tun complet en staging, 600, secrets neufs.
  *Vérif* : `ssh tunp 'ls -l /root/_upgrade/env_tun && grep -c "DB_NAME=Entitedb" /root/_upgrade/env_tun'` → `-rw-------` et 1.

- [ ] **P3.T — Scénario de test complet P3**
  1. Connexion MySQL avec les valeurs exactes du fichier env_tun (host/port/user/pwd/db parsés du fichier) → attendu : `SELECT COUNT(*) FROM comptes` = 8.
  2. Tentative du même user sur `Dev_Entitedb` → attendu : refus.
  Critères : l'app pourra se connecter avec CE fichier, périmètre minimal prouvé. **Phase cochable seulement si tout passe.**

---

## P4 — Déploiement code (CIV → tunp) & bascule 🔴
**Objectif** : la nouvelle app tourne sur tunp à la place de l'ancienne, rollback prêt.

- [ ] **P4.1 — Copie de l'app CIV vers staging tunp**
  *Description* : rapatrier `/var/www/Edi-prod` de CIV (frontend dist + backend, SANS node_modules ni .env CIV) vers `/var/www/Edi-prod.NEW` sur tunp.
  *Prompt exécutant* :
  > Transfert civ→tunp. CIV est joignable en lecture par la clé du Mac ; le plus simple : depuis le Mac, `rsync -az --exclude node_modules --exclude .env --exclude logs consultant@civ:/var/www/Edi-prod/ tunp:/var/www/Edi-prod.NEW/` (ou via tar pipe si rsync inter-hôtes indisponible — passer par un tgz staging sur le Mac). ATTENTION liaison Mac lente constatée : préférer un scp direct serveur→serveur si une clé civ→tunp existe, sinon accepter la durée. Vérifier ensuite la présence de `Edi-prod.NEW/backend/server.js` et `Edi-prod.NEW/index.html`.
  *Tests unitaires* : `ssh tunp 'test -f /var/www/Edi-prod.NEW/backend/server.js && test -f /var/www/Edi-prod.NEW/index.html && echo FILES_OK'` → FILES_OK ; `ssh tunp 'test ! -f /var/www/Edi-prod.NEW/backend/.env && echo NO_CIV_ENV'` → NO_CIV_ENV. Bloquant.
  *DoD* : app complète en staging, sans secrets CIV.
  *Vérif* : commandes des tests.

- [ ] **P4.2 — Frontend : vérifier l'URL d'API du build**
  *Description* : déterminer si le dist CIV appelle l'API en RELATIF (`/api/...` → réutilisable tel quel) ou en ABSOLU (`https://…civ…` → rebuild requis).
  *Prompt exécutant* :
  > Sur tunp : `grep -roE "https?://[a-z0-9.-]*codeonline[a-z0-9.-]*" /var/www/Edi-prod.NEW/assets/*.js | sort -u | head`. Si AUCUNE URL absolue d'API CIV → OK relatif, continuer. Si URL absolue CIV trouvée → tâche corrective : rebuild Vite depuis le repo local `~/Travail/netconsulting/Codeonline-InfoTn` avec `VITE_API_URL=https://edi.codeonline-info.com` (ou équivalent lu dans le code), puis remplacer les assets du staging par le nouveau dist. Documenter le choix dans le plan.
  *Tests unitaires* : après résolution, `grep -roE "civ[a-z.-]*codeonline" /var/www/Edi-prod.NEW/assets/*.js | wc -l` → 0. Bloquant.
  *DoD* : le frontend du staging ne pointe vers aucune URL CIV.
  *Vérif* : grep ci-dessus → 0.

- [ ] **P4.3 — npm install + .env + smoke test hors trafic (port 5100)**
  *Description* : installer les deps, poser le `.env` TUN, démarrer le backend en STAGING sur un port isolé (5100), smoke test complet, puis l'arrêter.
  *Prompt exécutant* :
  > Sur tunp : `cd /var/www/Edi-prod.NEW/backend && npm ci --omit=dev || npm install --omit=dev`. Poser `cp /root/_upgrade/env_tun .env && chmod 600 .env`. Smoke test : `PORT=5100 node server.js` en arrière-plan (nohup, 30 s max), puis `curl -s http://127.0.0.1:5100/api/login -X POST -H 'Content-Type: application/json' -d '{"email":"x@x.x","password":"x"}'` → attendu : réponse JSON structurée (401/400, PAS une erreur SQL ni ECONNREFUSED). Vérifier les logs de démarrage (aucun `ER_NO_SUCH_TABLE`, aucun `Access denied`). Tuer le process de staging.
  *Tests unitaires* : (1) réponse JSON du login staging ; (2) `grep -iE "ER_NO_SUCH_TABLE|Access denied|ECONNREFUSED" /tmp/edi_new_smoke.log | wc -l` → 0. Bloquant — c'est LE test anti-régression schéma avant bascule.
  *DoD* : nouvelle app démarre et parle à `Entitedb` sans erreur, sans avoir touché au trafic prod.
  *Vérif* : log du smoke test archivé `/root/_upgrade/smoke_$(date +%H%M).log`, 0 erreur.

- [ ] **P4.4 — Bascule pm2 (downtime ~10 s) + rollback prêt**
  *Description* : swap atomique : ancienne app → `.OLD`, staging → `/var/www/Edi-prod`, restart pm2.
  *Prompt exécutant* :
  > Sur tunp, séquence exacte : `pm2 stop Edi-Prod && mv /var/www/Edi-prod /var/www/Edi-prod.OLD-$(date +%Y%m%d) && mv /var/www/Edi-prod.NEW /var/www/Edi-prod && pm2 delete Edi-Prod && cd /var/www/Edi-prod/backend && PORT=5000 pm2 start server.js --name Edi-Prod --update-env && pm2 save`. Si le démarrage échoue (status ≠ online sous 15 s) → ROLLBACK IMMÉDIAT : `pm2 delete Edi-Prod; mv /var/www/Edi-prod /var/www/Edi-prod.NEW; mv /var/www/Edi-prod.OLD-* /var/www/Edi-prod; cd /var/www/Edi-prod/backend && PORT=5000 pm2 start server.js --name Edi-Prod; pm2 save` puis documenter l'échec dans le plan (tâche corrective).
  *Tests unitaires* : `pm2 list` → Edi-Prod online, 0 restart en boucle (↺ stable après 60 s) ; `ss -tlnp | grep :5000` → node. Bloquant.
  *DoD* : nouvelle app en ligne sur :5000, pm2 save fait, ancienne app archivée à côté.
  *Vérif* : `ssh tunp 'pm2 list | grep Edi-Prod && ls -d /var/www/Edi-prod.OLD-*'`.

- [ ] **P4.T — Scénario de test complet P4 (bout en bout, vraies conditions)**
  1. `curl -sk https://edi.codeonline-info.com/` → 200 + le HTML contient les assets du NOUVEAU build (comparer un hash d'asset avec CIV).
  2. `curl -sk -X POST https://edi.codeonline-info.com/api/login -H 'Content-Type: application/json' -d '{"email":"majd.hakim@gmail.com","password":"wrong"}'` → attendu : `{"error":"Invalid credentials"}` ou équivalent 401. ⚠️ NOTE : les comptes sont ceux d'`Entitedb` (8 comptes FP) — si l'email n'existe pas dedans, attendu = même erreur propre (PAS d'erreur SQL). Les comptes EDI seront migrés par le dev ensuite.
  3. `curl -sk https://fp.codeonline-info.com/` → 200 ET re-mesure des counts Entitedb = valeurs P1.3 exactes (l'app EDI n'a rien écrit de destructif).
  4. `pm2 logs Edi-Prod --lines 50 --nostream` → 0 occurrence de `ER_NO_SUCH_TABLE` / `Access denied` / `ECONNREFUSED`.
  5. Test rollback à blanc (préparation seulement) : vérifier que `/var/www/Edi-prod.OLD-*` + dump P1.1 existent → procédure de rollback écrite et actionnable en < 10 min.
  Critères : 200 partout, login propre, counts intacts, logs propres. **Phase cochable seulement si tout passe.**

---

## HORS PÉRIMÈTRE (décisions Majd du 05/07/2026)
- **Migration des données** (produits, fiches, entités, comptes, rôles depuis Dev_Entitedb/ancienne prod) : **le dev s'en charge** après ce plan. Les tables nouvelles restent vides.
- Suppression de `Dev_Entitedb`, de l'app `.OLD` et des backups : uniquement après validation utilisateurs, sur ordre explicite de Majd.
- SMTP (creds Brevo/Gmail invalides — préexistant) : hors plan.

## Ordre d'exécution
P1 → P2 → P3 → P4 (strictement séquentiel ; P2.1 peut se lancer pendant P1.2/P1.3, rien d'autre en parallèle)

## DoD globale
- [ ] `https://edi.codeonline-info.com` sert la NOUVELLE app (assets = build CIV/TUN), pm2 online stable.
- [ ] Le backend lit `Entitedb` via l'user `admin` (plus aucun accès root applicatif, plus aucun lien à `Dev_Entitedb`).
- [ ] Schéma `Entitedb` = complet vs référence CIV (0 table/colonne manquante sur les tables consommées).
- [ ] Counts `Entitedb` = valeurs P1.3 à l'identique (0 donnée FP perdue) et `fp.codeonline-info.com` → 200.
- [ ] Rollback documenté, testé « à blanc », exécutable < 10 min (archive .OLD + dumps P1).
- [ ] Ce fichier coché au réel + committé ; aucun secret dans le repo.
