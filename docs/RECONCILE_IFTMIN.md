# Réconciliation IFTMIN/transport — inventaire prod ↔ repo (P1.1)

**Date** : 2026-07-15. **Constat** : le backend IFTMIN/transport était **déployé en prod** (hub `registry.codeonline-edi.net` = 65.109.125.164, `/var/www/Edi-prod/edi_orchestrator`) mais **totalement absent du repo git** (drift). Rapatrié dans `edi_orchestrator/` aux mêmes chemins (P1.2). Schéma DB réel figé dans `sql/migrations/2026_iftmin_transport_schema.sql` (P1.3).

## Fichiers rapatriés (prod → `edi_orchestrator/`)

| Fichier | md5 prod | Avant (repo) | Action |
|---|---|---|---|
| `services/generateIftminEANCOM.js` | `44983d7e…` | ABSENT | rapatrié |
| `services/eancom_parser.js` | `616836b3…` | ABSENT | rapatrié |
| `services/TransportOrderModel.js` | — | ABSENT | rapatrié |
| `services/carriers/registry.js` | `c20bf60c…` | ABSENT | rapatrié |
| `services/carriers/civ_mock01.js` | `25b5a8c3…` | ABSENT | rapatrié |
| `services/carriers/CarrierAdapter.js` | `40eeba28…` | ABSENT | rapatrié |
| `services/carriers/README.md` | `1cfefba9…` | ABSENT | rapatrié |
| `controllers/TransportController.js` | `1f185cda…` | ABSENT | rapatrié |
| `routes/transport.js` | `800593ca…` | ABSENT | rapatrié |
| `test/p3t_e2e.test.js` | `f43d7edf…` | ABSENT | rapatrié |
| `test/transport_order.test.js` | `3917ee2a…` | ABSENT | rapatrié |
| `test/carrier_registry.test.js` | `c35de3b5…` | ABSENT | rapatrié |
| `test/transport_route.test.js` | `af74319f…` | ABSENT | rapatrié |
| `server.js` | `b8b5c2e1…` | présent (sans mount) | remplacé par la version prod (= repo + mount `/api/orchestrator/transport`) |

**Vérifs P1.2** : `node --check` sur les 9 fichiers .js exécutables → 0 erreur ; scan secrets (`JWT_SECRET=`, `password=`, `api_key=`, clés PEM) → 0 en dur.

## Schéma DB (P1.3)
- Prod réel : table **`edi_transport_orders`** (enum `status` : CREATED, SENT_TO_CARRIER, ACCEPTED, IN_TRANSIT, DELIVERED, FAILED, CANCELLED). **Pas de table `edi_tracking`** en prod (le suivi = `status` + `tracking_number`).
- Migration figée : `sql/migrations/2026_iftmin_transport_schema.sql` (idempotent, testé 2× sur base jetable).
- Anciennes migrations incompatibles (`create_transport_tables.sql`, `update_existing_transport_tables.sql`) → `sql/migrations/_ARCHIVE/`.
- Staging obsolète (`docs/tests/edi-suite/hub-p3/`, générateur + tests staging) → `docs/tests/edi-suite/_ARCHIVE/`.

## Carriers (adaptateurs)
`services/carriers/registry.js` → `resolve(country, carrier)`. Table `ADAPTERS = { '384:MOCK01','788:MOCK01','686:MOCK01' } → civ_mock01`. Seul adaptateur : **`MOCK01` (simulé)** — sert les 3 pays en attendant les vrais transporteurs [FM-1].

## Suite
Drift supprimé. → **P2** : vérifier l'IFTMIN déployé en réel (JWT + E2E + tests serveur).
