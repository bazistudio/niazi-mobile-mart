/**
 * Supplier Repository — TypeScript/PostgreSQL
 *
 * Online authority for all Supplier CRUD, ledger, and search operations.
 * Mirrors PostgresSupplierRepository in src-tauri/src/repositories/postgres_supplier_repo.rs.
 *
 * MIGRATION SCOPE: Language migration + code-generation correction.
 *
 * Key preservation notes:
 *  - is_active is stored as INTEGER 0/1 in PostgreSQL; mapped back to boolean.
 *  - Supplier code: SQLite path uses sequential SUP-000001 via counters table.
 *    Rust Postgres path currently uses Uuid::new_v4().simple() stub (supplier_service.rs:62).
 *    TypeScript CORRECTS this to sequential SUP-{:06} using the counters table, which is
 *    the intended business contract (confirmed by unit tests supplier_service.rs:412,430).
 *    Atomic counter increment uses UPDATE...RETURNING inside a transaction.
 *  - list_suppliers uses dynamic query builder with positional params, matching Rust.
 *  - search_suppliers delegates to list_suppliers with is_active=true, limit=50.
 *  - calculate_outstanding_balance: SUM(debit) - SUM(credit) from ledger entries.
 *  - deactivate_supplier: UPDATE SET is_active=0; NotFound if rows_affected==0.
 *  - get_supplier_detail: fetches purchases count/amount from purchases table.
 *  - Party dependency: suppliers.party_id FK exists but Party domain is NOT implemented
 *    in Phase 2. Column is preserved; no party write logic here.
 *
 * DO NOT add new supplier features. DO NOT implement Party functionality.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ─── Error class ──────────────────────────────────────────────────────────────

export class SupplierRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'SupplierRepoError';
  }
}

// ─── Domain types (mirrors src-tauri/src/domain/supplier.rs) ─────────────────

export interface Supplier {
  id: string;
  supplier_code: string;
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

export interface SupplierSummaryDto {
  id: string;
  supplier_code: string;
  name: string;
  phone: string;
  credit_limit: number;
  outstanding_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface SupplierDetailDto {
  supplier: Supplier;
  outstanding_balance: number;
  total_purchases_count: number;
  total_purchases_amount: number;
  last_transaction_date: string | null;
}

export interface CreateSupplierDto {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
}

export interface UpdateSupplierDto {
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  is_active?: boolean | null;
}

export interface SupplierFilter {
  search?: string | null;
  is_active?: boolean | null;
  limit?: number | null;
  offset?: number | null;
}

export type SupplierLedgerEntryType = 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT';

export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  reference_id: string | null;
  reference_number: string | null;
  entry_type: SupplierLedgerEntryType;
  debit: number;
  credit: number;
  balance_after: number;
  description: string;
  performed_by: string | null;
  created_at: string;
}

export interface SupplierStatementRowDto {
  id: string;
  date: string;
  reference_number: string | null;
  description: string;
  entry_type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SupplierStatementDto {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  phone: string;
  credit_limit: number;
  current_balance: number;
  entries: SupplierStatementRowDto[];
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupplierRepo {
  constructor(private readonly pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Atomic supplier code generation via counters table (SUP-000001 format)
  // Mirrors SQLiteSupplierRepository::next_supplier_code_in_tx (supplier_repository.rs:27-40)
  // Corrects Rust Postgres path which used UUID stub (supplier_service.rs:62)
  // ---------------------------------------------------------------------------

  private async nextSupplierCode(client: PoolClient): Promise<string> {
    const result = await client.query<{ value: string }>(
      "UPDATE counters SET value = value + 1 WHERE name = 'supplier_code' RETURNING value"
    );
    if (result.rows.length === 0) {
      throw new SupplierRepoError('supplier_code counter not found in counters table', 500);
    }
    const val = Number(result.rows[0]!.value);
    return `SUP-${String(val).padStart(6, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // create_supplier
  // ---------------------------------------------------------------------------

  async createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    const name = dto.name.trim();
    if (!name) {
      throw new SupplierRepoError('Supplier name cannot be empty', 400);
    }
    const phone = dto.phone.trim();
    if (!phone) {
      throw new SupplierRepoError('Supplier phone number cannot be empty', 400);
    }
    const creditLimit = dto.credit_limit ?? 0;
    if (creditLimit < 0) {
      throw new SupplierRepoError('Credit limit cannot be negative', 400);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const supplierCode = await this.nextSupplierCode(client);

      const alternatePhone = dto.alternate_phone?.trim() || null;
      const email = dto.email?.trim() || null;
      const address = dto.address?.trim() || null;
      const notes = dto.notes?.trim() || null;

      await client.query(
        `INSERT INTO suppliers
           (id, supplier_code, name, phone, alternate_phone, email, address, notes,
            credit_limit, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, supplierCode, name, phone, alternatePhone, email, address, notes, creditLimit, 1, now, now]
      );

      await client.query('COMMIT');

      return {
        id,
        supplier_code: supplierCode,
        name,
        phone,
        alternate_phone: alternatePhone,
        email,
        address,
        notes,
        credit_limit: creditLimit,
        is_active: true,
        created_at: now,
        updated_at: now,
      };
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (err instanceof SupplierRepoError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
        throw new SupplierRepoError('Supplier code already exists', 409);
      }
      console.error('[SupplierRepo.createSupplier] Error:', err);
      throw new SupplierRepoError(`Failed to create supplier: ${msg}`, 500);
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // update_supplier
  // ---------------------------------------------------------------------------

  async updateSupplier(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const existing = await this.getSupplierById(id);
    if (!existing) {
      throw new SupplierRepoError(`Supplier with ID '${id}' not found`, 404);
    }

    const name = dto.name !== undefined && dto.name !== null ? dto.name.trim() : existing.name;
    const phone = dto.phone !== undefined && dto.phone !== null ? dto.phone.trim() : existing.phone;
    const alternatePhone =
      dto.alternate_phone !== undefined ? (dto.alternate_phone?.trim() || null) : existing.alternate_phone;
    const email =
      dto.email !== undefined ? (dto.email?.trim() || null) : existing.email;
    const address =
      dto.address !== undefined ? (dto.address?.trim() || null) : existing.address;
    const notes =
      dto.notes !== undefined ? (dto.notes?.trim() || null) : existing.notes;
    const creditLimit = dto.credit_limit !== undefined && dto.credit_limit !== null ? dto.credit_limit : existing.credit_limit;
    const isActive = dto.is_active !== undefined && dto.is_active !== null ? dto.is_active : existing.is_active;
    const now = new Date().toISOString();

    try {
      await this.pool.query(
        `UPDATE suppliers
         SET name = $1, phone = $2, alternate_phone = $3, email = $4,
             address = $5, notes = $6, credit_limit = $7, is_active = $8, updated_at = $9
         WHERE id = $10`,
        [name, phone, alternatePhone, email, address, notes, creditLimit, isActive ? 1 : 0, now, id]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.updateSupplier] Error:', err);
      throw new SupplierRepoError(`Failed to update supplier: ${msg}`, 500);
    }

    return {
      id,
      supplier_code: existing.supplier_code,
      name,
      phone,
      alternate_phone: alternatePhone,
      email,
      address,
      notes,
      credit_limit: creditLimit,
      is_active: isActive,
      created_at: existing.created_at,
      updated_at: now,
    };
  }

  // ---------------------------------------------------------------------------
  // get_supplier_by_id
  // ---------------------------------------------------------------------------

  async getSupplierById(id: string): Promise<Supplier | null> {
    const sql = `
      SELECT id, supplier_code, name, phone, alternate_phone, email, address, notes,
             credit_limit, is_active, created_at, updated_at
      FROM suppliers WHERE id = $1
    `;
    try {
      const result = await this.pool.query(sql, [id]);
      if (result.rows.length === 0) return null;
      return this.mapSupplierRow(result.rows[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.getSupplierById] Error:', err);
      throw new SupplierRepoError(`Failed to query supplier: ${msg}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // get_supplier_detail
  // ---------------------------------------------------------------------------

  async getSupplierDetail(id: string): Promise<SupplierDetailDto> {
    const supplier = await this.getSupplierById(id);
    if (!supplier) {
      throw new SupplierRepoError(`Supplier '${id}' not found`, 404);
    }

    const balance = await this.calculateOutstandingBalance(id);

    let purchasesCount = 0;
    let purchasesAmount = 0;
    try {
      const pr = await this.pool.query<{ cnt: string; amt: string }>(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0)::BIGINT AS amt
         FROM purchases WHERE supplier_id = $1 AND status = 'COMPLETED'`,
        [id]
      );
      if (pr.rows.length > 0) {
        purchasesCount = Number(pr.rows[0]!.cnt);
        purchasesAmount = Number(pr.rows[0]!.amt);
      }
    } catch {
      // Non-fatal: purchases aggregate unavailable
    }

    let lastTxDate: string | null = null;
    try {
      const lt = await this.pool.query<{ created_at: string }>(
        `SELECT created_at FROM supplier_ledger_entries
         WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      if (lt.rows.length > 0) {
        lastTxDate = lt.rows[0]!.created_at;
      }
    } catch {
      // Non-fatal
    }

    return {
      supplier,
      outstanding_balance: balance,
      total_purchases_count: purchasesCount,
      total_purchases_amount: purchasesAmount,
      last_transaction_date: lastTxDate,
    };
  }

  // ---------------------------------------------------------------------------
  // list_suppliers
  // Mirrors PostgresSupplierRepository::list_suppliers (postgres_supplier_repo.rs:214-293)
  // ---------------------------------------------------------------------------

  async listSuppliers(filter: SupplierFilter): Promise<SupplierSummaryDto[]> {
    let query = `
      SELECT s.id, s.supplier_code, s.name, s.phone, s.credit_limit,
             COALESCE(SUM(l.debit) - SUM(l.credit), 0)::BIGINT AS balance,
             s.is_active, s.created_at
      FROM suppliers s
      LEFT JOIN supplier_ledger_entries l ON s.id = l.supplier_id
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.is_active !== undefined && filter.is_active !== null) {
      query += ` AND s.is_active = $${paramIndex}`;
      params.push(filter.is_active ? 1 : 0);
      paramIndex++;
    }

    const searchTrim = filter.search?.trim();
    if (searchTrim) {
      query += ` AND (s.name ILIKE $${paramIndex} OR s.phone ILIKE $${paramIndex} OR s.supplier_code ILIKE $${paramIndex})`;
      params.push(`%${searchTrim}%`);
      paramIndex++;
    }

    query += ' GROUP BY s.id ORDER BY s.name ASC';

    if (filter.limit !== undefined && filter.limit !== null) {
      query += ` LIMIT ${Number(filter.limit)}`;
      if (filter.offset !== undefined && filter.offset !== null) {
        query += ` OFFSET ${Number(filter.offset)}`;
      }
    }

    try {
      const result = await this.pool.query(query, params);
      return result.rows.map((row) => ({
        id: row.id as string,
        supplier_code: row.supplier_code as string,
        name: row.name as string,
        phone: row.phone as string,
        credit_limit: Number(row.credit_limit),
        outstanding_balance: Number(row.balance ?? 0),
        is_active: Number(row.is_active) === 1,
        created_at: row.created_at as string,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.listSuppliers] Error:', err);
      throw new SupplierRepoError(`Failed to query supplier summaries: ${msg}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // search_suppliers
  // Mirrors PostgresSupplierRepository::search_suppliers (postgres_supplier_repo.rs:354-361)
  // ---------------------------------------------------------------------------

  async searchSuppliers(query: string): Promise<SupplierSummaryDto[]> {
    return this.listSuppliers({
      search: query,
      is_active: true,
      limit: 50,
      offset: null,
    });
  }

  // ---------------------------------------------------------------------------
  // calculate_outstanding_balance
  // ---------------------------------------------------------------------------

  async calculateOutstandingBalance(supplierId: string): Promise<number> {
    try {
      const result = await this.pool.query<{ balance: string }>(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS balance
         FROM supplier_ledger_entries WHERE supplier_id = $1`,
        [supplierId]
      );
      return Number(result.rows[0]?.balance ?? 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.calculateOutstandingBalance] Error:', err);
      throw new SupplierRepoError(`Failed to calculate supplier ledger balance: ${msg}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // get_ledger
  // Mirrors PostgresSupplierRepository::get_ledger (postgres_supplier_repo.rs:363-415)
  // ---------------------------------------------------------------------------

  async getLedger(supplierId: string, limit?: number | null, offset?: number | null): Promise<SupplierLedgerEntry[]> {
    const lim = limit ?? 100;
    const off = offset ?? 0;

    const sql = `
      SELECT id, supplier_id, reference_id, reference_number, entry_type,
             debit, credit, balance_after, description, performed_by, created_at
      FROM supplier_ledger_entries
      WHERE supplier_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await this.pool.query(sql, [supplierId, lim, off]);
      return result.rows.map((row) => ({
        id: row.id as string,
        supplier_id: row.supplier_id as string,
        reference_id: (row.reference_id as string | null) ?? null,
        reference_number: (row.reference_number as string | null) ?? null,
        entry_type: this.validateEntryType(row.entry_type as string),
        debit: Number(row.debit),
        credit: Number(row.credit),
        balance_after: Number(row.balance_after),
        description: row.description as string,
        performed_by: (row.performed_by as string | null) ?? null,
        created_at: row.created_at as string,
      }));
    } catch (err: unknown) {
      if (err instanceof SupplierRepoError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.getLedger] Error:', err);
      throw new SupplierRepoError(`Failed to query supplier ledger: ${msg}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // deactivate_supplier
  // Mirrors PostgresSupplierRepository::deactivate_supplier (postgres_supplier_repo.rs:417-430)
  // ---------------------------------------------------------------------------

  async deactivateSupplier(id: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      const result = await this.pool.query(
        'UPDATE suppliers SET is_active = 0, updated_at = $1 WHERE id = $2',
        [now, id]
      );
      if (result.rowCount === 0) {
        throw new SupplierRepoError(`Supplier '${id}' not found`, 404);
      }
    } catch (err: unknown) {
      if (err instanceof SupplierRepoError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SupplierRepo.deactivateSupplier] Error:', err);
      throw new SupplierRepoError(`Failed to deactivate supplier: ${msg}`, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // get_statement
  // Returns rich statement DTO for /api/v1/suppliers/:id/ledger endpoint.
  // Mirrors SQLiteSupplierRepository::get_statement (supplier_repository.rs:481-514)
  // ---------------------------------------------------------------------------

  async getStatement(supplierId: string): Promise<SupplierStatementDto> {
    const supplier = await this.getSupplierById(supplierId);
    if (!supplier) {
      throw new SupplierRepoError(`Supplier '${supplierId}' not found`, 404);
    }

    const balance = await this.calculateOutstandingBalance(supplierId);
    const rawEntries = await this.getLedger(supplierId, 1000, 0);

    const entries: SupplierStatementRowDto[] = rawEntries.map((e) => ({
      id: e.id,
      date: e.created_at,
      reference_number: e.reference_number,
      description: e.description,
      entry_type: e.entry_type,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance_after,
    }));

    return {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_code: supplier.supplier_code,
      phone: supplier.phone,
      credit_limit: supplier.credit_limit,
      current_balance: balance,
      entries,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapSupplierRow(row: Record<string, unknown>): Supplier {
    return {
      id: row['id'] as string,
      supplier_code: row['supplier_code'] as string,
      name: row['name'] as string,
      phone: row['phone'] as string,
      alternate_phone: (row['alternate_phone'] as string | null) ?? null,
      email: (row['email'] as string | null) ?? null,
      address: (row['address'] as string | null) ?? null,
      notes: (row['notes'] as string | null) ?? null,
      credit_limit: Number(row['credit_limit'] ?? 0),
      is_active: Number(row['is_active']) === 1,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
    };
  }

  private validateEntryType(s: string): SupplierLedgerEntryType {
    if (s === 'PURCHASE' || s === 'PAYMENT' || s === 'ADJUSTMENT') {
      return s;
    }
    return 'PURCHASE';
  }
}
