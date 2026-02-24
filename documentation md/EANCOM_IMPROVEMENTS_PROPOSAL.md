# 📋 Proposition d'Améliorations EANCOM GS1 Standard

## 🎯 Objectif
Aligner notre implémentation sur le standard **GS1 EANCOM ORDERS D.01B** pour une compatibilité maximale avec les systèmes EDI internationaux.

---

## 📊 Analyse Comparative

### ✅ Segments Actuellement Implémentés
- `UNH` - En-tête message
- `BGM` - Début du message (numéro commande)
- `DTM` - Dates (commande, livraison)
- `NAD` - Parties (acheteur, fournisseur, livraison)
- `CUX` - Devise
- `LIN` - Lignes produits
- `QTY` - Quantités
- `PRI` - Prix
- `UNS` - Séparateur détail/résumé
- `CNT` - Compteurs
- `UNT` - Fin message

### ❌ Segments Manquants (Standard GS1)

| Segment | Description | Exemple GS1 | Impact Business |
|---------|-------------|-------------|-----------------|
| **PAI** | Instructions de paiement | `PAI+::42'` | Conditions de règlement |
| **ALI** | Conditions additionnelles | `ALI+++136'` | Conditions contractuelles |
| **FTX** | Texte libre | `FTX+ZZZ+1+001::91'` | Notes/instructions |
| **RFF** | Références | `RFF+CT:652744'` (contrat), `RFF+VA:87765432'` (TVA) | Traçabilité |
| **CTA** | Contact | `CTA+OC+:P FORGET'` | Personne à contacter |
| **COM** | Communication | `COM+0044715632478:TE'` | Téléphone/email |
| **TDT** | Transport | `TDT+20++30+31'` | Mode de transport |
| **TOD** | Termes livraison | `TOD+3++CIF:2E:9'` | Incoterms |
| **LOC** | Lieu | `LOC+1+BE-BRU'`, `LOC+7+GLN'` | Livraisons multiples |
| **PIA** | Identification produit | `PIA+1+ABC1234:IN'` | Code interne acheteur |
| **IMD** | Description article | `IMD+C++TU::9'` | Détails produit |
| **MOA** | Montants | `MOA+203:699.84'` | Valorisation ligne |
| **PAC** | Emballage | `PAC+2+:51+CS'` | Logistique |
| **PCI** | Marquage colis | `PCI+14'` | Instructions emballage |
| **TAX** | Taxes | `TAX+7+VAT+++:::17.5+S'` | TVA |

---

## 🗄️ Proposition 1 : Améliorations Base de Données

### 1.1 Nouveaux champs pour `orders`

```sql
-- Références contractuelles
ALTER TABLE orders ADD COLUMN contract_reference VARCHAR(50) COMMENT 'Référence contrat (RFF+CT)';
ALTER TABLE orders ADD COLUMN contract_date DATE COMMENT 'Date du contrat';
ALTER TABLE orders ADD COLUMN price_list_reference VARCHAR(50) COMMENT 'Référence liste de prix (RFF+PL)';
ALTER TABLE orders ADD COLUMN buyer_vat_number VARCHAR(20) COMMENT 'N° TVA acheteur (RFF+VA)';
ALTER TABLE orders ADD COLUMN supplier_vat_number VARCHAR(20) COMMENT 'N° TVA fournisseur (RFF+VA)';

-- Instructions paiement
ALTER TABLE orders ADD COLUMN payment_terms_code VARCHAR(10) COMMENT 'Code conditions paiement (PAI)';
ALTER TABLE orders ADD COLUMN payment_means VARCHAR(50) COMMENT 'Moyen de paiement';

-- Contact
ALTER TABLE orders ADD COLUMN order_contact_name VARCHAR(100) COMMENT 'Nom contact commande (CTA)';
ALTER TABLE orders ADD COLUMN order_contact_phone VARCHAR(20) COMMENT 'Téléphone contact (COM)';
ALTER TABLE orders ADD COLUMN order_contact_email VARCHAR(100) COMMENT 'Email contact (COM)';

-- Transport et livraison
ALTER TABLE orders ADD COLUMN transport_mode VARCHAR(10) COMMENT 'Mode transport (TDT: 30=camion, 10=maritime, 20=rail)';
ALTER TABLE orders ADD COLUMN transport_means VARCHAR(10) COMMENT 'Moyen transport (TDT: 31=camion)';
ALTER TABLE orders ADD COLUMN delivery_terms_code VARCHAR(10) COMMENT 'Incoterms (TOD: CIF, FOB, EXW, etc.)';
ALTER TABLE orders ADD COLUMN delivery_port VARCHAR(100) COMMENT 'Port/lieu livraison (LOC)';

-- Conditions additionnelles
ALTER TABLE orders ADD COLUMN group_conditions_code VARCHAR(10) COMMENT 'Code conditions groupe (ALI)';
ALTER TABLE orders ADD COLUMN free_text TEXT COMMENT 'Texte libre instructions (FTX)';

-- Taux de change
ALTER TABLE orders ADD COLUMN exchange_rate DECIMAL(10,6) COMMENT 'Taux de change (CUX)';
ALTER TABLE orders ADD COLUMN exchange_rate_currency VARCHAR(3) COMMENT 'Devise taux de change';
ALTER TABLE orders ADD COLUMN exchange_rate_period_start DATE COMMENT 'Début période taux';
ALTER TABLE orders ADD COLUMN exchange_rate_period_end DATE COMMENT 'Fin période taux';

-- Totaux et taxes
ALTER TABLE orders ADD COLUMN total_line_amount DECIMAL(12,2) COMMENT 'Montant total lignes HT';
ALTER TABLE orders ADD COLUMN total_tax_amount DECIMAL(12,2) COMMENT 'Montant total TVA';
ALTER TABLE orders ADD COLUMN total_amount_with_tax DECIMAL(12,2) COMMENT 'Montant total TTC';
ALTER TABLE orders ADD COLUMN tax_rate DECIMAL(5,2) COMMENT 'Taux TVA principal (%)';

-- Emballage
ALTER TABLE orders ADD COLUMN package_count INT COMMENT 'Nombre de colis (PAC)';
ALTER TABLE orders ADD COLUMN package_type VARCHAR(10) COMMENT 'Type emballage (CS=carton, PAL=palette)';
ALTER TABLE orders ADD COLUMN package_marking_instructions TEXT COMMENT 'Instructions marquage (PCI)';
```

### 1.2 Nouveaux champs pour `order_lines`

```sql
-- Identification produit
ALTER TABLE order_lines ADD COLUMN buyer_product_code VARCHAR(50) COMMENT 'Code produit acheteur (PIA)';
ALTER TABLE order_lines ADD COLUMN supplier_product_code VARCHAR(50) COMMENT 'Code produit fournisseur (PIA)';
ALTER TABLE order_lines ADD COLUMN product_description TEXT COMMENT 'Description produit (IMD)';

-- Montants ligne
ALTER TABLE order_lines ADD COLUMN line_net_amount DECIMAL(12,2) COMMENT 'Montant net ligne (MOA+203)';
ALTER TABLE order_lines ADD COLUMN line_tax_amount DECIMAL(12,2) COMMENT 'Montant TVA ligne';
ALTER TABLE order_lines ADD COLUMN line_tax_rate DECIMAL(5,2) COMMENT 'Taux TVA ligne (%)';

-- Emballage ligne
ALTER TABLE order_lines ADD COLUMN line_package_count INT COMMENT 'Nombre colis ligne (PAC)';
ALTER TABLE order_lines ADD COLUMN line_package_type VARCHAR(10) COMMENT 'Type emballage ligne';

-- Prix détaillé
ALTER TABLE order_lines ADD COLUMN price_qualifier VARCHAR(10) COMMENT 'Type prix (AAA=net, AAB=brut)';
ALTER TABLE order_lines ADD COLUMN price_unit VARCHAR(10) COMMENT 'Unité prix (KGM, PCE, etc.)';
```

### 1.3 Nouvelle table pour livraisons multiples

```sql
CREATE TABLE IF NOT EXISTS order_line_deliveries (
  id_delivery INT AUTO_INCREMENT PRIMARY KEY,
  id_line INT NOT NULL,
  delivery_location_gln VARCHAR(13) NOT NULL COMMENT 'GLN lieu livraison (LOC+7)',
  delivery_qty INT NOT NULL COMMENT 'Quantité pour ce lieu (QTY+11)',
  delivery_date DATE COMMENT 'Date livraison demandée (DTM+2)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_line) REFERENCES order_lines(id_line) ON DELETE CASCADE,
  INDEX idx_line (id_line),
  INDEX idx_gln (delivery_location_gln)
) COMMENT='Livraisons multiples par ligne de commande';
```

---

## 🎨 Proposition 2 : Améliorations UI (Order.tsx)

### 2.1 Nouvelle section "Informations Contractuelles"

```tsx
{/* Section Références Contractuelles */}
<div className="border rounded-lg p-4 space-y-3">
  <h3 className="font-semibold flex items-center gap-2">
    <FileText className="w-4 h-4" />
    Références Contractuelles
  </h3>
  
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label>Référence Contrat</Label>
      <Input 
        value={contractReference}
        onChange={(e) => setContractReference(e.target.value)}
        placeholder="CT-2024-001"
      />
    </div>
    
    <div>
      <Label>Date Contrat</Label>
      <Input 
        type="date"
        value={contractDate}
        onChange={(e) => setContractDate(e.target.value)}
      />
    </div>
    
    <div>
      <Label>Liste de Prix</Label>
      <Input 
        value={priceListReference}
        onChange={(e) => setPriceListReference(e.target.value)}
        placeholder="AUG93RNG04"
      />
    </div>
    
    <div>
      <Label>N° TVA Fournisseur</Label>
      <Input 
        value={supplierVatNumber}
        onChange={(e) => setSupplierVatNumber(e.target.value)}
        placeholder="56225432"
      />
    </div>
  </div>
</div>
```

### 2.2 Nouvelle section "Contact & Paiement"

```tsx
{/* Section Contact & Paiement */}
<div className="border rounded-lg p-4 space-y-3">
  <h3 className="font-semibold flex items-center gap-2">
    <User className="w-4 h-4" />
    Contact & Conditions de Paiement
  </h3>
  
  <div className="grid grid-cols-3 gap-3">
    <div>
      <Label>Nom Contact</Label>
      <Input 
        value={orderContactName}
        onChange={(e) => setOrderContactName(e.target.value)}
        placeholder="Jean Dupont"
      />
    </div>
    
    <div>
      <Label>Téléphone</Label>
      <Input 
        value={orderContactPhone}
        onChange={(e) => setOrderContactPhone(e.target.value)}
        placeholder="+33 1 23 45 67 89"
      />
    </div>
    
    <div>
      <Label>Email</Label>
      <Input 
        type="email"
        value={orderContactEmail}
        onChange={(e) => setOrderContactEmail(e.target.value)}
        placeholder="contact@example.com"
      />
    </div>
  </div>
  
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label>Conditions de Paiement</Label>
      <Select value={paymentTermsCode} onValueChange={setPaymentTermsCode}>
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="42">Virement bancaire</SelectItem>
          <SelectItem value="10">Espèces</SelectItem>
          <SelectItem value="20">Chèque</SelectItem>
          <SelectItem value="30">Carte bancaire</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</div>
```

### 2.3 Nouvelle section "Transport & Livraison"

```tsx
{/* Section Transport & Livraison */}
<div className="border rounded-lg p-4 space-y-3">
  <h3 className="font-semibold flex items-center gap-2">
    <Truck className="w-4 h-4" />
    Transport & Conditions de Livraison
  </h3>
  
  <div className="grid grid-cols-3 gap-3">
    <div>
      <Label>Mode de Transport</Label>
      <Select value={transportMode} onValueChange={setTransportMode}>
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">Route (Camion)</SelectItem>
          <SelectItem value="10">Maritime</SelectItem>
          <SelectItem value="20">Rail</SelectItem>
          <SelectItem value="40">Aérien</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    <div>
      <Label>Incoterms</Label>
      <Select value={deliveryTermsCode} onValueChange={setDeliveryTermsCode}>
        <SelectTrigger>
          <SelectValue placeholder="Sélectionner..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CIF">CIF - Cost, Insurance and Freight</SelectItem>
          <SelectItem value="FOB">FOB - Free On Board</SelectItem>
          <SelectItem value="EXW">EXW - Ex Works</SelectItem>
          <SelectItem value="DDP">DDP - Delivered Duty Paid</SelectItem>
          <SelectItem value="DAP">DAP - Delivered At Place</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    <div>
      <Label>Port/Lieu de Livraison</Label>
      <Input 
        value={deliveryPort}
        onChange={(e) => setDeliveryPort(e.target.value)}
        placeholder="BE-BRU (Bruxelles)"
      />
    </div>
  </div>
</div>
```

### 2.4 Amélioration section Articles - Ajout champs par ligne

```tsx
{/* Dans le tableau des articles, ajouter colonnes */}
<TableHead>Code Acheteur</TableHead>
<TableHead>Description</TableHead>
<TableHead>Emballage</TableHead>
<TableHead>TVA %</TableHead>

{/* Dans les cellules */}
<TableCell>
  <Input 
    value={item.buyerProductCode || ''}
    onChange={(e) => updateArticle(idx, 'buyerProductCode', e.target.value)}
    placeholder="ABC1234"
    className="w-24"
  />
</TableCell>

<TableCell>
  <Input 
    value={item.productDescription || ''}
    onChange={(e) => updateArticle(idx, 'productDescription', e.target.value)}
    placeholder="Description produit"
  />
</TableCell>

<TableCell>
  <div className="flex gap-1">
    <Input 
      type="number"
      value={item.linePackageCount || ''}
      onChange={(e) => updateArticle(idx, 'linePackageCount', e.target.value)}
      placeholder="2"
      className="w-12"
    />
    <Select 
      value={item.linePackageType || 'CS'}
      onValueChange={(v) => updateArticle(idx, 'linePackageType', v)}
    >
      <SelectTrigger className="w-16">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="CS">Carton</SelectItem>
        <SelectItem value="PAL">Palette</SelectItem>
        <SelectItem value="BOX">Boîte</SelectItem>
      </SelectContent>
    </Select>
  </div>
</TableCell>

<TableCell>
  <Input 
    type="number"
    step="0.1"
    value={item.lineTaxRate || ''}
    onChange={(e) => updateArticle(idx, 'lineTaxRate', e.target.value)}
    placeholder="17.5"
    className="w-16"
  />
</TableCell>
```

### 2.5 Section Résumé avec Totaux

```tsx
{/* Section Totaux */}
<div className="border rounded-lg p-4 bg-gray-50">
  <h3 className="font-semibold mb-3">Résumé de la Commande</h3>
  
  <div className="space-y-2">
    <div className="flex justify-between">
      <span>Total HT:</span>
      <span className="font-semibold">{totalLineAmount.toFixed(2)} {currency}</span>
    </div>
    
    <div className="flex justify-between">
      <span>TVA ({taxRate}%):</span>
      <span className="font-semibold">{totalTaxAmount.toFixed(2)} {currency}</span>
    </div>
    
    {fraisTransport > 0 && (
      <div className="flex justify-between">
        <span>Frais de Transport:</span>
        <span className="font-semibold">{fraisTransport.toFixed(2)} {currency}</span>
      </div>
    )}
    
    <div className="flex justify-between border-t pt-2 text-lg">
      <span className="font-bold">Total TTC:</span>
      <span className="font-bold">{totalAmountWithTax.toFixed(2)} {currency}</span>
    </div>
    
    <div className="flex justify-between text-sm text-gray-600">
      <span>Nombre d'articles:</span>
      <span>{articles.length} ligne(s)</span>
    </div>
    
    <div className="flex justify-between text-sm text-gray-600">
      <span>Nombre de colis:</span>
      <span>{packageCount} colis</span>
    </div>
  </div>
</div>
```

---

## 📝 Proposition 3 : Fichier EANCOM Amélioré

Le fichier `generateOrderEANCOM_enhanced.js` a été créé avec tous les segments GS1 standard.

### Exemple de sortie pour l'exemple GS1 :

```
UNH+MESS001+ORDERS:D:01B:UN:EAN010'
BGM+220+128576+9'
DTM+137:20020830:102'
PAI+::42'
ALI+++136'
FTX+ZZZ+1+001::91'
RFF+CT:652744'
DTM+171:20020825:102'
NAD+BY+5412345000013::9'
RFF+VA:87765432'
CTA+OC+:P FORGET'
COM+0044715632478:TE'
NAD+SU+4012345500004::9'
RFF+VA:56225432'
CUX+2:GBP:9+3:EUR:4+1.67'
DTM+134:2002080120020831:718'
TDT+20++30+31'
TOD+3++CIF:2E:9'
LOC+1+BE-BRU'
LIN+1++4000862141404:SRV'
PIA+1+ABC1234:IN'
IMD+C++TU::9'
QTY+21:48'
MOA+203:699.84'
PRI+AAA:14.58:CT:AAE:1:KGM'
RFF+PL:AUG93RNG04'
DTM+171:20020801:102'
PAC+2+:51+CS'
PCI+14'
LOC+7+3312345502000::9'
QTY+11:24'
DTM+2:20020915:102'
LOC+7+3312345501003::9'
QTY+11:24'
DTM+2:20020913:102'
TAX+7+VAT+++:::17.5+S'
UNS+S'
MOA+79:699.84'
CNT+2:1'
UNT+39+MESS001'
```

---

## 🚀 Plan de Migration

### Phase 1 : Base de Données (1-2 jours)
1. ✅ Créer script SQL avec tous les nouveaux champs
2. ✅ Tester sur environnement de développement
3. ✅ Exécuter migration sur production
4. ✅ Vérifier intégrité des données

### Phase 2 : Backend (2-3 jours)
1. ✅ Intégrer `generateOrderEANCOM_enhanced.js` dans `server.js`
2. ✅ Mettre à jour endpoint POST `/api/orders/eancom`
3. ✅ Ajouter validation pour nouveaux champs
4. ✅ Tester génération EANCOM avec tous segments
5. ✅ Mettre à jour endpoint GET pour retourner nouveaux champs

### Phase 3 : Frontend (3-4 jours)
1. ✅ Ajouter nouveaux états React pour tous les champs
2. ✅ Créer sections UI (Contractuel, Contact, Transport)
3. ✅ Améliorer tableau articles avec nouvelles colonnes
4. ✅ Ajouter section résumé avec calculs automatiques
5. ✅ Tester formulaire complet

### Phase 4 : Tests & Documentation (1-2 jours)
1. ✅ Tests end-to-end avec données GS1 exemple
2. ✅ Validation EANCOM avec parseur externe
3. ✅ Mise à jour documentation utilisateur
4. ✅ Formation équipe

---

## 📚 Références

- **GS1 EANCOM ORDERS D.01B** : Standard officiel
- **Segments EDIFACT** : Documentation UN/EDIFACT
- **Incoterms 2020** : Conditions commerciales internationales
- **ISO 4217** : Codes devises
- **ISO 3166** : Codes pays

---

## ✅ Bénéfices Attendus

1. **Compatibilité** : 100% conforme GS1 standard
2. **Interopérabilité** : Échange avec tous systèmes EDI certifiés
3. **Traçabilité** : Références contractuelles complètes
4. **Logistique** : Gestion multi-livraisons et emballages
5. **Finance** : Calculs TVA et totaux automatiques
6. **International** : Support Incoterms et taux de change

---

## 🎯 Prochaines Étapes

1. **Validation** : Revue de cette proposition avec l'équipe
2. **Priorisation** : Identifier les champs critiques vs optionnels
3. **Planning** : Définir dates de mise en œuvre
4. **Tests** : Préparer jeux de données de test
5. **Déploiement** : Migration progressive par phase
