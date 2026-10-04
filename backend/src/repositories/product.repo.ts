/**
 * TypeScript translation of src-tauri/src/repositories/postgres_product_repo.rs
 *
 * Behavior-preserving port. No new logic. All SQL, error messages, field defaults,
 * is_active integer encoding, SKU algorithm, and transaction semantics are identical
 * to the Rust implementation.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// --- Domain Types ---

export interface Product {
  id: string;
  name: string;
  normalized_name: string;
  sku: string;
  barcode: string | null;
  category_id: string;
  brand_id: string | null;
  company_id: string | null;
  quality_id: string | null;
  color_id: string | null;
  unit_id: string | null;
  purchase_price: number;
  average_cost: number;
  sale_price: number;
  low_stock_threshold: number;
  is_active: boolean;
  description: string | null;
  initial_quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductDto {
  name: string;
  sku: string;
  barcode?: string | null;
  category_id: string;
  brand_id?: string | null;
  company_id?: string | null;
  quality_id?: string | null;
  color_id?: string | null;
  unit_id?: string | null;
  purchase_price: number;
  average_cost?: number | null;
  sale_price: number;
  low_stock_threshold?: number | null;
  description?: string | null;
  initial_quantity?: number | null;
  branch_id?: string | null;
}

export interface UpdateProductDto {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  company_id?: string | null;
  quality_id?: string | null;
  color_id?: string | null;
  unit_id?: string | null;
  purchase_price?: number | null;
  average_cost?: number | null;
  sale_price?: number | null;
  low_stock_threshold?: number | null;
  description?: string | null;
  is_active?: boolean | null;
}

export interface ProductListFilter {
  search?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  company_id?: string | null;
  quality_id?: string | null;
  color_id?: string | null;
  is_active?: boolean | null;
}

// --- Repository Errors ---

export class RepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

// --- Utilities ---

const SELECT_COLS = `
  id, name, normalized_name, sku, barcode, type_id AS category_id,
  brand_id, company_id, quality_id, color_id, unit_id,
  purchase_price, average_cost, sale_price, low_stock_threshold,
  is_active, description, created_at, updated_at
`;

/**
 * Maps a raw pg row to Product.
 * is_active stored as integer 0/1. Rust reads as i32 and compares == 1.
 */
function mapProductRow(row: Record<string, unknown>): Product {
  const isActiveRaw = row['is_active'];
  const isActiveInt =
    typeof isActiveRaw === 'number'
      ? isActiveRaw
      : typeof isActiveRaw === 'string'
        ? parseInt(isActiveRaw, 10)
        : Number(isActiveRaw);

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    normalized_name: row['normalized_name'] as string,
    sku: row['sku'] as string,
    barcode: (row['barcode'] as string | null) ?? null,
    category_id: row['category_id'] as string,
    brand_id: (row['brand_id'] as string | null) ?? null,
    company_id: (row['company_id'] as string | null) ?? null,
    quality_id: (row['quality_id'] as string | null) ?? null,
    color_id: (row['color_id'] as string | null) ?? null,
    unit_id: (row['unit_id'] as string | null) ?? null,
    purchase_price: Number(row['purchase_price']),
    average_cost: Number(row['average_cost']),
    sale_price: Number(row['sale_price']),
    low_stock_threshold: Number(row['low_stock_threshold']),
    is_active: isActiveInt === 1,
    description: (row['description'] as string | null) ?? null,
    initial_quantity: null,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

/**
 * Mirrors normalizeProductName() in frontend/src/core/domain/product.ts.
 */
export function normalizeProductName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

const NOW_ISO = () => new Date().toISOString();

// --- SKU Resolution ---

/**
 * Resolves the effective SKU for a new product.
 * Faithful translation of resolve_product_sku() in postgres_product_repo.rs.
 * Executes on Pool outside the product insertion transaction to prevent
 * query failures from poisoning the main transaction.
 */
export async function resolveProductSku(
  pool: Pool,
  categoryId: string,
  inputSku: string
): Promise<string> {
  const trimmed = inputSku.trim().toUpperCase();

  if (trimmed.length > 0 && !trimmed.startsWith('SKU-') && !trimmed.startsWith('AUTO-')) {
    return trimmed;
  }

  let catName = '';
  let catCode = '';

  try {
    const ptRes = await pool.query<{ name: string; code: string }>(
      'SELECT name, code FROM product_types WHERE id = $1',
      [categoryId]
    );

    if (ptRes.rows.length > 0) {
      catName = ptRes.rows[0]!.name;
      catCode = ptRes.rows[0]!.code ?? '';
    }
    // Note: 'categories' table was renamed to 'product_types' in migration 012.
    // No fallback to 'categories' -- that table no longer exists in the live DB.
  } catch {
    // If product_types lookup fails, default prefix resolution proceeds safely
  }

  const catUpper = `${catName} ${catCode}`.toUpperCase();

  let prefix: string;
  if (catUpper.includes('MOBILE') || catUpper.includes('PHONE') || catUpper.startsWith('M')) {
    prefix = 'M';
  } else if (
    catUpper.includes('ACC') ||
    catUpper.includes('ACCESSOR') ||
    catUpper.startsWith('A')
  ) {
    prefix = 'A';
  } else {
    prefix = 'P';
  }

  const counterRes = await pool.query<{ next_val: string; next_value: string }>(
    `INSERT INTO product_type_counters (prefix, next_value)
     VALUES ($1, 2)
     ON CONFLICT (prefix)
     DO UPDATE SET next_value = product_type_counters.next_value + 1
     RETURNING (next_value - 1) AS next_val`,
    [prefix]
  );

  const row = counterRes.rows[0]!;
  const seq = Number(row['next_val'] ?? row['next_value'] ?? 1);
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

// --- Create Product ---

/**
 * Inserts a new product (no initial stock).
 * Mirrors create_product() in postgres_product_repo.rs.
 */
export async function createProduct(
  pool: Pool,
  id: string,
  dto: CreateProductDto
): Promise<Product> {
  const resolvedSku = await resolveProductSku(pool, dto.category_id, dto.sku);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedName = normalizeProductName(dto.name);
    const barcodeVal =
      dto.barcode && dto.barcode.trim().length > 0 ? dto.barcode.trim() : null;
    const threshold = dto.low_stock_threshold ?? 5;
    const avgCost = dto.average_cost ?? dto.purchase_price;
    const now = NOW_ISO();

    const res = await client.query(
      `INSERT INTO products (
         id, name, normalized_name, sku, barcode, type_id, brand_id,
         company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price,
         low_stock_threshold, is_active, description, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, 1, $16,$17,$18)
       RETURNING ${SELECT_COLS}`,
      [
        id,
        dto.name.trim(),
        normalizedName,
        resolvedSku,
        barcodeVal,
        dto.category_id,
        dto.brand_id ?? null,
        dto.company_id ?? null,
        dto.quality_id ?? null,
        dto.color_id ?? null,
        dto.unit_id ?? null,
        dto.purchase_price,
        avgCost,
        dto.sale_price,
        threshold,
        dto.description ?? null,
        now,
        now,
      ]
    );

    await client.query('COMMIT');
    return mapProductRow(res.rows[0]!);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw mapPgError(err, dto.sku);
  } finally {
    client.release();
  }
}

// --- Create Product With Initial Stock ---

/**
 * Inserts a new product with opening stock in a single transaction.
 * Mirrors create_product_with_initial_stock() in postgres_product_repo.rs.
 *
 * Transaction:
 * 1. INSERT products (is_active = 1)
 * 2. If initial_quantity > 0 AND branch_id is Some:
 *    a. UPSERT stock
 *    b. INSERT stock_movements (reason='Opening Stock', reference_id='OPENING_BALANCE',
 *       movement_type='IN', previous_stock=0)
 */
export async function createProductWithInitialStock(
  pool: Pool,
  id: string,
  dto: CreateProductDto,
  userId: string
): Promise<Product> {
  const resolvedSku = await resolveProductSku(pool, dto.category_id, dto.sku);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedName = normalizeProductName(dto.name);
    const barcodeVal =
      dto.barcode && dto.barcode.trim().length > 0 ? dto.barcode.trim() : null;
    const threshold = dto.low_stock_threshold ?? 5;
    const avgCost = dto.average_cost ?? dto.purchase_price;
    const now = NOW_ISO();

    const insertRes = await client.query(
      `INSERT INTO products (
         id, name, normalized_name, sku, barcode, type_id, brand_id,
         company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price,
         low_stock_threshold, is_active, description, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, 1, $16,$17,$18)
       RETURNING ${SELECT_COLS}`,
      [
        id,
        dto.name.trim(),
        normalizedName,
        resolvedSku,
        barcodeVal,
        dto.category_id,
        dto.brand_id ?? null,
        dto.company_id ?? null,
        dto.quality_id ?? null,
        dto.color_id ?? null,
        dto.unit_id ?? null,
        dto.purchase_price,
        avgCost,
        dto.sale_price,
        threshold,
        dto.description ?? null,
        now,
        now,
      ]
    );

    const product = mapProductRow(insertRes.rows[0]!);
    const qty = dto.initial_quantity ?? 0;
    const branchId = dto.branch_id ?? null;

    if (qty > 0 && branchId !== null) {
      await client.query(
        `INSERT INTO stock (product_id, branch_id, quantity, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
        [id, branchId, qty, now]
      );

      const movementId = uuidv4();
      await client.query(
        `INSERT INTO stock_movements (
           id, product_id, branch_id, movement_type, quantity,
           previous_stock, resulting_stock, reason, performed_by, reference_id, created_at
         ) VALUES ($1, $2, $3, 'IN', $4, 0, $5, 'Opening Stock', $6, 'OPENING_BALANCE', $7)`,
        [movementId, id, branchId, qty, qty, userId, now]
      );
    }

    await client.query('COMMIT');
    return { ...product, initial_quantity: dto.initial_quantity ?? null };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw mapPgError(err, dto.sku);
  } finally {
    client.release();
  }
}

// --- List Products ---

/**
 * Lists products with optional filters.
 * Mirrors list_products() in postgres_product_repo.rs.
 *
 * is_active: if filter.is_active is None -> default active-only (is_active = 1)
 *            if Some(true)  -> is_active = 1
 *            if Some(false) -> is_active = 0
 */
export async function listProducts(pool: Pool, filter: ProductListFilter): Promise<Product[]> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.search) {
    const term = `%${filter.search}%`;
    conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx} OR barcode ILIKE $${idx})`);
    params.push(term);
    idx++;
  }

  if (filter.category_id != null) {
    conditions.push(`type_id = $${idx}`);
    params.push(filter.category_id);
    idx++;
  }

  if (filter.brand_id != null) {
    conditions.push(`brand_id = $${idx}`);
    params.push(filter.brand_id);
    idx++;
  }

  if (filter.company_id != null) {
    conditions.push(`company_id = $${idx}`);
    params.push(filter.company_id);
    idx++;
  }

  if (filter.quality_id != null) {
    conditions.push(`quality_id = $${idx}`);
    params.push(filter.quality_id);
    idx++;
  }

  if (filter.color_id != null) {
    conditions.push(`color_id = $${idx}`);
    params.push(filter.color_id);
    idx++;
  }

  if (filter.is_active !== null && filter.is_active !== undefined) {
    conditions.push(`is_active = $${idx}`);
    params.push(filter.is_active ? 1 : 0);
    idx++;
  } else {
    conditions.push('is_active = 1');
  }

  const sql = `
    SELECT ${SELECT_COLS}
    FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC
  `;

  const res = await pool.query(sql, params);
  return res.rows.map(mapProductRow);
}

// --- Get Product By ID ---

export async function getProductById(pool: Pool, id: string): Promise<Product | null> {
  const res = await pool.query(
    `SELECT ${SELECT_COLS} FROM products WHERE id = $1`,
    [id]
  );
  if (res.rows.length === 0) {
    return null;
  }
  return mapProductRow(res.rows[0]!);
}

// --- Update Product ---

/**
 * Updates an existing product.
 * Mirrors update_product() in postgres_product_repo.rs.
 *
 * Steps:
 * 1. Fetch current product (404 if missing)
 * 2. Merge DTO fields over current values
 * 3. Validate: all prices/threshold >= 0
 * 4. UPDATE products
 *
 * Returns product with current.sku (pre-update) -- matches Rust behavior.
 */
export async function updateProduct(
  pool: Pool,
  id: string,
  dto: UpdateProductDto
): Promise<Product> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT ${SELECT_COLS} FROM products WHERE id = $1`,
      [id]
    );
    if (currentRes.rows.length === 0) {
      throw new RepoError('Product not found', 404);
    }
    const current = mapProductRow(currentRes.rows[0]!);

    const newName =
      dto.name !== undefined && dto.name !== null && dto.name.trim().length > 0
        ? dto.name.trim()
        : current.name;
    const newNormalizedName = normalizeProductName(newName);

    const rawSku =
      dto.sku !== undefined && dto.sku !== null ? dto.sku.trim().toUpperCase() : '';
    const newSku = rawSku.length > 0 ? rawSku : current.sku;

    const newBarcode =
      dto.barcode !== undefined
        ? dto.barcode && dto.barcode.trim().length > 0
          ? dto.barcode.trim()
          : null
        : current.barcode;

    const newCategoryId = dto.category_id ?? current.category_id;
    const newBrandId =
      dto.brand_id !== undefined ? dto.brand_id ?? null : current.brand_id;
    const newCompanyId =
      dto.company_id !== undefined ? dto.company_id ?? null : current.company_id;
    const newQualityId =
      dto.quality_id !== undefined ? dto.quality_id ?? null : current.quality_id;
    const newColorId =
      dto.color_id !== undefined ? dto.color_id ?? null : current.color_id;
    const newUnitId =
      dto.unit_id !== undefined ? dto.unit_id ?? null : current.unit_id;

    const newPurchasePrice =
      dto.purchase_price !== undefined && dto.purchase_price !== null
        ? dto.purchase_price
        : current.purchase_price;
    const newAvgCost =
      dto.average_cost !== undefined && dto.average_cost !== null
        ? dto.average_cost
        : current.average_cost;
    const newSalePrice =
      dto.sale_price !== undefined && dto.sale_price !== null
        ? dto.sale_price
        : current.sale_price;
    const newThreshold =
      dto.low_stock_threshold !== undefined && dto.low_stock_threshold !== null
        ? dto.low_stock_threshold
        : current.low_stock_threshold;
    const newDescription =
      dto.description !== undefined ? dto.description ?? null : current.description;
    const newIsActive =
      dto.is_active !== undefined && dto.is_active !== null
        ? dto.is_active
        : current.is_active;

    if (newPurchasePrice < 0 || newAvgCost < 0 || newSalePrice < 0 || newThreshold < 0) {
      throw new RepoError('Price or threshold values cannot be negative', 400);
    }

    const now = NOW_ISO();

    await client.query(
      `UPDATE products SET
         name = $1,
         normalized_name = $2,
         sku = $3,
         barcode = $4,
         type_id = $5,
         brand_id = $6,
         company_id = $7,
         quality_id = $8,
         color_id = $9,
         unit_id = $10,
         purchase_price = $11,
         average_cost = $12,
         sale_price = $13,
         low_stock_threshold = $14,
         description = $15,
         is_active = $16,
         updated_at = $17
       WHERE id = $18`,
      [
        newName,
        newNormalizedName,
        newSku,
        newBarcode,
        newCategoryId,
        newBrandId,
        newCompanyId,
        newQualityId,
        newColorId,
        newUnitId,
        newPurchasePrice,
        newAvgCost,
        newSalePrice,
        newThreshold,
        newDescription,
        newIsActive ? 1 : 0,
        now,
        id,
      ]
    );

    await client.query('COMMIT');

    // Return product with current.sku (pre-update) -- matches Rust return behavior
    return {
      ...current,
      name: newName,
      normalized_name: newNormalizedName,
      sku: current.sku,
      barcode: newBarcode,
      category_id: newCategoryId,
      brand_id: newBrandId,
      company_id: newCompanyId,
      quality_id: newQualityId,
      color_id: newColorId,
      unit_id: newUnitId,
      purchase_price: newPurchasePrice,
      average_cost: newAvgCost,
      sale_price: newSalePrice,
      low_stock_threshold: newThreshold,
      description: newDescription,
      is_active: newIsActive,
      updated_at: now,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    if (err instanceof RepoError) throw err;
    throw mapPgError(err, dto.sku ?? '');
  } finally {
    client.release();
  }
}

// --- Deactivate Product ---

/**
 * Soft-deactivates a product by setting is_active = 0.
 * Mirrors deactivate_product() in postgres_product_repo.rs.
 * Returns 404 if product does not exist (rows_affected == 0).
 */
export async function deactivateProduct(pool: Pool, id: string): Promise<void> {
  const now = NOW_ISO();
  const res = await pool.query(
    'UPDATE products SET is_active = 0, updated_at = $1 WHERE id = $2',
    [now, id]
  );

  if (res.rowCount === 0) {
    throw new RepoError('Product not found', 404);
  }
}

// --- PostgreSQL Error Mapping ---

interface PgError {
  code?: string;
  constraint?: string;
  message?: string;
}

/**
 * Maps PostgreSQL constraint violations to application-level errors.
 * Mirrors the error mapping in postgres_product_repo.rs.
 */
function mapPgError(err: unknown, sku: string): RepoError {
  if (err instanceof RepoError) return err;

  const pgErr = err as PgError;

  if (pgErr.code === '23505') {
    const constraint = pgErr.constraint ?? '';

    if (constraint === 'products_composite_identity_key') {
      return new RepoError('An equivalent product already exists.', 409);
    }
    if (constraint === 'products_sku_key') {
      const skuDisplay = sku.trim().toUpperCase();
      return new RepoError(`Product with SKU '${skuDisplay}' already exists`, 409);
    }
    if (constraint === 'products_barcode_key') {
      return new RepoError('A product with this barcode already exists', 409);
    }
    return new RepoError('A product with this identifier already exists', 409);
  }

  const message = pgErr.message ?? 'Unknown database error';
  return new RepoError(`Internal database error: ${message}`, 500);
}

export const DEFAULT_BRANDS = [
  { id: 'brd_samsung', name: 'Samsung' },
  { id: 'brd_apple', name: 'Apple (iPhone)' },
  { id: 'brd_infinix', name: 'Infinix' },
  { id: 'brd_tecno', name: 'Tecno' },
  { id: 'brd_vivo', name: 'Vivo' },
  { id: 'brd_oppo', name: 'Oppo' },
  { id: 'brd_realme', name: 'Realme' },
  { id: 'brd_xiaomi', name: 'Xiaomi / Redmi' },
  { id: 'brd_nokia', name: 'Nokia' },
  { id: 'brd_itel', name: 'Itel' },
  { id: 'brd_ronin', name: 'Ronin' },
  { id: 'brd_audionic', name: 'Audionic' },
  { id: 'brd_faster', name: 'Faster' },
  { id: 'brd_anker', name: 'Anker' },
];

export async function listBrands(pool: Pool): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await pool.query('SELECT id, name FROM brands ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
    }
  } catch {
    // Return fallback list on database query error
  }
  return DEFAULT_BRANDS;
}
