/**
 * usedMobileA4Template.ts
 *
 * Generates an A4-portrait HTML document for a USED mobile purchase record.
 *
 * Security:
 *   - All user-supplied values are run through esc() before insertion into HTML.
 *   - Never interpolate raw strings as HTML or JavaScript.
 *
 * Usage:
 *   import { buildUsedMobileA4Html } from './usedMobileA4Template';
 *   const html = buildUsedMobileA4Html(profile);
 *   usePrintStore().openPreview({ html, documentType: 'Generic', referenceId: ..., title: ... });
 *   // or: downloadHtmlAsPdf(html, filename)
 *
 * Legal notice:
 *   The declaration text below is a placeholder.
 *   The business owner MUST review and approve wording before use as an official affidavit.
 */

import type { MobileFullProfile } from '../services/mobile.api';

/** HTML-escape a value before inserting it into the document. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format date string to a readable form. */
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return esc(d);
  }
}

/** Format numeric price with PKR prefix. */
function fmtPrice(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return esc(String(v));
  return `PKR ${n.toLocaleString('en-PK')}`;
}

/** Boolean cell: ✓ or ✗ or — */
function boolCell(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '<span style="color:#9ca3af">—</span>';
  return v
    ? '<span style="color:#16a34a;font-weight:600">✓</span>'
    : '<span style="color:#dc2626">✗</span>';
}

/** A two-column row for the detail tables. */
function row(label: string, value: string | null | undefined, mono = false): string {
  const v = value ? esc(value) : '<span style="color:#9ca3af;font-style:italic">Not recorded</span>';
  const style = mono ? 'font-family:monospace;font-size:12px;letter-spacing:0.03em' : '';
  return `
    <tr>
      <td style="padding:5px 10px 5px 0;color:#6b7280;font-size:12px;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:5px 0;font-size:12px;font-weight:500;${style}">${v}</td>
    </tr>`;
}

export function buildUsedMobileA4Html(profile: MobileFullProfile): string {
  const { device, paperwork, inspection, branch_name } = profile;

  const voucherNo   = esc(paperwork?.voucher_no  ?? '—');
  const purchDate   = fmtDate(paperwork?.purchase_date);
  const purchPrice  = fmtPrice(paperwork?.purchase_price);
  const printDate   = new Date().toLocaleDateString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const sellerName    = esc(paperwork?.seller?.seller_name  ?? '—');
  const fatherName    = esc(paperwork?.seller?.father_name  ?? '—');
  const sellerCnic    = esc(paperwork?.seller?.seller_cnic_masked ?? '—');
  const sellerPhone   = esc(paperwork?.seller?.seller_phone ?? '—');
  const sellerAddr    = esc(paperwork?.seller?.seller_address ?? '—');
  const branchLabel   = esc(branch_name ?? device.branch_id ?? '—');

  // Functional checks
  const checks: Array<[string, boolean | null | undefined]> = [
    ['Touch screen',       inspection?.touch_working],
    ['Battery backup',     inspection?.battery_backup_ok],
    ['Front camera',       inspection?.front_camera_ok],
    ['Back camera',        inspection?.back_camera_ok],
    ['Speaker',            inspection?.speaker_ok],
    ['Microphone',         inspection?.microphone_ok],
    ['Charging port',      inspection?.charging_port_ok],
    ['Buttons',            inspection?.buttons_ok],
    ['Biometrics',         inspection?.biometrics_ok],
    ['WiFi / Bluetooth',   inspection?.wifi_bluetooth_ok],
    ['SIM / Network',      inspection?.sim_network_ok],
  ];
  const checksHtml = checks.map(([label, val]) =>
    `<td style="width:50%;padding:4px 6px;font-size:11px;border:1px solid #e5e7eb">${esc(label)}: ${boolCell(val)}</td>`
  );
  // pair them up into rows
  const checkRows: string[] = [];
  for (let i = 0; i < checksHtml.length; i += 2) {
    const right = checksHtml[i + 1] ?? '<td></td>';
    checkRows.push(`<tr>${checksHtml[i]}${right}</tr>`);
  }

  const accessories: Array<[string, boolean | null | undefined]> = [
    ['Original box',   inspection?.accessories_box],
    ['Charger',        inspection?.accessories_original_charger],
    ['Cable',          inspection?.accessories_cable],
    ['Handsfree',      inspection?.accessories_handsfree],
  ];
  const accHtml = accessories.map(([label, val]) =>
    `<span style="margin-right:12px;font-size:11px">${boolCell(val)} ${esc(label)}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Used Mobile Purchase Receipt — Sr No ${voucherNo}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 16mm 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #111827;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    h2 { margin: 0 0 2px 0; font-size: 18px; font-weight: 700; color: #111827; }
    h3 { margin: 14px 0 6px 0; font-size: 13px; font-weight: 700; text-transform: uppercase;
         letter-spacing: 0.06em; color: #374151; border-bottom: 1.5px solid #d1d5db; padding-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; }
    .section { margin-bottom: 10px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .footer { margin-top: 18px; border-top: 1.5px solid #d1d5db; padding-top: 10px;
              font-size: 11px; color: #6b7280; }
    .sig-block { border-top: 1px dashed #9ca3af; margin-top: 28px; padding-top: 4px;
                 font-size: 11px; color: #6b7280; text-align: center; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- ── HEADER ───────────────────────────────────────────────────────── -->
  <table style="margin-bottom:12px">
    <tr>
      <td style="width:60%;vertical-align:top">
        <h2>Niazi Mobile Mart</h2>
        <div style="font-size:11px;color:#6b7280;line-height:1.5">
          Shop # LG 02, Makkah Mobile Mall<br>
          Branch: <strong>${branchLabel}</strong>
        </div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-size:11px;color:#6b7280;margin-bottom:3px">Printed: ${esc(printDate)}</div>
        <div style="font-size:22px;font-weight:800;color:#1d4ed8;letter-spacing:0.04em">Sr # ${voucherNo}</div>
        <span class="badge badge-blue">USED MOBILE PURCHASE RECEIPT</span>
      </td>
    </tr>
  </table>

  <hr style="border:none;border-top:2px solid #1d4ed8;margin-bottom:14px">

  <!-- ── DEVICE + PAPERWORK ────────────────────────────────────────────── -->
  <table style="margin-bottom:6px">
    <tr style="vertical-align:top">
      <td style="width:50%;padding-right:12px">
        <h3>Device Information</h3>
        <table>
          ${row('Brand',        device.brand)}
          ${row('Model',        device.model)}
          ${row('Storage',      device.storage)}
          ${row('RAM',          device.ram)}
          ${row('Color',        device.color)}
          ${row('IMEI 1',       device.imeis?.find(i => i.slot === 'IMEI1')?.imei ?? device.imeis?.[0]?.imei, true)}
          ${row('IMEI 2',       device.imeis?.find(i => i.slot === 'IMEI2')?.imei ?? device.imeis?.[1]?.imei, true)}
          ${row('HW Serial',    device.serial_number, true)}
          ${row('PTA Status',   device.pta_status?.replace(/_/g, ' '))}
          ${row('Status',       device.status?.replace(/_/g, ' '))}
        </table>
      </td>
      <td style="width:50%;padding-left:12px;border-left:1px solid #e5e7eb">
        <h3>Purchase Paperwork</h3>
        <table>
          ${row('Voucher Sr No',    paperwork?.voucher_no)}
          ${row('Purchase Date',    purchDate)}
          ${row('Purchase Price',   purchPrice)}
          ${row('Recorded By',      paperwork?.recorded_by)}
        </table>
      </td>
    </tr>
  </table>

  <!-- ── SELLER ───────────────────────────────────────────────────────── -->
  <div class="section">
    <h3>Seller Information</h3>
    <table>
      <tr>
        <td style="width:50%;padding-right:12px;vertical-align:top">
          <table>
            ${row('Full Name',    sellerName)}
            ${row("Father's Name", fatherName)}
            ${row('CNIC',         sellerCnic, true)}
          </table>
        </td>
        <td style="width:50%;padding-left:12px;border-left:1px solid #e5e7eb;vertical-align:top">
          <table>
            ${row('Mobile No',  sellerPhone, true)}
            ${row('Address',    sellerAddr)}
          </table>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── INSPECTION ───────────────────────────────────────────────────── -->
  <div class="section">
    <h3>Physical Inspection</h3>
    <table style="margin-bottom:6px">
      <tr style="vertical-align:top">
        <td style="width:33%;padding-right:8px">
          <table>
            ${row('Body Grade',     inspection?.body_grade)}
            ${row('Screen',         inspection?.screen_condition?.replace(/_/g, ' '))}
          </table>
        </td>
        <td style="width:33%;padding:0 8px;border-left:1px solid #e5e7eb">
          <table>
            ${row('Battery Health', inspection?.battery_health_percent != null ? `${inspection.battery_health_percent}%` : null)}
          </table>
        </td>
        <td style="width:34%;padding-left:8px;border-left:1px solid #e5e7eb;font-size:12px">
          <strong>Accessories:</strong><br>${accHtml || '<span style="color:#9ca3af;font-style:italic">Not recorded</span>'}
        </td>
      </tr>
    </table>

    <!-- Functional checks grid -->
    <table style="border:1px solid #e5e7eb;margin-top:4px">
      ${checkRows.join('\n')}
    </table>

    ${inspection?.defect_notes ? `
    <div style="margin-top:6px;padding:6px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:4px;font-size:12px">
      <strong>Defect Notes:</strong> ${esc(inspection.defect_notes)}
    </div>` : ''}
  </div>

  <!-- ── DECLARATION PLACEHOLDER ──────────────────────────────────────── -->
  <div style="margin-top:10px;padding:8px 12px;border:1px dashed #d1d5db;border-radius:4px;font-size:11px;color:#6b7280">
    <strong style="color:#374151">[DECLARATION PLACEHOLDER — Business Owner Must Approve Wording]</strong><br>
    I, the seller named above, hereby declare that the above-mentioned mobile device is my lawful property,
    free from any encumbrance, dispute, or pending case, and that I am voluntarily selling it to Niazi Mobile Mart.
    Physical affidavit paperwork and thumb impressions have been obtained separately.
  </div>

  <!-- ── SIGNATURE BLOCKS ─────────────────────────────────────────────── -->
  <table style="margin-top:20px">
    <tr>
      <td style="width:33%;text-align:center">
        <div class="sig-block">Seller Signature / Thumb</div>
      </td>
      <td style="width:34%;text-align:center">
        <div class="sig-block">Staff Signature</div>
      </td>
      <td style="width:33%;text-align:center">
        <div class="sig-block">Shop Stamp</div>
      </td>
    </tr>
  </table>

  <!-- ── FOOTER ───────────────────────────────────────────────────────── -->
  <div class="footer">
    <table>
      <tr>
        <td style="width:60%">
          This is a computer-generated record. This document does not replace a required physical affidavit, 
          CNIC copy, or thumb impression. Not a tax invoice.
        </td>
        <td style="text-align:right;vertical-align:top">
          Device ID: <span style="font-family:monospace;font-size:10px">${esc(device.id)}</span>
        </td>
      </tr>
    </table>
  </div>

</body>
</html>`;
}

/** Generate a safe filename for PDF download. */
export function buildUsedMobilePdfFilename(profile: MobileFullProfile): string {
  const voucherNo = profile.paperwork?.voucher_no ?? 'NO-SR';
  const brand  = profile.device.brand.replace(/[^a-z0-9]/gi, '-').slice(0, 20);
  const model  = profile.device.model.replace(/[^a-z0-9]/gi, '-').slice(0, 20);
  return `NMM-Purchase-${voucherNo}-${brand}-${model}`;
}
