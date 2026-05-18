import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useLocalApiUrl } from '../contexts/SettingsContext';

interface GPCItem {
  code: string;
  libelle: string;
  libelle_en: string;
  libelle_ar: string;
  status: number;
}

interface RayonItem {
  code: string;
  brick_code: string;
  libelle: string;
  libelle_en: string;
  libelle_ar: string;
  status: number;
}

interface ModelItem {
  rayon_code: string;
  model_json: string;
  libelle: string;
  created_at: string;
  updated_at: string;
  is_complete: number;
}

interface FieldConfig {
  description: string;
  type: 'text' | 'numeric' | 'date' | 'boolean' | 'dropdown' | 'multivalue' | 'liste' | 'liste_multiple';
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

const sectionTheme: Record<string, {
  header: string;
  thead: string;
  rowHover: string;
  rowEven: string;
  codeBadge: string;
  borderLeft: string;
  ring: string;
}> = {
  "Classification": {
    header:     'bg-emerald-100 text-emerald-900 border-b border-emerald-200',
    thead:      'bg-emerald-50 border-emerald-100',
    rowHover:   'hover:bg-emerald-50/60',
    rowEven:    'bg-emerald-50/20',
    codeBadge:  'text-emerald-700 bg-emerald-100',
    borderLeft: 'border-l-4 border-l-emerald-400',
    ring:       'focus:ring-emerald-400',
  },
  "Données d'identification": {
    header:     'bg-blue-100 text-blue-900 border-b border-blue-200',
    thead:      'bg-blue-50 border-blue-100',
    rowHover:   'hover:bg-blue-50/60',
    rowEven:    'bg-blue-50/20',
    codeBadge:  'text-blue-700 bg-blue-100',
    borderLeft: 'border-l-4 border-l-blue-400',
    ring:       'focus:ring-blue-400',
  },
  "Donnees d'identification": {
    header:     'bg-blue-100 text-blue-900 border-b border-blue-200',
    thead:      'bg-blue-50 border-blue-100',
    rowHover:   'hover:bg-blue-50/60',
    rowEven:    'bg-blue-50/20',
    codeBadge:  'text-blue-700 bg-blue-100',
    borderLeft: 'border-l-4 border-l-blue-400',
    ring:       'focus:ring-blue-400',
  },
  "Données spécifiques du produit": {
    header:     'bg-violet-100 text-violet-900 border-b border-violet-200',
    thead:      'bg-violet-50 border-violet-100',
    rowHover:   'hover:bg-violet-50/60',
    rowEven:    'bg-violet-50/20',
    codeBadge:  'text-violet-700 bg-violet-100',
    borderLeft: 'border-l-4 border-l-violet-400',
    ring:       'focus:ring-violet-400',
  },
  "Donnees specifiques du produit": {
    header:     'bg-violet-100 text-violet-900 border-b border-violet-200',
    thead:      'bg-violet-50 border-violet-100',
    rowHover:   'hover:bg-violet-50/60',
    rowEven:    'bg-violet-50/20',
    codeBadge:  'text-violet-700 bg-violet-100',
    borderLeft: 'border-l-4 border-l-violet-400',
    ring:       'focus:ring-violet-400',
  },
  "Conditionnement & Logistique": {
    header:     'bg-orange-100 text-orange-900 border-b border-orange-200',
    thead:      'bg-orange-50 border-orange-100',
    rowHover:   'hover:bg-orange-50/60',
    rowEven:    'bg-orange-50/20',
    codeBadge:  'text-orange-700 bg-orange-100',
    borderLeft: 'border-l-4 border-l-orange-400',
    ring:       'focus:ring-orange-400',
  },
  "Données tarifaires": {
    header:     'bg-rose-100 text-rose-900 border-b border-rose-200',
    thead:      'bg-rose-50 border-rose-100',
    rowHover:   'hover:bg-rose-50/60',
    rowEven:    'bg-rose-50/20',
    codeBadge:  'text-rose-700 bg-rose-100',
    borderLeft: 'border-l-4 border-l-rose-400',
    ring:       'focus:ring-rose-400',
  },
  "Donnees tarifaires": {
    header:     'bg-rose-100 text-rose-900 border-b border-rose-200',
    thead:      'bg-rose-50 border-rose-100',
    rowHover:   'hover:bg-rose-50/60',
    rowEven:    'bg-rose-50/20',
    codeBadge:  'text-rose-700 bg-rose-100',
    borderLeft: 'border-l-4 border-l-rose-400',
    ring:       'focus:ring-rose-400',
  },
};
const defaultTheme = {
  header:     'bg-slate-100 text-slate-700 border-b border-slate-200',
  thead:      'bg-slate-50 border-slate-100',
  rowHover:   'hover:bg-slate-50/60',
  rowEven:    'bg-slate-50/20',
  codeBadge:  'text-slate-600 bg-slate-100',
  borderLeft: 'border-l-4 border-l-slate-300',
  ring:       'focus:ring-slate-400',
};
function getSectionTheme(name: string) {
  return sectionTheme[name] || defaultTheme;
}
// kept for any legacy references
const sectionColors: Record<string, string> = {};

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

// ─── FieldRow: defined OUTSIDE Gpc so it never remounts on parent re-render ───
// This fixes the focus-loss bug where typing one character in observation/description
// would lose focus because the component was recreated on every state change.
const FieldRow = React.memo(({
  field, sectionName, subsectionName,
  canWrite, theme,
  description, fieldType, validation, observation, values,
  onDescription, onType, onValidation, onObservation, onValues, onDelete,
}: {
  field: string; sectionName: string; subsectionName?: string;
  canWrite: boolean;
  theme: ReturnType<typeof getSectionTheme>;
  description: string; fieldType: string; validation: string; observation: string;
  values?: string[];
  onDescription: (f: string, v: string) => void;
  onType: (f: string, v: FieldConfig['type']) => void;
  onValidation: (f: string, v: FieldConfig['validation']) => void;
  onObservation: (f: string, v: string) => void;
  onValues: (f: string, v: string[]) => void;
  onDelete: (section: string, sub: string | undefined, f: string) => void;
}) => {
  const isListType = fieldType === 'liste' || fieldType === 'liste_multiple';
  const listValues = values || [];

  const vBadge = (v: string) => {
    if (v === 'OB') return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200">OB</span>;
    if (v === 'OC') return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">OC</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">OP</span>;
  };

  const typeLabel = (t: string) => {
    switch(t) {
      case 'text': return 'Texte';
      case 'numeric': return 'Numérique';
      case 'date': return 'Date';
      case 'boolean': return 'Booléen';
      case 'dropdown': return 'Dropdown';
      case 'multivalue': return 'Multi-val';
      case 'liste': return 'Liste (exclusif)';
      case 'liste_multiple': return 'Liste (inclusif)';
      default: return t;
    }
  };

  return (
    <>
      <tr className={`group transition-colors ${theme.rowHover}`}>
        <td className="py-2.5 px-4 border-b border-slate-100">
          <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${theme.codeBadge}`}>{field}</code>
        </td>
        <td className="py-2.5 px-4 border-b border-slate-100">
          {canWrite
            ? <input type="text" value={description} onChange={e => onDescription(field, e.target.value)}
                className={`w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${theme.ring} bg-white`} />
            : <span className="text-sm text-slate-700">{description || '—'}</span>}
        </td>
        <td className="py-2.5 px-4 border-b border-slate-100">
          {canWrite
            ? <select value={fieldType} onChange={e => onType(field, e.target.value as FieldConfig['type'])}
                className={`w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${theme.ring} bg-white`}>
                <option value="text">Texte</option>
                <option value="numeric">Numérique</option>
                <option value="date">Date</option>
                <option value="boolean">Booléen</option>
                <option value="dropdown">Dropdown</option>
                <option value="multivalue">Multi-val</option>
                <option value="liste">Liste (exclusif)</option>
                <option value="liste_multiple">Liste (inclusif)</option>
              </select>
            : <span className="text-xs text-slate-500 capitalize">{typeLabel(fieldType)}</span>}
        </td>
        <td className="py-2.5 px-4 border-b border-slate-100">
          {canWrite
            ? <select value={validation} onChange={e => onValidation(field, e.target.value as FieldConfig['validation'])}
                className={`w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${theme.ring} bg-white`}>
                <option value="OB">Obligatoire</option><option value="OP">Optionnel</option><option value="OC">Conditionnel</option>
              </select>
            : vBadge(validation)}
        </td>
        <td className="py-2.5 px-4 border-b border-slate-100">
          {canWrite
            ? <textarea
                rows={2}
                value={observation}
                onChange={e => onObservation(field, e.target.value)}
                className={`w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${theme.ring} bg-white resize-y`}
              />
            : <span className="text-xs text-slate-500 italic">{observation || '—'}</span>}
        </td>
        {canWrite && (
          <td className="py-2.5 px-4 border-b border-slate-100">
            <button onClick={() => onDelete(sectionName, subsectionName, field)}
              className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-all">
              ✕
            </button>
          </td>
        )}
      </tr>

      {/* ── Inline list-options editor — shown when type is liste or liste_multiple ── */}
      {isListType && (
        <tr>
          <td className="px-4 pt-1 pb-3 border-b border-slate-100" colSpan={canWrite ? 6 : 5}>
            <div className="ml-1 pl-3 border-l-2 border-dashed border-slate-300">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${fieldType === 'liste' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
                  {fieldType === 'liste' ? '⊙ Sélection exclusive (1 choix)' : '☑ Sélection inclusive (plusieurs choix)'}
                </span>
                <span className="text-[10px] text-slate-400">Options de la liste</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {listValues.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2 group/item">
                    <span className="w-5 h-5 flex items-center justify-center shrink-0">
                      {fieldType === 'liste'
                        ? <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 inline-block"></span>
                        : <span className="w-3.5 h-3.5 rounded border-2 border-slate-300 inline-block"></span>
                      }
                    </span>
                    {canWrite ? (
                      <>
                        <input
                          type="text"
                          value={val}
                          placeholder={`Option ${idx + 1}`}
                          onChange={e => {
                            const next = [...listValues];
                            next[idx] = e.target.value;
                            onValues(field, next);
                          }}
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-slate-700 placeholder-slate-300"
                        />
                        <button
                          onClick={() => onValues(field, listValues.filter((_, i) => i !== idx))}
                          className="opacity-0 group-hover/item:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-xs"
                          title="Supprimer"
                        >✕</button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">{val || <span className="italic text-slate-300">vide</span>}</span>
                    )}
                  </div>
                ))}
                {canWrite && (
                  <button
                    onClick={() => onValues(field, [...listValues, ''])}
                    className="self-start flex items-center gap-1.5 mt-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                    Ajouter une option
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

const Gpc: React.FC = () => {
  const API_BASE_URL = useLocalApiUrl();
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
  const [allGpcRayons, setAllGpcRayons] = useState<RayonItem[]>([]);
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
  const [selectedHierarchy, setSelectedHierarchy] = useState<string | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedBrickForModels, setSelectedBrickForModels] = useState<string>('');

  // Bulk generation state
  const [bulkGenOpen, setBulkGenOpen] = useState<boolean>(false);
  const [bulkGenRunning, setBulkGenRunning] = useState<boolean>(false);
  const [bulkGenProgress, setBulkGenProgress] = useState<{
    done: number; total: number; succeeded: number; skipped: number; failed: number;
    log: Array<{ rayonCode: string; brickName: string; status: string; error?: string }>;
    complete: boolean;
  }>({ done: 0, total: 0, succeeded: 0, skipped: 0, failed: 0, log: [], complete: false });
  const [bulkGenOverwrite, setBulkGenOverwrite] = useState<boolean>(false);

  // Check write permission for "Produits/Generateur Modele" page (page_id: 5) on mount
  useEffect(() => {
    const userData = localStorage.getItem('currentUser') || localStorage.getItem('user');
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
    const updateUrl = `${API_BASE_URL}/api/update-${editType}`;
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
        const response = await axios.get(`/api/segments`);
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
          const response = await axios.get(`${API_BASE_URL}/api/familles?codeSegment=${selectedSegment}`);
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
          const response = await axios.get(`${API_BASE_URL}/api/classes?codeFamille=${selectedFamille}`);
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
          const response = await axios.get(`${API_BASE_URL}/api/bricks?codeClasse=${selectedClasse}`);
          setBricks(response.data);
          // Rayons are now loaded separately from rayongpc table — don't copy bricks here
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
  // Auto-load models when brick is selected and rayon tab is active
  useEffect(() => {
    if (selectedBrick && activeTab === 'rayon') {
      loadModelsByBrickCode(selectedBrick);
    }
  }, [selectedBrick, activeTab]);

  // Fetch rayons from rayongpc table when a brick is selected in rayon tab
  useEffect(() => {
    const fetchRayonsForBrick = async () => {
      if (!selectedBrick) {
        setRayons([]);
        return;
      }
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/rayongpc?brick_code=${selectedBrick}`
        );
        const rows: Array<{ brick_code: string; rayon_code: string; rayon_libelle: string }> = response.data || [];
        const loaded: RayonItem[] = rows.map(r => ({
          code: r.rayon_code,
          brick_code: r.brick_code,
          libelle: r.rayon_libelle,
          libelle_en: '',
          libelle_ar: '',
          status: 1,
        }));
        setRayons(loaded);
        // Batch-check model existence for all compound keys
        if (loaded.length > 0) {
          const keys = loaded.map(r => `${r.code}__${r.brick_code}`).join(',');
          try {
            const existsRes = await axios.get(`${API_BASE_URL}/api/models/exists?codes=${encodeURIComponent(keys)}`);
            setModelExists(prev => ({ ...prev, ...existsRes.data }));
          } catch (e) { console.error('model exists check error:', e); }
        }
      } catch (err) {
        console.error('Error fetching rayons from rayongpc:', err);
        setRayons([]);
      }
    };
    if (activeTab === 'rayon') {
      fetchRayonsForBrick();
    }
  }, [selectedBrick, activeTab]);

  useEffect(() => {
    const fetchAllGpcFamilles = async () => {
      setAllGpcFamille('');
      setAllGpcClasse('');
      setAllGpcBrick('');
      setAllGpcRayon('');
      setAllGpcRayons([]);
      setFamilles([]);
      setClasses([]);
      setBricks([]);
      setRayons([]);
      if (allGpcSegment) {
        setLoading(true);
        try {
          const response = await axios.get(`${API_BASE_URL}/api/familles?codeSegment=${allGpcSegment}`);
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
      setAllGpcRayons([]);
      setClasses([]);
      setBricks([]);
      setRayons([]);
      if (allGpcFamille) {
        setLoading(true);
        try {
          const response = await axios.get(`${API_BASE_URL}/api/classes?codeFamille=${allGpcFamille}`);
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
      setAllGpcRayons([]);
      setBricks([]);
      setRayons([]);
      if (allGpcClasse) {
        setLoading(true);
        try {
          const response = await axios.get(`${API_BASE_URL}/api/bricks?codeClasse=${allGpcClasse}`);
          setBricks(response.data);
          // Rayons come from rayongpc — don't copy bricks here
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
      const response = await axios.get(`${API_BASE_URL}/api/check-model?rayonCode=${rayonCode}`);
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
    // Model existence is now batch-checked inside fetchRayonsForBrick and fetchAllGpcRayons
  }, [rayons, activeTab, canWrite]);

  // ─── LOAD MODELS BY BRICK CODE ───
  const loadModelsByBrickCode = async (brickCode: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/models/by-brick/${brickCode}`);
      setModels(response.data || []);
      setSelectedBrickForModels(brickCode);
      if (response.data.length === 0) {
        toast.info('Aucun modèle trouvé pour ce brick', toastConfig);
      } else {
        toast.success(`${response.data.length} modèle(s) chargé(s)`, toastConfig);
      }
    } catch (err: any) {
      console.error('Error loading models by brick:', err);
      setModels([]);
      toast.error(`Erreur lors du chargement des modèles: ${err.response?.data?.error || err.message}`, toastConfig);
    } finally {
      setLoading(false);
    }
  };

  // allGpcRayon model check now handled by batch in fetchAllGpcRayons

  // Fetch rayons from rayongpc when a brick is selected in all_gpc tab
  useEffect(() => {
    const fetchAllGpcRayons = async () => {
      if (!allGpcRayon) {
        setAllGpcRayons([]);
        return;
      }
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/rayongpc?brick_code=${allGpcRayon}`
        );
        const rows: Array<{ brick_code: string; rayon_code: string; rayon_libelle: string }> = response.data || [];
        const loaded: RayonItem[] = rows.map(r => ({
          code: r.rayon_code,
          brick_code: r.brick_code,
          libelle: r.rayon_libelle,
          libelle_en: '',
          libelle_ar: '',
          status: 1,
        }));
        setAllGpcRayons(loaded);
        if (loaded.length > 0) {
          const keys = loaded.map(r => `${r.code}__${r.brick_code}`).join(',');
          try {
            const existsRes = await axios.get(`${API_BASE_URL}/api/models/exists?codes=${encodeURIComponent(keys)}`);
            setModelExists(prev => ({ ...prev, ...existsRes.data }));
          } catch (e) { console.error('model exists check error:', e); }
        }
      } catch (err) {
        console.error('Error fetching allGpcRayons from rayongpc:', err);
        setAllGpcRayons([]);
      }
    };
    if (activeTab === 'all_gpc') {
      fetchAllGpcRayons();
    }
  }, [allGpcRayon, activeTab]);

  const openEditor = async (rayonCode: string, overwrite: boolean = false, modelName?: string) => {
    // Only block writes on overwrite; viewing is open to all
    if (overwrite && !canWrite) {
      toast.error('Vous n\'avez pas la permission de modifier', toastConfig);
      return;
    }
    setCurrentRayonCode(rayonCode);
    // Derive display name: passed modelName > rayon lookup > brick lookup > code
    const selectedRayon = rayons.find(r => `${r.code}__${r.brick_code}` === rayonCode) || rayons.find(r => r.code === rayonCode);
    const selectedBrickItem = bricks.find(b => b.code === rayonCode);
    const displayName = modelName || selectedRayon?.libelle || selectedBrickItem?.libelle || rayonCode;
    setLoading(true);
    try {
      let updatedModel: Model;
      if (!overwrite) {
        const response = await axios.get(`${API_BASE_URL}/api/get-model-json?rayonCode=${rayonCode}`);
        const modelData = response.data;
        if (!modelData || typeof modelData !== 'object') {
          throw new Error('Invalid model data received');
        }
        updatedModel = {
          sections: modelData.sections && typeof modelData.sections === 'object' ? modelData.sections : defaultSections,
          fieldRules: modelData.fieldRules && typeof modelData.fieldRules === 'object' ? modelData.fieldRules : defaultFieldRules,
          libelle: displayName,
          unite_logistique_fields: modelData.unite_logistique_fields || {},
        };
      } else {
        updatedModel = {
          ...defaultModel,
          libelle: displayName,
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
        libelle: displayName,
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

  const generateSmartModel = async (rayonCode: string) => {
    if (!canWrite) {
      toast.error("Vous n'avez pas la permission de modifier", toastConfig);
      return;
    }
    const selectedRayon = rayons.find(r => r.code === rayonCode);
    const modelName = selectedRayon?.libelle || rayonCode;
    setLoading(true);
    const toastId = 'ai-generating';
    toast.info(`🤖 Génération IA du modèle pour « ${modelName} »...`, {
      ...toastConfig,
      autoClose: false,
      toastId,
    });
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/generate-smart-model?rayonCode=${rayonCode}`
      );
      const modelData = response.data;

      if (!modelData || !modelData.sections || !modelData.fieldRules) {
        throw new Error('Réponse IA invalide');
      }

      // Merge AI fieldRules with hierarchyFieldConfigs (logistic fields always present)
      const mergedFieldRules = { ...modelData.fieldRules, ...hierarchyFieldConfigs };

      // Ensure Conditionnement subsections are intact
      const mergedSections = { ...modelData.sections };
      const logSection = mergedSections["Conditionnement & Logistique"];
      if (logSection) {
        if (!logSection.subsections) {
          logSection.subsections = {};
        }
        selectedUniteConsommateur.forEach(option => {
          if (!logSection.subsections![option]) {
            logSection.subsections![option] = hierarchyFields[option] || [];
          }
        });
      }

      const updatedModel: Model = {
        sections: mergedSections,
        fieldRules: mergedFieldRules,
        libelle: modelData.libelle || modelName,
        unite_logistique_fields: {},
      };

      setCurrentModel(updatedModel);
      setCurrentRayonCode(rayonCode);
      if (!tabs.includes('model')) setTabs([...tabs, 'model']);
      setActiveTab('model');
      setDropdownOpen(null);

      toast.dismiss(toastId);
      toast.success(`✅ Modèle IA généré pour « ${modelName} » — vérifiez et enregistrez.`, toastConfig);
    } catch (err: any) {
      toast.dismiss(toastId);
      const detail = err.response?.data?.error || err.message;
      toast.error(`❌ Échec génération IA : ${detail}`, toastConfig);
      console.error('generateSmartModel error:', err);
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
          values: (newType === 'dropdown' || newType === 'liste' || newType === 'liste_multiple')
            ? (prev.fieldRules[field]?.values?.length ? prev.fieldRules[field].values : [''])
            : undefined,
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

  const updateValues = (field: string, newValues: string[]) => {
    if (!canWrite) return;
    setCurrentModel(prev => ({
      ...prev,
      fieldRules: {
        ...prev.fieldRules,
        [field]: {
          ...prev.fieldRules[field],
          values: newValues,
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
      await axios.post(`/api/save-model-json`, {
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
      await axios.post(`/api/update-segment-status`, {
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
      await axios.post(`/api/update-famille-status`, {
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
      await axios.post(`/api/update-classe-status`, {
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
      await axios.post(`/api/update-brick-status`, {
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
      await axios.post(`/api/update-brick-status`, {
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
      await axios.post(`/api/update-brick-status`, {
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

  const generateAllModels = () => {
    if (!canWrite) {
      toast.error("Vous n'avez pas la permission de modifier", toastConfig);
      return;
    }
    setBulkGenProgress({ done: 0, total: 0, succeeded: 0, skipped: 0, failed: 0, log: [], complete: false });
    setBulkGenRunning(true);
    setBulkGenOpen(true);

    const params = new URLSearchParams();
    if (bulkGenOverwrite) params.set('overwrite', 'true');

    const url = `${API_BASE_URL}/api/generate-all-models?${params.toString()}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'start') {
          setBulkGenProgress(prev => ({ ...prev, total: data.total }));
        } else if (data.type === 'progress') {
          setBulkGenProgress(prev => ({
            ...prev,
            done: data.done,
            total: data.total,
            succeeded: data.succeeded,
            skipped: data.skipped,
            failed: data.failed,
            log: [
              { rayonCode: data.rayonCode, brickName: data.brickName, status: data.status, error: data.error },
              ...prev.log,
            ].slice(0, 200),
          }));
        } else if (data.type === 'complete') {
          setBulkGenProgress(prev => ({
            ...prev,
            done: data.done,
            total: data.total,
            succeeded: data.succeeded,
            skipped: data.skipped,
            failed: data.failed,
            complete: true,
          }));
          setBulkGenRunning(false);
          es.close();
          toast.success(`✅ Génération terminée: ${data.succeeded} créés, ${data.skipped} ignorés, ${data.failed} erreurs.`, toastConfig);
        } else if (data.type === 'error') {
          toast.error(`❌ Erreur: ${data.message}`, toastConfig);
          setBulkGenRunning(false);
          es.close();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    es.onerror = () => {
      setBulkGenRunning(false);
      es.close();
      setBulkGenProgress(prev => ({ ...prev, complete: true }));
    };
  };

  const tabsList = currentRayonCode ? [...tabs, 'model'] : tabs;

  const tabLabels: Record<string, string> = {
    secteur: 'Segments',
    famille: 'Familles',
    classe: 'Classes',
    catégorie: 'Catégories',
    rayon: 'Rayons',
    all_gpc: 'Détails GPC',
    model: 'Modèle',
  };


  // ─── helpers ───────────────────────────────────────────────────────────────
  const sel = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed";

  const validationBadge = (v: string) => {
    if (v === 'OB') return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200">OB</span>;
    if (v === 'OC') return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">OC</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">OP</span>;
  };




  const GpcTable = ({ items, onEdit, onStatus, onSave, showSave }: {
    items: { code: string; libelle: string; libelle_en: string; libelle_ar: string; status: number }[];
    onEdit?: (item: any, type: string) => void;
    onStatus: (code: string, checked: boolean, libelle: string) => void;
    onSave: () => void;
    showSave: boolean;
    type: string;
  }) => (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <table className="min-w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-10">Actif</th>
            <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Code</th>
            <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Libellé FR</th>
            <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Libellé EN</th>
            <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Libellé AR</th>
            {canWrite && onEdit && <th className="py-3 px-4 w-20"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, i) => (
            <tr key={item.code} className={`hover:bg-blue-50/50 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}>
              <td className="py-3 px-4">
                <input type="checkbox" checked={item.status === 1} disabled={!canWrite}
                  onChange={e => onStatus(item.code, e.target.checked, item.libelle)}
                  className="w-4 h-4 accent-blue-700 cursor-pointer disabled:cursor-default" />
              </td>
              <td className="py-3 px-4"><code className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{item.code}</code></td>
              <td className="py-3 px-4 text-sm font-medium text-slate-800">{item.libelle}</td>
              <td className="py-3 px-4 text-sm text-slate-500 hidden md:table-cell">{item.libelle_en || '—'}</td>
              <td className="py-3 px-4 text-sm text-slate-500 hidden lg:table-cell">{item.libelle_ar || '—'}</td>
              {canWrite && onEdit && (
                <td className="py-3 px-4 text-right">
                  <button onClick={() => onEdit(item, '')}
                    className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                    Modifier
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && showSave && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button onClick={onSave} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
            Enregistrer les statuts
          </button>
        </div>
      )}
    </div>
  );

  const CascadeSelects = ({ fields }: { fields: { label: string; value: string; onChange: (v: string) => void; options: { code: string; libelle: string }[]; show: boolean }[] }) => {
    const visible = fields.filter(f => f.show);
    return (
      <div className="grid grid-cols-2 gap-3 mb-5">
        {visible.map((f, i) => (
          <div key={i}>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{f.label}</label>
            <select value={f.value} onChange={e => f.onChange(e.target.value)} disabled={loading} className={sel}>
              <option value="">— Sélectionner —</option>
              {f.options.map(o => <option key={o.code} value={o.code}>{o.libelle}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} closeOnClick pauseOnHover draggable className="z-50" />

      {/* ── Top bar: breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Produits</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Génerateur Modeles</span>
      </nav>
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        {loading && (
          <span className="flex items-center gap-2 text-xs text-blue-600 font-medium animate-pulse">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Chargement…
          </span>
        )}
      </div>

      <div className="px-6 py-5 max-w-screen-2xl mx-auto">

        {/* ── Tab bar ── */}
        <div className="flex flex-wrap items-center gap-1 mb-5 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
          {tabsList.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}>
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* ── Main card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {error && (
            <div className="m-5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
              <span>⚠️</span>{error}
            </div>
          )}

          {/* ══ SEGMENTS ══ */}
          {activeTab === 'secteur' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Segments GPC</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Activez ou désactivez les segments visibles dans la hiérarchie</p>
                </div>
                {canWrite && (
                  <button onClick={saveSegmentStatus} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
                    Enregistrer
                  </button>
                )}
              </div>
              <GpcTable items={segments} onEdit={(item) => openEditModal(item, 'segment')} onStatus={handleSegmentStatusChange} onSave={saveSegmentStatus} showSave={false} type="segment" />
            </div>
          )}

          {/* ══ FAMILLES ══ */}
          {activeTab === 'famille' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Familles GPC</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Filtrez par segment pour gérer les familles</p>
                </div>
                {canWrite && selectedSegment && (
                  <button onClick={saveFamilleStatus} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
                    Enregistrer
                  </button>
                )}
              </div>
              <CascadeSelects fields={[
                { label: 'Segment', value: selectedSegment, onChange: setSelectedSegment, options: segments.filter(s => s.status === 1), show: true },
              ]} />
              {selectedSegment && <GpcTable items={familles} onEdit={(item) => openEditModal(item, 'famille')} onStatus={handleFamilleStatusChange} onSave={saveFamilleStatus} showSave={false} type="famille" />}
            </div>
          )}

          {/* ══ CLASSES ══ */}
          {activeTab === 'classe' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Classes GPC</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Sélectionnez segment → famille pour afficher les classes</p>
                </div>
                {canWrite && selectedFamille && (
                  <button onClick={saveClasseStatus} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
                    Enregistrer
                  </button>
                )}
              </div>
              <CascadeSelects fields={[
                { label: 'Segment', value: selectedSegment, onChange: setSelectedSegment, options: segments.filter(s => s.status === 1), show: true },
                { label: 'Famille', value: selectedFamille, onChange: setSelectedFamille, options: familles.filter(f => f.status === 1), show: !!selectedSegment },
              ]} />
              {selectedFamille && <GpcTable items={classes} onEdit={(item) => openEditModal(item, 'classe')} onStatus={handleClasseStatusChange} onSave={saveClasseStatus} showSave={false} type="classe" />}
            </div>
          )}

          {/* ══ CATÉGORIES (BRICKS) ══ */}
          {activeTab === 'catégorie' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Catégories (Bricks) GPC</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Sélectionnez jusqu'au niveau classe pour afficher les bricks</p>
                </div>
                {canWrite && selectedClasse && (
                  <button onClick={saveBrickStatus} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
                    Enregistrer
                  </button>
                )}
              </div>
              <CascadeSelects fields={[
                { label: 'Segment', value: selectedSegment, onChange: setSelectedSegment, options: segments.filter(s => s.status === 1), show: true },
                { label: 'Famille', value: selectedFamille, onChange: setSelectedFamille, options: familles.filter(f => f.status === 1), show: !!selectedSegment },
                { label: 'Classe', value: selectedClasse, onChange: setSelectedClasse, options: classes.filter(c => c.status === 1), show: !!selectedFamille },
              ]} />
              {selectedClasse && <GpcTable items={bricks} onEdit={(item) => openEditModal(item, 'brick')} onStatus={handleBrickStatusChange} onSave={saveBrickStatus} showSave={false} type="brick" />}
            </div>
          )}

          {/* ══ RAYONS ══ */}
          {activeTab === 'rayon' && (
            <div className="p-6">
              <div className="mb-5">
                <h2 className="text-base font-bold text-slate-800">Rayons & Modèles</h2>
                <p className="text-xs text-slate-400 mt-0.5">Sélectionnez un brick pour voir ses rayons et l'état de leurs modèles</p>
              </div>

              <CascadeSelects fields={[
                { label: 'Segment', value: selectedSegment, onChange: setSelectedSegment, options: segments.filter(s => s.status === 1), show: true },
                { label: 'Famille', value: selectedFamille, onChange: setSelectedFamille, options: familles.filter(f => f.status === 1), show: !!selectedSegment },
                { label: 'Classe', value: selectedClasse, onChange: setSelectedClasse, options: classes.filter(c => c.status === 1), show: !!selectedFamille },
                { label: 'Brick', value: selectedBrick, onChange: setSelectedBrick, options: bricks.filter(b => b.status === 1), show: !!selectedClasse },
              ]} />

              {selectedBrick && (
                <>
                  {rayons.length === 0 ? (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                      <span className="text-lg mt-0.5">⚠️</span>
                      <div>
                        <p className="font-semibold text-amber-800">Aucun rayon mappé pour ce brick</p>
                        <p className="text-amber-700 text-xs mt-0.5">Utilisez l'outil Mapping pour associer des rayons (NMC) à ce brick, puis enregistrez-les en base.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Stats strip */}
                      {(() => {
                        const withModel = rayons.filter(r => modelExists[`${r.code}__${r.brick_code}`]).length;
                        const without = rayons.length - withModel;
                        return (
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
                              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                              {rayons.length} rayon{rayons.length > 1 ? 's' : ''}
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl text-xs font-semibold text-emerald-700 border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                              {withModel} avec modèle
                            </div>
                            {without > 0 && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl text-xs font-semibold text-orange-700 border border-orange-200">
                                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                                {without} sans modèle
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="min-w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Code Rayon</th>
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Libellé</th>
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Modèle</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rayons.map((rayon, i) => {
                              const modelKey = `${rayon.code}__${rayon.brick_code}`;
                              const hasModel = !!modelExists[modelKey];
                              return (
                                <tr key={modelKey} className={`hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}>
                                  <td className="py-3 px-4">
                                    <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{rayon.code}</code>
                                  </td>
                                  <td className="py-3 px-4 text-sm font-medium text-slate-800">{rayon.libelle}</td>
                                  <td className="py-3 px-4">
                                    {hasModel ? (
                                      <button onClick={() => openEditor(modelKey, false, rayon.libelle)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                        </svg>
                                        Voir modèle
                                      </button>
                                    ) : canWrite ? (
                                      <button onClick={() => generateSmartModel(rayon.code)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 active:scale-95 transition-all shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                                        </svg>
                                        Générer modèle
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-medium border border-slate-200">
                                        Aucun modèle
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══ DÉTAILS GPC (all_gpc) ══ */}
          {activeTab === 'all_gpc' && (
            <div className="p-6">
              <div className="mb-5">
                <h2 className="text-base font-bold text-slate-800">Détails GPC</h2>
                <p className="text-xs text-slate-400 mt-0.5">Navigation complète et gestion des modèles par brick</p>
              </div>

              <CascadeSelects fields={[
                { label: 'Segment', value: allGpcSegment, onChange: setAllGpcSegment, options: segments.filter(s => s.status === 1), show: true },
                { label: 'Famille', value: allGpcFamille, onChange: setAllGpcFamille, options: familles.filter(f => f.status === 1), show: !!allGpcSegment },
                { label: 'Classe', value: allGpcClasse, onChange: setAllGpcClasse, options: classes.filter(c => c.status === 1), show: !!allGpcFamille },
                { label: 'Brick', value: allGpcRayon, onChange: setAllGpcRayon, options: bricks.filter(b => b.status === 1), show: !!allGpcClasse },
              ]} />

              {allGpcRayon && (
                <div>
                  {allGpcRayons.length === 0 ? (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                      <span className="text-lg mt-0.5">⚠️</span>
                      <div>
                        <p className="font-semibold text-amber-800">Aucun rayon mappé pour ce brick</p>
                        <p className="text-amber-700 text-xs mt-0.5">Utilisez l'outil Mapping pour associer des rayons (NMC) à ce brick.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const withModel = allGpcRayons.filter(r => modelExists[`${r.code}__${r.brick_code}`]).length;
                        const without = allGpcRayons.length - withModel;
                        return (
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
                              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                              {allGpcRayons.length} rayon{allGpcRayons.length > 1 ? 's' : ''}
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl text-xs font-semibold text-emerald-700 border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                              {withModel} avec modèle
                            </div>
                            {without > 0 && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-xl text-xs font-semibold text-orange-700 border border-orange-200">
                                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                                {without} sans modèle
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="min-w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Code Rayon</th>
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Libellé</th>
                              <th className="py-3 px-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Modèle</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {allGpcRayons.map((rayon, i) => {
                              const modelKey = `${rayon.code}__${rayon.brick_code}`;
                              const hasModel = !!modelExists[modelKey];
                              return (
                                <tr key={modelKey} className={`hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}>
                                  <td className="py-3 px-4">
                                    <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{rayon.code}</code>
                                  </td>
                                  <td className="py-3 px-4 text-sm font-medium text-slate-800">{rayon.libelle}</td>
                                  <td className="py-3 px-4">
                                    {hasModel ? (
                                      <button onClick={() => openEditor(modelKey, false, rayon.libelle)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                        </svg>
                                        Voir modèle
                                      </button>
                                    ) : canWrite ? (
                                      <button onClick={() => generateSmartModel(rayon.code)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 active:scale-95 transition-all shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                                        </svg>
                                        Générer modèle
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-xs font-medium border border-slate-200">
                                        Aucun modèle
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {canWrite && (
                        <div className="mt-4 flex justify-end">
                          <button onClick={saveAllGpcStatus} className="px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm">
                            Enregistrer les statuts
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ MODÈLE EDITOR ══ */}
          {activeTab === 'model' && currentModel.sections && (
            <div className="p-6">
              {/* Model header */}
              <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{currentModel.libelle}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">{currentRayonCode}</p>
                </div>
                {canWrite && (
                  <button onClick={saveModel}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white text-sm font-bold rounded-xl hover:bg-blue-800 active:scale-95 transition-all shadow-md">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Enregistrer le modèle
                  </button>
                )}
              </div>

              {/* Sections */}
              <div className="space-y-4">
                {Object.entries(currentModel.sections).map(([sectionName, section]) => {
                  const theme = getSectionTheme(sectionName);
                  return (
                    <div key={sectionName} className={`rounded-xl border border-slate-200 overflow-hidden shadow-sm ${theme.borderLeft}`}>
                      {/* Section header — solid color bar */}
                      <button onClick={() => toggleSection(sectionName)}
                        className={`w-full flex items-center justify-between px-5 py-3.5 font-semibold text-sm transition-colors ${theme.header}`}>
                        <span className="flex items-center gap-2.5">
                          <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                          </svg>
                          <span>{sectionName}</span>
                          <span className="text-xs font-normal opacity-60 bg-black/5 px-2 py-0.5 rounded-full">
                            {section.fields.length} champ{section.fields.length > 1 ? 's' : ''}
                          </span>
                        </span>
                        <svg className={`w-4 h-4 transition-transform opacity-50 ${sectionOpenStates[sectionName] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>

                      {sectionOpenStates[sectionName] && (
                        <div>
                          <table className="min-w-full">
                            <thead>
                              <tr className={`border-b ${theme.thead}`}>
                                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-44">Champ</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28">Type</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28">Validation</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Observation</th>
                                {canWrite && <th className="py-2.5 px-4 w-12"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {section.fields.map((field) => (
                                <FieldRow
                                  key={field}
                                  field={field}
                                  sectionName={sectionName}
                                  canWrite={canWrite}
                                  theme={theme}
                                  description={currentModel.fieldRules[field]?.description || ''}
                                  fieldType={currentModel.fieldRules[field]?.type || 'text'}
                                  validation={currentModel.fieldRules[field]?.validation || 'OP'}
                                  observation={currentModel.fieldRules[field]?.observation || ''}
                                  values={currentModel.fieldRules[field]?.values}
                                  onDescription={updateDescription}
                                  onType={updateType}
                                  onValidation={updateValidation}
                                  onObservation={updateObservation}
                                  onValues={updateValues}
                                  onDelete={(sec, sub, f) => sub ? deleteSubsectionField(sec, sub, f) : deleteField(sec, f)}
                                />
                              ))}

                              {/* Unité Logistique selector — only in Conditionnement */}
                              {sectionName === "Conditionnement & Logistique" && (
                                <tr className="bg-orange-50/40">
                                  <td className="py-2.5 px-4 border-b border-slate-100">
                                    <span className="text-xs font-semibold text-orange-700">Unité Logistique</span>
                                  </td>
                                  <td colSpan={4} className="py-2.5 px-4 border-b border-slate-100">
                                    <select value={selectedHierarchy || ''} onChange={e => setSelectedHierarchy(e.target.value || null)}
                                      className="w-full max-w-xs px-2.5 py-1.5 text-sm border border-orange-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400">
                                      <option value="">— Sélectionner une unité logistique —</option>
                                      {hierarchyOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  </td>
                                  {canWrite && <td className="py-2.5 px-4 border-b border-slate-100"></td>}
                                </tr>
                              )}

                              {/* Hierarchy fields — purple accent */}
                              {sectionName === "Conditionnement & Logistique" && selectedHierarchy &&
                                hierarchyFields[selectedHierarchy as keyof typeof hierarchyFields]?.map(field => (
                                  <FieldRow
                                    key={`h-${field}`}
                                    field={field}
                                    sectionName={sectionName}
                                    canWrite={canWrite}
                                    theme={{ ...theme, codeBadge: 'text-purple-700 bg-purple-100', rowHover: 'hover:bg-purple-50', rowEven: 'bg-purple-50/30' }}
                                    description={currentModel.fieldRules[field]?.description || ''}
                                    fieldType={currentModel.fieldRules[field]?.type || 'text'}
                                    validation={currentModel.fieldRules[field]?.validation || 'OP'}
                                    observation={currentModel.fieldRules[field]?.observation || ''}
                                    values={currentModel.fieldRules[field]?.values}
                                    onDescription={updateDescription}
                                    onType={updateType}
                                    onValidation={updateValidation}
                                    onObservation={updateObservation}
                                    onValues={updateValues}
                                    onDelete={(sec, _sub, f) => deleteField(sec, f)}
                                  />
                                ))
                              }
                            </tbody>
                          </table>

                          {/* Subsections */}
                          {section.subsections && Object.entries(section.subsections).map(([subName, fields]) => (
                            <div key={subName} className="border-t border-slate-100">
                              <button onClick={() => toggleSubsection(sectionName, subName)}
                                className={`w-full flex items-center justify-between px-5 py-3 text-sm font-semibold transition-colors ${theme.header}`}>
                                <span className="flex items-center gap-2 pl-4">
                                  <span className="w-1 h-4 rounded-full bg-current opacity-30 inline-block"></span>
                                  {subName}
                                  <span className="text-xs font-normal opacity-60 bg-black/5 px-2 py-0.5 rounded-full">
                                    {fields.length} champ{fields.length > 1 ? 's' : ''}
                                  </span>
                                </span>
                                <svg className={`w-4 h-4 transition-transform opacity-50 ${subsectionOpenStates[`${sectionName}-${subName}`] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                                </svg>
                              </button>
                              {subsectionOpenStates[`${sectionName}-${subName}`] && (
                                <table className="min-w-full">
                                  <thead>
                                    <tr className={`border-b ${theme.thead}`}>
                                      <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-44">Champ</th>
                                      <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                                      <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28">Type</th>
                                      <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-28">Validation</th>
                                      <th className="py-2.5 px-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Observation</th>
                                      {canWrite && <th className="py-2.5 px-4 w-12"></th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fields.map(field => (
                                      <FieldRow
                                        key={field}
                                        field={field}
                                        sectionName={sectionName}
                                        subsectionName={subName}
                                        canWrite={canWrite}
                                        theme={theme}
                                        description={currentModel.fieldRules[field]?.description || ''}
                                        fieldType={currentModel.fieldRules[field]?.type || 'text'}
                                        validation={currentModel.fieldRules[field]?.validation || 'OP'}
                                        observation={currentModel.fieldRules[field]?.observation || ''}
                                        values={currentModel.fieldRules[field]?.values}
                                        onDescription={updateDescription}
                                        onType={updateType}
                                        onValidation={updateValidation}
                                        onObservation={updateObservation}
                                        onValues={updateValues}
                                        onDelete={(sec, sub, f) => sub ? deleteSubsectionField(sec, sub, f) : deleteField(sec, f)}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>{/* end main card */}
      </div>{/* end px-6 */}

      {/* ══ EDIT MODAL ══ */}
      {isEditing && editItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 capitalize">Modifier {editType}</h2>
              <button onClick={closeEditModal} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-lg">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Code', key: 'code', disabled: true },
                { label: 'Libellé FR', key: 'libelle', disabled: false },
                { label: 'Libellé EN', key: 'libelle_en', disabled: false },
                { label: 'Libellé AR', key: 'libelle_ar', disabled: false },
              ].map(({ label, key, disabled }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">{label}</label>
                  <input type="text" value={(editItem as any)[key] || ''} disabled={disabled}
                    onChange={e => setEditItem({ ...editItem, [key]: e.target.value } as any)}
                    className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-800'}`} />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeEditModal} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Annuler</button>
              <button onClick={saveEdit} className="px-5 py-2 text-sm font-bold text-white bg-blue-900 rounded-xl hover:bg-blue-800 transition-colors shadow-sm">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BULK GEN MODAL (kept for reference, triggered nowhere now but code preserved) ══ */}
      {bulkGenOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-purple-700 rounded-t-2xl">
              <h2 className="text-white text-base font-bold flex items-center gap-2">🤖 Génération Smart Models — Tous les Bricks</h2>
              {!bulkGenRunning && <button onClick={() => setBulkGenOpen(false)} className="text-white/80 hover:text-white text-xl font-bold">✕</button>}
            </div>
            <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4">
              {!bulkGenRunning && !bulkGenProgress.complete && (
                <div className="flex flex-col gap-4">
                  <p className="text-slate-500 text-sm">Génère automatiquement les modèles pour <strong>tous les bricks actifs</strong>. Les modèles existants sont ignorés sauf si &quot;Écraser&quot; est coché.</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={bulkGenOverwrite} onChange={e => setBulkGenOverwrite(e.target.checked)} className="rounded accent-purple-700" />
                    Écraser les modèles existants
                  </label>
                  <button onClick={generateAllModels} className="self-start px-6 py-3 bg-purple-700 text-white rounded-xl font-bold hover:bg-purple-800 shadow transition-colors">🚀 Lancer la génération</button>
                </div>
              )}
              {(bulkGenRunning || bulkGenProgress.total > 0) && (
                <div>
                  <div className="flex justify-between text-sm font-medium text-slate-600 mb-1.5">
                    <span>{bulkGenProgress.done} / {bulkGenProgress.total || '?'} bricks</span>
                    <span className="flex gap-3 text-xs">
                      <span className="text-emerald-600">✅ {bulkGenProgress.succeeded}</span>
                      <span className="text-slate-400">⏭ {bulkGenProgress.skipped}</span>
                      <span className="text-red-500">❌ {bulkGenProgress.failed}</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className={`h-2 rounded-full transition-all duration-300 ${bulkGenProgress.complete ? 'bg-emerald-500' : 'bg-purple-600'}`}
                      style={{ width: bulkGenProgress.total > 0 ? `${(bulkGenProgress.done / bulkGenProgress.total) * 100}%` : '0%' }} />
                  </div>
                  {bulkGenRunning && <p className="text-xs text-slate-400 mt-1 animate-pulse">⏳ Génération en cours…</p>}
                  {bulkGenProgress.complete && <p className="text-sm font-semibold text-emerald-600 mt-1">✅ Génération terminée !</p>}
                </div>
              )}
              {bulkGenProgress.log.length > 0 && (
                <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-3 text-xs font-mono space-y-1 min-h-0 max-h-64">
                  {bulkGenProgress.log.map((entry, i) => (
                    <div key={i} className={`flex items-start gap-2 ${entry.status === 'done' ? 'text-emerald-700' : entry.status === 'skipped' ? 'text-slate-400' : entry.status === 'error' ? 'text-red-600' : 'text-purple-600'}`}>
                      <span className="shrink-0">{entry.status === 'done' ? '✅' : entry.status === 'skipped' ? '⏭' : entry.status === 'error' ? '❌' : '⚙️'}</span>
                      <span><strong>[{entry.rayonCode}]</strong> {entry.brickName}{entry.status === 'error' && entry.error && <span className="ml-1 text-red-400">— {entry.error}</span>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center bg-slate-50 rounded-b-2xl">
              {bulkGenProgress.complete
                ? <button onClick={() => { setBulkGenOpen(false); setBulkGenProgress({ done: 0, total: 0, succeeded: 0, skipped: 0, failed: 0, log: [], complete: false }); }} className="px-4 py-2 bg-purple-700 text-white rounded-xl hover:bg-purple-800 font-semibold text-sm">Fermer</button>
                : <button onClick={() => !bulkGenRunning && setBulkGenOpen(false)} disabled={bulkGenRunning} className={`px-4 py-2 rounded-xl font-semibold text-sm ${bulkGenRunning ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>{bulkGenRunning ? 'Génération en cours…' : 'Annuler'}</button>}
              <span className="text-xs text-slate-400">Seuls les bricks status=1 sont traités</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Gpc;