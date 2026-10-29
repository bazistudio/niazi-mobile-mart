import { UnifiedInvoice, PrinterSettings, ShopHeader } from '../types/printer.types';

/**
 * HTML entity escaping helper for untrusted text in print templates.
 * Escapes &, <, >, ", and ' to prevent HTML injection while preserving valid Unicode (Urdu/Arabic).
 */
export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * RTL / Urdu rendering helpers (Task 5.2)
 * Wraps text containing Arabic/Urdu characters in RTL-aware markup.
 * Uses system Nastaliq/Naskh fonts — no external CDN needed.
 */
const RTL_FONT_STACK = '"Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Naskh Arabic", "Traditional Arabic", serif';

function hasUrdu(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

function rtlSpan(text: string, extraStyle: string = ''): string {
  const safeText = escapeHtml(text);
  if (!hasUrdu(text)) return safeText;
  return `<span dir="rtl" style="display:inline-block;text-align:right;font-family:${RTL_FONT_STACK};unicode-bidi:embed;${extraStyle}">${safeText}</span>`;
}

function rtlDiv(text: string, baseStyle: string = ''): string {
  const safeText = escapeHtml(text);
  if (!hasUrdu(text)) return `<div style="${baseStyle}">${safeText}</div>`;
  return `<div dir="rtl" style="${baseStyle};text-align:right;font-family:${RTL_FONT_STACK};unicode-bidi:embed;">${safeText}</div>`;
}



/**
 * Privacy-preserving IMEI masking helper
 * Example: '352849102938475' -> '3528********8475'
 */
export const maskImei = (imei?: string): string => {
  if (!imei) return '';
  const clean = imei.trim();
  if (clean.length <= 8) return '****' + clean.slice(-4);
  return clean.slice(0, 4) + '*'.repeat(Math.max(4, clean.length - 8)) + clean.slice(-4);
};

/**
 * Pure SVG Barcode Generator for crisp thermal output
 * Generates Code128-style bars without external CDN dependencies
 */
export const generateBarcodeSvg = (data: string, maxWidth: number = 200, height: number = 38): string => {
  if (!data || data.trim().length === 0) return '';
  
  // Encode characters into variable width bars
  const cleanData = data.toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
  const pattern = cleanData || 'NIAZIMOBILEMART';
  
  // Simple checksum and bar pattern generator
  const bars: { x: number; w: number }[] = [];
  let currentX = 10;
  
  // Start guard
  bars.push({ x: currentX, w: 2 }); currentX += 3;
  bars.push({ x: currentX, w: 1 }); currentX += 2;
  bars.push({ x: currentX, w: 2 }); currentX += 4;
  
  for (let i = 0; i < pattern.length; i++) {
    const code = pattern.charCodeAt(i);
    const w1 = ((code % 3) + 1);
    const w2 = (((code >> 1) % 3) + 1);
    const w3 = (((code >> 2) % 2) + 1);
    
    bars.push({ x: currentX, w: w1 }); currentX += w1 + 1;
    bars.push({ x: currentX, w: w2 }); currentX += w2 + 2;
    bars.push({ x: currentX, w: w3 }); currentX += w3 + 1;
  }
  
  // Stop guard
  bars.push({ x: currentX, w: 2 }); currentX += 3;
  bars.push({ x: currentX, w: 1 }); currentX += 2;
  bars.push({ x: currentX, w: 2 }); currentX += 3;
  
  const totalWidth = currentX + 10;
  const scale = Math.min(1, maxWidth / totalWidth);
  const finalWidth = Math.round(totalWidth * scale);

  const rects = bars.map(b => `<rect x="${b.x}" y="0" width="${b.w}" height="${height}" fill="#000000" />`).join('');

  return `
    <div style="display: flex; flex-direction: column; items: center; text-align: center; margin: 6px auto; max-width: ${maxWidth}px;">
      <svg viewBox="0 0 ${totalWidth} ${height}" width="${finalWidth}" height="${height}" style="display: block; margin: 0 auto;">
        ${rects}
      </svg>
      <span style="font-family: monospace; font-size: 9px; font-weight: bold; letter-spacing: 1px; margin-top: 2px; color: #000;">* ${cleanData} *</span>
    </div>
  `;
};

// Print Strategy Layer
export const printFormatter = {
  /**
   * Mobile Sale Invoice (Type 2 Invoice) Formatter
   * Specialized invoice layout for serialized mobile devices with prominent IMEI, specs & cashier accountability
   */
  formatMobileSaleInvoice: (order: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: order.invoiceNumber || order.displayNumber || order.transactionId || 'INV-M-' + Date.now().toString().slice(-6),
      date: new Date(order.createdAt || Date.now()).toLocaleString(),
      customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : { name: 'Walk-In Customer' },
      cashier: order.cashier || order.cashierName || 'Cashier',
      items: (order.items || []).map((i: any) => ({
        name: i.name || i.productName || 'Mobile Handset',
        qty: i.qty || i.quantity || 1,
        price: i.price ?? i.salePrice ?? 0,
        total: i.total ?? i.subtotal ?? 0,
        imei: i.imei || i.imei1 || i.serialNumber,
        specs: i.specs || i.storage || undefined,
      })),
      subtotal: order.subtotal ?? order.totalAmount ?? 0,
      discount: order.discount ?? 0,
      tax: 0,
      total: order.total ?? order.totalAmount ?? order.grandTotal ?? 0,
      paymentMethod: order.paymentMethod || order.paymentBreakdown?.[0]?.method || 'CASH',
      tendered: order.tendered ?? order.paidAmount ?? order.totalPaid ?? 0,
      change: order.change ?? order.changeAmount ?? 0,
      due: order.due ?? order.creditAmount ?? order.remainingDue ?? 0,
      shop,
      returnPolicy: 'Mobile handsets once sold are covered by check warranty as per invoice terms.'
    };
    return renderDocument(invoice, settings, 'Mobile Sale Invoice');
  },
    formatSaleInvoice: (order: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: order.displayNumber || order.orderNumber || order.transactionId || (order._id ? `TP-${order._id.slice(-6).toUpperCase()}` : `TP-${Date.now().toString().slice(-6)}`),
      date: new Date(order.createdAt || Date.now()).toLocaleString(),
      customer: order.customerId
        ? { name: order.customerId.name || 'Walk-in Customer', phone: order.customerId.phone }
        : (order.customer ? { name: order.customer.name || 'Walk-in Customer', phone: order.customer.phone } : undefined),
      cashier: order.cashierName || order.cashier || 'Cashier',
      items: (order.items || []).map((i: any) => {
        const price = i.salePrice ?? i.price ?? i.unitPrice ?? 0;
        const qty = i.quantity ?? i.qty ?? 1;
        return { 
          name: i.productName || i.name || 'Item', 
          qty, 
          price, 
          total: i.subtotal ?? (qty * price),
          imei: i.imei || i.serialNumber
        };
      }),
      subtotal: order.subTotal ?? order.subtotal ?? order.grandTotal ?? order.totalAmount ?? 0,
      discount: order.discount ?? order.discountAmount ?? 0,
      tax: order.taxAmount ?? order.tax ?? 0,
      total: order.grandTotal ?? order.totalAmount ?? order.total ?? 0,
      paymentMethod: order.paymentMethod || 'cash',
      tendered: order.tenderedAmount ?? order.totalPaid,
      change: order.changeReturned ?? order.change ?? order.changeAmount,
      // FINDING-02: outstanding balance owed after this sale
      due: order.remainingDue ?? order.creditAmount ?? order.due,
      shop,
      returnPolicy: shop.returnPolicy || 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
      warrantyInstructions: shop.warrantyInstructions || undefined
    };
    return renderDocument(invoice, settings, 'Sale Receipt');
  },

  formatPurchaseInvoice: (purchase: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: purchase.invoiceNumber || (purchase._id ? purchase._id.slice(-6).toUpperCase() : `PO-${Date.now().toString().slice(-6)}`),
      date: new Date(purchase.issuedAt || purchase.createdAt || Date.now()).toLocaleString(),
      customer: purchase.supplierName ? { name: purchase.supplierName } : (purchase.supplier ? { name: purchase.supplier.name || 'Supplier' } : undefined),
      items: (purchase.items || []).map((i: any) => ({ 
        name: i.name || i.productName || 'Item', 
        qty: i.quantity || 1, 
        price: i.price || 0, 
        total: i.total || ((i.quantity || 1) * (i.price || 0)) 
      })),
      subtotal: purchase.subtotal || purchase.grandTotal || 0,
      discount: purchase.discount || 0,
      tax: purchase.tax || 0,
      total: purchase.grandTotal || purchase.totalAmount || 0,
      paymentMethod: purchase.paymentMethod || 'cash',
      shop
    };
    return renderDocument(invoice, settings, 'Purchase Invoice');
  },

  formatExpenseVoucher: (expense: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: expense._id ? expense._id.slice(-8).toUpperCase() : `EXP-${Date.now().toString().slice(-6)}`,
      date: new Date(expense.date || expense.createdAt || Date.now()).toLocaleString(),
      customer: { name: 'Internal Expense' },
      items: [{ name: `${expense.title || 'Expense'} (${expense.category || 'General'})`, qty: 1, price: expense.amount || 0, total: expense.amount || 0 }],
      subtotal: expense.amount || 0,
      discount: 0,
      tax: 0,
      total: expense.amount || 0,
      paymentMethod: expense.paymentMethod || 'cash',
      shop
    };
    return renderDocument(invoice, settings, 'Expense Voucher');
  },

  formatPaymentReceipt: (ledger: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: ledger.transactionId || (ledger.id ? ledger.id.slice(-8).toUpperCase() : ledger._id?.slice(-8).toUpperCase() || `RCP-${Date.now().toString().slice(-6)}`),
      date: new Date(ledger.createdAt || ledger.timestamp || Date.now()).toLocaleString(),
      customer: { name: ledger.customerId?.name || ledger.customer?.name || ledger.customerName || 'Customer' },
      items: [{ name: `Payment: ${ledger.description || ledger.type || 'Ledger Settlement'}`, qty: 1, price: ledger.amount || 0, total: ledger.amount || 0 }],
      subtotal: ledger.amount || 0,
      discount: 0,
      tax: 0,
      total: ledger.amount || 0,
      paymentMethod: ledger.debitAccount || 'cash',
      shop
    };
    return renderDocument(invoice, settings, 'Payment Receipt');
  },

  formatLedgerStatement: (party: any, timeline: any[], settings: PrinterSettings, shop: ShopHeader, filterTitle: string = 'Full Ledger'): string => {
    // DEF-07: domain-aware statement formatter.
    // party.type === 'SUPPLIER' renders a Supplier Account Statement with supplier labels and
    // correct debit/credit semantics. Everything else (CUSTOMER or absent) renders a Customer
    // Account Statement with customer labels.
    //
    // Customer ledger convention:
    //   Debit = Sale / amount owed to us (increases receivable)
    //   Credit = Payment received from customer (reduces receivable)
    //   Positive running balance → DR (customer owes us)
    //   Negative running balance → CR (customer in advance / credit)
    //
    // Supplier ledger convention:
    //   Debit = Purchase / amount we owe supplier (increases payable)
    //   Credit = Payment made to supplier (reduces payable)
    //   Positive running balance → DR (we owe supplier)
    //   Negative running balance → CR (supplier owes us / advance paid)

    const isSupplier = (party?.type || '').toUpperCase() === 'SUPPLIER';

    const title = isSupplier ? 'Supplier Account Statement' : 'Customer Account Statement';
    const partyLabel = isSupplier ? 'Supplier' : 'Customer';
    // Debit header: for customer = "Debit (Sale / Invoice)"; for supplier = "Debit (Purchase)"
    const debitHeader = isSupplier ? 'Debit (Purchase)' : 'Debit (Sale)';
    const creditHeader = isSupplier ? 'Credit (Payment)' : 'Credit (Payment)';

    const partyName: string = party?.name || (isSupplier ? 'Supplier' : 'Customer');
    const partyPhone: string | undefined = party?.phone;
    const balance: number = party?.balance ?? 0;

    // Balance display: positive → DR (amount owed in the normal direction), negative → CR
    const balanceDisplay = Math.abs(balance).toLocaleString() + (balance < 0 ? ' CR' : ' DR');

    let html = '';
    html += '<div style="font-family: ' + (settings.font?.family || 'sans-serif') + '; font-size: ' + (settings.font?.size || 12) + 'px; padding: 20px; max-width: 800px; margin: 0 auto; color: #000; background: #fff;">';
    html += '<div style="text-align: center; margin-bottom: 20px;">';

    if (settings.invoice?.showLogo && shop.logoUrl) {
      html += '<img src="' + shop.logoUrl + '" style="max-height: 80px;" />';
    }

    if (settings.invoice?.showShopInfo !== false) {
      html += '<h1 style="margin: 5px 0; font-size: 20px; font-weight: bold;">' + shop.name + '</h1>';
      if (shop.address) html += '<p style="margin: 2px 0; white-space: pre-wrap;">' + shop.address + '</p>';
      if (shop.phone) html += '<p style="margin: 2px 0;">' + shop.phone + '</p>';
    }

    html += '<h2 style="margin: 10px 0; border: 1px solid #000; display: inline-block; padding: 5px 15px; border-radius: 4px; font-size: 14px;">' + title + '</h2>';
    html += '</div>';

    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px; font-size: 12px;">';
    html += '<div>';
    html += '<p style="margin: 2px 0;"><strong>' + partyLabel + ':</strong> ' + partyName + '</p>';
    if (partyPhone) html += '<p style="margin: 2px 0;"><strong>Phone:</strong> ' + partyPhone + '</p>';
    html += '</div>';
    html += '<div style="text-align: right;">';
    html += '<p style="margin: 2px 0;"><strong>Filter:</strong> ' + filterTitle + '</p>';
    html += '<p style="margin: 2px 0;"><strong>Current Balance:</strong> Rs ' + balanceDisplay + '</p>';
    html += '</div>';
    html += '</div>';

    html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">';
    html += '<thead>';
    html += '<tr style="border-bottom: 2px solid #000;">';
    html += '<th style="text-align: left; padding: 5px;">Date</th>';
    html += '<th style="text-align: left; padding: 5px;">Reference</th>';
    html += '<th style="text-align: left; padding: 5px;">Details</th>';
    html += '<th style="text-align: right; padding: 5px;">' + debitHeader + '</th>';
    html += '<th style="text-align: right; padding: 5px;">' + creditHeader + '</th>';
    html += '<th style="text-align: right; padding: 5px;">Balance</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    (timeline || []).forEach(entry => {
      // PAYMENT entries go to the credit column for both customer and supplier.
      // All other entry types (SALE for customer; PURCHASE for supplier; ADJUSTMENT) go to debit.
      const isPayment = (entry.type || '').toUpperCase() === 'PAYMENT';
      const bal: number = entry.runningBalance ?? entry.balance_after ?? 0;
      const entryAmt: number = entry.amount ?? 0;

      let displayDesc: string = entry.description || entry.type || '';
      // Sanitize generic placeholders while keeping meaningful descriptions
      if (!displayDesc || displayDesc.toLowerCase() === 'payment') {
        displayDesc = isSupplier ? 'Supplier Payment' : 'Customer Payment';
      } else if (!displayDesc || displayDesc.toLowerCase() === 'sale') {
        displayDesc = 'Sale';
      } else if (!displayDesc || displayDesc.toLowerCase() === 'purchase') {
        displayDesc = 'Purchase';
      }

      const entryBalDisplay = Math.abs(bal).toLocaleString() + (bal < 0 ? ' CR' : ' DR');

      html += '<tr style="border-bottom: 1px solid #eee;">';
      html += '<td style="padding: 5px;">' + new Date(entry.timestamp || entry.createdAt || Date.now()).toLocaleDateString() + '</td>';
      html += '<td style="padding: 5px;">' + (entry.transactionId || entry.invoiceNo || entry.reference || '-') + '</td>';
      html += '<td style="padding: 5px;">' + displayDesc + '</td>';
      html += '<td style="text-align: right; padding: 5px;">' + (!isPayment ? entryAmt.toLocaleString() : '-') + '</td>';
      html += '<td style="text-align: right; padding: 5px;">' + (isPayment ? entryAmt.toLocaleString() : '-') + '</td>';
      html += '<td style="text-align: right; padding: 5px;">Rs ' + entryBalDisplay + '</td>';
      html += '</tr>';
    });

    html += '</tbody>';
    html += '</table>';
    html += '<div style="clear: both; margin-top: 40px; text-align: center; white-space: pre-wrap; font-size: 11px;">';
    html += '<p>' + (shop.footerText || 'Thank you for your business!') + '</p>';
    html += '<p style="font-size: 9px; color: #666; margin-top: 4px;">Powered by Niazi Mobile Mart</p>';
    html += '</div>';
    html += '</div>';

    return html;
  },

  // Fallback for generic/mock preview
  format: (invoice: UnifiedInvoice, settings: PrinterSettings): string => {
    return renderDocument(invoice, settings, 'Receipt');
  }
};

const renderDocument = (invoice: UnifiedInvoice, settings: PrinterSettings, title: string): string => {
  // Legacy '58mm' / THERMAL_58MM values fall through to the 80mm path (Task 5.5)
  const paperWidth = settings.paperSize?.width || (settings.printerType === 'A4' ? 'A4' : '80mm');
  
  // '58mm' / THERMAL_58MM remapped to 80mm path (Task 5.5)
  if (paperWidth === 'A4' || settings.printerType === 'A4' || settings.printerType === 'PDF_ONLY') {
    return formatA4(invoice, settings, title);
  }
  return formatThermal(invoice, settings, 80, title);
};

const formatA4 = (invoice: UnifiedInvoice, settings: PrinterSettings, title: string): string => {
  const fontFamily = settings.font?.family === 'monospace' ? 'Courier, monospace' : 'Arial, Helvetica, sans-serif';
  const fontSize = settings.font?.size || 12;

  return `
    <div style="font-family: ${fontFamily}; font-size: ${fontSize}px; padding: 25px; max-width: 800px; margin: 0 auto; color: #000; background: #fff;">
      <style>
        @media print {
          body { background: #fff !important; color: #000 !important; }
        }
      </style>
      <div style="text-align: center; margin-bottom: 20px;">
        ${settings.invoice?.showLogo && invoice.shop.logoUrl ? `<img src="${invoice.shop.logoUrl}" style="max-height: 70px; margin-bottom: 5px;" />` : ''}
        ${settings.invoice?.showShopInfo !== false ? `
          <h1 style="margin: 4px 0; font-size: 22px; font-weight: bold;">${rtlSpan(invoice.shop.name)}</h1>
          ${invoice.shop.address ? `<p style="margin: 2px 0; white-space: pre-wrap; ${hasUrdu(invoice.shop.address) ? 'direction:rtl;text-align:right;font-family:' + RTL_FONT_STACK : ''}">${invoice.shop.address}</p>` : ''}
          ${invoice.shop.phone ? `<p style="margin: 2px 0;">Phone: ${invoice.shop.phone}</p>` : ''}
          ${invoice.shop.taxNumber ? `<p style="margin: 2px 0;">NTN / Tax #: ${invoice.shop.taxNumber}</p>` : ''}
        ` : ''}
        <h2 style="margin: 10px 0; border: 1px solid #000; display: inline-block; padding: 4px 14px; border-radius: 4px; font-size: 14px; text-transform: uppercase;">${title}</h2>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px; font-size: 12px;">
        <div>
          <p style="margin: 2px 0;"><strong>Invoice #:</strong> ${invoice.invoiceNo}</p>
          <p style="margin: 2px 0;"><strong>Date:</strong> ${invoice.date}</p>
          ${invoice.cashier ? `<p style="margin: 2px 0;"><strong>Cashier:</strong> ${invoice.cashier}</p>` : ''}
        </div>
        ${invoice.customer ? `
        <div style="text-align: right;">
          <p style="margin: 2px 0;"><strong>Customer:</strong> ${invoice.customer.name}</p>
          ${invoice.customer.phone ? `<p style="margin: 2px 0;"><strong>Phone:</strong> ${invoice.customer.phone}</p>` : ''}
        </div>` : ''}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #000; background: #f9f9f9;">
            <th style="text-align: left; padding: 6px;">Item Description</th>
            <th style="text-align: center; padding: 6px; width: 60px;">Qty</th>
            <th style="text-align: right; padding: 6px; width: 100px;">Rate (Rs)</th>
            <th style="text-align: right; padding: 6px; width: 110px;">Amount (Rs)</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 6px;">
                <div>${escapeHtml(item.name)}</div>
                ${item.specs ? `<div style="font-size: 10px; color: #555; margin-top: 1px;">${escapeHtml(item.specs)}</div>` : ''}
                ${item.imei ? `<div style="font-size: 10px; color: #555; font-family: monospace;">IMEI: ${maskImei(item.imei)}</div>` : ''}
              </td>
              <td style="text-align: center; padding: 6px;">${item.qty}</td>
              <td style="text-align: right; padding: 6px;">${item.price.toLocaleString()}</td>
              <td style="text-align: right; padding: 6px; font-weight: bold;">${item.total.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="width: 320px; float: right; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Subtotal:</span>
          <span style="font-weight: 600;">Rs ${invoice.subtotal.toLocaleString()}</span>
        </div>
        ${settings.invoice?.showDiscount !== false && invoice.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #c00;">
          <span>Discount:</span>
          <span>- Rs ${invoice.discount.toLocaleString()}</span>
        </div>` : ''}
        ${settings.invoice?.showTax && invoice.tax > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Tax:</span>
          <span>+ Rs ${invoice.tax.toLocaleString()}</span>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; margin-top: 8px; border-top: 2px solid #000; padding-top: 6px; font-weight: bold; font-size: 14px;">
          <span>Grand Total:</span>
          <span>Rs ${invoice.total.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #444;">
          <span>Payment Method:</span>
          <span style="text-transform: uppercase;">${invoice.paymentMethod || 'Cash'}</span>
        </div>
        ${invoice.due && invoice.due > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-top: 6px; font-weight: bold; color: #c0392b; font-size: 13px; border-top: 1px dashed #000; padding-top: 4px;">
          <span>Balance Due:</span>
          <span>Rs ${invoice.due.toLocaleString()}</span>
        </div>` : ''}
      </div>
      
      <div style="clear: both; margin-top: 50px; text-align: center; font-size: 11px;">
        <p style="white-space: pre-wrap; margin: 0;">${rtlSpan(invoice.shop.footerText || 'Thank you for your business!')}</p>
        <p style="font-size: 9px; color: #888; margin-top: 6px;">Powered by Niazi Mobile Mart</p>
      </div>
    </div>
  `;
};

const formatThermal = (invoice: UnifiedInvoice, settings: PrinterSettings, _width: number, title: string): string => {
  // _width retained for call-site compat; 80mm standard width
  const pxWidth = 272;
  const baseFontSize = 13.5;
  const fontFamily = settings.font?.family === 'monospace' ? 'Courier, "Courier New", monospace' : 'Arial, sans-serif';

  return `
    <div style="font-family: ${fontFamily}; font-size: ${baseFontSize}px; width: ${pxWidth}px; max-width: ${pxWidth}px; margin: 0 auto; line-height: 1.3; color: #000000; background-color: #ffffff; padding: 10px 8px 8px 8px; box-sizing: border-box; font-weight: bold;">
      <style>
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: hidden !important;
          }
        }
      </style>
      
      <!-- Store Header Identity -->
      <div style="text-align: center; margin-bottom: 8px;">
        ${settings.invoice?.showLogo && invoice.shop.logoUrl ? `<img src="${invoice.shop.logoUrl}" style="max-width: 70%; max-height: 55px; margin-bottom: 4px;" />` : ''}
        ${settings.invoice?.showShopInfo !== false ? `
          ${rtlDiv(invoice.shop.name, "font-weight:900;font-size:17px;text-transform:uppercase;letter-spacing:0.5px;text-align:center;")}
          ${invoice.shop.branchName ? `<div style="font-size: 12px; font-weight: bold; margin-top: 2px; color: #222;">[ ${invoice.shop.branchName} ]</div>` : ''}
          ${invoice.shop.address ? rtlDiv(invoice.shop.address, 'font-size:11px;font-weight:bold;white-space:pre-wrap;margin-top:2px;text-align:center;') : ''}
          ${invoice.shop.phone || invoice.shop.secondaryPhone ? `<div style="font-size: 11px; font-weight: bold; margin-top: 2px;">Tel: ${invoice.shop.phone}${invoice.shop.secondaryPhone ? ' / ' + invoice.shop.secondaryPhone : ''}</div>` : ''}
          ${invoice.shop.whatsapp ? `<div style="font-size: 11px; font-weight: bold;">WhatsApp: ${invoice.shop.whatsapp}</div>` : ''}
          ${invoice.shop.taxNumber ? `<div style="font-size: 11px; font-weight: bold;">NTN: ${invoice.shop.taxNumber}</div>` : ''}
        ` : ''}
        <div style="margin-top: 4px; font-weight: bold; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.5px;">*** ${title} ***</div>
      </div>
      
      <!-- Meta Information Section -->
      <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 6px; font-size: 11.5px; font-weight: bold;">
        <div style="display: flex; justify-content: space-between;">
          <span>Invoice #:</span>
          <span style="font-weight: bold;">${invoice.invoiceNo}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date:</span>
          <span>${invoice.date}</span>
        </div>
        ${invoice.cashier ? `
        <div style="display: flex; justify-content: space-between;">
          <span>Cashier:</span>
          <span>${invoice.cashier}</span>
        </div>` : ''}
        ${invoice.customer ? `
        <div style="display: flex; justify-content: space-between;">
          <span>Customer:</span>
          <span style="font-weight: bold;">${invoice.customer.name}</span>
        </div>
        ${invoice.customer.phone ? `
        <div style="display: flex; justify-content: space-between;">
          <span>Cust Phone:</span>
          <span>${invoice.customer.phone}</span>
        </div>` : ''}
        ` : ''}
      </div>

      <!-- Items Table: Item (1st), Qty (2nd), Price (3rd), Amount (4th) -->
      <table style="width: 100%; text-align: left; margin-bottom: 6px; font-size: 12px; font-weight: bold; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="padding: 3px 2px; width: 46%; text-align: left;">Item</th>
            <th style="padding: 3px 0; width: 12%; text-align: center;">Qty</th>
            <th style="padding: 3px 0; width: 20%; text-align: right;">Price</th>
            <th style="padding: 3px 0; width: 22%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => `
            <tr style="vertical-align: top; border-bottom: 1px dotted #ccc;">
              <td style="padding: 4px 2px; word-break: break-word;">
                <div style="font-weight: bold;">${escapeHtml(item.name)}</div>
                ${item.specs ? `<div style="font-size: 9px; color: #000; font-weight: bold; margin-top: 1px;">${escapeHtml(item.specs)}</div>` : ''}
                ${item.imei ? `<div style="font-size: 9.5px; color: #000; font-weight: bold;">IMEI: ${maskImei(item.imei)}</div>` : ''}
              </td>
              <td style="padding: 4px 0; text-align: center; font-weight: bold;">${item.qty}</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold; tabular-nums;">${item.price.toLocaleString()}</td>
              <td style="padding: 4px 0; text-align: right; font-weight: bold; tabular-nums;">${item.total.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <!-- Financial Summary Totals -->
      <div style="border-top: 1px dashed #000; padding-top: 5px; font-size: 12.5px; font-weight: bold;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Subtotal:</span>
          <span style="font-weight: bold;">Rs ${invoice.subtotal.toLocaleString()}</span>
        </div>
        
        ${settings.invoice?.showDiscount !== false && invoice.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Discount:</span>
          <span style="font-weight: bold;">- Rs ${invoice.discount.toLocaleString()}</span>
        </div>` : ''}
        
        ${settings.invoice?.showTax && invoice.tax > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Tax:</span>
          <span>+ Rs ${invoice.tax.toLocaleString()}</span>
        </div>` : ''}
        
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 15px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin: 5px 0; padding: 5px 0;">
          <span>Grand Total:</span>
          <span>Rs ${invoice.total.toLocaleString()}</span>
        </div>
        
        <!-- Tender & Change Breakdown -->
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-top: 4px;">
          <span>Payment Method:</span>
          <span style="font-weight: bold; text-transform: uppercase;">${invoice.paymentMethod || 'Cash'}</span>
        </div>
        
        ${invoice.tendered && invoice.tendered > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 11.5px;">
          <span>Tendered:</span>
          <span style="font-weight: bold;">Rs ${invoice.tendered.toLocaleString()}</span>
        </div>` : ''}
        
        ${invoice.change && invoice.change > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold;">
          <span>Change Due:</span>
          <span>Rs ${invoice.change.toLocaleString()}</span>
        </div>` : ''}

        <!-- FINDING-02: Outstanding balance due (credit/partial sales only) -->
        ${invoice.due && invoice.due > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; color: #c0392b; border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;">
          <span>Balance Due:</span>
          <span>Rs ${invoice.due.toLocaleString()}</span>
        </div>` : ''}
      </div>
      
      <!-- Return Policy & Warranty Instructions -->
      ${invoice.returnPolicy || invoice.shop.returnPolicy ? `
      <div style="border-top: 1px dashed #000; margin-top: 8px; padding-top: 5px; text-align: center; font-size: 10.5px; font-weight: bold;">
        <div style="font-weight: bold; margin-bottom: 1px;">Return Policy:</div>
        ${rtlDiv(invoice.returnPolicy || invoice.shop.returnPolicy || '', 'text-align:center;')}
      </div>` : ''}

      ${invoice.warrantyInstructions || invoice.shop.warrantyInstructions ? `
      <div style="border-top: 1px dotted #000; margin-top: 5px; padding-top: 4px; text-align: center; font-size: 10px; font-weight: bold; color: #000;">
        <div style="font-weight: bold; margin-bottom: 1px;">Warranty Terms:</div>
        ${rtlDiv(invoice.warrantyInstructions || invoice.shop.warrantyInstructions || '', 'text-align:center;')}
      </div>` : ''}
      
      <!-- Barcode Section -->
      ${settings.invoice?.showBarcode !== false ? `
      <div style="margin-top: 8px;">
        ${generateBarcodeSvg(invoice.invoiceNo, pxWidth - 16, 38)}
      </div>` : ''}
      
      <!-- Footer & Branding -->
      <div style="text-align: center; margin-top: 10px; font-size: 10.5px; border-top: 1px dashed #000; padding-top: 5px;">
        <div style="font-weight: bold;">${invoice.shop.footerText || 'Thank you for shopping with us!'}</div>
        <div style="font-size: 9px; font-weight: bold; color: #000; margin-top: 4px; letter-spacing: 0.5px;">Powered by Niazi Mobile Mart</div>
      </div>
    </div>
  `;
};

// ─────────────────────────────────────────────────────────────────────────────
// Task 5.3 — Exchange / Sales-Return Receipt
// Renders a clearly labelled exchange settlement receipt for 80mm and A4.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExchangeReceiptData {
  invoiceNo: string;
  date: string;
  cashier?: string;
  customer?: { name: string; phone?: string };
  shop: ShopHeader;
  returnedItems: { name: string; qty: number; unitPrice: number; total: number; imei?: string }[];
  returnedCredit: number;
  replacementItems: { name: string; qty: number; unitPrice: number; total: number; imei?: string }[];
  replacementValue: number;
  settlementType: 'POSITIVE_COLLECTION' | 'NEGATIVE_REFUND' | 'BALANCED_ZERO';
  cashCollected?: number;
  cashRefunded?: number;
  refundMethod?: string;
  customerBalanceAfter?: number;
}

export const formatExchangeReceipt = (
  data: ExchangeReceiptData,
  settings: PrinterSettings
): string => {
  const isA4 = (
    settings.paperSize?.width === 'A4' ||
    settings.printerType === 'A4' ||
    settings.printerType === 'PDF_ONLY'
  );
  return isA4
    ? _formatExchangeA4(data, settings)
    : _formatExchangeThermal(data, settings);
};

const _exchangeItemRows = (items: ExchangeReceiptData['returnedItems'], thermal: boolean): string =>
  items.map(i => thermal
    ? `<tr style="vertical-align:top;border-bottom:1px dotted #ccc;">
        <td style="padding:3px 2px;word-break:break-word;"><div style="font-weight:600;">${i.name}</div>${i.imei ? `<div style="font-size:9px;color:#333;">IMEI: ${maskImei(i.imei)}</div>` : ''}</td>
        <td style="padding:3px 0;text-align:center;">${i.qty}</td>
        <td style="padding:3px 0;text-align:right;">${i.unitPrice.toLocaleString()}</td>
        <td style="padding:3px 0;text-align:right;font-weight:bold;">${i.total.toLocaleString()}</td>
      </tr>`
    : `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:6px;"><div>${i.name}</div>${i.imei ? `<div style="font-size:10px;color:#555;font-family:monospace;">IMEI: ${maskImei(i.imei)}</div>` : ''}</td>
        <td style="text-align:center;padding:6px;">${i.qty}</td>
        <td style="text-align:right;padding:6px;">${i.unitPrice.toLocaleString()}</td>
        <td style="text-align:right;padding:6px;font-weight:bold;">${i.total.toLocaleString()}</td>
      </tr>`
  ).join('');

const _exchangeSettlementLine = (data: ExchangeReceiptData, thermal: boolean): string => {
  const diff = data.replacementValue - data.returnedCredit;
  const diffLabel = diff > 0 ? '(Customer owes)' : diff < 0 ? '(We owe customer)' : '(Balanced)';

  let cashLine = '';
  if (data.settlementType === 'POSITIVE_COLLECTION' && (data.cashCollected ?? 0) > 0) {
    cashLine = thermal
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#155724;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0;padding:4px 0;"><span>Cash Collected:</span><span>Rs ${(data.cashCollected ?? 0).toLocaleString()}</span></div>`
      : `<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;color:#155724;border:1px solid #155724;padding:8px;border-radius:4px;margin-top:8px;"><span>Cash Collected from Customer:</span><span>Rs ${(data.cashCollected ?? 0).toLocaleString()}</span></div>`;
  } else if (data.settlementType === 'NEGATIVE_REFUND' && (data.cashRefunded ?? 0) > 0) {
    // F-02 fix: EXCHANGE refund method must not be labelled as a cash refund.
    // When the settlement is applied to an exchange (no cash changes hands),
    // use 'Applied to Exchange'. CASH falls through to the existing cash label.
    const lbl = data.refundMethod === 'CREDIT'
      ? (thermal ? 'Added to Credit' : 'Added to Customer Credit')
      : data.refundMethod === 'EXCHANGE'
      ? (thermal ? 'Applied to Exchange' : 'Applied to Exchange')
      : (thermal ? 'Cash Refunded' : 'Cash Refunded to Customer');
    cashLine = thermal
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#c0392b;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0;padding:4px 0;"><span>${lbl}:</span><span>Rs ${(data.cashRefunded ?? 0).toLocaleString()}</span></div>`
      : `<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;color:#c0392b;border:1px solid #c0392b;padding:8px;border-radius:4px;margin-top:8px;"><span>${lbl}:</span><span>Rs ${(data.cashRefunded ?? 0).toLocaleString()}</span></div>`;
  } else {
    cashLine = thermal
      ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#155724;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0;padding:4px 0;"><span>Balanced — No Cash Exchange</span><span>Rs 0</span></div>`
      : `<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;color:#155724;border:1px solid #155724;padding:8px;border-radius:4px;margin-top:8px;"><span>Balanced Exchange — No Cash Transfer</span><span>Rs 0</span></div>`;
  }

  const balLine = data.customerBalanceAfter !== undefined
    ? (thermal
        ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#444;margin-top:3px;"><span>Customer Balance:</span><span style="font-weight:bold;">${data.customerBalanceAfter < 0 ? 'Cr ' : 'Dr '}Rs ${Math.abs(data.customerBalanceAfter).toLocaleString()}</span></div>`
        : `<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;border-top:1px dashed #000;padding-top:6px;"><span><strong>Customer Balance After:</strong></span><span style="font-weight:bold;">${data.customerBalanceAfter < 0 ? 'Cr ' : 'Dr '}Rs ${Math.abs(data.customerBalanceAfter).toLocaleString()}</span></div>`)
    : '';

  return cashLine + balLine;
};

const _formatExchangeThermal = (data: ExchangeReceiptData, settings: PrinterSettings): string => {
  const isPureReturn = !data.replacementItems || data.replacementItems.length === 0;
  const docTitle = isPureReturn ? 'SALES RETURN / CREDIT NOTE' : 'EXCHANGE RECEIPT';
  const fontFamily = settings.font?.family === 'monospace' ? 'Courier, "Courier New", monospace' : 'Arial, sans-serif';
  const tblHead = `<table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:4px;"><thead><tr style="border-bottom:1px dashed #000;"><th style="text-align:left;padding:3px 2px;width:46%;">Item</th><th style="text-align:center;padding:3px 0;width:10%;">Qty</th><th style="text-align:right;padding:3px 0;width:22%;">Price</th><th style="text-align:right;padding:3px 0;width:22%;">Amount</th></tr></thead><tbody>`;

  return `<div style="font-family:${fontFamily};font-size:13.5px;width:272px;max-width:272px;margin:0 auto;line-height:1.3;color:#000;background:#fff;padding:10px 8px 8px 8px;box-sizing:border-box;">
    <style>@media print{body,html{background:#fff !important;color:#000 !important;margin:0 !important;padding:0 !important;}}</style>
    <div style="text-align:center;margin-bottom:8px;">
      ${settings.invoice?.showLogo && data.shop.logoUrl ? `<img src="${escapeHtml(data.shop.logoUrl)}" style="max-width:70%;max-height:55px;margin-bottom:4px;" />` : ''}
      ${settings.invoice?.showShopInfo !== false ? `${rtlDiv(data.shop.name, 'font-weight:900;font-size:17px;text-transform:uppercase;letter-spacing:0.5px;text-align:center;')}${data.shop.branchName ? `<div style="font-size:12px;font-weight:bold;margin-top:2px;color:#222;">[ ${escapeHtml(data.shop.branchName)} ]</div>` : ''}${data.shop.address ? rtlDiv(data.shop.address, 'font-size:11px;white-space:pre-wrap;margin-top:2px;text-align:center;') : ''}${data.shop.phone ? `<div style="font-size:11px;margin-top:2px;">Tel: ${escapeHtml(data.shop.phone)}</div>` : ''}${data.shop.taxNumber ? `<div style="font-size:11px;">NTN: ${escapeHtml(data.shop.taxNumber)}</div>` : ''}` : ''}
      <div style="margin-top:4px;font-weight:bold;font-size:12.5px;text-transform:uppercase;letter-spacing:0.5px;">*** ${docTitle} ***</div>
    </div>
    <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:5px 0;margin-bottom:6px;font-size:11.5px;">
      <div style="display:flex;justify-content:space-between;"><span>Ref #:</span><span style="font-weight:bold;">${escapeHtml(data.invoiceNo)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Date:</span><span>${escapeHtml(data.date)}</span></div>
      ${data.cashier ? `<div style="display:flex;justify-content:space-between;"><span>Cashier:</span><span>${escapeHtml(data.cashier)}</span></div>` : ''}
      ${data.customer ? `<div style="display:flex;justify-content:space-between;"><span>Customer:</span><span style="font-weight:600;">${escapeHtml(data.customer.name)}</span></div>${data.customer.phone ? `<div style="display:flex;justify-content:space-between;"><span>Phone:</span><span>${escapeHtml(data.customer.phone)}</span></div>` : ''}` : ''}
    </div>
    <div style="font-size:11px;font-weight:bold;margin-bottom:2px;border-bottom:1px solid #000;">${isPureReturn ? 'RETURNED ITEMS' : 'A. RETURNED MERCHANDISE (Credit)'}</div>
    ${tblHead}${_exchangeItemRows(data.returnedItems, true)}</tbody></table>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;margin-bottom:6px;"><span>${isPureReturn ? 'Total Return Value:' : 'Return Credit:'}</span><span>Rs ${data.returnedCredit.toLocaleString()}</span></div>
    ${!isPureReturn ? `
    <div style="font-size:11px;font-weight:bold;margin-bottom:2px;border-bottom:1px solid #000;">B. REPLACEMENT MERCHANDISE (Debit)</div>
    ${tblHead}${_exchangeItemRows(data.replacementItems, true)}</tbody></table>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;margin-bottom:6px;"><span>Replacement Value:</span><span>Rs ${data.replacementValue.toLocaleString()}</span></div>
    <div style="font-size:11px;font-weight:bold;margin-bottom:2px;border-bottom:1px solid #000;">C. SETTLEMENT</div>
    <div style="font-size:11.5px;margin-bottom:2px;">
      <div style="display:flex;justify-content:space-between;"><span>Return Credit:</span><span>Rs ${data.returnedCredit.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Replacement Value:</span><span>Rs ${data.replacementValue.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:2px;"><span>Net Difference:</span><span style="font-weight:bold;">Rs ${Math.abs(data.replacementValue - data.returnedCredit).toLocaleString()} ${data.replacementValue > data.returnedCredit ? '(Cust. owes)' : data.replacementValue < data.returnedCredit ? '(We owe)' : ''}</span></div>
    </div>` : `
    <div style="font-size:11px;font-weight:bold;margin-bottom:2px;border-bottom:1px solid #000;">SETTLEMENT SUMMARY</div>`}
    ${_exchangeSettlementLine(data, true)}
    <div style="text-align:center;margin-top:10px;font-size:10.5px;border-top:1px dashed #000;padding-top:5px;">
      <div style="font-weight:bold;">${rtlSpan(data.shop.footerText || 'Thank you for shopping with us!')}</div>
      <div style="font-size:9px;color:#555;margin-top:4px;">Powered by Niazi Mobile Mart</div>
    </div>
  </div>`;
};

const _formatExchangeA4 = (data: ExchangeReceiptData, settings: PrinterSettings): string => {
  const isPureReturn = !data.replacementItems || data.replacementItems.length === 0;
  const docTitle = isPureReturn ? 'Sales Return / Credit Note' : 'Exchange Receipt';
  const fontFamily = settings.font?.family === 'monospace' ? 'Courier, monospace' : 'Arial, Helvetica, sans-serif';
  const fs = settings.font?.size || 12;
  const tblWrap = (rows: string) => `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:${fs}px;"><thead><tr style="border-bottom:2px solid #000;background:#f9f9f9;"><th style="text-align:left;padding:6px;">Item</th><th style="text-align:center;padding:6px;width:60px;">Qty</th><th style="text-align:right;padding:6px;width:100px;">Rate (Rs)</th><th style="text-align:right;padding:6px;width:110px;">Amount (Rs)</th></tr></thead><tbody>${rows}</tbody></table>`;

  return `<div style="font-family:${fontFamily};font-size:${fs}px;padding:25px;max-width:800px;margin:0 auto;color:#000;background:#fff;">
    <style>@media print{body{background:#fff !important;color:#000 !important;}}</style>
    <div style="text-align:center;margin-bottom:20px;">
      ${settings.invoice?.showLogo && data.shop.logoUrl ? `<img src="${escapeHtml(data.shop.logoUrl)}" style="max-height:70px;margin-bottom:5px;" />` : ''}
      ${settings.invoice?.showShopInfo !== false ? `<h1 style="margin:4px 0;font-size:22px;font-weight:bold;">${rtlSpan(data.shop.name)}</h1>${data.shop.address ? `<p style="margin:2px 0;white-space:pre-wrap;${hasUrdu(data.shop.address) ? 'direction:rtl;text-align:right;font-family:' + RTL_FONT_STACK : ''}">${escapeHtml(data.shop.address)}</p>` : ''}${data.shop.phone ? `<p style="margin:2px 0;">Phone: ${escapeHtml(data.shop.phone)}</p>` : ''}${data.shop.taxNumber ? `<p style="margin:2px 0;">NTN / Tax #: ${escapeHtml(data.shop.taxNumber)}</p>` : ''}` : ''}
      <h2 style="margin:10px 0;border:1px solid #000;display:inline-block;padding:4px 14px;border-radius:4px;font-size:14px;text-transform:uppercase;">${docTitle}</h2>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid #000;padding-bottom:10px;font-size:12px;">
      <div><p style="margin:2px 0;"><strong>Ref #:</strong> ${escapeHtml(data.invoiceNo)}</p><p style="margin:2px 0;"><strong>Date:</strong> ${escapeHtml(data.date)}</p>${data.cashier ? `<p style="margin:2px 0;"><strong>Cashier:</strong> ${escapeHtml(data.cashier)}</p>` : ''}</div>
      ${data.customer ? `<div style="text-align:right;"><p style="margin:2px 0;"><strong>Customer:</strong> ${escapeHtml(data.customer.name)}</p>${data.customer.phone ? `<p style="margin:2px 0;"><strong>Phone:</strong> ${escapeHtml(data.customer.phone)}</p>` : ''}</div>` : ''}
    </div>
    <h3 style="font-size:13px;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">${isPureReturn ? 'Returned Items' : 'A. Returned Merchandise (Credit)'}</h3>
    ${tblWrap(_exchangeItemRows(data.returnedItems, false))}
    <div style="text-align:right;font-weight:bold;font-size:13px;margin-bottom:16px;">${isPureReturn ? 'Total Return Value:' : 'Return Credit:'} Rs ${data.returnedCredit.toLocaleString()}</div>
    ${!isPureReturn ? `
    <h3 style="font-size:13px;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">B. Replacement Merchandise (Debit)</h3>
    ${tblWrap(_exchangeItemRows(data.replacementItems, false))}
    <div style="text-align:right;font-weight:bold;font-size:13px;margin-bottom:16px;">Replacement Value: Rs ${data.replacementValue.toLocaleString()}</div>
    <h3 style="font-size:13px;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">C. Settlement Summary</h3>
    <div style="width:320px;float:right;font-size:12px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Return Credit:</span><span>Rs ${data.returnedCredit.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Replacement Value:</span><span>Rs ${data.replacementValue.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;border-top:1px solid #000;padding-top:4px;"><span><strong>Net Difference:</strong></span><span><strong>Rs ${Math.abs(data.replacementValue - data.returnedCredit).toLocaleString()} ${data.replacementValue > data.returnedCredit ? '(Customer owes)' : data.replacementValue < data.returnedCredit ? '(We owe customer)' : '(Balanced)'}</strong></span></div>
    </div>` : `
    <h3 style="font-size:13px;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">Settlement Summary</h3>`}
    <div style="clear:both;">${_exchangeSettlementLine(data, false)}</div>
    <div style="clear:both;margin-top:50px;text-align:center;font-size:11px;">
      <p style="white-space:pre-wrap;margin:0;">${rtlSpan(data.shop.footerText || 'Thank you for your business!')}</p>
      <p style="font-size:9px;color:#888;margin-top:6px;">Powered by Niazi Mobile Mart</p>
    </div>
  </div>`;
};

