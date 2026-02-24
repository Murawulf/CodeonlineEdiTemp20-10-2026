import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const GPC_API_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api`;

interface GPCItem {
  code: string;
  libelle: string;
  libelle_en: string;
  libelle_ar: string;
  status: number;
}

interface RayonItem {
  code: string;
  libelle: string;
  libelle_en: string;
  libelle_ar: string;
  status: number;
}

interface FieldConfig {
  description: string;
  type: 'text' | 'numeric' | 'date' | 'boolean' | 'dropdown' | 'multivalue';
  validation: 'OB' | 'OP' | 'OC';
  observation: string;
  values?: string[];
}

interface Section {
  fields: string[];
  subsections?: Record<string, string[]>;
}

interface Sections {
  [sectionName: string]: Section;
}

interface Model {
  sections: Sections;
  fieldRules: Record<string, FieldConfig>;
  libelle: string;
  unite_logistique_fields?: Record<string, Record<string, any>>;
}

interface Permission {
  page_id: number;
  read: number;
  write: number;
  hide: number;
  page_name: string;
}

interface User {
  id_compte: number;
  email: string;
  name: string;
  prenom: string;
  certicode: string | null;
  role: string | null;
  is_suspended: number;
  created_at: string;
  id_entite: number;
  producer_name: string;
  profile_id: number;
  permissions: Permission[];
}

const defaultSections: Sections = {
  "Classification": {
    fields: ['segment', 'family', 'class', 'brick', 'rayon', 'produit_transforme'],
  },
  "Données d'identification": {
    fields: ['gln', 'gtin', 'marque', 'sous_marque', 'libelle_court', 'pays_d_origine'],
  },
  "Données spécifiques du produit": {
    fields: [
      'valeurs_nutritionnelles',
      'quantite_nette',
      'nombre_de_portions',
      'denomination_legale',
      'conditions_de_conservation',
      'etat_de_preparation',
      'mode_d_emploi',
      'mentions_obligatoires_complementaires',
      'argumentaire_produit',
      'allegation_sante',
      'allegation_nutritionnelle',
      'marche_cible',
      'valeurs_nutritionnelles_pour_100g',
      'valeurs_nutritionnelles_a_la_portion',
      'declaration_des_allergenes',
      'duree_de_vie_minimale_a_la_livraison',
      'duree_de_vie_du_produit',
      'libelle_internet',
      'fournisseur',
      'type_de_marque',
      'gpc',
      'produit_halal',
      'produit_consigne',
      'produit_a_decouper',
      'produits_dangereux',
      'produits_alimentaires',
      'produits_saisonniers',
      'produits_bio',
      'emballage_retournable',
      'article_reapprovisionnable',
      'vrac',
    ],
  },
  "Conditionnement & Logistique": {
    fields: [
      'dimensions_hors_emballage',
      'type_d_emballage',
      'date_de_debut_de_disponibilite_commande',
      'mesures_unite_commerciale',
      'unite_consommateur',
    ],
    subsections: {
      "Unité consommateur": ['unite_consommateur'],
    },
  },
  "Données tarifaires": {
    fields: [
      'prix_unitaire',
      'unite_legale',
      'quantite_nette_tarif',
      'denomination_legale_tarif',
      'unite_consommateur_tarif',
      'unite_facturable',
      'unite_de_commande',
      'date_de_debut_de_disponibilite',
      'type_de_taxe',
      'code_nomenclature_douaniere',
    ],
  },
};

const hierarchyOptions = ["PK (Lot Consommateur Homogène)", "AP (Lot Consommateur Hétérogène)", "CA (Colis Homogène)", "DS (Colis Hétérogène)", "PL (Palette Homogène)", "MX (Palette Hétérogène)"];

const hierarchyFields = {
  "PK (Lot Consommateur Homogène)": [
    "gtin_d", "childTradeItem", "quantityofNextLowerLevelTradeItem", "quantityOfCompleteLayersContainedInATradeItem",
    "quantityOfTradeItemsContainedInACompleteLayer", "isTradeItemADespatchUnit", "isTradeItemAnInvoiceUnit",
    "isTradeItemAnOrderableUnit", "isTradeItemAModel", "isTradeItemADivisibleItem", "hasDisplayReadyPackaging",
    "isTradeItemPackedIrregularly", "compositionDepthValue", "compositionWidthValue", "isTradeItemADivisibleItem", "alimentaryProduct",
    "TradeItemDisplayDimensions", "contactGLN", "orderingUnitOfMeasure", "invoicingUnitOfMeasure",
    "packageMarksDietAllergen", "cataloguePriceBasisQuantity", "cataloguePriceBasisUnitOfMeasure",
    "tradeItemWeight", "tradeItemVolume", "packagingMaterial", "stackingFactor", "maxStackingWeight",
    "palletLayerQuantity", "isTradeItemPackedIrregularly", "type_emballage", "palletTypeCode"
  ],
  "AP (Lot Consommateur Hétérogène)": [
    "unite_logistique_ap", "unite_facturable_ap", "unite_commandable_ap", "isTradeItemAModel_ap",
    "isTradeItemADivisibleItem_ap", "hasDisplayReadyPackaging_ap", "isTradeItemPackedIrregularly_ap",
    "compositionDepthValue_ap", "compositionWidthValue_ap", "alimentaryProduct_ap",
    "TradeItemDisplayDimensions_ap", "contactGLN_ap", "orderingUnitOfMeasure_ap", "invoicingUnitOfMeasure_ap",
    "gtin_d_ap", "childTradeItem_ap", "quantityofNextLowerLevelTradeItem_ap", "packageMarksDietAllergen_ap",
    "tradeItemWeight_ap", "tradeItemVolume_ap", "packagingMaterial_ap", "stackingFactor_ap", "type_emballage",
    "palletTypeCode"
  ],
  "CA (Colis Homogène)": [
    "gtin_d_ca", "childTradeItem_ca", "quantityofNextLowerLevelTradeItem_ca", "packagingTypeCode",
    "palletTypeCode", "quantityOfCompleteLayersContainedInATradeItem_ca", "quantityOfTradeItemsContainedInACompleteLayer_ca",
    "isTradeItemAConsumerUnit", "unite_facturable_ca", "unite_commandable_ca", "isTradeItemAFullDisplayStand",
    "hasDisplayReadyPackaging_ca", "isTradeItemPackedIrregularly_ca", "compositionDepthValue_ca",
    "compositionWidthValue_ca", "alimentaryProduct_ca", "contactGLN_ca", "orderingUnitOfMeasure_ca",
    "invoicingUnitOfMeasure_ca", "tradeItemWeight_ca", "tradeItemVolume_ca", "packagingMaterial_ca",
    "maxStackingWeight_ca", "palletLayerQuantity_ca", "type_emballage"
  ],
  "DS (Colis Hétérogène)": [
    "quantityofNextLowerLevelTradeItem_ds", "packagingTypeCode", "palletTypeCode",
    "quantityOfCompleteLayersContainedInATradeItem_ds", "quantityOfTradeItemsContainedInACompleteLayer_ds",
    "unite_facturable_ds", "isTradeItemAFullDisplayStand_ds", "hasDisplayReadyPackaging_ds",
    "isTradeItemPackedIrregularly_ds", "compositionDepthValue_ds", "compositionWidthValue_ds",
    "contactGLN_ds", "orderingUnitOfMeasure_ds", "invoicingUnitOfMeasure_ds", "tradeItemWeight_ds",
    "tradeItemVolume_ds", "packagingMaterial_ds", "maxStackingWeight_ds", "palletLayerQuantity_ds",
    "type_emballage"
  ],
  "PL (Palette Homogène)": [
    "gtin_d_pl", "childTradeItem_pl", "quantityofNextLowerLevelTradeItem_pl",
    "quantityOfCompleteLayersContainedInATradeItem_pl", "quantityOfTradeItemsContainedInACompleteLayer_pl",
    "isTradeItemAnInvoiceUnit_pl", "isTradeItemAnOrderableUnit_pl", "isTradeItemAFullDisplayStand_pl",
    "hasDisplayReadyPackaging_pl", "isTradeItemPackedIrregularly_pl", "compositionDepthValue_pl",
    "compositionWidthValue_pl", "contactGLN_pl", "orderingUnitOfMeasure_pl", "invoicingUnitOfMeasure_pl",
    "palletTypeCode", "palletLayerQuantity_pl", "tradeItemWeight_pl", "tradeItemVolume_pl",
    "packagingMaterial_pl", "maxStackingWeight_pl", "stackingFactor_pl", "palletDimensions_pl",
    "type_emballage"
  ],
  "MX (Palette Hétérogène)": [
    "gtin_d_mx", "childTradeItem1", "quantityofNextLowerLevelTradeItem1", "childTradeItem2",
    "quantityofNextLowerLevelTradeItem2", "childTradeItem3", "quantityofNextLowerLevelTradeItem3",
    "childTradeItem4", "quantityofNextLowerLevelTradeItem4", "quantityOfCompleteLayersContainedInATradeItem_mx",
    "quantityOfTradeItemsContainedInACompleteLayer_mx", "isTradeItemAnInvoiceUnit_mx",
    "isTradeItemAFullDisplayStand_mx", "hasDisplayReadyPackaging_mx", "isTradeItemPackedIrregularly_mx",
    "compositionDepthValue_mx", "compositionWidthValue_mx", "contactGLN_mx", "orderingUnitOfMeasure_mx",
    "invoicingUnitOfMeasure_mx", "palletTypeCode", "palletLayerQuantity_mx", "tradeItemWeight_mx",
    "tradeItemVolume_mx", "packagingMaterial_mx", "maxStackingWeight_mx", "stackingFactor_mx",
    "palletDimensions_mx", "type_emballage"
  ]
};

const hierarchyFieldConfigs: Record<string, FieldConfig> = {
  gtin_d: { description: 'GTIN', type: 'numeric', validation: 'OP', observation: '' },
  gtin_d_ap: { description: 'GTIN (AP)', type: 'numeric', validation: 'OP', observation: '' },
  gtin_d_ca: { description: 'GTIN (CA)', type: 'numeric', validation: 'OP', observation: '' },
  gtin_d_pl: { description: 'GTIN (PL)', type: 'numeric', validation: 'OP', observation: '' },
  gtin_d_mx: { description: 'GTIN (MX)', type: 'numeric', validation: 'OP', observation: '' },
  childTradeItem: { description: 'Child Trade Item', type: 'text', validation: 'OP', observation: '' },
  childTradeItem_ap: { description: 'Child Trade Item (AP)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem_ca: { description: 'Child Trade Item (CA)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem_pl: { description: 'Child Trade Item (PL)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem1: { description: 'Child Trade Item 1 (MX)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem2: { description: 'Child Trade Item 2 (MX)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem3: { description: 'Child Trade Item 3 (MX)', type: 'text', validation: 'OP', observation: '' },
  childTradeItem4: { description: 'Child Trade Item 4 (MX)', type: 'text', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem: { description: 'Quantity of Next Lower Level Trade Item', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem_ap: { description: 'Quantity of Next Lower Level Trade Item (AP)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem_ca: { description: 'Quantity of Next Lower Level Trade Item (CA)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem_pl: { description: 'Quantity of Next Lower Level Trade Item (PL)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem1: { description: 'Quantity of Next Lower Level Trade Item 1 (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem2: { description: 'Quantity of Next Lower Level Trade Item 2 (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem3: { description: 'Quantity of Next Lower Level Trade Item 3 (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem4: { description: 'Quantity of Next Lower Level Trade Item 4 (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityofNextLowerLevelTradeItem_ds: { description: 'Quantity of Next Lower Level Trade Item (DS)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfCompleteLayersContainedInATradeItem: { description: 'Quantity of Complete Layers', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfCompleteLayersContainedInATradeItem_ca: { description: 'Quantity of Complete Layers (CA)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfCompleteLayersContainedInATradeItem_pl: { description: 'Quantity of Complete Layers (PL)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfCompleteLayersContainedInATradeItem_mx: { description: 'Quantity of Complete Layers (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfCompleteLayersContainedInATradeItem_ds: { description: 'Quantity of Complete Layers (DS)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfTradeItemsContainedInACompleteLayer: { description: 'Quantity of Trade Items in a Layer', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfTradeItemsContainedInACompleteLayer_ca: { description: 'Quantity of Trade Items in a Layer (CA)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfTradeItemsContainedInACompleteLayer_pl: { description: 'Quantity of Trade Items in a Layer (PL)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfTradeItemsContainedInACompleteLayer_mx: { description: 'Quantity of Trade Items in a Layer (MX)', type: 'numeric', validation: 'OP', observation: '' },
  quantityOfTradeItemsContainedInACompleteLayer_ds: { description: 'Quantity of Trade Items in a Layer (DS)', type: 'numeric', validation: 'OP', observation: '' },
  isTradeItemADespatchUnit: { description: 'Is Trade Item a Despatch Unit', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAnInvoiceUnit: { description: 'Is Trade Item an Invoice Unit', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAnInvoiceUnit_pl: { description: 'Is Trade Item an Invoice Unit (PL)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAnInvoiceUnit_mx: { description: 'Is Trade Item an Invoice Unit (MX)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAnOrderableUnit: { description: 'Is Trade Item an Orderable Unit', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAnOrderableUnit_pl: { description: 'Is Trade Item an Orderable Unit (PL)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAModel: { description: 'Is Trade Item a Model', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAModel_ap: { description: 'Is Trade Item a Model (AP)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemADivisibleItem: { description: 'Is Trade Item a Divisible Item', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemADivisibleItem_ap: { description: 'Is Trade Item a Divisible Item (AP)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAConsumerUnit: { description: 'Is Trade Item a Consumer Unit', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAFullDisplayStand: { description: 'Is Trade Item a Full Display Stand', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAFullDisplayStand_pl: { description: 'Is Trade Item a Full Display Stand (PL)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAFullDisplayStand_mx: { description: 'Is Trade Item a Full Display Stand (MX)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemAFullDisplayStand_ds: { description: 'Is Trade Item a Full Display Stand (DS)', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging: { description: 'Has Display Ready Packaging', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging_ap: { description: 'Has Display Ready Packaging (AP)', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging_ca: { description: 'Has Display Ready Packaging (CA)', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging_pl: { description: 'Has Display Ready Packaging (PL)', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging_mx: { description: 'Has Display Ready Packaging (MX)', type: 'boolean', validation: 'OP', observation: '' },
  hasDisplayReadyPackaging_ds: { description: 'Has Display Ready Packaging (DS)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly: { description: 'Is Trade Item Packed Irregularly', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly_ap: { description: 'Is Trade Item Packed Irregularly (AP)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly_ca: { description: 'Is Trade Item Packed Irregularly (CA)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly_pl: { description: 'Is Trade Item Packed Irregularly (PL)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly_mx: { description: 'Is Trade Item Packed Irregularly (MX)', type: 'boolean', validation: 'OP', observation: '' },
  isTradeItemPackedIrregularly_ds: { description: 'Is Trade Item Packed Irregularly (DS)', type: 'boolean', validation: 'OP', observation: '' },
  compositionDepthValue: { description: 'Composition Depth Value', type: 'numeric', validation: 'OP', observation: '' },
  compositionDepthValue_ap: { description: 'Composition Depth Value (AP)', type: 'numeric', validation: 'OP', observation: '' },
  compositionDepthValue_ca: { description: 'Composition Depth Value (CA)', type: 'numeric', validation: 'OP', observation: '' },
  compositionDepthValue_pl: { description: 'Composition Depth Value (PL)', type: 'numeric', validation: 'OP', observation: '' },
  compositionDepthValue_mx: { description: 'Composition Depth Value (MX)', type: 'numeric', validation: 'OP', observation: '' },
  compositionDepthValue_ds: { description: 'Composition Depth Value (DS)', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue: { description: 'Composition Width Value', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue_ap: { description: 'Composition Width Value (AP)', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue_ca: { description: 'Composition Width Value (CA)', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue_pl: { description: 'Composition Width Value (PL)', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue_mx: { description: 'Composition Width Value (MX)', type: 'numeric', validation: 'OP', observation: '' },
  compositionWidthValue_ds: { description: 'Composition Width Value (DS)', type: 'numeric', validation: 'OP', observation: '' },
  alimentaryProduct: { description: 'Alimentary Product', type: 'boolean', validation: 'OP', observation: '' },
  alimentaryProduct_ap: { description: 'Alimentary Product (AP)', type: 'boolean', validation: 'OP', observation: '' },
  alimentaryProduct_ca: { description: 'Alimentary Product (CA)', type: 'boolean', validation: 'OP', observation: '' },
  TradeItemDisplayDimensions: { description: 'Trade Item Display Dimensions', type: 'text', validation: 'OP', observation: '' },
  TradeItemDisplayDimensions_ap: { description: 'Trade Item Display Dimensions (AP)', type: 'text', validation: 'OP', observation: '' },
  contactGLN: { description: 'Contact GLN', type: 'numeric', validation: 'OP', observation: '' },
  contactGLN_ap: { description: 'Contact GLN (AP)', type: 'numeric', validation: 'OP', observation: '' },
  contactGLN_ca: { description: 'Contact GLN (CA)', type: 'numeric', validation: 'OP', observation: '' },
  contactGLN_pl: { description: 'Contact GLN (PL)', type: 'numeric', validation: 'OP', observation: '' },
  contactGLN_mx: { description: 'Contact GLN (MX)', type: 'numeric', validation: 'OP', observation: '' },
  contactGLN_ds: { description: 'Contact GLN (DS)', type: 'numeric', validation: 'OP', observation: '' },
  orderingUnitOfMeasure: { description: 'Ordering Unit of Measure', type: 'text', validation: 'OP', observation: '' },
  orderingUnitOfMeasure_ap: { description: 'Ordering Unit of Measure (AP)', type: 'text', validation: 'OP', observation: '' },
  orderingUnitOfMeasure_ca: { description: 'Ordering Unit of Measure (CA)', type: 'text', validation: 'OP', observation: '' },
  orderingUnitOfMeasure_pl: { description: 'Ordering Unit of Measure (PL)', type: 'text', validation: 'OP', observation: '' },
  orderingUnitOfMeasure_mx: { description: 'Ordering Unit of Measure (MX)', type: 'text', validation: 'OP', observation: '' },
  orderingUnitOfMeasure_ds: { description: 'Ordering Unit of Measure (DS)', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure: { description: 'Invoicing Unit of Measure', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure_ap: { description: 'Invoicing Unit of Measure (AP)', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure_ca: { description: 'Invoicing Unit of Measure (CA)', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure_pl: { description: 'Invoicing Unit of Measure (PL)', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure_mx: { description: 'Invoicing Unit of Measure (MX)', type: 'text', validation: 'OP', observation: '' },
  invoicingUnitOfMeasure_ds: { description: 'Invoicing Unit of Measure (DS)', type: 'text', validation: 'OP', observation: '' },
  packageMarksDietAllergen: { description: 'Package Marks Diet Allergen', type: 'text', validation: 'OP', observation: '' },
  packageMarksDietAllergen_ap: { description: 'Package Marks Diet Allergen (AP)', type: 'text', validation: 'OP', observation: '' },
  cataloguePriceBasisQuantity: { description: 'Catalogue Price Basis Quantity', type: 'numeric', validation: 'OP', observation: '' },
  cataloguePriceBasisUnitOfMeasure: { description: 'Catalogue Price Basis Unit of Measure', type: 'text', validation: 'OP', observation: '' },
  tradeItemWeight: { description: 'Trade Item Weight', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemWeight_ap: { description: 'Trade Item Weight (AP)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemWeight_ca: { description: 'Trade Item Weight (CA)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemWeight_pl: { description: 'Trade Item Weight (PL)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemWeight_mx: { description: 'Trade Item Weight (MX)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemWeight_ds: { description: 'Trade Item Weight (DS)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume: { description: 'Trade Item Volume', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume_ap: { description: 'Trade Item Volume (AP)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume_ca: { description: 'Trade Item Volume (CA)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume_pl: { description: 'Trade Item Volume (PL)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume_mx: { description: 'Trade Item Volume (MX)', type: 'numeric', validation: 'OP', observation: '' },
  tradeItemVolume_ds: { description: 'Trade Item Volume (DS)', type: 'numeric', validation: 'OP', observation: '' },
  packagingMaterial: { description: 'Packaging Material', type: 'text', validation: 'OP', observation: '' },
  packagingMaterial_ap: { description: 'Packaging Material (AP)', type: 'text', validation: 'OP', observation: '' },
  packagingMaterial_ca: { description: 'Packaging Material (CA)', type: 'text', validation: 'OP', observation: '' },
  packagingMaterial_pl: { description: 'Packaging Material (PL)', type: 'text', validation: 'OP', observation: '' },
  packagingMaterial_mx: { description: 'Packaging Material (MX)', type: 'text', validation: 'OP', observation: '' },
  packagingMaterial_ds: { description: 'Packaging Material (DS)', type: 'text', validation: 'OP', observation: '' },
  stackingFactor: { description: 'Stacking Factor', type: 'numeric', validation: 'OP', observation: '' },
  stackingFactor_ap: { description: 'Stacking Factor (AP)', type: 'numeric', validation: 'OP', observation: '' },
  stackingFactor_pl: { description: 'Stacking Factor (PL)', type: 'numeric', validation: 'OP', observation: '' },
  stackingFactor_mx: { description: 'Stacking Factor (MX)', type: 'numeric', validation: 'OP', observation: '' },
  maxStackingWeight: { description: 'Max Stacking Weight', type: 'numeric', validation: 'OP', observation: '' },
  maxStackingWeight_ca: { description: 'Max Stacking Weight (CA)', type: 'numeric', validation: 'OP', observation: '' },
  maxStackingWeight_pl: { description: 'Max Stacking Weight (PL)', type: 'numeric', validation: 'OP', observation: '' },
  maxStackingWeight_mx: { description: 'Max Stacking Weight (MX)', type: 'numeric', validation: 'OP', observation: '' },
  maxStackingWeight_ds: { description: 'Max Stacking Weight (DS)', type: 'numeric', validation: 'OP', observation: '' },
  palletLayerQuantity: { description: 'Pallet Layer Quantity', type: 'numeric', validation: 'OP', observation: '' },
  palletLayerQuantity_ca: { description: 'Pallet Layer Quantity (CA)', type: 'numeric', validation: 'OP', observation: '' },
  palletLayerQuantity_pl: { description: 'Pallet Layer Quantity (PL)', type: 'numeric', validation: 'OP', observation: '' },
  palletLayerQuantity_mx: { description: 'Pallet Layer Quantity (MX)', type: 'numeric', validation: 'OP', observation: '' },
  palletLayerQuantity_ds: { description: 'Pallet Layer Quantity (DS)', type: 'numeric', validation: 'OP', observation: '' },
  palletTypeCode: { description: 'Pallet Type Code', type: 'text', validation: 'OP', observation: '' },
  packagingTypeCode: { description: 'Packaging Type Code', type: 'text', validation: 'OP', observation: '' },
  palletDimensions_pl: { description: 'Pallet Dimensions (PL)', type: 'text', validation: 'OP', observation: '' },
  palletDimensions_mx: { description: 'Pallet Dimensions (MX)', type: 'text', validation: 'OP', observation: '' },
  type_emballage: { description: 'Type d\'emballage', type: 'dropdown', values: [], validation: 'OP', observation: '' },
  unite_logistique_ap: { description: 'Unité logistique (AP)', type: 'text', validation: 'OP', observation: '' },
  unite_facturable_ap: { description: 'Unité facturable (AP)', type: 'text', validation: 'OP', observation: '' },
  unite_commandable_ap: { description: 'Unité commandable (AP)', type: 'text', validation: 'OP', observation: '' },
  unite_facturable_ca: { description: 'Unité facturable (CA)', type: 'text', validation: 'OP', observation: '' },
  unite_commandable_ca: { description: 'Unité commandable (CA)', type: 'text', validation: 'OP', observation: '' },
  unite_facturable_ds: { description: 'Unité facturable (DS)', type: 'text', validation: 'OP', observation: '' },
};

const defaultFieldRules: Record<string, FieldConfig> = {
  segment: { description: 'Segment', type: 'text', validation: 'OB', observation: '' },
  family: { description: 'Famille', type: 'text', validation: 'OB', observation: '' },
  class: { description: 'Classe', type: 'text', validation: 'OB', observation: '' },
  brick: { description: 'Brick', type: 'text', validation: 'OB', observation: '' },
  rayon: { description: 'Rayon', type: 'text', validation: 'OB', observation: '' },
  produit_transforme: { description: 'Produit transformé', type: 'dropdown', values: ['Oui', 'Non'], validation: 'OB', observation: '' },
  gln: { description: 'GLN', type: 'numeric', validation: 'OB', observation: '' },
  gtin: { description: 'GTIN', type: 'numeric', validation: 'OB', observation: '' },
  marque: { description: 'Marque', type: 'text', validation: 'OB', observation: '' },
  sous_marque: { description: 'Sous-marque', type: 'text', validation: 'OB', observation: '' },
  libelle_court: { description: 'Libellé court', type: 'text', validation: 'OP', observation: '' },
  pays_d_origine: { description: 'Pays d\'origine', type: 'dropdown', values: [], validation: 'OC', observation: '' },
  valeurs_nutritionnelles: { description: 'Valeurs nutritionnelles', type: 'text', validation: 'OP', observation: '' },
  quantite_nette: { description: 'Quantité nette', type: 'numeric', validation: 'OP', observation: '' },
  nombre_de_portions: { description: 'Nombre de portions', type: 'numeric', validation: 'OP', observation: '' },
  denomination_legale: { description: 'Dénomination légale', type: 'text', validation: 'OP', observation: '' },
  conditions_de_conservation: { description: 'Conditions de conservation', type: 'text', validation: 'OP', observation: '' },
  etat_de_preparation: { description: 'État de préparation', type: 'text', validation: 'OP', observation: '' },
  mode_d_emploi: { description: 'Mode d\'emploi', type: 'text', validation: 'OP', observation: '' },
  mentions_obligatoires_complementaires: { description: 'Mentions obligatoires complémentaires', type: 'text', validation: 'OP', observation: '' },
  argumentaire_produit: { description: 'Argumentaire produit', type: 'text', validation: 'OP', observation: '' },
  allegation_sante: { description: 'Allégation santé', type: 'text', validation: 'OP', observation: '' },
  allegation_nutritionnelle: { description: 'Allégation nutritionnelle', type: 'text', validation: 'OP', observation: '' },
  marche_cible: { description: 'Marché cible', type: 'text', validation: 'OP', observation: '' },
  valeurs_nutritionnelles_pour_100g: { description: 'Valeurs nutritionnelles pour 100g', type: 'text', validation: 'OP', observation: '' },
  valeurs_nutritionnelles_a_la_portion: { description: 'Valeurs nutritionnelles à la portion', type: 'text', validation: 'OP', observation: '' },
  declaration_des_allergenes: { description: 'Déclaration des allergènes', type: 'multivalue', validation: 'OP', observation: '' },
  duree_de_vie_minimale_a_la_livraison: { description: 'Durée de vie minimale à la livraison', type: 'text', validation: 'OB', observation: '' },
  duree_de_vie_du_produit: { description: 'Durée de vie du produit', type: 'text', validation: 'OB', observation: '' },
  libelle_internet: { description: 'Libellé internet', type: 'text', validation: 'OB', observation: '' },
  fournisseur: { description: 'Fournisseur', type: 'text', validation: 'OP', observation: '' },
  type_de_marque: { description: 'Type de marque', type: 'text', validation: 'OB', observation: '' },
  gpc: { description: 'GPC', type: 'text', validation: 'OP', observation: '' },
  produit_halal: { description: 'Produit halal', type: 'boolean', validation: 'OP', observation: '' },
  produit_consigne: { description: 'Produit consigné', type: 'boolean', validation: 'OP', observation: '' },
  produit_a_decouper: { description: 'Produit à découper', type: 'boolean', validation: 'OP', observation: '' },
  produits_dangereux: { description: 'Produits dangereux', type: 'boolean', validation: 'OP', observation: '' },
  produits_alimentaires: { description: 'Produits alimentaires', type: 'boolean', validation: 'OP', observation: '' },
  produits_saisonniers: { description: 'Produits saisonniers', type: 'boolean', validation: 'OP', observation: '' },
  produits_bio: { description: 'Produits bio', type: 'boolean', validation: 'OP', observation: '' },
  emballage_retournable: { description: 'Emballage retournable', type: 'boolean', validation: 'OP', observation: '' },
  article_reapprovisionnable: { description: 'Article réapprovisionnable', type: 'boolean', validation: 'OP', observation: '' },
  vrac: { description: 'Vrac', type: 'boolean', validation: 'OP', observation: '' },
  dimensions_hors_emballage: { description: 'Dimensions hors emballage', type: 'text', validation: 'OP', observation: '' },
  type_d_emballage: { description: 'Type d\'emballage', type: 'dropdown', values: [], validation: 'OP', observation: '' },
  date_de_debut_de_disponibilite_commande: { description: 'Date de début de disponibilité commande', type: 'date', validation: 'OP', observation: '' },
  mesures_unite_commerciale: { description: 'Mesures unité commerciale', type: 'text', validation: 'OP', observation: '' },
  unite_consommateur: { description: 'Unité consommateur', type: 'dropdown', values: hierarchyOptions, validation: 'OP', observation: '' },
  prix_unitaire: { description: 'Prix unitaire', type: 'numeric', validation: 'OP', observation: '' },
  unite_legale: { description: 'Unité légale', type: 'text', validation: 'OP', observation: '' },
  quantite_nette_tarif: { description: 'Quantité nette', type: 'numeric', validation: 'OP', observation: '' },
  denomination_legale_tarif: { description: 'Dénomination légale', type: 'text', validation: 'OP', observation: '' },
  unite_consommateur_tarif: { description: 'Unité consommateur', type: 'text', validation: 'OP', observation: '' },
  unite_facturable: { description: 'Unité facturable', type: 'text', validation: 'OP', observation: '' },
  unite_de_commande: { description: 'Unité de commande', type: 'text', validation: 'OP', observation: '' },
  date_de_debut_de_disponibilite: { description: 'Date de début de disponibilité', type: 'date', validation: 'OP', observation: '' },
  type_de_taxe: { description: 'Type de taxe', type: 'text', validation: 'OP', observation: '' },
  code_nomenclature_douaniere: { description: 'Code nomenclature douanière', type: 'text', validation: 'OP', observation: '' },
};

const defaultModel: Model = {
  sections: defaultSections,
  fieldRules: defaultFieldRules,
  libelle: '',
  unite_logistique_fields: {},
};

const sectionColors: Record<string, string> = {
  "Classification": 'bg-green-50 text-green-800 focus:ring-green-500 border-green-300',
  "Données d'identification": 'bg-blue-50 text-blue-800 focus:ring-blue-500 border-blue-300',
  "Données spécifiques du produit": 'bg-purple-50 text-purple-800 focus:ring-purple-500 border-purple-300',
  "Conditionnement & Logistique": 'bg-orange-50 text-orange-800 focus:ring-orange-500 border-orange-300',
  "Données tarifaires": 'bg-red-50 text-red-800 focus:ring-red-500 border-red-300',
};

const toastConfig = {
  position: "top-right",
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

const fallbackSegments: GPCItem[] = [
  { code: "1", libelle: "Nourriture/Boisson", libelle_en: "Food/Beverage", libelle_ar: "المأكولات والمشروبات", status: 0 },
  { code: "2", libelle: "Produits d'Entretien/Nettoyage", libelle_en: "Cleaning/Maintenance Products", libelle_ar: "الـتـنـظيف والصيانة", status: 0 },
  { code: "3", libelle: "Beauté/Soin Personnel/Hygiène", libelle_en: "Beauty/Personal Care/Hygiene", libelle_ar: "العناية الشخصية بالنظافة", status: 0 },
];

const Gpc: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('secteur');
  const [segments, setSegments] = useState<GPCItem[]>([]);
  const [familles, setFamilles] = useState<GPCItem[]>([]);
  const [classes, setClasses] = useState<GPCItem[]>([]);
  const [bricks, setBricks] = useState<GPCItem[]>([]);
  const [rayons, setRayons] = useState<RayonItem[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [selectedFamille, setSelectedFamille] = useState<string>('');
  const [selectedClasse, setSelectedClasse] = useState<string>('');
  const [selectedBrick, setSelectedBrick] = useState<string>('');
  const [allGpcSegment, setAllGpcSegment] = useState<string>('');
  const [allGpcFamille, setAllGpcFamille] = useState<string>('');
  const [allGpcClasse, setAllGpcClasse] = useState<string>('');
  const [allGpcBrick, setAllGpcBrick] = useState<string>('');
  const [allGpcRayon, setAllGpcRayon] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editItem, setEditItem] = useState<GPCItem | null>(null);
  const [editType, setEditType] = useState<string>('');
  const [currentModel, setCurrentModel] = useState<Model>(defaultModel);
  const [currentRayonCode, setCurrentRayonCode] = useState<string>('');
  const [sectionOpenStates, setSectionOpenStates] = useState<Record<string, boolean>>({});
  const [subsectionOpenStates, setSubsectionOpenStates] = useState<Record<string, boolean>>({});
  const [selectedUniteConsommateur, setSelectedUniteConsommateur] = useState<string[]>([]);
  const [tabs, setTabs] = useState<string[]>(['secteur', 'famille', 'classe', 'catégorie', 'rayon', 'all_gpc']);
  const [modelExists, setModelExists] = useState<Record<string, boolean>>({});
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState<boolean>(false);

  // Check write permission for "Produits/Generateur Modele" page (page_id: 5) on mount
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user: User = JSON.parse(userData);
        const generatorPermission = user.permissions.find(p => p.page_id === 5);
        setCanWrite(generatorPermission ? generatorPermission.write === 1 : false);
      } catch (error) {
        console.error('Error parsing user data from localStorage:', error);
        setCanWrite(false);
      }
    } else {
      setCanWrite(false);
    }
  }, []);

  useEffect(() => {
    if (currentModel.sections) {
      const initialSectionStates = Object.keys(currentModel.sections).reduce((acc, sectionName) => {
        acc[sectionName] = false;
        return acc;
      }, {} as Record<string, boolean>);
      setSectionOpenStates(initialSectionStates);

      const initialSubsectionStates = Object.keys(currentModel.sections).reduce((acc, sectionName) => {
        const section = currentModel.sections[sectionName];
        if (section.subsections) {
          Object.keys(section.subsections).forEach(subsection => {
            acc[`${sectionName}-${subsection}`] = selectedUniteConsommateur.includes(subsection);
          });
        }
        return acc;
      }, {} as Record<string, boolean>);
      setSubsectionOpenStates(initialSubsectionStates);
    }
  }, [currentModel.sections, selectedUniteConsommateur]);

  const toggleSection = (sectionName: string) => {
    setSectionOpenStates(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  const toggleSubsection = (sectionName: string, subsectionName: string) => {
    setSubsectionOpenStates(prev => ({
      ...prev,
      [`${sectionName}-${subsectionName}`]: !prev[`${sectionName}-${subsectionName}`],
    }));
  };

  const openEditModal = (item: GPCItem, type: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    setEditItem(item);
    setEditType(type);
    setIsEditing(true);
  };

  const closeEditModal = () => {
    setIsEditing(false);
    setEditItem(null);
    setEditType('');
  };

  const saveEdit = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    if (!editItem || !editType) return;

    const updatedItem = { ...editItem };
    const updateUrl = `${GPC_API_BASE}/update-${editType}`;
    let payload = {};
    switch (editType) {
      case 'segment':
        payload = {
          codeSegment: updatedItem.code,
          libelleSegment: updatedItem.libelle,
          libelleSegment_e: updatedItem.libelle_en,
          libelleSegment_a: updatedItem.libelle_ar,
        };
        break;
      case 'famille':
        payload = {
          codeFamille: updatedItem.code,
          libelleFamille: updatedItem.libelle,
          libelleFamille_en: updatedItem.libelle_en,
          libelleFamille_ar: updatedItem.libelle_ar,
        };
        break;
      case 'classe':
        payload = {
          codeClasse: updatedItem.code,
          libelleClasse: updatedItem.libelle,
          libelleClasse_en: updatedItem.libelle_en,
          libelleClasse_ar: updatedItem.libelle_ar,
        };
        break;
      case 'brick':
        payload = {
          codeBrique: updatedItem.code,
          libelleBrique: updatedItem.libelle,
          libelleBrique_en: updatedItem.libelle_en,
          libelleBrique_ar: updatedItem.libelle_ar,
        };
        break;
      default:
        return;
    }

    try {
      await axios.post(updateUrl, payload);
      toast.success(`${editType} mis à jour avec succès`, toastConfig);

      switch (editType) {
        case 'segment':
          setSegments(segments.map(s => s.code === updatedItem.code ? updatedItem : s));
          break;
        case 'famille':
          setFamilles(familles.map(f => f.code === updatedItem.code ? updatedItem : f));
          break;
        case 'classe':
          setClasses(classes.map(c => c.code === updatedItem.code ? updatedItem : c));
          break;
        case 'brick':
          setBricks(bricks.map(b => b.code === updatedItem.code ? updatedItem : b));
          setRayons(rayons.map(r => r.code === updatedItem.code ? updatedItem : r));
          break;
      }
      closeEditModal();
    } catch (err: any) {
      console.error(`Error updating ${editType}:`, {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      toast.error(`Échec de la mise à jour du ${editType}: ${err.response?.data?.error || err.message}`, toastConfig);
    }
  };

  useEffect(() => {
    const fetchSegments = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${GPC_API_BASE}/segments`);
        setSegments(response.data.length ? response.data : fallbackSegments);
      } catch (err) {
        setError('Échec de la récupération des segments');
        console.error('Segment fetch error:', err);
        toast.error('Échec de la récupération des segments', toastConfig);
        setSegments(fallbackSegments);
      } finally {
        setLoading(false);
      }
    };
    fetchSegments();
  }, []);

  useEffect(() => {
    const fetchFamilles = async () => {
      setFamilles([]);
      setClasses([]);
      setBricks([]);
      setRayons([]);
      setSelectedFamille('');
      setSelectedClasse('');
      setSelectedBrick('');
      if (selectedSegment) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/familles?codeSegment=${selectedSegment}`);
          setFamilles(response.data);
        } catch (err) {
          setError('Échec de la récupération des familles');
          console.error('Famille fetch error:', err);
          toast.error('Échec de la récupération des familles', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchFamilles();
  }, [selectedSegment]);

  useEffect(() => {
    const fetchClasses = async () => {
      setClasses([]);
      setBricks([]);
      setRayons([]);
      setSelectedClasse('');
      setSelectedBrick('');
      if (selectedFamille) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/classes?codeFamille=${selectedFamille}`);
          setClasses(response.data);
        } catch (err) {
          setError('Échec de la récupération des classes');
          console.error('Classe fetch error:', err);
          toast.error('Échec de la récupération des classes', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchClasses();
  }, [selectedFamille]);

  useEffect(() => {
    const fetchBricks = async () => {
      setBricks([]);
      setRayons([]);
      setSelectedBrick('');
      if (selectedClasse) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/bricks?codeClasse=${selectedClasse}`);
          setBricks(response.data);
          setRayons(response.data.map((brick: GPCItem) => ({
            code: brick.code,
            libelle: brick.libelle,
            libelle_en: brick.libelle_en,
            libelle_ar: brick.libelle_ar,
            status: brick.status,
          })));
        } catch (err) {
          setError('Échec de la récupération des bricks');
          console.error('Brick fetch error:', err);
          toast.error('Échec de la récupération des bricks', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchBricks();
  }, [selectedClasse]);

  useEffect(() => {
    const fetchAllGpcFamilles = async () => {
      setAllGpcFamille('');
      setAllGpcClasse('');
      setAllGpcBrick('');
      setAllGpcRayon('');
      setFamilles([]);
      setClasses([]);
      setBricks([]);
      setRayons([]);
      if (allGpcSegment) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/familles?codeSegment=${allGpcSegment}`);
          setFamilles(response.data);
        } catch (err) {
          setError('Échec de la récupération des familles GPC');
          console.error('All GPC famille fetch error:', err);
          toast.error('Échec de la récupération des familles GPC', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAllGpcFamilles();
  }, [allGpcSegment]);

  useEffect(() => {
    const fetchAllGpcClasses = async () => {
      setAllGpcClasse('');
      setAllGpcBrick('');
      setAllGpcRayon('');
      setClasses([]);
      setBricks([]);
      setRayons([]);
      if (allGpcFamille) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/classes?codeFamille=${allGpcFamille}`);
          setClasses(response.data);
        } catch (err) {
          setError('Échec de la récupération des classes GPC');
          console.error('All GPC classe fetch error:', err);
          toast.error('Échec de la récupération des classes GPC', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAllGpcClasses();
  }, [allGpcFamille]);

  useEffect(() => {
    const fetchAllGpcBricks = async () => {
      setAllGpcBrick('');
      setAllGpcRayon('');
      setBricks([]);
      setRayons([]);
      if (allGpcClasse) {
        setLoading(true);
        try {
          const response = await axios.get(`${GPC_API_BASE}/bricks?codeClasse=${allGpcClasse}`);
          setBricks(response.data);
          setRayons(response.data.map((brick: GPCItem) => ({
            code: brick.code,
            libelle: brick.libelle,
            libelle_en: brick.libelle_en,
            libelle_ar: brick.libelle_ar,
            status: brick.status,
          })));
        } catch (err) {
          setError('Échec de la récupération des bricks GPC');
          console.error('All GPC brick fetch error:', err);
          toast.error('Échec de la récupération des bricks GPC', toastConfig);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAllGpcBricks();
  }, [allGpcClasse]);

  useEffect(() => {
    if (activeTab === 'all_gpc') {
      setAllGpcSegment(selectedSegment);
      setAllGpcFamille(selectedFamille);
      setAllGpcClasse(selectedClasse);
      setAllGpcRayon(selectedBrick);
    }
  }, [activeTab, selectedSegment, selectedFamille, selectedClasse, selectedBrick]);

  const checkModel = async (rayonCode: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${GPC_API_BASE}/check-model?rayonCode=${rayonCode}`);
      const { exists } = response.data;
      setModelExists(prev => ({ ...prev, [rayonCode]: exists }));
    } catch (err: any) {
      setError('Échec de la vérification du modèle');
      console.error('Model check error:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      toast.error(`Échec de la vérification du modèle: ${err.response?.data?.error || err.message}`, toastConfig);
      setModelExists(prev => ({ ...prev, [rayonCode]: false }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClasse && activeTab === 'rayon' && canWrite) {
      rayons.forEach(rayon => checkModel(rayon.code));
    }
  }, [rayons, activeTab, canWrite]);

  useEffect(() => {
    if (allGpcRayon && canWrite) {
      checkModel(allGpcRayon);
    }
  }, [allGpcRayon, canWrite]);

  const openEditor = async (rayonCode: string, overwrite: boolean = false) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const selectedRayon = rayons.find(r => r.code === rayonCode);
    const selectedBrickItem = bricks.find(b => b.code === rayonCode);
    if (!selectedRayon && !selectedBrickItem) {
      toast.error('Rayon ou Brick non valide', toastConfig);
      return;
    }
    setCurrentRayonCode(rayonCode);
    const modelName = selectedRayon?.libelle || selectedBrickItem?.libelle || rayonCode;
    setLoading(true);
    try {
      let updatedModel: Model;
      if (!overwrite) {
        const response = await axios.get(`${GPC_API_BASE}/get-model-json?rayonCode=${rayonCode}`);
        const modelData = response.data;
        if (!modelData || typeof modelData !== 'object') {
          throw new Error('Invalid model data received');
        }
        updatedModel = {
          sections: modelData.sections && typeof modelData.sections === 'object' ? modelData.sections : defaultSections,
          fieldRules: modelData.fieldRules && typeof modelData.fieldRules === 'object' ? modelData.fieldRules : defaultFieldRules,
          libelle: modelName,
          unite_logistique_fields: modelData.unite_logistique_fields || {},
        };
      } else {
        updatedModel = {
          ...defaultModel,
          libelle: modelName,
        };
      }

      const updatedSections = { ...updatedModel.sections };
      const logistiqueSection = updatedSections["Conditionnement & Logistique"];
      if (logistiqueSection) {
        if (!logistiqueSection.subsections) {
          logistiqueSection.subsections = {};
        }
        selectedUniteConsommateur.forEach(option => {
          if (!logistiqueSection.subsections[option]) {
            logistiqueSection.subsections[option] = hierarchyFields[option] || [];
          }
        });
      }
      const updatedFieldRules = { ...updatedModel.fieldRules, ...hierarchyFieldConfigs };
      updatedModel = { ...updatedModel, sections: updatedSections, fieldRules: updatedFieldRules };

      setCurrentModel(updatedModel);
      if (!tabs.includes('model')) {
        setTabs([...tabs, 'model']);
      }
      setActiveTab('model');
    } catch (err: any) {
      console.error('Error fetching model:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      toast.error(
        `Échec de la récupération du modèle pour ${rayonCode}: ${err.response?.data?.error || err.message}`,
        toastConfig
      );
      let updatedModel = {
        ...defaultModel,
        libelle: modelName,
      };
      const updatedSections = { ...updatedModel.sections };
      const logistiqueSection = updatedSections["Conditionnement & Logistique"];
      if (logistiqueSection) {
        if (!logistiqueSection.subsections) {
          logistiqueSection.subsections = {};
        }
        selectedUniteConsommateur.forEach(option => {
          logistiqueSection.subsections![option] = hierarchyFields[option] || [];
        });
      }
      const updatedFieldRules = { ...updatedModel.fieldRules, ...hierarchyFieldConfigs };
      updatedModel = { ...updatedModel, sections: updatedSections, fieldRules: updatedFieldRules };
      setCurrentModel(updatedModel);
      if (!tabs.includes('model')) {
        setTabs([...tabs, 'model']);
      }
      setActiveTab('model');
    } finally {
      setLoading(false);
    }
  };

  const updateDescription = (field: string, newDesc: string) => {
    if (!canWrite) return;
    setCurrentModel(prev => ({
      ...prev,
      fieldRules: {
        ...prev.fieldRules,
        [field]: {
          ...prev.fieldRules[field],
          description: newDesc,
        },
      },
    }));
  };

  const updateType = (field: string, newType: FieldConfig['type']) => {
    if (!canWrite) return;
    setCurrentModel(prev => ({
      ...prev,
      fieldRules: {
        ...prev.fieldRules,
        [field]: {
          ...prev.fieldRules[field],
          type: newType,
          values: newType === 'dropdown' ? (prev.fieldRules[field].values || ['']) : undefined,
        },
      },
    }));
  };

  const updateValidation = (field: string, newValidation: FieldConfig['validation']) => {
    if (!canWrite) return;
    setCurrentModel(prev => ({
      ...prev,
      fieldRules: {
        ...prev.fieldRules,
        [field]: {
          ...prev.fieldRules[field],
          validation: newValidation,
        },
      },
    }));
  };

  const updateObservation = (field: string, newObservation: string) => {
    if (!canWrite) return;
    setCurrentModel(prev => ({
      ...prev,
      fieldRules: {
        ...prev.fieldRules,
        [field]: {
          ...prev.fieldRules[field],
          observation: newObservation,
        },
      },
    }));
  };

  const deleteField = (sectionName: string, field: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    setCurrentModel(prev => {
      const newSections = { ...prev.sections };
      newSections[sectionName].fields = newSections[sectionName].fields.filter(f => f !== field);
      const newFieldRules = { ...prev.fieldRules };
      delete newFieldRules[field];
      return { ...prev, sections: newSections, fieldRules: newFieldRules };
    });
  };

  const deleteSubsectionField = (sectionName: string, subsectionName: string, field: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    setCurrentModel(prev => {
      const newSections = { ...prev.sections };
      if (newSections[sectionName].subsections?.[subsectionName]) {
        newSections[sectionName].subsections[subsectionName] = newSections[sectionName].subsections[subsectionName].filter(f => f !== field);
      }
      const newFieldRules = { ...prev.fieldRules };
      delete newFieldRules[field];
      return { ...prev, sections: newSections, fieldRules: newFieldRules };
    });
  };

  const saveModel = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/save-model-json`, {
        rayonCode: currentRayonCode,
        model: currentModel,
      });
      toast.success('Modèle mis à jour avec succès', toastConfig);
      setModelExists(prev => ({ ...prev, [currentRayonCode]: true }));
    } catch (err: any) {
      console.error('Error saving model:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      toast.error(`Échec de la mise à jour du modèle: ${err.response?.data?.error || err.message}`, toastConfig);
    }
  };

  const handleSegmentStatusChange = (code: string, checked: boolean, libelle: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const updatedSegments = segments.map(segment =>
      segment.code === code ? { ...segment, status: checked ? 1 : 0 } : segment
    );
    setSegments(updatedSegments);
    toast.info(`${checked ? 'Activé' : 'Désactivé'} ${libelle}`, toastConfig);
  };

  const handleFamilleStatusChange = (code: string, checked: boolean, libelle: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const updatedFamilles = familles.map(famille =>
      famille.code === code ? { ...famille, status: checked ? 1 : 0 } : famille
    );
    setFamilles(updatedFamilles);
    toast.info(`${checked ? 'Activé' : 'Désactivé'} ${libelle}`, toastConfig);
  };

  const handleClasseStatusChange = (code: string, checked: boolean, libelle: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const updatedClasses = classes.map(classe =>
      classe.code === code ? { ...classe, status: checked ? 1 : 0 } : classe
    );
    setClasses(updatedClasses);
    toast.info(`${checked ? 'Activé' : 'Désactivé'} ${libelle}`, toastConfig);
  };

  const handleBrickStatusChange = (code: string, checked: boolean, libelle: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const updatedBricks = bricks.map(brick =>
      brick.code === code ? { ...brick, status: checked ? 1 : 0 } : brick
    );
    setBricks(updatedBricks);
    setRayons(rayons.map(rayon =>
      rayon.code === code ? { ...rayon, status: checked ? 1 : 0 } : rayon
    ));
    toast.info(`${checked ? 'Activé' : 'Désactivé'} ${libelle}`, toastConfig);
  };

  const handleRayonStatusChange = (code: string, checked: boolean, libelle: string) => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    const updatedRayons = rayons.map(rayon =>
      rayon.code === code ? { ...rayon, status: checked ? 1 : 0 } : rayon
    );
    setRayons(updatedRayons);
    setBricks(bricks.map(brick =>
      brick.code === code ? { ...brick, status: checked ? 1 : 0 } : brick
    ));
    toast.info(`${checked ? 'Activé' : 'Désactivé'} ${libelle}`, toastConfig);
  };

  const saveSegmentStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-segment-status`, {
        segments: segments.filter(s => s.status === 1).map(s => s.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts des segments');
      console.error('Segment save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const saveFamilleStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-famille-status`, {
        familles: familles.filter(f => f.status === 1).map(f => f.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts des familles');
      console.error('Famille save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const saveClasseStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-classe-status`, {
        classes: classes.filter(c => c.status === 1).map(c => c.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts des classes');
      console.error('Classe save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const saveBrickStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-brick-status`, {
        bricks: bricks.filter(b => b.status === 1).map(b => b.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts des bricks');
      console.error('Brick save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const saveRayonStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-brick-status`, {
        bricks: rayons.filter(r => r.status === 1).map(r => r.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts des rayons');
      console.error('Rayon save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const saveAllGpcStatus = async () => {
    if (!canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    try {
      await axios.post(`${GPC_API_BASE}/update-brick-status`, {
        bricks: rayons.filter(r => r.status === 1).map(r => r.code),
      });
      toast.success('Choix validés', toastConfig);
    } catch (err: any) {
      setError('Échec de l\'enregistrement des statuts GPC');
      console.error('All GPC save error:', err);
      toast.error('Échec de l\'enregistrement', toastConfig);
    }
  };

  const toggleDropdown = (rayonCode: string) => {
    setDropdownOpen(prev => (prev === rayonCode ? null : rayonCode));
  };

  const tabsList = currentRayonCode ? [...tabs, 'model'] : tabs;

  const tabLabels: Record<string, string> = {
    secteur: 'Segments',
    famille: 'Familles',
    classe: 'Classes',
    catégorie: 'Catégories',
    rayon: 'Rayons',
    all_gpc: 'Détails GPC',
    model: `Modèle: ${currentModel.libelle || 'N/A'}`,
  };

  return (
    <div className="container mx-auto p-4 relative min-h-screen">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
        className="z-50"
      />
      <div className="flex items-center justify-between mb-6">
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span className="font-medium text-[#1c74e9]">Produits</span>
          <span>/</span>
          <span className="font-medium text-[#1c74e9]">Génerateur Modeles</span>
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabsList.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-900 text-white hover:bg-blue-800'
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="border-2 border-blue-900 rounded-lg p-4">
        {loading && <p className="text-gray-600">Chargement...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {activeTab === 'secteur' && (
          <div>
            <table className="min-w-full bg-white border">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">Status</th>
                  <th className="py-2 px-4 border-b">Code</th>
                  <th className="py-2 px-4 border-b">Libellé</th>
                  <th className="py-2 px-4 border-b">Libellé EN</th>
                  <th className="py-2 px-4 border-b">Libellé AR</th>
                  {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {segments.map(segment => (
                  <tr key={segment.code}>
                    <td className="py-2 px-4 border-b text-center">
                      <input
                        type="checkbox"
                        checked={segment.status === 1}
                        disabled={!canWrite}
                        onChange={e => handleSegmentStatusChange(segment.code, e.target.checked, segment.libelle)}
                      />
                    </td>
                    <td className="py-2 px-4 border-b">{segment.code}</td>
                                     <td className="py-2 px-4 border-b">{segment.libelle}</td>
                    <td className="py-2 px-4 border-b">{segment.libelle_en}</td>
                    <td className="py-2 px-4 border-b">{segment.libelle_ar}</td>
                    {canWrite && (
                      <td className="py-2 px-4 border-b">
                        <button
                          onClick={() => openEditModal(segment, 'segment')}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Modifier
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {canWrite && (
              <button
                onClick={saveSegmentStatus}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer les statuts
              </button>
            )}
          </div>
        )}

        {activeTab === 'famille' && (
          <div>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="mb-4 p-2 border rounded w-full"
              disabled={loading}
            >
              <option value="">Sélectionner un segment</option>
              {segments
                .filter((s) => s.status === 1)
                .map((segment) => (
                  <option key={segment.code} value={segment.code}>
                    {segment.libelle}
                  </option>
                ))}
            </select>
            {selectedSegment && (
              <table className="min-w-full bg-white border">
                <thead>
                  <tr>
                    <th className="py-2 px-4 border-b">Status</th>
                    <th className="py-2 px-4 border-b">Code</th>
                    <th className="py-2 px-4 border-b">Libellé</th>
                    <th className="py-2 px-4 border-b">Libellé EN</th>
                    <th className="py-2 px-4 border-b">Libellé AR</th>
                    {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {familles.map((famille) => (
                    <tr key={famille.code}>
                      <td className="py-2 px-4 border-b text-center">
                        <input
                          type="checkbox"
                          checked={famille.status === 1}
                          disabled={!canWrite}
                          onChange={(e) =>
                            handleFamilleStatusChange(
                              famille.code,
                              e.target.checked,
                              famille.libelle
                            )
                          }
                        />
                      </td>
                      <td className="py-2 px-4 border-b">{famille.code}</td>
                      <td className="py-2 px-4 border-b">{famille.libelle}</td>
                      <td className="py-2 px-4 border-b">{famille.libelle_en}</td>
                      <td className="py-2 px-4 border-b">{famille.libelle_ar}</td>
                      {canWrite && (
                        <td className="py-2 px-4 border-b">
                          <button
                            onClick={() => openEditModal(famille, 'famille')}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Modifier
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canWrite && selectedSegment && (
              <button
                onClick={saveFamilleStatus}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer les statuts
              </button>
            )}
          </div>
        )}

        {activeTab === 'classe' && (
          <div>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="mb-4 p-2 border rounded w-full"
              disabled={loading}
            >
              <option value="">Sélectionner un segment</option>
              {segments
                .filter((s) => s.status === 1)
                .map((segment) => (
                  <option key={segment.code} value={segment.code}>
                    {segment.libelle}
                  </option>
                ))}
            </select>
            {selectedSegment && (
              <select
                value={selectedFamille}
                onChange={(e) => setSelectedFamille(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une famille</option>
                {familles
                  .filter((f) => f.status === 1)
                  .map((famille) => (
                    <option key={famille.code} value={famille.code}>
                      {famille.libelle}
                    </option>
                  ))}
              </select>
            )}
            {selectedFamille && (
              <table className="min-w-full bg-white border">
                <thead>
                  <tr>
                    <th className="py-2 px-4 border-b">Status</th>
                    <th className="py-2 px-4 border-b">Code</th>
                    <th className="py-2 px-4 border-b">Libellé</th>
                    <th className="py-2 px-4 border-b">Libellé EN</th>
                    <th className="py-2 px-4 border-b">Libellé AR</th>
                    {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((classe) => (
                    <tr key={classe.code}>
                      <td className="py-2 px-4 border-b text-center">
                        <input
                          type="checkbox"
                          checked={classe.status === 1}
                          disabled={!canWrite}
                          onChange={(e) =>
                            handleClasseStatusChange(
                              classe.code,
                              e.target.checked,
                              classe.libelle
                            )
                          }
                        />
                      </td>
                      <td className="py-2 px-4 border-b">{classe.code}</td>
                      <td className="py-2 px-4 border-b">{classe.libelle}</td>
                      <td className="py-2 px-4 border-b">{classe.libelle_en}</td>
                      <td className="py-2 px-4 border-b">{classe.libelle_ar}</td>
                      {canWrite && (
                        <td className="py-2 px-4 border-b">
                          <button
                            onClick={() => openEditModal(classe, 'classe')}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Modifier
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canWrite && selectedFamille && (
              <button
                onClick={saveClasseStatus}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer les statuts
              </button>
            )}
          </div>
        )}

        {activeTab === 'catégorie' && (
          <div>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="mb-4 p-2 border rounded w-full"
              disabled={loading}
            >
              <option value="">Sélectionner un segment</option>
              {segments
                .filter((s) => s.status === 1)
                .map((segment) => (
                  <option key={segment.code} value={segment.code}>
                    {segment.libelle}
                  </option>
                ))}
            </select>
            {selectedSegment && (
              <select
                value={selectedFamille}
                onChange={(e) => setSelectedFamille(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une famille</option>
                {familles
                  .filter((f) => f.status === 1)
                  .map((famille) => (
                    <option key={famille.code} value={famille.code}>
                      {famille.libelle}
                    </option>
                  ))}
              </select>
            )}
            {selectedFamille && (
              <select
                value={selectedClasse}
                onChange={(e) => setSelectedClasse(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une classe</option>
                {classes
                  .filter((c) => c.status === 1)
                  .map((classe) => (
                    <option key={classe.code} value={classe.code}>
                      {classe.libelle}
                    </option>
                  ))}
              </select>
            )}
            {selectedClasse && (
              <table className="min-w-full bg-white border">
                <thead>
                  <tr>
                    <th className="py-2 px-4 border-b">Status</th>
                    <th className="py-2 px-4 border-b">Code</th>
                    <th className="py-2 px-4 border-b">Libellé</th>
                    <th className="py-2 px-4 border-b">Libellé EN</th>
                    <th className="py-2 px-4 border-b">Libellé AR</th>
                    {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {bricks.map((brick) => (
                    <tr key={brick.code}>
                      <td className="py-2 px-4 border-b text-center">
                        <input
                          type="checkbox"
                          checked={brick.status === 1}
                          disabled={!canWrite}
                          onChange={(e) =>
                            handleBrickStatusChange(
                              brick.code,
                              e.target.checked,
                              brick.libelle
                            )
                          }
                        />
                      </td>
                      <td className="py-2 px-4 border-b">{brick.code}</td>
                      <td className="py-2 px-4 border-b">{brick.libelle}</td>
                      <td className="py-2 px-4 border-b">{brick.libelle_en}</td>
                      <td className="py-2 px-4 border-b">{brick.libelle_ar}</td>
                      {canWrite && (
                        <td className="py-2 px-4 border-b">
                          <button
                            onClick={() => openEditModal(brick, 'brick')}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Modifier
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canWrite && selectedClasse && (
              <button
                onClick={saveBrickStatus}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer les statuts
              </button>
            )}
          </div>
        )}

        {activeTab === 'rayon' && (
          <div>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="mb-4 p-2 border rounded w-full"
              disabled={loading}
            >
              <option value="">Sélectionner un segment</option>
              {segments
                .filter((s) => s.status === 1)
                .map((segment) => (
                  <option key={segment.code} value={segment.code}>
                    {segment.libelle}
                  </option>
                ))}
            </select>
            {selectedSegment && (
              <select
                value={selectedFamille}
                onChange={(e) => setSelectedFamille(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une famille</option>
                {familles
                  .filter((f) => f.status === 1)
                  .map((famille) => (
                    <option key={famille.code} value={famille.code}>
                      {famille.libelle}
                    </option>
                  ))}
              </select>
            )}
            {selectedFamille && (
              <select
                value={selectedClasse}
                onChange={(e) => setSelectedClasse(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une classe</option>
                {classes
                  .filter((c) => c.status === 1)
                  .map((classe) => (
                    <option key={classe.code} value={classe.code}>
                      {classe.libelle}
                    </option>
                  ))}
              </select>
            )}
            {selectedClasse && (
              <table className="min-w-full bg-white border">
                <thead>
                  <tr>
                    <th className="py-2 px-4 border-b">Status</th>
                    <th className="py-2 px-4 border-b">Code</th>
                    <th className="py-2 px-4 border-b">Libellé</th>
                    <th className="py-2 px-4 border-b">Libellé EN</th>
                    <th className="py-2 px-4 border-b">Libellé AR</th>
                    {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rayons.map((rayon) => (
                    <tr key={rayon.code}>
                      <td className="py-2 px-4 border-b text-center">
                        <input
                          type="checkbox"
                          checked={rayon.status === 1}
                          disabled={!canWrite}
                          onChange={(e) =>
                            handleRayonStatusChange(
                              rayon.code,
                              e.target.checked,
                              rayon.libelle
                            )
                          }
                        />
                      </td>
                      <td className="py-2 px-4 border-b">{rayon.code}</td>
                      <td className="py-2 px-4 border-b">{rayon.libelle}</td>
                      <td className="py-2 px-4 border-b">{rayon.libelle_en}</td>
                      <td className="py-2 px-4 border-b">{rayon.libelle_ar}</td>
                      {canWrite && (
                        <td className="py-2 px-4 border-b relative">
                          <button
                            onClick={() => toggleDropdown(rayon.code)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Actions
                          </button>
                          {dropdownOpen === rayon.code && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-10">
                              <button
                                onClick={() => openEditModal(rayon, 'brick')}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Modifier
                              </button>
                              <button
                                onClick={() => openEditor(rayon.code)}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                {modelExists[rayon.code]
                                  ? 'Modifier le modèle'
                                  : 'Créer un modèle'}
                              </button>
                              {modelExists[rayon.code] && (
                                <button
                                  onClick={() => openEditor(rayon.code, true)}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  Réinitialiser le modèle
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canWrite && selectedClasse && (
              <button
                onClick={saveRayonStatus}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer les statuts
              </button>
            )}
          </div>
        )}

        {activeTab === 'all_gpc' && (
          <div>
            <select
              value={allGpcSegment}
              onChange={(e) => setAllGpcSegment(e.target.value)}
              className="mb-4 p-2 border rounded w-full"
              disabled={loading}
            >
              <option value="">Sélectionner un segment</option>
              {segments
                .filter((s) => s.status === 1)
                .map((segment) => (
                  <option key={segment.code} value={segment.code}>
                    {segment.libelle}
                  </option>
                ))}
            </select>
            {allGpcSegment && (
              <select
                value={allGpcFamille}
                onChange={(e) => setAllGpcFamille(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une famille</option>
                {familles
                  .filter((f) => f.status === 1)
                  .map((famille) => (
                    <option key={famille.code} value={famille.code}>
                      {famille.libelle}
                    </option>
                  ))}
              </select>
            )}
            {allGpcFamille && (
              <select
                value={allGpcClasse}
                onChange={(e) => setAllGpcClasse(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner une classe</option>
                {classes
                  .filter((c) => c.status === 1)
                  .map((classe) => (
                    <option key={classe.code} value={classe.code}>
                      {classe.libelle}
                    </option>
                  ))}
              </select>
            )}
            {allGpcClasse && (
              <select
                value={allGpcRayon}
                onChange={(e) => setAllGpcRayon(e.target.value)}
                className="mb-4 p-2 border rounded w-full"
                disabled={loading}
              >
                <option value="">Sélectionner un rayon</option>
                {rayons
                  .filter((r) => r.status === 1)
                  .map((rayon) => (
                    <option key={rayon.code} value={rayon.code}>
                      {rayon.libelle}
                    </option>
                  ))}
              </select>
            )}
            {allGpcRayon && (
              <div>
                <table className="min-w-full bg-white border">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Status</th>
                      <th className="py-2 px-4 border-b">Code</th>
                      <th className="py-2 px-4 border-b">Libellé</th>
                      <th className="py-2 px-4 border-b">Libellé EN</th>
                      <th className="py-2 px-4 border-b">Libellé AR</th>
                      {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rayons
                      .filter((r) => r.code === allGpcRayon)
                      .map((rayon) => (
                        <tr key={rayon.code}>
                          <td className="py-2 px-4 border-b text-center">
                            <input
                              type="checkbox"
                              checked={rayon.status === 1}
                              disabled={!canWrite}
                              onChange={(e) =>
                                handleRayonStatusChange(
                                  rayon.code,
                                  e.target.checked,
                                  rayon.libelle
                                )
                              }
                            />
                          </td>
                          <td className="py-2 px-4 border-b">{rayon.code}</td>
                          <td className="py-2 px-4 border-b">{rayon.libelle}</td>
                          <td className="py-2 px-4 border-b">{rayon.libelle_en}</td>
                          <td className="py-2 px-4 border-b">{rayon.libelle_ar}</td>
                          {canWrite && (
                            <td className="py-2 px-4 border-b relative">
                              <button
                                onClick={() => toggleDropdown(rayon.code)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                Actions
                              </button>
                              {dropdownOpen === rayon.code && (
                                <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-10">
                                  <button
                                    onClick={() => openEditModal(rayon, 'brick')}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    Modifier
                                  </button>
                                  <button
                                    onClick={() => openEditor(rayon.code)}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    {modelExists[rayon.code]
                                      ? 'Modifier le modèle'
                                      : 'Créer un modèle'}
                                  </button>
                                  {modelExists[rayon.code] && (
                                    <button
                                      onClick={() => openEditor(rayon.code, true)}
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      Réinitialiser le modèle
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {canWrite && (
                  <button
                    onClick={saveAllGpcStatus}
                    className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
                  >
                    Enregistrer les statuts
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'model' && currentModel.sections && (
          <div>
            <h2 className="text-xl font-bold mb-4">Modèle: {currentModel.libelle}</h2>
            {Object.entries(currentModel.sections).map(([sectionName, section]) => (
              <div key={sectionName} className="mb-4">
                <button
                  onClick={() => toggleSection(sectionName)}
                  className={`w-full text-left p-4 rounded-lg font-semibold ${sectionColors[sectionName] || 'bg-gray-50 text-gray-800'}`}
                >
                  {sectionName} {sectionOpenStates[sectionName] ? '▲' : '▼'}
                </button>
                {sectionOpenStates[sectionName] && (
                  <div className="ml-4 mt-2">
                    <table className="min-w-full bg-white border">
                      <thead>
                        <tr>
                          <th className="py-2 px-4 border-b">Champ</th>
                          <th className="py-2 px-4 border-b">Description</th>
                          <th className="py-2 px-4 border-b">Type</th>
                          <th className="py-2 px-4 border-b">Validation</th>
                          <th className="py-2 px-4 border-b">Observation</th>
                          {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {section.fields.map((field) => (
                          <tr key={field}>
                            <td className="py-2 px-4 border-b">{field}</td>
                            <td className="py-2 px-4 border-b">
                              {canWrite ? (
                                <input
                                  type="text"
                                  value={currentModel.fieldRules[field]?.description || ''}
                                  onChange={(e) => updateDescription(field, e.target.value)}
                                  className="w-full p-1 border rounded"
                                  disabled={!canWrite}
                                />
                              ) : (
                                currentModel.fieldRules[field]?.description || ''
                              )}
                            </td>
                            <td className="py-2 px-4 border-b">
                              {canWrite ? (
                                <select
                                  value={currentModel.fieldRules[field]?.type || 'text'}
                                  onChange={(e) =>
                                    updateType(field, e.target.value as FieldConfig['type'])
                                  }
                                  className="w-full p-1 border rounded"
                                  disabled={!canWrite}
                                >
                                  <option value="text">Texte</option>
                                  <option value="numeric">Numérique</option>
                                  <option value="date">Date</option>
                                  <option value="boolean">Booléen</option>
                                  <option value="dropdown">Liste déroulante</option>
                                  <option value="multivalue">Valeurs multiples</option>
                                </select>
                              ) : (
                                currentModel.fieldRules[field]?.type || 'text'
                              )}
                            </td>
                            <td className="py-2 px-4 border-b">
                              {canWrite ? (
                                <select
                                  value={currentModel.fieldRules[field]?.validation || 'OP'}
                                  onChange={(e) =>
                                    updateValidation(
                                      field,
                                      e.target.value as FieldConfig['validation']
                                    )
                                  }
                                  className="w-full p-1 border rounded"
                                  disabled={!canWrite}
                                >
                                  <option value="OB">Obligatoire</option>
                                  <option value="OP">Optionnel</option>
                                  <option value="OC">Conditionnel</option>
                                </select>
                              ) : (
                                currentModel.fieldRules[field]?.validation || 'OP'
                              )}
                            </td>
                            <td className="py-2 px-4 border-b">
                              {canWrite ? (
                                <input
                                  type="text"
                                  value={currentModel.fieldRules[field]?.observation || ''}
                                  onChange={(e) => updateObservation(field, e.target.value)}
                                  className="w-full p-1 border rounded"
                                  disabled={!canWrite}
                                />
                              ) : (
                                currentModel.fieldRules[field]?.observation || ''
                              )}
                            </td>
                            {canWrite && (
                              <td className="py-2 px-4 border-b">
                                <button
                                  onClick={() => deleteField(sectionName, field)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  Supprimer
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {section.subsections &&
                      Object.entries(section.subsections).map(([subsectionName, fields]) => (
                        <div key={subsectionName} className="ml-4 mt-4">
                          <button
                            onClick={() => toggleSubsection(sectionName, subsectionName)}
                            className={`w-full text-left p-3 rounded-lg font-semibold ${sectionColors[sectionName] || 'bg-gray-50 text-gray-800'}`}
                          >
                            {subsectionName} {subsectionOpenStates[`${sectionName}-${subsectionName}`] ? '▲' : '▼'}
                          </button>
                          {subsectionOpenStates[`${sectionName}-${subsectionName}`] && (
                            <table className="min-w-full bg-white border mt-2">
                              <thead>
                                <tr>
                                  <th className="py-2 px-4 border-b">Champ</th>
                                  <th className="py-2 px-4 border-b">Description</th>
                                  <th className="py-2 px-4 border-b">Type</th>
                                  <th className="py-2 px-4 border-b">Validation</th>
                                  <th className="py-2 px-4 border-b">Observation</th>
                                  {canWrite && <th className="py-2 px-4 border-b">Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {fields.map((field) => (
                                  <tr key={field}>
                                    <td className="py-2 px-4 border-b">{field}</td>
                                    <td className="py-2 px-4 border-b">
                                      {canWrite ? (
                                        <input
                                          type="text"
                                          value={currentModel.fieldRules[field]?.description || ''}
                                          onChange={(e) => updateDescription(field, e.target.value)}
                                          className="w-full p-1 border rounded"
                                          disabled={!canWrite}
                                        />
                                      ) : (
                                        currentModel.fieldRules[field]?.description || ''
                                      )}
                                    </td>
                                    <td className="py-2 px-4 border-b">
                                      {canWrite ? (
                                        <select
                                          value={currentModel.fieldRules[field]?.type || 'text'}
                                          onChange={(e) =>
                                            updateType(field, e.target.value as FieldConfig['type'])
                                          }
                                          className="w-full p-1 border rounded"
                                          disabled={!canWrite}
                                        >
                                          <option value="text">Texte</option>
                                          <option value="numeric">Numérique</option>
                                          <option value="date">Date</option>
                                          <option value="boolean">Booléen</option>
                                          <option value="dropdown">Liste déroulante</option>
                                          <option value="multivalue">Valeurs multiples</option>
                                        </select>
                                      ) : (
                                        currentModel.fieldRules[field]?.type || 'text'
                                      )}
                                    </td>
                                    <td className="py-2 px-4 border-b">
                                      {canWrite ? (
                                        <select
                                          value={currentModel.fieldRules[field]?.validation || 'OP'}
                                          onChange={(e) =>
                                            updateValidation(
                                              field,
                                              e.target.value as FieldConfig['validation']
                                            )
                                          }
                                          className="w-full p-1 border rounded"
                                          disabled={!canWrite}
                                        >
                                          <option value="OB">Obligatoire</option>
                                          <option value="OP">Optionnel</option>
                                          <option value="OC">Conditionnel</option>
                                        </select>
                                      ) : (
                                        currentModel.fieldRules[field]?.validation || 'OP'
                                      )}
                                    </td>
                                    <td className="py-2 px-4 border-b">
                                      {canWrite ? (
                                        <input
                                          type="text"
                                          value={currentModel.fieldRules[field]?.observation || ''}
                                          onChange={(e) => updateObservation(field, e.target.value)}
                                          className="w-full p-1 border rounded"
                                          disabled={!canWrite}
                                        />
                                      ) : (
                                        currentModel.fieldRules[field]?.observation || ''
                                      )}
                                    </td>
                                    {canWrite && (
                                      <td className="py-2 px-4 border-b">
                                        <button
                                          onClick={() =>
                                            deleteSubsectionField(sectionName, subsectionName, field)
                                          }
                                          className="text-red-600 hover:text-red-800"
                                        >
                                          Supprimer
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
            {canWrite && (
              <button
                onClick={saveModel}
                className="mt-4 px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
              >
                Enregistrer le modèle
              </button>
            )}
          </div>
        )}

        {isEditing && editItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">
                Modifier {editType}
              </h2>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Code</label>
                <input
                  type="text"
                  value={editItem.code}
                  onChange={(e) =>
                    setEditItem({ ...editItem, code: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  disabled
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Libellé</label>
                <input
                  type="text"
                  value={editItem.libelle}
                  onChange={(e) =>
                    setEditItem({ ...editItem, libelle: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Libellé EN</label>
                <input
                  type="text"
                  value={editItem.libelle_en}
                  onChange={(e) =>
                    setEditItem({ ...editItem, libelle_en: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Libellé AR</label>
                <input
                  type="text"
                  value={editItem.libelle_ar}
                  onChange={(e) =>
                    setEditItem({ ...editItem, libelle_ar: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Annuler
                </button>
                <button
                  onClick={saveEdit}
                  className="px-4 py-2 bg-blue-900 text-white rounded hover:bg-blue-800"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Gpc;