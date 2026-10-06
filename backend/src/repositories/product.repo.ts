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

export interface SchemaCaps {
  catCol: 'category_id';
  catTable: 'categories';
  isActiveBool: boolean;
}

let cachedCaps: SchemaCaps | null = null;

export async function getSchemaCaps(pool: Pool): Promise<SchemaCaps> {
  if (cachedCaps) return cachedCaps;
  try {
    const colRes = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active'`
    );
    let isActiveBool = false;
    for (const r of colRes.rows) {
      if (r.column_name === 'is_active' && r.data_type.toLowerCase().includes('bool')) {
        isActiveBool = true;
      }
    }
    cachedCaps = { catCol: 'category_id', catTable: 'categories', isActiveBool };
  } catch {
    cachedCaps = { catCol: 'category_id', catTable: 'categories', isActiveBool: false };
  }
  return cachedCaps;
}

/**
 * Maps a raw pg row to Product.
 * Supports both integer (0/1) and boolean is_active.
 */
function mapProductRow(row: Record<string, unknown>): Product {
  const isActiveRaw = row['is_active'];
  const isActiveBool =
    typeof isActiveRaw === 'boolean'
      ? isActiveRaw
      : isActiveRaw === 1 || isActiveRaw === '1' || isActiveRaw === 'true' || String(isActiveRaw) === 'true';

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    normalized_name: row['normalized_name'] as string,
    sku: row['sku'] as string,
    barcode: (row['barcode'] as string | null) ?? null,
    category_id: (row['category_id'] as string) ?? '',
    brand_id: (row['brand_id'] as string | null) ?? null,
    company_id: (row['company_id'] as string | null) ?? null,
    quality_id: (row['quality_id'] as string | null) ?? null,
    color_id: (row['color_id'] as string | null) ?? null,
    unit_id: (row['unit_id'] as string | null) ?? null,
    purchase_price: Number(row['purchase_price']),
    average_cost: Number(row['average_cost']),
    sale_price: Number(row['sale_price']),
    low_stock_threshold: Number(row['low_stock_threshold']),
    is_active: isActiveBool,
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

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Sanitizes optional UUID foreign key parameters.
 * Converts empty strings, whitespace, null, undefined, or invalid UUIDs to null.
 * Preserves valid UUID strings unchanged.
 */
export function sanitizeOptionalUuid(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return UUID_REGEX.test(trimmed) ? trimmed : null;
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
  inputSku?: string | null
): Promise<string> {
  const trimmed = (inputSku ?? '').trim().toUpperCase();

  if (trimmed.length > 0 && !trimmed.startsWith('SKU-') && !trimmed.startsWith('AUTO-')) {
    return trimmed;
  }

  let catName = '';
  let catCode = '';

  try {
    const ptRes = await pool.query<{ name: string; code: string }>(
      `SELECT name, code FROM categories WHERE id = $1`,
      [categoryId]
    );

    if (ptRes.rows.length > 0) {
      catName = ptRes.rows[0]!.name;
      catCode = ptRes.rows[0]!.code ?? '';
    }
  } catch {
    // If lookup fails, default prefix resolution proceeds safely
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

  try {
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
  } catch {
    return `${prefix}${String(Date.now() % 1000000).padStart(6, '0')}`;
  }
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
  const caps = await getSchemaCaps(pool);
  const resolvedSku = await resolveProductSku(pool, dto.category_id, dto.sku);
  const activeVal = caps.isActiveBool ? true : 1;
  const selectCols = `id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at`;

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
         id, name, normalized_name, sku, barcode, category_id, brand_id,
         company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price,
         low_stock_threshold, is_active, description, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${selectCols}`,
      [
        id,
        dto.name.trim(),
        normalizedName,
        resolvedSku,
        barcodeVal,
        dto.category_id,
        sanitizeOptionalUuid(dto.brand_id),
        sanitizeOptionalUuid(dto.company_id),
        sanitizeOptionalUuid(dto.quality_id),
        sanitizeOptionalUuid(dto.color_id),
        sanitizeOptionalUuid(dto.unit_id),
        dto.purchase_price,
        avgCost,
        dto.sale_price,
        threshold,
        activeVal,
        dto.description ?? null,
        now,
        now,
      ]
    );

    await client.query('COMMIT');
    const product = mapProductRow(res.rows[0]!);
    client.release();
    return product;
  } catch (err: unknown) {
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch (rollbackErr: unknown) {
      client.release(rollbackErr as Error);
    }
    throw mapPgError(err, dto.sku);
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
  const caps = await getSchemaCaps(pool);
  const resolvedSku = await resolveProductSku(pool, dto.category_id, dto.sku);
  const activeVal = caps.isActiveBool ? true : 1;
  const selectCols = `id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at`;

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
         id, name, normalized_name, sku, barcode, category_id, brand_id,
         company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price,
         low_stock_threshold, is_active, description, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${selectCols}`,
      [
        id,
        dto.name.trim(),
        normalizedName,
        resolvedSku,
        barcodeVal,
        dto.category_id,
        sanitizeOptionalUuid(dto.brand_id),
        sanitizeOptionalUuid(dto.company_id),
        sanitizeOptionalUuid(dto.quality_id),
        sanitizeOptionalUuid(dto.color_id),
        sanitizeOptionalUuid(dto.unit_id),
        dto.purchase_price,
        avgCost,
        dto.sale_price,
        threshold,
        activeVal,
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
    const result = { ...product, initial_quantity: dto.initial_quantity ?? null };
    client.release();
    return result;
  } catch (err: unknown) {
    // Attempt ROLLBACK. If ROLLBACK itself fails, pass the rollback error to
    // client.release() so the pg pool destroys and replaces this connection
    // instead of recycling a connection that is still in an aborted-transaction
    // state. Recycling a dirty connection is what causes subsequent callers to
    // receive "current transaction is aborted" on an unrelated query.
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch (rollbackErr: unknown) {
      client.release(rollbackErr as Error);
    }
    throw mapPgError(err, dto.sku);
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
  const caps = await getSchemaCaps(pool);
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
    conditions.push(`category_id = $${idx}`);
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
    if (filter.is_active) {
      conditions.push(`(is_active::text = '1' OR is_active::text = 'true')`);
    } else {
      conditions.push(`(is_active::text = '0' OR is_active::text = 'false')`);
    }
  } else {
    conditions.push(`(is_active::text = '1' OR is_active::text = 'true')`);
  }

  const selectCols = `id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at`;

  const sql = `
    SELECT ${selectCols}
    FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC
  `;

  const res = await pool.query(sql, params);
  return res.rows.map(mapProductRow);
}

// --- Get Product By ID ---

export async function getProductById(pool: Pool, id: string): Promise<Product | null> {
  const caps = await getSchemaCaps(pool);
  const selectCols = `id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at`;
  const res = await pool.query(
    `SELECT ${selectCols} FROM products WHERE id = $1`,
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
  const caps = await getSchemaCaps(pool);
  const selectCols = `id, name, normalized_name, sku, barcode, category_id, brand_id, company_id, quality_id, color_id, unit_id, purchase_price, average_cost, sale_price, low_stock_threshold, is_active, description, created_at, updated_at`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentRes = await client.query(
      `SELECT ${selectCols} FROM products WHERE id = $1`,
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
      dto.brand_id !== undefined ? sanitizeOptionalUuid(dto.brand_id) : current.brand_id;
    const newCompanyId =
      dto.company_id !== undefined ? sanitizeOptionalUuid(dto.company_id) : current.company_id;
    const newQualityId =
      dto.quality_id !== undefined ? sanitizeOptionalUuid(dto.quality_id) : current.quality_id;
    const newColorId =
      dto.color_id !== undefined ? sanitizeOptionalUuid(dto.color_id) : current.color_id;
    const newUnitId =
      dto.unit_id !== undefined ? sanitizeOptionalUuid(dto.unit_id) : current.unit_id;

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
    const activeVal = caps.isActiveBool ? newIsActive : (newIsActive ? 1 : 0);

    await client.query(
      `UPDATE products SET
         name = $1,
         normalized_name = $2,
         sku = $3,
         barcode = $4,
         category_id = $5,
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
        activeVal,
        now,
        id,
      ]
    );

    await client.query('COMMIT');
    const updated = {
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
    client.release();
    return updated;
  } catch (err: unknown) {
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch (rollbackErr: unknown) {
      client.release(rollbackErr as Error);
    }
    if (err instanceof RepoError) throw err;
    throw mapPgError(err, dto.sku ?? '');
  }
}

// --- Deactivate Product ---

/**
 * Soft-deactivates a product by setting is_active = 0 or false.
 * Mirrors deactivate_product() in postgres_product_repo.rs.
 * Returns 404 if product does not exist (rows_affected == 0).
 */
export async function deactivateProduct(pool: Pool, id: string): Promise<void> {
  const caps = await getSchemaCaps(pool);
  const activeVal = caps.isActiveBool ? false : 0;
  const now = NOW_ISO();
  const res = await pool.query(
    'UPDATE products SET is_active = $1, updated_at = $2 WHERE id = $3',
    [activeVal, now, id]
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

export async function listCategories(pool: Pool): Promise<Array<{ id: string; name: string; code?: string }>> {
  try {
    const res = await pool.query('SELECT id, name, code FROM categories ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: r.code ? String(r.code) : undefined }));
    }
  } catch (err) {
    console.warn('[product.repo] listCategories query failed:', err);
  }
  return [];
}

export async function listCompanies(pool: Pool): Promise<Array<{ id: string; name: string; code?: string }>> {
  try {
    const res = await pool.query('SELECT id, name, code FROM companies ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: r.code ? String(r.code) : undefined }));
    }
  } catch (err) {
    console.warn('[product.repo] listCompanies query failed:', err);
  }
  return [];
}

export async function listQualities(pool: Pool): Promise<Array<{ id: string; name: string; code?: string }>> {
  try {
    const res = await pool.query('SELECT id, name, code FROM qualities ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: r.code ? String(r.code) : undefined }));
    }
  } catch (err) {
    console.warn('[product.repo] listQualities query failed:', err);
  }
  return [];
}

export async function listColors(pool: Pool): Promise<Array<{ id: string; name: string; code?: string }>> {
  try {
    const res = await pool.query('SELECT id, name, code FROM colors ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: r.code ? String(r.code) : undefined }));
    }
  } catch (err) {
    console.warn('[product.repo] listColors query failed:', err);
  }
  return [];
}

export async function listUnits(pool: Pool): Promise<Array<{ id: string; name: string; code?: string }>> {
  try {
    const res = await pool.query('SELECT id, name, abbreviation FROM units ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({ id: String(r.id), name: String(r.name), code: r.abbreviation ? String(r.abbreviation) : undefined }));
    }
  } catch (err) {
    console.warn('[product.repo] listUnits query failed:', err);
  }
  return [];
}

export async function listBranches(pool: Pool): Promise<Array<{ id: string; organization_id: string; name: string; code: string; is_active: boolean }>> {
  try {
    const res = await pool.query('SELECT id, organization_id, name, code, is_active FROM branches ORDER BY name ASC');
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: String(r.id),
        organization_id: String(r.organization_id || '00000000-0000-0000-0000-000000000001'),
        name: String(r.name),
        code: String(r.code || 'MAIN'),
        is_active: Boolean(r.is_active === 1 || r.is_active === true || String(r.is_active) === 'true'),
      }));
    }
  } catch (err) {
    console.warn('[product.repo] listBranches query failed:', err);
  }
  return [
    { id: '00000000-0000-0000-0000-000000000002', organization_id: '00000000-0000-0000-0000-000000000001', name: 'Main Branch', code: 'MAIN', is_active: true }
  ];
}

export async function getStockMapForBranch(pool: Pool, branchId?: string): Promise<Record<string, number>> {
  try {
    const map: Record<string, number> = {};
    if (branchId && branchId.trim()) {
      const res = await pool.query(
        'SELECT product_id, quantity FROM stock WHERE branch_id = $1',
        [branchId.trim()]
      );
      for (const row of res.rows) {
        map[String(row['product_id'])] = Number(row['quantity']) || 0;
      }
    } else {
      const res = await pool.query(
        'SELECT product_id, SUM(quantity)::bigint AS total_qty FROM stock GROUP BY product_id'
      );
      for (const row of res.rows) {
        map[String(row['product_id'])] = Number(row['total_qty']) || 0;
      }
    }
    return map;
  } catch (err) {
    console.warn('[product.repo] getStockMapForBranch query failed:', err);
    return {};
  }
}

