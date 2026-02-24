# 📊 Analyse Complète : Commandes Intra-Pays (Tunisie → Tunisie)

## 🎯 Contexte de l'Analyse

**Scénario testé :**
- **Acheteur (Entité 33)** : Connecté sur le serveur Tunisie
- **Fournisseur (Entité 31)** : Également sur le serveur Tunisie
- **Question :** Est-ce que le fournisseur reçoit la notification ? Peut-il répondre ?

---

## 🔍 1. FLUX ACTUEL DE COMMANDE

### 1.1 Création de Commande (POST /api/orders)

**Fichier :** `backend/server.js` (lignes 3800-4037)

**Étapes :**
1. ✅ **Validation des données** (GLN acheteur, fournisseur, articles)
2. ✅ **Génération fichier EANCOM** (`generateOrderEANCOM_Enhanced`)
3. ✅ **Insertion en base de données** :
   - Table `orders` (statut initial : `new`)
   - Table `order_lines` (lignes de commande)
   - Table `edi_transmissions` (direction : `OUTBOUND`, statut : `PENDING`)
4. ⚠️ **Envoi EDI asynchrone** (ligne 3935-4014)

**Code d'envoi actuel :**
```javascript
// Ligne 3927-3932
const currentPort = process.env.PORT || 5001;
const targetPort = currentPort == 5001 ? 5002 : 5001;
const ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
```

### 1.2 Réception de Commande (POST /api/edi/receive)

**Fichier :** `backend/server.js` (lignes 5080-5107)

**Étapes :**
1. ✅ **Parsing EANCOM** → `parsedData`
2. ✅ **Insertion dans `edi_orders`** (table de staging)
3. ✅ **Création transmission INBOUND**
4. ✅ **Notification du fournisseur** (lignes 5085-5107)

**Code de notification :**
```javascript
// Ligne 5085-5107
if (parsedData.supplier.gln) {
    const sellerRows = await queryDB(entiteDB, 
        "SELECT id_entite FROM Entite WHERE gln = ?", 
        [parsedData.supplier.gln]
    );
    
    if (sellerRows.length > 0) {
        const sellerId = sellerRows[0].id_entite;
        const accounts = await queryDB(entiteDB, 
            "SELECT id_compte FROM comptes WHERE id_entite = ? AND is_suspended = 0", 
            [sellerId]
        );
        
        for (const acc of accounts) {
            await notifyOrderReceived(entiteDB, acc.id_compte, 
                parsedData.documentNumber, buyerName);
        }
    }
}
```

---

## 🚨 2. PROBLÈMES IDENTIFIÉS

### ❌ Problème #1 : Routage EDI Hardcodé (CRITIQUE)

**Localisation :** `backend/server.js` ligne 3927-3932

**Problème :**
```javascript
const targetPort = currentPort == 5001 ? 5002 : 5001;
const ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
```

**Impact :**
- ❌ **Logique de développement local uniquement** (switch de port 5001 ↔ 5002)
- ❌ **Ne fonctionne PAS pour les commandes intra-pays en production**
- ❌ **Suppose toujours 2 serveurs différents** (Tunisie vs Sénégal)

**Conséquence pour Tunisie → Tunisie :**
- Si le serveur Tunisie tourne sur le port 5001, il essaie d'envoyer vers le port 5002
- Le port 5002 n'existe pas → **Échec de l'envoi**
- Le fournisseur **NE REÇOIT JAMAIS** la commande

---

### ⚠️ Problème #2 : EDI Worker - Routage Basé sur le Pays

**Localisation :** `backend/workers/edi_worker.js` lignes 234-287

**Code actuel :**
```javascript
// Ligne 234-256
const partnerInfo = await queryDB(
    this.db,
    'SELECT pays FROM Entite WHERE gln = ? LIMIT 1',
    [targetGln]
);

if (partnerInfo.length > 0 && partnerInfo[0].pays) {
    const rawCountry = partnerInfo[0].pays.toLowerCase().trim();
    if (rawCountry.includes('senegal') || rawCountry.includes('sénégal')) 
        targetCountry = 'senegal';
    else if (rawCountry.includes('tunis')) 
        targetCountry = 'tunisia';
}

// Ligne 262-273
if (targetCountry) {
    ediServerUrl = configService.getCountryEdiUrl(targetCountry);
}
```

**Problème :**
- ✅ **Bonne approche** : Utilise le champ `pays` de la table `Entite`
- ⚠️ **Mais** : Si acheteur ET fournisseur sont en Tunisie, `getCountryEdiUrl('tunisia')` retourne l'URL du serveur Tunisie
- ⚠️ **Résultat** : Le serveur Tunisie essaie d'envoyer vers **lui-même**

**Comportement actuel :**
```javascript
// configService.js ligne 256-259
const getCountryEdiUrl = (countryCode) => {
  if (!countryCode) return `${get('LOCAL_API_URL')}/api/edi/receive`;
  return get(`EDI_URL_${countryCode.toUpperCase()}`);
};
```

**Hydratation de topologie :**
```javascript
// configService.js ligne 104-109
const isMe = nodeCode === currentInstance;
const effectiveApiUrl = isMe ? localUrl : nodeConfig.apiUrl;
const effectiveEdiUrl = isMe ? `${localUrl}/api/edi/receive` : nodeConfig.ediUrl;
```

**Conséquence :**
- Si `CURRENT_INSTANCE_CODE = 'tunisia'` et `targetCountry = 'tunisia'`
- Alors `EDI_URL_TUNISIA = http://localhost:5001/api/edi/receive`
- Le serveur s'envoie la commande **à lui-même** → ✅ **FONCTIONNE**

---

### ⚠️ Problème #3 : Logique Localhost dans EDI Worker

**Localisation :** `backend/workers/edi_worker.js` lignes 290-299

**Code :**
```javascript
if (ediServerUrl.includes('localhost')) {
    const currentPort = process.env.PORT || 5000;
    if (targetUrlBase && targetUrlBase.includes('localhost')) {
        const targetPort = currentPort == 5000 ? 5002 : 5000;
        ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
    }
}
```

**Problème :**
- ❌ **Override la logique de routage** si l'URL contient `localhost`
- ❌ **Casse le routage intra-pays** en forçant un switch de port

---

### ⚠️ Problème #4 : Configuration de Topologie

**Paramètres requis dans la BDD :**

| Paramètre | Valeur Actuelle | Problème |
|-----------|-----------------|----------|
| `CURRENT_INSTANCE_CODE` | `senegal` | ⚠️ Doit être `tunisia` pour le serveur Tunisie |
| `NETWORK_TOPOLOGY` | JSON avec `tunisia` et `senegal` | ✅ Existe |
| `LOCAL_API_URL` | `http://localhost:5001` | ✅ Correct |

**Impact :**
- Si `CURRENT_INSTANCE_CODE` n'est pas correctement défini, l'hydratation de topologie ne fonctionne pas
- Les URLs `EDI_URL_TUNISIA` et `EDI_URL_SENEGAL` ne sont pas générées correctement

---

## ✅ 3. CE QUI FONCTIONNE ACTUELLEMENT

### ✅ Système de Notifications

**Fichier :** `backend/notification_helper.js`

**Fonctions :**
- ✅ `notifyOrderSent()` : Notifie l'acheteur que sa commande est envoyée
- ✅ `notifyOrderReceived()` : Notifie le fournisseur qu'il a reçu une commande
- ✅ `notifyOrderError()` : Notifie en cas d'erreur

**Déclenchement :**
1. **Envoi** : `server.js` ligne 3979-3997 (après envoi EDI réussi)
2. **Réception** : `server.js` ligne 5101-5104 (après staging de la commande)

**Vérification anti-doublon :**
```javascript
// notification_helper.js ligne 62-70
const duplicateCheck = await queryDB(db, `
    SELECT id FROM notifications 
    WHERE id_compte = ? 
      AND contenu LIKE CONCAT('%', ?, '%') 
      AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
`, [id_compte, orderNumber]);
```

---

### ✅ EDI Worker (Traitement Asynchrone)

**Fichier :** `backend/workers/edi_worker.js`

**Fonctionnalités :**
- ✅ **OUTBOUND** : Envoie les transmissions `PENDING` vers les serveurs distants
- ✅ **INBOUND** : Traite les transmissions `RECEIVED` (parsing, staging, notifications)
- ✅ **Retry Logic** : Réessaie jusqu'à 3 fois en cas d'échec
- ✅ **Routage dynamique** : Basé sur le champ `pays` de l'entité

**Cycles :**
- OUTBOUND : Toutes les 30 secondes
- INBOUND : Toutes les 45 secondes

---

## 🔧 4. SOLUTIONS PROPOSÉES

### 🎯 Solution #1 : Corriger le Routage EDI dans server.js (URGENT)

**Problème :** Logique hardcodée de switch de port

**Solution :** Utiliser `configService` pour déterminer l'URL EDI cible

**Fichier à modifier :** `backend/server.js` ligne 3926-3933

**Code actuel :**
```javascript
const currentPort = process.env.PORT || 5001;
const targetPort = currentPort == 5001 ? 5002 : 5001;
const ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
```

**Code proposé :**
```javascript
// Déterminer le pays du fournisseur
let targetCountry = null;
try {
    const supplierInfo = await queryDB(entiteDB, 
        'SELECT pays FROM Entite WHERE gln = ?', 
        [data.fournisseur]
    );
    
    if (supplierInfo.length > 0 && supplierInfo[0].pays) {
        const rawCountry = supplierInfo[0].pays.toLowerCase().trim();
        if (rawCountry.includes('senegal') || rawCountry.includes('sénégal')) {
            targetCountry = 'senegal';
        } else if (rawCountry.includes('tunis')) {
            targetCountry = 'tunisia';
        }
    }
} catch (err) {
    console.error('[EDI SEND] Failed to determine supplier country:', err.message);
}

// Récupérer l'URL EDI via configService
const ediServerUrl = targetCountry 
    ? configService.getCountryEdiUrl(targetCountry)
    : `${configService.get('LOCAL_API_URL')}/api/edi/receive`;

console.log(`[EDI SEND] Target country: ${targetCountry || 'local'}, EDI URL: ${ediServerUrl}`);
```

**Avantages :**
- ✅ Fonctionne pour les commandes intra-pays (Tunisie → Tunisie)
- ✅ Fonctionne pour les commandes inter-pays (Tunisie → Sénégal)
- ✅ Utilise la configuration centralisée
- ✅ Plus de logique hardcodée

---

### 🎯 Solution #2 : Supprimer la Logique Localhost dans EDI Worker

**Problème :** Override du routage en environnement local

**Solution :** Désactiver ou conditionner cette logique

**Fichier à modifier :** `backend/workers/edi_worker.js` ligne 289-299

**Code actuel :**
```javascript
if (ediServerUrl.includes('localhost')) {
    const currentPort = process.env.PORT || 5000;
    if (targetUrlBase && targetUrlBase.includes('localhost')) {
        const targetPort = currentPort == 5000 ? 5002 : 5000;
        ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
    }
}
```

**Code proposé (Option A - Désactiver) :**
```javascript
// DISABLED: Localhost loopback logic interferes with intra-country routing
// if (ediServerUrl.includes('localhost')) {
//     const currentPort = process.env.PORT || 5000;
//     if (targetUrlBase && targetUrlBase.includes('localhost')) {
//         const targetPort = currentPort == 5000 ? 5002 : 5000;
//         ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
//     }
// }
```

**Code proposé (Option B - Conditionner) :**
```javascript
// Only apply localhost loopback if explicitly testing cross-server simulation
const ENABLE_LOCALHOST_LOOPBACK = process.env.ENABLE_LOCALHOST_LOOPBACK === 'true';

if (ENABLE_LOCALHOST_LOOPBACK && ediServerUrl.includes('localhost')) {
    const currentPort = process.env.PORT || 5000;
    if (targetUrlBase && targetUrlBase.includes('localhost')) {
        const targetPort = currentPort == 5000 ? 5002 : 5000;
        ediServerUrl = `http://localhost:${targetPort}/api/edi/receive`;
        this.logVerbose(`[OUTBOUND] 🔄 Localhost loopback: ${currentPort} -> ${targetPort}`);
    }
}
```

**Recommandation :** **Option B** (conditionner avec variable d'environnement)

---

### 🎯 Solution #3 : Vérifier la Configuration de Topologie

**Paramètres à vérifier/corriger dans la BDD :**

**1. CURRENT_INSTANCE_CODE**
```sql
-- Pour le serveur Tunisie
UPDATE app_parameters 
SET param_value = 'tunisia' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- Pour le serveur Sénégal
UPDATE app_parameters 
SET param_value = 'senegal' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';
```

**2. NETWORK_TOPOLOGY**
```json
{
  "tunisia": {
    "name": "Tunisie",
    "apiUrl": "https://edi-dev.codeonline-info.com",
    "ediUrl": "https://edi-dev.codeonline-info.com/api/edi/receive"
  },
  "senegal": {
    "name": "Sénégal",
    "apiUrl": "https://dev.codeonline-edi.net",
    "ediUrl": "https://dev.codeonline-edi.net/api/edi/receive"
  }
}
```

**3. Vérifier le champ `pays` dans la table `Entite`**
```sql
-- Vérifier les valeurs actuelles
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE id_entite IN (31, 33);

-- Normaliser si nécessaire
UPDATE Entite SET pays = 'Tunisie' WHERE id_entite = 31;
UPDATE Entite SET pays = 'Tunisie' WHERE id_entite = 33;
```

---

### 🎯 Solution #4 : Ajouter des Logs de Débogage

**Fichier :** `backend/server.js` (dans la fonction d'envoi EDI)

**Ajouts proposés :**
```javascript
console.log(`[EDI SEND] 🔍 Order Details:`);
console.log(`  - Buyer GLN: ${data.Acheteur}`);
console.log(`  - Supplier GLN: ${data.fournisseur}`);
console.log(`  - Supplier Country: ${targetCountry || 'UNKNOWN'}`);
console.log(`  - Target EDI URL: ${ediServerUrl}`);
console.log(`  - Current Instance: ${configService.get('CURRENT_INSTANCE_CODE')}`);
```

---

## 📋 5. PLAN D'ACTION RECOMMANDÉ

### Phase 1 : Corrections Urgentes (1-2 heures)

1. ✅ **Appliquer Solution #1** : Corriger le routage EDI dans `server.js`
2. ✅ **Appliquer Solution #2** : Conditionner la logique localhost dans `edi_worker.js`
3. ✅ **Vérifier Solution #3** : Configuration de topologie dans la BDD
4. ✅ **Ajouter Solution #4** : Logs de débogage

### Phase 2 : Tests (30 minutes)

1. **Test Intra-Pays (Tunisie → Tunisie)**
   - Entité 33 → Entité 31
   - Vérifier réception de notification
   - Vérifier staging dans `edi_orders`

2. **Test Inter-Pays (Tunisie → Sénégal)**
   - Entité Tunisie → Entité Sénégal
   - Vérifier routage vers serveur distant

3. **Test Réponse (ORDRSP)**
   - Entité 31 répond à la commande
   - Vérifier notification de l'acheteur

### Phase 3 : Documentation (30 minutes)

1. Documenter le flux de commande intra-pays
2. Créer un guide de configuration pour chaque serveur
3. Ajouter des exemples de tests

---

## 🎯 6. RÉPONSE À LA QUESTION INITIALE

### ❓ Scénario : Entité 33 (Tunisie) → Entité 31 (Tunisie)

**État Actuel (AVANT corrections) :**
- ❌ **Envoi** : Échec probable (mauvais routage)
- ❌ **Notification fournisseur** : Non reçue (commande jamais arrivée)
- ❌ **Réponse** : Impossible (pas de commande reçue)

**État Futur (APRÈS corrections) :**
- ✅ **Envoi** : Succès (routage vers le même serveur)
- ✅ **Notification fournisseur** : Reçue (via `notifyOrderReceived`)
- ✅ **Réponse** : Possible (via ORDRSP)

---

## 📊 7. ARCHITECTURE RECOMMANDÉE

### Flux de Commande Intra-Pays

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVEUR TUNISIE                          │
│                                                             │
│  ┌──────────────┐                    ┌──────────────┐     │
│  │  Entité 33   │                    │  Entité 31   │     │
│  │  (Acheteur)  │                    │ (Fournisseur)│     │
│  └──────┬───────┘                    └──────▲───────┘     │
│         │                                    │             │
│         │ 1. POST /api/orders                │             │
│         ▼                                    │             │
│  ┌─────────────────────────────────────┐    │             │
│  │  Backend API                        │    │             │
│  │  - Validation                       │    │             │
│  │  - Génération EANCOM                │    │             │
│  │  - Insertion orders + transmissions │    │             │
│  └─────────────┬───────────────────────┘    │             │
│                │                             │             │
│                │ 2. Envoi EDI (async)        │             │
│                ▼                             │             │
│  ┌─────────────────────────────────────┐    │             │
│  │  POST /api/edi/receive              │    │             │
│  │  (MÊME SERVEUR)                     │    │             │
│  │  - Parsing EANCOM                   │    │             │
│  │  - Staging dans edi_orders          │    │             │
│  │  - Création transmission INBOUND    │────┘             │
│  │  - Notification fournisseur         │                  │
│  └─────────────────────────────────────┘                  │
│                                                             │
│  ┌─────────────────────────────────────┐                  │
│  │  EDI Worker (Background)            │                  │
│  │  - OUTBOUND: Envoie transmissions   │                  │
│  │  - INBOUND: Traite réceptions       │                  │
│  │  - Notifications automatiques       │                  │
│  └─────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Flux de Commande Inter-Pays

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   SERVEUR TUNISIE        │         │   SERVEUR SÉNÉGAL        │
│                          │         │                          │
│  ┌──────────────┐        │         │        ┌──────────────┐ │
│  │  Entité 33   │        │         │        │  Entité XX   │ │
│  │  (Acheteur)  │        │         │        │(Fournisseur) │ │
│  └──────┬───────┘        │         │        └──────▲───────┘ │
│         │                │         │               │         │
│         │ 1. POST        │         │               │         │
│         ▼                │         │               │         │
│  ┌─────────────────┐    │         │               │         │
│  │  Backend API    │    │         │               │         │
│  └────────┬────────┘    │         │               │         │
│           │             │         │               │         │
│           │ 2. Envoi    │         │               │         │
│           │    EDI      │         │               │         │
│           └─────────────┼─────────┼───────────────┘         │
│                         │  HTTPS  │                         │
│                         │         │  3. POST /api/edi/receive│
│                         │         │  ┌─────────────────┐    │
│                         │         │  │  Backend API    │    │
│                         │         │  │  - Staging      │    │
│                         │         │  │  - Notification │    │
│                         │         │  └─────────────────┘    │
│                         │         │                         │
└──────────────────────────┘         └──────────────────────────┘
```

---

## 🔍 8. POINTS DE VÉRIFICATION

### Checklist de Déploiement

- [ ] **Configuration BDD** : `CURRENT_INSTANCE_CODE` correct pour chaque serveur
- [ ] **Configuration BDD** : `NETWORK_TOPOLOGY` contient les URLs correctes
- [ ] **Table Entite** : Champ `pays` renseigné pour toutes les entités
- [ ] **Code** : Routage EDI basé sur `configService` (pas de hardcode)
- [ ] **Code** : Logique localhost conditionnée ou désactivée
- [ ] **Logs** : Ajout de logs de débogage pour le routage
- [ ] **Tests** : Commande intra-pays fonctionne
- [ ] **Tests** : Commande inter-pays fonctionne
- [ ] **Tests** : Notifications reçues des deux côtés
- [ ] **Tests** : Réponse ORDRSP fonctionne

---

## 📝 9. CONCLUSION

### État Actuel
❌ **Les commandes intra-pays NE FONCTIONNENT PAS** à cause du routage EDI hardcodé

### Après Corrections
✅ **Les commandes intra-pays FONCTIONNERONT** avec :
- Routage dynamique basé sur le pays de l'entité
- Configuration centralisée via `configService`
- Notifications automatiques pour acheteur et fournisseur
- Support complet du cycle de vie (commande → réponse → livraison → facture)

### Effort Estimé
- **Corrections** : 1-2 heures
- **Tests** : 30 minutes
- **Documentation** : 30 minutes
- **Total** : ~3 heures

---

**Date d'analyse :** 12 février 2026
**Analysé par :** Cascade AI
**Statut :** ⚠️ Corrections nécessaires avant mise en production
