import { UnifiedInvoice, PrinterSettings, ShopHeader } from '../types/printer.types';

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
  const pattern = cleanData || 'TIJARATPRO';
  
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
  formatSaleInvoice: (order: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: order.displayNumber || order.orderNumber || order.transactionId || (order._id ? `TP-${order._id.slice(-6).toUpperCase()}` : `TP-${Date.now().toString().slice(-6)}`),
      date: new Date(order.createdAt || Date.now()).toLocaleString(),
      customer: order.partyId 
        ? { name: order.partyId.companyName || order.partyId.contactPerson || 'Walk-in Customer', phone: order.partyId.phone } 
        : (order.customerId ? { name: order.customerId.name || 'Walk-in Customer', phone: order.customerId.phone } : undefined),
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
      change: order.changeReturned ?? order.change,
      shop,
      returnPolicy: shop.footerText ? undefined : 'Goods once sold can only be returned/exchanged within 3 days with original receipt.'
    };
    return renderDocument(invoice, settings, 'Sale Receipt');
  },

  formatPurchaseInvoice: (purchase: any, settings: PrinterSettings, shop: ShopHeader): string => {
    const invoice: UnifiedInvoice = {
      invoiceNo: purchase.invoiceNumber || (purchase._id ? purchase._id.slice(-6).toUpperCase() : `PO-${Date.now().toString().slice(-6)}`),
      date: new Date(purchase.issuedAt || purchase.createdAt || Date.now()).toLocaleString(),
      customer: purchase.supplierId ? { name: purchase.supplierId.name || 'Supplier' } : undefined,
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
      customer: { name: ledger.customerId?.name || ledger.supplierId?.name || 'Party' },
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
    const title = (party.type === 'CUSTOMER' ? 'Customer' : 'Supplier') + ' Ledger Statement';
    
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
    html += '<p style="margin: 2px 0;"><strong>Party:</strong> ' + party.name + '</p>';
    html += '<p style="margin: 2px 0;"><strong>Type:</strong> ' + party.type + '</p>';
    html += '</div>';
    html += '<div style="text-align: right;">';
    html += '<p style="margin: 2px 0;"><strong>Filter:</strong> ' + filterTitle + '</p>';
    html += '<p style="margin: 2px 0;"><strong>Current Balance:</strong> Rs ' + Math.abs(party.balance || 0).toLocaleString() + ((party.balance || 0) < 0 ? ' CR' : ' DR') + '</p>';
    html += '</div>';
    html += '</div>';

    html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">';
    html += '<thead>';
    html += '<tr style="border-bottom: 2px solid #000;">';
    html += '<th style="text-align: left; padding: 5px;">Date</th>';
    html += '<th style="text-align: left; padding: 5px;">Reference</th>';
    html += '<th style="text-align: left; padding: 5px;">Details</th>';
    html += '<th style="text-align: right; padding: 5px;">Debit</th>';
    html += '<th style="text-align: right; padding: 5px;">Credit</th>';
    html += '<th style="text-align: right; padding: 5px;">Balance</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    (timeline || []).forEach(entry => {
      const isPayment = entry.type === 'payment';
      const isCustomer = party.type === 'CUSTOMER';
      const showDebit = isCustomer ? !isPayment : isPayment;
      const showCredit = isCustomer ? isPayment : !isPayment;
      const bal = entry.runningBalance || 0;

      let displayDesc = entry.description || '';
      if (displayDesc.toLowerCase().includes('credit')) displayDesc = 'Credit';
      else if (displayDesc.toLowerCase().includes('cash')) displayDesc = 'Cash';

      html += '<tr style="border-bottom: 1px solid #eee;">';
      html += '<td style="padding: 5px;">' + new Date(entry.timestamp).toLocaleDateString() + '</td>';
      html += '<td style="padding: 5px;">' + (entry.transactionId || '-') + '</td>';
      html += '<td style="padding: 5px;">' + displayDesc + '</td>';
      html += '<td style="text-align: right; padding: 5px;">' + (showDebit ? (entry.amount || 0).toLocaleString() : '-') + '</td>';
      html += '<td style="text-align: right; padding: 5px;">' + (showCredit ? (entry.amount || 0).toLocaleString() : '-') + '</td>';
      html += '<td style="text-align: right; padding: 5px;">Rs ' + Math.abs(bal).toLocaleString() + (bal < 0 ? ' CR' : ' DR') + '</td>';
      html += '</tr>';
    });

    html += '</tbody>';
    html += '</table>';
    html += '<div style="clear: both; margin-top: 40px; text-align: center; white-space: pre-wrap; font-size: 11px;">';
    html += '<p>' + (shop.footerText || 'Thank you for your business!') + '</p>';
    html += '<p style="font-size: 9px; color: #666; margin-top: 4px;">Powered by TijaratPro ERP</p>';
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
  const paperWidth = settings.paperSize?.width || (settings.printerType === 'THERMAL_58MM' ? '58mm' : settings.printerType === 'A4' ? 'A4' : '80mm');
  
  if (paperWidth === '58mm' || settings.printerType === 'THERMAL_58MM') {
    return formatThermal(invoice, settings, 58, title);
  }
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
          <h1 style="margin: 4px 0; font-size: 22px; font-weight: bold;">${invoice.shop.name}</h1>
          ${invoice.shop.address ? `<p style="margin: 2px 0; white-space: pre-wrap;">${invoice.shop.address}</p>` : ''}
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
                <div>${item.name}</div>
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
      </div>
      
      <div style="clear: both; margin-top: 50px; text-align: center; font-size: 11px;">
        <p style="white-space: pre-wrap; margin: 0;">${invoice.shop.footerText || 'Thank you for your business!'}</p>
        <p style="font-size: 9px; color: #888; margin-top: 6px;">Powered by TijaratPro ERP</p>
      </div>
    </div>
  `;
};

const formatThermal = (invoice: UnifiedInvoice, settings: PrinterSettings, width: number, title: string): string => {
  const is58 = width === 58;
  const pxWidth = is58 ? 218 : 298;
  const baseFontSize = is58 ? 10 : 12;
  const fontFamily = settings.font?.family === 'monospace' ? 'Courier, "Courier New", monospace' : 'Arial, sans-serif';
  const divider = is58 ? '--------------------------------' : '------------------------------------------';

  return `
    <div style="font-family: ${fontFamily}; font-size: ${baseFontSize}px; width: ${pxWidth}px; margin: 0 auto; line-height: 1.25; color: #000000; background-color: #ffffff; padding: 4px 2px;">
      <style>
        @media print {
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      </style>
      
      <!-- Store Header Identity -->
      <div style="text-align: center; margin-bottom: 6px;">
        ${!is58 && settings.invoice?.showLogo && invoice.shop.logoUrl ? `<img src="${invoice.shop.logoUrl}" style="max-width: 70%; max-height: 50px; margin-bottom: 4px;" />` : ''}
        ${settings.invoice?.showShopInfo !== false ? `
          <div style="font-weight: 900; font-size: ${is58 ? '13px' : '15px'}; text-transform: uppercase; letter-spacing: 0.5px;">${invoice.shop.name}</div>
          ${invoice.shop.address ? `<div style="font-size: ${is58 ? '9px' : '10px'}; white-space: pre-wrap; margin-top: 1px;">${invoice.shop.address}</div>` : ''}
          ${invoice.shop.phone ? `<div style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 1px;">Tel: ${invoice.shop.phone}</div>` : ''}
          ${invoice.shop.taxNumber ? `<div style="font-size: ${is58 ? '9px' : '10px'};">NTN: ${invoice.shop.taxNumber}</div>` : ''}
        ` : ''}
        <div style="margin-top: 3px; font-weight: bold; font-size: ${is58 ? '10px' : '11px'}; text-transform: uppercase;">*** ${title} ***</div>
      </div>
      
      <!-- Meta Information Section -->
      <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 4px; font-size: ${is58 ? '9px' : '10px'};">
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
          <span>${invoice.customer.name}</span>
        </div>` : ''}
      </div>

      <!-- Items Table -->
      <table style="width: 100%; text-align: left; margin-bottom: 4px; font-size: ${is58 ? '9.5px' : '11px'}; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="padding: 2px 0; width: ${is58 ? '14%' : '12%'}; text-align: left;">Qty</th>
            <th style="padding: 2px 2px; width: ${is58 ? '56%' : '50%'}; text-align: left;">Item</th>
            ${!is58 ? `<th style="padding: 2px 0; width: 18%; text-align: right;">Price</th>` : ''}
            <th style="padding: 2px 0; width: ${is58 ? '30%' : '20%'}; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => `
            <tr style="vertical-align: top; border-bottom: 1px dotted #ccc;">
              <td style="padding: 3px 0; font-weight: bold;">${item.qty}</td>
              <td style="padding: 3px 2px; word-break: break-word;">
                <div>${item.name}</div>
                ${item.imei ? `<div style="font-size: 8.5px; color: #333;">IMEI: ${maskImei(item.imei)}</div>` : ''}
              </td>
              ${!is58 ? `<td style="padding: 3px 0; text-align: right; tabular-nums;">${item.price.toLocaleString()}</td>` : ''}
              <td style="padding: 3px 0; text-align: right; font-weight: bold; tabular-nums;">${item.total.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <!-- Financial Summary Totals -->
      <div style="border-top: 1px dashed #000; padding-top: 4px; font-size: ${is58 ? '10px' : '11px'};">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Subtotal:</span>
          <span style="font-weight: bold;">Rs ${invoice.subtotal.toLocaleString()}</span>
        </div>
        
        ${settings.invoice?.showDiscount !== false && invoice.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Discount:</span>
          <span style="font-weight: bold;">- Rs ${invoice.discount.toLocaleString()}</span>
        </div>` : ''}
        
        ${settings.invoice?.showTax && invoice.tax > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Tax:</span>
          <span>+ Rs ${invoice.tax.toLocaleString()}</span>
        </div>` : ''}
        
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: ${is58 ? '12px' : '13px'}; border-top: 1px solid #000; border-bottom: 1px solid #000; margin: 4px 0; padding: 4px 0;">
          <span>Grand Total:</span>
          <span>Rs ${invoice.total.toLocaleString()}</span>
        </div>
        
        <!-- Tender & Change Breakdown -->
        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '9px' : '10px'}; margin-top: 3px;">
          <span>Payment Method:</span>
          <span style="font-weight: bold; text-transform: uppercase;">${invoice.paymentMethod || 'Cash'}</span>
        </div>
        
        ${invoice.tendered && invoice.tendered > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '9px' : '10px'};">
          <span>Tendered:</span>
          <span>Rs ${invoice.tendered.toLocaleString()}</span>
        </div>` : ''}
        
        ${invoice.change && invoice.change > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '9.5px' : '10.5px'}; font-weight: bold;">
          <span>Change Due:</span>
          <span>Rs ${invoice.change.toLocaleString()}</span>
        </div>` : ''}
      </div>
      
      <!-- Return Policy -->
      <div style="border-top: 1px dashed #000; margin-top: 6px; padding-top: 4px; text-align: center; font-size: ${is58 ? '8px' : '9px'};">
        <div style="font-weight: bold; margin-bottom: 1px;">Return Policy:</div>
        <div>${invoice.returnPolicy || 'Exchange/Return within 3 days with original receipt.'}</div>
      </div>
      
      <!-- Barcode Section -->
      ${settings.invoice?.showBarcode !== false ? `
      <div style="margin-top: 6px;">
        ${generateBarcodeSvg(invoice.invoiceNo, pxWidth - 10, is58 ? 32 : 38)}
      </div>` : ''}
      
      <!-- Footer & Branding -->
      <div style="text-align: center; margin-top: 8px; font-size: ${is58 ? '8.5px' : '9.5px'}; border-top: 1px dashed #000; padding-top: 4px;">
        <div style="font-weight: bold;">${invoice.shop.footerText || 'Thank you for shopping with us!'}</div>
        <div style="font-size: 8px; color: #555; margin-top: 3px; letter-spacing: 0.5px;">Powered by TijaratPro</div>
      </div>
    </div>
  `;
};
