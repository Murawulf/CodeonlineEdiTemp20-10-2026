# Refactoring : Chemin Configurable pour les Documents EDI EANCOM

**Date :** 08 Février 2026  
**Auteur :** Majd Hakim (Chef de Projet)  
**Objet :** Externalisation du chemin de stockage des documents EDI dans la base de données

---

## 1. Contexte et Objectif

### Problématique
Auparavant, le chemin de stockage des documents EDI EANCOM était codé en dur dans le fichier `server.js` :
```javascript
const EANCOM_BASE_DIR = process.env.EANCOM_BASE_DIR || "/var/www/formation/ecomfournisseur";
```

Cette approche posait plusieurs problèmes :
- **Rigidité** : Changement de chemin nécessitait une modification du code et un redéploiement
- **Structure complexe** : Utilisation de sous-dossiers imbriqués (`fournisseurs/GLN/commandes/commandes_eancom/NUM/`)
- **Maintenance** : Difficulté à gérer différents environnements (Dev, Prod, Tunisie, Sénégal)

### Objectif
Déplacer le stockage des documents EDI vers un dossier **`Edi-orders`** au même niveau que le dossier de l'application, et rendre ce chemin **configurable via la base de données**.

---

## 2. Solution Implémentée

### 2.1. Nouveau Paramètre en Base de Données

**Table :** `app_parameters`  
**Nouveau paramètre :**
```sql
INSERT INTO app_parameters (param_key, param_value, param_type, category, description, is_public) 
VALUES (
    'EDI_ORDERS_PATH',
    '/var/www/Edi-orders',
    'string',
    'eancom',
    'Chemin du dossier de stockage des documents EDI EANCOM',
    0
);
```

**Fichier de migration :** `sql/migrations/add_edi_orders_path.sql`

### 2.2. Nouvelle Méthode dans configService

**Fichier :** `backend/services/configService.js`

Ajout de la méthode `getEdiOrdersPath()` :
```javascript
const getEdiOrdersPath = () => {
  // Try to get from database first
  const dbPath = get('EDI_ORDERS_PATH');
  if (dbPath) return dbPath;
  
  // Fallback to environment variable
  if (process.env.EDI_ORDERS_PATH) return process.env.EDI_ORDERS_PATH;
  
  // Final fallback to default location
  return '/var/www/Edi-orders';
};
```

### 2.3. Nouvelle Structure de Dossiers

**Ancienne structure :**
```
/var/www/formation/ecomfournisseur/
  └── fournisseurs/
      └── {GLN_FOURNISSEUR}/
          └── commandes/
              └── commandes_eancom/
                  └── {NUM_COMMANDE}/
                      └── ordre.txt
```

**Nouvelle structure (simplifiée) :**
```
/var/www/Edi-orders/
  ├── orders/
  │   └── {GLN_FOURNISSEUR}/
  │       └── {NUM_COMMANDE}/
  │           └── ordre.txt
  ├── responses/
  │   └── {GLN_FOURNISSEUR}/
  │       └── {NUM_COMMANDE}/
  │           └── ordrsp_XXX.txt
  ├── desadv/
  │   └── {GLN_EXPEDITEUR}/
  │       └── DESADV_XXX.txt
  └── invoices/
      └── {GLN_VENDEUR}/
          └── INVOIC_XXX.txt
```

---

## 3. Fichiers Modifiés

### 3.1. Backend

| Fichier | Modifications |
|---------|---------------|
| `backend/services/configService.js` | Ajout de `getEdiOrdersPath()` et export de la méthode |
| `backend/server.js` | Suppression de `EANCOM_BASE_DIR` en dur<br>Utilisation de `configService.getEdiOrdersPath()` dans tous les endpoints EDI<br>Simplification de la structure des chemins |

### 3.2. SQL

| Fichier | Description |
|---------|-------------|
| `sql/migrations/add_edi_orders_path.sql` | Migration pour ajouter le paramètre `EDI_ORDERS_PATH` |

### 3.3. Endpoints Impactés

Les endpoints suivants ont été mis à jour pour utiliser le nouveau système :

1. **POST `/api/orders/eancom`** - Création de commandes ORDERS
   - Ancien chemin : `{EANCOM_BASE_DIR}/fournisseurs/{GLN}/commandes/commandes_eancom/{NUM}/ordre.txt`
   - Nouveau chemin : `{EDI_ORDERS_PATH}/orders/{GLN}/{NUM}/ordre.txt`

2. **POST `/api/orders/respond`** - Réponses ORDRSP
   - Ancien chemin : `{EANCOM_BASE_DIR}/fournisseurs/{GLN}/reponses/ordrsp/{NUM}/ordrsp_XXX.txt`
   - Nouveau chemin : `{EDI_ORDERS_PATH}/responses/{GLN}/{NUM}/ordrsp_XXX.txt`

3. **POST `/api/edi/desadv/send`** - Avis d'expédition DESADV
   - Ancien chemin : `uploads/eancom/outbound/outbound_DESADV_XXX.txt`
   - Nouveau chemin : `{EDI_ORDERS_PATH}/desadv/{GLN}/DESADV_XXX.txt`

4. **POST `/api/edi/invoic/send`** - Factures INVOIC
   - Ancien chemin : `uploads/eancom/outbound/outbound_INVOIC_XXX.txt`
   - Nouveau chemin : `{EDI_ORDERS_PATH}/invoices/{GLN}/INVOIC_XXX.txt`

---

## 4. Instructions de Déploiement

### 4.1. Exécuter la Migration SQL

```bash
# Se connecter à MySQL
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME

# Exécuter la migration
source /chemin/vers/sql/migrations/add_edi_orders_path.sql

# Vérifier que le paramètre a été ajouté
SELECT * FROM app_parameters WHERE param_key = 'EDI_ORDERS_PATH';
```

### 4.2. Créer le Dossier Edi-orders

```bash
# Sur le serveur, créer le dossier au même niveau que l'application
sudo mkdir -p /var/www/Edi-orders
sudo chown -R www-data:www-data /var/www/Edi-orders
sudo chmod -R 755 /var/www/Edi-orders

# Créer les sous-dossiers
sudo mkdir -p /var/www/Edi-orders/{orders,responses,desadv,invoices}
```

### 4.3. Mettre à Jour le Paramètre (si nécessaire)

Si le chemin par défaut `/var/www/Edi-orders` ne convient pas :

```sql
UPDATE app_parameters 
SET param_value = '/chemin/personnalisé/Edi-orders' 
WHERE param_key = 'EDI_ORDERS_PATH';
```

### 4.4. Redémarrer le Backend

```bash
pm2 restart codeonline-backend
# ou
npm start
```

---

## 5. Avantages de cette Architecture

| Avantage | Description |
|----------|-------------|
| **Flexibilité** | Le chemin peut être modifié sans toucher au code, simplement via une requête SQL |
| **Simplicité** | Structure de dossiers plus claire et moins profonde |
| **Multi-environnement** | Chaque serveur (Tunisie, Sénégal) peut avoir son propre chemin configuré en BDD |
| **Maintenance** | Plus besoin de redéployer l'application pour changer le chemin de stockage |
| **Centralisation** | Toute la configuration est gérée via `configService` |

---

## 6. Tests de Validation

### 6.1. Test de Création de Commande

```bash
curl -X POST http://localhost:5000/api/orders/eancom \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -H "x-entite-id: 1" \
  -d '{
    "numCommande": "TEST-EDI-001",
    "fournisseur": "5412345000013",
    "Acheteur": "4012345500004",
    "datecommande": "20260208",
    "datelivraison": "20260215",
    "currency": "TND",
    "articles": [...]
  }'
```

**Vérifier que le fichier est créé à :**
```
/var/www/Edi-orders/orders/5412345000013/TEST-EDI-001/ordre.txt
```

### 6.2. Test de Réponse ORDRSP

```bash
curl -X POST http://localhost:5000/api/orders/respond \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -H "x-entite-id: 1" \
  -d '{
    "orderId": 123,
    "status": "accepted",
    "comment": "Commande acceptée"
  }'
```

**Vérifier que le fichier est créé à :**
```
/var/www/Edi-orders/responses/{GLN}/{NUM_COMMANDE}/ordrsp_XXX.txt
```

---

## 7. Compatibilité et Migration

### Anciens Fichiers
Les anciens fichiers dans `/var/www/formation/ecomfournisseur/` restent accessibles mais ne seront plus utilisés pour les nouvelles commandes.

### Migration Optionnelle
Si vous souhaitez migrer les anciens fichiers vers la nouvelle structure :

```bash
# Script de migration (à adapter selon vos besoins)
#!/bin/bash
OLD_PATH="/var/www/formation/ecomfournisseur/fournisseurs"
NEW_PATH="/var/www/Edi-orders/orders"

for gln_dir in $OLD_PATH/*; do
  GLN=$(basename "$gln_dir")
  if [ -d "$gln_dir/commandes/commandes_eancom" ]; then
    cp -r "$gln_dir/commandes/commandes_eancom/"* "$NEW_PATH/$GLN/"
  fi
done
```

---

## 8. Variables d'Environnement (Optionnel)

Vous pouvez également définir `EDI_ORDERS_PATH` dans le fichier `.env` comme fallback :

```properties
# .env ou .env.production
EDI_ORDERS_PATH=/var/www/Edi-orders
```

**Ordre de priorité :**
1. Valeur en base de données (`app_parameters`)
2. Variable d'environnement (`process.env.EDI_ORDERS_PATH`)
3. Valeur par défaut (`/var/www/Edi-orders`)

---

## 9. Conclusion

Cette refactorisation améliore significativement la maintenabilité et la flexibilité de l'application en :
- Supprimant les chemins codés en dur
- Centralisant la configuration dans la base de données
- Simplifiant la structure des dossiers EDI
- Facilitant les déploiements multi-environnements

Tous les documents EDI EANCOM sont désormais stockés dans un emplacement configurable et facilement modifiable sans intervention sur le code source.
