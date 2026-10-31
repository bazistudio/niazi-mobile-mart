/**
 * mobileInventoryA4Template.ts
 *
 * Generates an A4 portrait HTML document for Mobile Inventory reporting and stock audits.
 *
 * Security:
 *   - All user-supplied and dynamic values are sanitized through esc() before insertion.
 *   - No raw scripts or unescaped HTML allowed.
 *   - Strict omission of sensitive seller paperwork fields (CNIC, father name, phone, address).
 */

import type { MobileInventoryItem } from '../types/mobile.types';

export interface MobileInventoryReportOptions {
  shopName?: string;
  branchName?: string;
  conditionFilter: string;
  ptaFilter: string;
  dateRangeLabel: string;
  searchKeyword?: string;
  generatedBy?: string;
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

export function buildMobileInventoryA4Html(
  items: MobileInventoryItem[],
  options: MobileInventoryReportOptions
): string {
  const shopTitle = esc(options.shopName || 'Niazi Mobile Mart');
  const branchLabel = esc(options.branchName || 'All Assigned Branches');
  const conditionLabel = esc(options.conditionFilter);
  const ptaLabel = esc(options.ptaFilter);
  const dateLabel = esc(options.dateRangeLabel);
  const searchLabel = options.searchKeyword?.trim() ? esc(options.searchKeyword.trim()) : 'None';
  const operator = esc(options.generatedBy || 'Authorized Staff');

  const now = new Date();
  const printTimestamp = now.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' ' + now.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalUnits = items.length;
  const totalCost = items.reduce((sum, item) => sum + (item.purchaseCost || 0), 0);
  const totalSale = items.reduce((sum, item) => sum + (item.salePrice || 0), 0);

  const rowsHtml = items.map((item, idx) => {
    const conditionBadge = item.condition === 'NEW'
      ? '<span style="color:#15803d; font-weight:600;">NEW</span>'
      : '<span style="color:#b45309; font-weight:600;">USED</span>';

    const ptaText = item.ptaStatus ? esc(item.ptaStatus.replace(/_/g, ' ')) : '—';
    const specs = [item.storage, item.ram ? `${item.ram} RAM` : '', item.color].filter(Boolean).join(' • ');
    const purchaseDate = fmtDate(item.purchaseDate || (item.condition === 'NEW' ? item.createdAt : null));

    return `
      <tr style="border-bottom: 1px solid #e5e7eb; page-break-inside: avoid;">
        <td style="padding: 6px 4px; text-align: center; color: #6b7280; font-size: 10px;">${idx + 1}</td>
        <td style="padding: 6px 6px;">
          <div style="font-weight: 600; color: #111827; font-size: 11px;">${esc(item.brand)} ${esc(item.model)}</div>
          ${item.voucherNo ? `<div style="font-size: 9px; color: #6b7280;">Voucher: ${esc(item.voucherNo)}</div>` : ''}
        </td>
        <td style="padding: 6px 4px; font-family: monospace; font-size: 10px; color: #374151;">${esc(item.imei1)}</td>
        <td style="padding: 6px 4px; text-align: center; font-size: 10px;">${conditionBadge}</td>
        <td style="padding: 6px 6px; font-size: 10px; color: #4b5563;">${esc(specs || 'Standard')}</td>
        <td style="padding: 6px 4px; font-size: 9.5px; color: #374151; text-align: center;">${ptaText}</td>
        <td style="padding: 6px 4px; font-size: 10px; color: #4b5563; text-align: center; white-space: nowrap;">${purchaseDate}</td>
        <td style="padding: 6px 6px; text-align: right; font-size: 10.5px; color: #374151; white-space: nowrap;">Rs. ${fmtPrice(item.purchaseCost)}</td>
        <td style="padding: 6px 6px; text-align: right; font-size: 10.5px; font-weight: 600; color: #1e3a8a; white-space: nowrap;">Rs. ${fmtPrice(item.salePrice)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mobile Inventory Stock Audit Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 12mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #111827;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.35;
    }
    .report-container {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #1e3a8a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .meta-box {
      width: 100%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8px 10px;
      margin-bottom: 12px;
      font-size: 10px;
    }
    .meta-grid {
      display: table;
      width: 100%;
    }
    .meta-row {
      display: table-row;
    }
    .meta-cell {
      display: table-cell;
      padding: 2px 6px;
      vertical-align: top;
    }
    .meta-label {
      color: #64748b;
      font-weight: 600;
    }
    .meta-val {
      color: #0f172a;
      font-weight: 500;
    }
    .summary-card {
      width: 100%;
      border: 1px solid #cbd5e1;
      background: #f1f5f9;
      border-radius: 4px;
      margin-bottom: 12px;
      padding: 6px 12px;
      display: table;
    }
    .summary-item {
      display: table-cell;
      text-align: center;
      padding: 4px 8px;
    }
    .summary-title {
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 700;
      color: #475569;
    }
    .summary-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    thead {
      display: table-header-group;
    }
    thead th {
      background-color: #f1f5f9;
      color: #334155;
      font-weight: 700;
      font-size: 9.5px;
      text-transform: uppercase;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #94a3b8;
      padding: 6px 4px;
    }
    tr {
      page-break-inside: avoid;
    }
    .footer-note {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
      font-size: 9px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- Header -->
    <table class="header-table" style="border-collapse: collapse;">
      <tr>
        <td style="vertical-align: top;">
          <div style="font-size: 18px; font-weight: 800; color: #1e3a8a; letter-spacing: -0.02em;">${shopTitle}</div>
          <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px;">Mobile Inventory & Stock Audit Report</div>
          <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">Branch: <strong>${branchLabel}</strong></div>
        </td>
        <td style="text-align: right; vertical-align: top; font-size: 9.5px; color: #64748b;">
          <div>Generated: <strong>${printTimestamp}</strong></div>
          <div>Printed By: <strong>${operator}</strong></div>
          <div style="margin-top: 3px; display: inline-block; padding: 2px 6px; background: #e0e7ff; color: #3730a3; border-radius: 3px; font-weight: 600; font-size: 9px;">
            A4 Official Report
          </div>
        </td>
      </tr>
    </table>

    <!-- Active Filter Criteria Box -->
    <div class="meta-box">
      <div class="meta-grid">
        <div class="meta-row">
          <div class="meta-cell"><span class="meta-label">Condition:</span> <span class="meta-val">${conditionLabel}</span></div>
          <div class="meta-cell"><span class="meta-label">PTA Status:</span> <span class="meta-val">${ptaLabel}</span></div>
          <div class="meta-cell"><span class="meta-label">Acquisition Date:</span> <span class="meta-val">${dateLabel}</span></div>
          <div class="meta-cell"><span class="meta-label">Search Query:</span> <span class="meta-val">${searchLabel}</span></div>
        </div>
      </div>
    </div>

    <!-- Summary Metrics -->
    <div class="summary-card">
      <div class="summary-item" style="border-right: 1px solid #cbd5e1;">
        <div class="summary-title">Total Handsets</div>
        <div class="summary-value">${totalUnits.toLocaleString()} units</div>
      </div>
      <div class="summary-item" style="border-right: 1px solid #cbd5e1;">
        <div class="summary-title">Total Cost Investment</div>
        <div class="summary-value" style="color: #0369a1;">Rs. ${fmtPrice(totalCost)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-title">Total Expected Sale Value</div>
        <div class="summary-value" style="color: #15803d;">Rs. ${fmtPrice(totalSale)}</div>
      </div>
    </div>

    <!-- Inventory Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 24px; text-align: center;">#</th>
          <th style="text-align: left;">Brand & Model</th>
          <th style="text-align: left;">Primary IMEI</th>
          <th style="text-align: center; width: 44px;">Type</th>
          <th style="text-align: left;">Specs & Color</th>
          <th style="text-align: center;">PTA</th>
          <th style="text-align: center;">Acquired</th>
          <th style="text-align: right; width: 68px;">Cost (Rs)</th>
          <th style="text-align: right; width: 72px;">Sale (Rs)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Footer Note -->
    <div class="footer-note">
      <span>* This report represents serialized handsets matching active filters only. Protected seller PII is excluded.</span>
      <span>Niazi Mobile Mart POS System &bull; Page Record Set: ${totalUnits}</span>
    </div>
  </div>
</body>
</html>`;
}

export function buildMobileInventoryPdfFilename(options: { conditionFilter: string; dateRangeLabel: string }): string {
  const dStr = new Date().toISOString().slice(0, 10);
  const cond = options.conditionFilter.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `mobile_inventory_${cond}_${dStr}`;
}
