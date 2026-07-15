'use strict';

// MOCK — remplacer dès credentials [FM-1]
//
// Adaptateur transporteur PILOTE (P3.4). Les credentials et la documentation
// API des transporteurs réels n'ont pas encore été fournis ([FM-1] du plan
// PLAN_EDI_SUITE.md). Cet adaptateur simule un transporteur : il respecte
// exactement le contrat CarrierAdapter (createShipment/getStatus/cancel,
// statuts normalisés) pour que le remplacement par l'API réelle soit un
// changement de fichier UNIQUE, sans toucher au pipeline du hub.
//
// Comportement simulé :
//  - createShipment → trackingNumber "MOCK-<ts>-<rand>" + statut SENT_TO_CARRIER
//  - getStatus      → progression déterministe dans le temps :
//                     <60 s : ACCEPTED · <120 s : IN_TRANSIT · ensuite : DELIVERED
//  - cancel         → toujours accepté
//
// Lecture .env (mêmes clés que le futur adaptateur réel) :
//  CARRIER_MOCK01_API_URL / CARRIER_MOCK01_API_KEY (non requis pour le mock)

const CarrierAdapter = require('./CarrierAdapter');

class CivMock01Adapter extends CarrierAdapter {
  constructor({ countryCode } = {}) {
    super({ code: 'MOCK01', name: 'Transporteur Pilote (MOCK)', countryCode });
    // Les expéditions simulées vivent en mémoire du process hub.
    this._shipments = new Map();
  }

  async createShipment(parsedIftmin, _rawIftmin) {
    if (!parsedIftmin || parsedIftmin.messageType !== 'IFTMIN') {
      throw new Error('[MOCK01] createShipment expects a parsed IFTMIN');
    }
    if (!parsedIftmin.placeOfDelivery) {
      throw new Error('[MOCK01] IFTMIN has no place of delivery');
    }
    const trackingNumber = `MOCK-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    this._shipments.set(trackingNumber, { createdAt: Date.now(), cancelled: false });
    return {
      trackingNumber,
      status: 'SENT_TO_CARRIER',
      raw: { simulated: true, deliveryTo: parsedIftmin.placeOfDelivery },
    };
  }

  async getStatus(trackingNumber) {
    const known = this._shipments.get(trackingNumber);
    // Un tracking MOCK-* inconnu du process (redémarrage) reste suivi : âge depuis son timestamp
    const m = /^MOCK-(\d+)-\d+$/.exec(trackingNumber);
    if (!known && !m) throw new Error(`[MOCK01] Unknown tracking number: ${trackingNumber}`);
    const createdAt = known ? known.createdAt : parseInt(m[1], 10);
    if (known && known.cancelled) return { trackingNumber, status: 'FAILED', raw: { cancelled: true } };

    const ageSeconds = (Date.now() - createdAt) / 1000;
    const status = ageSeconds < 60 ? 'ACCEPTED' : ageSeconds < 120 ? 'IN_TRANSIT' : 'DELIVERED';
    return { trackingNumber, status, raw: { simulated: true, ageSeconds: Math.round(ageSeconds) } };
  }

  async cancel(trackingNumber) {
    const s = this._shipments.get(trackingNumber);
    if (s) s.cancelled = true;
    return { trackingNumber, cancelled: true };
  }
}

module.exports = CivMock01Adapter;
