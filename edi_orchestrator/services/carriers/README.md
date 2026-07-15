# Adaptateurs transporteurs (Hub EDI) — P3.3

Couche mutualisée d'appel des API transporteurs. **Ajouter un transporteur = 1 fichier + 1 ligne + credentials .env.** Extensible 3 → 10 → 20 pays sans toucher au pipeline.

## Contrat (`CarrierAdapter.js`)

```js
class MonTransporteur extends CarrierAdapter {
  async createShipment(parsedIftmin, rawIftmin) → { trackingNumber, status, raw? }
  async getStatus(trackingNumber)               → { trackingNumber, status, raw? }
  async cancel(trackingNumber)                  → { trackingNumber, cancelled }
}
```

`status` retourné = statut **normalisé** : `SENT_TO_CARRIER | ACCEPTED | IN_TRANSIT | DELIVERED | FAILED`. La traduction statut-transporteur → statut normalisé se fait DANS l'adaptateur.

## Ajouter un transporteur (3 étapes, < 1 fichier de logique)

1. **Créer** `services/carriers/<pays>_<code>.js` :
   ```js
   const CarrierAdapter = require('./CarrierAdapter');
   class TunLivriExpress extends CarrierAdapter {
     constructor({ countryCode }) { super({ code: 'LIVRI', name: 'Livri Express', countryCode }); }
     async createShipment(iftmin) {
       const res = await axios.post(process.env.CARRIER_LIVRI_API_URL + '/shipments', mapIftmin(iftmin), {
         headers: { Authorization: `Bearer ${process.env.CARRIER_LIVRI_API_KEY}` }, timeout: 15000,
       });
       return { trackingNumber: res.data.tracking, status: 'SENT_TO_CARRIER', raw: res.data };
     }
     async getStatus(trk) { /* GET + mapping statuts */ }
     async cancel(trk) { /* DELETE/POST cancel */ }
   }
   module.exports = TunLivriExpress;
   ```
2. **Enregistrer** dans `registry.js` → `ADAPTERS['788:LIVRI'] = './tun_livri.js'`.
3. **Credentials** dans le `.env` du hub (`CARRIER_LIVRI_API_URL`, `CARRIER_LIVRI_API_KEY`). Jamais commitées, jamais en dur.

## Garanties d'isolation

- Résolution paresseuse par `(country_code, carrier_code)` : un module défaillant ne bloque que SON transporteur (`CarrierResolutionError` / erreur de chargement isolée).
- Le pipeline (`POST /api/orchestrator/transport/create`) enveloppe chaque appel adaptateur en try/catch → l'ordre passe à `FAILED` avec `error_message`, les autres transporteurs continuent.
- Timeouts et retries à implémenter DANS l'adaptateur (recommandé : timeout ≤ 15 s).

## Adaptateur pilote

`civ_mock01.js` (`MOCK01`, enregistré pour 384/788/686) : **MOCK explicite** — les credentials réels des transporteurs ne sont pas fournis ([FM-1]). À remplacer dès réception : créer l'adaptateur réel, changer la ou les entrées `ADAPTERS`, supprimer le mock.
