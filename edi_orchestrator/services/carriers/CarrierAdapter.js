'use strict';

/**
 * CarrierAdapter (P3.3) — contrat commun de tous les adaptateurs transporteurs.
 *
 * Un adaptateur = 1 fichier dans services/carriers/ qui étend cette classe
 * (ou en implémente les méthodes) + 1 entrée dans registry.js + credentials
 * dans le .env du hub (`CARRIER_<CODE>_API_KEY`, `CARRIER_<CODE>_API_URL`, …).
 * Voir services/carriers/README.md.
 *
 * Toutes les méthodes retournent des statuts NORMALISÉS parmi :
 *   SENT_TO_CARRIER | ACCEPTED | IN_TRANSIT | DELIVERED | FAILED
 */
class CarrierAdapter {
  /**
   * @param {Object} opts
   * @param {string} opts.code        Code transporteur (ex. 'MOCK01')
   * @param {string} opts.name        Nom lisible
   * @param {string} opts.countryCode Pays UN M49/ISO ('384' CIV, '788' TUN, '686' SEN)
   */
  constructor({ code, name, countryCode }) {
    if (!code) throw new Error('[CarrierAdapter] code is required');
    this.code = code;
    this.name = name || code;
    this.countryCode = countryCode || null;
  }

  /**
   * Crée une expédition chez le transporteur à partir d'un IFTMIN parsé.
   * @param {Object} parsedIftmin  Sortie de parseEANCOM (messageType IFTMIN)
   * @param {string} rawIftmin     Message EANCOM brut (pour les API qui l'acceptent)
   * @returns {Promise<{trackingNumber: string, status: string, raw?: any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async createShipment(parsedIftmin, rawIftmin) {
    throw new Error(`[${this.code}] createShipment() not implemented`);
  }

  /**
   * Statut courant d'une expédition.
   * @param {string} trackingNumber
   * @returns {Promise<{trackingNumber: string, status: string, raw?: any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async getStatus(trackingNumber) {
    throw new Error(`[${this.code}] getStatus() not implemented`);
  }

  /**
   * Annule une expédition (optionnel selon transporteur).
   * @param {string} trackingNumber
   * @returns {Promise<{trackingNumber: string, cancelled: boolean}>}
   */
  // eslint-disable-next-line no-unused-vars
  async cancel(trackingNumber) {
    throw new Error(`[${this.code}] cancel() not implemented`);
  }

  /** Statuts normalisés autorisés en sortie d'adaptateur. */
  static get STATUSES() {
    return ['SENT_TO_CARRIER', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];
  }
}

module.exports = CarrierAdapter;
