# Scénarios de test — Transport IFTMIN cross-pays (validés)

> **E2E réel** sur le hub PAESN (`registry.codeonline-edi.net`, 65.109.125.164). Ordre de transport IFTMIN via l'adaptateur transporteur **simulé MOCK01**. GLN hub réels (CIV 6181234567890 / TUN 6191234567890 / SEN SN02583102G3). **Validé le 2026-07-15.** Données de test nettoyées après (0 résidu).

## Résultats — 3 axes pays

| Axe | `country_code` | Création | IFTMIN généré | Transporteur | Tracking | Statut (après refresh) | Transaction `IFTMIN` |
|---|---|---|---|---|---|---|---|
| 🇨🇮 CIV → 🇹🇳 TUN | `384` | ✅ `success:true` | ✅ 439 car. | MOCK01 | `MOCK-…` | `ACCEPTED` | ✅ loguée |
| 🇹🇳 TUN → 🇸🇳 SEN | `788` | ✅ `success:true` | ✅ 436 car. | MOCK01 | `MOCK-…` | ✅ loguée |
| 🇸🇳 SEN → 🇨🇮 CIV | `686` | ✅ `success:true` | ✅ 436 car. | MOCK01 | `MOCK-…` | ✅ loguée |

**3/3 axes OK.** Chaque axe : `POST /transport/create` → IFTMIN D.01B valide généré → adaptateur MOCK01 → `tracking_number` assigné → ligne `edi_transport_orders` + transaction `IFTMIN` loguée.

## Note sur le statut
L'adaptateur simulé **MOCK01** fait progresser le statut **dans le temps** : `SENT_TO_CARRIER → ACCEPTED → IN_TRANSIT → DELIVERED`. Un `refresh` immédiat atteint `ACCEPTED` ; le **cycle complet jusqu'à `DELIVERED`** est prouvé par le test `p3t_e2e` (via l'API tracking rôle transporteur : `IN_TRANSIT` puis `DELIVERED`, transition illégale refusée).

## Reproduire un axe
```
# 1. Miner un JWT réseau (côté hub, JWT_SECRET) ; 2. créer :
POST https://registry.codeonline-edi.net/api/orchestrator/transport/create
Authorization: Bearer <jwt>
{
  "country_code": "384",              # NUMÉRIQUE (384 CIV / 788 TUN / 686 SEN)
  "carrier_code": "MOCK01",
  "order_ref": "…", "desadv_ref": "…",
  "consignor": {"gln": "6181234567890"}, "consignee": {"gln": "6191234567890"},
  "pickup": {"gln": "6181234567890"}, "delivery": {"gln": "6191234567890"},
  "goods": [{"packageCount": 5, "packageType": "CT", "description": "…"}]   # requis
}
# 3. GET /transport/<ref>  ·  4. POST /transport/<ref>/refresh
```
Déclenchement **auto** possible : un DESADV portant un transporteur (segment `NAD+CA`/`TDT`) qui transite par le hub crée l'ordre de transport automatiquement (cf. `services/autoTransport.js`).

## Nettoyage
Toutes les données de test (`IFT-TEST-…`) supprimées : `edi_transport_orders` + `transactions` (hub) = **0 résidu**.
