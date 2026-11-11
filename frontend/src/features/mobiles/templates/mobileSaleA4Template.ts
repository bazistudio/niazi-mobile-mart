/**
 * Mobile Sale Dual-Copy A4 Landscape Print Template
 *
 * Renders an official A4 LANDSCAPE page with TWO identical invoice copies:
 *   - Left Half (Copy 1): Shop / Office Record Copy
 *   - Middle: Vertical Dotted Perforation Cut Line ("✂ Cut Here / یہاں سے کاٹیں ✂")
 *   - Right Half (Copy 2): Customer Copy (handed to buyer)
 *
 * Requirements:
 *   - A4 Landscape mode (@page { size: A4 landscape; margin: 6mm 8mm; })
 *   - Both invoices have bottom 30% dedicated space for comprehensive instructions & terms in Urdu.
 *   - Invoice header, specs, items, financial totals in clear English only.
 *   - Mirrored formatting across both copies.
 */

export interface MobileSalePrintItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  imei1?: string;
  imei2?: string;
  specs?: string;
  condition?: string;
  ptaStatus?: string;
}

export interface MobileSalePrintOrder {
  invoiceNumber: string;
  createdAt: string;
  customer?: {
    name: string;
    phone?: string;
    address?: string;
  } | null;
  cashier: string;
  items: MobileSalePrintItem[];
  subtotal: number;
  discount: number;
  total: number;
  tendered: number;
  change: number;
  due: number;
  paymentBreakdown?: Array<{ method: string; amount: number; referenceNumber?: string | null }>;
  notes?: string | null;
}

export interface MobileSalePrintShop {
  name?: string;
  branchName?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(num: number | null | undefined): string {
  if (num == null || isNaN(num)) return '0';
  return num.toLocaleString('en-PK');
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function renderSingleInvoiceColumn(
  order: MobileSalePrintOrder,
  shop: MobileSalePrintShop,
  copyLabel: string
): string {
  const shopName = esc(shop.name || 'Niazi Mobile Mart');
  const branchName = esc(shop.branchName || 'Main Branch');
  const shopAddress = esc(shop.address || '');
  const shopPhone = esc(shop.phone || shop.whatsapp || '');

  const invoiceNo = esc(order.invoiceNumber);
  const formattedDate = fmtDate(order.createdAt);
  const cashierName = esc(order.cashier);
  const customerName = esc(order.customer?.name || 'Walk-In Customer');
  const customerPhone = esc(order.customer?.phone || '—');

  const paymentsFormatted = order.paymentBreakdown && order.paymentBreakdown.length > 0
    ? order.paymentBreakdown.map((p) => `${p.method}: Rs ${fmtMoney(p.amount)}`).join(', ')
    : 'Cash';

  return `
    <div class="invoice-column">
      <!-- 70% UPPER ZONE: Header, Customer, Handset Items, Financials -->
      <div class="upper-content-zone">
        <!-- Header -->
        <table class="w-full header-table">
          <tr>
            <td style="width: 58%; vertical-align: top;">
              <div class="shop-title">${shopName}</div>
              <div class="shop-sub">${branchName}${shopAddress ? ' &bull; ' + shopAddress : ''}</div>
              ${shopPhone ? `<div class="shop-sub">Contact: <strong>${shopPhone}</strong></div>` : ''}
            </td>
            <td style="width: 42%; text-align: right; vertical-align: top;">
              <div class="copy-badge">${esc(copyLabel)}</div>
              <div class="invoice-number">Invoice #: ${invoiceNo}</div>
              <div class="meta-line">Date: ${formattedDate}</div>
              <div class="meta-line">Cashier: <strong>${cashierName}</strong></div>
            </td>
          </tr>
        </table>

        <!-- Customer Info Bar -->
        <div class="customer-bar">
          <table class="w-full">
            <tr>
              <td style="width: 62%;">
                <span class="label">Customer:</span>
                <span class="val font-bold">${customerName}</span>
              </td>
              <td style="width: 38%; text-align: right;">
                <span class="label">Phone:</span>
                <span class="val font-mono">${customerPhone}</span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Items Table -->
        <table class="items-table w-full">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 55%; text-align: left;">Handset Description &amp; IMEI / Serial</th>
              <th style="width: 6%; text-align: center;">Qty</th>
              <th style="width: 16%; text-align: right;">Rate</th>
              <th style="width: 18%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item, idx) => {
              const imeiLine = [
                item.imei1 ? `IMEI 1: <span class="font-mono font-bold">${esc(item.imei1)}</span>` : '',
                item.imei2 ? `IMEI 2: <span class="font-mono font-bold">${esc(item.imei2)}</span>` : '',
              ].filter(Boolean).join(' | ');

              const specsLine = [
                item.specs ? esc(item.specs) : '',
                item.ptaStatus ? esc(item.ptaStatus.replace(/_/g, ' ')) : '',
                item.condition ? esc(item.condition) : '',
              ].filter(Boolean).join(' • ');

              return `
                <tr>
                  <td style="text-align: center; vertical-align: top;">${idx + 1}</td>
                  <td style="vertical-align: top;">
                    <div class="font-bold item-title">${esc(item.name)}</div>
                    ${specsLine ? `<div class="item-sub">${specsLine}</div>` : ''}
                    ${imeiLine ? `<div class="item-imei">${imeiLine}</div>` : ''}
                  </td>
                  <td style="text-align: center; vertical-align: top;">${item.qty}</td>
                  <td style="text-align: right; vertical-align: top;">Rs ${fmtMoney(item.price)}</td>
                  <td style="text-align: right; vertical-align: top; font-weight: bold;">Rs ${fmtMoney(item.total)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Financial Calculation Breakdown -->
        <table class="w-full" style="margin-top: 2px;">
          <tr>
            <td style="width: 48%; vertical-align: top;">
              <div style="font-size: 8.5px; color: #4b5563; padding: 2px 4px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 3px;">
                <strong>Payment Mode:</strong> ${esc(paymentsFormatted)}
                ${order.notes ? `<br><strong>Note:</strong> ${esc(order.notes)}` : ''}
              </div>
            </td>
            <td style="width: 52%; vertical-align: top; padding-left: 6px;">
              <table class="w-full totals-table">
                <tr>
                  <td class="tot-label">Subtotal:</td>
                  <td class="tot-val">Rs ${fmtMoney(order.subtotal)}</td>
                </tr>
                ${order.discount > 0 ? `
                <tr>
                  <td class="tot-label" style="color: #dc2626;">Discount:</td>
                  <td class="tot-val" style="color: #dc2626;">- Rs ${fmtMoney(order.discount)}</td>
                </tr>` : ''}
                <tr class="grand-total-row">
                  <td class="tot-label grand-text">Net Total:</td>
                  <td class="tot-val grand-val">Rs ${fmtMoney(order.total)}</td>
                </tr>
                <tr>
                  <td class="tot-label">Paid Amount:</td>
                  <td class="tot-val font-bold">Rs ${fmtMoney(order.tendered)}</td>
                </tr>
                ${order.change > 0 ? `
                <tr>
                  <td class="tot-label">Change Return:</td>
                  <td class="tot-val">Rs ${fmtMoney(order.change)}</td>
                </tr>` : ''}
                ${order.due > 0 ? `
                <tr style="color: #b91c1c; font-weight: bold;">
                  <td class="tot-label">Balance Due:</td>
                  <td class="tot-val">Rs ${fmtMoney(order.due)}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
        </table>
      </div>

      <!-- 30% LOWER ZONE: Comprehensive Urdu Instructions, Warranty Policy & Signatures -->
      <div class="lower-instructions-zone">
        <div class="urdu-instructions-card">
          <div class="urdu-header-title">ضروری ہدایات، وارنٹی و شرائط فروخت (Terms &amp; Instructions)</div>
          <ol class="urdu-rules-list">
            <li>موبائل کی خریداری کے وقت تمام کیمرے، ٹچ، سکرین، سپیکر، چارجنگ اور نیٹ ورک وغیرہ کی مکمل تسلی کر لیں۔</li>
            <li>ہر قسم کے استعمال شدہ موبائل پر صرف <strong>7 دن کی چیک وارنٹی</strong> ہے۔ مقررہ وقت کے بعد کوئی کلیم قابل قبول نہ ہو گا۔</li>
            <li>سکرین / ڈسپلے، ٹچ پینل، فنگر پرنٹ، گرنے، ٹوٹنے، دباؤ آنے یا پانی لگنے کی صورت میں وارنٹی ختم تصور ہو گی۔</li>
            <li>وارنٹی کلیم، ریپلیسمنٹ یا کسی بھی رجوع کے لیے <strong>اصل کمپیوٹرائزڈ انوائس</strong> پیش کرنا لازمی اور ضروری ہے۔</li>
          </ol>
          <div class="english-ack-note">
            Warranty Claim Condition: Original invoice required. Physical damage, panel breakdown, or liquid spillage invalidates warranty.
          </div>
        </div>

        <!-- Dual Signature Section -->
        <table class="w-full sig-table">
          <tr>
            <td style="width: 50%; text-align: left; vertical-align: bottom;">
              <div class="sig-line"></div>
              <div class="sig-label">Customer Signature (دستخط خریدار)</div>
            </td>
            <td style="width: 50%; text-align: right; vertical-align: bottom;">
              <div class="sig-line ml-auto"></div>
              <div class="sig-label">Authorized Sign &amp; Stamp (مہر دکان)</div>
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

export function buildMobileSaleDualA4Html(
  order: MobileSalePrintOrder,
  shop?: MobileSalePrintShop
): string {
  const effectiveShop = shop || {
    name: 'Niazi Mobile Mart',
    branchName: 'Main Branch',
  };

  const leftCopyHtml = renderSingleInvoiceColumn(order, effectiveShop, 'Shop / Office Record Copy');
  const rightCopyHtml = renderSingleInvoiceColumn(order, effectiveShop, 'Customer Copy');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Mobile Sale Invoice — ${esc(order.invoiceNumber)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 4mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10px;
      color: #111827;
      background: #fff;
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .w-full {
      width: 100%;
      border-collapse: collapse;
    }
    .font-bold {
      font-weight: 700;
    }
    .font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0.02em;
    }
    .ml-auto {
      margin-left: auto;
    }

    /* Landscape Dual Columns Wrapper */
    .landscape-container {
      display: flex;
      flex-direction: row;
      width: 100%;
      height: 196mm; /* Full A4 Landscape printable height */
      justify-content: space-between;
    }

    .invoice-column {
      width: 48.5%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 3px 5px;
      box-sizing: border-box;
    }

    /* 70% Upper Zone for Commercial Handset Specs & Items */
    .upper-content-zone {
      height: 68%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      overflow: hidden;
    }

    /* Header styling */
    .header-table {
      margin-bottom: 3px;
      border-bottom: 1.5px solid #1e3a8a;
      padding-bottom: 3px;
    }
    .shop-title {
      font-size: 15px;
      font-weight: 900;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      line-height: 1.1;
    }
    .shop-sub {
      font-size: 8.5px;
      color: #4b5563;
      margin-top: 1px;
    }
    .copy-badge {
      display: inline-block;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 1.5px 6px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 3px;
      color: #1f2937;
      letter-spacing: 0.03em;
      margin-bottom: 1px;
    }
    .invoice-number {
      font-size: 11.5px;
      font-weight: 800;
      color: #111827;
    }
    .meta-line {
      font-size: 8.5px;
      color: #4b5563;
    }

    /* Customer Bar */
    .customer-bar {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 3px;
      padding: 2.5px 6px;
      margin-bottom: 4px;
      font-size: 9.5px;
    }
    .customer-bar .label {
      color: #6b7280;
      font-size: 9px;
      text-transform: uppercase;
      margin-right: 3px;
    }
    .customer-bar .val {
      color: #111827;
    }

    /* Items Table */
    .items-table {
      border: 1px solid #d1d5db;
      border-collapse: collapse;
      margin-bottom: 3px;
    }
    .items-table th {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 2.5px 4px;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #374151;
    }
    .items-table td {
      border: 1px solid #e5e7eb;
      padding: 2.5px 4px;
      font-size: 9.5px;
    }
    .item-title {
      font-size: 10px;
      color: #111827;
    }
    .item-sub {
      font-size: 8px;
      color: #6b7280;
    }
    .item-imei {
      font-size: 8px;
      color: #1e40af;
      margin-top: 1px;
    }

    /* Totals Table */
    .totals-table {
      border: 1px solid #e5e7eb;
      border-collapse: collapse;
      background: #fafafa;
      border-radius: 3px;
    }
    .totals-table td {
      padding: 1.5px 6px;
      font-size: 9px;
      border-bottom: 1px solid #f3f4f6;
    }
    .tot-label {
      color: #4b5563;
      width: 48%;
    }
    .tot-val {
      text-align: right;
      color: #111827;
      width: 52%;
    }
    .grand-total-row td {
      background: #e0e7ff;
      border-top: 1px solid #6366f1;
      border-bottom: 1px solid #6366f1;
    }
    .grand-text {
      font-size: 9.5px;
      font-weight: 800;
      color: #1e3a8a;
      text-transform: uppercase;
    }
    .grand-val {
      font-size: 10.5px;
      font-weight: 900;
      color: #1e3a8a;
    }

    /* 30% Lower Zone for Urdu Instructions & Terms */
    .lower-instructions-zone {
      height: 31%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-top: 1px solid #e5e7eb;
      padding-top: 3px;
    }

    .urdu-instructions-card {
      background: #fbfbfb;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 4px 6px;
    }
    .urdu-header-title {
      font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Segoe UI', Arial, sans-serif;
      direction: rtl;
      text-align: right;
      font-size: 9.5px;
      font-weight: bold;
      color: #1e3a8a;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 1px;
      margin-bottom: 2px;
    }
    .urdu-rules-list {
      font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Segoe UI', Arial, sans-serif;
      direction: rtl;
      text-align: right;
      padding-right: 12px;
      font-size: 8.5px;
      color: #374151;
      line-height: 1.35;
    }
    .urdu-rules-list li {
      margin-bottom: 1.5px;
    }
    .english-ack-note {
      font-size: 7.5px;
      color: #6b7280;
      margin-top: 2px;
      border-top: 1px dashed #e5e7eb;
      padding-top: 1.5px;
    }

    /* Signatures */
    .sig-table {
      margin-top: 3px;
    }
    .sig-line {
      width: 90px;
      border-top: 1px solid #9ca3af;
      margin-bottom: 1.5px;
    }
    .sig-label {
      font-size: 8px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    /* Center Vertical Cut Line */
    .vertical-cut-divider {
      width: 2.5%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .cut-border-line {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      border-left: 1.5px dashed #9ca3af;
      transform: translateX(-50%);
    }
    .cut-pill {
      position: relative;
      background: #fff;
      padding: 10px 2px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      transform: rotate(180deg);
      font-size: 8.5px;
      font-weight: 700;
      color: #6b7280;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="landscape-container">
    <!-- Left Column: Shop Record Copy -->
    ${leftCopyHtml}

    <!-- Vertical Perforation Cut Line -->
    <div class="vertical-cut-divider">
      <div class="cut-border-line"></div>
      <div class="cut-pill">&#9986; CUT HERE / یہاں سے کاٹیں &#9986;</div>
    </div>

    <!-- Right Column: Customer Copy -->
    ${rightCopyHtml}
  </div>
</body>
</html>`;
}
