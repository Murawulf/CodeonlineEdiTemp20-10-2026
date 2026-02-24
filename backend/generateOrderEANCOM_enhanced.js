// ====================== ENHANCED EANCOM GENERATOR (GS1 Standard Compliant) ======================
// Based on GS1 EANCOM ORDERS D.01B standard
// Supports all major segments for complete purchase order messages

function generateOrderEANCOM_Enhanced(data) {
  const lines = [];
  let segmentCount = 0;
  
  const add = function (l) {
    segmentCount++;
    lines.push(l);
  };

  // === MESSAGE HEADER ===
  add("UNH+MESS001+ORDERS:D:01B:UN:EAN010'");
  
  // === BGM - Beginning of Message ===
  // 220 = Purchase order, 9 = Original
  add("BGM+220+" + data.numCommande + "+9'");
  
  // === DTM - Date/Time/Period ===
  // 137 = Document date
  if (data.datecommande) {
    add("DTM+137:" + data.datecommande + ":102'");
  }
  
  // 2 = Delivery date/time requested
  if (data.dateLivraisonDemandee) {
    add("DTM+2:" + data.dateLivraisonDemandee + ":102'");
  }
  
  // 64 = Delivery date/time, earliest
  if (data.dateLivraisonPlusTot) {
    add("DTM+64:" + data.dateLivraisonPlusTot + ":102'");
  }
  
  // 63 = Delivery date/time, latest
  if (data.dateLivraisonPlusTard) {
    add("DTM+63:" + data.dateLivraisonPlusTard + ":102'");
  }
  
  // 200 = Pick-up/collection date/time
  if (data.dateenlevement) {
    add("DTM+200:" + data.dateenlevement + ":102'");
  }

  // === PAI - Payment Instructions ===
  // 42 = Account holder's account is to be credited
  if (data.paymentTermsCode) {
    add("PAI+::" + data.paymentTermsCode + "'");
  }

  // === ALI - Additional Information ===
  // 136 = Group conditions apply
  if (data.groupConditionsCode) {
    add("ALI+++" + data.groupConditionsCode + "'");
  }

  // === FTX - Free Text ===
  // ZZZ = Mutually defined
  if (data.freeText) {
    add("FTX+ZZZ+1+001::91+" + data.freeText + "'");
  }

  // === RFF - Reference ===
  // CT = Contract number
  if (data.contractReference) {
    add("RFF+CT:" + data.contractReference + "'");
    if (data.contractDate) {
      add("DTM+171:" + data.contractDate + ":102'");
    }
  }

  // === NAD - Name and Address ===
  // BY = Buyer
  if (data.Acheteur) {
    add("NAD+BY+" + data.Acheteur + "::9'");
    
    // RFF+VA = VAT registration number
    if (data.buyerVatNumber) {
      add("RFF+VA:" + data.buyerVatNumber + "'");
    }
    
    // CTA = Contact information
    if (data.orderContactName) {
      add("CTA+OC+:" + data.orderContactName + "'");
      
      // COM = Communication contact
      if (data.orderContactPhone) {
        add("COM+" + data.orderContactPhone + ":TE'");
      }
      if (data.orderContactEmail) {
        add("COM+" + data.orderContactEmail + ":EM'");
      }
    }
  }

  // SU = Supplier
  if (data.fournisseur) {
    add("NAD+SU+" + data.fournisseur + "::9'");
    
    if (data.supplierVatNumber) {
      add("RFF+VA:" + data.supplierVatNumber + "'");
    }
  }

  // DP = Delivery party
  if (data.lieu_livraison_primaire) {
    add("NAD+DP+" + data.lieu_livraison_primaire + "::9'");
  }

  // UC = Ultimate consignee
  if (data.lieu_livraison_primaire) {
    add("NAD+UC+" + data.lieu_livraison_primaire + "::9'");
  }

  // IV = Invoicee
  if (data.facture) {
    add("NAD+IV+" + data.facture + "::9'");
  }

  // === CUX - Currencies ===
  // 2 = Reference currency (ordering currency)
  // 3 = Target currency (invoicing currency)
  if (data.monnaie) {
    if (data.exchangeRate && data.exchangeRateCurrency) {
      // With exchange rate
      add("CUX+2:" + data.monnaie + ":9+3:" + data.exchangeRateCurrency + ":4+" + data.exchangeRate + "'");
      
      // DTM+134 = Validity period for exchange rate
      if (data.exchangeRatePeriodStart && data.exchangeRatePeriodEnd) {
        add("DTM+134:" + data.exchangeRatePeriodStart + data.exchangeRatePeriodEnd + ":718'");
      }
    } else {
      // Simple currency
      add("CUX+2:" + data.monnaie + ":9'");
    }
  }

  // === TDT - Details of Transport ===
  // 20 = Main carriage transport
  // 30 = Mode of transport: Road (31 = Truck)
  if (data.transportMode) {
    add("TDT+20++" + data.transportMode + "+" + (data.transportMeans || "") + "'");
  }

  // === TOD - Terms of Delivery ===
  // 3 = Terms of delivery
  // Incoterms: CIF, FOB, EXW, DDP, etc.
  if (data.deliveryTermsCode) {
    add("TOD+3++" + data.deliveryTermsCode + ":2E:9'");
    
    // LOC+1 = Place/port of loading/unloading
    if (data.deliveryPort) {
      add("LOC+1+" + data.deliveryPort + "'");
    }
  }

  // === LINE ITEMS ===
  const items = Array.isArray(data.articles) ? data.articles : [];

  items.forEach(function (item, idx) {
    const lineNumber = idx + 1;
    const unit = item.unit || "PCE";

    // LIN - Line Item
    // EN = European Article Number (EAN/GTIN)
    add("LIN+" + lineNumber + "++" + item.gtin + ":SRV'");

    // PIA - Additional Product Identification
    // IN = Buyer's item number
    if (item.buyerProductCode) {
      add("PIA+1+" + item.buyerProductCode + ":IN'");
    }
    // SA = Supplier's article number
    if (item.supplierProductCode) {
      add("PIA+1+" + item.supplierProductCode + ":SA'");
    }

    // IMD - Item Description
    // C = Code and text, TU = Trade unit
    if (item.productDescription) {
      add("IMD+C++TU::9+" + item.productDescription + "'");
    } else {
      add("IMD+C++TU::9'");
    }

    // QTY - Quantity
    // 21 = Ordered quantity
    add("QTY+21:" + item.qty + "'");

    // MOA - Monetary Amount
    // 203 = Line item amount
    if (item.lineNetAmount) {
      add("MOA+203:" + parseFloat(item.lineNetAmount).toFixed(2) + "'");
    }

    // PRI - Price Details
    // AAA = Calculation net, CT = Calculation type, AAE = Information
    const priceQualifier = item.priceQualifier || "AAA";
    const priceUnit = item.priceUnit || unit;
    add("PRI+" + priceQualifier + ":" + parseFloat(item.price).toFixed(2) + ":CT:AAE:1:" + priceUnit + "'");

    // RFF+PL - Price list reference
    if (data.priceListReference) {
      add("RFF+PL:" + data.priceListReference + "'");
      if (data.priceListDate) {
        add("DTM+171:" + data.priceListDate + ":102'");
      }
    }

    // PAC - Package
    // Number of packages + package type code
    if (item.linePackageCount) {
      const packageType = item.linePackageType || "CS"; // CS = Case, PAL = Pallet
      add("PAC+" + item.linePackageCount + "+:" + (item.packageLevel || "51") + "+" + packageType + "'");
    }

    // PCI - Package Identification
    // 14 = Expiry date marking
    if (item.packageMarkingInstructions) {
      add("PCI+" + item.packageMarkingInstructions + "'");
    }

    // === Multiple Delivery Locations (if applicable) ===
    if (Array.isArray(item.deliveryLocations)) {
      item.deliveryLocations.forEach(function(loc) {
        // LOC+7 = Place of delivery
        add("LOC+7+" + loc.gln + "::9'");
        
        // QTY+11 = Despatch quantity
        add("QTY+11:" + loc.qty + "'");
        
        // DTM+2 = Delivery date/time requested
        if (loc.date) {
          add("DTM+2:" + loc.date + ":102'");
        }
      });
    }

    // TAX - Duty/Tax/Fee Details
    // 7 = Tax, VAT = Value added tax
    // S = Standard rate
    if (item.lineTaxRate !== undefined) {
      add("TAX+7+VAT+++:::" + parseFloat(item.lineTaxRate).toFixed(1) + "+S'");
    } else if (data.taxRate !== undefined) {
      add("TAX+7+VAT+++:::" + parseFloat(data.taxRate).toFixed(1) + "+S'");
    }
  });

  // === UNS - Section Control ===
  // S = Detail/summary section separator
  add("UNS+S'");

  // === SUMMARY SECTION ===

  // Calculate total line amount if not provided
  let calculatedTotalLineAmount = data.totalLineAmount;
  if (!calculatedTotalLineAmount && items.length > 0) {
    calculatedTotalLineAmount = items.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (qty * price);
    }, 0);
  }

  // MOA - Monetary amounts (summary)
  // MOA+86 = Total amount HT (used by parser as totalAmount)
  const totalHT = data.total_ht || calculatedTotalLineAmount;
  if (totalHT) {
    add("MOA+86:" + parseFloat(totalHT).toFixed(2) + "'"); // 86 = Total amount
  }
  if (calculatedTotalLineAmount) {
    add("MOA+79:" + parseFloat(calculatedTotalLineAmount).toFixed(2) + "'"); // 79 = Total line items amount
  }
  if (data.totalTaxAmount) {
    add("MOA+176:" + parseFloat(data.totalTaxAmount).toFixed(2) + "'"); // 176 = Total tax amount
  }
  if (data.totalAmountWithTax) {
    add("MOA+128:" + parseFloat(data.totalAmountWithTax).toFixed(2) + "'"); // 128 = Total amount
  }

  // Transport charges
  if (data.fraisTransport && data.fraisTransport > 0) {
    add("MOA+23:" + parseFloat(data.fraisTransport).toFixed(2) + "'");
  }

  // CNT - Control Total
  // 2 = Number of line items
  add("CNT+2:" + items.length + "'");

  // === MESSAGE TRAILER ===
  add("UNT+" + (segmentCount + 1) + "+MESS001'");

  return lines.join("\n") + "\n";
}

// Export for use in server.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateOrderEANCOM_Enhanced };
}
