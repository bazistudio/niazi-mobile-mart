/**
 * productInventoryA4Template.ts
 *
 * Generates an A4 portrait HTML document for Products Inventory stock audit and listing.
 *
 * Security & Cost Privacy:
 *   - Strict HTML escaping on all dynamic fields via esc().
 *   - Cost privacy guard: When canViewCost is false, purchase price, total inventory cost,
 *     stock valuation, and margin metrics are strictly omitted from HTML, metadata, and tables.
 *   - Zero external scripts, zero remote fonts or network calls.
 */

import type { InventoryProduct } from '../types';

export interface ProductInventoryReportOptions {
  shopName?: string;
  branchName?: string;
  categoryFilter?: string;
  brandFilter?: string;
  companyFilter?: string;
  colorFilter?: string;
  qualityFilter?: string;
  searchKeyword?: string;
  generatedBy?: string;
  canViewCost?: boolean;
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
  return Math.round(val).toLocaleString('en-PK');
}

export function buildProductInventoryA4Html(
  products: InventoryProduct[],
  options: ProductInventoryReportOptions
): string {
  const shopTitle = esc(options.shopName || 'Niazi Mobile Mart');
  const branchLabel = esc(options.branchName || 'All Assigned Branches');
  const operator = esc(options.generatedBy || 'Authorized Staff');
  const canViewCost = Boolean(options.canViewCost);

  const now = new Date();
  const printTimestamp =
    now.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) +
    ' ' +
    now.toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
    });

  // Calculate metrics
  const totalRecords = products.length;
  const totalPhysicalStock = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalSaleValue = products.reduce(
    (sum, p) => sum + (Number(p.stock) || 0) * (Number(p.price) || 0),
    0
  );

  // Cost metrics only calculated if canViewCost is true
  let totalCostValue = 0;
  let estimatedMargin = 0;
  if (canViewCost) {
    totalCostValue = products.reduce(
      (sum, p) => sum + (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0),
      0
    );
    if (totalSaleValue > 0) {
      estimatedMargin = totalSaleValue - totalCostValue;
    }
  }

  // Active filters array (only display if active / selected)
  const activeFilters: { label: string; value: string }[] = [];
  if (options.categoryFilter && options.categoryFilter.trim() && options.categoryFilter !== 'all') {
    activeFilters.push({ label: 'Category', value: options.categoryFilter });
  }
  if (options.brandFilter && options.brandFilter.trim() && options.brandFilter !== 'all') {
    activeFilters.push({ label: 'Brand', value: options.brandFilter });
  }
  if (options.companyFilter && options.companyFilter.trim() && options.companyFilter !== 'all') {
    activeFilters.push({ label: 'Company', value: options.companyFilter });
  }
  if (options.colorFilter && options.colorFilter.trim() && options.colorFilter !== 'all') {
    activeFilters.push({ label: 'Color', value: options.colorFilter });
  }
  if (options.qualityFilter && options.qualityFilter.trim() && options.qualityFilter !== 'all') {
    activeFilters.push({ label: 'Quality', value: options.qualityFilter });
  }
  if (options.searchKeyword && options.searchKeyword.trim()) {
    activeFilters.push({ label: 'Search Query', value: options.searchKeyword.trim() });
  }

  const filtersHtml =
    activeFilters.length > 0
      ? activeFilters
          .map(
            (f) =>
              `<div class="meta-cell"><span class="meta-label">${esc(f.label)}:</span> <span class="meta-val">${esc(f.value)}</span></div>`
          )
          .join('')
      : '<div class="meta-cell"><span class="meta-label">Filters:</span> <span class="meta-val">All Products (No active filters)</span></div>';

  // Table rows
  const rowsHtml = products
    .map((p, idx) => {
      const stock = Number(p.stock) || 0;
      const salePrice = Number(p.price) || 0;
      const purchasePrice = Number(p.purchasePrice) || 0;
      const valuation = stock * purchasePrice;

      // Status indicator
      let statusBadge = '<span style="color:#15803d; font-weight:600;">In Stock</span>';
      if (stock === 0) {
        statusBadge = '<span style="color:#b91c1c; font-weight:600;">Out of Stock</span>';
      } else if (stock <= (p.minStockThreshold ?? 5)) {
        statusBadge = '<span style="color:#b45309; font-weight:600;">Low Stock</span>';
      }

      // Specs combination (Company / Color / Quality)
      const attributes = [p.company, p.color, p.quality]
        .filter((val) => Boolean(val) && val !== '-')
        .join(' • ');

      return `
      <tr style="border-bottom: 1px solid #e5e7eb; page-break-inside: avoid;">
        <td style="padding: 6px 4px; text-align: center; color: #6b7280; font-size: 10px;">${idx + 1}</td>
        <td style="padding: 6px 6px;">
          <div style="font-weight: 600; color: #111827; font-size: 11px;">${esc(p.name)}</div>
          ${p.sku ? `<div style="font-size: 9px; color: #6b7280; font-family: monospace;">SKU: ${esc(p.sku)}</div>` : ''}
          ${p.barcode ? `<div style="font-size: 8.5px; color: #9ca3af; font-family: monospace;">Bar: ${esc(p.barcode)}</div>` : ''}
        </td>
        <td style="padding: 6px 6px; font-size: 10px; color: #374151;">
          <div>${esc(p.category || 'General')}</div>
          ${p.brand && p.brand !== '-' ? `<div style="font-size: 9px; color: #6b7280;">${esc(p.brand)}</div>` : ''}
        </td>
        <td style="padding: 6px 6px; font-size: 9.5px; color: #4b5563;">
          ${esc(attributes || '—')}
        </td>
        <td style="padding: 6px 4px; text-align: center; font-size: 10px;">
          <div style="font-weight: 700; color: #111827;">${stock.toLocaleString()}</div>
          <div style="font-size: 8.5px;">${statusBadge}</div>
        </td>
        <td style="padding: 6px 6px; text-align: right; font-size: 10.5px; font-weight: 600; color: #1e3a8a; white-space: nowrap;">
          Rs. ${fmtPrice(salePrice)}
        </td>
        ${
          canViewCost
            ? `
        <td style="padding: 6px 6px; text-align: right; font-size: 10.5px; color: #374151; white-space: nowrap;">
          Rs. ${fmtPrice(purchasePrice)}
        </td>
        <td style="padding: 6px 6px; text-align: right; font-size: 10.5px; font-weight: 600; color: #006970; white-space: nowrap;">
          Rs. ${fmtPrice(valuation)}
        </td>
        `
            : ''
        }
      </tr>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Products Inventory Stock Audit Report</title>
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
      border-bottom: 2px solid #006970;
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
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
    }
    .meta-cell {
      display: inline-block;
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
          <div style="font-size: 18px; font-weight: 800; color: #006970; letter-spacing: -0.02em;">${shopTitle}</div>
          <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px;">PRODUCT INVENTORY REPORT</div>
          <div style="font-size: 9.5px; color: #64748b; margin-top: 1px;">Branch: <strong>${branchLabel}</strong></div>
        </td>
        <td style="text-align: right; vertical-align: top; font-size: 9.5px; color: #64748b;">
          <div>Generated: <strong>${printTimestamp}</strong></div>
          <div>Printed By: <strong>${operator}</strong></div>
          <div style="margin-top: 3px; display: inline-block; padding: 2px 6px; background: #e0f2fe; color: #0369a1; border-radius: 3px; font-weight: 600; font-size: 9px;">
            A4 Official Report
          </div>
        </td>
      </tr>
    </table>

    <!-- Active Filter Criteria Box -->
    <div class="meta-box">
      <div class="meta-grid">
        ${filtersHtml}
      </div>
    </div>

    <!-- Summary Metrics -->
    <div class="summary-card">
      <div class="summary-item" style="border-right: 1px solid #cbd5e1;">
        <div class="summary-title">Total Products</div>
        <div class="summary-value">${totalRecords.toLocaleString()} records</div>
      </div>
      <div class="summary-item" style="border-right: 1px solid #cbd5e1;">
        <div class="summary-title">Physical Stock Units</div>
        <div class="summary-value">${totalPhysicalStock.toLocaleString()} units</div>
      </div>
      <div class="summary-item"${canViewCost ? ' style="border-right: 1px solid #cbd5e1;"' : ''}>
        <div class="summary-title">Total Sale Valuation</div>
        <div class="summary-value" style="color: #15803d;">Rs. ${fmtPrice(totalSaleValue)}</div>
      </div>
      ${
        canViewCost
          ? `
      <div class="summary-item" style="border-right: 1px solid #cbd5e1;">
        <div class="summary-title">Total Cost Investment</div>
        <div class="summary-value" style="color: #0369a1;">Rs. ${fmtPrice(totalCostValue)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-title">Estimated Margin</div>
        <div class="summary-value" style="color: #006970;">Rs. ${fmtPrice(estimatedMargin)}</div>
      </div>
      `
          : ''
      }
    </div>

    <!-- Products Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 24px; text-align: center;">#</th>
          <th style="text-align: left;">Product Name &amp; SKU</th>
          <th style="text-align: left;">Category &amp; Brand</th>
          <th style="text-align: left;">Specs / Variants</th>
          <th style="text-align: center; width: 60px;">Stock</th>
          <th style="text-align: right; width: 75px;">Sale (Rs)</th>
          ${
            canViewCost
              ? `
          <th style="text-align: right; width: 75px;">Cost (Rs)</th>
          <th style="text-align: right; width: 85px;">Valuation (Rs)</th>
          `
              : ''
          }
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Footer Note -->
    <div class="footer-note">
      <span>* This report represents inventory catalog items matching active filters.</span>
      <span>Niazi Mobile Mart POS System &bull; Page Record Set: ${totalRecords}</span>
    </div>
  </div>
</body>
</html>`;
}

export function buildProductInventoryPdfFilename(shopName?: string): string {
  const dStr = new Date().toISOString().slice(0, 10);
  const cleanName = (shopName || 'product_inventory')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${cleanName}_${dStr}`;
}

