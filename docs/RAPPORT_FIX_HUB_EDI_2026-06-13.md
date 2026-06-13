# Rapport d'intervention — Mise en service de la communication EANCOM via le Hub EDI

**Date :** 13 juin 2026
**Périmètre :** Serveurs DEV uniquement (CIV DEV, TUN DEV, SEN DEV + Hub orchestrateur). **Production non touchée.**
**Objet :** Faire fonctionner l'échange de documents EDI EANCOM (ORDERS, INVOIC) entre les trois nœuds pays via le Hub orchestrateur, et valider de bout en bout.

---

## 1. Contexte

L'application Codeonline EDI est déployée par pays (une instance par pays). Les échanges de documents EANCOM inter-pays doivent transiter par un **Hub orchestrateur** central (futur *data registry*), qui :

1. reçoit le message d'un pays émetteur sur `POST /api/orchestrator/relay` ;
2. résout le destinataire via sa table d'annuaire `partners` (clé = GLN) ;
3. relaie le message vers l'URL du destinataire (`/api/edi/receive`).

Au début de l'intervention, **aucun échange CIV ↔ TUN ↔ SEN ne fonctionnait**.

### Architecture constatée

| Élément | Détail |
|---|---|
| Hub | App Node séparée : `/var/www/Edi-dev/edi_orchestrator/` (serveur TUN, port **5010**), base `codeonline_edi_db` |
| Annuaire Hub | Table `partners` (gln, name, country_code, target_url, status) |
| Journal Hub | Table `transactions` (statuts `RECEIVED` → `DELIVERED`/`FAILED`) |
| Réception nœud | `POST /api/edi/receive` (texte clair) et `POST /api/p2p/receive` (chiffré) |
| Paramètres nœud | Table `app_parameters` (MY_GLN, ORCHESTRATOR_URL, EDI_ORDERS_PATH…) |

---

## 2. Problèmes identifiés

### P1 — Collision de GLN (CIV = TUN)
La Côte d'Ivoire et la Tunisie partageaient le **même** `MY_GLN` : `6191234567890`.
Conséquence : identité émetteur ambiguë, routage impossible vers CIV.

### P2 — CIV absente de l'annuaire Hub
Aucune entrée pour la Côte d'Ivoire dans la table `partners`.
Conséquence : tout message destiné à CIV → `404 Unknown recipient GLN`.

### P3 — Authentification du relais Hub → nœud (cause racine du blocage)
Le Hub transmettait uniquement un en-tête `x-api-pin`. Or, depuis le durcissement sécurité, le middleware `verifyJWT` des nœuds exige un **Bearer JWT** signé avec le `JWT_SECRET` partagé.
Conséquence : tout relais Hub → nœud renvoyait **HTTP 401** (« Unauthorized: missing token »).
Aggravant : le Hub n'avait **pas** de `JWT_SECRET` dans son `.env` et **pas** la dépendance `jsonwebtoken`.

### P4 — Chemin de stockage EANCOM non inscriptible sur CIV
`EDI_ORDERS_PATH = /var/www/Edi-orders` n'existait pas sur le serveur CIV et l'utilisateur `consultant` n'a pas les droits (`sudo` indisponible).
Conséquence : réception CIV → **HTTP 500** (`EACCES: permission denied, mkdir '/var/www/Edi-orders/received/ORDERS'`).

### P5 — Base de données SEN vide
La base `Dev_Entitedb` du serveur Sénégal ne contenait qu'**1 table** (ni `Entite`, ni `app_parameters`). Le nœud n'avait jamais été migré.
Conséquence : réception SEN → **HTTP 500** (`Table 'Dev_Entitedb.Entite' doesn't exist`). Explique aussi les anciens échecs SEN d'avril.

---

## 3. Corrections appliquées

### C1 — GLN unique pour la Côte d'Ivoire
Attribution du GLN **`6181234567890`** (préfixe GS1 Côte d'Ivoire = 618).
- `UPDATE app_parameters SET param_value='6181234567890' WHERE param_key='MY_GLN'` sur CIV DEV.

### C2 — Enregistrement de CIV dans l'annuaire Hub
```sql
INSERT INTO partners (gln, name, country_code, target_url, status)
VALUES ('6181234567890','Cote Ivoire Hub','384',
        'https://civ-dev.codeonline-edi.net/api/edi/receive','ACTIVE');
```

### C3 — Le Hub signe désormais un JWT de service (cause racine)
Modification de `edi_orchestrator/services/routingService.js` :
- ajout d'un mint **JWT HS256** via le module natif `crypto` (sans ajouter la dépendance `jsonwebtoken`) ;
- en-tête `Authorization: Bearer <token>` ajouté à chaque relais ;
- ajout d'une règle de routage par préfixe `618` → CIV (cohérence avec 619→TUN, SN→SEN).

Ajout du secret partagé au Hub :
```
JWT_SECRET=<même valeur que les nœuds>   # ajouté à edi_orchestrator/.env
```
Sauvegarde de l'ancien fichier : `routingService.js.bak.<timestamp>` (sur le serveur).
Redémarrage : `pm2 restart codeonline-edi-orchestrator --update-env`.

> Le token porte `{ sub:'system', role:'service', instance:'hub' }`, TTL 15 min, signé avec le `JWT_SECRET` réseau. Les nœuds l'acceptent via leur `verifyJWT` standard.

### C4 — Chemin EANCOM inscriptible sur CIV (sans sudo, et résistant aux redéploiements)
1. Paramètre CIV repositionné : `EDI_ORDERS_PATH = /var/www/Edi-dev/backend/edi_orders` (inscriptible par `consultant`).
2. `backend/scripts/init_db_params.js` rendu **surchargeable par variable d'environnement** :
   ```js
   { key: 'EDI_ORDERS_PATH',
     value: process.env.EDI_ORDERS_PATH || '/var/www/Edi-orders', ... }
   ```
3. `env/.env.cote_ivoire` : ajout de `EDI_ORDERS_PATH=/var/www/Edi-dev/backend/edi_orders`.
   → garantit que le prochain `deploy_cote_ivoire.sh` ne réécrasera pas le chemin par la valeur par défaut.

### C5 — Migration de la base SEN
- `mysqldump` de `Dev_Entitedb` TUN (82 tables, ~85 Mo) → chargement dans `Dev_Entitedb` SEN avec `FOREIGN_KEY_CHECKS=0`.
- Résultat : **83 tables, 99 entités, 26 paramètres**.
- Réécriture des paramètres propres à SEN :
  - `CURRENT_INSTANCE_CODE = senegal`
  - `MY_GLN = SN02583102G3` (GLN SEN déjà enregistré au Hub)
  - `LOCAL_API_URL = http://localhost:5001`
  - `EDI_ORDERS_PATH = /var/www/Edi-orders` (existant et inscriptible sur SEN)
- Redémarrage du nœud SEN.

---

## 4. Plan d'identifiants (GLN) après correction

| Pays | GLN | ISO numérique | Enregistré au Hub |
|---|---|---|---|
| Tunisie (TUN) | `6191234567890` | 788 | ✅ |
| Sénégal (SEN) | `SN02583102G3` | 686 | ✅ |
| Côte d'Ivoire (CIV) | `6181234567890` | 384 | ✅ (ajouté) |

---

## 5. Tests de bout en bout (validation)

Documents testés : **ORDERS** et **INVOIC**. Chaque message envoyé au Hub (`POST /api/orchestrator/relay`), puis vérification :
1. statut `DELIVERED` dans le journal Hub (`transactions`) ;
2. persistance chez le destinataire (`edi_transmissions`, direction `INBOUND`).

### Matrice de résultats

| Document | CIV→TUN | TUN→CIV | TUN→SEN | SEN→TUN | SEN→CIV | CIV→SEN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **ORDERS** | ✅ | ✅ | ✅ | — | ✅ | — |
| **INVOIC** | — | ✅ | — | ✅ | — | ✅ |

Les 3 paires de pays sont couvertes, dans les deux sens, pour les deux types de documents.
**Tous les messages : `DELIVERED` au Hub + persistés chez le destinataire.**

Exemples de persistance constatée :
- TUN `edi_transmissions` : ORDERS reçu de CIV (`6181234567890`)
- CIV `edi_transmissions` : ORDERS reçu de TUN (`6191234567890`)
- SEN `edi_transmissions` : ORDERS reçu de TUN + INVOIC reçu de CIV

---

## 6. Modifications — récapitulatif

### Dépôt local (commit)
| Fichier | Nature |
|---|---|
| `backend/scripts/init_db_params.js` | `EDI_ORDERS_PATH` surchargeable par variable d'environnement |
| `docs/RAPPORT_FIX_HUB_EDI_2026-06-13.md` | Ce rapport |

> `env/.env.cote_ivoire` est volontairement **ignoré par git** (secrets). La surcharge `EDI_ORDERS_PATH` y a été ajoutée côté serveur/local mais n'est pas versionnée.

### Côté serveurs (non versionné — voir § 7)
| Cible | Modification |
|---|---|
| Hub (`edi_orchestrator/services/routingService.js`) | mint JWT + Bearer + règle préfixe 618 |
| Hub (`edi_orchestrator/.env`) | ajout `JWT_SECRET` |
| Hub (`codeonline_edi_db.partners`) | ligne CIV |
| CIV `app_parameters` | `MY_GLN`, `EDI_ORDERS_PATH` |
| SEN `Dev_Entitedb` | migration complète + paramètres SEN |

---

## 7. Points en attente / recommandations

1. **Versionner le Hub.** Le code du Hub (`edi_orchestrator/`) n'est pas encore sous git. À intégrer prochainement dans le dépôt GitHub du projet principal. Le correctif `routingService.js` (mint JWT) doit alors être committé. Une sauvegarde `.bak.<timestamp>` existe sur le serveur.

2. **Chemin de réception CIV.** Solution durable retenue (sans sudo). Alternative propre à terme : créer `/var/www/Edi-orders` (droits `consultant`) sur CIV pour s'aligner sur TUN/SEN.

3. **Sécurité du relais.** Les nœuds acceptent actuellement tout JWT signé avec le secret partagé. Durcissements possibles : valider le claim `instance:'hub'`, restreindre l'IP source du Hub, ou passer en mTLS.

4. **Chemin chiffré non testé.** Le canal sécurisé `/api/p2p/receive` (chiffrement + signature RSA) n'a pas été validé — nécessite l'échange des clés publiques RSA entre CIV/TUN/SEN (`config/keys/partners/<gln>.pem`). À traiter séparément.

5. **Autres types EANCOM.** ORDERS et INVOIC validés. ORDRSP, ORDCHG, DESADV, IFTSTA empruntent le **même** chemin (routage par GLN + `parseEANCOM` côté réception) — testables sur demande avec des échantillons valides.

6. **Anomalie SEN historique.** SEN n'avait jamais été migré (base vide). Vérifier que le processus de provisionnement d'un nouveau pays inclut bien la migration de schéma + données avant mise en service.
