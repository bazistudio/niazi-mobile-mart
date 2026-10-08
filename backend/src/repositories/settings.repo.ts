/**
 * Invoice Printer Settings Repository — TypeScript/PostgreSQL
 * Persistent, branch-aware settings for invoice formatting and printer hardware options.
 */

import { Pool } from 'pg';

export interface DbInvoicePrinterSettings {
  branch_id: string;
  shop_name: string;
  branch_name: string;
  address: string;
  phone: string;
  secondary_phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logo_url: string | null;
  tax_number: string | null;
  printer_type: string;
  connection_type: string;
  paper_width: string;
  font_family: string;
  font_size: number;
  margin_top: number;
  margin_bottom: number;
  margin_left: number;
  margin_right: number;
  show_logo: boolean;
  show_shop_info: boolean;
  show_barcode: boolean;
  show_qr: boolean;
  show_tax: boolean;
  show_discount: boolean;
  auto_print: boolean;
  print_copy_count: number;
  return_policy: string | null;
  warranty_instructions: string | null;
  footer_text: string | null;
  updated_at: string;
}

const DEFAULT_MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000002';

function mapRowToSettings(row: Record<string, unknown>): DbInvoicePrinterSettings {
  return {
    branch_id: String(row['branch_id'] ?? DEFAULT_MAIN_BRANCH_ID),
    shop_name: String(row['shop_name'] ?? 'Niazi Mobile Mart'),
    branch_name: String(row['branch_name'] ?? 'Main Branch'),
    address: String(row['address'] ?? ''),
    phone: String(row['phone'] ?? ''),
    secondary_phone: (row['secondary_phone'] as string | null) ?? null,
    whatsapp: (row['whatsapp'] as string | null) ?? null,
    email: (row['email'] as string | null) ?? null,
    logo_url: (row['logo_url'] as string | null) ?? null,
    tax_number: (row['tax_number'] as string | null) ?? null,
    printer_type: String(row['printer_type'] ?? 'THERMAL_80MM'),
    connection_type: String(row['connection_type'] ?? 'BROWSER_PRINT'),
    paper_width: String(row['paper_width'] ?? '80mm'),
    font_family: String(row['font_family'] ?? 'sans-serif'),
    font_size: Number(row['font_size'] ?? 12),
    margin_top: Number(row['margin_top'] ?? 0),
    margin_bottom: Number(row['margin_bottom'] ?? 0),
    margin_left: Number(row['margin_left'] ?? 0),
    margin_right: Number(row['margin_right'] ?? 0),
    show_logo: Number(row['show_logo'] ?? 1) === 1,
    show_shop_info: Number(row['show_shop_info'] ?? 1) === 1,
    show_barcode: Number(row['show_barcode'] ?? 1) === 1,
    show_qr: Number(row['show_qr'] ?? 0) === 1,
    show_tax: Number(row['show_tax'] ?? 0) === 1,
    show_discount: Number(row['show_discount'] ?? 1) === 1,
    auto_print: Number(row['auto_print'] ?? 0) === 1,
    print_copy_count: Number(row['print_copy_count'] ?? 1),
    return_policy: (row['return_policy'] as string | null) ?? 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
    warranty_instructions: (row['warranty_instructions'] as string | null) ?? 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
    footer_text: (row['footer_text'] as string | null) ?? 'Thank you for shopping with us!',
    updated_at: String(row['updated_at'] ?? new Date().toISOString()),
  };
}

export async function getInvoicePrinterSettings(
  pool: Pool,
  branchId?: string | null
): Promise<DbInvoicePrinterSettings> {
  const bId = branchId?.trim() || DEFAULT_MAIN_BRANCH_ID;

  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_printer_settings (
      branch_id TEXT PRIMARY KEY,
      shop_name TEXT NOT NULL DEFAULT 'Niazi Mobile Mart',
      branch_name TEXT NOT NULL DEFAULT 'Main Branch',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      secondary_phone TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      email TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      printer_type TEXT NOT NULL DEFAULT 'THERMAL_80MM',
      connection_type TEXT NOT NULL DEFAULT 'BROWSER_PRINT',
      paper_width TEXT NOT NULL DEFAULT '80mm',
      font_family TEXT NOT NULL DEFAULT 'sans-serif',
      font_size INT NOT NULL DEFAULT 12,
      margin_top INT NOT NULL DEFAULT 0,
      margin_bottom INT NOT NULL DEFAULT 0,
      margin_left INT NOT NULL DEFAULT 0,
      margin_right INT NOT NULL DEFAULT 0,
      show_logo INT NOT NULL DEFAULT 1,
      show_shop_info INT NOT NULL DEFAULT 1,
      show_barcode INT NOT NULL DEFAULT 1,
      show_qr INT NOT NULL DEFAULT 0,
      show_tax INT NOT NULL DEFAULT 0,
      show_discount INT NOT NULL DEFAULT 1,
      auto_print INT NOT NULL DEFAULT 0,
      print_copy_count INT NOT NULL DEFAULT 1,
      return_policy TEXT DEFAULT 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
      warranty_instructions TEXT DEFAULT 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
      footer_text TEXT DEFAULT 'Thank you for shopping with us!',
      updated_at TEXT NOT NULL
    )
  `);

  const res = await pool.query('SELECT * FROM invoice_printer_settings WHERE branch_id = $1', [bId]);
  if (res.rows.length > 0) {
    return mapRowToSettings(res.rows[0]);
  }

  // Fetch branch details from branches table if present
  let branchName = 'Main Branch';
  try {
    const branchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [bId]);
    if (branchRes.rows.length > 0 && branchRes.rows[0]?.['name']) {
      branchName = branchRes.rows[0]['name'] as string;
    }
  } catch {}

  const now = new Date().toISOString();
  // Insert default row for branch
  await pool.query(
    `INSERT INTO invoice_printer_settings (
       branch_id, shop_name, branch_name, address, phone, secondary_phone, whatsapp, email, logo_url, tax_number,
       printer_type, connection_type, paper_width, font_family, font_size,
       margin_top, margin_bottom, margin_left, margin_right,
       show_logo, show_shop_info, show_barcode, show_qr, show_tax, show_discount,
       auto_print, print_copy_count, return_policy, warranty_instructions, footer_text, updated_at
     ) VALUES (
       $1, 'Niazi Mobile Mart', $2, '', '', '', '', '', '', '',
       'THERMAL_80MM', 'BROWSER_PRINT', '80mm', 'sans-serif', 12,
       0, 0, 0, 0,
       1, 1, 1, 0, 0, 1,
       0, 1, 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
       'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
       'Thank you for shopping with us!', $3
     ) ON CONFLICT (branch_id) DO NOTHING`,
    [bId, branchName, now]
  );

  const res2 = await pool.query('SELECT * FROM invoice_printer_settings WHERE branch_id = $1', [bId]);
  if (res2.rows.length > 0) {
    return mapRowToSettings(res2.rows[0]);
  }

  return {
    branch_id: bId,
    shop_name: 'Niazi Mobile Mart',
    branch_name: branchName,
    address: '',
    phone: '',
    secondary_phone: '',
    whatsapp: '',
    email: '',
    logo_url: '',
    tax_number: '',
    printer_type: 'THERMAL_80MM',
    connection_type: 'BROWSER_PRINT',
    paper_width: '80mm',
    font_family: 'sans-serif',
    font_size: 12,
    margin_top: 0,
    margin_bottom: 0,
    margin_left: 0,
    margin_right: 0,
    show_logo: true,
    show_shop_info: true,
    show_barcode: true,
    show_qr: false,
    show_tax: false,
    show_discount: true,
    auto_print: false,
    print_copy_count: 1,
    return_policy: 'Goods once sold can only be returned/exchanged within 3 days with original receipt.',
    warranty_instructions: 'Warranty claims require original invoice. Physical or liquid damage voids warranty.',
    footer_text: 'Thank you for shopping with us!',
    updated_at: now,
  };
}

export async function saveInvoicePrinterSettings(
  pool: Pool,
  branchId: string | null | undefined,
  dto: Partial<DbInvoicePrinterSettings>
): Promise<DbInvoicePrinterSettings> {
  const current = await getInvoicePrinterSettings(pool, branchId);
  const updated: DbInvoicePrinterSettings = {
    ...current,
    ...dto,
    updated_at: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO invoice_printer_settings (
       branch_id, shop_name, branch_name, address, phone, secondary_phone, whatsapp, email, logo_url, tax_number,
       printer_type, connection_type, paper_width, font_family, font_size,
       margin_top, margin_bottom, margin_left, margin_right,
       show_logo, show_shop_info, show_barcode, show_qr, show_tax, show_discount,
       auto_print, print_copy_count, return_policy, warranty_instructions, footer_text, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15,
       $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25,
       $26, $27, $28, $29, $30, $31
     )
     ON CONFLICT (branch_id) DO UPDATE SET
       shop_name = EXCLUDED.shop_name,
       branch_name = EXCLUDED.branch_name,
       address = EXCLUDED.address,
       phone = EXCLUDED.phone,
       secondary_phone = EXCLUDED.secondary_phone,
       whatsapp = EXCLUDED.whatsapp,
       email = EXCLUDED.email,
       logo_url = EXCLUDED.logo_url,
       tax_number = EXCLUDED.tax_number,
       printer_type = EXCLUDED.printer_type,
       connection_type = EXCLUDED.connection_type,
       paper_width = EXCLUDED.paper_width,
       font_family = EXCLUDED.font_family,
       font_size = EXCLUDED.font_size,
       margin_top = EXCLUDED.margin_top,
       margin_bottom = EXCLUDED.margin_bottom,
       margin_left = EXCLUDED.margin_left,
       margin_right = EXCLUDED.margin_right,
       show_logo = EXCLUDED.show_logo,
       show_shop_info = EXCLUDED.show_shop_info,
       show_barcode = EXCLUDED.show_barcode,
       show_qr = EXCLUDED.show_qr,
       show_tax = EXCLUDED.show_tax,
       show_discount = EXCLUDED.show_discount,
       auto_print = EXCLUDED.auto_print,
       print_copy_count = EXCLUDED.print_copy_count,
       return_policy = EXCLUDED.return_policy,
       warranty_instructions = EXCLUDED.warranty_instructions,
       footer_text = EXCLUDED.footer_text,
       updated_at = EXCLUDED.updated_at`,
    [
      updated.branch_id,
      updated.shop_name,
      updated.branch_name,
      updated.address,
      updated.phone,
      updated.secondary_phone ?? null,
      updated.whatsapp ?? null,
      updated.email ?? null,
      updated.logo_url ?? null,
      updated.tax_number ?? null,
      updated.printer_type,
      updated.connection_type,
      updated.paper_width,
      updated.font_family,
      updated.font_size,
      updated.margin_top,
      updated.margin_bottom,
      updated.margin_left,
      updated.margin_right,
      updated.show_logo ? 1 : 0,
      updated.show_shop_info ? 1 : 0,
      updated.show_barcode ? 1 : 0,
      updated.show_qr ? 1 : 0,
      updated.show_tax ? 1 : 0,
      updated.show_discount ? 1 : 0,
      updated.auto_print ? 1 : 0,
      updated.print_copy_count,
      updated.return_policy,
      updated.warranty_instructions,
      updated.footer_text,
      updated.updated_at,
    ]
  );

  return updated;
}
