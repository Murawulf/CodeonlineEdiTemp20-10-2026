# Cartographie serveurs TUN — Ancien (OVH) vs Nouveau (Hetzner)

> Source : audit direct SSH des deux serveurs — 04/07/2026.
> Migration prod terminée le 04/07/2026 : les 7 sites répondent en HTTPS (200).

## 1. Vue d'ensemble

| Critère | ANCIEN — OVH `ns3254711` | NOUVEAU — Hetzner `tunisie` |
|---|---|---|
| IP | 217.182.94.86 | 65.109.104.178 (+ IPv6) |
| Rôle | Prod TUN + Dev TUN + Orchestrateur DEV (mélangés) | **Prod TUN uniquement** (isolée) |
| OS | Ubuntu 24.04.2 LTS | Ubuntu 22.04.5 LTS |
| Web | Apache 2.4.58 | Apache 2.4.52 |
| PHP | 8.3.6 | 8.1.2 |
| SGBD | MySQL 8.0.45 | MariaDB 10.6.23 |
| Node.js | 20.19.3 | 20.20.2 |
| **HTTPS** | **Aucun — tout en HTTP** | **7/7 domaines Let's Encrypt, renouvellement auto** |
| Apps Node (pm2) | 4 (2 prod + 2 dev) | 2 (prod) — resurrection au boot |
| Bases applicatives | 11 (+1 vide) | 8 (prod uniquement) |

## 2. ANCIEN serveur — applications

| Domaine | Application | Techno | Dossier | Taille | Backend | Base(s) | HTTPS |
|---|---|---|---|---|---|---|---|
| codeonline-info.com | Portail Codeonline | PHP CI3 | `/var/www/codeonline-info.comci3` | 57 Mo | — | codeonlinedb + codeonlinedb_FP | ❌ HTTP |
| fp.codeonline-info.com | Fiches produits (app mobile) | PHP CI3 | `/var/www/codeonline-fp` | 385 Mo | — | Entitedb | ❌ HTTP |
| edi.codeonline-info.com | **EDI TUN PROD** | React + Node | `/var/www/Edi-prod` | 408 Mo | Node :5000 (pm2 `Edi-Prod`, root) | **Dev_Entitedb** (nom trompeur = prod) + SQLite users/allgpc | ❌ HTTP |
| support.codeonline-info.com | Support/Formation (Tasks) | React + Node | `/var/www/Tasks` | 120 Mo | Node :5009 (pm2 `tasks-app`, root) | SQLite `codeonline.db` | ❌ HTTP |
| darwin.codeonline-info.com | Darwin | PHP CI3 | `/var/www/darwin` | 201 Mo | — | darwindb + darwin_light | ❌ HTTP |
| apu.codeonline-info.com | APU | PHP | `/var/www/codeonline-apu` | vide | — | codeonline_apu | ❌ HTTP |
| com.codeonline-info.com | Project M | PHP | `/var/www/project_m` | vide | — | project_m | ❌ HTTP |
| edi-dev.codeonline-info.com | EDI TUN **DEV** | React + Node | `/var/www/Edi-dev` | **18 Go** | Node :5001 (pm2 `codeonline-edi-tunisie`, Consultant) | Dev_Entitedb | ❌ HTTP |
| (interne :5010) | Orchestrateur EDI DEV (Hub) | Node | `/var/www/Edi-dev/edi_orchestrator` | — | Node :5010 (pm2, Consultant) | codeonline_edi_db | — |
| (sans vhost) | vectorys / Edi-orders / Products / caracteristiques | divers | `/var/www/…` | 214 Mo / 828 Ko / ~0 | — | — | — |

⚠️ Piège découvert : le vhost `edi` de l'ancien proxyait `:5001` (= backend **DEV**) alors que l'app prod `Edi-Prod` écoute `:5000`. Corrigé sur le nouveau serveur.

## 3. NOUVEAU serveur — applications

| Domaine | Application | Backend | Base(s) | HTTPS | Statut |
|---|---|---|---|---|---|
| codeonline-info.com (+www) | Portail Codeonline | — | codeonlinedb + codeonlinedb_FP | ✅ + redirect | ✅ Migré (200) |
| fp.codeonline-info.com | Fiches produits | — | Entitedb | ✅ + redirect | ✅ Migré (200) |
| edi.codeonline-info.com | EDI TUN PROD | Node :5000 (pm2 `Edi-Prod`) | Dev_Entitedb + SQLite | ✅ + redirect | ✅ Migré (200), login DB vérifié |
| support.codeonline-info.com | Support/Formation | Node :5009 (pm2 `tasks-app`) | SQLite `codeonline.db` | ✅ + redirect | ✅ Migré (200), socket.io OK |
| darwin.codeonline-info.com | Darwin | — | darwindb + darwin_light | ✅ **sans redirect** (CORS HTTP à préserver) | ✅ OK (200) |
| apu.codeonline-info.com | APU | — | codeonline_apu (importée) | ✅ + redirect | ⚠️ Base migrée, app à déployer |
| com.codeonline-info.com | Project M | — | project_m (importée) | ✅ + redirect | ⚠️ Base migrée, app à déployer |

- Certificats : expiration 01/10/2026, renouvellement **automatique** (`certbot.timer`).
- pm2 : `pm2-root` enabled + dump → les backends **survivent au reboot**.
- Overrides env du backend EDI : `MODELES_DIR`, `ALLGPC_DB_PATH`, `FIELDRULES_DB_PATH`, `USERS_DB_PATH` → chemins `/var/www/Edi-prod/` (l'ancien pointait en dur vers `/var/www/Edi-dev/`).

## 4. Bases de données — comparaison

| Base | Ancien (Mo / tables) | Nouveau (Mo / tables) | Utilisée par | Migration |
|---|---|---|---|---|
| codeonlinedb | 166.0 / 46 | 169.0 / 46 | codeonline-info.com | ✅ 04/07 |
| Dev_Entitedb | 143.7 / 82 | 124.5 / 82 | **EDI PROD** (nom trompeur — décision : conservée telle quelle) | ✅ 04/07 |
| Entitedb | 11.7 / 74 | 11.7 / 74 | fp | ✅ 04/07 |
| codeonlinedb_FP | 3.6 / 27 | 3.6 / 27 | portail (module FP) | ✅ 03/07 (dev) |
| darwindb | 1.9 / 6 | 1.9 / 6 | darwin | ✅ (dev — plus récente sur le nouveau) |
| darwin_light | 1.9 / 6 | 1.9 / 6 | darwin | ✅ (dev) |
| codeonline_apu | 1.7 / 34 | 1.7 / 34 | apu | ✅ 04/07 |
| project_m | 0.3 / 8 | 0.3 / 8 | com | ✅ 04/07 |
| ProdEntiteDb | 3.6 / 28 | — | ancien EDI (obsolète) | ❌ volontaire |
| codeonline_edi_db | 0.3 / 5 | — | Orchestrateur DEV (reste sur ancien) | ❌ volontaire |
| EdiHub | 0.1 / 2 | — | essais hub | ❌ volontaire |
| ecomformation | 0 / 0 | — | vide | ❌ vide |

> Migration MySQL 8 → MariaDB 10.6 : conversion des collations `utf8mb4_0900_*` → `utf8mb4_general_ci` appliquée au vol.

### Pourquoi l'EDI reste sur `Dev_Entitedb` (décision du 04/07/2026)
- 5 tables EDI n'existent **que** dans Dev_Entitedb : `transactions`, `partners`, `notifs`, `network_directory`, `audit_ledger`
- Schémas plus récents dans Dev_Entitedb (`valid_order` : 8 colonnes livraison absentes d'Entitedb ; `fiche_produit.declinaisons` ; `models.is_complete`)
- Les comptes utilisateurs EDI réels (dont majd.hakim@gmail.com) sont dans Dev_Entitedb
- `Entitedb` = base de l'app FP. Fusion EDI+FP éventuelle = chantier dev futur.

## 5. Mapping app → base (nouveau serveur)

```
codeonline-info.com  ──►  codeonlinedb + codeonlinedb_FP   (MariaDB)
fp.codeonline-info.com ─►  Entitedb                         (MariaDB)
edi.codeonline-info.com ►  Dev_Entitedb + users.db/allgpc.db (MariaDB + SQLite)
support.codeonline-info.com ► codeonline.db                 (SQLite)
darwin.codeonline-info.com ► darwindb + darwin_light        (MariaDB)
apu.codeonline-info.com  ─►  codeonline_apu                 (MariaDB)
com.codeonline-info.com  ─►  project_m                      (MariaDB)
```

## 6. Points restants / risques

1. **Apps APU et COM** : bases migrées mais dossiers vides sur les 2 serveurs → apps à livrer (dev).
2. **SMTP cassé partout** (Brevo + Gmail : `535 BadCredentials`) — pré-existant à la migration, creds mail à renouveler.
3. **/phpmyadmin exposé publiquement** sur le nouveau (protégé uniquement par le login phpMyAdmin) → recommandé : restriction IP ou Basic-Auth.
4. **edi-dev.codeonline-info.com** : DNS pointe encore le nouveau serveur mais le dev n'y est plus → repointer le DNS vers l'ancien serveur (217.182.94.86) ou supprimer l'entrée.
5. **Décommissionnement ancien serveur** : ne couper les process prod (`Edi-Prod`, `tasks-app`) qu'après validation utilisateurs complète.
6. L'ancien serveur **n'a pas été modifié** (lecture seule pendant la migration).
