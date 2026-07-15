'use strict';

/**
 * Registry des adaptateurs transporteurs (P3.3).
 *
 * Résolution par (country_code, carrier_code). Chaque adaptateur est chargé
 * paresseusement et ISOLÉ : une erreur de chargement ou d'exécution d'un
 * adaptateur ne casse jamais les autres (le hub renvoie FAILED pour lui seul).
 *
 * Ajouter un transporteur :
 *   1. créer services/carriers/<pays>_<code>.js (étend CarrierAdapter)
 *   2. ajouter une entrée dans ADAPTERS ci-dessous
 *   3. poser les credentials dans le .env du hub (jamais commitées)
 */

const path = require('path');

/** Table de routage {country_code}:{carrier_code} → fichier adaptateur. */
const ADAPTERS = {
  // Côte d'Ivoire
  '384:MOCK01': './civ_mock01.js',
  // Tunisie
  '788:MOCK01': './civ_mock01.js', // le pilote mock sert tous les pays en attendant [FM-1]
  // Sénégal
  '686:MOCK01': './civ_mock01.js',
};

const _cache = new Map();

class CarrierResolutionError extends Error {
  constructor(countryCode, carrierCode) {
    super(`No carrier adapter registered for country=${countryCode} carrier=${carrierCode}. ` +
          `Known: ${Object.keys(ADAPTERS).join(', ') || '(none)'}`);
    this.name = 'CarrierResolutionError';
    this.statusCode = 404;
  }
}

/**
 * Résout l'adaptateur pour (pays, transporteur).
 * @throws {CarrierResolutionError} si aucun adaptateur enregistré
 * @throws {Error} si le chargement du module échoue (isolé à CE transporteur)
 */
function resolve(countryCode, carrierCode) {
  const key = `${countryCode}:${String(carrierCode).toUpperCase()}`;
  if (_cache.has(key)) return _cache.get(key);

  const file = ADAPTERS[key];
  if (!file) throw new CarrierResolutionError(countryCode, carrierCode);

  let AdapterClass;
  try {
    AdapterClass = require(path.join(__dirname, file));
  } catch (err) {
    // Isolation : l'échec de CE module n'affecte pas les autres entrées
    throw new Error(`Carrier adapter '${key}' failed to load: ${err.message}`);
  }
  const instance = typeof AdapterClass === 'function'
    ? new AdapterClass({ countryCode, code: String(carrierCode).toUpperCase() })
    : AdapterClass;
  _cache.set(key, instance);
  return instance;
}

/** Liste les transporteurs disponibles (pour l'UI / diagnostic). */
function listCarriers() {
  return Object.keys(ADAPTERS).map((key) => {
    const [countryCode, carrierCode] = key.split(':');
    return { country_code: countryCode, carrier_code: carrierCode, adapter: ADAPTERS[key] };
  });
}

module.exports = { resolve, listCarriers, CarrierResolutionError, ADAPTERS };
