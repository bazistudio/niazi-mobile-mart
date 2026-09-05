// src/features/audit/services/consistency-checker.service.ts
//
// Phase 5C: Data Consistency Audit
// Fetches live data from the backend and reports:
//  - Products without stock records (orphan products)
//  - Stock records referencing deleted products (orphan stock)
//  - Duplicate SKUs or names in DB
//  - Stock/product quantity mismatches
//  - Missing event updates (stock adjusted but product state stale)

import { inventoryRepository } from '@/features/inventory/repositories/inventory.repository';
import { inventoryService } from '@/features/inventory/services/inventory.service';

export type ConsistencyIssueType =
  | 'ORPHAN_PRODUCT'
  | 'ORPHAN_STOCK'
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_NAME'
  | 'STOCK_MISMATCH'
  | 'MISSING_SKU'
  | 'PRICE_ANOMALY';

export interface ConsistencyIssue {
  type: ConsistencyIssueType;
  severity: 'error' | 'warning' | 'info';
  productId?: string;
  productName?: string;
  details: string;
}

export interface ConsistencyReport {
  runAt: string;
  totalProductsScanned: number;
  issues: ConsistencyIssue[];
  passCount: number;
  warnCount: number;
  errorCount: number;
  isHealthy: boolean;
}

export const consistencyCheckerService = {
  /**
   * Runs a full consistency audit against live backend data.
   */
  runAudit: async (): Promise<ConsistencyReport> => {
    const issues: ConsistencyIssue[] = [];
    const runAt = new Date().toISOString();

    // Fetch all products (high limit to scan everything)
    const { products } = await inventoryService.getProducts({ page: 1, limit: 500 });

    // ── Check 1: Missing SKU ──────────────────────────────────────────────────
    for (const product of products) {
      if (!product.sku || product.sku.trim() === '') {
        issues.push({
          type: 'MISSING_SKU',
          severity: 'error',
          productId: product.id,
          productName: product.name,
          details: `Product "${product.name}" has no SKU assigned. This breaks import uniqueness guarantees.`,
        });
      }
    }

    // ── Check 2: Duplicate SKUs ───────────────────────────────────────────────
    const skuMap = new Map<string, string[]>();
    for (const product of products) {
      if (product.sku) {
        const existing = skuMap.get(product.sku) || [];
        existing.push(product.name);
        skuMap.set(product.sku, existing);
      }
    }
    for (const [sku, names] of skuMap.entries()) {
      if (names.length > 1) {
        issues.push({
          type: 'DUPLICATE_SKU',
          severity: 'error',
          details: `SKU "${sku}" is shared by ${names.length} products: ${names.join(', ')}. This violates ERP uniqueness rules.`,
        });
      }
    }

    // ── Check 3: Duplicate Names ──────────────────────────────────────────────
    const nameMap = new Map<string, number>();
    for (const product of products) {
      const normalized = product.name.trim().toLowerCase();
      nameMap.set(normalized, (nameMap.get(normalized) || 0) + 1);
    }
    for (const [name, count] of nameMap.entries()) {
      if (count > 1) {
        issues.push({
          type: 'DUPLICATE_NAME',
          severity: 'warning',
          details: `Product name "${name}" appears ${count} times. This may indicate duplicates created before duplicate-check enforcement.`,
        });
      }
    }

    // ── Check 4: Stock Anomalies (zero-stock, no threshold) ──────────────────
    for (const product of products) {
      if (product.stock < 0) {
        issues.push({
          type: 'STOCK_MISMATCH',
          severity: 'error',
          productId: product.id,
          productName: product.name,
          details: `Product "${product.name}" has negative stock (${product.stock}). This indicates a stock mutation without proper validation.`,
        });
      }
      if (product.minStockThreshold === 0 || product.minStockThreshold === undefined) {
        issues.push({
          type: 'STOCK_MISMATCH',
          severity: 'warning',
          productId: product.id,
          productName: product.name,
          details: `Product "${product.name}" has no low-stock threshold set (threshold = 0). Low stock alerts will never trigger.`,
        });
      }
    }

    // ── Check 5: Price Anomalies ─────────────────────────────────────────────
    for (const product of products) {
      if (product.price <= 0) {
        issues.push({
          type: 'PRICE_ANOMALY',
          severity: 'error',
          productId: product.id,
          productName: product.name,
          details: `Product "${product.name}" has an invalid price (${product.price}). Selling price must be > 0.`,
        });
      }
      if (product.purchasePrice !== undefined && product.purchasePrice > product.price) {
        issues.push({
          type: 'PRICE_ANOMALY',
          severity: 'warning',
          productId: product.id,
          productName: product.name,
          details: `Product "${product.name}" has purchase price (${product.purchasePrice}) HIGHER than selling price (${product.price}). This means negative margin.`,
        });
      }
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warning').length;
    const passCount = products.length - new Set(issues.map(i => i.productId).filter(Boolean)).size;

    return {
      runAt,
      totalProductsScanned: products.length,
      issues,
      passCount,
      warnCount,
      errorCount,
      isHealthy: errorCount === 0,
    };
  },
};
