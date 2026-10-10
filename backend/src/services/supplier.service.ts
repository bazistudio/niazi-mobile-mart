/**
 * Supplier Service — TypeScript/Express
 *
 * Business logic layer for online Supplier operations.
 * Wraps SupplierRepo with input validation and error translation.
 * Mirrors src-tauri/src/services/supplier_service.rs (Postgres path only).
 *
 * MIGRATION SCOPE: Language migration only — no new features, no Party domain.
 *
 * Authorization note:
 *   All authorization is enforced at the route layer via authMiddleware +
 *   authorizePermission. This service does not re-check authorization.
 *
 * Party dependency:
 *   suppliers.party_id column exists in the schema. Party domain is NOT
 *   implemented in Phase 2. This service does not read or write party_id.
 *   Party integration will be addressed in the Customer migration phase.
 */

import { Pool } from 'pg';
import {
  SupplierRepo,
  SupplierRepoError,
  type Supplier,
  type SupplierSummaryDto,
  type SupplierDetailDto,
  type SupplierLedgerEntry,
  type SupplierStatementDto,
  type CreateSupplierDto,
  type UpdateSupplierDto,
  type SupplierFilter,
} from '../repositories/supplier.repo';

// ─── Service Error ─────────────────────────────────────────────────────────────

export class SupplierServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SupplierServiceError';
  }
}

// ─── Re-export domain types for route layer convenience ──────────────────────

export type {
  Supplier,
  SupplierSummaryDto,
  SupplierDetailDto,
  SupplierLedgerEntry,
  SupplierStatementDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierFilter,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class SupplierService {
  private readonly repo: SupplierRepo;

  constructor(pool: Pool) {
    this.repo = new SupplierRepo(pool);
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    if (typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new SupplierServiceError('Supplier name cannot be empty', 400, 'VALIDATION');
    }
    if (typeof dto.phone !== 'string' || !dto.phone.trim()) {
      throw new SupplierServiceError('Supplier phone number cannot be empty', 400, 'VALIDATION');
    }
    if (dto.credit_limit !== undefined && dto.credit_limit !== null && dto.credit_limit < 0) {
      throw new SupplierServiceError('Credit limit cannot be negative', 400, 'VALIDATION');
    }

    try {
      return await this.repo.createSupplier(dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'create_supplier');
    }
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  async updateSupplier(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    if (!id?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    if (dto.credit_limit !== undefined && dto.credit_limit !== null && dto.credit_limit < 0) {
      throw new SupplierServiceError('Credit limit cannot be negative', 400, 'VALIDATION');
    }

    try {
      return await this.repo.updateSupplier(id, dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'update_supplier');
    }
  }

  // ---------------------------------------------------------------------------
  // get by id
  // ---------------------------------------------------------------------------

  async getSupplierById(id: string): Promise<Supplier> {
    if (!id?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    try {
      const supplier = await this.repo.getSupplierById(id);
      if (!supplier) {
        throw new SupplierServiceError(`Supplier '${id}' not found`, 404, 'NOT_FOUND');
      }
      return supplier;
    } catch (err: unknown) {
      throw this.translateError(err, 'get_supplier_by_id');
    }
  }

  // ---------------------------------------------------------------------------
  // get detail
  // ---------------------------------------------------------------------------

  async getSupplierDetail(id: string): Promise<SupplierDetailDto> {
    if (!id?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    try {
      return await this.repo.getSupplierDetail(id);
    } catch (err: unknown) {
      throw this.translateError(err, 'get_supplier_detail');
    }
  }

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  async listSuppliers(filter: SupplierFilter): Promise<SupplierSummaryDto[]> {
    try {
      return await this.repo.listSuppliers(filter);
    } catch (err: unknown) {
      throw this.translateError(err, 'list_suppliers');
    }
  }

  // ---------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------

  async searchSuppliers(query: string): Promise<SupplierSummaryDto[]> {
    try {
      return await this.repo.searchSuppliers(query ?? '');
    } catch (err: unknown) {
      throw this.translateError(err, 'search_suppliers');
    }
  }

  // ---------------------------------------------------------------------------
  // ledger
  // ---------------------------------------------------------------------------

  async getSupplierLedger(
    supplierId: string,
    limit?: number | null,
    offset?: number | null
  ): Promise<SupplierLedgerEntry[]> {
    if (!supplierId?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    // Verify supplier exists before returning ledger
    try {
      const exists = await this.repo.getSupplierById(supplierId);
      if (!exists) {
        throw new SupplierServiceError(`Supplier '${supplierId}' not found`, 404, 'NOT_FOUND');
      }
      return await this.repo.getLedger(supplierId, limit, offset);
    } catch (err: unknown) {
      throw this.translateError(err, 'get_supplier_ledger');
    }
  }

  // ---------------------------------------------------------------------------
  // deactivate
  // ---------------------------------------------------------------------------

  async deactivateSupplier(id: string): Promise<void> {
    if (!id?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    try {
      await this.repo.deactivateSupplier(id);
    } catch (err: unknown) {
      throw this.translateError(err, 'deactivate_supplier');
    }
  }

  // ---------------------------------------------------------------------------
  // get_statement (for /api/v1/suppliers/:id/ledger)
  // Mirrors Rust get_statement handler (server.rs:1090)
  // ---------------------------------------------------------------------------

  async getStatement(supplierId: string): Promise<SupplierStatementDto> {
    if (!supplierId?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    try {
      return await this.repo.getStatement(supplierId);
    } catch (err: unknown) {
      throw this.translateError(err, 'get_statement');
    }
  }

  // ---------------------------------------------------------------------------
  // balance (convenience for IPC command mirror)
  // ---------------------------------------------------------------------------

  async getSupplierBalance(supplierId: string): Promise<number> {
    if (!supplierId?.trim()) {
      throw new SupplierServiceError('Supplier ID is required', 400, 'VALIDATION');
    }
    try {
      const exists = await this.repo.getSupplierById(supplierId);
      if (!exists) {
        throw new SupplierServiceError(`Supplier '${supplierId}' not found`, 404, 'NOT_FOUND');
      }
      return await this.repo.calculateOutstandingBalance(supplierId);
    } catch (err: unknown) {
      throw this.translateError(err, 'get_supplier_balance');
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private translateError(err: unknown, operation: string): SupplierServiceError {
    if (err instanceof SupplierServiceError) return err;
    if (err instanceof SupplierRepoError) {
      return new SupplierServiceError(err.message, err.statusCode);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SupplierService.${operation}] Unexpected error:`, err);
    return new SupplierServiceError(`Internal error in ${operation}: ${msg}`, 500, 'INTERNAL');
  }
}
