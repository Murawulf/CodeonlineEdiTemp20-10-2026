
const { format } = require('date-fns');

/**
 * Generate EANCOM DESADV D.01B message
 * @param {Object} data - Despatch Advice Data
 * @returns {string} EDI Message
 */
function generateDesadvEANCOM(data) {
  const segments = [];
  const senderGLN = data.seller.gln;
  const receiverGLN = data.buyer.gln;
  const now = new Date();
  
  // Helpers
  const formatDate = (d) => format(d || now, 'yyMMdd');
  const formatTime = (d) => format(d || now, 'HHmm');
  const formatDateTime = (d) => format(d || now, 'yyyyMMddHHmm');

  // --- UNB Header ---
  const refInterchange = `DES${format(now, 'yyMMddHHmm')}`;
  segments.push(`UNB+UNOC:3+${senderGLN}:14+${receiverGLN}:14+${formatDate(now)}:${formatTime(now)}+${refInterchange}`);

  // --- UNH Message Header ---
  const msgRef = `MSG${Date.now()}`;
  segments.push(`UNH+${msgRef}+DESADV:D:01B:UN:EAN007`);

  // --- BGM Beginning of Message ---
  // 351 = Despatch Advice
  segments.push(`BGM+351+${data.desadvNumber}+9`);

  // --- DTM Dates ---
  segments.push(`DTM+137:${formatDate(data.dateExpedition)}:102`); // Document date
  if (data.dateDelivery) {
    segments.push(`DTM+17:${formatDate(data.dateDelivery)}:102`); // Estimated delivery
  }

  // --- RFF References ---
  if (data.orderNumber) segments.push(`RFF+ON:${data.orderNumber}`);

  // --- NAD Partners ---
  segments.push(`NAD+BY+${data.buyer.gln}::9`);
  segments.push(`NAD+SU+${data.seller.gln}::9`);
  if (data.delivery.gln) {
    segments.push(`NAD+DP+${data.delivery.gln}::9`);
  }

  // --- TDT Transport Details ---
  // 20 = Main carriage transport
  // Mode: 30 = Road
  if (data.transport) {
    segments.push(`TDT+20++${data.transport.mode || '30'}+31+${data.transport.carrier || ''}:::${data.transport.carrierName || ''}+++${data.transport.vehicle || ''}`);
  }

  // --- HIERARCHY & LINES ---
  // Simple structure: Consignment -> Package (SSCC) -> Item (Line)
  // CPS+1++1 (Shipment Level)
  segments.push(`CPS+1`);

  let packageCount = 0;
  
  // If packages are defined, iterate them (CPS level 2)
  if (data.packages && data.packages.length > 0) {
    data.packages.forEach((pkg, pkgIndex) => {
       const pkgId = pkgIndex + 2; // CPS ID
       segments.push(`CPS+${pkgId}+1+3`); // 3 = Pack level
       
       // PAC Package details
       // CT = Carton, PX = Pallet
       segments.push(`PAC+1++${pkg.type || 'CT'}::9`);
       
       // PCI+GIN (SSCC)
       // 33E = Marked with SSCC
       if (pkg.sscc) {
         segments.push(`PCI+33E`);
         segments.push(`GIN+BJ+${pkg.sscc}`);
       }

       // Items in this package
       if (pkg.items) {
         pkg.items.forEach((item, itemIndex) => {
            // LIN Line Item
            segments.push(`LIN+${item.lineNumber}++${item.gtin}:EN`);
            
            // IMD Description
            if (item.description) {
              segments.push(`IMD+F++:::${item.description}`);
            }

            // QTY Quantity Dispatched
            segments.push(`QTY+12:${item.quantity}:PCE`); // 12 = Despatch quantity
            
            // QTY Quantity Ordered (optional)
            if (item.orderedQuantity) {
               segments.push(`QTY+21:${item.orderedQuantity}:PCE`);
            }
         });
       }
    });
  } else if (data.items) {
    // Flat list of items (no package hierarchy explicitly defined in input, assume loose)
    // Put them directly under shipment level (CPS 1) or create a dummy package?
    // Standard practice for simple DESADV: CPS+1 (Consignment) -> CPS+2 (Item) ?? 
    // Or just LINs under CPS+1 if no packing info.
    // Let's use CPS+1 for Consignment, then LINs.
    // WARNING: Some validators require CPS hierarchy. 
    // We will assume "Standard" hierarchy: 1=Consignment -> 2=Item (if no packages)
    
    // Actually, usually it's CPS+1 (Order/Consignment) -> CPS+2 (Pack) -> CPS+3 (Item)
    // If we lack pack info, we can do CPS+2 as 'Outer' or just list items.
    
    data.items.forEach((item) => {
      // Create a logical item level
      // segments.push(`CPS+${packageCount + 2}+1`); 
      segments.push(`LIN+${item.lineNumber}++${item.gtin}:EN`);
      if (item.description) segments.push(`IMD+F++:::${item.description}`);
      segments.push(`QTY+12:${item.quantity}:PCE`);
    });
  }

  // --- CNT Control Totals ---
  // 2 = Number of line items in message
  const totalLines = (data.packages ? data.packages.reduce((acc, p) => acc + (p.items ? p.items.length : 0), 0) : (data.items ? data.items.length : 0));
  segments.push(`CNT+2:${totalLines}`);

  // --- UNT Message Trailer ---
  segments.push(`UNT+${segments.length - 1}+${msgRef}`);

  // --- UNZ Interchange Trailer ---
  segments.push(`UNZ+1+${refInterchange}`);

  // Join with '
  return segments.join("'") + "'";
}

module.exports = { generateDesadvEANCOM };
