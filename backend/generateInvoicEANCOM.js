
const { format } = require('date-fns');

/**
 * Generate EANCOM INVOIC D.01B message
 * @param {Object} data - Invoice Data
 * @returns {string} EDI Message
 */
function generateInvoicEANCOM(data) {
  const segments = [];
  const senderGLN = data.seller.gln;
  const receiverGLN = data.buyer.gln;
  const now = new Date();
  
  // Helpers
  const formatDate = (d) => format(d || now, 'yyyyMMdd');
  const formatTime = (d) => format(d || now, 'HHmm');

  // --- UNB Header ---
  const refInterchange = `INV${format(now, 'yyyyMMddHHmm')}`;
  segments.push(`UNB+UNOC:3+${senderGLN}:14+${receiverGLN}:14+${formatDate(now)}:${formatTime(now)}+${refInterchange}`);

  // --- UNH Message Header ---
  const msgRef = `MSG${Date.now()}`;
  segments.push(`UNH+${msgRef}+INVOIC:D:01B:UN:EAN011`);

  // --- BGM Beginning of Message ---
  // 380 = Commercial Invoice
  segments.push(`BGM+380+${data.invoiceNumber}+9`);

  // --- DTM Dates ---
  segments.push(`DTM+137:${formatDate(data.dateInvoice)}:102`); // Document/Invoice date
  if (data.dateDue) {
    segments.push(`DTM+200:${formatDate(data.dateDue)}:102`); // Payment due date (optional but good)
  }

  // --- RFF References ---
  if (data.orderNumber) segments.push(`RFF+ON:${data.orderNumber}`);
  if (data.desadvNumber) segments.push(`RFF+DQ:${data.desadvNumber}`); // DQ = Delivery Note

  // --- NAD Partners ---
  segments.push(`NAD+BY+${data.buyer.gln}::9`);
  segments.push(`NAD+SU+${data.seller.gln}::9`);
  // Invoicee or Payee if different

  // --- CUX Currencies ---
  // 6345:2 = Reference currency (EUR)
  segments.push(`CUX+2:${data.currency || 'EUR'}:4`);

  // --- ITEMS ---
  if (data.items) {
    data.items.forEach((item) => {
      // LIN
      segments.push(`LIN+${item.lineNumber}++${item.gtin}:EN`);
      
      // IMD
      if (item.description) segments.push(`IMD+F++:::${item.description}`);
      
      // QTY (47 = Invoiced quantity)
      segments.push(`QTY+47:${item.quantity}:PCE`);
      
      // MOA (203 = Line item amount)
      segments.push(`MOA+203:${item.lineAmount}`);
      
      // PRI (AAA = Net price calculation)
      segments.push(`PRI+AAA:${item.unitPrice}:::1:PCE`);
      
      // TAX (VAT)
      // 7 = Tax
      // VAT = Value added tax
      // Rate category (S=Standard, E=Exempt, Z=Zero)
      const taxCategory = item.taxRate > 0 ? 'S' : (item.taxRate === 0 ? 'Z' : 'E');
      segments.push(`TAX+7+VAT+++:::${item.taxRate}+S`);
    });
  }

  // --- UNS Section Control ---
  segments.push(`UNS+S`);

  // --- TOTALS ---
  // MOA 79 = Total line items amount
  if (data.totals.totalLines !== undefined) segments.push(`MOA+79:${data.totals.totalLines}`);
  
  // MOA 176 = Total Tax Amount
  if (data.totals.totalTax !== undefined) segments.push(`MOA+176:${data.totals.totalTax}`);
  
  // MOA 86 = Total Amount Payable
  if (data.totals.totalPayable !== undefined) segments.push(`MOA+86:${data.totals.totalPayable}`);

  // --- TAX Summary ---
  // Should ideally list breakdown per rate.
  // For simplicity, just listing the main tax info if available in totals
  if (data.taxDetails && data.taxDetails.length > 0) {
      data.taxDetails.forEach(tax => {
          // TAX+7+VAT+++:::20+S
          // MOA+124:TaxAmount
          // MOA+125:TaxableAmount
          segments.push(`TAX+7+VAT+++:::${tax.rate}+S`);
          segments.push(`MOA+124:${tax.amount}`);
          segments.push(`MOA+125:${tax.base}`);
      });
  }

  // --- UNT Trailer ---
  segments.push(`UNT+${segments.length - 1}+${msgRef}`);
  
  // --- UNZ Trailer ---
  segments.push(`UNZ+1+${refInterchange}`);

  return segments.join("'") + "'";
}

module.exports = { generateInvoicEANCOM };
