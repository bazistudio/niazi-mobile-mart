/**
 * Branch Repository — TypeScript/PostgreSQL (Phase 4 migration)
 *
 * PostgreSQL is the ONLINE AUTHORITY for Branch operations.
 * Mirrors src-tauri/src/repositories/postgres_branch_repo.rs behavior.
 *
 * Branch table schema (001_initial_schema.sql):
 *   id             TEXT PRIMARY KEY (UUID)
 *   organization_id TEXT NOT NULL REFERENCES organizations(id)
 *   name           TEXT NOT NULL
 *   code           TEXT NOT NULL UNIQUE
 *   is_active      INT NOT NULL DEFAULT 1
 *   created_at     TEXT NOT NULL
 *   updated_at     TEXT NOT NULL
 *
 * Code generation mirrors Rust:
 *   format!("{}-{}", code_prefix, &new_id[..4]).to_uppercase()
 *   e.g., name="Main Branch" → prefix="MAINBRANCH" → code="MAINB-A3F2"
 *   (first word / simplified from name, then dash + first 4 of UUID)
 *
 * IMPORTANT: DO NOT implement Party here.
 * IMPORTANT: DO NOT add sync infrastructure here.
 */

import { Pool } from 'pg';

// ─── Domain types ──────────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  is_active: number; // 1 = active, 0 = inactive
  created_at: string;
  updated_at: string;
}

export interface CreateBranchDto {
  name: string;
  organization_id?: string | null;
  is_active?: number;
}

export interface UpdateBranchDto {
  name?: string;
  is_active?: number;
}

// ─── Repo Error ────────────────────────────────────────────────────────────────

export class BranchRepoError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'BranchRepoError';
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class BranchRepo {
  constructor(private readonly pool: Pool) {}

  // ---------------------------------------------------------------------------
  // List all branches
  // Mirrors postgres_branch_repo.rs::list_branches()
  // ---------------------------------------------------------------------------
  async listBranches(): Promise<Branch[]> {
    const result = await this.pool.query<Branch>(
      `SELECT id, organization_id, name, code, is_active, created_at, updated_at
       FROM branches
       ORDER BY name ASC`
    );
    return result.rows;
  }

  // ---------------------------------------------------------------------------
  // Get branch by ID
  // Mirrors postgres_branch_repo.rs::get_branch_by_id()
  // ---------------------------------------------------------------------------
  async getBranchById(id: string): Promise<Branch | null> {
    const result = await this.pool.query<Branch>(
      `SELECT id, organization_id, name, code, is_active, created_at, updated_at
       FROM branches
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Create branch
  // Mirrors postgres_branch_repo.rs::create_branch()
  // Code generation: derive prefix from name (alphanumeric, uppercase, max 8 chars)
  //   then append dash + first 4 chars of UUID.
  // ---------------------------------------------------------------------------
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const now = new Date().toISOString();

    // Derive code prefix from name (mirrors Rust code generation)
    const codePrefix = dto.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 8);
    const codeSuffix = id.replace(/-/g, '').substring(0, 4).toUpperCase();
    const code = `${codePrefix}-${codeSuffix}`;

    // Default organization ID (the seeded org ID from 001_initial_schema.sql)
    const organizationId =
      dto.organization_id?.trim() || '00000000-0000-0000-0000-000000000001';

    try {
      const result = await this.pool.query<Branch>(
        `INSERT INTO branches (id, organization_id, name, code, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, organization_id, name, code, is_active, created_at, updated_at`,
        [
          id,
          organizationId,
          dto.name.trim(),
          code,
          dto.is_active ?? 1,
          now,
          now,
        ]
      );
      return result.rows[0]!;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        throw new BranchRepoError(
          `Branch code '${code}' already exists. Please try again.`,
          409,
          'CONFLICT'
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Update branch
  // ---------------------------------------------------------------------------
  async updateBranch(id: string, dto: UpdateBranchDto): Promise<Branch> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(dto.name.trim());
    }
    if (dto.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(dto.is_active);
    }

    if (fields.length === 0) {
      const existing = await this.getBranchById(id);
      if (!existing) {
        throw new BranchRepoError(`Branch '${id}' not found`, 404, 'NOT_FOUND');
      }
      return existing;
    }

    fields.push(`updated_at = $${idx++}`);
    values.push(now);
    values.push(id);

    const result = await this.pool.query<Branch>(
      `UPDATE branches
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, organization_id, name, code, is_active, created_at, updated_at`,
      values
    );

    if (!result.rows[0]) {
      throw new BranchRepoError(`Branch '${id}' not found`, 404, 'NOT_FOUND');
    }
    return result.rows[0];
  }

  // ---------------------------------------------------------------------------
  // Get aggregate dashboard balances (organization-wide)
  // Mirrors postgres_branch_repo.rs::get_dashboard_balances()
  // ---------------------------------------------------------------------------
  async getDashboardBalances(): Promise<{ customer_receivables: number; supplier_payables: number }> {
    const custRes = await this.pool.query<{ customer_receivables: string }>(
      `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS customer_receivables FROM customer_ledger_entries`
    );
    const suppRes = await this.pool.query<{ supplier_payables: string }>(
      `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::BIGINT AS supplier_payables FROM supplier_ledger_entries`
    );
    return {
      customer_receivables: Number(custRes.rows[0]?.customer_receivables ?? 0),
      supplier_payables: Number(suppRes.rows[0]?.supplier_payables ?? 0),
    };
  }
}
