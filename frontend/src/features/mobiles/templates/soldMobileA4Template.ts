/**
 * soldMobileA4Template.ts
 *
 * Generates a clean A4 portrait/landscape HTML document for Sold Mobile reporting,
 * including summary metrics, customer/invoice references, and authorization blocks.
 */

import type { MobileInventoryItem } from '../types/mobile.types';

export interface SoldMobileReportOptions {
  shopName?: string;
  branchName?: string;
  showBranchColumn?: boolean;
  dateRangeLabel: string;
  searchKeyword?: string;
  generatedBy?: string;
  showFinancials?: boolean;
}

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPrice(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    const parts = d.slice(0, 10).split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[monthIdx] || parts[1]} ${year}`;
    }
    return esc(d.slice(0, 10));
  } catch {
    return esc(d);
  }
}

export function buildSoldMobilesA4Html(
  items: MobileInventoryItem[],
  options: SoldMobileReportOptions
): string {
  const showFin = options.showFinancials !== false;
  const showBranch = Boolean(options.showBranchColumn);
  const now = new Date();
  const generatedAt = now.toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const totalSold = items.length;
  const totalRevenue = items.reduce((sum, item) => sum + (item.salePriceActual ?? item.salePrice ?? 0), 0);
  const totalCost = items.reduce((sum, item) => sum + item.purchaseCost, 0);
  const totalProfit = totalRevenue - totalCost;

  const newCount = items.filter((i) => i.condition === 'NEW').length;
  const usedCount = items.filter((i) => i.condition === 'USED').length;

  const colCount = (showFin ? 10 : 7) + (showBranch ? 1 : 0);

  const rowsHtml = items.length === 0
    ? `<tr><td colspan="${colCount}" style="text-align: center; padding: 24px; color: #64748b; font-style: italic;">No sold mobile devices found for the selected criteria.</td></tr>`
    : items.map((item, idx) => {
        const salePrice = item.salePriceActual ?? item.salePrice ?? 0;
        const profit = salePrice - item.purchaseCost;
        const profitClass = profit >= 0 ? '#15803d' : '#b91c1c';

        return `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 8px; font-size: 10px; color: #475569; text-align: center;">${idx + 1}</td>
          ${showBranch ? `
          <td style="padding: 6px 8px; font-size: 10px; font-weight: 600; color: #006970;">
            ${esc(item.branchName || item.branchCode || '—')}
          </td>
          ` : ''}
          <td style="padding: 6px 8px; font-size: 11px; font-weight: 600; color: #0f172a;">
            ${esc(item.brand)} ${esc(item.model)}
            <div style="font-size: 9px; color: #64748b; font-weight: 400;">
              ${esc(item.color || '—')} • ${esc(item.ram ? `${item.ram}/` : '')}${esc(item.storage || '—')}
            </div>
          </td>
          <td style="padding: 6px 8px; font-size: 10px; font-family: monospace; color: #1e293b; letter-spacing: 0.5px;">
            ${esc(item.imei1)}
          </td>
          <td style="padding: 6px 8px; font-size: 10px; text-align: center;">
            <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; background: ${item.condition === 'NEW' ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'}">
              ${item.condition}
            </span>
          </td>
          <td style="padding: 6px 8px; font-size: 10px; color: #334155;">
            ${fmtDate(item.saleDate || item.createdAt)}
          </td>
          <td style="padding: 6px 8px; font-size: 10px; font-family: monospace; color: #0284c7; font-weight: 600;">
            ${esc(item.invoiceNumber || '—')}
          </td>
          <td style="padding: 6px 8px; font-size: 10px; color: #334155;">
            ${esc(item.customerName || 'Walk-in Customer')}
          </td>
          ${showFin ? `
          <td style="padding: 6px 8px; font-size: 10px; text-align: right; color: #475569;">
            Rs. ${fmtPrice(item.purchaseCost)}
          </td>
          <td style="padding: 6px 8px; font-size: 10px; text-align: right; font-weight: 700; color: #0f172a;">
            Rs. ${fmtPrice(salePrice)}
          </td>
          <td style="padding: 6px 8px; font-size: 10px; text-align: right; font-weight: 700; color: ${profitClass};">
            Rs. ${fmtPrice(profit)}
          </td>
          ` : ''}
        </tr>
      `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sold Mobile Inventory Report</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }
    .doc-title {
      font-size: 13px;
      font-weight: 700;
      color: #0284c7;
      margin-top: 2px;
    }
    .meta-box {
      font-size: 10px;
      color: #475569;
      text-align: right;
    }
    .filter-summary {
      display: flex;
      gap: 16px;
      margin-top: 10px;
      font-size: 10px;
      color: #334155;
      background: #f1f5f9;
      padding: 6px 10px;
      border-radius: 4px;
    }
    .metrics-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 14px;
    }
    .metric-card {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #ffffff;
    }
    .metric-label {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    .metric-value {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 8px;
      text-align: left;
    }
    .footer {
      margin-top: 30px;
      padding-top: 14px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 9px;
      color: #64748b;
      page-break-inside: avoid;
    }
    .sig-block {
      text-align: center;
      width: 160px;
      border-top: 1px dashed #94a3b8;
      padding-top: 4px;
      margin-top: 25px;
      font-size: 10px;
      color: #334155;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="brand-title">${esc(options.shopName || 'NIAZI MOBILE MART')}</div>
        <div class="doc-title">SOLD MOBILE INVENTORY REPORT</div>
      </div>
      <div class="meta-box">
        <div><strong>Branch:</strong> ${esc(options.branchName || 'All Authorized Branches')}</div>
        <div><strong>Generated:</strong> ${esc(generatedAt)}</div>
        ${options.generatedBy ? `<div><strong>By:</strong> ${esc(options.generatedBy)}</div>` : ''}
      </div>
    </div>
    <div class="filter-summary">
      <div><strong>Date Period:</strong> ${esc(options.dateRangeLabel)}</div>
      ${options.searchKeyword ? `<div><strong>Filter Keyword:</strong> "${esc(options.searchKeyword)}"</div>` : ''}
      <div><strong>Units Sold:</strong> ${totalSold} (${newCount} New / ${usedCount} Used)</div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="metrics-bar">
    <div class="metric-card">
      <div class="metric-label">Total Sold Units</div>
      <div class="metric-value">${totalSold} Handsets</div>
    </div>
    ${showFin ? `
    <div class="metric-card">
      <div class="metric-label">Total Sold Revenue</div>
      <div class="metric-value" style="color: #0284c7;">Rs. ${fmtPrice(totalRevenue)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Acquisition Cost</div>
      <div class="metric-value" style="color: #475569;">Rs. ${fmtPrice(totalCost)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Realized Gross Margin</div>
      <div class="metric-value" style="color: ${totalProfit >= 0 ? '#15803d' : '#b91c1c'};">Rs. ${fmtPrice(totalProfit)}</div>
    </div>
    ` : ''}
  </div>

  <!-- Table -->
  <table>
    <thead>
      <tr>
        <th style="width: 32px; text-align: center;">#</th>
        ${showBranch ? `<th>Branch</th>` : ''}
        <th>Handset &amp; Specs</th>
        <th>Primary IMEI</th>
        <th style="text-align: center;">Condition</th>
        <th>Sale Date</th>
        <th>Invoice #</th>
        <th>Customer</th>
        ${showFin ? `
        <th style="text-align: right;">Cost Price</th>
        <th style="text-align: right;">Sale Price</th>
        <th style="text-align: right;">Gross Profit</th>
        ` : ''}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <!-- Footer & Signatures -->
  <div class="footer">
    <div>
      <em>Niazi Mobile Mart POS & ERP • System-generated authoritative report</em><br>
      Confidential • Printed for internal business audit purposes only.
    </div>
    <div style="display: flex; gap: 40px;">
      <div>
        <div class="sig-block">Prepared By</div>
      </div>
      <div>
        <div class="sig-block">Store Manager / Owner</div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

export function buildSoldMobilesPdfFilename(options?: { dateRangeLabel?: string }): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const range = (options?.dateRangeLabel || 'All-Time').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 20);
  return `Sold-Mobiles-Report-${range}-${dateStr}.pdf`;
}

