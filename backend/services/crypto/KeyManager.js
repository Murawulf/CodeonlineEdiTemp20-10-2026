const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class KeyManager {
  constructor() {
    this.keysDir = process.env.KEYS_DIR || path.join(__dirname, '../../config/keys');
    this.ensureKeysDir();
  }

  ensureKeysDir() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true });
    }
    const partnersDir = path.join(this.keysDir, 'partners');
    if (!fs.existsSync(partnersDir)) {
      fs.mkdirSync(partnersDir, { recursive: true });
    }
    
    // Auto-generate local keys if missing
    this.generateLocalKeys();
  }

  /**
   * Génère une paire de clés RSA locale si elle n'existe pas.
   * Sauvegarde private.pem et public.pem.
   */
  generateLocalKeys() {
    const privateKeyPath = path.join(this.keysDir, 'private.pem');
    const publicKeyPath = path.join(this.keysDir, 'public.pem');

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      console.log('Local RSA keys already exist.');
      return;
    }

    console.log('Generating new local RSA keys...');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);
    console.log('Local RSA keys generated and saved.');
  }

  /**
   * Récupère la clé privée locale.
   */
  getLocalPrivateKey() {
    try {
      return fs.readFileSync(path.join(this.keysDir, 'private.pem'), 'utf8');
    } catch (error) {
      throw new Error(`Failed to read local private key: ${error.message}`);
    }
  }

  /**
   * Récupère la clé publique locale.
   */
  getLocalPublicKey() {
    try {
      return fs.readFileSync(path.join(this.keysDir, 'public.pem'), 'utf8');
    } catch (error) {
      throw new Error(`Failed to read local public key: ${error.message}`);
    }
  }

  /**
   * Récupère la clé publique d'un partenaire (GLN).
   * Dans un système réel, cela pourrait venir d'une PKI ou de l'annuaire central.
   * Pour l'instant, on suppose qu'elles sont stockées dans config/keys/partners/<GLN>.pem
   */
  getPublicKeyForGLN(gln) {
    // TODO: Implement Discovery/PKI lookup.
    // Fallback: look in local partners folder
    const partnerKeyPath = path.join(this.keysDir, 'partners', `${gln}.pem`);
    if (!fs.existsSync(partnerKeyPath)) {
        throw new Error(`Public key not found for GLN: ${gln}`);
    }
    return fs.readFileSync(partnerKeyPath, 'utf8');
  }
}

module.exports = new KeyManager();
