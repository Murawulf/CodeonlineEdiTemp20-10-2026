# 🧪 Guide de Test EDI Automatique - Localhost

Ce guide explique comment exécuter les tests EDI automatiques en environnement localhost sur votre Mac.

---

## 📋 Prérequis

1. **Backend démarré** sur `localhost:5001`
2. **Base de données** accessible (91.134.35.126 ou locale)
3. **Node.js** et **npm** installés
4. **Entités de test** créées dans la BDD

---

## 🚀 Installation et Configuration

### Étape 1 : Configurer la Base de Données

```bash
# Se connecter à la BDD
mysql -h 91.134.35.126 -u consultant_seg -p'49BD&4vyrK6=PT!' Dev_Entitedb

# Exécuter le script de configuration
source backend/setup_test_localhost.sql
```

**Ce script configure :**
- `CURRENT_INSTANCE_CODE` = `SEN` (ou `TUN` selon votre choix)
- `LOCAL_API_URL` = `http://localhost:5001`
- `NETWORK_TOPOLOGY` avec les nœuds TUN et SEN pointant vers localhost

### Étape 2 : Vérifier les Entités de Test

Le script de test a besoin de :
- **2 entités tunisiennes** (1 acheteur + 1 fournisseur)
- **1 entité sénégalaise** (fournisseur)

**Vérifier les entités existantes :**
```sql
-- Entités tunisiennes
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Tunis%';

-- Entités sénégalaises
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Sénégal%' OR pays LIKE '%Senegal%';
```

**Si vous n'avez pas assez d'entités**, décommentez et adaptez la section de création d'entités dans `setup_test_localhost.sql`.

### Étape 3 : Démarrer le Backend

```bash
cd backend
node server.js
# ou
pm2 start ecosystem.config.cjs
```

**Vérifier que le serveur est accessible :**
```bash
curl http://localhost:5001/health
```

---

## 🧪 Exécution des Tests

### Lancer les Tests Automatiques

```bash
cd backend
node test_edi_localhost.js
```

### Ce que le Script Teste

Le script exécute automatiquement :

1. **✅ Vérification de la configuration**
   - `CURRENT_INSTANCE_CODE`
   - `LOCAL_API_URL`
   - `NETWORK_TOPOLOGY`

2. **✅ Vérification du serveur**
   - Accessibilité de `http://localhost:5001`

3. **✅ Préparation des entités**
   - Récupération des entités tunisiennes et sénégalaises

4. **🧪 Test 1 : Commande Intra-Pays (Tunisie → Tunisie)**
   - Création d'une commande entre 2 entités tunisiennes
   - Vérification de la transmission EDI
   - Vérification du routage vers TUN

5. **🧪 Test 2 : Commande Inter-Pays (Tunisie → Sénégal)**
   - Création d'une commande d'un acheteur tunisien vers un fournisseur sénégalais
   - Vérification de la transmission EDI
   - Vérification du routage vers SEN

---

## 📊 Résultats Attendus

### Sortie Console Réussie

```
🚀 DÉMARRAGE DES TESTS EDI AUTOMATIQUES - LOCALHOST

============================================================
📋 VÉRIFICATION DE LA CONFIGURATION
============================================================
✅ Connexion à la base de données établie
✅ CURRENT_INSTANCE_CODE: SEN
✅ LOCAL_API_URL: http://localhost:5001
✅ NETWORK_TOPOLOGY: 2 nœuds (TUN, SEN)
ℹ️  TUN: Tunisie (TUN)
ℹ️  SEN: Sénégal (SEN)

============================================================
🏥 VÉRIFICATION DU SERVEUR
============================================================
✅ Serveur accessible: http://localhost:5001

============================================================
🏢 PRÉPARATION DES ENTITÉS DE TEST
============================================================
✅ Acheteur TN: Test Acheteur Tunisie (6141411000001)
✅ Fournisseur TN: Test Fournisseur Tunisie (6141411000002)
✅ Fournisseur SEN: Test Fournisseur Sénégal (6141412000001)

============================================================
🧪 TEST 1: COMMANDE INTRA-PAYS (Tunisie → Tunisie)
============================================================
ℹ️  Création de la commande: TEST-TUN-TUN-1707768123456
ℹ️    Acheteur: Test Acheteur Tunisie (6141411000001)
ℹ️    Fournisseur: Test Fournisseur Tunisie (6141411000002)
✅ Commande créée avec succès
✅ Transmission EDI créée (ID: 123)
ℹ️    Status: SENT
✅ ✅ TEST INTRA-PAYS RÉUSSI
✅   Routage correct vers TUN détecté dans les logs

============================================================
🧪 TEST 2: COMMANDE INTER-PAYS (Tunisie → Sénégal)
============================================================
ℹ️  Création de la commande: TEST-TUN-SEN-1707768125678
ℹ️    Acheteur: Test Acheteur Tunisie (6141411000001)
ℹ️    Fournisseur: Test Fournisseur Sénégal (6141412000001)
✅ Commande créée avec succès
✅ Transmission EDI créée (ID: 124)
ℹ️    Status: SENT
✅ ✅ TEST INTER-PAYS RÉUSSI
✅   Routage correct vers SEN détecté dans les logs

============================================================
📊 RÉSUMÉ DES TESTS
============================================================

✅ Test Intra-Pays (TUN → TUN): RÉUSSI
✅ Test Inter-Pays (TUN → SEN): RÉUSSI

Total: 2 tests
✅ Réussis: 2

✅ 🎉 TOUS LES TESTS SONT RÉUSSIS !
```

---

## 🔍 Vérifications Manuelles Complémentaires

### Vérifier les Transmissions EDI

```sql
-- Dernières transmissions
SELECT id_transmission, document_type, direction, partner_gln, 
       status, created_at, 
       SUBSTRING(logs, 1, 100) as logs_preview
FROM edi_transmissions 
ORDER BY created_at DESC 
LIMIT 5;
```

### Vérifier les Logs du Backend

```bash
# Si PM2
pm2 logs | grep "EDI Routing"

# Logs attendus :
# [EDI SEND] 🎯 EDI Routing Details:
#   - Supplier GLN: xxx
#   - Target Country: Tunisie (TUN)
#   - Target EDI URL: http://localhost:5001/api/edi/receive
```

### Vérifier les Notifications

```sql
SELECT n.id_notification, n.type, n.titre, 
       e.raison_socialle, e.pays, n.created_at
FROM notifications n
JOIN comptes c ON n.id_compte = c.id_compte
JOIN Entite e ON c.id_entite = e.id_entite
ORDER BY n.created_at DESC
LIMIT 5;
```

---

## ⚠️ Troubleshooting

### Problème : "Serveur non accessible"

**Solution :**
```bash
# Vérifier que le backend tourne
curl http://localhost:5001/health

# Si non, démarrer le backend
cd backend
node server.js
```

### Problème : "Pas assez d'entités"

**Solution :**
1. Ouvrir `backend/setup_test_localhost.sql`
2. Décommenter la section de création d'entités
3. Adapter les valeurs (GLN, noms, etc.)
4. Exécuter le script

### Problème : "Transmission en PENDING"

**Cause :** EDI Worker ne tourne pas ou prend du temps

**Solution :**
```bash
# Vérifier les logs
pm2 logs | grep "EDI WORKER"

# Attendre quelques secondes et revérifier
SELECT * FROM edi_transmissions 
WHERE status = 'PENDING' 
ORDER BY created_at DESC;
```

### Problème : "Configuration incorrecte"

**Solution :**
```bash
# Réexécuter le script de configuration
mysql -h 91.134.35.126 -u consultant_seg -p'49BD&4vyrK6=PT!' Dev_Entitedb < backend/setup_test_localhost.sql
```

---

## 🔧 Configuration Avancée

### Modifier le Script de Test

Le script `test_edi_localhost.js` peut être personnalisé :

```javascript
// Configuration en haut du fichier
const CONFIG = {
  apiUrl: 'http://localhost:5001',  // URL du serveur
  apiPin: '3311',                    // PIN API
  dbConfig: {
    host: '91.134.35.126',           // Host BDD
    user: 'consultant_seg',          // User BDD
    password: '49BD&4vyrK6=PT!',     // Password BDD
    database: 'Dev_Entitedb'         // Database
  }
};
```

### Tester avec une BDD Locale

Si vous avez une BDD MySQL locale :

```javascript
const CONFIG = {
  apiUrl: 'http://localhost:5001',
  apiPin: '3311',
  dbConfig: {
    host: 'localhost',
    user: 'root',
    password: 'your_password',
    database: 'Dev_Entitedb'
  }
};
```

---

## 📝 Nettoyage des Données de Test

Après les tests, vous pouvez nettoyer les données :

```sql
-- Supprimer les commandes de test
DELETE FROM edi_orders WHERE document_number LIKE 'TEST-%';

-- Supprimer les transmissions de test
DELETE FROM edi_transmissions 
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- Supprimer les notifications de test
DELETE FROM notifications 
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

---

## ✅ Checklist Finale

Avant de lancer les tests :

- [ ] Backend démarré sur localhost:5001
- [ ] Base de données accessible
- [ ] Configuration BDD mise à jour (setup_test_localhost.sql)
- [ ] Au moins 2 entités tunisiennes dans la BDD
- [ ] Au moins 1 entité sénégalaise dans la BDD
- [ ] Entités ont le champ `pays` correctement défini
- [ ] EDI Worker actif (si PM2)

---

## 🎯 Résultat Attendu

Si tout est correctement configuré, les **2 tests doivent passer** :

✅ **Test Intra-Pays** : Commande entre 2 entités tunisiennes routée vers TUN  
✅ **Test Inter-Pays** : Commande d'une entité tunisienne vers une entité sénégalaise routée vers SEN

**Code de sortie :**
- `0` : Tous les tests réussis
- `1` : Au moins un test échoué

---

**Fin du Guide**

*Pour plus de détails sur l'architecture EDI, consultez `MODIFICATIONS_ROUTAGE_EDI.md`*
