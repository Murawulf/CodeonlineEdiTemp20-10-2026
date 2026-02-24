// =====================================================
// EANCOM PARSER - Parse incoming EDI messages
// Supports: ORDERS, INVOIC, ORDRSP, DESADV
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

  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const result = {
    messageType: null,
    messageNumber: null,
    documentNumber: null,
    documentDate: null,
    buyer: { gln: null, vat: null, name: null, contact: null, phone: null, email: null },
    supplier: { gln: null, vat: null, name: null },
    deliveryParty: { gln: null, name: null },
    currency: null,
    exchangeRate: null,
    paymentTerms: null,
    transport: { mode: null, means: null },
    deliveryTerms: null,
    deliveryPort: null,
    contractReference: null,
    priceListReference: null,
    freeText: null,
    items: [],
    totals: { lineAmount: null, taxAmount: null, totalAmount: null },
    itemCount: null,
    rawSegments: []
  };

  let currentItem = null;
  let currentDeliveryLocation = null;

  for (const line of lines) {
    // Store raw segment
    result.rawSegments.push(line);

    // Split segment by + (EDIFACT separator)
    const parts = line.split('+');
    const segmentCode = parts[0];

    try {
      switch (segmentCode) {
        case 'UNH': // Message header
          result.messageNumber = parts[1];
          if (parts[2]) {
            const messageInfo = parts[2].split(':');
            result.messageType = messageInfo[0]; // ORDERS, INVOIC, ORDRSP, DESADV
          } else {
             console.error('[PARSER ERROR] UNH segment missing message type part:', line);
          }
          break;

        case 'BGM': // Beginning of message
          result.documentNumber = parts[2];
          if (parts[3]) {
            result.responseCode = parts[3]; // For ORDRSP: 29=Accepted, 27=Rejected, 4=Modified
          }
          break;

        case 'DTM': // Date/time/period
          const dateQualifier = parts[1].split(':')[0];
          const dateValue = parts[1].split(':')[1];
          
          if (dateQualifier === '137') result.documentDate = dateValue; // Document date
          else if (dateQualifier === '2') result.deliveryDateRequested = dateValue; // Delivery date
          else if (dateQualifier === '64') result.deliveryDateEarliest = dateValue;
          else if (dateQualifier === '63') result.deliveryDateLatest = dateValue;
          else if (dateQualifier === '171') result.contractDate = dateValue; // Contract/price list date
          break;

        case 'PAI': // Payment instructions
          if (parts[1]) {
            const paymentParts = parts[1].split(':');
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
            ftxText = parts[4].split(':').filter(Boolean).join(' ');
          }
          
          if (currentItem) {
             currentItem.comment = ftxText;
          } else {
             result.freeText = ftxText;
             // ORDRSP specific general comment
             if (ftxType === 'AAI') result.comment = ftxText;
          }
          break;

        case 'RFF': // Reference
          const refQualifier = parts[1].split(':')[0];
          const refValue = parts[1].split(':')[1];
          
          if (refQualifier === 'CT') result.contractReference = refValue;
          else if (refQualifier === 'PL') result.priceListReference = refValue;
          else if (refQualifier === 'ON') result.orderReference = refValue; // Original Order Number
          else if (refQualifier === 'VA') {
            // VAT number - assign to current party context
            if (currentPartyType === 'BY') result.buyer.vat = refValue;
            else if (currentPartyType === 'SU') result.supplier.vat = refValue;
          }
          break;

        case 'NAD': // Name and address
          const partyQualifier = parts[1];
          const partyGLN = parts[2] ? parts[2].split(':')[0] : null;
          
          currentPartyType = partyQualifier;
          
          if (partyQualifier === 'BY') result.buyer.gln = partyGLN;
          else if (partyQualifier === 'SU') result.supplier.gln = partyGLN;
          else if (partyQualifier === 'DP') result.deliveryParty.gln = partyGLN;
          else if (partyQualifier === 'UC') result.ultimateConsignee = partyGLN;
          else if (partyQualifier === 'IV') result.invoicee = partyGLN;
          break;

        case 'CTA': // Contact information
          if (parts[2]) {
            const contactName = parts[2].split(':')[1];
            if (currentPartyType === 'BY') result.buyer.contact = contactName;
          }
          break;

        case 'COM': // Communication contact
          if (parts[1]) {
            const commParts = parts[1].split(':');
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
            const currencyParts = parts[1].split(':');
            result.currency = currencyParts[1];
          }
          if (parts[2]) {
            const targetCurrencyParts = parts[2].split(':');
            result.exchangeRateCurrency = targetCurrencyParts[1];
          }
          if (parts[3]) {
            result.exchangeRate = parseFloat(parts[3]);
          }
          break;

        case 'TDT': // Transport details
          if (parts[3]) result.transport.mode = parts[3];
          if (parts[4]) result.transport.means = parts[4];
          break;

        case 'CPS': // Consignment Packing Sequence (DESADV)
          // parts[1] = Hierarchical ID, parts[2] = Parent ID, parts[3] = Packaging Level
          if (result.messageType === 'DESADV') {
             // We can track hierarchy if needed, for now just noting it exists
             // currentPackageHierarchy = { id: parts[1], parent: parts[2], level: parts[3] };
          }
          break;

        case 'PCI': // Package Identification (DESADV)
           // Often follows PAC. 
           // If we have a currentItem (line item), it might be item-level packaging.
           // If not, it might be shipment-level packaging.
           break;

        case 'GIN': // Goods Identity Number (SSCC)
           if (parts[1] === 'BJ' && parts[2]) { // BJ = Serial shipping container code
             const sscc = parts[2].split(':')[0];
             // Attach to the last defined package or item
             if (currentItem && currentItem.packageCount) {
                currentItem.sscc = sscc;
             } else if (result.currentPackage) {
                result.currentPackage.sscc = sscc;
             } else {
                // Top level or loose SSCC
                if (!result.packages) result.packages = [];
                result.packages.push({ sscc });
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
            const incoterms = parts[3].split(':')[0];
            result.deliveryTerms = incoterms;
          }
          break;

        case 'LOC': // Location
          const locQualifier = parts[1];
          const locValue = parts[2];
          
          if (locQualifier === '1') result.deliveryPort = locValue; // Port of loading/unloading
          else if (locQualifier === '7') {
            // Place of delivery (for multi-delivery)
            currentDeliveryLocation = { gln: locValue, qty: null, date: null };
          }
          break;

        case 'LIN': // Line item
          if (currentItem) result.items.push(currentItem);
          
          const lineNumber = parts[1];
          const gtin = parts[3] ? parts[3].split(':')[0] : null;
          
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
            packageCount: null,
            packageType: null,
            deliveryLocations: []
          };
          break;

        case 'PIA': // Additional product identification
          if (currentItem && parts[2]) {
            const productParts = parts[2].split(':');
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
          const qtyQualifier = parts[1].split(':')[0];
          const qtyValue = parts[1].split(':')[1];
          
          if (qtyQualifier === '21' && currentItem) {
            // Ordered quantity
            currentItem.qtyOrdered = parseInt(qtyValue);
            // Fallback for ORDERS message where 21 is the main qty
            if (!currentItem.qty) currentItem.qty = parseInt(qtyValue);
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
          const moaQualifier = parts[1].split(':')[0];
          const moaValue = parseFloat(parts[1].split(':')[1]);
          
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
            const priceParts = parts[1].split(':');
            currentItem.priceQualifier = priceParts[0]; // AAA, AAB, etc.
            
            if (priceParts[0] === 'AAB') {
              currentItem.priceConfirmed = parseFloat(priceParts[1]);
            } else {
              currentItem.price = parseFloat(priceParts[1]);
            }
            
            if (priceParts[5]) currentItem.unit = priceParts[5];
          }
          break;

        case 'PAC': // Package
          if (currentItem && parts[1]) {
            currentItem.packageCount = parseInt(parts[1]);
            if (parts[3]) currentItem.packageType = parts[3];
          }
          break;

        case 'TAX': // Tax
          if (currentItem && parts[1] === '7' && parts[5]) {
            const taxParts = parts[5].split(':');
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
            const cntParts = parts[1].split(':');
            if (cntParts[0] === '2') {
              result.itemCount = parseInt(cntParts[1]);
            }
          }
          break;
      }

      // Handle delivery location completion
      if (currentDeliveryLocation && segmentCode === 'DTM') {
        const dateQualifier = parts[1].split(':')[0];
        if (dateQualifier === '2') {
          currentDeliveryLocation.date = parts[1].split(':')[1];
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

  // Push last item if exists
  if (currentItem) result.items.push(currentItem);

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

module.exports = {
  parseEANCOM,
  validateParsedEANCOM
};
