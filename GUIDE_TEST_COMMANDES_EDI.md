# 🧪 Guide de Test : Commandes EDI Intra-Pays et Inter-Pays

**Date :** 12 février 2026  
**Objectif :** Tester les commandes entre entités du même pays (Tunisie-Tunisie) et entre pays différents (Tunisie-Sénégal)

---

## 📋 Informations des Serveurs

| Serveur | Host BDD | Port | Database | User | Instance Code |
|---------|----------|------|----------|------|---------------|
| **Sénégal** | `91.134.35.126` | 3306 | `Dev_Entitedb` | `consultant_seg` | `SEN` |
| **Tunisie** | `217.182.94.86` | 3306 | `Dev_Entitedb` | `Consultant` | `TUN` |

---

## 🔧 Configuration Requise

### 1. Configuration Base de Données - SERVEUR SÉNÉGAL

**Connexion :**
```bash
mysql -h 91.134.35.126 -u consultant_seg -p'49BD&4vyrK6=PT!' Dev_Entitedb
```

**Paramètres à configurer :**

```sql
-- 1. CURRENT_INSTANCE_CODE
UPDATE app_parameters 
SET param_value = 'SEN' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 2. LOCAL_API_URL (URL du serveur Sénégal)
UPDATE app_parameters 
SET param_value = 'https://dev.codeonline-edi.net' 
WHERE param_key = 'LOCAL_API_URL';

-- 3. NETWORK_TOPOLOGY
UPDATE app_parameters 
SET param_value = '{
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
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';

-- Vérification
SELECT param_key, param_value 
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY');
```

---

### 2. Configuration Base de Données - SERVEUR TUNISIE

**Connexion :**
```bash
mysql -h 217.182.94.86 -u Consultant -p'A4b6xb1s*' Dev_Entitedb
```

**Paramètres à configurer :**

```sql
-- 1. CURRENT_INSTANCE_CODE
UPDATE app_parameters 
SET param_value = 'TUN' 
WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- 2. LOCAL_API_URL (URL du serveur Tunisie)
UPDATE app_parameters 
SET param_value = 'https://edi-dev.codeonline-info.com' 
WHERE param_key = 'LOCAL_API_URL';

-- 3. NETWORK_TOPOLOGY (identique au Sénégal)
UPDATE app_parameters 
SET param_value = '{
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
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';

-- Vérification
SELECT param_key, param_value 
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY');
```

---

### 3. Vérification des Entités

**Sur CHAQUE serveur, vérifier que les entités ont un pays défini :**

```sql
-- Lister toutes les entités avec leur pays
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
ORDER BY pays, id_entite;

-- Vérifier les entités sans pays (À CORRIGER)
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays IS NULL OR pays = '';

-- Exemple de correction (adapter selon vos entités)
UPDATE Entite SET pays = 'Tunisie' WHERE id_entite IN (31, 33);
UPDATE Entite SET pays = 'Sénégal' WHERE id_entite IN (40, 41);
```

**Important :** Chaque entité DOIT avoir un pays défini pour que le routage fonctionne.

---

## 🧪 Scénario de Test 1 : Intra-Pays (Tunisie → Tunisie)

### Objectif
Tester qu'une commande entre deux entités tunisiennes reste sur le serveur Tunisie.

### Prérequis

**Sur le serveur TUNISIE (217.182.94.86) :**

1. **Identifier 2 entités tunisiennes :**
```sql
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Tunis%' 
LIMIT 5;
```

Exemple de résultat attendu :
```
id_entite | raison_socialle      | gln            | pays
----------|---------------------|----------------|--------
31        | Fournisseur TN 1    | 6141411999996  | Tunisie
33        | Acheteur TN 1       | 6141411999997  | Tunisie
```

2. **Créer des comptes utilisateurs pour ces entités (si nécessaire) :**
```sql
-- Vérifier les comptes existants
SELECT c.id_compte, c.username, c.id_entite, e.raison_socialle 
FROM comptes c 
JOIN Entite e ON c.id_entite = e.id_entite 
WHERE e.id_entite IN (31, 33);

-- Si pas de compte, en créer (exemple)
INSERT INTO comptes (username, password, email, id_entite, role, is_suspended) 
VALUES ('user_tn_31', 'hashed_password', 'user31@test.tn', 31, 'user', 0);
```

### Étapes du Test

#### Étape 1 : Connexion et Préparation

1. **Se connecter au frontend Tunisie**
   - URL : `https://edi-dev.codeonline-info.com`
   - Utilisateur : Acheteur (Entité 33)

2. **Vérifier les produits disponibles**
```sql
-- Sur serveur Tunisie
SELECT id_produit, libelle, gtin, prix_unitaire 
FROM produits 
WHERE id_entite = 31 -- Fournisseur
LIMIT 5;
```

#### Étape 2 : Créer une Commande

**Via l'interface ou API :**

```bash
curl -X POST https://edi-dev.codeonline-info.com/api/orders \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -d '{
    "acheteur": "6141411999997",
    "fournisseur": "6141411999996",
    "numCommande": "TEST-TUN-TUN-001",
    "dateCommande": "2026-02-12",
    "monnaie": "TND",
    "articles": [
      {
        "gtin": "6141411234567",
        "libelle": "Produit Test",
        "quantite": 10,
        "prixUnitaire": 25.50
      }
    ]
  }'
```

#### Étape 3 : Vérifier le Routage

**Logs à surveiller (sur serveur Tunisie) :**

```bash
# Logs PM2
pm2 logs | grep "EDI Routing"

# Logs attendus :
[EDI SEND] 🎯 EDI Routing Details:
  - Supplier GLN: 6141411999996
  - Target Country: Tunisie (TUN)
  - Target EDI URL: https://edi-dev.codeonline-info.com/api/edi/receive
```

**Vérifier en BDD :**

```sql
-- 1. Vérifier la transmission EDI (sur serveur Tunisie)
SELECT id_transmission, document_type, direction, partner_gln, status, 
       created_at, logs 
FROM edi_transmissions 
WHERE document_type = 'ORDERS' 
ORDER BY created_at DESC 
LIMIT 1;

-- Résultat attendu :
-- status = 'SENT'
-- partner_gln = '6141411999996' (fournisseur)

-- 2. Vérifier la réception (staging)
SELECT id, document_number, buyer_gln, supplier_gln, status, created_at 
FROM edi_orders 
WHERE document_number = 'TEST-TUN-TUN-001';

-- Résultat attendu :
-- buyer_gln = '6141411999997'
-- supplier_gln = '6141411999996'
-- status = 'PENDING' ou 'PROCESSED'

-- 3. Vérifier la notification du fournisseur
SELECT n.id_notification, n.id_compte, n.type, n.titre, n.message, n.created_at,
       c.username, e.raison_socialle
FROM notifications n
JOIN comptes c ON n.id_compte = c.id_compte
JOIN Entite e ON c.id_entite = e.id_entite
WHERE n.type = 'order_received'
  AND e.id_entite = 31
ORDER BY n.created_at DESC
LIMIT 1;

-- Résultat attendu :
-- Une notification pour le fournisseur (entité 31)
```

#### Étape 4 : Validation

✅ **Test RÉUSSI si :**
- Transmission EDI créée avec `status = 'SENT'`
- Message EDI reçu dans `edi_orders`
- Notification créée pour le fournisseur
- Logs montrent routage vers `TUN` (même serveur)
- **Aucun appel vers le serveur Sénégal**

---

## 🌍 Scénario de Test 2 : Inter-Pays (Tunisie → Sénégal)

### Objectif
Tester qu'une commande d'un acheteur tunisien vers un fournisseur sénégalais est routée correctement.

### Prérequis

**Sur serveur TUNISIE :**
```sql
-- Identifier un acheteur tunisien
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Tunis%' 
LIMIT 1;
-- Exemple : id_entite = 33, gln = '6141411999997'
```

**Sur serveur SÉNÉGAL :**
```sql
-- Identifier un fournisseur sénégalais
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE pays LIKE '%Sénégal%' OR pays LIKE '%Senegal%'
LIMIT 1;
-- Exemple : id_entite = 40, gln = '6141412000001'

-- Ajouter des produits pour ce fournisseur (si nécessaire)
INSERT INTO produits (id_entite, libelle, gtin, prix_unitaire, unite_mesure) 
VALUES (40, 'Produit Sénégal Test', '6141412999999', 15.00, 'PCE');
```

**Important :** Le fournisseur sénégalais doit exister dans la BDD Tunisie aussi (pour la recherche de partenaires).

```sql
-- Sur serveur TUNISIE : Vérifier/Ajouter le fournisseur sénégalais
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE gln = '6141412000001';

-- Si absent, l'ajouter :
INSERT INTO Entite (raison_socialle, gln, pays, adresse, ville, code_postal) 
VALUES ('Fournisseur Sénégal 1', '6141412000001', 'Sénégal', 'Dakar', 'Dakar', '10000');
```

### Étapes du Test

#### Étape 1 : Créer une Commande Inter-Pays

**Sur serveur TUNISIE, via API :**

```bash
curl -X POST https://edi-dev.codeonline-info.com/api/orders \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -d '{
    "acheteur": "6141411999997",
    "fournisseur": "6141412000001",
    "numCommande": "TEST-TUN-SEN-001",
    "dateCommande": "2026-02-12",
    "monnaie": "EUR",
    "articles": [
      {
        "gtin": "6141412999999",
        "libelle": "Produit Sénégal Test",
        "quantite": 5,
        "prixUnitaire": 15.00
      }
    ]
  }'
```

#### Étape 2 : Vérifier le Routage

**Logs sur serveur TUNISIE :**

```bash
pm2 logs | grep "EDI Routing"

# Logs attendus :
[EDI SEND] 🎯 EDI Routing Details:
  - Supplier GLN: 6141412000001
  - Target Country: Sénégal (SEN)
  - Target EDI URL: https://dev.codeonline-edi.net/api/edi/receive
```

**Vérifier en BDD TUNISIE :**

```sql
-- Transmission EDI créée
SELECT id_transmission, document_type, direction, partner_gln, status, 
       logs, error_message, created_at 
FROM edi_transmissions 
WHERE document_type = 'ORDERS' 
  AND partner_gln = '6141412000001'
ORDER BY created_at DESC 
LIMIT 1;

-- Résultat attendu :
-- status = 'SENT' (si succès)
-- logs contient "Successfully sent to EDI server"
```

#### Étape 3 : Vérifier la Réception sur SÉNÉGAL

**Logs sur serveur SÉNÉGAL :**

```bash
pm2 logs | grep "EDI RECEIVE"

# Logs attendus :
[EDI RECEIVE] 📥 Received EANCOM message
[EDI RECEIVE] 📋 Parsed Order: TEST-TUN-SEN-001
[EDI RECEIVE] 🔔 Notified supplier 40 of staged order
```

**Vérifier en BDD SÉNÉGAL :**

```sql
-- 1. Vérifier staging
SELECT id, document_number, buyer_gln, supplier_gln, status, 
       total_amount, created_at 
FROM edi_orders 
WHERE document_number = 'TEST-TUN-SEN-001';

-- Résultat attendu :
-- buyer_gln = '6141411999997' (Tunisie)
-- supplier_gln = '6141412000001' (Sénégal)
-- status = 'PENDING' ou 'PROCESSED'

-- 2. Vérifier la notification du fournisseur
SELECT n.id_notification, n.id_compte, n.type, n.titre, n.message, n.created_at,
       c.username, e.raison_socialle
FROM notifications n
JOIN comptes c ON n.id_compte = c.id_compte
JOIN Entite e ON c.id_entite = e.id_entite
WHERE n.type = 'order_received'
  AND e.gln = '6141412000001'
ORDER BY n.created_at DESC
LIMIT 1;

-- Résultat attendu :
-- Une notification pour le fournisseur sénégalais
```

#### Étape 4 : Validation

✅ **Test RÉUSSI si :**
- **Sur TUNISIE :**
  - Transmission EDI créée avec `status = 'SENT'`
  - Logs montrent routage vers `SEN` (serveur Sénégal)
  - URL cible = `https://dev.codeonline-edi.net/api/edi/receive`

- **Sur SÉNÉGAL :**
  - Message EDI reçu dans `edi_orders`
  - Notification créée pour le fournisseur sénégalais
  - Logs montrent réception du message

---

## 🌍 Scénario de Test 3 : Inter-Pays (Sénégal → Tunisie)

### Objectif
Tester le routage inverse (Sénégal vers Tunisie).

### Étapes du Test

**Sur serveur SÉNÉGAL, créer une commande :**

```bash
curl -X POST https://dev.codeonline-edi.net/api/orders \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -d '{
    "acheteur": "6141412000001",
    "fournisseur": "6141411999996",
    "numCommande": "TEST-SEN-TUN-001",
    "dateCommande": "2026-02-12",
    "monnaie": "EUR",
    "articles": [
      {
        "gtin": "6141411234567",
        "libelle": "Produit Tunisie Test",
        "quantite": 8,
        "prixUnitaire": 20.00
      }
    ]
  }'
```

**Vérifications :**

1. **Sur SÉNÉGAL :** Transmission `SENT` vers `TUN`
2. **Sur TUNISIE :** Réception dans `edi_orders` + notification fournisseur

---

## 🔍 Commandes de Diagnostic

### Vérifier la Configuration Actuelle

**Sur CHAQUE serveur :**

```sql
-- 1. Paramètres système
SELECT param_key, 
       CASE 
         WHEN param_key = 'NETWORK_TOPOLOGY' THEN LEFT(param_value, 100)
         ELSE param_value 
       END as param_value
FROM app_parameters 
WHERE param_key IN ('CURRENT_INSTANCE_CODE', 'LOCAL_API_URL', 'NETWORK_TOPOLOGY')
ORDER BY param_key;

-- 2. Entités par pays
SELECT pays, COUNT(*) as nb_entites 
FROM Entite 
WHERE pays IS NOT NULL AND pays != ''
GROUP BY pays;

-- 3. Dernières transmissions EDI
SELECT id_transmission, document_type, direction, partner_gln, 
       status, created_at, 
       SUBSTRING(logs, 1, 100) as logs_preview
FROM edi_transmissions 
ORDER BY created_at DESC 
LIMIT 10;

-- 4. Dernières notifications
SELECT n.id_notification, n.type, n.titre, 
       e.raison_socialle, e.pays, n.created_at
FROM notifications n
JOIN comptes c ON n.id_compte = c.id_compte
JOIN Entite e ON c.id_entite = e.id_entite
ORDER BY n.created_at DESC
LIMIT 10;
```

### Nettoyer les Données de Test

```sql
-- Supprimer les commandes de test
DELETE FROM edi_orders WHERE document_number LIKE 'TEST-%';
DELETE FROM edi_transmissions WHERE id_transmission IN (
  SELECT id_transmission FROM edi_transmissions 
  WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
);
DELETE FROM notifications WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

---

## ⚠️ Troubleshooting

### Problème 1 : Transmission reste en PENDING

**Cause possible :** EDI Worker ne tourne pas ou erreur d'envoi

**Solution :**
```bash
# Vérifier PM2
pm2 list
pm2 logs | grep "EDI WORKER"

# Relancer le worker
pm2 restart ecosystem.config.cjs
```

**Vérifier en BDD :**
```sql
SELECT id_transmission, status, error_message, retry_count 
FROM edi_transmissions 
WHERE status = 'PENDING' OR status = 'ERROR'
ORDER BY created_at DESC;
```

### Problème 2 : Pas de Notification

**Cause possible :** Pas de compte utilisateur pour l'entité

**Solution :**
```sql
-- Vérifier les comptes
SELECT e.id_entite, e.raison_socialle, e.gln, 
       COUNT(c.id_compte) as nb_comptes
FROM Entite e
LEFT JOIN comptes c ON e.id_entite = c.id_entite
GROUP BY e.id_entite, e.raison_socialle, e.gln
HAVING nb_comptes = 0;

-- Créer un compte si nécessaire
INSERT INTO comptes (username, password, email, id_entite, role, is_suspended) 
VALUES ('test_user', 'hashed_pass', 'test@example.com', 31, 'user', 0);
```

### Problème 3 : Routage Incorrect

**Cause possible :** Champ `pays` mal défini ou `NETWORK_TOPOLOGY` incorrect

**Solution :**
```sql
-- Vérifier le pays de l'entité
SELECT id_entite, raison_socialle, gln, pays 
FROM Entite 
WHERE gln = 'GLN_PROBLEMATIQUE';

-- Corriger si nécessaire
UPDATE Entite SET pays = 'Tunisie' WHERE gln = 'GLN_PROBLEMATIQUE';

-- Vérifier NETWORK_TOPOLOGY
SELECT param_value FROM app_parameters WHERE param_key = 'NETWORK_TOPOLOGY';
```

### Problème 4 : Erreur CORS ou Connexion Refusée

**Cause possible :** Firewall ou configuration réseau

**Solution :**
```bash
# Tester la connectivité entre serveurs
curl -I https://dev.codeonline-edi.net/health
curl -I https://edi-dev.codeonline-info.com/health

# Vérifier les logs d'erreur
pm2 logs --err
```

---

## ✅ Checklist de Validation Finale

### Configuration Serveur SÉNÉGAL (91.134.35.126)

- [ ] `CURRENT_INSTANCE_CODE` = `SEN`
- [ ] `LOCAL_API_URL` = `https://dev.codeonline-edi.net`
- [ ] `NETWORK_TOPOLOGY` contient les nœuds `TUN` et `SEN`
- [ ] Entités sénégalaises ont `pays = 'Sénégal'`
- [ ] Backend démarré et EDI Worker actif
- [ ] Logs montrent `Hydrating topology for instance: 'SEN'`

### Configuration Serveur TUNISIE (217.182.94.86)

- [ ] `CURRENT_INSTANCE_CODE` = `TUN`
- [ ] `LOCAL_API_URL` = `https://edi-dev.codeonline-info.com`
- [ ] `NETWORK_TOPOLOGY` contient les nœuds `TUN` et `SEN`
- [ ] Entités tunisiennes ont `pays = 'Tunisie'`
- [ ] Backend démarré et EDI Worker actif
- [ ] Logs montrent `Hydrating topology for instance: 'TUN'`

### Tests Fonctionnels

- [ ] Test intra-pays Tunisie → Tunisie : ✅ RÉUSSI
- [ ] Test inter-pays Tunisie → Sénégal : ✅ RÉUSSI
- [ ] Test inter-pays Sénégal → Tunisie : ✅ RÉUSSI
- [ ] Notifications reçues par les fournisseurs : ✅ RÉUSSI
- [ ] Logs de routage corrects (codes TUN/SEN) : ✅ RÉUSSI

---

## 📞 Support

En cas de problème, vérifier dans l'ordre :

1. **Configuration BDD** : `CURRENT_INSTANCE_CODE`, `NETWORK_TOPOLOGY`, `LOCAL_API_URL`
2. **Données Entités** : Champ `pays` renseigné pour toutes les entités
3. **Backend** : PM2 actif, EDI Worker en cours d'exécution
4. **Logs** : Chercher les erreurs dans `pm2 logs`
5. **Connectivité** : Tester les URLs entre serveurs

---

**Fin du Guide de Test**

*Ce guide doit être suivi étape par étape pour garantir le bon fonctionnement du routage EDI.*
