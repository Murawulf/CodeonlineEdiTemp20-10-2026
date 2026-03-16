// ====================== EANCOM ORDER CHANGE GENERATOR (GS1 Standard Compliant) ======================
// Based on GS1 EANCOM ORDCHG D.01B standard
// Used by the buyer to confirm/accept changes proposed by the supplier, or to request changes

function escapeEancom(str) {
  if (!str) return str;
  return str.replace(/[?+:'"]/g, match => '?' + match);
}

function generateOrderChangeEANCOM(data) {
  const lines = [];
  let segmentCount = 0;
  
  const add = function (l) {
    segmentCount++;
    lines.push(l);
  };

  // === MESSAGE HEADER ===
  // UNH - Message Header
  // ORDCHG = Purchase Order Change
  add("UNH+MESS001+ORDCHG:D:01B:UN:EAN010'");
  
  // === BGM - Beginning of Message ===
  // 230 = Purchase order change
  // 9 = Original (this is an original change request/confirmation)
  // The document number is the change reference (data.changeNumber), but we also reference the original order in BGM or RFF
  add("BGM+230+" + data.changeNumber + "+9'");

  // === DTM - Date/Time/Period ===
  // 137 = Document/Message date/time
  const now = new Date().toISOString().replace(/[-T:]/g, "").slice(0, 12);
  add("DTM+137:" + now + ":203'");

  // === RFF - Reference ===
  // ON = Order number (Reference to the original order being changed/confirmed)
  add("RFF+ON:" + data.originalOrderNumber + "'");
  
  // === NAD - Name and Address ===
  // BY = Buyer (The one sending the change/confirmation)
  if (data.buyerGln) {
    const buyerName = data.buyerName || "";
    add("NAD+BY+" + data.buyerGln + "::9++" + escapeEancom(buyerName) + "'");
  }

  // SU = Supplier (The one receiving the change/confirmation)
  if (data.supplierGln) {
    const supplierName = data.supplierName || "";
    add("NAD+SU+" + data.supplierGln + "::9++" + escapeEancom(supplierName) + "'");
  }

  // === FTX - Free Text ===
  if (data.comment) {
    add("FTX+AAI+++" + escapeEancom(data.comment) + "'");
  }

  // === LIN - Line Items ===
  if (data.articles && Array.isArray(data.articles)) {
    data.articles.forEach((item, index) => {
      const lineNumber = index + 1;
      
      // LIN - Line item
      // SRV = EAN.UCC Global Trade Item Number
      add("LIN+" + lineNumber + "++" + item.gtin + ":SRV'");
      
      // QTY - Quantity
      // 21 = Ordered quantity (in the context of ORDCHG, this is the newly confirmed/changed quantity)
      add("QTY+21:" + item.qty + "'");
      
      // PRI - Price
      // AAA = Calculation net (confirmed price)
      if (item.price !== undefined && item.price !== null) {
        add("PRI+AAA:" + item.price + "'");
      }
    });
  }

  // === MESSAGE TRAILER ===
  // UNT - Message Trailer
  // Segment count includes UNH and UNT
  add("UNT+" + (segmentCount + 1) + "+MESS001'");

  return lines.join("\n");
}

module.exports = generateOrderChangeEANCOM;
