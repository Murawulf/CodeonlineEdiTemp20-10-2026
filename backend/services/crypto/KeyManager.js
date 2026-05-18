const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const configService = require('../configService');
const { serviceAuthHeaders } = require('../serviceAuth');
const { queryDB, runUpdate } = require('../../db_utils');

class KeyManager {
  constructor() {
    this.keysDir = process.env.KEYS_DIR || path.join(__dirname, '../../../config/keys');
    this.ensureKeysDir();
    this.db = null;
  }

  setDb(db) {
    this.db = db;
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
   * Récupère la clé publique d'un partenaire (GLN) via DB ou Orchestrator.
   */
  async getPublicKeyForGLN(gln) {
    // 1. Try Local DB Cache
    if (this.db) {
        try {
            const rows = await queryDB(this.db, "SELECT public_key FROM network_directory WHERE gln = ?", [gln]);
            if (rows && rows.length > 0 && rows[0].public_key) {
                return rows[0].public_key;
            }
        } catch (e) {
            console.warn('[KeyManager] DB lookup failed:', e.message);
        }
    }

    // 2. Try Orchestrator
    const orchestratorUrl = configService.get('ORCHESTRATOR_URL');
    if (orchestratorUrl) {
        try {
            const response = await axios.get(`${orchestratorUrl}/api/orchestrator/keys/${gln}`, {
                timeout: 5000,
                headers: serviceAuthHeaders()
            });
            if (response.data && response.data.public_key) {
                const pubKey = response.data.public_key;
                
                // Save to local DB cache
                if (this.db) {
                    await runUpdate(this.db, `
                        INSERT INTO network_directory (gln, public_key, updated_at) 
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                        ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), updated_at = CURRENT_TIMESTAMP
                    `, [gln, pubKey]).catch(e => console.error('[KeyManager] Failed to cache key:', e.message));
                }
                console.log(`[KeyManager] Fetched and cached public key for ${gln} from Orchestrator`);
                return pubKey;
            }
        } catch (e) {
            console.warn(`[KeyManager] Failed to fetch key for ${gln} from Orchestrator:`, e.message);
        }
    }

    // 3. Fallback: look in local partners folder (legacy)
    const partnerKeyPath = path.join(this.keysDir, 'partners', `${gln}.pem`);
    if (fs.existsSync(partnerKeyPath)) {
        return fs.readFileSync(partnerKeyPath, 'utf8');
    }

    throw new Error(`Public key not found for GLN: ${gln}`);
  }
  /**
   * Publie la clé publique locale vers l'Orchestrateur (si configuré)
   */
  async publishKeyToOrchestrator() {
      const orchestratorUrl = configService.get('ORCHESTRATOR_URL');
      const myGln = configService.get('MY_GLN');
      
      if (!orchestratorUrl || !myGln) {
          console.log('[KeyManager] Orchestrator URL or MY_GLN not configured, skipping key publication.');
          return;
      }

      try {
          const publicKey = this.getLocalPublicKey();
          const apiUrl = configService.get('LOCAL_API_URL') || `http://localhost:${process.env.PORT || 5001}`;
          
          await axios.post(`${orchestratorUrl}/api/orchestrator/register`, {
              gln: myGln,
              url: apiUrl,
              public_key: publicKey
          }, {
              timeout: 10000,
              headers: serviceAuthHeaders()
          });
          
          console.log(`[KeyManager] ✅ Successfully published public key for ${myGln} to Orchestrator`);
      } catch (err) {
          console.error(`[KeyManager] ❌ Failed to publish key to Orchestrator:`, err.message);
      }
  }
}

module.exports = new KeyManager();
