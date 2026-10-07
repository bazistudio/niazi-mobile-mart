/**
 * Branch Service — TypeScript/Express (Phase 4 migration)
 *
 * Business logic layer for online Branch operations.
 * Wraps BranchRepo with input validation and error translation.
 * Mirrors postgres_branch_repo.rs behavioral reference.
 *
 * MIGRATION SCOPE: Branch creation/listing/retrieval only.
 * No Party domain. No sync infrastructure.
 */

import { Pool } from 'pg';
import {
  BranchRepo,
  BranchRepoError,
  type Branch,
  type CreateBranchDto,
  type UpdateBranchDto,
} from '../repositories/branch.repo';

// ─── Service Error ─────────────────────────────────────────────────────────────

export class BranchServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'BranchServiceError';
  }
}

// ─── Re-export domain types ──────────────────────────────────────────────────

export type { Branch, CreateBranchDto, UpdateBranchDto };

// ─── Service ──────────────────────────────────────────────────────────────────

export class BranchService {
  private readonly repo: BranchRepo;

  constructor(pool: Pool) {
    this.repo = new BranchRepo(pool);
  }

  // ---------------------------------------------------------------------------
  // List all branches
  // ---------------------------------------------------------------------------
  async listBranches(): Promise<Branch[]> {
    try {
      return await this.repo.listBranches();
    } catch (err: unknown) {
      throw this.translateError(err, 'list_branches');
    }
  }

  // ---------------------------------------------------------------------------
  // Get branch by ID
  // ---------------------------------------------------------------------------
  async getBranchById(id: string): Promise<Branch> {
    if (!id?.trim()) {
      throw new BranchServiceError('Branch ID is required', 400, 'VALIDATION');
    }
    try {
      const branch = await this.repo.getBranchById(id);
      if (!branch) {
        throw new BranchServiceError(`Branch '${id}' not found`, 404, 'NOT_FOUND');
      }
      return branch;
    } catch (err: unknown) {
      throw this.translateError(err, 'get_branch_by_id');
    }
  }

  // ---------------------------------------------------------------------------
  // Create branch
  // Preserves existing Rust branch creation rules:
  //   - name is required and non-empty
  //   - code is auto-generated from name + UUID prefix
  //   - organization_id defaults to the single organization
  // ---------------------------------------------------------------------------
  async createBranch(dto: CreateBranchDto): Promise<Branch> {
    if (typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new BranchServiceError('Branch name is required', 400, 'VALIDATION');
    }
    if (dto.name.trim().length > 100) {
      throw new BranchServiceError('Branch name cannot exceed 100 characters', 400, 'VALIDATION');
    }

    try {
      return await this.repo.createBranch(dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'create_branch');
    }
  }

  // ---------------------------------------------------------------------------
  // Update branch
  // ---------------------------------------------------------------------------
  async updateBranch(id: string, dto: UpdateBranchDto): Promise<Branch> {
    if (!id?.trim()) {
      throw new BranchServiceError('Branch ID is required', 400, 'VALIDATION');
    }
    if (dto.name !== undefined && (!dto.name || !dto.name.trim())) {
      throw new BranchServiceError('Branch name cannot be empty', 400, 'VALIDATION');
    }

    try {
      return await this.repo.updateBranch(id, dto);
    } catch (err: unknown) {
      throw this.translateError(err, 'update_branch');
    }
  }

  // ---------------------------------------------------------------------------
  // Get dashboard balances
  // ---------------------------------------------------------------------------
  async getDashboardBalances(): Promise<{ customer_receivables: number; supplier_payables: number }> {
    try {
      return await this.repo.getDashboardBalances();
    } catch (err: unknown) {
      throw this.translateError(err, 'get_dashboard_balances');
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  private translateError(err: unknown, operation: string): BranchServiceError {
    if (err instanceof BranchServiceError) return err;
    if (err instanceof BranchRepoError) {
      return new BranchServiceError(err.message, err.statusCode, err.code);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BranchService.${operation}] Unexpected error:`, err);
    return new BranchServiceError(`Internal error in ${operation}: ${msg}`, 500, 'INTERNAL');
  }
}
