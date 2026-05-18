/**
 * Service token helper — used for backend-to-backend authenticated calls
 * (proxy forwarding, GPC sync, EDI dispatch, etc.).
 *
 * Le token est signé avec le même JWT_SECRET que les tokens utilisateurs,
 * donc les noeuds pairs (Tunisie ↔ Sénégal ↔ Côte d'Ivoire) l'acceptent
 * via leur middleware `verifyJWT` standard.
 *
 * Le token est mis en cache et renouvelé automatiquement quand il reste
 * moins de 60 secondes avant expiration.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // serviceAuth est utilisé aussi dans les workers — on throw pour bloquer
  // tout démarrage qui n'aurait pas le secret partagé.
  throw new Error('JWT_SECRET is required (set it in .env on every node — same value across the EDI network).');
}
const SERVICE_TOKEN_TTL_SECONDS = 15 * 60;

let _cache = { token: null, expiresAt: 0 };

const getServiceToken = () => {
  const now = Math.floor(Date.now() / 1000);
  if (_cache.token && _cache.expiresAt - now > 60) {
    return _cache.token;
  }
  const payload = {
    sub: 'system',
    role: 'service',
    instance: process.env.CURRENT_INSTANCE_CODE || 'unknown',
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: SERVICE_TOKEN_TTL_SECONDS });
  _cache = { token, expiresAt: now + SERVICE_TOKEN_TTL_SECONDS };
  return token;
};

const serviceAuthHeaders = (extra = {}) => ({
  Authorization: `Bearer ${getServiceToken()}`,
  ...extra,
});

module.exports = { getServiceToken, serviceAuthHeaders };
