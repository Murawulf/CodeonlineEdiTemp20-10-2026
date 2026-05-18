import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Listbox } from '@headlessui/react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const LOCAL_API_BASE = import.meta.env.DEV
  ? 'http://localhost:5001'
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5001');

// Define types
interface Option {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  icon: string;
}
interface ProgressModalProps {
  show: boolean;
  progress: number;
  errorMessage: string;
  downloadUrl: string;
  onClose: () => void;
}

interface FieldRule {
  type: string;
  required?: boolean;
  length: number;
  decimals: number;
  description: string;
  values?: string[];
}

interface Section {
  fields: string[];
  collapsed: boolean;
  subsections?: { [key: string]: string[] };
}

interface HierarchyData {
  level: string;
  fields: string[];
}

interface CustomField {
  section: string;
  title: string;
  type: string;
  description: string;
  required: boolean;
  length: number;
  decimals: number;
}

interface FormData {
  segment: string;
  family: string;
  class: string;
  brick: string;
  rayon: string;
  gln: string;
  gtin: string;
  marque: string;
  sous_marque: string;
  libelle_court: string;
  pays_origine: string;
  produit_transforme: string;
  unite_logistique: string;
  [key: string]: string;
}


// Data for dropdowns
const countries = ["Tunisia", "Afghanistan", "Albania", "Asmeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Besmium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Busmaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Brazzaville)", "Congo (Kinshasa)", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "North Korea", "South Korea", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"];
const packagingTypes = ["Carton", "Plastique", "Verre", "Métal", "Bois", "Papier", "Sachet", "Film plastique", "Barquette", "Bouteille"];
const palletTypes = ["EUR/EPAL", "CP1", "CP2", "CP3", "CP4", "CP5", "CP6", "CP7", "CP8", "CP9", "Palette personnalisée"];
const hierarchyOptions = ["PK (Lot Consommateur Homogène)", "AP (Lot Consommateur Hétérogène)", "CA (Colis Homogène)", "DS (Colis Hétérogène)", "PL (Palette Homogène)", "MX (Palette Hétérogène)"];
const hierarchyFields = {
  "PK (Lot Consommateur Homogène)": [
    "gtin_d", "childTradeItem", "quantityofNextLowerLevelTradeItem", "quantityOfCompleteLayersContainedInATradeItem",
    "quantityOfTradeItemsContainedInACompleteLayer", "isTradeItemADespatchUnit", "isTradeItemAnInvoiceUnit",
    "isTradeItemAnOrderableUnit", "isTradeItemAModel", "isTradeItemADivisibleItem", "hasDisplayReadyPackaging",
    "isTradeItemPackedIrregularly", "compositionDepthValue", "compositionWidthValue", "alimentaryProduct",
    "TradeItemDisplayDimensions", "contactGLN", "orderingUnitOfMeasure", "invoicingUnitOfMeasure",
    "packageMarksDietAllergen", "cataloguePriceBasisQuantity", "cataloguePriceBasisUnitOfMeasure",
    "tradeItemWeight", "tradeItemVolume", "packagingMaterial", "stackingFactor", "maxStackingWeight",
    "palletLayerQuantity", "type_emballage", "palletTypeCode"
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

// Mock Card Components (replace with actual imports in your project)
const Card = ({ className, children }) => (
  <div className={`bg-white shadow-md rounded-sm ${className}`}>{children}</div>
);
const CardHeader = ({ className, children, onClick }) => (
  <div className={`p-4 ${className}`} onClick={onClick}>{children}</div>
);
const CardTitle = ({ className, children }) => (
  <h2 className={`text-sm font-semibold ${className}`}>{children}</h2>
);
const CardContent = ({ className, children }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);
const ProgressModal = ({ show, progress, errorMessage, downloadUrl, onClose }: ProgressModalProps) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-sm shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Génération des fiches produits</h2>
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">{Math.round(progress)}% complété</p>
        </div>
        {errorMessage && (
          <p className="text-red-600 mb-4">{errorMessage}</p>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download="product_sheets.zip"
            className="text-blue-600 underline mb-4 block"
          >
            Télécharger les fiches produits
          </a>
        )}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 text-sm"
            disabled={progress < 100 && !errorMessage}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
// IngredientsTable component
const IngredientsTable = ({ font, value, onChange }) => {
  const [entries, setEntries] = useState(
    value ? value.split(", ").map(entry => {
      const [ingredient, valUnit] = entry.split(" ");
      const [val, unit] = valUnit ? valUnit.split("(") : ["", ""];
      return {
        ingredient,
        value: val || "",
        unit: unit ? unit.replace(")", "") : "",
        isPercentage: val?.includes("%") || false
      };
    }) : [{ ingredient: "", value: "", unit: "", isPercentage: false }]
  );

  const addRow = () => setEntries([...entries, { ingredient: "", value: "", unit: "", isPercentage: false }]);

  const removeRow = (index) => {
    if (entries.length > 1) {
      const newEntries = entries.filter((_, i) => i !== index);
      setEntries(newEntries);
      onChange(newEntries.map(e => `${e.ingredient} ${e.value}${e.isPercentage ? "%" : ""}${e.unit ? `(${e.unit})` : ""}`).filter(e => e.trim()).join(", "));
    }
  };

  const updateEntry = (index, field, val) => {
    const newEntries = [...entries];
    if (field === "isPercentage") {
      newEntries[index][field] = val;
      newEntries[index].value = val ? `${newEntries[index].value}%` : newEntries[index].value.replace("%", "");
    } else {
      newEntries[index][field] = val;
    }
    setEntries(newEntries);
    onChange(newEntries.map(e => `${e.ingredient} ${e.value}${e.unit ? `(${e.unit})` : ""}`).filter(e => e.trim()).join(", "));
  };

  return (
    <div className="bg-white p-2">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100">Ingrédient</th>
            <th className="border p-2 bg-gray-100">Valeur</th>
            <th className="border p-2 bg-gray-100">Type</th>
            <th className="border p-2 bg-gray-100">Unité</th>
            <th className="border p-2 bg-gray-100">Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={index}>
              <td className="border p-1">
                <input
                  type="text"
                  value={entry.ingredient}
                  onChange={(e) => updateEntry(index, "ingredient", e.target.value)}
                  className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
                  style={{ fontFamily: font }}
                />
              </td>
              <td className="border p-1">
                <input
                  type="text"
                  value={entry.value.replace("%", "")}
                  onChange={(e) => updateEntry(index, "value", e.target.value)}
                  className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
                  style={{ fontFamily: font }}
                />
              </td>
              <td className="border p-1">
                <select
                  value={entry.isPercentage ? "percentage" : "number"}
                  onChange={(e) => updateEntry(index, "isPercentage", e.target.value === "percentage")}
                  className="w-full border p-1 rounded bg-gray-50"
                >
                  <option value="number">Nombre</option>
                  <option value="percentage">Pourcentage</option>
                </select>
              </td>
              <td className="border p-1">
                <Listbox value={entry.unit} onChange={(val) => updateEntry(index, "unit", val)} as="div">
                  <Listbox.Button className="w-full border p-1 rounded bg-gray-50">
                    {entry.unit || "Unité"}
                  </Listbox.Button>
                  <Listbox.Options className="border mt-1 rounded max-h-40 overflow-y-auto">
                    {["ml", "cl", "l", "mg", "g", "kg"].map(u => (
                      <Listbox.Option key={u} value={u} className="p-2 hover:bg-gray-100 cursor-pointer">
                        {u}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </Listbox>
              </td>
              <td className="border p-1">
                <button onClick={() => removeRow(index)} className="text-red-600 hover:bg-red-200 rounded-full w-6 h-6 flex items-center justify-center">✖</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="text-green-600 hover:bg-green-200 rounded-full w-6 h-6 flex items-center justify-center">+</button>
    </div>
  );
};

// NutritionTable component
const NutritionTable = ({ font, value, onChange }) => {
  const initialEntries = [
    { nutrient: "Valeur énergétique en kJ", perSlice: "", per100g: "", unit: "kJ", fixed: true },
    { nutrient: "Valeur énergétique en kCal", perSlice: "", per100g: "", unit: "kcal", fixed: true },
    ...(value ? value.split(", ").map(entry => {
      const [nutrient, val, unit] = entry.split(" ");
      return { nutrient, perSlice: val, per100g: "", unit, fixed: false };
    }) : [])
  ];

  const [entries, setEntries] = useState(initialEntries);

  const addRow = () => {
    setEntries([...entries, { nutrient: "", perSlice: "", per100g: "", unit: "g", fixed: false }]);
  };

  const removeRow = (index) => {
    if (!entries[index].fixed && entries.length > 2) {
      const newEntries = entries.filter((_, i) => i !== index);
      setEntries(newEntries);
      onChange(newEntries.slice(2).map(e => `${e.nutrient} ${e.perSlice} ${e.unit}`).filter(e => e.trim()).join(", "));
    }
  };

  const updateEntry = (index, field, val) => {
    const newEntries = [...entries];
    newEntries[index][field] = val;
    setEntries(newEntries);
    onChange(newEntries.slice(2).map(e => `${e.nutrient} ${e.perSlice} ${e.unit}`).filter(e => e.trim()).join(", "));
  };

  return (
    <div className="bg-white p-2">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-100">Nutriment</th>
            <th className="border p-2 bg-gray-100">1 tranche (~33.7g)</th>
            <th className="border p-2 bg-gray-100">pour 100.0g</th>
            <th className="border p-2 bg-gray-100">Unité</th>
            <th className="border p-2 bg-gray-100">Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={index}>
              <td className="border p-1">
                {entry.fixed ? (
                  <span>{entry.nutrient}</span>
                ) : (
                  <input
                    type="text"
                    value={entry.nutrient}
                    onChange={(e) => updateEntry(index, "nutrient", e.target.value)}
                    className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
                    style={{ fontFamily: font }}
                  />
                )}
              </td>
              <td className="border p-1">
                <input
                  type="text"
                  value={entry.perSlice}
                  onChange={(e) => updateEntry(index, "perSlice", e.target.value)}
                  className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
                  style={{ fontFamily: font }}
                />
              </td>
              <td className="border p-1">
                <input
                  type="text"
                  value={entry.per100g}
                  onChange={(e) => updateEntry(index, "per100g", e.target.value)}
                  className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
                  style={{ fontFamily: font }}
                />
              </td>
              <td className="border p-1">
                {entry.fixed ? (
                  <span>{entry.unit}</span>
                ) : (
                  <Listbox value={entry.unit} onChange={(val) => updateEntry(index, "unit", val)} as="div">
                    <Listbox.Button className="w-full border p-1 rounded bg-gray-50">
                      {entry.unit}
                    </Listbox.Button>
                    <Listbox.Options className="border mt-1 rounded max-h-40 overflow-y-auto">
                      {["g", "mg", "kg"].map(u => (
                        <Listbox.Option key={u} value={u} className="p-2 hover:bg-gray-100 cursor-pointer">
                          {u}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Listbox>
                )}
              </td>
              <td className="border p-1">
                {!entry.fixed && (
                  <button onClick={() => removeRow(index)} className="text-red-600 hover:bg-red-200 rounded-full w-6 h-6 flex items-center justify-center">✖</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="text-green-600 hover:bg-green-200 rounded-full w-6 h-6 flex items-center justify-center">+</button>
    </div>
  );
};

// TagEntry component
const TagEntry = ({ font, maxLength, onTagAdded, value, onChange }) => {
  const [tags, setTags] = useState(value ? value.split(", ").filter(Boolean) : []);
  const [inputValue, setInputValue] = useState("");
  const [unitWindowOpen, setUnitWindowOpen] = useState(false);
  const [unit, setUnit] = useState("");
  const units = ["ml", "cl", "l", "mg", "g", "kg"];

  const addTag = () => {
    const tagText = inputValue.trim();
    if (!tagText) return;

    const currentLength = tags.reduce((sum, tag) => sum + tag.length, 0) + tags.length - 1;
    if (currentLength + tagText.length + 1 <= maxLength) {
      setTags([...tags, tagText]);
      setInputValue("");
      setUnitWindowOpen(true);
      if (onTagAdded) onTagAdded(tagText);
      onChange([...tags, tagText].join(", "));
    } else {
      alert("Limite atteinte: La longueur maximale des tags est dépassée.");
    }
  };

  const removeTag = (tag) => {
    const newTags = tags.filter(t => t !== tag);
    setTags(newTags);
    onChange(newTags.join(", "));
  };

  const saveUnit = () => {
    if (unit && tags.length > 0) {
      const newTags = [...tags];
      newTags[newTags.length - 1] = `${newTags[newTags.length - 1]} (${unit})`;
      setTags(newTags);
      onChange(newTags.join(", "));
    }
    setUnitWindowOpen(false);
    setUnit("");
  };

  return (
    <div className="bg-white p-2">
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map(tag => (
          <div key={tag} className="flex items-center bg-gray-200 rounded px-2 py-1">
            <span className="text-gray-800">{tag}</span>
            <button onClick={() => removeTag(tag)} className="ml-2 text-red-600 hover:bg-red-200 rounded-full w-5 h-5 flex items-center justify-center">✖</button>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && addTag()}
        className="w-full border p-2 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
        style={{ fontFamily: font }}
      />
      {unitWindowOpen && (
        <div className="absolute bg-white border rounded shadow-sm mt-1 z-10">
          <Listbox value={unit} onChange={(val) => setUnit(val)} as="div">
            <Listbox.Button className="w-full border p-2 rounded bg-gray-50">{unit || "Sélectionner une unité"}</Listbox.Button>
            <Listbox.Options className="border mt-1 rounded max-h-40 overflow-y-auto">
              {units.map(u => (
                <Listbox.Option key={u} value={u} className="p-2 hover:bg-gray-100 cursor-pointer">
                  {u}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Listbox>
          <button onClick={saveUnit} className="w-full mt-1 px-4 py-1 bg-blue-500 text-white rounded">Enregistrer</button>
        </div>
      )}
    </div>
  );
};

// CountrySelector component
const CountrySelector = ({ value, onChange }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCountries, setFilteredCountries] = useState(countries);

  useEffect(() => {
    const filtered = countries.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase()));
    setFilteredCountries(filtered);
  }, [searchTerm]);

  const handleCountrySelect = (country) => {
    onChange(country);
  };

  return (
    <div className="flex gap-2 items-start">
      <div className="w-full">
        <Listbox value={value} onChange={handleCountrySelect} as="div">
          <Listbox.Button className="w-full border p-2 rounded bg-gray-50 text-left flex justify-between items-center">
            <span>{value || "Sélectionner un pays"}</span>
            <span>▼</span>
          </Listbox.Button>
          <Listbox.Options className="border mt-1 rounded max-h-40 overflow-y-auto bg-white shadow-sm">
            <div className="p-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un pays..."
                className="w-full border p-1 rounded bg-gray-50 focus:bg-blue-50 focus:border-blue-500 outline-none"
              />
            </div>
            {filteredCountries.map(country => (
              <Listbox.Option key={country} value={country} className="p-2 hover:bg-blue-100 cursor-pointer">
                {country}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Listbox>
      </div>
    </div>
  );
};

// Main Component
const GenerateurModele = () => {
  const [showProgressModal, setShowProgressModal] = useState(false);
const [progress, setProgress] = useState(0);
const [errorMessage, setErrorMessage] = useState('');
const [downloadUrl, setDownloadUrl] = useState('');
  const [formData, setFormData] = useState({
    segment: '', family: '', class: '', brick: '', rayon: '',
    gln: '', gtin: '', marque: '', sous_marque: '', libelle_court: '',
    pays_origine: 'Tunisia', produit_transforme: 'Non', unite_logistique: ''
  });
  const [dynamicFields, setDynamicFields] = useState({});
  const [fieldRules, setFieldRules] = useState({});
  const [segments, setSegments] = useState([]);
  const [families, setFamilies] = useState([]);
  const [classes, setClasses] = useState([]);
  const [bricks, setBricks] = useState([]);
  const [rayons, setRayons] = useState([]);
  const [hierarchyData, setHierarchyData] = useState([]);
  const [isLogisticsComplete, setIsLogisticsComplete] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [sections, setSections] = useState({});
  const [extraFields, setExtraFields] = useState([]);
  const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
  const [customField, setCustomField] = useState({ section: '', title: '', type: 'text', description: '', required: false, length: 255, decimals: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [removedFields, setRemovedFields] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fieldToRemove, setFieldToRemove] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [segmentsRes] = await Promise.all([
          axios.get(`${LOCAL_API_BASE}/api/segments`)
        ]);

        const segmentsData = Array.isArray(segmentsRes.data) ? segmentsRes.data : [];
        setSegments(segmentsData);

        const rules = {
          quantite_nette: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité nette' },
          nombre_de_portions: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Nombre de portions' },
          gln: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN' },
          gtin: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN' },
          liste_des_ingredients: { type: 'multivalue', required: false, length: 255, decimals: 0, description: 'Liste des ingrédients' },
          declaration_des_allergenes: { type: 'multivalue', required: false, length: 255, decimals: 0, description: 'Déclaration des allergènes' },
          valeurs_nutritionnelles: { type: 'multivalue', required: false, length: 255, decimals: 0, description: 'Valeurs nutritionnelles' },
          produit_halal: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit halal' },
          produit_consigne: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit consigné' },
          produit_a_decouper: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit à découper' },
          produits_dangereux: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produits dangereux' },
          produits_alimentaires: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produits alimentaires' },
          produits_saisonniers: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produits saisonniers' },
          produits_bio: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produits bio' },
          duree_vie_minimale_livraison: { type: 'days', required: false, length: 255, decimals: 0, description: 'Durée de vie minimale à la livraison' },
          duree_vie_du_produit: { type: 'days', required: false, length: 255, decimals: 0, description: 'Durée de vie du produit' },
          pays_origine: { type: 'dropdown', values: countries, required: false, length: 255, decimals: 0, description: 'Pays d\'origine' },
          type_emballage: { type: 'dropdown', values: packagingTypes, required: false, length: 255, decimals: 0, description: 'Type d\'emballage' },
          palletTypeCode: { type: 'dropdown', values: palletTypes, required: false, length: 255, decimals: 0, description: 'Type de palette' },
          date_debut_disponibilite: { type: 'date', required: false, length: 255, decimals: 0, description: 'Date de début de disponibilité' },
          produit_transforme: { type: 'dropdown', values: ['Oui', 'Non'], required: false, length: 255, decimals: 0, description: 'Produit transformé' },
          denomination_legale: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dénomination légale' },
          conditions_de_conservation: { type: 'text', required: false, length: 255, decimals: 0, description: 'Conditions de conservation' },
          etat_de_preparation: { type: 'text', required: false, length: 255, decimals: 0, description: 'État de préparation' },
          mode_d_emploi: { type: 'text', required: false, length: 255, decimals: 0, description: 'Mode d\'emploi' },
          mentions_obligatoires_complementaires: { type: 'text', required: false, length: 255, decimals: 0, description: 'Mentions obligatoires complémentaires' },
          argumentaire_produit: { type: 'text', required: false, length: 255, decimals: 0, description: 'Argumentaire produit' },
          allegation_sante: { type: 'text', required: false, length: 255, decimals: 0, description: 'Allégation santé' },
          allegation_nutritionnelle: { type: 'text', required: false, length: 255, decimals: 0, description: 'Allégation nutritionnelle' },
          libelle_internet: { type: 'text', required: false, length: 255, decimals: 0, description: 'Libellé internet' },
          gpc: { type: 'text', required: false, length: 255, decimals: 0, description: 'GPC' },
          marche_cible: { type: 'text', required: false, length: 255, decimals: 0, description: 'Marché cible' },
          valeurs_nutritionnelles_100g: { type: 'text', required: false, length: 255, decimals: 0, description: 'Valeurs nutritionnelles pour 100g' },
          valeurs_nutritionnelles_a_la_portion: { type: 'text', required: false, length: 255, decimals: 0, description: 'Valeurs nutritionnelles à la portion' },
          dimensions_hors_emballage_diff: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dimensions hors emballage' },
          emballage_retournable: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage retournable' },
          date_debut_dispo_commande: { type: 'date', required: false, length: 255, decimals: 0, description: 'Date de début de disponibilité commande' },
          mesures_unite_commerciale: { type: 'text', required: false, length: 255, decimals: 0, description: 'Mesures unité commerciale' },
          article_reapprovisionnable: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Article réapprovisionnable' },
          unite_logistique: { type: 'dropdown', values: hierarchyOptions, required: false, length: 255, decimals: 0, description: 'Unité logistique' },
          unite_commande: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de commande' },
          unite_facturable: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité facturable' },
          vrac: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Vrac' },
          fournisseur: { type: 'text', required: false, length: 255, decimals: 0, description: 'Fournisseur' },
          type_de_marque: { type: 'text', required: false, length: 255, decimals: 0, description: 'Type de marque' },
          prix_unitaire: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Prix unitaire' },
          unite_legale: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité légale' },
          nom_fonctionnel: { type: 'text', required: false, length: 255, decimals: 0, description: 'Nom fonctionnel' },
          type_de_taxe: { type: 'text', required: false, length: 255, decimals: 0, description: 'Type de taxe' },
          code_nomenclature_douaniere: { type: 'text', required: false, length: 255, decimals: 0, description: 'Code nomenclature douanière' },
          unite_consommateur: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité consommateur' },
          // Hierarchy fields
          gtin_d: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN du niveau' },
          childTradeItem: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant' },
          quantityofNextLowerLevelTradeItem: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur' },
          quantityOfCompleteLayersContainedInATradeItem: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Couches complètes contenues' },
          quantityOfTradeItemsContainedInACompleteLayer: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Articles par couche complète' },
          isTradeItemADespatchUnit: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité d\'expédition' },
          isTradeItemAnInvoiceUnit: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité de facturation' },
          isTradeItemAnOrderableUnit: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité commandable' },
          isTradeItemAModel: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Est un modèle' },
          isTradeItemADivisibleItem: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Article divisible' },
          hasDisplayReadyPackaging: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage' },
          isTradeItemPackedIrregularly: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier' },
          compositionDepthValue: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition' },
          compositionWidthValue: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition' },
          alimentaryProduct: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit alimentaire' },
          TradeItemDisplayDimensions: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dimensions d\'affichage' },
          contactGLN: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact' },
          orderingUnitOfMeasure: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande' },
          invoicingUnitOfMeasure: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation' },
          packageMarksDietAllergen: { type: 'text', required: false, length: 255, decimals: 0, description: 'Marques d\'allergènes' },
          cataloguePriceBasisQuantity: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de base du prix catalogue' },
          cataloguePriceBasisUnitOfMeasure: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure du prix catalogue' },
          tradeItemWeight: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article' },
          tradeItemVolume: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article' },
          packagingMaterial: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage' },
          stackingFactor: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Facteur d\'empilage' },
          maxStackingWeight: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids maximal d\'empilage' },
          palletLayerQuantity: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de couches de palette' },
          packagingTypeCode: { type: 'text', required: false, length: 255, decimals: 0, description: 'Code de type d\'emballage' },
          unite_logistique_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité logistique AP' },
          unite_facturable_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité facturable AP' },
          unite_commandable_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité commandable AP' },
          isTradeItemAModel_ap: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Est un modèle AP' },
          isTradeItemADivisibleItem_ap: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Article divisible AP' },
          hasDisplayReadyPackaging_ap: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage AP' },
          isTradeItemPackedIrregularly_ap: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier AP' },
          compositionDepthValue_ap: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition AP' },
          compositionWidthValue_ap: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition AP' },
          alimentaryProduct_ap: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit alimentaire AP' },
          TradeItemDisplayDimensions_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dimensions d\'affichage AP' },
          contactGLN_ap: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact AP' },
          orderingUnitOfMeasure_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande AP' },
          invoicingUnitOfMeasure_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation AP' },
          gtin_d_ap: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN du niveau AP' },
          childTradeItem_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant AP' },
          quantityofNextLowerLevelTradeItem_ap: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur AP' },
          packageMarksDietAllergen_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Marques d\'allergènes AP' },
          tradeItemWeight_ap: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article AP' },
          tradeItemVolume_ap: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article AP' },
          packagingMaterial_ap: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage AP' },
          stackingFactor_ap: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Facteur d\'empilage AP' },
          gtin_d_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN du niveau CA' },
          childTradeItem_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant CA' },
          quantityofNextLowerLevelTradeItem_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur CA' },
          quantityOfCompleteLayersContainedInATradeItem_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Couches complètes contenues CA' },
          quantityOfTradeItemsContainedInACompleteLayer_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Articles par couche complète CA' },
          isTradeItemAConsumerUnit: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité consommateur CA' },
          unite_facturable_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité facturable CA' },
          unite_commandable_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité commandable CA' },
          isTradeItemAFullDisplayStand: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Présentoir complet CA' },
          hasDisplayReadyPackaging_ca: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage CA' },
          isTradeItemPackedIrregularly_ca: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier CA' },
          compositionDepthValue_ca: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition CA' },
          compositionWidthValue_ca: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition CA' },
          alimentaryProduct_ca: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Produit alimentaire CA' },
          contactGLN_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact CA' },
          orderingUnitOfMeasure_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande CA' },
          invoicingUnitOfMeasure_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation CA' },
          tradeItemWeight_ca: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article CA' },
          tradeItemVolume_ca: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article CA' },
          packagingMaterial_ca: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage CA' },
          maxStackingWeight_ca: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids maximal d\'empilage CA' },
          palletLayerQuantity_ca: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de couches de palette CA' },
          quantityofNextLowerLevelTradeItem_ds: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur DS' },
          quantityOfCompleteLayersContainedInATradeItem_ds: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Couches complètes contenues DS' },
          quantityOfTradeItemsContainedInACompleteLayer_ds: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Articles par couche complète DS' },
          unite_facturable_ds: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité facturable DS' },
          isTradeItemAFullDisplayStand_ds: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Présentoir complet DS' },
          hasDisplayReadyPackaging_ds: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage DS' },
          isTradeItemPackedIrregularly_ds: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier DS' },
          compositionDepthValue_ds: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition DS' },
          compositionWidthValue_ds: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition DS' },
          contactGLN_ds: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact DS' },
          orderingUnitOfMeasure_ds: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande DS' },
          invoicingUnitOfMeasure_ds: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation DS' },
          tradeItemWeight_ds: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article DS' },
          tradeItemVolume_ds: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article DS' },
          packagingMaterial_ds: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage DS' },
          maxStackingWeight_ds: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids maximal d\'empilage DS' },
          palletLayerQuantity_ds: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de couches de palette DS' },
          gtin_d_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN du niveau PL' },
          childTradeItem_pl: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant PL' },
          quantityofNextLowerLevelTradeItem_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur PL' },
          quantityOfCompleteLayersContainedInATradeItem_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Couches complètes contenues PL' },
          quantityOfTradeItemsContainedInACompleteLayer_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Articles par couche complète PL' },
          isTradeItemAnInvoiceUnit_pl: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité de facturation PL' },
          isTradeItemAnOrderableUnit_pl: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité commandable PL' },
          isTradeItemAFullDisplayStand_pl: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Présentoir complet PL' },
          hasDisplayReadyPackaging_pl: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage PL' },
          isTradeItemPackedIrregularly_pl: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier PL' },
          compositionDepthValue_pl: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition PL' },
          compositionWidthValue_pl: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition PL' },
          contactGLN_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact PL' },
          orderingUnitOfMeasure_pl: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande PL' },
          invoicingUnitOfMeasure_pl: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation PL' },
          palletLayerQuantity_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de couches de palette PL' },
          tradeItemWeight_pl: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article PL' },
          tradeItemVolume_pl: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article PL' },
          packagingMaterial_pl: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage PL' },
          maxStackingWeight_pl: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids maximal d\'empilage PL' },
          stackingFactor_pl: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Facteur d\'empilage PL' },
          palletDimensions_pl: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dimensions de la palette PL' },
          gtin_d_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GTIN du niveau MX' },
          childTradeItem1: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant 1 MX' },
          quantityofNextLowerLevelTradeItem1: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur 1 MX' },
          childTradeItem2: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant 2 MX' },
          quantityofNextLowerLevelTradeItem2: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur 2 MX' },
          childTradeItem3: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant 3 MX' },
          quantityofNextLowerLevelTradeItem3: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur 3 MX' },
          childTradeItem4: { type: 'text', required: false, length: 255, decimals: 0, description: 'Article enfant 4 MX' },
          quantityofNextLowerLevelTradeItem4: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité du niveau inférieur 4 MX' },
          quantityOfCompleteLayersContainedInATradeItem_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Couches complètes contenues MX' },
          quantityOfTradeItemsContainedInACompleteLayer_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Articles par couche complète MX' },
          isTradeItemAnInvoiceUnit_mx: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Unité de facturation MX' },
          isTradeItemAFullDisplayStand_mx: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Présentoir complet MX' },
          hasDisplayReadyPackaging_mx: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage prêt à l\'affichage MX' },
          isTradeItemPackedIrregularly_mx: { type: 'boolean', required: false, length: 255, decimals: 0, description: 'Emballage irrégulier MX' },
          compositionDepthValue_mx: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Profondeur de composition MX' },
          compositionWidthValue_mx: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Largeur de composition MX' },
          contactGLN_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'GLN de contact MX' },
          orderingUnitOfMeasure_mx: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de commande MX' },
          invoicingUnitOfMeasure_mx: { type: 'text', required: false, length: 255, decimals: 0, description: 'Unité de mesure de facturation MX' },
          palletLayerQuantity_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Quantité de couches de palette MX' },
          tradeItemWeight_mx: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids de l\'article MX' },
          tradeItemVolume_mx: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Volume de l\'article MX' },
          packagingMaterial_mx: { type: 'text', required: false, length: 255, decimals: 0, description: 'Matériau d\'emballage MX' },
          maxStackingWeight_mx: { type: 'numeric', required: false, length: 255, decimals: 2, description: 'Poids maximal d\'empilage MX' },
          stackingFactor_mx: { type: 'numeric', required: false, length: 255, decimals: 0, description: 'Facteur d\'empilage MX' },
          palletDimensions_mx: { type: 'text', required: false, length: 255, decimals: 0, description: 'Dimensions de la palette MX' }
        };
        setFieldRules(rules);
      } catch (err) {
        setError('Échec du chargement des données initiales: ' + (err.message || 'Erreur inconnue'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
// Fetch families when segment changes
  useEffect(() => {
    if (!formData.segment) return;
    const fetchFamilies = async () => {
      try {
        const res = await axios.get<string[]>(`${LOCAL_API_BASE}/api/familles_by_segment?codeSegment=${encodeURIComponent(formData.segment)}`);  
        setFamilies(Array.isArray(res.data) ? res.data : []);
        setFormData(prev => ({ ...prev, family: '', class: '', brick: '', rayon: '' }));
        setClasses([]);
        setBricks([]);
        setRayons([]);
      } catch (err) {
        console.error('Erreur lors de la récupération des familles:', err);
        setFamilies([]);
      }
    };
    fetchFamilies();
  }, [formData.segment]);

  // Fetch classes when family changes
  useEffect(() => {
    if (!formData.family) return;
    const fetchClasses = async () => {
      try {
        const res = await axios.get<string[]>(`${LOCAL_API_BASE}/api/classes_by_famille?codeFamille=${encodeURIComponent(formData.family)}`);  
        setClasses(Array.isArray(res.data) ? res.data : []);
        setFormData(prev => ({ ...prev, class: '', brick: '', rayon: '' }));
        setBricks([]);
        setRayons([]);
      } catch (err) {
        console.error('Erreur lors de la récupération des classes:', err);
        setClasses([]);
      }
    };
    fetchClasses();
  }, [formData.family]);

  // Fetch bricks when class changes
  useEffect(() => {
    if (!formData.class) return;
    const fetchBricks = async () => {
      try {
        const res = await axios.get<string[]>(`${LOCAL_API_BASE}/api/bricks_by_class?codeClasse=${encodeURIComponent(formData.class)}`);  
        setBricks(Array.isArray(res.data) ? res.data : []);
        setFormData(prev => ({ ...prev, brick: '', rayon: '' }));
        setRayons([]);
      } catch (err) {
        console.error('Erreur lors de la récupération des briques:', err);
        setBricks([]);
      }
    };
    fetchBricks();
  }, [formData.class]);

  
  // Set rayons to match bricks when brick changes
  useEffect(() => {
    if (!formData.brick) return;
    // Rayon is equivalent to brick in alsmpc.db, so reuse bricks data
    setRayons(bricks);
    setFormData(prev => ({ ...prev, rayon: formData.brick })); // Auto-select same as brick
  }, [formData.brick, bricks]);
useEffect(() => {
  const updateSections = () => {
    const booleanFields = [
      'produit_halal', 'produit_consigne', 'produit_a_decouper', 'produits_dangereux',
      'produits_alimentaires', 'produits_saisonniers', 'produits_bio',
      'emballage_retournable', 'article_reapprovisionnable', 'vrac'
    ];

    const initialSections: { [key: string]: Section } = {
      "Données d'identification": {
        fields: ['gln', 'gtin', 'marque', 'sous_marque', 'libelle_court', 'pays_origine'],
        collapsed: false
      },
      "Classification": {
        fields: ['segment', 'family', 'class', 'brick', 'rayon', 'produit_transforme'],
        collapsed: false
      },
      "Données spécifiques du produit": {
        fields: [
          formData.produit_transforme === 'Oui' ? 'liste_des_ingredients' : '',
          'valeurs_nutritionnelles', 'quantite_nette', 'nombre_de_portions',
          'denomination_legale', 'conditions_de_conservation', 'etat_de_preparation', 'mode_d_emploi',
          'mentions_obligatoires_complementaires', 'argumentaire_produit',
          'allegation_sante', 'allegation_nutritionnelle', 'marche_cible',
          'valeurs_nutritionnelles_100g', 'valeurs_nutritionnelles_a_la_portion',
          'declaration_des_allergenes', 'duree_vie_minimale_livraison', 'duree_vie_du_produit',
          'libelle_internet', 'fournisseur', 'type_de_marque', 'gpc',
          ...booleanFields
        ].filter(Boolean),
        collapsed: true
      },
      "Conditionnement & Logistique": {
        fields: [
          'unite_logistique', 'dimensions_hors_emballage_diff', 'type_emballage',
          'date_debut_dispo_commande', 'mesures_unite_commerciale',
          'unite_commande', 'unite_facturable'
        ],
        collapsed: true,
        subsections: formData.unite_logistique && hierarchyFields[formData.unite_logistique]
          ? { [formData.unite_logistique]: hierarchyFields[formData.unite_logistique].filter(field => !removedFields.includes(field)) }
          : {}
      },
      "Données tarifaires": {
        fields: [
          'prix_unitaire', 'unite_legale', 'quantite_nette', 'denomination_legale',
          'unite_consommateur', 'unite_facturable', 'unite_commande',
          'date_debut_disponibilite', 'type_de_taxe', 'code_nomenclature_douaniere'
        ].filter(field => !['duree_vie_minimale_livraison', 'duree_vie_du_produit', 'libelle_internet', 'fournisseur', 'type_de_marque', 'gpc', 'unite_logistique'].includes(field)),
        collapsed: true
      }
    };

    const segment = formData.segment.toLowerCase();
    if (segment === "nourriture/boisson/tabac") {
      initialSections["📦 Conditionnement & Logistique"].subsections = {};
    }

    extraFields.forEach(field => {
      const section = Object.keys(initialSections).find(sec =>
        initialSections[sec].fields.includes(field) ||
        (initialSections[sec].subsections && Object.values(initialSections[sec].subsections).flat().includes(field))
      );
      if (!section) {
        const fieldSection = extraFields.includes(field) ? customField.section : "📋 Données spécifiques du produit";
        if (!initialSections[fieldSection]) {
          initialSections[fieldSection] = { fields: [], collapsed: true };
        }
        initialSections[fieldSection].fields.push(field);
      }
    });

    Object.keys(initialSections).forEach(section => {
      initialSections[section].fields = initialSections[section].fields.filter(field => !removedFields.includes(field));
      if (initialSections[section].subsections) {
        Object.keys(initialSections[section].subsections).forEach(subsection => {
          initialSections[section].subsections![subsection] = initialSections[section].subsections![subsection].filter(field => !removedFields.includes(field));
        });
      }
    });

    setSections(initialSections);
  };
  updateSections();
}, [formData.segment, formData.produit_transforme, formData.unite_logistique, isLogisticsComplete, extraFields, removedFields, customField.section]);  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'unite_logistique') {
      handleHierarchyChange(value);
    }
  };

  const handleHierarchyChange = (hierarchy) => {
    if (!hierarchy || !hierarchyFields[hierarchy]) return;

    const newHierarchyData = [{
      level: hierarchy,
      fields: hierarchyFields[hierarchy].filter(field => !removedFields.includes(field))
    }];

    setHierarchyData(newHierarchyData);

    setSections(prev => ({
      ...prev,
      "📦 Conditionnement & Logistique": {
        ...prev["📦 Conditionnement & Logistique"],
        subsections: {
          [hierarchy]: hierarchyFields[hierarchy].filter(field => !removedFields.includes(field))
        }
      }
    }));
  };

  const toggleSection = (section) => {
    setSections(prev => ({
      ...prev,
      [section]: { ...prev[section], collapsed: !prev[section].collapsed }
    }));
  };

  const confirmRemoveField = (field) => {
    setFieldToRemove(field);
    setShowConfirmModal(true);
  };

  const removeField = () => {
    if (fieldToRemove) {
      setRemovedFields(prev => [...prev, fieldToRemove]);
      setFormData(prev => {
        const newFormData = { ...prev };
        delete newFormData[fieldToRemove];
        return newFormData;
      });
      setDynamicFields(prev => {
        const newDynamicFields = { ...prev };
        delete newDynamicFields[fieldToRemove];
        return newDynamicFields;
      });
      setShowConfirmModal(false);
      setFieldToRemove(null);
    }
  };

  const addCustomField = () => {
    const newField = `${customField.section.toLowerCase()}_${customField.title.toLowerCase().replace(/\s+/g, '_')}`;
    setFieldRules(prev => ({
      ...prev,
      [newField]: {
        type: customField.type,
        required: customField.required,
        length: customField.length,
        decimals: customField.decimals,
        description: customField.description,
        values: []
      }
    }));
    setExtraFields(prev => [...prev, newField]);
    setSections(prev => ({
      ...prev,
      [customField.section]: {
        ...prev[customField.section],
        fields: [...prev[customField.section].fields, newField]
      }
    }));
    setShowCustomFieldModal(false);
  };

  const showTarifaireSection = () => {
    if (!hierarchyData.length) {
      alert("Veuillez ajouter au moins un niveau hiérarchique.");
      return;
    }
    setIsLogisticsComplete(true);
  };

// Helper function to fetch segments
async function fetchSegments(): Promise<string[]> {
  try {
    const response = await fetch(`${LOCAL_API_BASE}/api/segments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`https error ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Expected JSON, received ${contentType || 'unknown'}: ${text.slice(0, 50)}...`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Expected an array of segments');
    }

    return data;
  } catch (error) {
    console.error('Error fetching segments:', error);
    throw error;
  }
}



// Function to generate product sheets automatically

async function autoGenerateProductSheets() {
  console.log("=== Starting autoGenerateProductSheets ===");
  try {
    // Validate state functions
    if (typeof setShowProgressModal !== 'function' ||
        typeof setProgress !== 'function' ||
        typeof setErrorMessage !== 'function' ||
        typeof setDownloadUrl !== 'function') {
      throw new Error("Required state functions are not defined");
    }

    setShowProgressModal(true);
    setProgress(0);
    setErrorMessage('');
    setDownloadUrl('');

    // Fetch segments
    let segments;
    try {
      segments = await fetchSegments();
    } catch (error) {
      throw new Error(`Failed to fetch segments: ${error.message}`);
    }

    if (!segments.includes('Nourriture/Boisson')) {
      throw new Error('Segment Nourriture/Boisson non trouvé');
    }

    // Fetch bricks for Nourriture/Boisson
    let bricks;
    try {
      const response = await fetch(`${LOCAL_API_BASE}/api/bricks_by_class?codeClasse=Nourriture%2FBoisson`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`https error ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON, received ${contentType || 'unknown'}: ${text.slice(0, 50)}...`);
      }

      bricks = await response.json();
      if (!Array.isArray(bricks)) {
        throw new Error('Expected an array of bricks');
      }
    } catch (error) {
      throw new Error(`Failed to fetch bricks: ${error.message}`);
    }

    console.log('Fetched bricks for Nourriture/Boisson:', bricks);

    if (!bricks.length) {
      throw new Error('Aucune brique trouvée pour le segment Nourriture/Boisson');
    }

    const zip = new JSZip();
    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      console.log(`Generating model for brick: ${brick}`);

      // Minimal product data for model
      const productData = {
        segment: 'Nourriture/Boisson',
        brick: brick,
        rayon: brick,
      };

      const htmlContent = await generateProductSheet(
        true, // isTarifaire: include tariffaire section
        productData,
        {}, // dynamicFields: empty
        fieldRules || {},
        sections || {},
        brick,
        brick,
        true // isAutoGenerate: model mode
      );

      if (htmlContent) {
        const filename = `model_${brick.replace(/[\s/éèêëàâäîïôöùûüç]/g, '_').toLowerCase()}.html`;
        zip.file(filename, htmlContent);
        console.log(`Added ${filename} to zip`);
      } else {
        console.warn(`No HTML content for brick: ${brick}`);
      }

      setProgress(((i + 1) / bricks.length) * 100);
    }

    console.log("Generating zip file...");
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    setDownloadUrl(url);

    const link = document.createElement('a');
    link.href = url;
    link.download = `product_models_nourriture_boisson_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log("Zip file generated and downloaded");
  } catch (error) {
    console.error('Error in autoGenerateProductSheets:', error);
    setErrorMessage(`Erreur: ${error.message}`);
  } finally {
    setShowProgressModal(false);
  }
}

async function generateProductSheet(
  isTarifaire: boolean,
  productData: Record<string, string>,
  dynamicFields: Record<string, string>,
  fieldRules: FieldRules,
  sections: Sections,
  brick: string,
  rayon: string,
  isAutoGenerate: boolean
): Promise<string> {
  console.log("=== Starting generateProductSheet ===", { isTarifaire, brick, rayon, isAutoGenerate });
  try {
    // Combine productData and dynamicFields
    const fieldsToProcess = { ...dynamicFields, ...productData };

    // For models, fields are empty; otherwise, apply minimal defaults
    const defaultFields = isAutoGenerate
      ? {}
      : {
          produit_transforme: 'Oui',
        };

    // Apply defaults only for non-model generation
    Object.keys(fieldRules).forEach(field => {
      if (!(field in fieldsToProcess) || !fieldsToProcess[field]) {
        fieldsToProcess[field] = defaultFields[field] || '';
      }
    });

    const displayBrick = brick || fieldsToProcess.brick || 'Produit';

    let htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Modèle Fiche Produit - ${displayBrick}</title>
  <script src="httpss://cdn.tailwindcss.com"></script>
  <style>
    .section-header { cursor: pointer; transition: background-color 0.2s; }
    .section-header:hover { filter: brightness(95%); }
    .arrow { transition: transform 0.2s; }
    .arrow.collapsed { transform: rotate(0deg); }
    .arrow.open { transform: rotate(180deg); }
    .modal { display: none; }
    .modal.show { display: flex; }
    .field-row { transition: background-color 0.2s; }
    .field-row:hover { background-color: #f9fafb; }
    .ingredients-table, .nutrition-table { display: block; }
    input, select { transition: border-color 0.2s; }
    input:focus, select:focus { border-color: #3b82f6; }
  </style>
</head>
<body class="bg-gray-50 font-sans">
  <div class="max-w-5xl mx-auto p-6">
    <h1 class="text-3xl font-bold mb-8 text-gray-800 text-center bg-white py-3 rounded-sm shadow">Modèle Fiche Produit: ${displayBrick}</h1>
`;

    // Render sections
    Object.entries(sections).forEach(([sectionName, section]) => {
      const colorClass = {
        " Données d'identification": 'bg-blue-50 text-blue-800 focus:ring-blue-500 border-blue-300',
        " Classification": 'bg-green-50 text-green-800 focus:ring-green-500 border-green-300',
        " Données spécifiques du produit": 'bg-purple-50 text-purple-800 focus:ring-purple-500 border-purple-300',
        " Conditionnement & Logistique": 'bg-orange-50 text-orange-800 focus:ring-orange-500 border-orange-300',
        " Données tarifaires": 'bg-red-50 text-red-800 focus:ring-red-500 border-red-300',
      }[sectionName] || 'bg-gray-50 text-gray-800 focus:ring-gray-500 border-gray-300';

      htmlContent += `
    <div class="bg-white rounded-sm shadow-sm mb-6">
      <div class="section-header flex justify-between items-center p-4 ${colorClass} rounded-t-sm" onclick="toggleSection('${sectionName}')">
        <h2 class="text-xl font-semibold">${sectionName}</h2>
        <span id="${sectionName}-arrow" class="arrow collapsed text-2xl">▼</span>
      </div>
      <div id="${sectionName}-content" class="p-4">
      `;

      // Render fields
      section.fields.forEach((field, index) => {
        const fieldConfig = fieldRules[field] || { description: field, type: 'text' };
        const fieldId = `${sectionName}-field-${index}`;
        const titleId = `${sectionName}-title-${index}`;
        const typeId = `${sectionName}-type-${index}`;

        if (field === 'liste_des_ingredients') {
          htmlContent += `
        <div id="${fieldId}" class="field-row py-3 px-4 rounded-sm hover:bg-gray-50">
          <label class="text-sm font-medium text-gray-700 mb-2 block">${fieldConfig.description}</label>
          <div id="ingredients-table" class="ingredients-table">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-gray-100">
                  <th class="border border-gray-200 p-2">Ingrédient</th>
                  <th class="border border-gray-200 p-2">Valeur</th>
                  <th class="border border-gray-200 p-2">Type</th>
                  <th class="border border-gray-200 p-2">Unité</th>
                  <th class="border border-gray-200 p-2">Action</th>
                </tr>
              </thead>
              <tbody id="${fieldId}-tbody">
                <!-- Empty table for model -->
              </tbody>
            </table>
            <button onclick="addIngredientRow('${fieldId}')" class="mt-3 text-xs bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Ajouter ingrédient</button>
          </div>
        </div>
          `;
        } else if (field === 'valeurs_nutritionnelles') {
          htmlContent += `
        <div id="${fieldId}" class="field-row py-3 px-4 rounded-sm hover:bg-gray-50">
          <label class="text-sm font-medium text-gray-700 mb-2 block">${fieldConfig.description}</label>
          <div id="nutrition-table" class="nutrition-table">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-gray-100">
                  <th class="border border-gray-200 p-2">Nutriment</th>
                  <th class="border border-gray-200 p-2">Par portion</th>
                  <th class="border border-gray-200 p-2">Unité</th>
                  <th class="border border-gray-200 p-2">Action</th>
                </tr>
              </thead>
              <tbody id="${fieldId}-tbody">
                <!-- Empty table for model -->
              </tbody>
            </table>
            <button onclick="addNutrientRow('${fieldId}')" class="mt-3 text-xs bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Ajouter nutriment</button>
          </div>
        </div>
          `;
        } else if (field === 'declaration_des_allergenes') {
          htmlContent += `
        <div id="${fieldId}" class="field-row py-3 px-4 rounded-sm hover:bg-gray-50">
          <label class="text-sm font-medium text-gray-700 mb-2 block">${fieldConfig.description}</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <!-- Empty tags for model -->
          </div>
          <input
            type="text"
            id="${fieldId}-input"
            class="w-full border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-2 py-1 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}"
            onkeydown="if(event.key === 'Enter') addTag('${fieldId}', this.value)"
          />
        </div>
          `;
        } else {
          htmlContent += `
        <div id="${fieldId}" class="field-row flex items-center justify-between py-3 px-4 border-b border-gray-200 last:border-b-0 rounded-sm hover:bg-gray-50">
          <div class="flex-1 flex items-center space-x-4">
            <input id="${titleId}" value="${fieldConfig.description}" class="text-sm font-medium border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}" onblur="updateFieldTitle('${fieldId}', this.value)">
            ${fieldConfig.type === 'dropdown' ? `
              <select class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">
                <option value="">Sélectionner</option>
                ${fieldConfig.values?.map(val => `<option value="${val}">${val}</option>`).join('')}
              </select>
            ` : fieldConfig.type === 'boolean' ? `
              <div class="flex space-x-4">
                <label class="flex items-center"><input type="radio" name="${field}" value="Oui" class="mr-2 focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">Oui</label>
                <label class="flex items-center"><input type="radio" name="${field}" value="Non" class="mr-2 focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">Non</label>
              </div>
            ` : `
              <input value="${fieldsToProcess[field] || ''}" type="${fieldConfig.type === 'numeric' ? 'number' : fieldConfig.type === 'date' ? 'date' : 'text'}" class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">
            `}
            <select id="${typeId}" class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}" onchange="updateFieldType('${fieldId}', this.value)">
              <option value="text" ${fieldConfig.type === 'text' ? 'selected' : ''}>Texte</option>
              <option value="numeric" ${fieldConfig.type === 'numeric' ? 'selected' : ''}>Nombre</option>
              <option value="date" ${fieldConfig.type === 'date' ? 'selected' : ''}>Date</option>
              <option value="boolean" ${fieldConfig.type === 'boolean' ? 'selected' : ''}>Booléen</option>
              <option value="multivalue" ${fieldConfig.type === 'multivalue' ? 'selected' : ''}>Valeurs multiples</option>
            </select>
          </div>
          <button onclick="showDeleteModal('${fieldId}', '${fieldConfig.description}')" class="text-xs bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Supprimer</button>
        </div>
          `;
        }
      });

      // Render subsections
      if (section.subsections) {
        Object.entries(section.subsections).forEach(([subsectionName, fields]) => {
          htmlContent += `
        <div class="mt-4 pl-6 border-l-2 border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">${subsectionName}</h3>
          `;
          fields.forEach((field, index) => {
            const fieldConfig = fieldRules[field] || { description: field, type: 'text' };
            const fieldId = `${sectionName}-subsection-field-${index}`;
            const titleId = `${sectionName}-subsection-title-${index}`;
            const typeId = `${sectionName}-subsection-type-${index}`;

            htmlContent += `
          <div id="${fieldId}" class="field-row flex items-center justify-between py-3 px-4 border-b border-gray-200 last:border-b-0 rounded-sm hover:bg-gray-50">
            <div class="flex-1 flex items-center space-x-4">
              <input id="${titleId}" value="${fieldConfig.description}" class="text-sm font-medium border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}" onblur="updateFieldTitle('${fieldId}', this.value)">
              ${fieldConfig.type === 'dropdown' ? `
                <select class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">
                  <option value="">Sélectionner</option>
                  ${fieldConfig.values?.map(val => `<option value="${val}">${val}</option>`).join('')}
                </select>
              ` : fieldConfig.type === 'boolean' ? `
                <div class="flex space-x-4">
                  <label class="flex items-center"><input type="radio" name="${field}" value="Oui" class="mr-2 focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">Oui</label>
                  <label class="flex items-center"><input type="radio" name="${field}" value="Non" class="mr-2 focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">Non</label>
                </div>
              ` : `
                <input value="${fieldsToProcess[field] || ''}" type="${fieldConfig.type === 'numeric' ? 'number' : fieldConfig.type === 'date' ? 'date' : 'text'}" class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}">
              `}
              <select id="${typeId}" class="text-sm border ${colorClass.split(' ').find(c => c.startsWith('border-'))} rounded px-3 py-1.5 focus:outline-none focus:ring-2 ${colorClass.split(' ').find(c => c.startsWith('focus:ring-'))}" onchange="updateFieldType('${fieldId}', this.value)">
                <option value="text" ${fieldConfig.type === 'text' ? 'selected' : ''}>Texte</option>
                <option value="numeric" ${fieldConfig.type === 'numeric' ? 'selected' : ''}>Nombre</option>
                <option value="date" ${fieldConfig.type === 'date' ? 'selected' : ''}>Date</option>
                <option value="boolean" ${fieldConfig.type === 'boolean' ? 'selected' : ''}>Booléen</option>
                <option value="multivalue" ${fieldConfig.type === 'multivalue' ? 'selected' : ''}>Valeurs multiples</option>
              </select>
            </div>
            <button onclick="showDeleteModal('${fieldId}', '${fieldConfig.description}')" class="text-xs bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Supprimer</button>
          </div>
            `;
          });
          htmlContent += `</div>`;
        });
      }

      htmlContent += `</div></div>`;
    });

    // Delete Modal
    htmlContent += `
  <div id="deleteModal" class="modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-sm p-6 max-w-md w-full shadow-2xl">
      <h3 class="text-sm font-semibold mb-4">Confirmer la suppression</h3>
      <p class="text-sm mb-6">Êtes-vous sûr de vouloir supprimer le champ "<span id="modalFieldName"></span>" ?</p>
      <div class="flex justify-end space-x-4">
        <button onclick="cancelDelete()" class="text-sm bg-gray-300 text-gray-800 px-5 py-2 rounded hover:bg-gray-400">Annuler</button>
        <button id="confirmDeleteBtn" class="text-sm bg-red-500 text-white px-5 py-2 rounded hover:bg-red-600">Supprimer</button>
      </div>
    </div>
  </div>
    `;

    // JavaScript for interactivity
    htmlContent += `
  <script>
    let currentFieldId = '';

    function toggleSection(section) {
      const content = document.getElementById(section + '-content');
      const arrow = document.getElementById(section + '-arrow');
      const isCollapsed = content.classList.contains('hidden');
      content.classList.toggle('hidden', !isCollapsed);
      arrow.classList.toggle('collapsed', !isCollapsed);
      arrow.classList.toggle('open', isCollapsed);
      arrow.textContent = isCollapsed ? '▲' : '▼';
    }

    function updateFieldTitle(fieldId, newTitle) {
      const fieldDiv = document.getElementById(fieldId);
      if (fieldDiv) {
        fieldDiv.querySelector('input').value = newTitle;
      }
    }

    function updateFieldType(fieldId, newType) {
      const fieldDiv = document.getElementById(fieldId);
      if (fieldDiv) {
        let input = fieldDiv.querySelector('input:not([type="text"])') || fieldDiv.querySelector('select');
        if (newType === 'boolean') {
          fieldDiv.querySelector('.flex-1').innerHTML = \`
            <input id="\${fieldId}-title" value="\${fieldDiv.querySelector('input').value}" class="text-sm font-medium border rounded px-3 py-1.5 focus:outline-none focus:ring-2">
            <div class="flex space-x-4">
              <label class="flex items-center"><input type="radio" name="\${fieldId}" value="Oui" class="mr-2 focus:ring-2">Oui</label>
              <label class="flex items-center"><input type="radio" name="\${fieldId}" value="Non" class="mr-2 focus:ring-2">Non</label>
            </div>
          \`;
        } else if (newType === 'dropdown') {
          fieldDiv.querySelector('.flex-1').innerHTML = \`
            <input id="\${fieldId}-title" value="\${fieldDiv.querySelector('input').value}" class="text-sm font-medium border rounded px-3 py-1.5 focus:outline-none focus:ring-2">
            <select class="text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-2">
              <option value="">Sélectionner</option>
            </select>
          \`;
        } else {
          const newInput = document.createElement('input');
          newInput.type = newType === 'numeric' ? 'number' : newType === 'date' ? 'date' : 'text';
          newInput.value = '';
          newInput.classList.add('text-sm', 'border', 'rounded', 'px-3', 'py-1.5', 'focus:outline-none', 'focus:ring-2');
          fieldDiv.querySelector('.flex-1').replaceChild(newInput, input);
          fieldDiv.querySelector('.flex-1').insertBefore(
            document.createElement('input'),
            newInput
          ).setAttribute('id', \`\${fieldId}-title\`).setAttribute('value', fieldDiv.querySelector('input').value).setAttribute('class', 'text-sm font-medium border rounded px-3 py-1.5 focus:outline-none focus:ring-2').setAttribute('onblur', \`updateFieldTitle('\${fieldId}', this.value)\`);
        }
      }
    }

    function showDeleteModal(fieldId, fieldName) {
      currentFieldId = fieldId;
      document.getElementById('modalFieldName').textContent = fieldName;
      document.getElementById('deleteModal').classList.add('show');
      document.getElementById('confirmDeleteBtn').onclick = () => confirmDelete(fieldId);
    }

    function cancelDelete() {
      document.getElementById('deleteModal').classList.remove('show');
      currentFieldId = '';
    }

    function confirmDelete(fieldId) {
      const fieldDiv = document.getElementById(fieldId);
      if (fieldDiv) fieldDiv.remove();
      document.getElementById('deleteModal').classList.remove('show');
      currentFieldId = '';
    }

    function deleteIngredientRow(rowId) {
      const row = document.getElementById(rowId);
      if (row) row.remove();
    }

    function addIngredientRow(fieldId) {
      const tbody = document.getElementById(fieldId + '-tbody');
      const rowCount = tbody.children.length;
      const newRow = document.createElement('tr');
      newRow.id = \`\${fieldId}-row-\${rowCount}\`;
      newRow.innerHTML = \`
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2">
          <select class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2">
            <option value="Pourcentage">Pourcentage</option>
            <option value="Nombre">Nombre</option>
          </select>
        </td>
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2 text-center">
          <button onclick="deleteIngredientRow('\${fieldId}-row-\${rowCount}')" class="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Supprimer</button>
        </td>
      \`;
      tbody.appendChild(newRow);
    }

    function deleteNutrientRow(rowId) {
      const row = document.getElementById(rowId);
      if (row) row.remove();
    }

    function addNutrientRow(fieldId) {
      const tbody = document.getElementById(fieldId + '-tbody');
      const rowCount = tbody.children.length;
      const newRow = document.createElement('tr');
      newRow.id = \`\${fieldId}-row-\${rowCount}\`;
      newRow.innerHTML = \`
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2"><input type="text" value="" class="w-full border rounded px-2 py-1 focus:outline-none focus:ring-2"></td>
        <td class="border border-gray-200 p-2 text-center">
          <button onclick="deleteNutrientRow('\${fieldId}-row-\${rowCount}')" class="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Supprimer</button>
        </td>
      \`;
      tbody.appendChild(newRow);
    }

    function addTag(fieldId, value) {
      if (!value.trim()) return;
      const container = document.getElementById(fieldId).querySelector('.flex-wrap');
      const newTag = document.createElement('div');
      newTag.className = 'flex items-center bg-gray-200 rounded px-2 py-1';
      newTag.innerHTML = \`
        <span class="text-gray-800">\${value}</span>
        <button onclick="removeTag('\${fieldId}', '\${value}')" class="ml-2 text-red-600 hover:bg-red-200 rounded-full w-5 h-5 flex items-center justify-center">✖</button>
      \`;
      container.appendChild(newTag);
      document.getElementById(fieldId + '-input').value = '';
    }

    function removeTag(fieldId, tag) {
      const container = document.getElementById(fieldId).querySelector('.flex-wrap');
      Array.from(container.children).forEach(child => {
        if (child.querySelector('span').textContent === tag) {
          child.remove();
        }
      });
    }
  </script>
</body>
</html>
    `;

    console.log("Generated HTML length:", htmlContent.length);
    return htmlContent;
  } catch (error) {
    console.error('Error in generateProductSheet:', error);
    throw error;
  }
}
  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Produits</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Générateur Modèles</span>
      </nav>
      
      <div className="bg-gray-50 min-h-screen p-4 font-sans flex">
      {/* Left Side: Classification Section */}
      
      <div className="w-[30%] pr-4">
        <Card className="shadow-sm border border-gray-200 rounded-sm bg-white">
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-blue-900 flex items-center">
               Générateur de Modèle de Fiches Produits
            </CardTitle>
          </CardHeader>
          <CardContent className="bg-white p-4 max-h-[500px] overflow-y-auto">
            <h1 className="text-2xl font- text-blue-900 mb-6 flex items-center">
               Classification 
            </h1>
            <div className="space-y-4">
              {[
                { label: "Segment", value: formData.segment, options: segments, onChange: (value: string) => setFormData(prev => ({ ...prev, segment: value })), icon: "" },
                { label: "Famille", value: formData.family, options: families, onChange: (value: string) => setFormData(prev => ({ ...prev, family: value })), icon: "" },
                { label: "Classe", value: formData.class, options: classes, onChange: (value: string) => setFormData(prev => ({ ...prev, class: value })), icon: "" },
                { label: "Brick", value: formData.brick, options: bricks, onChange: (value: string) => setFormData(prev => ({ ...prev, brick: value })), icon: "" },
                { label: "Rayon", value: formData.rayon, options: rayons, onChange: (value: string) => setFormData(prev => ({ ...prev, rayon: value })), icon: "" },
                {
                  label: "Produit transformé",
                  value: formData.produit_transforme,
                  options: ["Oui", "Non"],
                  onChange: (value: string) => setFormData(prev => ({ ...prev, produit_transforme: value })),
                  icon: ""
                }
              ].map(({ label, value, options, onChange, icon }) => (
                options.length > 0 || label === "Segment" || label === "Produit transformé" ? (
                  <div key={label}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{icon} {label}</label>
                    {label === "Produit transformé" ? (
                      <div className="flex space-x-4">
                        {options.map(option => (
                          <label key={option} className="flex items-center">
                            <input
                              type="radio"
                              name="produit_transforme"
                              value={option}
                              checked={value === option}
                              onChange={() => onChange(option)}
                              className="mr-2"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Listbox value={value} onChange={onChange} as="div">
                        <Listbox.Button className="w-full border p-0 rounded bg-gray-50 text-left flex justify-between items-center">
                          <span>{value || `Sélectionner ${label.toLowerCase()}`}</span>
                          <span>▼</span>
                        </Listbox.Button>
                        <Listbox.Options className="border mt-1 rounded max-h-40 overflow-y-auto bg-white shadow-sm">
                          {options.map(option => (
                            <Listbox.Option key={option} value={option} className="p-0 hover:bg-blue-100 cursor-pointer">
                              {option}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Listbox>
                    )}
                  </div>
                ) : null
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

     {/* Right Side: Other Sections */}
<div className="w-[65%] pl-4 space-y-4">
  {Object.entries(sections).map(([sectionName, section]) => (
    sectionName !== "🧩 Classification" && (
      <Card
        key={sectionName}
        className="mb-4 border border-gray-100 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow duration-200"
      >
        <CardHeader
          className="bg-blue-50/50 cursor-pointer flex justify-between items-center px-3 py-2 rounded-t-md"
          onClick={() => toggleSection(sectionName)}
        >
          <CardTitle className="text-blue-900 text-base font-semibold flex items-center">
            {sectionName}
          </CardTitle>
          <span className="text-gray-500 text-sm">{section.collapsed ? "▼" : "▲"}</span>
        </CardHeader>
        {!section.collapsed && (
          <CardContent className="p-3 max-h-[400px] overflow-y-auto">
            {section.fields.map(field => {
              const rule = fieldRules[field];
              if (!rule) return null;
              return (
                <div key={field} className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {rule.description}
                  </label>
                  {rule.type === 'multivalue' && field === 'liste_des_ingredients' ? (
                    <IngredientsTable
                      font="Inter, sans-serif"
                      value={dynamicFields[field] || ""}
                      onChange={(value: string) => handleInputChange(field, value)}
                    />
                  ) : rule.type === 'multivalue' && field === 'valeurs_nutritionnelles' ? (
                    <NutritionTable
                      font="Inter, sans-serif"
                      value={dynamicFields[field] || ""}
                      onChange={(value: string) => handleInputChange(field, value)}
                    />
                  ) : rule.type === 'dropdown' && rule.values ? (
                    sectionName === "🔍 Données d'identification" && field === 'pays_origine' ? (
                      <CountrySelector
                        value={dynamicFields[field] || ""}
                        onChange={(value: string) => handleInputChange(field, value)}
                      />
                    ) : (
                      <Listbox
                        value={dynamicFields[field] || ""}
                        onChange={(value: string) => handleInputChange(field, value)}
                        as="div"
                      >
                        <Listbox.Button className="w-full border border-gray-200 py-1.5 px-2 rounded bg-gray-50 text-left flex justify-between items-center text-sm hover:bg-blue-50 transition-colors">
                          <span>{dynamicFields[field] || `Sélectionner ${rule.description.toLowerCase()}`}</span>
                          <span className="text-gray-400">▼</span>
                        </Listbox.Button>
                        <Listbox.Options className="border border-gray-200 mt-1 rounded max-h-36 overflow-y-auto bg-white shadow-sm text-sm">
                          {rule.values.map(value => (
                            <Listbox.Option
                              key={value}
                              value={value}
                              className="px-2 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors"
                            >
                              {value}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Listbox>
                    )
                  ) : rule.type === 'boolean' ? (
                    <div className="flex space-x-3">
                      {["Oui", "Non"].map(option => (
                        <label key={option} className="flex items-center text-sm">
                          <input
                            type="radio"
                            name={field}
                            value={option}
                            checked={dynamicFields[field] === option}
                            onChange={() => handleInputChange(field, option)}
                            className="mr-1.5 h-4 w-4 text-blue-500"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={rule.type === 'numeric' ? 'number' : rule.type === 'date' ? 'date' : 'text'}
                      value={dynamicFields[field] || ""}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(field, e.target.value)}
                      className="w-full border border-gray-200 py-1.5 px-2 rounded bg-gray-50 text-sm focus:bg-blue-50 focus:border-blue-400 outline-none transition-colors"
                    />
                  )}
                  <button
                    onClick={() => confirmRemoveField(field)}
                    className="text-red-500 hover:bg-red-100 rounded-full w-5 h-5 flex items-center justify-center mt-1.5 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            {section.subsections &&
              Object.entries(section.subsections).map(([subsectionName, fields]) => (
                <div key={subsectionName} className="mt-3 pl-2 border-l-2 border-gray-100">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">{subsectionName}</h3>
                  {fields.map(field => {
                    const rule = fieldRules[field];
                    if (!rule) return null;
                    return (
                      <div key={field} className="mb-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {rule.description}
                        </label>
                        {rule.type === 'dropdown' && rule.values ? (
                          <Listbox
                            value={dynamicFields[field] || ""}
                            onChange={(value: string) => handleInputChange(field, value)}
                            as="div"
                          >
                            <Listbox.Button className="w-full border border-gray-200 py-1.5 px-2 rounded bg-gray-50 text-left flex justify-between items-center text-sm hover:bg-blue-50 transition-colors">
                              <span>{dynamicFields[field] || `Sélectionner ${rule.description.toLowerCase()}`}</span>
                              <span className="text-gray-400">▼</span>
                            </Listbox.Button>
                            <Listbox.Options className="border border-gray-200 mt-1 rounded max-h-36 overflow-y-auto bg-white shadow-sm text-sm">
                              {rule.values.map(value => (
                                <Listbox.Option
                                  key={value}
                                  value={value}
                                  className="px-2 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors"
                                >
                                  {value}
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </Listbox>
                          ) : (
                            <input
                              type={rule.type === 'numeric' ? 'number' : rule.type === 'date' ? 'date' : 'text'}
                              value={dynamicFields[field] || ""}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange(field, e.target.value)}
                              className="w-full border border-gray-200 py-1.5 px-2 rounded bg-gray-50 text-sm focus:bg-blue-50 focus:border-blue-400 outline-none transition-colors"
                            />
                          )}
                        <button
                          onClick={() => confirmRemoveField(field)}
                          className="text-red-500 hover:bg-red-100 rounded-full w-5 h-5 flex items-center justify-center mt-1.5 text-xs transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            {/* Add New Field Button for eligible sections */}
            {sectionName !== "🔍 Données d'identification" && sectionName !== "🧩 Classification" && (
              <button
                onClick={() => setShowCustomFieldModal(true)}
                className="mt-3 px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm font-medium transition-colors"
              >
                + Champ personnalisé
              </button>
            )}
          </CardContent>
        )}
      </Card>
    )
  ))}
  <div className="flex space-x-3 mt-4">
    <button
      onClick={showTarifaireSection}
      className="px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-colors"
    >
      Afficher la section tarifaire
    </button>
    <button
      onClick={generateProductSheet}
      className="px-3 py-1.5 bg-purple-500 text-white rounded-md hover:bg-purple-600 text-sm font-medium transition-colors"
    >
      Générer la fiche produit
    </button>
    <button
  onClick={autoGenerateProductSheets}
  className="px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm font-medium transition-colors"
>
  Générer toutes les fiches produits
</button>
  </div>
</div>
      {/* Custom Field Modal */}
      {showCustomFieldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-sm shadow-xl max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Ajouter un champ personnalisé</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Section</label>
                <input
                  type="text"
                  value={customField.section}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCustomField(prev => ({ ...prev, section: e.target.value }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Titre</label>
                <input
                  type="text"
                  value={customField.title}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCustomField(prev => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={customField.type}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setCustomField(prev => ({ ...prev, type: e.target.value }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                >
                  <option value="text">Texte</option>
                  <option value="numeric">Numérique</option>
                  <option value="date">Date</option>
                  <option value="boolean">Booléen</option>
                  <option value="multivalue">Valeurs multiples</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                  type="text"
                  value={customField.description}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCustomField(prev => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                />
              </div>
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={customField.required}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setCustomField(prev => ({ ...prev, required: e.target.checked }))
                    }
                    className="mr-2"
                  />
                  Obligatoire
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Longueur maximale</label>
                <input
                  type="number"
                  value={customField.length}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCustomField(prev => ({ ...prev, length: parseInt(e.target.value) }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Décimales</label>
                <input
                  type="number"
                  value={customField.decimals}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setCustomField(prev => ({ ...prev, decimals: parseInt(e.target.value) }))
                  }
                  className="w-full border p-0 rounded bg-gray-50"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-4">
              <button
                onClick={() => setShowCustomFieldModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Annuler
              </button>
              <button
                onClick={addCustomField}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Field Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-sm shadow-xl max-w-sm w-full">
            <h2 className="text-xl font-bold mb-4">Confirmer la suppression</h2>
            <p>Êtes-vous sûr de vouloir supprimer le champ "{fieldRules[fieldToRemove!]?.description}" ?</p>
            <div className="mt-6 flex justify-end space-x-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Annuler
              </button>
              <button
                onClick={removeField}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default GenerateurModele;