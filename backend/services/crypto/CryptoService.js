const crypto = require('crypto');
const keyManager = require('./KeyManager');

class CryptoService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Chiffre un payload JSON pour un destinataire et signe le message.
   * @param {Object} payload - Données à chiffrer (sera JSON.stringify)
   * @param {string} recipientGLN - GLN du destinataire pour récupérer sa clé publique
   * @returns {Promise<Object>} Enveloppe contenant { encryptedData, iv, encryptedKey, signature, tag }
   */
  async encryptAndSign(payload, recipientGLN) {
    try {
      const dataBuffer = Buffer.from(JSON.stringify(payload));

      // 1. Générer une clé AES éphémère (32 bytes pour AES-256)
      const aesKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16); // IV pour GCM

      // 2. Chiffrer le payload avec AES-256-GCM
      const cipher = crypto.createCipheriv(this.algorithm, aesKey, iv);
      let encryptedData = cipher.update(dataBuffer);
      encryptedData = Buffer.concat([encryptedData, cipher.final()]);
      const authTag = cipher.getAuthTag();

      // 3. Chiffrer la clé AES avec la clé publique RSA du destinataire
      const recipientPublicKey = await keyManager.getPublicKeyForGLN(recipientGLN);
      const encryptedKey = crypto.publicEncrypt(
        {
          key: recipientPublicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        aesKey
      );

      // 4. Signer le hash du payload original avec la clé privée de l'expéditeur (Nous)
      const myPrivateKey = keyManager.getLocalPrivateKey();
      const sign = crypto.createSign('SHA256');
      sign.update(dataBuffer);
      sign.end();
      const signature = sign.sign(myPrivateKey);

      return {
        encryptedData: encryptedData.toString('base64'),
        iv: iv.toString('base64'),
        tag: authTag.toString('base64'),
        encryptedKey: encryptedKey.toString('base64'),
        signature: signature.toString('base64')
      };

    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Déchiffre une enveloppe reçue et vérifie la signature.
   * @param {Object} envelope - { encryptedData, iv, encryptedKey, signature, tag }
   * @param {string} senderGLN - GLN de l'expéditeur pour vérifier la signature
   * @returns {Promise<Object>} Le payload original déchiffré (JSON parsed)
   */
  async decryptAndVerify(envelope, senderGLN) {
    try {
      const { encryptedData, iv, encryptedKey, signature, tag } = envelope;

      // Convertir base64 en Buffer
      const encryptedDataBuf = Buffer.from(encryptedData, 'base64');
      const ivBuf = Buffer.from(iv, 'base64');
      const tagBuf = Buffer.from(tag, 'base64');
      const encryptedKeyBuf = Buffer.from(encryptedKey, 'base64');
      const signatureBuf = Buffer.from(signature, 'base64');

      // 1. Déchiffrer la clé AES avec notre clé privée RSA
      const myPrivateKey = keyManager.getLocalPrivateKey();
      const aesKey = crypto.privateDecrypt(
        {
          key: myPrivateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        encryptedKeyBuf
      );

      // 2. Déchiffrer le payload avec AES-256-GCM
      const decipher = crypto.createDecipheriv(this.algorithm, aesKey, ivBuf);
      decipher.setAuthTag(tagBuf);
      let decrypted = decipher.update(encryptedDataBuf);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // 3. Vérifier la signature avec la clé publique de l'expéditeur
      const senderPublicKey = await keyManager.getPublicKeyForGLN(senderGLN);
      const verify = crypto.createVerify('SHA256');
      verify.update(decrypted);
      verify.end();
      
      const isVerified = verify.verify(senderPublicKey, signatureBuf);

      if (!isVerified) {
        throw new Error('Invalid signature: Integrity check failed');
      }

      return JSON.parse(decrypted.toString());

    } catch (error) {
      console.error('Decryption/Verification failed:', error);
      throw new Error(`Decryption/Verification failed: ${error.message}`);
    }
  }
}

module.exports = new CryptoService();
