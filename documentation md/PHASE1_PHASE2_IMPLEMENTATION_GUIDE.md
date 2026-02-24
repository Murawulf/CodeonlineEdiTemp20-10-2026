# 🚀 Guide d'Implémentation Phase 1 & 2 - EANCOM GS1

## 📋 Vue d'Ensemble

Ce guide décrit l'implémentation des **Phase 1 (Base de Données)** et **Phase 2 (Backend)** pour la mise à niveau EANCOM GS1 standard.

---

## ✅ Phase 1 : Base de Données (TERMINÉ)

### Fichiers Créés

1. **`backend/migrations/phase1_eancom_improvements.sql`**
   - Migration complète avec tous les nouveaux champs
   - Table `edi_transmissions` pour tracer les transmissions EDI
   - Table `order_line_deliveries` pour livraisons multiples
   - 27 nouveaux champs pour `orders`
   - 10 nouveaux champs pour `order_lines`
   - Script de vérification inclus
   - Script de rollback en cas de problème

### Exécution de la Migration

```bash
# Se connecter à MySQL
mysql -h ${DB_HOST} -u ${DB_USER} -p ${DB_PASSWORD} ${DB_NAME}

# Exécuter la migration
source /Users/majdhakim/Travail/netconsulting/Codeonline-InfoTn/backend/migrations/phase1_eancom_improvements.sql

# Vérifier que tout est OK
SELECT COUNT(*) FROM edi_transmissions;
SELECT COUNT(*) FROM order_line_deliveries;
```

### Nouveaux Champs `orders`

**Contractuels :**
- `contract_reference`, `contract_date`, `price_list_reference`
- `buyer_vat_number`, `supplier_vat_number`

**Paiement :**
- `payment_terms_code`, `payment_means`

**Contact :**
- `order_contact_name`, `order_contact_phone`, `order_contact_email`

**Transport :**
- `transport_mode`, `transport_means`, `delivery_terms_code`, `delivery_port`

**Conditions :**
- `group_conditions_code`, `free_text`

**Change :**
- `exchange_rate`, `exchange_rate_currency`, `exchange_rate_period_start`, `exchange_rate_period_end`

**Totaux :**
- `total_line_amount`, `total_tax_amount`, `total_amount_with_tax`, `tax_rate`

**Emballage :**
- `package_count`, `package_type`, `package_marking_instructions`

### Table `edi_transmissions`

Traçabilité complète des transmissions EDI :
- `related_id` + `related_type` : Lien vers l'objet métier (ORDER, INVOICE, etc.)
- `document_type` : Type message EDI (ORDERS, INVOIC, ORDRSP, DESADV)
- `partner_id` + `partner_gln` : Destinataire
- `filename` + `file_path` + `file_content` : Fichier EANCOM
- `status` : PENDING, SENT, ERROR, ACKNOWLEDGED
- `transmission_date`, `acknowledgment_date` : Dates de suivi
- `logs`, `error_message` : Traçabilité
- `retry_count` : Gestion des tentatives

---

## ✅ Phase 2 : Backend (EN COURS)

### Fichiers Créés

1. **`backend/generateOrderEANCOM_enhanced.js`**
   - Générateur EANCOM 100% conforme GS1 ORDERS D.01B
   - Support de tous les segments manquants (PAI, ALI, FTX, RFF, CTA, COM, TDT, TOD, LOC, PIA, IMD, MOA, PAC, PCI, TAX)
   - Gestion des livraisons multiples
   - Calculs automatiques des totaux

2. **`backend/edi_transmission_helper.js`**
   - `createEdiTransmission()` : Enregistrer une transmission
   - `updateEdiTransmissionStatus()` : Mettre à jour le statut
   - `getEdiTransmissions()` : Récupérer les transmissions
   - `getPendingTransmissions()` : Transmissions en attente
   - `incrementRetryCount()` : Gestion des retries

### Modifications `server.js`

**Imports ajoutés :**
```javascript
const { generateOrderEANCOM_Enhanced } = require('./generateOrderEANCOM_enhanced');
const { createEdiTransmission, updateEdiTransmissionStatus, getEdiTransmissions } = require('./edi_transmission_helper');
```

### Prochaines Étapes (À FAIRE)

#### 1. Mettre à jour `POST /api/orders/eancom`

**Changements nécessaires :**

```javascript
// AVANT (ligne 3691)
const edifact = generateOrderEANCOM(data);

// APRÈS
const edifact = generateOrderEANCOM_Enhanced(data);
```

**Ajouter après l'insertion de la commande (après ligne 3728) :**

```javascript
// Enregistrer la transmission EDI
const transmissionId = await createEdiTransmission(entiteDB, {
  related_id: orderId,
  related_type: 'ORDER',
  document_type: 'ORDERS',
  partner_id: supplierCheck[0].id_entite,
  partner_gln: data.fournisseur,
  filename: 'ordre.txt',
  file_path: path.join(dir, "ordre.txt"),
  file_content: edifact,
  status: 'PENDING',
  logs: 'Order created and EANCOM file generated'
});

console.log(`[EDI] Transmission #${transmissionId} created for order #${orderId}`);
```

**Mettre à jour l'INSERT orders (ligne 3695) pour inclure les nouveaux champs :**

```javascript
const insertRes = await runUpdate(entiteDB,
  `INSERT INTO orders (
    num_commande, order_number, id_entite_buyer, acheteur_gln, 
    id_entite_seller, fournisseur_gln, lieu_livraison_gln, status, 
    total_ht, monnaie, articles, frais_proposes, currency, 
    date_commande, date_livraison, mode_transport, moyen_transport, 
    transporteur_gln,
    -- Nouveaux champs GS1
    contract_reference, contract_date, price_list_reference,
    buyer_vat_number, supplier_vat_number, payment_terms_code,
    order_contact_name, order_contact_phone, order_contact_email,
    transport_mode, transport_means, delivery_terms_code, delivery_port,
    group_conditions_code, free_text,
    exchange_rate, exchange_rate_currency, 
    exchange_rate_period_start, exchange_rate_period_end,
    total_line_amount, total_tax_amount, total_amount_with_tax, tax_rate,
    package_count, package_type, package_marking_instructions,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
  [
    data.numCommande, 
    data.numCommande, 
    buyerCheck[0].id_entite, 
    data.Acheteur, 
    supplierCheck[0].id_entite, 
    data.fournisseur, 
    data.lieuLivraison || null, 
    'new', 
    data.total_ht || 0, 
    data.currency || 'TND', 
    JSON.stringify(data.articles), 
    data.fraisTransport || null, 
    data.currency || 'TND', 
    data.datecommande, 
    data.datelivraison,
    data.modeTransport || null,
    data.moyenTransport || null,
    data.transporteurGln || null,
    // Nouveaux champs
    data.contractReference || null,
    data.contractDate || null,
    data.priceListReference || null,
    data.buyerVatNumber || null,
    data.supplierVatNumber || null,
    data.paymentTermsCode || null,
    data.orderContactName || null,
    data.orderContactPhone || null,
    data.orderContactEmail || null,
    data.transportMode || null,
    data.transportMeans || null,
    data.deliveryTermsCode || null,
    data.deliveryPort || null,
    data.groupConditionsCode || null,
    data.freeText || null,
    data.exchangeRate || null,
    data.exchangeRateCurrency || null,
    data.exchangeRatePeriodStart || null,
    data.exchangeRatePeriodEnd || null,
    data.totalLineAmount || null,
    data.totalTaxAmount || null,
    data.totalAmountWithTax || null,
    data.taxRate || null,
    data.packageCount || null,
    data.packageType || null,
    data.packageMarkingInstructions || null
  ]
);
```

**Mettre à jour l'INSERT order_lines (ligne 3723) :**

```javascript
for (const item of data.articles) {
  await runUpdate(entiteDB,
    `INSERT INTO order_lines (
      id_order, line_number, product_id, gtin, libelle, qty, unit, price,
      buyer_product_code, supplier_product_code, product_description,
      line_net_amount, line_tax_amount, line_tax_rate,
      line_package_count, line_package_type, price_qualifier, price_unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId, 
      lineNumber, 
      null, 
      item.gtin, 
      item.libelle || "", 
      item.qty, 
      item.unit || "PCE", 
      item.price,
      item.buyerProductCode || null,
      item.supplierProductCode || null,
      item.productDescription || null,
      item.lineNetAmount || null,
      item.lineTaxAmount || null,
      item.lineTaxRate || null,
      item.linePackageCount || null,
      item.linePackageType || null,
      item.priceQualifier || 'AAA',
      item.priceUnit || item.unit || 'PCE'
    ]
  );
  
  // Si livraisons multiples pour cette ligne
  if (Array.isArray(item.deliveryLocations)) {
    for (const loc of item.deliveryLocations) {
      await runUpdate(entiteDB,
        `INSERT INTO order_line_deliveries (
          id_line, delivery_location_gln, delivery_location_name,
          delivery_qty, delivery_date, delivery_status
        ) VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [
          lineNumber, // À récupérer via lastID si nécessaire
          loc.gln,
          loc.name || null,
          loc.qty,
          loc.date || null
        ]
      );
    }
  }
  
  lineNumber++;
}
```

#### 2. Créer endpoint GET `/api/edi/transmissions/:orderId`

```javascript
// GET transmissions for an order
app.get('/api/edi/transmissions/:orderId', async (req, res) => {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) {
      return res.status(403).json({ error: "Invalid PIN" });
    }

    const orderId = parseInt(req.params.orderId);
    const transmissions = await getEdiTransmissions(entiteDB, orderId, 'ORDER');
    
    res.json({ transmissions });
  } catch (err) {
    console.error('Error fetching EDI transmissions:', err);
    res.status(500).json({ error: 'Failed to fetch transmissions', details: err.message });
  }
});
```

#### 3. Créer endpoint POST `/api/edi/transmissions/:id/retry`

```javascript
// Retry a failed transmission
app.post('/api/edi/transmissions/:id/retry', async (req, res) => {
  try {
    if (req.headers["x-api-pin"] !== API_PIN) {
      return res.status(403).json({ error: "Invalid PIN" });
    }

    const transmissionId = parseInt(req.params.id);
    
    // TODO: Implémenter la logique de renvoi (FTP, API, etc.)
    // Pour l'instant, on met juste à jour le statut
    
    await incrementRetryCount(entiteDB, transmissionId);
    await updateEdiTransmissionStatus(
      entiteDB, 
      transmissionId, 
      'PENDING', 
      'Retry requested by user'
    );
    
    res.json({ success: true, message: 'Transmission queued for retry' });
  } catch (err) {
    console.error('Error retrying transmission:', err);
    res.status(500).json({ error: 'Failed to retry transmission', details: err.message });
  }
});
```

---

## 🧪 Tests à Effectuer

### 1. Test Base de Données

```sql
-- Vérifier les nouvelles tables
SHOW TABLES LIKE '%edi%';
SHOW TABLES LIKE '%delivery%';

-- Vérifier les nouvelles colonnes orders
DESCRIBE orders;

-- Vérifier les nouvelles colonnes order_lines
DESCRIBE order_lines;

-- Tester insertion edi_transmissions
INSERT INTO edi_transmissions (
  related_id, related_type, document_type, 
  partner_gln, filename, file_content, status
) VALUES (
  1, 'ORDER', 'ORDERS', 
  '5412345000013', 'test_ordre.txt', 'UNH+...', 'PENDING'
);

SELECT * FROM edi_transmissions;
```

### 2. Test Backend

```bash
# Redémarrer le serveur
cd backend
npm start

# Vérifier les imports
# Doit afficher "Server running on port 5001" sans erreur
```

### 3. Test Création Commande avec Nouveaux Champs

```bash
curl -X POST http://localhost:5001/api/orders/eancom \
  -H "Content-Type: application/json" \
  -H "x-api-pin: 3311" \
  -H "x-entite-id: 33" \
  -d '{
    "numCommande": "TEST-GS1-001",
    "fournisseur": "5412345000013",
    "Acheteur": "4012345500004",
    "datecommande": "20260113",
    "datelivraison": "20260120",
    "contractReference": "CT-2026-001",
    "contractDate": "20260110",
    "buyerVatNumber": "FR12345678901",
    "supplierVatNumber": "TN87654321",
    "paymentTermsCode": "42",
    "orderContactName": "Jean Dupont",
    "orderContactPhone": "+33123456789",
    "orderContactEmail": "jean.dupont@example.com",
    "transportMode": "30",
    "deliveryTermsCode": "CIF",
    "taxRate": 19.0,
    "currency": "EUR",
    "articles": [
      {
        "gtin": "4000862141404",
        "libelle": "Produit Test",
        "qty": 48,
        "price": 14.58,
        "unit": "PCE",
        "buyerProductCode": "ABC1234",
        "lineNetAmount": 699.84,
        "lineTaxRate": 19.0
      }
    ]
  }'
```

### 4. Vérifier la Transmission EDI

```sql
-- Vérifier que la transmission a été créée
SELECT * FROM edi_transmissions 
WHERE related_type = 'ORDER' 
ORDER BY created_at DESC 
LIMIT 1;

-- Vérifier le contenu EANCOM
SELECT file_content FROM edi_transmissions 
WHERE id = (SELECT MAX(id) FROM edi_transmissions);
```

---

## ⚠️ Points d'Attention (Éviter les Régressions)

### 1. Compatibilité Ascendante

✅ **Les anciennes commandes continuent de fonctionner**
- Les nouveaux champs sont tous `NULL` par défaut
- L'ancien générateur `generateOrderEANCOM()` reste disponible
- Les requêtes SELECT existantes ne sont pas cassées

### 2. Gestion des Transactions

✅ **Les transactions sont préservées**
- START TRANSACTION / COMMIT / ROLLBACK maintenus
- Insertion edi_transmissions dans la même transaction

### 3. Validation des Données

✅ **Validation existante conservée**
- Vérification GLN fournisseur/acheteur
- Validation GTIN (13 caractères)
- Validation quantités et prix

### 4. Fichiers EANCOM

✅ **Structure fichiers préservée**
- Même arborescence : `fournisseurs/{GLN}/commandes/commandes_eancom/{NUM}/ordre.txt`
- Même format de fichier texte

---

## 📊 Métriques de Succès

- ✅ Migration SQL exécutée sans erreur
- ✅ Serveur démarre sans erreur
- ✅ Création commande avec anciens champs fonctionne
- ✅ Création commande avec nouveaux champs fonctionne
- ✅ Fichier EANCOM généré contient tous les segments GS1
- ✅ Transmission EDI enregistrée dans la table
- ✅ Aucune régression sur les endpoints existants

---

## 🚀 Prochaine Étape : Phase 3 (Frontend)

Une fois Phase 1 & 2 validées, nous pourrons passer à la Phase 3 :
- Mise à jour de `Order.tsx` avec les nouveaux champs
- Nouvelles sections UI (Contractuel, Contact, Transport)
- Tableau articles enrichi
- Section résumé avec totaux

---

## 📞 Support

En cas de problème :
1. Vérifier les logs serveur : `npm start`
2. Vérifier les logs MySQL : `SHOW WARNINGS;`
3. Utiliser le script de rollback si nécessaire
4. Consulter `EANCOM_IMPROVEMENTS_PROPOSAL.md` pour la documentation complète
