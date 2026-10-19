/**
 * Mobile Inventory — Validation (Phase C)
 *
 * Defines domain constraint constants, type guards, and validation helpers
 * for the Mobile Inventory domain. Used by Phase C route handlers to validate
 * request bodies before invoking MobileRepo transactions.
 *
 * F-01 (monetary validation): pricesAreEqual() uses integer-paisas comparison
 * (Math.round(n * 100)) to avoid IEEE-754 rounding boundary errors. toPaisas()
 * is the shared converter for all monetary equality checks.
 *
 * No new runtime dependency is introduced. All validation uses plain TypeScript
 * and string operations consistent with the project's existing inline style.
 */

// ---------------------------------------------------------------------------
// Allowed vocabulary (mirrors migration 037 CHECK constraints)
// ---------------------------------------------------------------------------

export const MOBILE_PTA_STATUSES = ['PTA_APPROVED', 'NON_PTA', 'JV', 'GEVEY'] as const;
export type MobilePtaStatus = typeof MOBILE_PTA_STATUSES[number];

export const MOBILE_CONDITIONS = ['NEW', 'USED'] as const;
export type MobileCondition = typeof MOBILE_CONDITIONS[number];

/** Phase B current-status vocabulary. RETURNED and TRANSFERRED are excluded. */
export const MOBILE_STATUSES = ['IN_STOCK', 'INSPECTION', 'SOLD'] as const;
export type MobileStatus = typeof MOBILE_STATUSES[number];

export const MOBILE_SLOTS = ['IMEI1', 'IMEI2'] as const;
export type MobileSlot = typeof MOBILE_SLOTS[number];

export const MOBILE_BODY_GRADES = ['PRISTINE', 'GOOD', 'HEAVY_WEAR', 'DENTED'] as const;
export type MobileBodyGrade = typeof MOBILE_BODY_GRADES[number];

export const MOBILE_SCREEN_CONDITIONS = ['ORIGINAL', 'REPLACED', 'CRACKED'] as const;
export type MobileScreenCondition = typeof MOBILE_SCREEN_CONDITIONS[number];

// ---------------------------------------------------------------------------
// Permitted status transitions (Phase C PATCH)
// IN_STOCK ↔ INSPECTION only. SOLD is terminal.
// ---------------------------------------------------------------------------

export const PERMITTED_STATUS_TRANSITIONS: Record<MobileStatus, MobileStatus[]> = {
  IN_STOCK:   ['INSPECTION'],
  INSPECTION: ['IN_STOCK'],
  SOLD:       [],
};

export function isPermittedStatusTransition(from: MobileStatus, to: MobileStatus): boolean {
  return PERMITTED_STATUS_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// IMEI validation
// ---------------------------------------------------------------------------

/** Returns true if value is exactly 15 decimal digits. */
export function isValidImei(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{15}$/.test(value);
}

// ---------------------------------------------------------------------------
// CNIC validation (Pakistani National Identity Card)
// Format: DDDDD-DDDDDDD-D
// ---------------------------------------------------------------------------

/** Returns true if value matches the CNIC pattern DDDDD-DDDDDDD-D. */
export function isValidCnic(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5}-\d{7}-\d$/.test(value);
}

// ---------------------------------------------------------------------------
// Voucher validation
// ---------------------------------------------------------------------------

/** Returns true if value is a non-blank string. */
export function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Price validation helpers
// ---------------------------------------------------------------------------

/**
 * Maximum monetary value representable in PostgreSQL NUMERIC(12,2) in integer paisas.
 * Precision 12 with scale 2 supports up to 9,999,999,999.99 PKR = 999,999,999,999 paisas.
 */
export const MAX_MONETARY_PAISAS = 999_999_999_999;

/**
 * Strict decimal-safe paisa parser.
 * Requires a finite non-negative number or string matching strictly 0, 1, or 2 decimal places.
 * Rejects sub-cent values (e.g. 100.501), malformed strings (100.50foo, "", "   "),
 * negative values, non-finite numbers, and values exceeding NUMERIC(12,2) range.
 * Supports IEEE-754 micro-drift tolerance (1e-9) for floating-point calculations like 0.1 + 0.2.
 * Returns integer paisas (rupees * 100 + paisas) or null if invalid.
 */
export function parseExactPaisa(value: unknown): number | null {
  let str: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    str = (Math.abs(value) < 1e-12 ? 0 : value).toString();
    if (!/^\d+(\.\d{1,2})?$/.test(str)) {
      // Tolerate IEEE-754 floating-point micro-drift (e.g. 0.1 + 0.2 === 0.30000000000000004)
      const fixed = value.toFixed(2);
      if (Math.abs(Number(fixed) - value) < 1e-9) {
        str = fixed;
      } else {
        return null;
      }
    }
  } else if (typeof value === 'string') {
    str = value.trim();
    if (!str || !/^\d+(\.\d{1,2})?$/.test(str)) return null;
  } else {
    return null;
  }

  const [rupees, paisas = ''] = str.split('.');
  // NUMERIC(12,2) supports at most 10 integer digits
  if (rupees.length > 10) return null;

  const paddedPaisas = (paisas + '00').slice(0, 2);
  const total = Number(rupees) * 100 + Number(paddedPaisas);
  if (!Number.isSafeInteger(total) || total > MAX_MONETARY_PAISAS) return null;
  return total;
}

/**
 * Returns true if the value can be parsed as a non-negative decimal-safe price (up to 2 decimals).
 * Valid: "0", "100", "1500.50", 0, 100
 * Invalid: NaN, -1, Infinity, objects, "", "   ", "100.501", "100.50foo"
 */
export function isNonNegativePrice(value: unknown): boolean {
  return parseExactPaisa(value) !== null;
}

/**
 * Returns true if the value is a positive price (> 0) with at most 2 decimal places.
 */
export function isPositivePrice(value: unknown): boolean {
  const p = parseExactPaisa(value);
  return p !== null && p > 0;
}

/**
 * Converts a validated price value to integer paisas (NUMERIC(12,2) × 100).
 * Returns NaN if the value cannot be represented as a valid non-negative 2-decimal price.
 * Used for all monetary comparisons in registration validation (F-01).
 */
export function toPaisas(value: unknown): number {
  const p = parseExactPaisa(value);
  return p !== null ? p : NaN;
}

/**
 * Decimal-safe equality check for USED-phone price rule:
 * cost_price and purchase_price must be exactly equal.
 *
 * Enforces strict 2-decimal validation via parseExactPaisa:
 * Rejects sub-cent differences, empty strings, and malformed inputs.
 *
 * Phase C registration MUST call this before persisting a USED device.
 */
export function pricesAreEqual(a: unknown, b: unknown): boolean {
  const pa = parseExactPaisa(a);
  const pb = parseExactPaisa(b);
  if (pa === null || pb === null) return false;
  return pa === pb;
}

// ---------------------------------------------------------------------------
// Supplier linkage rules (Phase C enforcement)
// ---------------------------------------------------------------------------

/**
 * Returns a validation error string if supplier_id violates the phone-type rule,
 * or null if valid.
 *
 * Rules:
 *   - USED phones: supplier_id must be absent (null / undefined).
 *   - NEW phones: supplier_id is optional; if provided it must be a non-blank string.
 *     Phase C must additionally verify the supplier exists and is active.
 */
export function validateSupplierLinkage(
  condition: MobileCondition,
  supplierId: unknown
): string | null {
  if (condition === 'USED') {
    if (supplierId !== null && supplierId !== undefined) {
      return 'supplier_id must be absent for USED phones; use purchase paperwork for seller identity';
    }
    return null;
  }
  // NEW phones
  if (supplierId === null || supplierId === undefined) {
    return null; // optional
  }
  if (!isNonBlankString(supplierId)) {
    return 'supplier_id must be a non-blank string when provided';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Battery health validation
// ---------------------------------------------------------------------------

/**
 * Returns true if battery_health_percent is a valid integer between 1 and 100,
 * or null/undefined (field is optional).
 */
export function isValidBatteryHealth(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'number' || !Number.isInteger(value)) return false;
  return value >= 1 && value <= 100;
}

// ---------------------------------------------------------------------------
// Update field whitelist (Phase C PATCH)
// Fields that Phase C permits to be updated on an existing device.
// Immutable fields (id, organization_id, branch_id, condition, cost_price,
// created_by, created_at, supplier_id for NEW once set, sale_id) are NOT in this list.
// ---------------------------------------------------------------------------

export const MOBILE_PATCH_ALLOWED_FIELDS = [
  'status',
  'expected_sale_price',
  'notes',
  'updated_by',
  'updated_at',
  'pta_status',
] as const;

export type MobilePatchAllowedField = typeof MOBILE_PATCH_ALLOWED_FIELDS[number];
