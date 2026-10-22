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
 *   The declaration text (حلف نامہ برائے ذاتی ملکیت) has been approved by the business owner.
 *   This document is printed and physically signed by the seller at point of sale.
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
  const style = mono ? 'font-family:monospace;font-size:12px;letter-spacing:0.02em' : '';
  return `
    <tr>
      <td style="padding:4.5px 10px 4.5px 0;color:#6b7280;font-size:12px;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:4.5px 0;font-size:12px;font-weight:500;${style}">${v}</td>
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
  const sellerCnic    = esc(paperwork?.seller?.seller_cnic ?? paperwork?.seller?.seller_cnic_masked ?? '—');
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
    `<td style="width:50%;padding:6px 10px;font-size:12px;border:1px solid #e5e7eb">${esc(label)}: ${boolCell(val)}</td>`
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
    `<span style="margin-right:16px;font-size:12px">${boolCell(val)} ${esc(label)}</span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purchase Receipt — Sr No ${voucherNo}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm 12mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Segoe UI', Arial, sans-serif;
      font-size: 12.5px;
      color: #111827;
      background: #fff;
      margin: 0;
      padding: 0;
      line-height: 1.4;
    }
    .page-content {
      max-width: 182mm;
      margin: 0 auto;
      width: 100%;
    }
    h2 { margin: 0 0 2px 0; font-size: 20px; font-weight: 700; color: #111827; }
    h3 { margin: 12px 0 5px 0; font-size: 12.5px; font-weight: 700; text-transform: uppercase;
         letter-spacing: 0.05em; color: #374151; border-bottom: 1.5px solid #d1d5db; padding-bottom: 3px; }
    table { border-collapse: collapse; width: 100%; }
    .section { margin-bottom: 10px; }
    .declaration-box {
      margin-top: 14px;
      padding: 10px 14px;
      border: 1.5px solid #374151;
      border-radius: 4px;
      background: #f9fafb;
    }
    .declaration-urdu {
      direction: rtl;
      text-align: right;
      font-size: 14px;
      line-height: 1.9;
      font-family: 'Noto Nastaliq Urdu', 'Urdu Typesetting', 'Jameel Noori Nastaleeq', 'Segoe UI', Arial, sans-serif;
      color: #111827;
    }
    .declaration-heading {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .declaration-english {
      margin-top: 5px;
      font-size: 11px;
      color: #374151;
      font-style: italic;
      text-align: left;
      direction: ltr;
    }
    .sig-section {
      margin-top: 14px;
    }
    .sig-table td {
      vertical-align: top;
      padding: 0 10px;
    }
    .sig-table td:first-child { padding-left: 0; }
    .sig-table td:last-child { padding-right: 0; }
    .sig-label {
      font-size: 11px;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 5px;
    }
    .sig-line {
      border-bottom: 1.5px solid #374151;
      height: 40px;
      margin-bottom: 5px;
    }
    .sig-sub {
      font-size: 10px;
      color: #6b7280;
      text-align: center;
    }
    .thumb-box {
      width: 40mm;
      height: 48mm;
      border: 1.5px solid #111827;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
    }
    .thumb-box-inner {
      text-align: center;
      font-size: 10.5px;
      font-weight: 600;
      color: #6b7280;
      line-height: 1.4;
    }
    .admin-approval-box {
      margin-top: 16px;
      padding: 12px 16px;
      border: 1.5px dashed #1d4ed8;
      border-radius: 4px;
      background: #eff6ff;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page-content">

  <!-- ── HEADER ───────────────────────────────────────────────────────── -->
  <table style="margin-bottom:10px">
    <tr>
      <td style="width:58%;vertical-align:middle">
        <h2>Niazi Mobile Mart</h2>
        <div style="font-size:11.5px;color:#6b7280;line-height:1.4">
          Shop # LG 02, Makkah Mobile Mall | Branch: <strong>${branchLabel}</strong>
        </div>
      </td>
      <td style="vertical-align:middle;text-align:right">
        <div style="font-size:11px;color:#6b7280;margin-bottom:3px">Printed: ${esc(printDate)}</div>
        <div style="font-size:24px;font-weight:800;color:#1d4ed8;letter-spacing:0.04em">Sr # ${voucherNo}</div>
      </td>
    </tr>
  </table>

  <hr style="border:none;border-top:2px solid #1d4ed8;margin-bottom:10px">

  <!-- ── DEVICE + PAPERWORK ────────────────────────────────────────────── -->
  <table style="margin-bottom:8px">
    <tr style="vertical-align:top">
      <td style="width:50%;padding-right:14px">
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
      <td style="width:50%;padding-left:14px;border-left:1px solid #e5e7eb">
        <h3>Purchase Paperwork</h3>
        <table>
          ${row('Voucher Sr No',    paperwork?.voucher_no)}
          ${row('Purchase Date',    purchDate)}
          ${row('Purchase Price',   purchPrice)}
          ${row('Recorded By',      paperwork?.recorded_by)}
        </table>

        <!-- SELLER INFO -->
        <h3 style="margin-top:10px">Seller Information</h3>
        <table>
          ${row('Full Name',    sellerName)}
          ${row("Father's Name", fatherName)}
          ${row('CNIC',         sellerCnic, true)}
          ${row('Mobile No',    sellerPhone, true)}
          ${row('Address',      sellerAddr)}
        </table>
      </td>
    </tr>
  </table>

  <!-- ── INSPECTION ───────────────────────────────────────────────────── -->
  <div class="section">
    <h3>Physical Inspection &amp; Accessories</h3>
    <table style="margin-bottom:6px">
      <tr style="vertical-align:top">
        <td style="width:33%;padding-right:10px">
          <table>
            ${row('Body Grade',     inspection?.body_grade)}
            ${row('Screen',         inspection?.screen_condition?.replace(/_/g, ' '))}
          </table>
        </td>
        <td style="width:33%;padding:0 10px;border-left:1px solid #e5e7eb">
          <table>
            ${row('Battery Health', inspection?.battery_health_percent != null ? `${inspection.battery_health_percent}%` : null)}
          </table>
        </td>
        <td style="width:34%;padding-left:10px;border-left:1px solid #e5e7eb;font-size:11.5px">
          <strong>Accessories:</strong><br>${accHtml || '<span style="color:#9ca3af;font-style:italic">Not recorded</span>'}
        </td>
      </tr>
    </table>

    <!-- Functional checks grid -->
    <table style="border:1px solid #e5e7eb;margin-top:5px">
      ${checkRows.join('\n')}
    </table>

    ${inspection?.defect_notes ? `
    <div style="margin-top:6px;padding:5px 12px;background:#fef9c3;border:1px solid #fde68a;border-radius:3px;font-size:11.5px">
      <strong>Defect Notes:</strong> ${esc(inspection.defect_notes)}
    </div>` : ''}
  </div>

  <!-- ── DECLARATION ──────────────────────────────────────────────────── -->
  <div class="declaration-box">
    <div class="declaration-urdu">
      <span class="declaration-heading">حلف نامہ برائے ذاتی ملکیت</span>
      <br>
      <span>میں حلفیہ کہتا ہوں کہ یہ موبائل میری ذاتی ملکیت ہے اور میں خرید کنندہ سے رقم وصول کر چکا ہوں۔</span>
    </div>
    <div class="declaration-english">Seller affirms under oath that the device is unencumbered and not stolen or under police warrant.</div>
  </div>

  <!-- ── SIGNATURE BLOCKS ─────────────────────────────────────────────── -->
  <div class="sig-section">
    <h3>Signatures &amp; Thumb Impression</h3>
    <table class="sig-table" style="width:100%">
      <tr>
        <td style="width:38%;vertical-align:top">
          <div class="sig-label">Seller</div>
          <div style="font-size:11.5px;margin-bottom:8px;line-height:1.4">
            <div><strong>${sellerName}</strong> S/D/W of ${fatherName}</div>
            <div>CNIC: <span style="font-family:monospace;font-weight:600">${sellerCnic}</span></div>
          </div>
          <div class="sig-line"></div>
          <div class="sig-sub">Seller Signature</div>
        </td>
        <td style="width:24%;vertical-align:top;text-align:center">
          <div class="sig-label" style="text-align:center">Thumb Impression</div>
          <div class="thumb-box">
            <div class="thumb-box-inner">
              Thumb Impression
            </div>
          </div>
        </td>
        <td style="width:38%;vertical-align:top;border-left:1px solid #e5e7eb;padding-left:14px">
          <div class="sig-label">Shop Staff</div>
          <div class="sig-line" style="height:36px"></div>
          <div class="sig-sub" style="margin-bottom:10px">Staff Signature</div>
          <div class="sig-label">Shop Stamp</div>
          <div style="border:1px dashed #9ca3af;height:42px;border-radius:3px"></div>
        </td>
      </tr>
    </table>
  </div>

  <!-- ── FINAL ADMIN APPROVAL & FILE FILING SECTION ───────────────────── -->
  <div class="admin-approval-box">
    <table style="width:100%">
      <tr>
        <td style="width:58%;vertical-align:middle">
          <div style="font-size:12.5px;font-weight:700;color:#1e40af">
            FINAL ADMIN APPROVAL &amp; RECORD ARCHIVE
          </div>
          <div style="font-size:11px;color:#4b5563;margin-top:4px">
            Verified with original CNIC &amp; approved for permanent shop record filing.
          </div>
        </td>
        <td style="width:42%;vertical-align:bottom;text-align:right">
          <div style="display:inline-block;width:160px;text-align:center">
            <div style="border-bottom:1.5px solid #1e40af;height:28px;margin-bottom:4px"></div>
            <div style="font-size:11px;font-weight:700;color:#1e40af">Admin Signature</div>
            <div style="font-size:10px;color:#6b7280">Date: _____ / _____ / 20___</div>
          </div>
        </td>
      </tr>
    </table>
  </div>

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
