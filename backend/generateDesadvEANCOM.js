
const { format } = require('date-fns');

/**
 * Generate EANCOM DESADV D.01B message
 * Full GS1/EANCOM compliance per GS1 General Specifications v23
 *
 * Hierarchy: CPS+1 (Consignment) -> CPS+n (Handling Unit / Package) -> LIN (Items)
 * Supports: SSCC marking (PCI+33E / GIN+BJ), batch/lot (PCI+36E / GIN+BX),
 *           weight (MEA+WT), expiry dates, transport details (TDT)
 *
 * @param {Object} data - Despatch Advice Data
 * @returns {string} EDI Message
 */
function generateDesadvEANCOM(data) {
  const segments = [];
  const senderGLN = data.seller.gln;
  const receiverGLN = data.buyer.gln;
  const now = new Date();
  
  // Helpers
  const formatDate = (d) => {
    try { return format(d instanceof Date ? d : new Date(d), 'yyyyMMdd'); }
    catch { return format(now, 'yyyyMMdd'); }
  };
  const formatTime = (d) => format(d || now, 'HHmm');
  const formatYYMMDD = (d) => {
    try {
      const dt = d instanceof Date ? d : new Date(d);
      return `${String(dt.getFullYear()).slice(-2)}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}`;
    } catch { return null; }
  };

  // --- UNB Interchange Header ---
  const refInterchange = `DES${format(now, 'yyyyMMddHHmm')}`;
  segments.push(`UNB+UNOC:3+${senderGLN}:14+${receiverGLN}:14+${formatDate(now)}:${formatTime(now)}+${refInterchange}`);

  // --- UNH Message Header ---
  const msgRef = `MSG${Date.now()}`;
  segments.push(`UNH+${msgRef}+DESADV:D:01B:UN:EAN007`);

  // --- BGM Beginning of Message ---
  // 351 = Despatch Advice, 9 = Original
  segments.push(`BGM+351+${data.desadvNumber}+9`);

  // --- DTM Dates ---
  // 137 = Document/message date, 102 = CCYYMMDD format
  segments.push(`DTM+137:${formatDate(data.dateExpedition || now)}:102`);
  if (data.dateDelivery) {
    // 17 = Delivery date/time, estimated
    segments.push(`DTM+17:${formatDate(data.dateDelivery)}:102`);
  }
  if (data.datePickup) {
    // 200 = Pick-up/collection date/time of cargo
    segments.push(`DTM+200:${formatDate(data.datePickup)}:102`);
  }

  // --- RFF References ---
  if (data.orderNumber) segments.push(`RFF+ON:${data.orderNumber}`);
  if (data.deliveryNoteNumber) segments.push(`RFF+DQ:${data.deliveryNoteNumber}`);
  if (data.invoiceNumber) segments.push(`RFF+IV:${data.invoiceNumber}`);

  // --- NAD Name and Address ---
  // BY = Buyer, SU = Supplier, DP = Delivery Party, CZ = Consignee
  segments.push(`NAD+BY+${data.buyer.gln}::9`);
  if (data.buyer.name) segments.push(`NAD+BY+${data.buyer.gln}::9++++${data.buyer.name}`);
  segments.push(`NAD+SU+${data.seller.gln}::9`);
  if (data.delivery && data.delivery.gln) {
    segments.push(`NAD+DP+${data.delivery.gln}::9`);
  }

  // --- TDT Transport Details ---
  // 20 = Main carriage, Mode: 30 = Road, 40 = Air, 60 = Multimodal, 10 = Maritime
  if (data.transport) {
    const mode = data.transport.mode || '30';
    const carrier = data.transport.carrier || '';
    const carrierName = data.transport.carrierName || '';
    const vehicle = data.transport.vehicle || '';
    segments.push(`TDT+20++${mode}+++${carrier}:::${carrierName}+++${vehicle}`);
  }

  // --- TOD Terms of Delivery (optional Incoterms) ---
  if (data.deliveryTerms) {
    // 6 = Mutually defined, CIF/FOB/EXW etc.
    segments.push(`TOD+6++${data.deliveryTerms}`);
  }

  // === HIERARCHY (CPS) ===
  // CPS+1 = Consignment (shipment) level
  segments.push(`CPS+1`);

  // Shipment-level PAC for total outer packages
  if (data.packages && data.packages.length > 0) {
    const pallets = data.packages.filter(p => p.type === 'PX').length;
    const cartons = data.packages.filter(p => p.type !== 'PX').length;
    if (pallets > 0) segments.push(`PAC+${pallets}++PX::9`);
    if (cartons > 0) segments.push(`PAC+${cartons}++CT::9`);
  }

  // Shipment-level MEA for total gross weight
  if (data.totalWeight) {
    // AAE = Net weight, G = Gross weight, KGM = Kilograms
    segments.push(`MEA+WT+G+KGM:${data.totalWeight}`);
  }

  let cpsCounter = 1;

  // --- Package-level CPS (Handling Units with SSCC) ---
  if (data.packages && data.packages.length > 0) {
    data.packages.forEach((pkg) => {
      cpsCounter++;
      // CPS+n+1 = child of consignment level, packaging level code 4 = Inner
      const packLevel = pkg.type === 'PX' ? '1' : '3'; // 1=Outer(pallet), 3=Inner(carton)
      segments.push(`CPS+${cpsCounter}+1+${packLevel}`);

      // PAC - Package description
      // 1 = number of packages at this level
      segments.push(`PAC+1++${pkg.type || 'CT'}::9`);

      // MEA - Package weight (gross)
      if (pkg.weight) {
        segments.push(`MEA+WT+G+KGM:${pkg.weight}`);
      }

      // PCI+33E = Package marked with SSCC (Etiquetage / Labeling)
      // GIN+BJ = SSCC number (Serial Shipping Container Code)
      if (pkg.sscc) {
        segments.push(`PCI+33E`);
        segments.push(`GIN+BJ+${pkg.sscc}`);
      }

      // PCI+36E = Package marked with batch/lot (Marquage)
      // GIN+BX = Batch number
      if (pkg.batchNumber) {
        segments.push(`PCI+36E`);
        segments.push(`GIN+BX+${pkg.batchNumber}`);
      }

      // Items within this package
      if (pkg.items && pkg.items.length > 0) {
        pkg.items.forEach((item) => {
          // LIN - Line Item (GTIN identification)
          const gtin = String(item.gtin || '').padStart(14, '0');
          segments.push(`LIN+${item.lineNumber || 1}++${gtin}:SRV`);

          // PIA - Additional product identification (supplier code)
          if (item.supplierItemCode) {
            segments.push(`PIA+1+${item.supplierItemCode}:SA`);
          }

          // IMD - Item Description
          if (item.description) {
            segments.push(`IMD+F++:::${item.description.substring(0, 35)}`);
          }

          // QTY+12 = Despatch quantity
          segments.push(`QTY+12:${item.quantity}:PCE`);

          // QTY+21 = Ordered quantity (for reconciliation)
          if (item.orderedQuantity) {
            segments.push(`QTY+21:${item.orderedQuantity}:PCE`);
          }

          // PCI+17 = Batch/lot marking at item level (Marquage produit)
          if (item.batchNumber) {
            segments.push(`PCI+17`);
            segments.push(`GIN+BX+${item.batchNumber}`);
          }

          // DTM+361 = Best before date / Expiry date
          if (item.expiryDate) {
            const expYYMMDD = formatYYMMDD(item.expiryDate);
            if (expYYMMDD) segments.push(`DTM+361:${expYYMMDD}:101`); // 101 = YYMMDD
          }

          // DTM+94 = Production date
          if (item.productionDate) {
            const prodYYMMDD = formatYYMMDD(item.productionDate);
            if (prodYYMMDD) segments.push(`DTM+94:${prodYYMMDD}:101`);
          }
        });
      }
    });
  } else if (data.items && data.items.length > 0) {
    // Flat items (no package hierarchy) - put directly under consignment
    data.items.forEach((item) => {
      const gtin = String(item.gtin || '').padStart(14, '0');
      segments.push(`LIN+${item.lineNumber || 1}++${gtin}:SRV`);
      if (item.description) {
        segments.push(`IMD+F++:::${item.description.substring(0, 35)}`);
      }
      segments.push(`QTY+12:${item.quantity}:PCE`);
      if (item.orderedQuantity) {
        segments.push(`QTY+21:${item.orderedQuantity}:PCE`);
      }
      if (item.batchNumber) {
        segments.push(`PCI+17`);
        segments.push(`GIN+BX+${item.batchNumber}`);
      }
      if (item.expiryDate) {
        const expYYMMDD = formatYYMMDD(item.expiryDate);
        if (expYYMMDD) segments.push(`DTM+361:${expYYMMDD}:101`);
      }
    });
  }

  // --- CNT Control Totals ---
  // 2 = Total number of line items
  const totalLines = (data.packages
    ? data.packages.reduce((acc, p) => acc + (p.items ? p.items.length : 0), 0)
    : (data.items ? data.items.length : 0));
  segments.push(`CNT+2:${totalLines}`);

  // --- UNT Message Trailer ---
  // Count = number of segments from UNH to UNT inclusive
  segments.push(`UNT+${segments.length - 1}+${msgRef}`);

  // --- UNZ Interchange Trailer ---
  segments.push(`UNZ+1+${refInterchange}`);

  return segments.join("'") + "'";
}

module.exports = { generateDesadvEANCOM };
