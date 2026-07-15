function unescapeEancom(str) {
  if (!str) return str;
  return str.replace(/\?([?+:'"])/g, '$1');
}

// =====================================================
// EANCOM PARSER - Parse incoming EDI messages
// Supports: ORDERS, INVOIC, ORDRSP, DESADV, APERAK
// =====================================================

/**
 * Parse an EANCOM message and extract key information
 * @param {string} eancomContent - Raw EANCOM message content
 * @returns {Object} Parsed message data
 */
function parseEANCOM(eancomContent) {
  // Pre-process: handle single-line messages by treating ' as newline segment separator
  let content = eancomContent;
  if (content && content.indexOf("'") !== -1) {
     content = content.replace(/'/g, "'\n");
  }

  // EANCOM segments are separated by apostrophes that are NOT preceded by a question mark.
  // We remove newlines first because some transmissions wrap them randomly, then split.
  const contentNoNewlines = content.replace(/\r?\n/g, '');
  const lines = contentNoNewlines.split(/(?<!\?)'/).map(l => l.trim()).filter(l => l.length > 0);
  
  const result = {
    messageType: null,
    messageNumber: null,
    documentNumber: null,
    documentDate: null,
    // APERAK-specific fields
    aperakFunctionCode: null,       // '313' = ACK, '314' = NACK
    referencedDocumentNumber: null, // Original doc ref (from RFF+ACE or DOC segment)
    referencedDocumentType: null,   // e.g. 'INVOIC'
    aperakErrorCode: null,          // ERC segment error code
    aperakErrorText: null,          // FTX after ERC
    aperakSenderGln: null,          // NAD+MS sender GLN
    aperakReceiverGln: null,        // NAD+MR receiver GLN
    // Standard fields
    buyer: { gln: null, vat: null, name: null, contact: null, phone: null, email: null },
    supplier: { gln: null, vat: null, name: null },
    deliveryParty: { gln: null, name: null },
    currency: null,
    exchangeRate: null,
    paymentTerms: null,
    transport: { mode: null, means: null, carrier: null, carrierName: null, vehicle: null },
    deliveryTerms: null,
    deliveryPort: null,
    contractReference: null,
    priceListReference: null,
    freeText: null,
    items: [],
    packages: [],
    // P3.1 IFTMIN — instruction de transport
    consignor: { gln: null, name: null },
    consignee: { gln: null, name: null },
    carrierParty: { code: null, name: null },
    placeOfLoading: null,
    placeOfDelivery: null,
    equipment: null,
    desadvReference: null,
    goodsItems: [],
    totals: { lineAmount: null, taxAmount: null, totalAmount: null },
    totalWeight: null,
    itemCount: null,
    rawSegments: []
  };

  let currentItem = null;
  let currentDeliveryLocation = null;
  let currentPackage = null;
  let lastPciCode = null;
  let currentGoodsItem = null; // P3.1 IFTMIN

  for (const line of lines) {
    // Store raw segment
    result.rawSegments.push(line);

    // Split segment by + (EDIFACT separator)
    const parts = line.split(/(?<!\?)\+/);
    const segmentCode = parts[0];

    try {
      switch (segmentCode) {
        case 'UNH': // Message header
          result.messageNumber = parts[1];
          if (parts[2]) {
            const messageInfo = parts[2].split(/(?<!\?):/);
            result.messageType = messageInfo[0]; // ORDERS, INVOIC, ORDRSP, DESADV
          } else {
             console.error('[PARSER ERROR] UNH segment missing message type part:', line);
          }
          break;

        case 'BGM': // Beginning of message
          result.documentNumber = parts[2];
          if (parts[1]) {
            // For APERAK: BGM+313 or BGM+314 — no sub-fields in parts[1]
            result.aperakFunctionCode = parts[1].split(/(?<!\?):/).join('') || parts[1];
          }
          if (parts[3]) {
            result.responseCode = parts[3]; // For ORDRSP: 29=Accepted, 27=Rejected, 4=Modified
          }
          break;

        case 'DTM': // Date/time/period
          const dateQualifier = parts[1].split(/(?<!\?):/)[0];
          const dateValue = parts[1].split(/(?<!\?):/)[1];
          
          if (dateQualifier === '137') result.documentDate = dateValue; // Document date
          else if (dateQualifier === '2') result.deliveryDateRequested = dateValue; // Delivery date
          else if (dateQualifier === '69') result.deliveryDateConfirmed = dateValue; // Confirmed delivery date
          else if (dateQualifier === '64') result.deliveryDateEarliest = dateValue;
          else if (dateQualifier === '63') result.deliveryDateLatest = dateValue;
          else if (dateQualifier === '171') result.contractDate = dateValue; // Contract/price list date
          break;

        case 'PAI': // Payment instructions
          if (parts[1]) {
            const paymentParts = parts[1].split(/(?<!\?):/);
            result.paymentTerms = paymentParts[paymentParts.length - 1];
          }
          break;

        case 'ALI': // Additional information
          if (parts[3]) result.groupConditions = parts[3];
          break;

        case 'FTX': // Free text
          const ftxType = parts[1];
          let ftxText = parts[4] || '';
          
          // In some EANCOM implementations, the text is split across parts[4], parts[5], etc.
          // or inside parts[4] separated by colons.
          if (parts[4] && parts[4].includes(':')) {
            // Replace colons with spaces if it's colon separated
            ftxText = parts[4].split(/(?<!\?):/).filter(Boolean).join(' ');
          }
          
          if (currentItem) {
             currentItem.comment = unescapeEancom(ftxText);
          } else {
             result.freeText = ftxText;
             // ORDRSP specific general comment
             if (ftxType === 'AAI') result.comment = unescapeEancom(ftxText);
          }
          break;

        case 'RFF': // Reference
          const refQualifier = parts[1].split(/(?<!\?):/)[0];
          const refValue = parts[1].split(/(?<!\?):/)[1];
          
          if (refQualifier === 'CT') result.contractReference = refValue;
          else if (refQualifier === 'PL') result.priceListReference = refValue;
          else if (refQualifier === 'ON') result.orderReference = refValue; // Original Order Number
          else if (refQualifier === 'DQ') result.desadvReference = unescapeEancom(refValue); // P3.1 IFTMIN : réf DSADV
          else if (refQualifier === 'ACE') result.referencedDocumentNumber = unescapeEancom(refValue); // APERAK: ref to acknowledged doc
          else if (refQualifier === 'VA') {
            // VAT number - assign to current party context
            if (currentPartyType === 'BY') result.buyer.vat = refValue;
            else if (currentPartyType === 'SU') result.supplier.vat = refValue;
          }
          break;

        case 'DOC': // Referenced document type (APERAK: DOC+131+INVOIC)
          if (parts[1]) {
            const docSegParts = parts[1].split(/((?<!\?):)/);
            const docQualifier = docSegParts[0];
            if (docQualifier === '131' && parts[2]) {
              result.referencedDocumentType = unescapeEancom(parts[2]);
            } else if (docQualifier === '131' && docSegParts[2]) { // P1.2b DOC-colon (DOC+131:TYPE)
              result.referencedDocumentType = unescapeEancom(docSegParts[2]);
            }
          }
          break;

        case 'ERC': // Application error information (APERAK NACK)
          if (parts[1]) {
            result.aperakErrorCode = unescapeEancom(parts[1]);
          }
          break;

        case 'NAD': // Name and address
          const partyQualifier = parts[1];
          const partyGLN = parts[2] ? parts[2].split(/(?<!\?):/)[0] : null;
          const partyName = parts[4] || null; // 4th field contains the party name
          
          currentPartyType = partyQualifier;
          
          if (partyQualifier === 'BY') {
            result.buyer.gln = partyGLN;
            if (partyName) result.buyer.name = partyName;
          }
          else if (partyQualifier === 'SU') {
            result.supplier.gln = partyGLN;
            if (partyName) result.supplier.name = partyName;
          }
          else if (partyQualifier === 'DP') {
            result.deliveryParty.gln = partyGLN;
            if (partyName) result.deliveryParty.name = partyName;
          }
          else if (partyQualifier === 'UC') result.ultimateConsignee = partyGLN;
          else if (partyQualifier === 'IV') result.invoicee = partyGLN;
          // APERAK parties: MS = Message Sender (buyer), MR = Message Receiver (supplier)
          // P3.1 IFTMIN : CZ = expéditeur, CN = destinataire, CA = transporteur
          else if (partyQualifier === 'CZ') {
            result.consignor.gln = partyGLN;
            if (partyName) result.consignor.name = unescapeEancom(partyName);
            if (result.messageType === 'IFTMIN' && !result.supplier.gln) result.supplier.gln = partyGLN;
          }
          else if (partyQualifier === 'CN') {
            result.consignee.gln = partyGLN;
            if (partyName) result.consignee.name = unescapeEancom(partyName);
            if (result.messageType === 'IFTMIN' && !result.buyer.gln) result.buyer.gln = partyGLN;
          }
          else if (partyQualifier === 'CA') {
            result.carrierParty.code = partyGLN ? unescapeEancom(partyGLN) : null;
            if (partyName) result.carrierParty.name = unescapeEancom(partyName);
          }
          else if (partyQualifier === 'MS') { // P1.2b NAD-APERAK
            result.aperakSenderGln = partyGLN;
            if (result.messageType === 'APERAK' && !result.buyer.gln) result.buyer.gln = partyGLN;
          }
          else if (partyQualifier === 'MR') {
            result.aperakReceiverGln = partyGLN;
            if (result.messageType === 'APERAK' && !result.supplier.gln) result.supplier.gln = partyGLN;
          }
          break;

        case 'CTA': // Contact information
          if (parts[2]) {
            const contactName = parts[2].split(/(?<!\?):/)[1];
            if (currentPartyType === 'BY') result.buyer.contact = contactName;
          }
          break;

        case 'COM': // Communication contact
          if (parts[1]) {
            const commParts = parts[1].split(/(?<!\?):/);
            const commValue = commParts[0];
            const commType = commParts[1]; // TE=telephone, EM=email
            
            if (currentPartyType === 'BY') {
              if (commType === 'TE') result.buyer.phone = commValue;
              else if (commType === 'EM') result.buyer.email = commValue;
            }
          }
          break;

        case 'CUX': // Currencies
          if (parts[1]) {
            const currencyParts = parts[1].split(/(?<!\?):/);
            result.currency = currencyParts[1];
          }
          if (parts[2]) {
            const targetCurrencyParts = parts[2].split(/(?<!\?):/);
            result.exchangeRateCurrency = targetCurrencyParts[1];
          }
          if (parts[3]) {
            result.exchangeRate = parseFloat(parts[3]);
          }
          break;

        case 'TDT': // Transport details
          // TDT+20++30+++carrier:::carrierName+++vehicle
          if (parts[3]) result.transport.mode = parts[3];
          if (parts[4]) result.transport.means = parts[4];
          if (parts[6]) {
            const carrierParts = parts[6].split(/(?<!\?):/);
            result.transport.carrier = carrierParts[0] || null;
            result.transport.carrierName = carrierParts[3] || null;
          }
          if (parts[9]) result.transport.vehicle = parts[9];
          break;

        case 'GID': { // P3.1 IFTMIN — Goods Item Details : GID+seq+count:type
          if (currentGoodsItem) result.goodsItems.push(currentGoodsItem);
          const gidCount = parts[2] ? parts[2].split(/(?<!\?):/) : [];
          currentGoodsItem = {
            sequence: parseInt(parts[1]) || result.goodsItems.length + 1,
            packageCount: gidCount[0] ? parseInt(gidCount[0]) : null,
            packageType: gidCount[1] || null,
            description: null,
            weight: null,
            sscc: null,
          };
          break;
        }

        case 'EQD': // P3.1 IFTMIN — équipement de transport
          result.equipment = { type: parts[1] || null, id: parts[2] ? unescapeEancom(parts[2]) : null };
          break;

        case 'CPS': // Consignment Packing Sequence (DESADV)
          // parts[1] = Hierarchical ID, parts[2] = Parent ID, parts[3] = Packaging Level
          {
            const cpsId = parts[1];
            const cpsParent = parts[2] || null;
            const cpsLevel = parts[3] || null;
            // CPS+1 = consignment level; CPS+n+1 = package under consignment
            if (cpsId !== '1' || cpsParent) {
              // Save previous package if exists
              if (currentPackage) {
                result.packages.push(currentPackage);
              }
              currentPackage = { cpsId, parent: cpsParent, level: cpsLevel, sscc: null, type: null, weight: null, batchNumber: null, items: [] };
            }
          }
          break;

        case 'PAC': // Package
          {
            const pacCount = parts[1] ? parseInt(parts[1]) : 1;
            const pacType = parts[3] ? parts[3].split(/(?<!\?):/)[0] : null;
            if (currentPackage) {
              currentPackage.type = pacType;
              currentPackage.count = pacCount;
            } else if (currentItem) {
              currentItem.packageCount = pacCount;
              if (pacType) currentItem.packageType = pacType;
            }
          }
          break;

        case 'MEA': // Measurement
          {
            // P3.1 IFTMIN : MEA sous GID = poids de la marchandise courante
            if (currentGoodsItem && parts[1] === 'WT' && parts[3]) {
              const gidMea = parts[3].split(/(?<!\?):/);
              if (gidMea[1]) { currentGoodsItem.weight = parseFloat(gidMea[1]); break; }
            }
            const meaPurpose = parts[1]; // WT = Weight, VOL = Volume
            const meaType = parts[2];    // G = Gross, AAE = Net
            if (parts[3]) {
              const meaParts = parts[3].split(/(?<!\?):/);
              const meaUnit = meaParts[0]; // KGM, LBR, etc.
              const meaValue = parseFloat(meaParts[1]);
              if (meaPurpose === 'WT' && currentPackage) {
                currentPackage.weight = meaValue;
              } else if (meaPurpose === 'WT' && !currentPackage) {
                result.totalWeight = meaValue;
              }
            }
          }
          break;

        case 'PCI': // Package Identification
          // 33E = Marked with SSCC (Etiquetage), 36E = Marked with batch, 17 = Batch/lot at item level
          lastPciCode = parts[1] || null;
          // P3.1 IFTMIN : PCI+33E+<sscc> directement sous GID
          if (currentGoodsItem && lastPciCode === '33E' && parts[2]) {
            currentGoodsItem.sscc = unescapeEancom(parts[2]);
          }
          break;

        case 'GIN': // Goods Identity Number
          {
            const ginQualifier = parts[1];
            const ginValue = parts[2] ? parts[2].split(/(?<!\?):/)[0] : null;
            if (ginQualifier === 'BJ' && ginValue) {
              // BJ = Serial shipping container code (SSCC)
              if (currentPackage) {
                currentPackage.sscc = ginValue;
              } else {
                result.packages.push({ sscc: ginValue, type: null, weight: null, batchNumber: null, items: [] });
              }
            } else if (ginQualifier === 'BX' && ginValue) {
              // BX = Batch number
              if (currentItem) {
                currentItem.batchNumber = ginValue;
              } else if (currentPackage) {
                currentPackage.batchNumber = ginValue;
              }
            }
          }
          break;

        case 'ALC': // Allowance or Charge
          // parts[1] = A (Allowance) or C (Charge)
          // parts[2] = Code
          const alcType = parts[1];
          // We would typically look for MOA following this to get the amount
          break;

        case 'TOD': // Terms of delivery
          if (parts[3]) {
            const incoterms = parts[3].split(/(?<!\?):/)[0];
            result.deliveryTerms = incoterms;
          }
          break;

        case 'LOC': // Location
          const locQualifier = parts[1];
          const locValue = parts[2];
          
          if (locQualifier === '1') result.deliveryPort = locValue; // Port of loading/unloading
          else if (locQualifier === '9') { // P3.1 IFTMIN : lieu d'enlèvement/chargement
            result.placeOfLoading = locValue ? unescapeEancom(locValue.split(/(?<!\?):/)[0]) : null;
          }
          else if (locQualifier === '7') {
            // P3.1 IFTMIN : lieu de livraison (champ dédié, en plus du flux ORDERS multi-livraison)
            result.placeOfDelivery = locValue ? unescapeEancom(locValue.split(/(?<!\?):/)[0]) : null;
            // Place of delivery (for multi-delivery)
            currentDeliveryLocation = { gln: locValue, qty: null, date: null };
          }
          break;

        case 'LIN': // Line item
          if (currentItem) {
            // If inside a DESADV package, add to package items
            if (currentPackage) {
              currentPackage.items.push(currentItem);
            } else {
              result.items.push(currentItem);
            }
          }
          
          const lineNumber = parts[1];
          const gtin = parts[3] ? parts[3].split(/(?<!\?):/)[0] : null;
          
          currentItem = {
            lineNumber: parseInt(lineNumber),
            gtin,
            buyerProductCode: null,
            supplierProductCode: null,
            description: null,
            qty: null,
            unit: null,
            price: null,
            priceQualifier: null,
            lineAmount: null,
            taxRate: null,
            batchNumber: null,
            expiryDate: null,
            packageCount: null,
            packageType: null,
            deliveryLocations: []
          };
          break;

        case 'PIA': // Additional product identification
          if (currentItem && parts[2]) {
            const productParts = parts[2].split(/(?<!\?):/);
            const productCode = productParts[0];
            const productQualifier = productParts[1];
            
            if (productQualifier === 'IN') currentItem.buyerProductCode = productCode;
            else if (productQualifier === 'SA') currentItem.supplierProductCode = productCode;
          }
          break;

        case 'IMD': // Item description
          if (currentItem && parts[4]) {
            currentItem.description = parts[4];
          }
          break;

        case 'QTY': // Quantity
          const qtyQualifier = parts[1].split(/(?<!\?):/)[0];
          const qtyValue = parts[1].split(/(?<!\?):/)[1];
          
          if (qtyQualifier === '21' && currentItem) {
            // Ordered quantity
            currentItem.qtyOrdered = parseInt(qtyValue);
            // Fallback for ORDERS message where 21 is the main qty
            if (!currentItem.qty) currentItem.qty = parseInt(qtyValue);
            // For ORDCHG, quantity 21 is the newly confirmed/changed quantity
            if (result.messageType === 'ORDCHG' || result.messageType === 'ORDRSP') currentItem.qtyConfirmed = parseInt(qtyValue);
          } else if (qtyQualifier === '185' && currentItem) {
            // Confirmed quantity
            currentItem.qtyConfirmed = parseInt(qtyValue);
            currentItem.qty = parseInt(qtyValue); // Main qty for ORDRSP
          } else if (qtyQualifier === '12' && currentItem) {
             // Despatch quantity
             currentItem.qtyDispatched = parseInt(qtyValue);
             currentItem.qty = parseInt(qtyValue); // Main qty for DESADV
          } else if (qtyQualifier === '47' && currentItem) {
             // Invoiced quantity
             currentItem.qtyInvoiced = parseInt(qtyValue);
             currentItem.qty = parseInt(qtyValue); // Main qty for INVOIC
          } else if (qtyQualifier === '11' && currentDeliveryLocation) {
            // Despatch quantity (for multi-delivery)
            currentDeliveryLocation.qty = parseInt(qtyValue);
          }
          break;

        case 'MOA': // Monetary amount
          const moaQualifier = parts[1].split(/(?<!\?):/)[0];
          const moaValue = parseFloat(parts[1].split(/(?<!\?):/)[1]);
          
          if (moaQualifier === '203' && currentItem) {
            currentItem.lineAmount = moaValue;
          } else if (moaQualifier === '79') {
            result.totals.lineAmount = moaValue;
          } else if (moaQualifier === '176') {
            result.totals.taxAmount = moaValue;
          } else if (moaQualifier === '128' || moaQualifier === '86') {
            result.totals.totalAmount = moaValue;
          } else if (moaQualifier === '23') {
            result.transportCharges = moaValue;
          } else if (moaQualifier === '124') { // Tax amount
             if (!result.totals.taxDetails) result.totals.taxDetails = [];
             // We need to associate this with the last TAX segment, but simplified for now:
             result.totals.lastTaxAmount = moaValue; 
          } else if (['8', '131'].includes(moaQualifier)) { // Allowance/Charge amount
             // handle allowance/charge
          }
          break;

        case 'PRI': // Price details
          if (currentItem && parts[1]) {
            const priceParts = parts[1].split(/(?<!\?):/);
            currentItem.priceQualifier = priceParts[0]; // AAA, AAB, etc.
            
            if (priceParts[0] === 'AAB') {
              currentItem.priceConfirmed = parseFloat(priceParts[1]);
            } else if (priceParts[0] === 'AAA') {
              currentItem.price = parseFloat(priceParts[1]);
              if (result.messageType === 'ORDCHG' || result.messageType === 'ORDRSP') {
                currentItem.priceConfirmed = parseFloat(priceParts[1]);
              }
            } else {
              currentItem.price = parseFloat(priceParts[1]);
            }
            
            if (priceParts[2]) currentItem.priceType = priceParts[2];
          }
          break;

        case 'TAX': // Tax
          if (currentItem && parts[1] === '7' && parts[5]) {
            const taxParts = parts[5].split(/(?<!\?):/);
            currentItem.taxRate = parseFloat(taxParts[taxParts.length - 1]);
          }
          break;

        case 'UNS': // Section control
          // Push last item before summary section
          if (currentItem) {
            result.items.push(currentItem);
            currentItem = null;
          }
          break;

        case 'CNT': // Control total
          if (parts[1]) {
            const cntParts = parts[1].split(/(?<!\?):/);
            if (cntParts[0] === '2') {
              result.itemCount = parseInt(cntParts[1]);
            }
          }
          break;
      }

      // Handle delivery location completion
      if (currentDeliveryLocation && segmentCode === 'DTM') {
        const dateQualifier = parts[1].split(/(?<!\?):/)[0];
        if (dateQualifier === '2') {
          currentDeliveryLocation.date = parts[1].split(/(?<!\?):/)[1];
          if (currentItem) {
            currentItem.deliveryLocations.push(currentDeliveryLocation);
          }
          currentDeliveryLocation = null;
        }
      }

    } catch (err) {
      console.error(`[EANCOM PARSER] Error parsing segment: ${line}`, err);
    }
  }

  // P3.1 IFTMIN : flush du dernier goods item
  if (currentGoodsItem) result.goodsItems.push(currentGoodsItem);

  // Push last item if exists
  if (currentItem) {
    // If we're inside a package context (DESADV), add item to package
    if (currentPackage) {
      currentPackage.items.push(currentItem);
    } else {
      result.items.push(currentItem);
    }
  }

  // Push last package if exists
  if (currentPackage) {
    result.packages.push(currentPackage);
  }

  return result;
}

/**
 * Validate parsed EANCOM data
 * @param {Object} parsedData - Parsed EANCOM data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateParsedEANCOM(parsedData) {
  const errors = [];

  if (!parsedData.messageType) errors.push('Missing message type');
  if (!parsedData.documentNumber) errors.push('Missing document number');

  // P3.1 IFTMIN : règles dédiées (transporteur, lieux, colis)
  if (parsedData.messageType === 'IFTMIN') {
    if (!parsedData.consignor?.gln) errors.push('Missing consignor GLN');
    if (!parsedData.consignee?.gln) errors.push('Missing consignee GLN');
    if (!parsedData.carrierParty?.code && !parsedData.carrierParty?.name) errors.push('Missing carrier');
    if (!parsedData.placeOfDelivery) errors.push('Missing place of delivery');
    if (!parsedData.goodsItems || parsedData.goodsItems.length === 0) errors.push('No goods items found');
    return { valid: errors.length === 0, errors };
  }

  if (!parsedData.buyer.gln) errors.push('Missing buyer GLN');
  if (!parsedData.supplier.gln) errors.push('Missing supplier GLN');
  
  if (parsedData.messageType === 'ORDERS' && parsedData.items.length === 0) {
    errors.push('No items found in order');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parse an APERAK EANCOM message and return a structured ACK/NACK object.
 * Convenience wrapper around parseEANCOM for use in processInboundAperak.
 * @param {string} eancomContent
 * @returns {{ referencedDocumentNumber, aperakFunctionCode, aperakErrorCode, aperakSenderGln, aperakReceiverGln, isAck: boolean }}
 */
function parseAperakEANCOM(eancomContent) {
  const parsed = parseEANCOM(eancomContent);
  return {
    ...parsed,
    isAck: parsed.aperakFunctionCode === '313',
    isNack: parsed.aperakFunctionCode === '314',
  };
}

module.exports = {
  parseEANCOM,
  validateParsedEANCOM,
  parseAperakEANCOM
};
