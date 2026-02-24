# Scénarios de Tests Complets EDI (Intra-Pays & Inter-Pays)

Ce document détaille les procédures de test complètes pour valider le routage EDI dynamique et la création de commandes, adaptés à différents environnements.

---

## ⚠️ Prérequis Critiques (Tous Scénarios)

Avant de lancer les tests, assurez-vous que les modifications de structure de base de données ont été appliquées sur la base cible.

**1. Mise à jour de la table `orders` :**
```sql
ALTER TABLE orders 
ADD COLUMN num_commande varchar(60) DEFAULT NULL,
ADD COLUMN acheteur_gln varchar(20) DEFAULT NULL,
ADD COLUMN fournisseur_gln varchar(20) DEFAULT NULL,
ADD COLUMN seller_name varchar(255) DEFAULT NULL,
ADD COLUMN lieu_livraison_gln varchar(20) DEFAULT NULL,
ADD COLUMN monnaie varchar(10) DEFAULT 'TND',
ADD COLUMN articles json DEFAULT NULL,
ADD COLUMN date_commande datetime DEFAULT NULL,
ADD COLUMN date_livraison datetime DEFAULT NULL,
ADD COLUMN date_livraison_demandee datetime DEFAULT NULL,
ADD COLUMN date_livraison_plus_tot datetime DEFAULT NULL,
ADD COLUMN date_livraison_plus_tard datetime DEFAULT NULL,
ADD COLUMN total_tax_amount decimal(15,2) DEFAULT 0.00,
ADD COLUMN total_amount_with_tax decimal(15,2) DEFAULT 0.00;
```

**2. Vérification de la table `edi_transmissions` :**
Assurez-vous que la colonne `id` existe (et non `id_transmission`). Si nécessaire :
```sql
-- Si la colonne s'appelle id_transmission, renommez-la (si possible) ou adaptez le code
-- Le code actuel attend 'id' comme clé primaire
```

---

## Scénario 1 : Localhost (Mac) -> BDD Tunisie (TUN -> TUN)

**Objectif :** Tester une commande intra-pays (Tunisie vers Tunisie) depuis votre machine locale connectée à la BDD Tunisie distante.

### 1. Configuration `.env` (Local)
Modifiez votre fichier `.env` local pour pointer vers la BDD Tunisie.

```ini
# Connexion BDD Tunisie
DB_HOST=217.182.94.86
DB_USER=Consultant
DB_PASS=VotreMotDePasse
DB_NAME=Dev_Entitedb

# Configuration App
PORT=5001
API_PIN=3311
EDI_ORDERS_PATH=./edi_orders  # Chemin local accessible en écriture
```

### 2. Configuration Base de Données (Tunisie)
Exécutez ce script sur la BDD Tunisie pour configurer l'instance en mode "TUN" et pointer le routage vers votre localhost pour le test.

```sql
-- Configurer l'instance comme TUNISIE
UPDATE app_parameters SET param_value = 'TUN' WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- Pour le test local, on veut recevoir les EDI sur localhost
UPDATE app_parameters SET param_value = 'http://localhost:5001' WHERE param_key = 'LOCAL_API_URL';

-- Mettre à jour la topologie pour que TUN pointe vers localhost
UPDATE app_parameters 
SET param_value = '{
  "TUN": {
    "name": "Tunisie",
    "country": "Tunisie",
    "countryCode": "TUN",
    "apiUrl": "http://localhost:5001",
    "ediUrl": "http://localhost:5001/api/edi/receive"
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
```

### 3. Exécution du Test
1.  Démarrez votre serveur backend local :
    ```bash
    node server.js
    ```
2.  Lancez le script de test automatique (configuré pour TUN->TUN) :
    ```bash
    # Modifiez temporairement test_edi_localhost.js si besoin pour ne faire que le test intra
    node backend/test_edi_localhost.js
    ```

### 4. Vérifications
1.  **Logs Console :** Vérifiez `[EDI SEND] 🎯 EDI Routing: ... -> Tunisie (TUN) -> http://localhost:5001/...`
2.  **Fichiers EANCOM :** Vérifiez que le fichier `ordre.txt` est créé dans `./edi_orders/orders/<GLN_FOURNISSEUR>/<NUM_COMMANDE>/`.
3.  **BDD (Table `edi_transmissions`) :** Vérifiez qu'une ligne est créée avec `status = 'RECEIVED'` (car boucle locale) ou `SENT`.
4.  **Réponse Acheteur :** Vérifiez via l'API ou BDD que le statut de la commande est passé à `sent` puis `received` (si boucle locale active).
5.  **Notifications :**
    *   **Fournisseur :** Doit recevoir une notification "Nouvelle commande [NUM] reçue de [ACHETEUR]".
    *   **Acheteur :** Doit recevoir une notification "Votre commande [NUM] a été envoyée...".

---

## Scénario 1-BIS : Retour Fournisseur (ORDRSP)

**Objectif :** Tester la réponse du fournisseur (ORDRSP) avec modification de prix.

**Étapes :**
1.  **Création Commande :** Comme ci-dessus.
2.  **Envoi Réponse :** Le script de test envoie automatiquement une réponse `ORDRSP` avec `status='modified'` et un nouveau prix.
3.  **Vérification :**
    *   **EDI Transmissions :** Vérifier qu'une nouvelle ligne `ORDRSP` est créée avec `related_id` = ID de la commande.
    *   **Logs :** Vérifier le routage `[ORDRSP SEND]`.
    *   **BDD :** Vérifier que `order_lines` a été mis à jour avec `confirmed_price` et `confirmed_qty` si applicable.
    *   **Notifications :** L'acheteur doit recevoir une notification "Réponse reçue pour la commande [NUM]...".

---

## Scénario 2 : Localhost (Mac) -> BDD Sénégal (SEN -> SEN)

**Objectif :** Tester une commande intra-pays (Sénégal vers Sénégal) depuis votre machine locale connectée à la BDD Sénégal distante.

### 1. Configuration `.env` (Local)
Modifiez votre fichier `.env` local pour pointer vers la BDD Sénégal.

```ini
# Connexion BDD Sénégal
DB_HOST=91.134.35.126
DB_USER=consultant_seg
DB_PASS=49BD&4vyrK6=PT!
DB_NAME=Dev_Entitedb

# Configuration App
PORT=5001
API_PIN=3311
EDI_ORDERS_PATH=./edi_orders
```

### 2. Configuration Base de Données (Sénégal)
Exécutez ce script sur la BDD Sénégal.

```sql
-- Configurer l'instance comme SÉNÉGAL
UPDATE app_parameters SET param_value = 'SEN' WHERE param_key = 'CURRENT_INSTANCE_CODE';

-- URL Locale pour le test
UPDATE app_parameters SET param_value = 'http://localhost:5001' WHERE param_key = 'LOCAL_API_URL';

-- Topologie : SEN pointe vers localhost pour le test
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
    "apiUrl": "http://localhost:5001",
    "ediUrl": "http://localhost:5001/api/edi/receive"
  }
}' 
WHERE param_key = 'NETWORK_TOPOLOGY';
```

### 3. Exécution du Test
1.  Redémarrez votre serveur backend local.
2.  Lancez le script de test automatique.

### 4. Vérifications
Identiques au Scénario 1, mais vérifiez que le routage indique `-> Sénégal (SEN)`.
De plus :
*   **Notifications :** Le fournisseur sénégalais doit recevoir la notification de commande.

---

## Scénario 2-BIS : Retour Fournisseur Inter-Pays (ORDRSP)

**Objectif :** Tester la réponse du fournisseur sénégalais vers l'acheteur tunisien.

**Étapes :**
1.  **Création Commande :** TUN -> SEN (Scénario 2).
2.  **Envoi Réponse :** Le script de test envoie une réponse `ORDRSP` depuis le fournisseur SEN.
3.  **Vérification :**
    *   **EDI Transmissions :** Vérifier la création de l'ORDRSP.
    *   **Routage :** Vérifier que la réponse est bien routée vers la Tunisie (TUN).
    *   **Logs :** `[ORDRSP SEND] ... -> Tunisie (TUN)`.
    *   **Notifications :** L'acheteur tunisien doit recevoir la notification "Réponse reçue...".

---

## Scénario 3 : Serveur DEV Sénégal -> BDD Sénégal (SEN -> SEN)

**Objectif :** Tester en conditions réelles sur le serveur de DEV du Sénégal.

### 1. Configuration `.env` (Serveur DEV)
Sur le serveur distant (via SSH), éditez le fichier `.env`.

```ini
# Connexion BDD Locale (Même serveur)
DB_HOST=127.0.0.1
DB_USER=consultant_seg
DB_PASS=49BD&4vyrK6=PT!
DB_NAME=Dev_Entitedb

# Configuration App
PORT=5001
# Chemin absolu sur le serveur (vérifiez les droits d'écriture !)
EDI_ORDERS_PATH=/var/www/Edi-orders 
```

### 2. Configuration Base de Données (Sénégal - Prod/Dev)
**ATTENTION :** Ici on remet les vraies URLs de DEV, pas localhost (sauf si vous voulez tester en boucle locale sur le serveur).

```sql
UPDATE app_parameters SET param_value = 'SEN' WHERE param_key = 'CURRENT_INSTANCE_CODE';
UPDATE app_parameters SET param_value = 'https://dev.codeonline-edi.net' WHERE param_key = 'LOCAL_API_URL';

-- Topologie REELLE
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
```

### 3. Exécution du Test
1.  Redémarrez le service PM2 : `pm2 restart backend-edi` (ou nom équivalent).
2.  Déclenchez une commande via Postman ou via l'interface web connectée à ce backend.
3.  Ou exécutez le script de test `test_edi_localhost.js` **sur le serveur** (en adaptant `CONFIG.apiUrl` à `http://localhost:5001`).

### 4. Vérifications
1.  **Logs PM2 :** `pm2 logs backend-edi` -> Vérifiez le routage.
2.  **Dossiers :** Vérifiez `/var/www/Edi-orders/...`
3.  **BDD :** Vérifiez `edi_transmissions` sur la base Sénégal.

---

## ✅ Checklist de Validation Finale

Pour chaque scénario, confirmez :
- [ ] La commande est créée dans la table `orders`.
- [ ] Le fichier EANCOM (ORDERS) est généré.
- [ ] La ligne `edi_transmissions` (ORDERS) est créée et statut `SENT`/`RECEIVED`.
- [ ] Le routage (logs) affiche le bon pays cible et la bonne URL.
- [ ] La réponse fournisseur (ORDRSP) est générée (fichier et BDD).
- [ ] La ligne `edi_transmissions` (ORDRSP) est créée et statut `SENT`/`RECEIVED`.
- [ ] Les notifications (Web/Email) sont bien reçues par l'acheteur et le fournisseur.
