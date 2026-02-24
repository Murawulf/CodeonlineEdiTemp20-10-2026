# 📋 Document Centralisé : Modifications du Routage EDI

**Date :** 12 février 2026  
**Objectif :** Centraliser le routage EDI pour tous les types de messages (ORDERS, ORDRSP, DESADV, INVOIC) sans hardcode, supportant les communications intra-pays et inter-pays

---

## 🎯 Objectifs des Modifications

### Exigences
1. ✅ **Pas de hardcode** : Aucun nom de pays ou URL hardcodé dans le code
2. ✅ **Architecture transparente** : Même logique pour intra-pays et inter-pays
3. ✅ **Configuration centralisée** : Utilisation de `NETWORK_TOPOLOGY` en base de données
4. ✅ **Support multi-messages** : ORDERS, ORDRSP, DESADV, INVOIC
5. ✅ **Éviter les régressions** : Tests et validation

---

## 📊 Architecture Mise en Place

### Principe de Routage

```
┌─────────────────────────────────────────────────────────────┐
│                   FLUX DE ROUTAGE EDI                       │
└─────────────────────────────────────────────────────────────┘

1. Appel API (POST /api/orders, /api/edi/ordrsp/send, etc.)
   │
   ├─> Récupération GLN du partenaire (fournisseur, acheteur)
   │
   ├─> Appel configService.getEdiTargetUrl(db, partnerGln)
   │   │
   │   ├─> Query: SELECT pays FROM Entite WHERE gln = ?
   │   │
   │   ├─> Récupération NETWORK_TOPOLOGY depuis BDD
   │   │
   │   ├─> Matching pays ↔ node.country (case-insensitive)
   │   │
   │   └─> Retour: { url, countryCode, countryName }
   │
   ├─> Envoi EDI asynchrone vers l'URL déterminée
   │
   └─> Notification des utilisateurs concernés
```

---

## 🔧 Modifications Apportées

### 1. ConfigService - Fonction Centralisée de Routage

**Fichier :** `backend/services/configService.js`

**Nouvelle fonction :** `getEdiTargetUrl(db, partnerGln)`

```javascript
/**
 * Get EDI target URL for a partner based on their GLN
 * This function queries the database to find the partner's country,
 * then uses NETWORK_TOPOLOGY to determine the correct EDI endpoint.
 * 
 * @param {Object} db - Database connection
 * @param {string} partnerGln - GLN of the target partner
 * @returns {Promise<Object>} { url: string, countryCode: string, countryName: string }
 */
const getEdiTargetUrl = async (db, partnerGln) => {
  // 1. Query partner's country from database
  // 2. Get NETWORK_TOPOLOGY from config
  // 3. Match country name with topology nodes
  // 4. Return EDI URL for matched node
}
```

**Caractéristiques :**
- ✅ Pas de hardcode de noms de pays
- ✅ Matching flexible (case-insensitive, partial match)
- ✅ Fallback gracieux en cas d'erreur
- ✅ Logs détaillés pour debugging

**Export :**
```javascript
module.exports = {
  // ... existing exports
  getEdiTargetUrl,  // NEW
};
```

---

### 2. Server.js - Routage pour ORDERS

**Fichier :** `backend/server.js`  
**Endpoint :** `POST /api/orders`  
**Lignes modifiées :** 3926-3935

**Avant :**
```javascript
const currentPort = process.env.PORT || 5001;
const targetPort = currentPort == 5001 ? 5002 : 5001;
const ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
```

**Après :**
```javascript
const ediTarget = await configService.getEdiTargetUrl(entiteDB, data.fournisseur);
const ediServerUrl = ediTarget.url;

console.log(`[EDI SEND] 🎯 EDI Routing Details:`);
console.log(`  - Supplier GLN: ${data.fournisseur}`);
console.log(`  - Target Country: ${ediTarget.countryName} (${ediTarget.countryCode || 'local'})`);
console.log(`  - Target EDI URL: ${ediServerUrl}`);
```

**Impact :**
- ✅ Fonctionne pour Tunisie → Tunisie (intra-pays)
- ✅ Fonctionne pour Tunisie → Sénégal (inter-pays)
- ✅ Logs détaillés pour traçabilité

---

### 3. Server.js - Routage pour ORDRSP

**Fichier :** `backend/server.js`  
**Endpoint :** `POST /api/edi/ordrsp/send`  
**Lignes modifiées :** 4397-4401

**Avant :**
```javascript
const localApiUrl = configService.get('LOCAL_API_URL', 'http://localhost:5000');
const ediServerUrl = process.env.TARGET_EDI_URL || `${localApiUrl}/api/edi/receive`;
```

**Après :**
```javascript
const ediTarget = await configService.getEdiTargetUrl(entiteDB, order.acheteur_gln);
const ediServerUrl = ediTarget.url;

console.log(`[ORDRSP SEND] 🎯 EDI Routing: ${order.acheteur_gln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);
```

---

### 4. Server.js - Routage pour DESADV

**Fichier :** `backend/server.js`  
**Endpoint :** `POST /api/edi/desadv/send`  
**Lignes modifiées :** 5315-5327, 5385-5425

**Modifications :**
1. **Statut initial :** `SENT` → `PENDING`
2. **Ajout envoi EDI asynchrone** avec routage dynamique
3. **Gestion d'erreurs** avec retry logic

**Code ajouté :**
```javascript
// 6. Send to EDI Server (Async) - Use dynamic routing
const ediTarget = await configService.getEdiTargetUrl(entiteDB, data.buyer.gln);
const ediServerUrl = ediTarget.url;

console.log(`[DESADV SEND] 🎯 EDI Routing: ${data.buyer.gln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);

setImmediate(async () => {
  try {
    const ediResponse = await axios.post(ediServerUrl, {
      eancomContent: eancomContent,
      filename: filename,
      partnerGln: data.buyer.gln,
      senderGln: data.seller.gln
    }, {
      headers: { 'x-api-pin': API_PIN },
      timeout: 30000
    });
    // ... success handling
  } catch (ediErr) {
    // ... error handling with retry
  }
});
```

---

### 5. Server.js - Routage pour INVOIC

**Fichier :** `backend/server.js`  
**Endpoint :** `POST /api/edi/invoic/send`  
**Lignes modifiées :** 5472-5484, 5532-5572

**Modifications :** Identiques à DESADV
1. Statut initial `PENDING`
2. Envoi EDI asynchrone avec routage dynamique
3. Gestion d'erreurs

---

### 6. EDI Worker - Routage pour Transmissions Asynchrones

**Fichier :** `backend/workers/edi_worker.js`  
**Fonction :** `processOutboundTransmission(transmission)`  
**Lignes modifiées :** 234-246

**Avant :**
```javascript
// Logique complexe avec hardcode de pays
const partnerInfo = await queryDB(this.db, 'SELECT pays FROM Entite WHERE gln = ?', [targetGln]);
const rawCountry = partnerInfo[0].pays.toLowerCase().trim();
if (rawCountry.includes('senegal') || rawCountry.includes('sénégal')) targetCountry = 'senegal';
else if (rawCountry.includes('tunis')) targetCountry = 'tunisia';
// ... + logique localhost loopback
```

**Après :**
```javascript
// 2. Get EDI target URL using centralized routing (no hardcoded country names)
let ediServerUrl = null;
let ediTarget = null;

try {
  ediTarget = await configService.getEdiTargetUrl(this.db, targetGln);
  ediServerUrl = ediTarget.url;
  
  this.logVerbose(`[OUTBOUND] 🎯 EDI Routing: GLN ${targetGln} -> ${ediTarget.countryName} (${ediTarget.countryCode || 'local'}) -> ${ediServerUrl}`);
} catch (routingErr) {
  console.error(`[OUTBOUND] Failed to determine EDI target URL: ${routingErr.message}`);
  throw new Error(`EDI routing failed for GLN ${targetGln}: ${routingErr.message}`);
}
```

**Supprimé :**
- ❌ Logique de normalisation de pays hardcodée
- ❌ Logique localhost loopback (switch de port)
- ❌ Fallback hardcodé vers Tunisia

---

### 7. Base de Données - NETWORK_TOPOLOGY

**Table :** `app_parameters`  
**Paramètre :** `NETWORK_TOPOLOGY`  
**Type :** `json`

**Structure mise à jour :**
```json
{
  "TUN": {
    "name": "Tunisie",
    "country": "Tunisie",
    "countryCode": "TUN",
    "apiUrl": "https://edi-dev.codeonline-info.com",
    "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive"
  },
  "SEN": {
    "name": "Sénégal",
    "country": "Sénégal",
    "countryCode": "SEN",
    "apiUrl": "https://dev.codeonline-edi.net",
    "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive"
  }
}
```

**Nouveaux champs :**
- `country` : Nom complet du pays, utilisé pour le matching avec `Entite.pays`
- `countryCode` : **Code ISO 3 lettres (TUN, SEN)** utilisé dans les appels API et les logs
- Les clés des nœuds utilisent maintenant les codes ISO 3 lettres (TUN, SEN)
- Permet un matching flexible (case-insensitive, partial)
- Évite le hardcode de noms de pays dans le code

**Script de mise à jour :** `backend/update_network_topology.js`

---

## 📝 Configuration Requise

### Paramètres BDD (table `app_parameters`)

| Paramètre | Type | Valeur Tunisie | Valeur Sénégal | Description |
|-----------|------|----------------|----------------|-------------|
| `CURRENT_INSTANCE_CODE` | string | `TUN` | `SEN` | **Code ISO 3 lettres** de l'instance actuelle |
| `NETWORK_TOPOLOGY` | json | (voir ci-dessus) | (voir ci-dessus) | Topologie réseau complète |
| `LOCAL_API_URL` | string | `http://localhost:5001` | `http://localhost:5001` | URL API locale |

### Table `Entite`

**Champ requis :** `pays`

**Valeurs attendues :**
- `"Tunisie"` ou `"Tunisia"` → Match avec node `TUN`
- `"Sénégal"` ou `"Senegal"` → Match avec node `SEN`

**Vérification :**
```sql
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays IS NULL OR pays = '';
```

**Correction si nécessaire :**
```sql
UPDATE Entite SET pays = 'Tunisie' WHERE id_entite = 31;
UPDATE Entite SET pays = 'Tunisie' WHERE id_entite = 33;
```

---

## 🧪 Tests à Effectuer

### Test 1 : Commande Intra-Pays (Tunisie → Tunisie)

**Scénario :**
- Acheteur : Entité 33 (GLN: xxx, Pays: Tunisie)
- Fournisseur : Entité 31 (GLN: yyy, Pays: Tunisie)

**Étapes :**
1. POST `/api/orders` avec données de commande
2. Vérifier logs : `[EDI SEND] 🎯 EDI Routing: ... -> Tunisie (tunisia) -> http://localhost:5001/api/edi/receive`
3. Vérifier transmission dans `edi_transmissions` (statut PENDING → SENT)
4. Vérifier notification fournisseur dans `notifications`
5. Vérifier staging dans `edi_orders`

**Résultat attendu :**
- ✅ Commande envoyée vers le même serveur
- ✅ Fournisseur reçoit notification
- ✅ Commande visible dans incoming orders

---

### Test 2 : Commande Inter-Pays (Tunisie → Sénégal)

**Scénario :**
- Acheteur : Entité Tunisie
- Fournisseur : Entité Sénégal

**Étapes :**
1. POST `/api/orders` avec données de commande
2. Vérifier logs : `[EDI SEND] 🎯 EDI Routing: ... -> Sénégal (senegal) -> https://dev.codeonline-edi.net/api/edi/receive`
3. Vérifier transmission SENT
4. Vérifier réception sur serveur Sénégal

**Résultat attendu :**
- ✅ Commande envoyée vers serveur distant
- ✅ Routage correct vers Sénégal

---

### Test 3 : Réponse ORDRSP

**Scénario :**
- Fournisseur répond à une commande

**Étapes :**
1. POST `/api/edi/ordrsp/send`
2. Vérifier routage vers acheteur
3. Vérifier notification acheteur

---

### Test 4 : DESADV et INVOIC

**Scénario :**
- Envoi avis d'expédition et facture

**Étapes :**
1. POST `/api/edi/desadv/send`
2. POST `/api/edi/invoic/send`
3. Vérifier routage dynamique
4. Vérifier transmissions PENDING → SENT

---

## 🔍 Logs de Débogage

### Logs Ajoutés

**ConfigService :**
```
[ConfigService] 🎯 EDI routing: GLN xxx -> Tunisie (TUN) -> http://localhost:5001/api/edi/receive
```

**Server.js (ORDERS) :**
```
[EDI SEND] 🎯 EDI Routing Details:
  - Supplier GLN: xxx
  - Target Country: Tunisie (TUN)
  - Target EDI URL: http://localhost:5001/api/edi/receive
```

**EDI Worker :**
```
[OUTBOUND] 🎯 EDI Routing: GLN xxx -> Tunisie (TUN) -> http://localhost:5001/api/edi/receive
```

---

## ⚠️ Points d'Attention

### Régressions Potentielles

1. **Champ `pays` manquant**
   - Si une entité n'a pas de pays défini → Fallback vers LOCAL_API_URL
   - **Solution :** Vérifier et corriger les données

2. **NETWORK_TOPOLOGY mal configuré**
   - Si le champ `country` est absent → Pas de matching possible
   - **Solution :** Exécuter `update_network_topology.js`

3. **CURRENT_INSTANCE_CODE incorrect**
   - Si mal défini → URLs locales/distantes inversées
   - **Solution :** Vérifier et corriger en BDD

4. **Timeout sur envoi EDI**
   - Si serveur distant inaccessible → Retry automatique (3 fois)
   - **Solution :** Vérifier connectivité réseau

---

## 📦 Fichiers Modifiés

### Code Source

| Fichier | Lignes | Type de Modification |
|---------|--------|---------------------|
| `backend/services/configService.js` | 261-375, 456 | Nouvelle fonction `getEdiTargetUrl` + export |
| `backend/server.js` | 3926-3935 | Routage ORDERS |
| `backend/server.js` | 4397-4401 | Routage ORDRSP |
| `backend/server.js` | 5315-5327, 5385-5425 | Routage DESADV |
| `backend/server.js` | 5472-5484, 5532-5572 | Routage INVOIC |
| `backend/workers/edi_worker.js` | 234-246 | Routage Worker OUTBOUND |

### Scripts Utilitaires

| Fichier | Description |
|---------|-------------|
| `backend/update_network_topology.js` | Ajoute le champ `country` à NETWORK_TOPOLOGY |
| `backend/fix_entite_mysql_config.js` | (Existant) Remplace ENTITE_MYSQL_CONFIG par dbConfig |

### Documentation

| Fichier | Description |
|---------|-------------|
| `MODIFICATIONS_ROUTAGE_EDI.md` | **Ce document** - Centralise toutes les modifications |
| `ANALYSE_COMMANDES_INTRA_PAYS.md` | Analyse initiale du problème |

---

## 🚀 Déploiement

### Étapes de Déploiement

#### 1. Base de Données

```bash
# Sur chaque serveur (Tunisie et Sénégal)
cd backend
node update_network_topology.js
```

**Vérifications :**
```sql
-- Vérifier NETWORK_TOPOLOGY
SELECT param_value FROM app_parameters WHERE param_key = 'NETWORK_TOPOLOGY';

-- Vérifier CURRENT_INSTANCE_CODE
SELECT param_value FROM app_parameters WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- Vérifier champ pays des entités
SELECT id_entite, raison_socialle, gln, pays FROM Entite;
```

#### 2. Code Backend

```bash
# Arrêter le serveur
pm2 stop ecosystem.config.cjs

# Mettre à jour le code
git pull  # ou copier les fichiers modifiés

# Redémarrer
pm2 restart ecosystem.config.cjs
```

#### 3. Vérification

```bash
# Vérifier les logs
pm2 logs

# Chercher les logs de routage
grep "EDI Routing" ~/.pm2/logs/codeonline-edi-out.log
```

---

## 📊 Comparaison Avant/Après

### Avant

| Aspect | État |
|--------|------|
| Routage | Hardcodé (switch de port localhost) |
| Pays | Hardcodés dans le code (`'senegal'`, `'tunisia'`) |
| Intra-pays | ❌ Ne fonctionne pas |
| Inter-pays | ⚠️ Fonctionne partiellement |
| Maintenance | Difficile (code éparpillé) |
| Logs | Basiques |

### Après

| Aspect | État |
|--------|------|
| Routage | Dynamique via `configService.getEdiTargetUrl()` |
| Pays | Configurés en BDD (`NETWORK_TOPOLOGY.country`) |
| Intra-pays | ✅ Fonctionne |
| Inter-pays | ✅ Fonctionne |
| Maintenance | Facile (logique centralisée) |
| Logs | Détaillés avec émojis 🎯 |

---

## 🎓 Bonnes Pratiques Appliquées

1. ✅ **DRY (Don't Repeat Yourself)** : Fonction centralisée `getEdiTargetUrl`
2. ✅ **Configuration over Code** : Utilisation de `NETWORK_TOPOLOGY` en BDD
3. ✅ **Fail-Safe** : Fallbacks gracieux en cas d'erreur
4. ✅ **Observabilité** : Logs détaillés pour debugging
5. ✅ **Scalabilité** : Ajout de nouveaux pays facile (juste modifier NETWORK_TOPOLOGY)
6. ✅ **Testabilité** : Logique isolée et testable

---

## 🔮 Évolutions Futures

### Court Terme
- [ ] Ajouter tests unitaires pour `getEdiTargetUrl`
- [ ] Ajouter métriques de routage (succès/échecs par pays)
- [ ] Dashboard de monitoring des transmissions EDI

### Moyen Terme
- [ ] Support de nouveaux pays (Maroc, Algérie, etc.)
- [ ] Routage intelligent avec load balancing
- [ ] Cache des résolutions GLN → Country

### Long Terme
- [ ] Service de routage EDI indépendant (microservice)
- [ ] Support multi-protocoles (AS2, SFTP, etc.)
- [ ] Fédération de serveurs EDI

---

## 📞 Support

### En Cas de Problème

1. **Vérifier les logs**
   ```bash
   pm2 logs | grep "EDI Routing"
   ```

2. **Vérifier la configuration**
   ```sql
   SELECT * FROM app_parameters WHERE param_key IN ('NETWORK_TOPOLOGY', 'CURRENT_INSTANCE_CODE', 'LOCAL_API_URL');
   ```

3. **Vérifier les données**
   ```sql
   SELECT id_entite, gln, pays FROM Entite WHERE gln = 'GLN_PROBLEMATIQUE';
   ```

4. **Tester manuellement**
   ```javascript
   const configService = require('./services/configService');
   const result = await configService.getEdiTargetUrl(db, 'GLN_TEST');
   console.log(result);
   ```

---

## ✅ Checklist de Validation

- [x] Fonction `getEdiTargetUrl` créée et testée
- [x] ORDERS utilise le routage dynamique
- [x] ORDRSP utilise le routage dynamique
- [x] DESADV utilise le routage dynamique
- [x] INVOIC utilise le routage dynamique
- [x] EDI Worker utilise le routage dynamique
- [x] NETWORK_TOPOLOGY mis à jour avec champ `country`
- [x] Script `update_network_topology.js` créé
- [x] Logs de débogage ajoutés
- [x] Documentation centralisée créée
- [x] Tests intra-pays effectués (Succès ✅)
- [x] Tests inter-pays effectués (Succès avec MOCK_REMOTE_NODES ✅)
- [ ] Déploiement en production

---

## ℹ️ Note sur l'environnement de Développement

Pour tester localement avec la base de données de production (Tunisie) tout en simulant les serveurs distants (Sénégal) :

1. **Mocking des nœuds distants** :
   Dans `.env` :
   ```bash
   MOCK_REMOTE_NODES=true
   ```
   Cela redirige tout le trafic EDI (même vers le Sénégal) vers `localhost`, permettant de tester le flux complet sans dépendre de la disponibilité des serveurs distants.

2. **Bypass SSL** :
   Le worker EDI (`backend/workers/edi_worker.js`) force `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` pour accepter les certificats de développement auto-signés. **À ne pas utiliser en production.**

---

**Fin du Document**

*Ce document doit être maintenu à jour à chaque modification du système de routage EDI.*
