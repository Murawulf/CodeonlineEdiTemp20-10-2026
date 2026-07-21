# test_edi_e2e.sh — Test de bout en bout de l'échange EDI via le registry

## Objet

`scripts/test_edi_e2e.sh` valide **toute la chaîne EDI EANCOM du réseau PAESN** en conditions réelles, pour un nœud récepteur donné :

```
dispatch (registry) → routage hub (partners) → réception nœud (INBOUND)
→ parsing EANCOM (edi_desadv) → APERAK auto-ack retour (round-trip)
→ robustesse (GLN inconnu) → nettoyage automatique
```

10 vérifications, verdict final `N OK / N ÉCHEC`, code retour `0` si tout passe (utilisable en CI/cron).

## Usage

```bash
./scripts/test_edi_e2e.sh          # récepteur = TUN (défaut)
./scripts/test_edi_e2e.sh sen      # récepteur = SEN
./scripts/test_edi_e2e.sh civ      # récepteur = CIV (prod clients réels — à utiliser en connaissance)
```

**Prérequis** : alias SSH dans `~/.ssh/config` — `hub-prod`, `tunp`, `senp`, `civ`. Aucun secret dans le script : les creds DB des nœuds sont lus à l'exécution depuis leur `backend/.env` ; le hub utilise l'auth socket root.

## Ce que le script vérifie (10 étapes)

| # | Vérification | Attendu |
|---|---|---|
| 1 | Routage hub : GLN récepteur dans `partners` | `ACTIVE` |
| 2 | `POST /api/orchestrator/dispatch` ORDERS | `success:true` |
| 3 | Transaction hub | `DELIVERED` |
| 4 | Réception nœud (`edi_transmissions`) | `INBOUND` présent |
| 5 | Dispatch DESADV (avec CPS/PAC/GIN = colis + SSCC) | `success:true` |
| 6 | Statut DESADV côté nœud | `PROCESSED` |
| 7 | Parsing structuré | entête `edi_desadv` créée |
| 8 | APERAK auto-ack retour nœud→hub | ≥1 `DELIVERED` |
| 9 | Dispatch vers GLN inconnu | HTTP `404` (refus propre) |
| 10 | Nettoyage hub + nœud | 0 résidu |

## Sécurité des données

- Les refs de test sont **uniques** (`ORD-E2E<timestamp>` / `DES-E2E<timestamp>`) — aucune collision possible avec des données réelles.
- Le nettoyage supprime **uniquement** les lignes portant ces refs (hub `transactions`, nœud `edi_transmissions`/`edi_desadv`/`edi_desadv_lines`).
- Le nœud « émetteur » n'est qu'un **label GLN** dans le payload : aucun serveur émetteur n'est touché. Seuls le hub et le nœud récepteur enregistrent des données (puis nettoyées).

## Interprétation des échecs

| Échec | Piste |
|---|---|
| `hub partners: … (≠ACTIVE)` | GLN absent/suspendu dans la table `partners` du hub |
| `dispatch …: success:false` | hub down, ou payload rejeté — lire la réponse affichée |
| `hub transaction: ''` | dispatch non enregistré (vérifier logs orchestrateur) |
| `récepteur: ORDERS absent` | forward hub→nœud KO (URL `target_url`, TLS, ou nœud down) |
| `DESADV 'ERROR'` | parsing EANCOM en échec côté nœud (voir `pm2 logs`) |
| `APERAK retour absent` | worker/notification ACK côté nœud (non bloquant pour la réception) |
| `nettoyage: résidus` | supprimer à la main avec les refs affichées en tête de run |

## Historique

- 2026-07-21 : créé (P4 — validation post-déploiement du server.js réconcilié). Runs de référence : TUN 10/10, SEN 10/10.
