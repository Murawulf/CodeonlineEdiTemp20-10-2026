# Proposition d'Architecture pour le Système E2EE et Communication Hybride

## Structure des Dossiers

Je propose d'ajouter les modules suivants dans votre dossier `backend` existant :

```text
backend/
├── services/
│   ├── crypto/
│   │   ├── CryptoService.js       # Gestion AES-256-GCM + RSA (Signature & Chiffrement)
│   │   └── KeyManager.js          # Gestion des clés (Private Key locale, Public Keys distantes)
│   ├── communication/
│   │   ├── CommunicationProvider.js # Circuit Breaker, Stratégie Fallback, Dispatch
│   │   ├── DiscoveryCache.js      # Cache local de l'annuaire (GLN -> IP)
│   │   └── AuditLogger.js         # Queue locale pour les logs offline
├── routes/
│   ├── orchestrator.js            # Endpoints Orchestrateur (relais, audit, discovery)
│   └── p2p.js                     # Endpoints pour réception directe (P2P)
├── workers/
│   ├── discovery_worker.js        # Tâche de fond : Mise à jour du cache annuaire
│   └── audit_sync_worker.js       # Tâche de fond : Sync des logs offline vers Orchestrateur
```

## Classes et Interfaces Proposées

### 1. CryptoService (Service Singleton)
Responsable de la couche de sécurité (Étape 1).

```javascript
class CryptoService {
  /**
   * Chiffre un payload pour un destinataire spécifique.
   * 1. Génère une clé AES-256 éphémère.
   * 2. Chiffre le payload avec AES-GCM.
   * 3. Chiffre la clé AES avec la clé publique RSA du destinataire.
   * 4. Signe le hash du payload original avec la clé privée de l'expéditeur.
   */
  async encryptAndSign(payload, recipientGLN) { ... }

  /**
   * Déchiffre une enveloppe reçue.
   * 1. Déchiffre la clé AES avec la clé privée locale.
   * 2. Déchiffre le payload avec AES-GCM.
   * 3. Vérifie la signature avec la clé publique de l'expéditeur.
   */
  async decryptAndVerify(envelope) { ... }
}
```

### 2. CommunicationProvider (Service Principal)
Responsable de l'envoi intelligent (Étape 3).

```javascript
class CommunicationProvider {
  constructor() {
    this.orchestratorUrls = [process.env.ORCHESTRATOR_PRIMARY, process.env.ORCHESTRATOR_SECONDARY];
    this.mode = 'HYBRID'; // HYBRID (Orchestrator first) ou P2P_ONLY
  }

  /**
   * Point d'entrée principal pour envoyer un message EDI.
   * Implémente le pattern "Waterfall" (Circuit Breaker).
   */
  async dispatch(message, targetGLN) {
    const envelope = await cryptoService.encryptAndSign(message, targetGLN);
    
    try {
      return await this._tryOrchestrator(envelope);
    } catch (error) {
      console.warn("Orchestrator failed, attempting P2P Fallback...");
      return await this._tryP2P(envelope, targetGLN);
    }
  }

  async _tryP2P(envelope, targetGLN) {
    const targetIP = await discoveryCache.resolve(targetGLN);
    // Envoi direct, et si succès -> AuditLogger.logOffline(...)
  }
}
```

### 3. Orchestrator Controller (Mise à jour Serveur Central)
Responsable du routage "Stateless" et de l'Audit (Étape 2).

```javascript
// POST /api/orchestrator/relay
async function relayMessage(req, res) {
  const { header, encryptedPayload, signature } = req.body;
  
  // 1. Validation légère (Header integrity)
  
  // 2. Enregistrement Audit (Métadonnées uniquement)
  await auditLedger.record({
    sender: header.sender,
    receiver: header.receiver,
    msgId: header.msgId,
    timestamp: Date.now()
  });

  // 3. Routage vers le destinataire (Push)
  // Le payload chiffré ne touche jamais le disque, reste en RAM.
}
```

### 4. Modèle de Données (Audit)

Table `audit_ledger` (MySQL/SQLite) :
- `id` (UUID) : Identifiant unique de l'enregistrement d'audit sur le Hub.
- `transaction_id` (UUID) : Généré par le pays expéditeur. Permet la corrélation E2E.
- `sender_gln` (VARCHAR)
- `receiver_gln` (VARCHAR)
- `message_type` (VARCHAR) : ex: ORDERS, DESADV, INVOIC.
- `status` (ENUM) : 'RECEIVED_BY_HUB', 'IN_QUEUE', 'DELIVERED', 'FAILED'.
- `transport_mode` (ENUM) : 'ORCHESTRATOR', 'P2P'.
- `received_at` (TIMESTAMP) : Arrivée sur le Hub.
- `delivered_at` (TIMESTAMP) : Confirmation par le pays cible.
- `error_reason` (TEXT) : En cas d'échec.

---

Est-ce que cette structure et cette logique vous conviennent ? 
Si oui, je commencerai par l'**ÉTAPE 1 : Sécurité et Chiffrement Hybride**.
