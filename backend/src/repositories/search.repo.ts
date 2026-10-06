/**
 * TypeScript repository for Unified Multi-Domain Global Search
 * Provides authoritative PostgreSQL search across Products (including Compatible Models),
 * Customers, Suppliers, and Invoices.
 */

import { Pool } from 'pg';
import { normalizeModelName } from './product.repo';

export interface GlobalSearchItem {
  id: string;
  _id?: string;
  type: 'product' | 'customer' | 'supplier' | 'invoice';
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  salePrice?: number;
  purchasePrice?: number;
  costPrice?: number;
  quantity?: number;
  stock?: number;
  mobile?: string;
  accountCode?: string;
  companyName?: string;
  phone?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  match_type?: string;
  matched_value?: string;
}

export interface GlobalSearchResultDto {
  products: GlobalSearchItem[];
  customers: GlobalSearchItem[];
  suppliers: GlobalSearchItem[];
  invoices: GlobalSearchItem[];
}

export async function globalSearch(
  pool: Pool,
  query: string,
  branchId?: string | null,
  category: string = 'quick'
): Promise<GlobalSearchResultDto> {
  const result: GlobalSearchResultDto = {
    products: [],
    customers: [],
    suppliers: [],
    invoices: [],
  };

  const term = query.trim();
  if (!term || term.length < 1) {
    return result;
  }

  const ilikeTerm = `%${term}%`;
  const normalizedTerm = `%${normalizeModelName(term)}%`;
  const isAll = category === 'quick' || !category;

  // 1. PRODUCTS SEARCH (Name, SKU, Barcode, or Compatible Model)
  if (isAll || category === 'product') {
    try {
      const productQuery = `
        SELECT 
          p.id, p.name, p.sku, p.barcode, p.sale_price, p.purchase_price, p.low_stock_threshold,
          COALESCE(s.quantity, 0) AS stock,
          pcm.model_name AS matched_compatible_model
        FROM products p
        LEFT JOIN stock s ON s.product_id = p.id AND ($2::text IS NULL OR s.branch_id::text = $2::text)
        LEFT JOIN product_compatible_models pcm ON pcm.product_id = p.id AND (pcm.model_name ILIKE $1 OR pcm.normalized_model ILIKE $3)
        WHERE (p.is_active::text = '1' OR p.is_active::text = 'true')
          AND (
            p.name ILIKE $1 
            OR p.sku ILIKE $1 
            OR p.barcode ILIKE $1 
            OR pcm.id IS NOT NULL
          )
        ORDER BY 
          CASE 
            WHEN p.barcode ILIKE $1 THEN 1
            WHEN p.sku ILIKE $1 THEN 2
            WHEN p.name ILIKE $1 THEN 3
            ELSE 4
          END, p.name ASC
        LIMIT 25
      `;
      const pRes = await pool.query(productQuery, [ilikeTerm, branchId || null, normalizedTerm]);

      // Deduplicate products (in case multiple compatible models match)
      const seenIds = new Set<string>();
      for (const r of pRes.rows) {
        if (seenIds.has(r.id)) continue;
        seenIds.add(r.id);

        let matchType = 'PRODUCT_NAME';
        let matchedValue = r.name;

        if (r.barcode && r.barcode.toLowerCase().includes(term.toLowerCase())) {
          matchType = 'BARCODE';
          matchedValue = r.barcode;
        } else if (r.sku && r.sku.toLowerCase().includes(term.toLowerCase())) {
          matchType = 'SKU';
          matchedValue = r.sku;
        } else if (r.matched_compatible_model) {
          matchType = 'COMPATIBLE_MODEL';
          matchedValue = r.matched_compatible_model;
        }

        result.products.push({
          id: r.id,
          _id: r.id,
          type: 'product',
          name: r.name,
          sku: r.sku,
          barcode: r.barcode,
          price: Number(r.sale_price || 0),
          salePrice: Number(r.sale_price || 0),
          purchasePrice: Number(r.purchase_price || 0),
          costPrice: Number(r.purchase_price || 0),
          quantity: Number(r.stock || 0),
          stock: Number(r.stock || 0),
          match_type: matchType,
          matched_value: matchedValue,
        });
      }
    } catch (err) {
      console.warn('[search.repo] Product search error:', err);
    }
  }

  // 2. CUSTOMERS SEARCH (Name, Mobile, Account Code)
  if (isAll || category === 'customer') {
    try {
      const custRes = await pool.query(
        `SELECT id, name, mobile, account_code
         FROM customers
         WHERE (is_active::text = '1' OR is_active::text = 'true')
           AND ($2::text IS NULL OR branch_id::text = $2::text)
           AND (name ILIKE $1 OR mobile ILIKE $1 OR account_code ILIKE $1)
         ORDER BY name ASC
         LIMIT 15`,
        [ilikeTerm, branchId || null]
      );

      for (const r of custRes.rows) {
        result.customers.push({
          id: r.id,
          _id: r.id,
          type: 'customer',
          name: r.name,
          mobile: r.mobile,
          accountCode: r.account_code,
        });
      }
    } catch (err) {
      console.warn('[search.repo] Customer search error:', err);
    }
  }

  // 3. SUPPLIERS SEARCH (Name, Company, Phone)
  if (isAll || category === 'supplier') {
    try {
      const suppRes = await pool.query(
        `SELECT id, name, company_name, phone
         FROM suppliers
         WHERE (is_active::text = '1' OR is_active::text = 'true')
           AND ($2::text IS NULL OR branch_id::text = $2::text)
           AND (name ILIKE $1 OR company_name ILIKE $1 OR phone ILIKE $1)
         ORDER BY name ASC
         LIMIT 15`,
        [ilikeTerm, branchId || null]
      );

      for (const r of suppRes.rows) {
        result.suppliers.push({
          id: r.id,
          _id: r.id,
          type: 'supplier',
          name: r.name,
          companyName: r.company_name,
          phone: r.phone,
        });
      }
    } catch (err) {
      console.warn('[search.repo] Supplier search error:', err);
    }
  }

  // 4. INVOICES / SALES SEARCH (Invoice Number, Customer Name Snapshot)
  if (isAll || category === 'invoice') {
    try {
      const invRes = await pool.query(
        `SELECT id, invoice_number, customer_name_snapshot, total_amount, created_at
         FROM sales
         WHERE ($2::text IS NULL OR branch_id::text = $2::text)
           AND (invoice_number ILIKE $1 OR customer_name_snapshot ILIKE $1)
         ORDER BY created_at DESC
         LIMIT 15`,
        [ilikeTerm, branchId || null]
      );

      for (const r of invRes.rows) {
        result.invoices.push({
          id: r.id,
          _id: r.id,
          type: 'invoice',
          name: r.invoice_number,
          invoiceNumber: r.invoice_number,
          totalAmount: Number(r.total_amount || 0),
        });
      }
    } catch (err) {
      console.warn('[search.repo] Invoice search error:', err);
    }
  }

  return result;
}
