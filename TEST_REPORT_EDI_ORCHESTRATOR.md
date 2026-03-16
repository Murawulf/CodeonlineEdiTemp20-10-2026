# Rapport de Tests E2E — EDI Orchestrator

**Date :** 16 Mars 2026, 23:07 UTC  
**Environnement :** Développement (DEV)  
**Script de test :** `backend/scripts/test_e2e_orchestrator.js`

---

## 1. Infrastructure Testée

| Composant | Serveur | IP | Port | PM2 Process | Status |
|-----------|---------|-----|------|-------------|--------|
| **Orchestrator Hub** | Tunisia | 217.182.94.86 | 5010 | `codeonline-edi-orchestrator` | ✅ Online |
| **Backend Tunisia** | Tunisia | 217.182.94.86 | 5001 | `codeonline-edi-tunisie` | ✅ Online |
| **Backend Sénégal** | Sénégal | 91.134.35.126 | 5001 | `codeonline-edi-senegal` | ✅ Online |

### Base de données Orchestrator
- **Type :** MySQL
- **DB :** `codeonline_edi_db`
- **Tables :** `partners` (2 entrées), `transactions` (audit complet)

### Identifiants GLN
| Pays | GLN | URL Publique |
|------|-----|-------------|
| Tunisie | `6191234567890` | https://edi-dev.codeonline-info.com |
| Sénégal | `SN02583102G3` | https://dev.codeonline-edi.net |

---

## 2. Résumé des Résultats

```
╔══════════════════════════════════════════╗
║   17 / 17 tests passés — 0 échec        ║
╚══════════════════════════════════════════╝
```

| Phase | Tests | Passés | Échoués |
|-------|-------|--------|---------|
| Phase 0 — Santé Orchestrator | 1 | 1 | 0 |
| Phase 1 — Plaintext via Orchestrator | 8 | 8 | 0 |
| Phase 2 — Chiffré (E2EE) via Orchestrator | 8 | 8 | 0 |
| **TOTAL** | **17** | **17** | **0** |

---

## 3. Phase 1 — Relay Plaintext via Orchestrator

Messages EANCOM envoyés en clair via l'endpoint `/api/orchestrator/relay` du Hub.  
Le Hub transmet au backend destinataire via `/api/edi/receive`.

| # | Type | Direction | Document | Transaction Ref | Temps | Résultat |
|---|------|-----------|----------|-----------------|-------|----------|
| 1 | ORDERS | Tunisie → Sénégal | TEST-ORDERS-TN→SN-18932 | TX-1773702418933-431 | 273ms | ✅ |
| 2 | ORDRSP | Tunisie → Sénégal | TEST-ORDRSP-TN→SN-19206 | TX-1773702419206-489 | 268ms | ✅ |
| 3 | DESADV | Tunisie → Sénégal | TEST-DESADV-TN→SN-19474 | TX-1773702419475-653 | 264ms | ✅ |
| 4 | INVOIC | Tunisie → Sénégal | TEST-INVOIC-TN→SN-19738 | TX-1773702419738-565 | 262ms | ✅ |
| 5 | ORDERS | Sénégal → Tunisie | TEST-ORDERS-SN→TN-20000 | TX-1773702420001-637 | 28ms | ✅ |
| 6 | ORDRSP | Sénégal → Tunisie | TEST-ORDRSP-SN→TN-20029 | TX-1773702420030-432 | 15ms | ✅ |
| 7 | DESADV | Sénégal → Tunisie | TEST-DESADV-SN→TN-20045 | TX-1773702420045-534 | 26ms | ✅ |
| 8 | INVOIC | Sénégal → Tunisie | TEST-INVOIC-SN→TN-20071 | TX-1773702420072-535 | 16ms | ✅ |

**Observations :**
- Les messages Tunisie → Sénégal prennent ~265ms (réseau inter-serveurs).
- Les messages Sénégal → Tunisie prennent ~20ms (Orchestrator et Backend sont co-localisés sur le même serveur).
- Tous les 4 types EANCOM (ORDERS, ORDRSP, DESADV, INVOIC) sont correctement routés et reçus.

---

## 4. Phase 2 — Relay Chiffré (E2EE) via Orchestrator

Messages chiffrés avec **AES-256-GCM + RSA-2048 OAEP** et signés avec **RSA-SHA256**.  
Le Hub détecte automatiquement le format `header`+`envelope` et redirige vers `/api/p2p/receive` du destinataire.

### Schéma cryptographique

```
Expéditeur                    Orchestrator Hub              Destinataire
    │                              │                              │
    │  1. Chiffre (AES-256-GCM)   │                              │
    │  2. Chiffre clé AES (RSA)   │                              │
    │  3. Signe (RSA-SHA256)       │                              │
    │                              │                              │
    │──── header + envelope ──────>│                              │
    │                              │  Forward (transparent)       │
    │                              │──── header + envelope ──────>│
    │                              │                              │
    │                              │                  4. Déchiffre clé AES (RSA)
    │                              │                  5. Déchiffre payload (AES)
    │                              │                  6. Vérifie signature (RSA)
    │                              │                              │
    │                              │<──── 200 OK ─────────────────│
    │<──── 200 OK ─────────────────│                              │
```

| # | Type | Direction | Transaction ID | Temps | Résultat |
|---|------|-----------|----------------|-------|----------|
| 9 | ORDERS | Tunisie → Sénégal | 93e049ba-08e6-44e5-93a2-1cc1c2308c11 | 264ms | ✅ |
| 10 | ORDRSP | Tunisie → Sénégal | 44181f5c-03fe-4aea-a429-8b2ac47627b3 | 264ms | ✅ |
| 11 | DESADV | Tunisie → Sénégal | 92cc4098-8aad-4b18-984c-7791eea5654c | 262ms | ✅ |
| 12 | INVOIC | Tunisie → Sénégal | c0bda575-0ae9-4f3f-8049-b16d5c4d9843 | 262ms | ✅ |
| 13 | ORDERS | Sénégal → Tunisie | 43a2b2f9-4c02-45ae-b28c-ed321823fe42 | 31ms | ✅ |
| 14 | ORDRSP | Sénégal → Tunisie | 53cdafec-b4d5-407b-b9a5-0136e43d4a2f | 16ms | ✅ |
| 15 | DESADV | Sénégal → Tunisie | e2172590-47e8-4264-bc6e-9d38402bf4e0 | 27ms | ✅ |
| 16 | INVOIC | Sénégal → Tunisie | 14a5929f-754b-4c76-ac55-4e43ec59324e | 26ms | ✅ |

**Observations :**
- Le chiffrement/déchiffrement E2E fonctionne dans les deux directions.
- L'Orchestrator transmet les enveloppes chiffrées de manière **transparente** (zero-knowledge).
- Les signatures RSA-SHA256 sont vérifiées avec succès côté destinataire.
- Aucune dégradation de performance notable par rapport au plaintext (~265ms cross-server).

### Clés RSA déployées

| Serveur | Clé privée | Clés partenaires |
|---------|------------|------------------|
| Tunisia | `config/keys/private.pem` | `SN02583102G3.pem`, `6191234567890.pem` |
| Sénégal | `config/keys/private.pem` | `6191234567890.pem`, `SN02583102G3.pem` |

---

## 5. Audit Trail — Orchestrator MySQL

Toutes les transactions sont enregistrées dans la table `transactions` de la base `codeonline_edi_db` :

| id | transaction_ref | sender | receiver | type | status | transport | delivered_at |
|----|----------------|--------|----------|------|--------|-----------|-------------|
| 13 | TX-...18933-431 | 619... | SN0... | ORDERS | DELIVERED | ORCHESTRATOR | 2026-03-16 23:06:59 |
| 14 | TX-...19206-489 | 619... | SN0... | ORDRSP | DELIVERED | ORCHESTRATOR | 2026-03-16 23:06:59 |
| 15 | TX-...19475-653 | 619... | SN0... | DESADV | DELIVERED | ORCHESTRATOR | 2026-03-16 23:06:59 |
| 16 | TX-...19738-565 | 619... | SN0... | INVOIC | DELIVERED | ORCHESTRATOR | 2026-03-16 23:06:59 |
| 17 | TX-...20001-637 | SN0... | 619... | ORDERS | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 18 | TX-...20030-432 | SN0... | 619... | ORDRSP | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 19 | TX-...20045-534 | SN0... | 619... | DESADV | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 20 | TX-...20072-535 | SN0... | 619... | INVOIC | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 21 | 93e049ba-... | 619... | SN0... | ORDERS | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 22 | 44181f5c-... | 619... | SN0... | ORDRSP | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 23 | 92cc4098-... | 619... | SN0... | DESADV | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:00 |
| 24 | c0bda575-... | 619... | SN0... | INVOIC | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:01 |
| 25 | 43a2b2f9-... | SN0... | 619... | ORDERS | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:01 |
| 26 | 53cdafec-... | SN0... | 619... | ORDRSP | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:01 |
| 27 | e2172590-... | SN0... | 619... | DESADV | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:01 |
| 28 | 14a5929f-... | SN0... | 619... | INVOIC | DELIVERED | ORCHESTRATOR | 2026-03-16 23:07:01 |

**16 transactions enregistrées, toutes DELIVERED avec `transport_mode = ORCHESTRATOR`.**

---

## 6. Matrice de Couverture

| Type Message | TN→SN Plain | SN→TN Plain | TN→SN E2EE | SN→TN E2EE |
|-------------|:-----------:|:-----------:|:----------:|:----------:|
| **ORDERS** | ✅ | ✅ | ✅ | ✅ |
| **ORDRSP** | ✅ | ✅ | ✅ | ✅ |
| **DESADV** | ✅ | ✅ | ✅ | ✅ |
| **INVOIC** | ✅ | ✅ | ✅ | ✅ |

---

## 7. Problèmes Résolus Pendant les Tests

| Problème | Cause | Résolution |
|----------|-------|------------|
| `ERR_REQUIRE_ESM` sur Sénégal | `uuid` v13 est ESM-only | Remplacé par `crypto.randomUUID()` natif |
| `OAEP decoding error` sur Sénégal | Clé publique obsolète dans `partners/SN02583102G3.pem` | Échange correct des clés publiques entre serveurs |
| Orchestrator DB `undefined/undefined` | `dotenv` chargeait `.env` depuis le CWD au lieu du dossier du module | Ajout de `path.resolve(__dirname, '.env')` |
| Orchestrator port conflict (5002) | Port déjà utilisé | Migration vers port 5010 |
| Hub forwarding encrypted to plaintext endpoint | Messages E2EE envoyés à `/api/edi/receive` au lieu de `/api/p2p/receive` | Smart-routing dans HubController : détection `header`+`envelope` → `/api/p2p/receive` |
| MySQL datetime format | ISO 8601 (`T`, `Z`) incompatible avec MySQL `DATETIME` | Ajout de `_toMySQLDate()` helper |

---

## 8. Conclusion

**Tous les scénarios de test sont validés avec succès (17/17).**

Le système EDI est opérationnel avec :
- **Routage centralisé** via l'Orchestrator Hub (port 5010)
- **4 types de messages EANCOM** : ORDERS, ORDRSP, DESADV, INVOIC
- **Communication bidirectionnelle** : Tunisie ↔ Sénégal
- **Chiffrement E2E** : AES-256-GCM + RSA-2048 avec signature RSA-SHA256
- **Audit trail complet** : Toutes les transactions loguées dans MySQL avec timestamps
- **Smart-routing** : Détection automatique plaintext vs chiffré
- **Tolérance SSL** : Agent HTTPS avec vérification désactivée pour l'environnement DEV
