/**
 * Customer repository for the TypeScript backend.
 *
 * Mirrors PostgresCustomerRepository in
 * src-tauri/src/repositories/postgres_customer_repo.rs (574 lines).
 *
 * MIGRATION SCOPE: Language migration only — no redesign, no new features.
 * Rust PostgreSQL behavior = TypeScript PostgreSQL behavior.
 *
 * Key preservation notes:
 *  - is_active is stored as INTEGER 0/1 in PostgreSQL; mapped back to boolean.
 *  - list_customers uses a dynamic query builder; LIMIT/OFFSET appended as literals
 *    (matching Rust which uses format!("{query} LIMIT {limit}")).
 *  - search uses ONE bound parameter referenced three times ($1 ILIKE).
 *  - customer_code on Postgres path = "CUST-{uuid_simple_8chars}" (not sequential).
 *    See customer_service.rs lines 70-79: Postgres path uses Uuid::new_v4().simple().
 *  - record_customer_payment is NOT implemented on the Postgres path
 *    (customer_service.rs line 281: explicit Err("Postgres record_customer_payment not implemented")).
 *  - deactivate_customer: UPDATE SET is_active = 0; NotFound if rows_affected == 0.
 *  - Transaction safety: only sync-path functions (create_customer_tx, update_customer_tx,
 *    record_customer_payment_tx) use transactions. Direct API calls use pool.query().
 *    TypeScript mirrors this: no transactions in API-path functions.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ─── Error class (mirrors Rust AppError → HTTP mapping) ──────────────────────

export class CustomerRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'CustomerRepoError';
  }
}

// ─── Domain types (mirrors src-tauri/src/domain/customer.rs) ─────────────────

export interface Customer {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSummaryDto {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface CustomerDetailDto {
  customer: Customer;
  outstanding_balance: number;
  total_sales_count: number;
  total_sales_amount: number;
  last_transaction_date: string | null;
}

export interface CreateCustomerDto {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
}

export interface UpdateCustomerDto {
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  is_active?: boolean | null;
}

export interface CustomerFilter {
  search?: string | null;
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  reference_id: string | null;
  reference_number: string | null;
  entry_type: string;
  debit: number;
  credit: number;
  balance_after: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface CustomerStatementRowDto {
  id: string;
  date: string;
  reference_number: string | null;
  description: string;
  entry_type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerStatementDto {
  customer_id: string;
  customer_name: string;
  customer_code: string;
  phone: string;
  credit_limit: number;
  current_balance: number;
  entries: CustomerStatementRowDto[];
}

// ─── Row mapper (mirrors map_customer_row in postgres_customer_repo.rs) ───────

function mapCustomerRow(row: Record<string, unknown>): Customer {
  // is_active is stored as INTEGER 0/1 in PostgreSQL
  // Rust: let is_active_int: i32 = row.try_get(9)?; customer.is_active = is_active_int == 1
  const isActiveRaw = row['is_active'];
  let isActive: boolean;
  if (typeof isActiveRaw === 'boolean') {
    isActive = isActiveRaw;
  } else {
    isActive = Number(isActiveRaw) === 1;
  }

  return {
    id: row['id'] as string,
    customer_code: row['customer_code'] as string,
    name: row['name'] as string,
    phone: row['phone'] as string,
    alternate_phone: (row['alternate_phone'] as string | null) ?? null,
    email: (row['email'] as string | null) ?? null,
    address: (row['address'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
    credit_limit: Number(row['credit_limit']),
    is_active: isActive,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

// ─── Validation (mirrors customer_service.rs validation) ─────────────────────

export function validateCreateCustomer(dto: CreateCustomerDto): string | null {
  const name = (dto.name ?? '').trim();
  if (!name) return 'Customer name cannot be empty';

  const phone = (dto.phone ?? '').trim();
  if (!phone) return 'Customer phone number cannot be empty';

  const creditLimit = dto.credit_limit ?? 0;
  if (creditLimit < 0) return 'Credit limit cannot be negative';

  return null;
}

export function validateUpdateCustomer(dto: UpdateCustomerDto): string | null {
  if (dto.name !== undefined && dto.name !== null) {
    if (!dto.name.trim()) return 'Customer name cannot be empty';
  }
  if (dto.phone !== undefined && dto.phone !== null) {
    if (!dto.phone.trim()) return 'Customer phone number cannot be empty';
  }
  if (dto.credit_limit !== undefined && dto.credit_limit !== null) {
    if (dto.credit_limit < 0) return 'Credit limit cannot be negative';
  }
  return null;
}

// ─── Repository functions ─────────────────────────────────────────────────────

/**
 * Inserts a new customer.
 * Mirrors PostgresCustomerRepository::create_customer().
 *
 * customer_code on Postgres path uses UUID-simple format:
 *   customer_service.rs line 71: format!("CUST-{:08}", Uuid::new_v4().simple())
 *   simple() produces a 32-char hex string; {:08} formats a u128 — the Rust
 *   simple() Display is the full 32-char hex, NOT padded to 8 digits.
 *   So the pattern is: "CUST-" + first 8 chars of UUID simple (hex, no dashes).
 *
 * Wait — re-reading carefully: `Uuid::new_v4().simple()` returns a Simple formatter
 * and `{:08}` would format it as a string. In Rust `format!("{:08}", uuid.simple())`
 * produces the full 32-character UUID hex string (width 8 is ignored since the string
 * is already 32 chars). So customer_code = "CUST-" + 32-char-hex.
 *
 * Example: "CUST-550e8400e29b41d4a716446655440000"
 */
export async function createCustomer(pool: Pool, dto: CreateCustomerDto): Promise<Customer> {
  const validationErr = validateCreateCustomer(dto);
  if (validationErr) {
    throw new CustomerRepoError(validationErr, 400);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  // Postgres path customer_code: "CUST-" + uuid_simple (32-char hex no dashes)
  const codeUuid = uuidv4().replace(/-/g, '');
  const customerCode = `CUST-${codeUuid}`;

  const name = dto.name.trim();
  const phone = dto.phone.trim();
  const alternatePhone = dto.alternate_phone ? dto.alternate_phone.trim() || null : null;
  const email = dto.email ? dto.email.trim() || null : null;
  const address = dto.address ? dto.address.trim() || null : null;
  const notes = dto.notes ? dto.notes.trim() || null : null;
  const creditLimit = dto.credit_limit ?? 0;

  try {
    const result = await pool.query(
      `INSERT INTO customers
         (id, customer_code, name, phone, alternate_phone, email, address, notes,
          credit_limit, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11)
       RETURNING id, customer_code, name, phone, alternate_phone, email, address, notes,
                 credit_limit, is_active, created_at, updated_at`,
      [id, customerCode, name, phone, alternatePhone, email, address, notes, creditLimit, now, now]
    );

    if (!result.rows[0]) {
      throw new CustomerRepoError('Failed to insert customer: no row returned', 500);
    }

    return mapCustomerRow(result.rows[0]);
  } catch (err: unknown) {
    // Rust: unique_violation → Conflict("Customer code '...' already exists")
    // pg error code 23505 = unique_violation
    if ((err as { code?: string }).code === '23505') {
      throw new CustomerRepoError(`Customer code '${customerCode}' already exists`, 409);
    }
    if (err instanceof CustomerRepoError) throw err;
    throw new CustomerRepoError(
      `Failed to insert customer: ${(err as Error).message}`,
      500
    );
  }
}

/**
 * Fetches a customer by ID.
 * Mirrors PostgresCustomerRepository::get_customer_by_id().
 * Returns null if not found (Rust returns Option<Customer>).
 */
export async function getCustomerById(pool: Pool, id: string): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, customer_code, name, phone, alternate_phone, email, address, notes,
            credit_limit, is_active, created_at, updated_at
     FROM customers
     WHERE id = $1`,
    [id]
  );

  if (!result.rows[0]) return null;
  return mapCustomerRow(result.rows[0]);
}

/**
 * Fetches a customer by phone (trimmed input).
 * Mirrors PostgresCustomerRepository::get_customer_by_phone().
 * Returns null if not found.
 */
export async function getCustomerByPhone(pool: Pool, phone: string): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, customer_code, name, phone, alternate_phone, email, address, notes,
            credit_limit, is_active, created_at, updated_at
     FROM customers
     WHERE phone = $1
     LIMIT 1`,
    [phone.trim()]
  );

  if (!result.rows[0]) return null;
  return mapCustomerRow(result.rows[0]);
}

/**
 * Calculates authoritative outstanding balance.
 * Mirrors PostgresCustomerRepository::calculate_outstanding_balance().
 *
 * SQL: SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
 *      FROM customer_ledger_entries WHERE customer_id = $1
 */
export async function calculateOutstandingBalance(pool: Pool, customerId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
     FROM customer_ledger_entries
     WHERE customer_id = $1`,
    [customerId]
  );

  return Number(result.rows[0]?.['balance'] ?? 0);
}

/**
 * Rich customer profile with financial stats.
 * Mirrors PostgresCustomerRepository::get_customer_detail().
 *
 * Throws NotFound (404) if customer doesn't exist.
 */
export async function getCustomerDetail(pool: Pool, id: string): Promise<CustomerDetailDto> {
  const customer = await getCustomerById(pool, id);
  if (!customer) {
    throw new CustomerRepoError(`Customer '${id}' not found`, 404);
  }

  const outstandingBalance = await calculateOutstandingBalance(pool, id);

  // COUNT(*) and SUM(total_amount) from sales WHERE customer_id = id AND sale_status != 'CANCELLED'
  // Mirrors Rust get_customer_detail which queries sales for total_sales_count + total_sales_amount
  const salesResult = await pool.query(
    `SELECT COUNT(*) AS total_sales_count, COALESCE(SUM(total_amount), 0) AS total_sales_amount
     FROM sales
     WHERE customer_id = $1 AND sale_status != 'CANCELLED'`,
    [id]
  );

  // Last transaction date: most recent ledger entry created_at
  const ledgerResult = await pool.query(
    `SELECT created_at FROM customer_ledger_entries
     WHERE customer_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [id]
  );

  return {
    customer,
    outstanding_balance: outstandingBalance,
    total_sales_count: Number(salesResult.rows[0]?.['total_sales_count'] ?? 0),
    total_sales_amount: Number(salesResult.rows[0]?.['total_sales_amount'] ?? 0),
    last_transaction_date: (ledgerResult.rows[0]?.['created_at'] as string | null) ?? null,
  };
}

/**
 * Lists customers with optional filters.
 * Mirrors PostgresCustomerRepository::list_customers().
 *
 * Critical: LIMIT/OFFSET are appended as literals (not bound params) matching Rust behavior.
 * Search binds ONE parameter ($param_n) used THREE times for name ILIKE, phone ILIKE,
 * customer_code ILIKE.
 *
 * Default: limit=50, offset=0 (Rust: filter.limit.unwrap_or(50), filter.offset.unwrap_or(0))
 */
export async function listCustomers(
  pool: Pool,
  filter: CustomerFilter
): Promise<CustomerSummaryDto[]> {
  const params: unknown[] = [];

  let query = `
    SELECT c.id, c.customer_code, c.name, c.phone, c.credit_limit, c.is_active, c.created_at,
           COALESCE(SUM(cle.debit) - SUM(cle.credit), 0)::BIGINT AS outstanding_balance
    FROM customers c
    LEFT JOIN customer_ledger_entries cle ON cle.customer_id = c.id
    WHERE 1=1
  `;

  // is_active filter — Rust binds as 0/1 integer
  if (filter.is_active !== undefined && filter.is_active !== null) {
    const activeInt = filter.is_active ? 1 : 0;
    params.push(activeInt);
    query += ` AND c.is_active = $${params.length}`;
  }

  // search filter — ILIKE against name, phone, customer_code
  // Rust: ONE bound param referenced three times with OR
  if (filter.search !== undefined && filter.search !== null && filter.search.trim() !== '') {
    const searchPattern = `%${filter.search.trim()}%`;
    params.push(searchPattern);
    const paramIdx = params.length;
    query += ` AND (c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR c.customer_code ILIKE $${paramIdx})`;
  }

  query += ` GROUP BY c.id ORDER BY c.name ASC`;

  // LIMIT/OFFSET as literals (mirrors Rust: format!("{query} LIMIT {limit} OFFSET {offset}"))
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  const result = await pool.query(query, params);

  return result.rows.map((row: Record<string, unknown>) => {
    const isActiveRaw = row['is_active'];
    let isActive: boolean;
    if (typeof isActiveRaw === 'boolean') {
      isActive = isActiveRaw;
    } else {
      isActive = Number(isActiveRaw) === 1;
    }

    return {
      id: row['id'] as string,
      customer_code: row['customer_code'] as string,
      name: row['name'] as string,
      phone: row['phone'] as string,
      credit_limit: Number(row['credit_limit']),
      outstanding_balance: Number(row['outstanding_balance']),
      is_active: isActive,
      created_at: row['created_at'] as string,
    };
  });
}

/**
 * Searches active customers by name, phone, or customer code.
 * Mirrors PostgresCustomerRepository::search_customers() which delegates to list_customers
 * with: search=Some(query), is_active=Some(true), limit=Some(50), offset=None
 */
export async function searchCustomers(
  pool: Pool,
  query: string
): Promise<CustomerSummaryDto[]> {
  return listCustomers(pool, {
    search: query,
    is_active: true,
    limit: 50,
    offset: null,
  });
}

/**
 * Updates an existing customer.
 * Mirrors PostgresCustomerRepository::update_customer().
 *
 * Pattern: fetch existing → merge dto fields → UPDATE → return Customer.
 * Fields kept from existing if dto field is None/null:
 *   name, phone, alternate_phone, email, address, notes, credit_limit, is_active.
 *
 * Throws NotFound (404) if customer doesn't exist.
 */
export async function updateCustomer(
  pool: Pool,
  id: string,
  dto: UpdateCustomerDto
): Promise<Customer> {
  const existing = await getCustomerById(pool, id);
  if (!existing) {
    throw new CustomerRepoError(`Customer '${id}' not found`, 404);
  }

  const now = new Date().toISOString();

  // Merge: keep existing value if dto field is null/undefined
  const name = dto.name != null ? dto.name : existing.name;
  const phone = dto.phone != null ? dto.phone : existing.phone;
  const alternatePhone = dto.alternate_phone !== undefined ? dto.alternate_phone : existing.alternate_phone;
  const email = dto.email !== undefined ? dto.email : existing.email;
  const address = dto.address !== undefined ? dto.address : existing.address;
  const notes = dto.notes !== undefined ? dto.notes : existing.notes;
  const creditLimit = dto.credit_limit != null ? dto.credit_limit : existing.credit_limit;
  // is_active: Rust uses dto.is_active.unwrap_or(existing.is_active)
  const isActive = dto.is_active != null ? dto.is_active : existing.is_active;
  // is_active stored as 0/1 integer
  const isActiveInt = isActive ? 1 : 0;

  const result = await pool.query(
    `UPDATE customers
     SET name = $1, phone = $2, alternate_phone = $3, email = $4, address = $5,
         notes = $6, credit_limit = $7, is_active = $8, updated_at = $9
     WHERE id = $10
     RETURNING id, customer_code, name, phone, alternate_phone, email, address, notes,
               credit_limit, is_active, created_at, updated_at`,
    [name, phone, alternatePhone, email, address, notes, creditLimit, isActiveInt, now, id]
  );

  if (!result.rows[0]) {
    throw new CustomerRepoError(`Customer '${id}' not found`, 404);
  }

  return mapCustomerRow(result.rows[0]);
}

/**
 * Deactivates a customer (soft delete — never hard deletes).
 * Mirrors PostgresCustomerRepository::deactivate_customer().
 *
 * SQL: UPDATE customers SET is_active = 0 WHERE id = $1
 * If rows_affected == 0: NotFound error.
 */
export async function deactivateCustomer(pool: Pool, id: string): Promise<void> {
  const result = await pool.query(
    `UPDATE customers SET is_active = 0, updated_at = $2 WHERE id = $1`,
    [id, new Date().toISOString()]
  );

  if (result.rowCount === 0) {
    throw new CustomerRepoError(`Customer '${id}' not found`, 404);
  }
}

/**
 * Gets customer ledger history (recent first, paginated).
 * Mirrors PostgresCustomerRepository::get_ledger().
 *
 * Defaults: limit=100, offset=0
 * Order: created_at DESC, id DESC
 */
export async function getCustomerLedger(
  pool: Pool,
  customerId: string,
  limit?: number | null,
  offset?: number | null
): Promise<CustomerLedgerEntry[]> {
  const effectiveLimit = limit ?? 100;
  const effectiveOffset = offset ?? 0;

  const result = await pool.query(
    `SELECT id, customer_id, reference_id, reference_number, entry_type,
            debit, credit, balance_after, description, performed_by, created_at
     FROM customer_ledger_entries
     WHERE customer_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [customerId, effectiveLimit, effectiveOffset]
  );

  return result.rows.map((row: Record<string, unknown>): CustomerLedgerEntry => ({
    id: row['id'] as string,
    customer_id: row['customer_id'] as string,
    reference_id: (row['reference_id'] as string | null) ?? null,
    reference_number: (row['reference_number'] as string | null) ?? null,
    entry_type: row['entry_type'] as string,
    debit: Number(row['debit']),
    credit: Number(row['credit']),
    balance_after: Number(row['balance_after']),
    description: row['description'] as string,
    performed_by: (row['performed_by'] as string | null) ?? null,
    created_at: row['created_at'] as string,
  }));
}

/**
 * Gets printable customer statement (chronological, all entries).
 * Mirrors PostgresCustomerRepository::get_statement().
 *
 * Order: created_at ASC, id ASC (opposite of get_ledger).
 * current_balance = balance_after of the last entry (or 0 if no entries).
 *
 * Throws NotFound (404) if customer doesn't exist.
 */
export async function getCustomerStatement(
  pool: Pool,
  customerId: string
): Promise<CustomerStatementDto> {
  const customer = await getCustomerById(pool, customerId);
  if (!customer) {
    throw new CustomerRepoError(`Customer '${customerId}' not found`, 404);
  }

  const result = await pool.query(
    `SELECT id, created_at AS date, reference_number, description, entry_type,
            debit, credit, balance_after AS balance
     FROM customer_ledger_entries
     WHERE customer_id = $1
     ORDER BY created_at ASC, id ASC`,
    [customerId]
  );

  const entries: CustomerStatementRowDto[] = result.rows.map(
    (row: Record<string, unknown>): CustomerStatementRowDto => ({
      id: row['id'] as string,
      date: row['date'] as string,
      reference_number: (row['reference_number'] as string | null) ?? null,
      description: row['description'] as string,
      entry_type: row['entry_type'] as string,
      debit: Number(row['debit']),
      credit: Number(row['credit']),
      balance: Number(row['balance']),
    })
  );

  // current_balance = last entry's balance_after (Rust tracks this as current_balance variable)
  const lastEntry = entries[entries.length - 1];
  const currentBalance = lastEntry ? lastEntry.balance : 0;

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    customer_code: customer.customer_code,
    phone: customer.phone,
    credit_limit: customer.credit_limit,
    current_balance: currentBalance,
    entries,
  };
}

// ─── Transaction-path functions (sync handler use only) ──────────────────────
// These mirror create_customer_tx and update_customer_tx in postgres_customer_repo.rs.
// They are NOT called by the HTTP API handlers — only by the sync projection path.

/**
 * Creates or upserts a customer within an existing transaction.
 * Mirrors PostgresCustomerRepository::create_customer_tx() — ON CONFLICT DO UPDATE.
 * Used by the sync handler only (CUSTOMER_CREATED event projection).
 */
export async function createCustomerTx(
  client: PoolClient,
  customer: Customer
): Promise<Customer> {
  const isActiveInt = customer.is_active ? 1 : 0;

  const result = await client.query(
    `INSERT INTO customers
       (id, customer_code, name, phone, alternate_phone, email, address, notes,
        credit_limit, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE
       SET customer_code  = EXCLUDED.customer_code,
           name           = EXCLUDED.name,
           phone          = EXCLUDED.phone,
           alternate_phone = EXCLUDED.alternate_phone,
           email          = EXCLUDED.email,
           address        = EXCLUDED.address,
           notes          = EXCLUDED.notes,
           credit_limit   = EXCLUDED.credit_limit,
           is_active      = EXCLUDED.is_active,
           updated_at     = EXCLUDED.updated_at
     RETURNING id, customer_code, name, phone, alternate_phone, email, address, notes,
               credit_limit, is_active, created_at, updated_at`,
    [
      customer.id,
      customer.customer_code,
      customer.name,
      customer.phone,
      customer.alternate_phone,
      customer.email,
      customer.address,
      customer.notes,
      customer.credit_limit,
      isActiveInt,
      customer.created_at,
      customer.updated_at,
    ]
  );

  if (!result.rows[0]) {
    throw new CustomerRepoError('Failed to upsert customer: no row returned', 500);
  }

  return mapCustomerRow(result.rows[0]);
}

/**
 * Updates an existing customer within an existing transaction.
 * Mirrors PostgresCustomerRepository::update_customer_tx().
 * Used by the sync handler only (CUSTOMER_UPDATED event projection).
 */
export async function updateCustomerTx(
  client: PoolClient,
  customer: Customer
): Promise<Customer> {
  const isActiveInt = customer.is_active ? 1 : 0;

  const result = await client.query(
    `UPDATE customers
     SET name = $1, phone = $2, alternate_phone = $3, email = $4, address = $5,
         notes = $6, credit_limit = $7, is_active = $8, updated_at = $9
     WHERE id = $10
     RETURNING id, customer_code, name, phone, alternate_phone, email, address, notes,
               credit_limit, is_active, created_at, updated_at`,
    [
      customer.name,
      customer.phone,
      customer.alternate_phone,
      customer.email,
      customer.address,
      customer.notes,
      customer.credit_limit,
      isActiveInt,
      customer.updated_at,
      customer.id,
    ]
  );

  if (!result.rows[0]) {
    throw new CustomerRepoError(`Customer '${customer.id}' not found for update`, 404);
  }

  return mapCustomerRow(result.rows[0]);
}
