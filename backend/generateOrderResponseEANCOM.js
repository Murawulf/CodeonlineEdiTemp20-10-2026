// ====================== EANCOM ORDER RESPONSE GENERATOR (GS1 Standard Compliant) ======================
// Based on GS1 EANCOM ORDRSP D.01B standard
// Used to Accept, Reject, or Modify an order

function escapeEancom(str) {
  if (!str) return str;
  return str.replace(/[?+:'"]/g, match => '?' + match);
}

function generateOrderResponseEANCOM(data) {
  const lines = [];
  let segmentCount = 0;
  
  const add = function (l) {
    segmentCount++;
    lines.push(l);
  };

  // === MESSAGE HEADER ===
  // UNH - Message Header
  // ORDRSP = Order Response
  add("UNH+MESS001+ORDRSP:D:01B:UN:EAN010'");
  
  // === BGM - Beginning of Message ===
  // 231 = Purchase order response
  // 29 = Accepted without amendment
  // 27 = Not accepted (Rejected)
  // 4 = Change (Accepted with amendment)
  let responseCode = '29'; // Default Accepted
  if (data.status === 'rejected') responseCode = '27';
  if (data.status === 'modified') responseCode = '4';
  
  add("BGM+231+" + data.responseNumber + "+" + responseCode + "'");
  
  // === DTM - Date/Time/Period ===
  // 137 = Document/Message date/time
  const now = new Date().toISOString().replace(/[-T:]/g, "").slice(0, 12);
  add("DTM+137:" + now + ":203'");

  // === RFF - Reference ===
  // ON = Order number (Reference to the original order)
  add("RFF+ON:" + data.originalOrderNumber + "'");
  // DTM+171 = Reference date
  if (data.originalOrderDate) {
    add("DTM+171:" + data.originalOrderDate + ":102'");
  }
  
  // === DTM - Delivery Date ===
  // 2 = Requested delivery date
  if (data.requestedDeliveryDate) {
    const reqDate = new Date(data.requestedDeliveryDate).toISOString().split('T')[0].replace(/-/g, '');
    add("DTM+2:" + reqDate + ":102'");
  }
  // 69 = Confirmed delivery date
  if (data.confirmedDeliveryDate) {
    const confDate = new Date(data.confirmedDeliveryDate).toISOString().split('T')[0].replace(/-/g, '');
    add("DTM+69:" + confDate + ":102'");
  }

  // === NAD - Name and Address ===
  // BY = Buyer (The one who sent the order)
  if (data.buyerGln) {
    const buyerName = data.buyerName || "";
    add("NAD+BY+" + data.buyerGln + "::9++" + buyerName + "'");
  }

  // SU = Supplier (The one sending this response)
  if (data.supplierGln) {
    const supplierName = data.supplierName || "";
    add("NAD+SU+" + data.supplierGln + "::9++" + supplierName + "'");
  }

  // === CUX - Currencies ===
  if (data.currency) {
    add("CUX+2:" + data.currency + ":9'");
  }

  // === FTX - Free Text ===
  // General comment on the order response
  if (data.comment) {
    // AAI = General information
    add("FTX+AAI+++: " + escapeEancom(data.comment) + "'");
  }

  // === LINE ITEMS ===
  // Only necessary if modifying or rejecting specific lines, but good practice to include confirmed lines too
  // For 'Accepted', we can skip lines or include all as accepted.
  // For 'Rejected' (global), lines are optional.
  // For 'Modified', we MUST include lines.
  
  const items = Array.isArray(data.articles) ? data.articles : [];

  items.forEach(function (item, idx) {
    const lineNumber = idx + 1;
    
    // LIN - Line Item
    add("LIN+" + lineNumber + "++" + item.gtin + ":SRV'");

    // QTY - Quantity
    // 21 = Ordered quantity (Original)
    // 185 = Confirmed quantity (Accepted)
    
    // If modified, we show the confirmed quantity
    // If accepted, confirmed = ordered
    // If rejected, confirmed = 0
    
    let confirmedQty = item.qty;
    if (data.status === 'rejected') confirmedQty = 0;
    if (item.confirmedQty !== undefined) confirmedQty = item.confirmedQty;

    add("QTY+21:" + item.qty + "'"); // Original Ordered
    add("QTY+185:" + confirmedQty + "'"); // Confirmed
    
    // PRI - Price Details
    // AAA = Calculation net (Original price)
    if (item.price) {
        add("PRI+AAA:" + parseFloat(item.price).toFixed(2) + "::NTP:1:PCE'");
    }
    // AAB = Gross price (Confirmed price if different)
    if (item.confirmedPrice !== undefined && parseFloat(item.confirmedPrice) !== parseFloat(item.price || 0)) {
        add("PRI+AAB:" + parseFloat(item.confirmedPrice).toFixed(2) + "::NTP:1:PCE'");
    }

    // Action Code for Line
    // 5 = Accepted without amendment
    // 7 = Not accepted
    // 3 = Changed
    let lineActionCode = '5';
    if (data.status === 'rejected') lineActionCode = '7';
    else if (item.qty !== confirmedQty) lineActionCode = '3';
    
    // LIN action is usually implicit in ORDRSP by QTY+185 difference, 
    // but specific action codes can be in LIN segment data element 1229 if used, 
    // or typically deduced. Standard practice relies on QTY+185.
    
    // FTX on line level
    if (item.comment) {
        add("FTX+LIN+++: " + escapeEancom(item.comment) + "'");
    }
  });

  // === UNS - Section Control ===
  add("UNS+S'");
  
  // === CNT - Control Total ===
  add("CNT+2:" + items.length + "'");

  // === MESSAGE TRAILER ===
  add("UNT+" + (segmentCount + 1) + "+MESS001'");

  return lines.join("\n") + "\n";
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateOrderResponseEANCOM };
}
