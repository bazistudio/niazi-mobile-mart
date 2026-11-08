/**
 * TypeScript repository for Unified Multi-Domain Global Search
 * Phase 1: Organization-wide Product & Warehouse Stock Search for all users and branches.
 */

import { Pool } from 'pg';
import { normalizeModelName } from './product.repo';
import { CENTRAL_WAREHOUSE_ID } from '../auth';

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
  branchStock?: number;
  warehouseStock?: number;
  totalStock?: number;
  brand?: string;
  company?: string;
  quality?: string;
  color?: string;
  compatibleModels?: string[];
  mobile?: string;
  accountCode?: string;
  companyName?: string;
  phone?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  customerName?: string;
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

  // 1. PRODUCTS SEARCH
  // Organization-wide Product & Warehouse Stock Search for all users and branches.
  if (isAll || category === 'product') {
    try {
      const productQuery = `
        SELECT 
          p.id,
          p.name,
          p.sku,
          p.barcode,
          p.sale_price,
          p.purchase_price,
          p.low_stock_threshold,
          b.name AS brand_name,
          cmp.name AS company_name,
          q.name AS quality_name,
          c.name AS color_name,
          COALESCE(s_agg.total_stock, 0)::bigint AS total_stock,
          COALESCE(s_agg.warehouse_stock, 0)::bigint AS warehouse_stock,
          COALESCE(s_agg.branch_stock, 0)::bigint AS branch_stock,
          (
            SELECT pcm.model_name
            FROM product_compatible_models pcm
            WHERE pcm.product_id = p.id
              AND (pcm.model_name ILIKE $1 OR pcm.normalized_model ILIKE $3)
            LIMIT 1
          ) AS matched_compatible_model,
          COALESCE(
            ARRAY(
              SELECT pcm2.model_name
              FROM product_compatible_models pcm2
              WHERE pcm2.product_id = p.id
              ORDER BY pcm2.model_name
            ),
            ARRAY[]::text[]
          ) AS compatible_models
        FROM products p
        LEFT JOIN (
          SELECT
            product_id,
            SUM(quantity)::bigint AS total_stock,
            SUM(CASE WHEN branch_id::text = $4::text THEN quantity ELSE 0 END)::bigint AS warehouse_stock,
            SUM(CASE WHEN $2::text IS NOT NULL AND branch_id::text = $2::text THEN quantity ELSE 0 END)::bigint AS branch_stock
          FROM stock
          GROUP BY product_id
        ) s_agg ON s_agg.product_id = p.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN companies cmp ON p.company_id = cmp.id
        LEFT JOIN qualities q ON p.quality_id = q.id
        LEFT JOIN colors c ON p.color_id = c.id
        WHERE (p.is_active::text = '1' OR p.is_active::text = 'true')
          AND (
            p.name ILIKE $1 
            OR p.sku ILIKE $1 
            OR p.barcode ILIKE $1 
            OR b.name ILIKE $1
            OR cmp.name ILIKE $1
            OR q.name ILIKE $1
            OR c.name ILIKE $1
            OR EXISTS (
              SELECT 1 FROM product_compatible_models pcm_sub
              WHERE pcm_sub.product_id = p.id
                AND (pcm_sub.model_name ILIKE $1 OR pcm_sub.normalized_model ILIKE $3)
            )
          )
        ORDER BY 
          CASE 
            WHEN p.barcode ILIKE $1 THEN 1
            WHEN p.sku ILIKE $1 THEN 2
            WHEN p.name ILIKE $1 THEN 3
            ELSE 4
          END,
          COALESCE(s_agg.total_stock, 0) DESC,
          p.name ASC
        LIMIT 25
      `;

      const pRes = await pool.query(productQuery, [
        ilikeTerm,
        branchId || null,
        normalizedTerm,
        CENTRAL_WAREHOUSE_ID,
      ]);

      for (const r of pRes.rows) {
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

        const totalStock = Number(r.total_stock || 0);
        const warehouseStock = Number(r.warehouse_stock || 0);
        const branchStock = branchId ? Number(r.branch_stock || 0) : totalStock;

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
          quantity: branchStock,
          stock: branchStock,
          branchStock,
          warehouseStock,
          totalStock,
          brand: r.brand_name ?? undefined,
          company: r.company_name ?? undefined,
          quality: r.quality_name ?? undefined,
          color: r.color_name ?? undefined,
          compatibleModels: Array.isArray(r.compatible_models) ? r.compatible_models : [],
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
          customerName: r.customer_name_snapshot ?? undefined,
          totalAmount: Number(r.total_amount || 0),
        });
      }
    } catch (err) {
      console.warn('[search.repo] Invoice search error:', err);
    }
  }

  return result;
}
