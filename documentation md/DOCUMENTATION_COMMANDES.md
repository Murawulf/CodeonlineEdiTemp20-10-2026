# Documentation Système de Gestion des Commandes EDI

## Table des Matières
1. [Vue d'ensemble](#vue-densemble)
2. [Spécifications Fonctionnelles](#spécifications-fonctionnelles)
3. [Spécifications Techniques](#spécifications-techniques)
4. [Modèle de Données](#modèle-de-données)
5. [API Endpoints](#api-endpoints)
6. [Flux de Traitement](#flux-de-traitement)
7. [Format EANCOM](#format-eancom)

---

## Vue d'ensemble

Le système de gestion des commandes EDI permet aux entreprises d'échanger des commandes au format EANCOM (Electronic Data Interchange for Administration, Commerce and Transport). Le système gère l'ensemble du cycle de vie des commandes : création, validation, réception, traitement et archivage.

### Acteurs
- **Acheteur** : Entité qui crée et envoie des commandes
- **Fournisseur** : Entité qui reçoit et traite les commandes
- **Système EDI** : Plateforme d'échange centralisée

### Périmètre Fonctionnel
- Création de commandes multi-articles
- Génération automatique de fichiers EANCOM
- Gestion des commandes valides et invalides
- Suivi des commandes (reçues/envoyées)
- Archivage des commandes
- Support multi-devises
- Support multi-serveurs (Tunisie, Sénégal)

---

## Spécifications Fonctionnelles

### 1. Création de Commande

#### 1.1 Informations Générales
- **Numéro de commande** : Généré automatiquement ou saisi manuellement
  - Format : `[PRÉFIXE][NUMÉRO_ALÉATOIRE][SUFFIXE]`
  - Exemple : `CMD12345-2025`
  - Le préfixe par défaut est basé sur le nom de l'utilisateur (3 premiers caractères)
  - Numéro aléatoire : 5 chiffres (10000-99999)

#### 1.2 Dates de Livraison
Trois types de dates peuvent être spécifiées :
- **Date demandée** : Date de livraison souhaitée
- **Au plus tard** : Date limite de livraison
- **Au plus tôt** : Date de livraison la plus proche acceptable
- Si aucune date n'est fournie, le système utilise J+7 par défaut

#### 1.3 Sélection du Fournisseur
- Filtrage par pays/serveur (Tunisie, Sénégal, Tous)
- Recherche par raison sociale
- Affichage du GLN (Global Location Number) du fournisseur
- Chargement automatique du catalogue produits du fournisseur sélectionné

#### 1.4 Ajout d'Articles
Pour chaque article :
- **Produit** : Sélection via GTIN (code-barres) et libellé
- **Quantité** : Nombre entier ≥ 1 (obligatoire)
- **Prix unitaire HT** : Montant ≥ 0 (obligatoire)
- **Packaging** : Type de conditionnement (carton de 12, 24, etc.)

Validation :
- Au moins un article requis
- Quantité doit être un entier positif
- Prix doit être un nombre positif ou nul

#### 1.5 Informations Complémentaires
- **Devise** : TND, EUR, USD, XOF
- **Site fournisseur** : Lieu de retrait (optionnel)
- **Site de livraison** : Adresse de livraison (par défaut : GLN acheteur)
- **Frais proposés** : Frais de transport (optionnel)

#### 1.6 Validation et Envoi
Critères de validation :
1. Numéro de commande non vide
2. Fournisseur sélectionné
3. Au moins un article valide
4. Date de livraison présente

Processus d'envoi :
1. Validation des données
2. Génération du fichier EANCOM
3. Enregistrement en base de données
4. Stockage du fichier sur le serveur
5. Notification de succès/échec

### 2. Consultation des Commandes

#### 2.1 Vues Disponibles
- **Toutes les commandes** : Vue consolidée
- **Commandes reçues** : Commandes reçues par le fournisseur
- **Commandes envoyées** : Commandes créées par l'acheteur
- **Nouvelle commande** : Formulaire de création

#### 2.2 Filtres et Recherche
- **Recherche textuelle** : Par numéro de commande ou nom d'entité
- **Filtre par date** : Période (du/au)
- **Pagination** : 10, 25, 50 ou 100 lignes par page

#### 2.3 Informations Affichées
Pour chaque commande :
- Numéro de commande
- Date de réception/création
- Nom de l'entité (acheteur ou fournisseur selon le contexte)
- Nombre d'articles
- Montant total HT
- Statut (Envoyée, Reçue, Validée, Rejetée, Archivée)

### 3. Gestion des Statuts

#### 3.1 Cycle de Vie d'une Commande
```
Création → Envoyée → Reçue → [Validée | Rejetée] → Archivée
                              ↓
                         Invalide → Validée (après correction)
```

#### 3.2 Statuts Possibles
- **valid** : Commande valide en attente de traitement
- **accepted** : Commande acceptée par le fournisseur
- **rejected** : Commande rejetée par le fournisseur
- **archived** : Commande archivée (traitée et clôturée)
- **invalid** : Commande invalide (erreurs de validation)

### 4. Commandes Invalides

Une commande est considérée invalide si :
- Aucun article n'est spécifié
- Date de livraison manquante
- Données incohérentes ou incomplètes

Les commandes invalides sont :
- Stockées dans une table séparée (`invalid_orders`)
- Consultables via l'API
- Peuvent être corrigées et validées ultérieurement

---

## Spécifications Techniques

### 1. Architecture

#### 1.1 Stack Technologique

**Backend**
- Node.js + Express.js
- Base de données : MySQL (production) / SQLite (développement)
- Format d'échange : EANCOM (EDIFACT)
- Authentification : API PIN + ID Entité

**Frontend**
- React + TypeScript
- UI Components : Shadcn/UI
- State Management : React Hooks
- HTTP Client : Axios
- Styling : TailwindCSS

#### 1.2 Configuration Multi-Serveurs

**Serveurs EDI disponibles :**
- **Tunisie** : `https://edi-dev.codeonline-info.com`
- **Sénégal** : `https://codeonline-edi.net`

**⚠️ Important : Utiliser le proxy serveur pour éviter CORS**

Au lieu d'appeler directement les serveurs EDI (ce qui cause des erreurs CORS), utilisez l'endpoint proxy :

```javascript
// ❌ Ne pas faire (CORS error)
const response = await fetch('https://codeonline-edi.net/api/companies');

// ✅ Faire (via proxy serveur)
const response = await fetch('http://localhost:5001/api/edi/suppliers/SN'); // Sénégal
const response = await fetch('http://localhost:5001/api/edi/suppliers/TN'); // Tunisie
```

**Codes pays disponibles :**
- `TN` : Tunisie
- `SN` : Sénégal

### 2. Sécurité

#### 2.1 Authentification
- **API PIN** : Code d'accès statique (`3311`)
- **x-entite-id** : Identifiant de l'entité dans les headers
- Validation sur chaque requête API

```javascript
if (req.headers["x-api-pin"] !== API_PIN) {
  return res.status(403).json({ error: "Invalid PIN" });
}
```

#### 2.2 Validation des Données
- Validation côté client (TypeScript)
- Validation côté serveur (Node.js)
- Sanitization des entrées utilisateur

### 3. Stockage des Fichiers

#### 3.1 Structure des Répertoires
```
EANCOM_BASE_DIR/
└── fournisseurs/
    └── [GLN_FOURNISSEUR]/
        └── commandes/
            └── commandes_eancom/
                └── [NUM_COMMANDE]/
                    └── ordre.txt
```

#### 3.2 Format de Fichier
- Extension : `.txt`
- Encodage : UTF-8
- Format : EANCOM (EDIFACT)
- Nom : `ordre.txt`

---

## Modèle de Données

### 1. Tables Principales

#### 1.1 Table `valid_order`
Stocke les commandes valides.

```sql
CREATE TABLE valid_order (
  id_order INT AUTO_INCREMENT PRIMARY KEY,
  num_order VARCHAR(255) NOT NULL,
  date_reception DATETIME NOT NULL,
  date_livraison DATETIME,
  gln_fournisseur VARCHAR(13),
  commande_a INT,
  nbr_lin_article INT,
  montant_ht DECIMAL(10,2),
  statut VARCHAR(50) DEFAULT 'valid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (commande_a) REFERENCES Entite(id_entite)
);
```

**Champs** :
- `id_order` : Identifiant unique
- `num_order` : Numéro de commande
- `date_reception` : Date de réception de la commande
- `date_livraison` : Date de livraison demandée
- `gln_fournisseur` : GLN du fournisseur
- `commande_a` : ID de l'entité acheteuse
- `nbr_lin_article` : Nombre de lignes d'articles
- `montant_ht` : Montant total HT
- `statut` : Statut de la commande

#### 1.2 Table `order_lines`
Stocke les lignes d'articles de chaque commande.

```sql
CREATE TABLE order_lines (
  id_line INT AUTO_INCREMENT PRIMARY KEY,
  id_order INT NOT NULL,
  gtin VARCHAR(14),
  libelle VARCHAR(255),
  qty INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (id_order) REFERENCES valid_order(id_order) ON DELETE CASCADE
);
```

**Champs** :
- `id_line` : Identifiant unique de la ligne
- `id_order` : Référence à la commande
- `gtin` : Code-barres du produit (Global Trade Item Number)
- `libelle` : Libellé du produit
- `qty` : Quantité commandée
- `price` : Prix unitaire HT

#### 1.3 Table `invalid_orders`
Stocke les commandes invalides.

```sql
CREATE TABLE invalid_orders (
  id_order INT AUTO_INCREMENT PRIMARY KEY,
  num_order VARCHAR(255) NOT NULL,
  date_reception DATETIME NOT NULL,
  gln_fournisseur VARCHAR(13),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Champs** :
- `error_message` : Description des erreurs de validation

#### 1.4 Table `archived_orders`
Stocke les commandes archivées.

```sql
CREATE TABLE archived_orders (
  id_order INT AUTO_INCREMENT PRIMARY KEY,
  num_order VARCHAR(255) NOT NULL,
  date_reception DATETIME NOT NULL,
  gln_fournisseur VARCHAR(13),
  statut VARCHAR(50),
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 1.5 Table `order_responses`
Stocke les réponses aux commandes (acceptation/rejet).

```sql
CREATE TABLE order_responses (
  id_response INT AUTO_INCREMENT PRIMARY KEY,
  id_order INT NOT NULL,
  id_entite_responder INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_order) REFERENCES valid_order(id_order),
  FOREIGN KEY (id_entite_responder) REFERENCES Entite(id_entite)
);
```

**Actions possibles** :
- `accept` : Accepter la commande
- `reject` : Rejeter la commande
- `validate` : Valider une commande invalide

### 2. Relations

```
Entite (1) ----< (N) valid_order
valid_order (1) ----< (N) order_lines
valid_order (1) ----< (N) order_responses
```

---

## API Endpoints

### 1. POST `/api/orders/eancom`
Créer une nouvelle commande et générer le fichier EANCOM.

**Headers** :
```
x-api-pin: 3311
x-entite-id: [ID_ENTITE]
Content-Type: application/json
```

**Body** :
```json
{
  "numCommande": "CMD12345",
  "datecommande": "20260106120000",
  "datelivraison": "20260113120000",
  "dateenlevement": "",
  "Acheteur": "3000000000001",
  "fournisseur": "3000000000002",
  "lieu_livraison_primaire": "3000000000001",
  "facture": "",
  "monnaie": "TND",
  "article": "1234567890123!10!25.50;9876543210987!5!12.75"
}
```

**Format article** : `GTIN!QUANTITÉ!PRIX[;GTIN!QUANTITÉ!PRIX...]`

**Response Success (200)** :
```json
{
  "success": true,
  "file": "/path/to/ordre.txt",
  "orderId": 123
}
```

**Response Error (400)** :
```json
{
  "error": "Invalid order",
  "details": "No articles; Missing datelivraison; "
}
```

### 2. GET `/api/orders/incoming`
Récupérer les commandes reçues par un fournisseur.

**Headers** :
```
x-api-pin: 3311
x-entite-id: [ID_FOURNISSEUR]
```

**Response (200)** :
```json
{
  "orders": [
    {
      "id_order": 123,
      "num_order": "CMD12345",
      "date_reception": "2026-01-06T12:00:00.000Z",
      "date_livraison": "2026-01-13T12:00:00.000Z",
      "commande_a": 456,
      "nbr_lin_article": 2,
      "montant_ht": "153.25",
      "statut": "valid",
      "buyer_name": "Entreprise Acheteuse",
      "lines": [
        {
          "gtin": "1234567890123",
          "libelle": "Produit A",
          "qty": 10,
          "price": "25.50"
        },
        {
          "gtin": "9876543210987",
          "libelle": "Produit B",
          "qty": 5,
          "price": "12.75"
        }
      ]
    }
  ]
}
```

### 3. GET `/api/orders/invalid`
Récupérer les commandes invalides.

**Headers** :
```
x-api-pin: 3311
x-entite-id: [ID_ENTITE]
```

**Response (200)** :
```json
{
  "orders": [
    {
      "id_order": 789,
      "num_order": "CMD99999",
      "date_reception": "2026-01-06T10:00:00.000Z",
      "error_message": "No articles; Missing datelivraison; "
    }
  ]
}
```

### 4. GET `/api/orders/archived`
Récupérer les commandes archivées.

**Headers** :
```
x-api-pin: 3311
x-entite-id: [ID_ENTITE]
```

**Response (200)** :
```json
{
  "orders": [
    {
      "id_order": 456,
      "num_order": "CMD11111",
      "date_reception": "2025-12-01T12:00:00.000Z",
      "statut": "archived"
    }
  ]
}
```

### 5. POST `/api/orders/:id/response`
Répondre à une commande (accepter/rejeter/valider).

**Headers** :
```
x-api-pin: 3311
x-entite-id: [ID_ENTITE_RESPONDER]
```

**Body** :
```json
{
  "action": "accept"
}
```

**Actions possibles** : `accept`, `reject`, `validate`

**Response (200)** :
```json
{
  "success": true,
  "newStatus": "accepted"
}
```

### 6. DELETE `/api/orders/:id`
Supprimer une commande.

**Headers** :
```
x-api-pin: 3311
```

**Response (200)** :
```json
{
  "success": true
}
```

---

## Flux de Traitement

### 1. Flux de Création de Commande

```
┌─────────────────┐
│  Utilisateur    │
│  (Acheteur)     │
└────────┬────────┘
         │
         │ 1. Saisie des informations
         ▼
┌─────────────────────────┐
│  Frontend (Order.tsx)   │
│  - Validation formulaire│
│  - Formatage données    │
└────────┬────────────────┘
         │
         │ 2. POST /api/orders/eancom
         ▼
┌─────────────────────────┐
│  Backend (server.js)    │
│  - Validation métier    │
│  - Génération EANCOM    │
└────────┬────────────────┘
         │
         ├─────────────────┐
         │                 │
         │ 3a. Valide      │ 3b. Invalide
         ▼                 ▼
┌──────────────┐    ┌──────────────────┐
│ valid_order  │    │ invalid_orders   │
│ order_lines  │    │ + error_message  │
└──────┬───────┘    └──────────────────┘
       │
       │ 4. Génération fichier
       ▼
┌──────────────────────────┐
│ Système de fichiers      │
│ /fournisseurs/.../ordre.txt│
└──────────────────────────┘
```

### 2. Flux de Consultation

```
┌─────────────────┐
│  Utilisateur    │
└────────┬────────┘
         │
         │ 1. Demande de consultation
         ▼
┌─────────────────────────┐
│  Frontend (Order.tsx)   │
│  - Sélection vue        │
│  - Application filtres  │
└────────┬────────────────┘
         │
         │ 2. GET /api/orders/[incoming|invalid|archived]
         ▼
┌─────────────────────────┐
│  Backend (server.js)    │
│  - Requête SQL          │
│  - Jointures tables     │
└────────┬────────────────┘
         │
         │ 3. Résultats
         ▼
┌─────────────────────────┐
│  Frontend               │
│  - Affichage tableau    │
│  - Pagination           │
└─────────────────────────┘
```

### 3. Flux de Réponse à une Commande

```
┌─────────────────┐
│  Fournisseur    │
└────────┬────────┘
         │
         │ 1. Consultation commande reçue
         ▼
┌─────────────────────────┐
│  Interface Commandes    │
│  - Détails commande     │
│  - Boutons action       │
└────────┬────────────────┘
         │
         │ 2. POST /api/orders/:id/response
         │    { action: "accept" | "reject" }
         ▼
┌─────────────────────────┐
│  Backend                │
│  - Enregistrement       │
│    dans order_responses │
│  - Mise à jour statut   │
└────────┬────────────────┘
         │
         │ 3. Notification
         ▼
┌─────────────────────────┐
│  Acheteur               │
│  - Mise à jour statut   │
└─────────────────────────┘
```

---

## Format EANCOM

### 1. Structure du Message ORDERS

Le format EANCOM est basé sur EDIFACT (Electronic Data Interchange For Administration, Commerce and Transport).

#### 1.1 Segments Principaux

```
UNH - Message Header (En-tête du message)
BGM - Beginning of Message (Début du message)
DTM - Date/Time/Period (Dates)
NAD - Name and Address (Parties impliquées)
CUX - Currencies (Devises)
LIN - Line Item (Ligne d'article)
QTY - Quantity (Quantité)
PRI - Price Details (Prix)
UNS - Section Control (Contrôle de section)
CNT - Control Total (Total de contrôle)
UNT - Message Trailer (Fin du message)
```

#### 1.2 Exemple de Message EANCOM

```
UNH+MESS001+ORDERS:D:96A:UN:EAN008'
BGM+220+CMD12345+9'
DTM+137:20260106120000:102'
DTM+2:20260113120000:102'
NAD+BY+3000000000001::9'
NAD+DP+3000000000001::9'
NAD+UC+3000000000001::9'
NAD+SU+3000000000002::9'
CUX+2:TND:9'
LIN+1++1234567890123:EN'
QTY+21:10:PCE'
PRI+AAA:25.50::NTP:1:PCE'
LIN+2++9876543210987:EN'
QTY+21:5:PCE'
PRI+AAA:12.75::NTP:1:PCE'
UNS+S'
CNT+2:2'
UNT+14+MESS001'
```

### 2. Détail des Segments

#### 2.1 UNH - Message Header
```
UNH+MESS001+ORDERS:D:96A:UN:EAN008'
```
- `MESS001` : Référence du message
- `ORDERS` : Type de message (commande)
- `D:96A:UN:EAN008` : Version EDIFACT

#### 2.2 BGM - Beginning of Message
```
BGM+220+CMD12345+9'
```
- `220` : Code du type de document (commande)
- `CMD12345` : Numéro de commande
- `9` : Code de fonction (original)

#### 2.3 DTM - Date/Time/Period
```
DTM+137:20260106120000:102'
DTM+2:20260113120000:102'
```
- `137` : Date de création de la commande
- `2` : Date de livraison demandée
- `102` : Format date (CCYYMMDDHHMMSS)
- `203` : Format date avec timezone

#### 2.4 NAD - Name and Address
```
NAD+BY+3000000000001::9'
NAD+DP+3000000000001::9'
NAD+SU+3000000000002::9'
```
- `BY` : Buyer (Acheteur)
- `DP` : Delivery Party (Lieu de livraison)
- `UC` : Ultimate Consignee (Destinataire final)
- `SU` : Supplier (Fournisseur)
- `IV` : Invoicee (Destinataire de la facture)
- `9` : Code EAN/GLN

#### 2.5 CUX - Currencies
```
CUX+2:TND:9'
```
- `2` : Devise de référence
- `TND` : Code devise (Dinar Tunisien)
- `9` : Code ISO

#### 2.6 LIN - Line Item
```
LIN+1++1234567890123:EN'
```
- `1` : Numéro de ligne
- `1234567890123` : GTIN du produit
- `EN` : Code EAN

#### 2.7 QTY - Quantity
```
QTY+21:10:PCE'
```
- `21` : Quantité commandée
- `10` : Valeur de la quantité
- `PCE` : Unité (pièce)

#### 2.8 PRI - Price Details
```
PRI+AAA:25.50::NTP:1:PCE'
```
- `AAA` : Prix de calcul
- `25.50` : Montant
- `NTP` : Prix net
- `1` : Quantité de base
- `PCE` : Unité de prix

#### 2.9 UNS - Section Control
```
UNS+S'
```
- `S` : Début de la section récapitulative

#### 2.10 CNT - Control Total
```
CNT+2:2'
```
- `2` : Nombre total de lignes
- `2` : Valeur

#### 2.11 UNT - Message Trailer
```
UNT+14+MESS001'
```
- `14` : Nombre total de segments
- `MESS001` : Référence du message (doit correspondre à UNH)

### 3. Fonction de Génération

```javascript
function generateEANCOM(data) {
  const lines = [];
  let segmentCount = 0;
  
  const add = (line) => {
    segmentCount++;
    lines.push(line);
  };
  
  // En-tête
  add("UNH+MESS001+ORDERS:D:96A:UN:EAN008'");
  add(`BGM+220+${data.numCommande}+9'`);
  
  // Dates
  if (data.datecommande) {
    add(`DTM+137:${data.datecommande}:102'`);
  }
  if (data.datelivraison) {
    const code = data.datelivraison.length > 8 ? "203" : "102";
    add(`DTM+2:${data.datelivraison}:${code}'`);
  }
  
  // Parties
  if (data.Acheteur) {
    add(`NAD+BY+${data.Acheteur}::9'`);
  }
  if (data.lieu_livraison_primaire) {
    add(`NAD+DP+${data.lieu_livraison_primaire}::9'`);
    add(`NAD+UC+${data.lieu_livraison_primaire}::9'`);
  }
  if (data.fournisseur) {
    add(`NAD+SU+${data.fournisseur}::9'`);
  }
  
  // Devise
  if (data.monnaie) {
    add(`CUX+2:${data.monnaie}:9'`);
  }
  
  // Articles
  const items = data.article.split(/[;|]/).filter(Boolean);
  items.forEach((line, idx) => {
    const parts = line.split("!");
    const gtin = parts[0];
    const qty = parts[1];
    const price = parts[2];
    
    add(`LIN+${idx + 1}++${gtin}:EN'`);
    add(`QTY+21:${qty}:PCE'`);
    add(`PRI+AAA:${price}::NTP:1:PCE'`);
  });
  
  // Récapitulatif
  add("UNS+S'");
  add(`CNT+2:${items.length}'`);
  add(`UNT+${segmentCount}+MESS001'`);
  
  return lines.join("\n") + "\n";
}
```

---

## Annexes

### A. Codes de Devises Supportées

| Code | Devise | Symbole |
|------|--------|---------|
| TND  | Dinar tunisien | د.ت |
| EUR  | Euro | € |
| USD  | Dollar américain | $ |
| XOF  | Franc CFA | Fr |

### B. Codes de Statut

| Code | Description | Signification |
|------|-------------|---------------|
| valid | Valide | Commande validée, en attente de traitement |
| accepted | Acceptée | Commande acceptée par le fournisseur |
| rejected | Rejetée | Commande rejetée par le fournisseur |
| archived | Archivée | Commande traitée et archivée |
| invalid | Invalide | Commande avec erreurs de validation |

### C. Codes d'Erreur API

| Code HTTP | Message | Description |
|-----------|---------|-------------|
| 200 | OK | Requête réussie |
| 400 | Bad Request | Données invalides ou manquantes |
| 403 | Forbidden | PIN invalide ou accès refusé |
| 500 | Internal Server Error | Erreur serveur |

### D. Glossaire

- **EANCOM** : Electronic Article Numbering Communication - Standard EDI pour le commerce
- **EDIFACT** : Electronic Data Interchange For Administration, Commerce and Transport
- **GLN** : Global Location Number - Identifiant unique d'une entité (13 chiffres)
- **GTIN** : Global Trade Item Number - Code-barres international (8, 12, 13 ou 14 chiffres)
- **EDI** : Electronic Data Interchange - Échange de Données Informatisé
- **HT** : Hors Taxes
- **PCE** : Pièce (unité de mesure)

---

**Document créé le** : 6 janvier 2026  
**Version** : 1.0  
**Auteur** : Système de Documentation Automatique  
**Projet** : Codeonline EDI - Gestion des Commandes
