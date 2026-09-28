// Party application service (Phase 1.1).
//
// Owns the Parties workflow in the TypeScript application layer: permission checks
// (parties.view / parties.manage — same keys as navigation and the role matrix),
// input rules, and mapping to the UI view model. Persistence, the atomic local
// transaction and the sync outbox live behind the typed bridge (Rust/SQLite).
// The central server enforces RBAC independently on /api/v1/parties.

import {
  PartyValidationError,
  toCreatePartyDto,
  toPartyView,
  toUpdatePartyDto,
  type PartyFormInput,
  type PartyType,
  type PartyView,
} from '../domain/party.domain';
import type { PartyRepository } from './party.repository';

export const PARTY_PERMISSIONS = {
  VIEW: 'parties.view',
  MANAGE: 'parties.manage',
} as const;

export class PartyPermissionError extends Error {
  constructor(permission: string) {
    super(`You do not have permission for this action (${permission}).`);
    this.name = 'PartyPermissionError';
  }
}

export type PermissionChecker = (permission: string) => boolean;

export interface PartyListQuery {
  search?: string;
  type?: PartyType;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface PartyService {
  list(query?: PartyListQuery): Promise<PartyView[]>;
  get(id: string): Promise<PartyView>;
  create(input: PartyFormInput): Promise<PartyView>;
  update(id: string, input: PartyFormInput): Promise<PartyView>;
  setActive(id: string, isActive: boolean): Promise<PartyView>;
}

export function createPartyService(repo: PartyRepository, can: PermissionChecker): PartyService {
  const requirePermission = (permission: string) => {
    if (!can(permission)) throw new PartyPermissionError(permission);
  };
  const requireId = (id: string) => {
    if (!id || !id.trim()) throw new PartyValidationError('Party ID is required');
    return id.trim();
  };

  return {
    async list(query = {}) {
      requirePermission(PARTY_PERMISSIONS.VIEW);
      const rows = await repo.list({
        search: query.search?.trim() || undefined,
        party_type: query.type,
        is_active: query.isActive,
        limit: query.limit,
        offset: query.offset,
      });
      return rows.map(toPartyView);
    },

    async get(id) {
      requirePermission(PARTY_PERMISSIONS.VIEW);
      return toPartyView(await repo.get(requireId(id)));
    },

    async create(input) {
      requirePermission(PARTY_PERMISSIONS.MANAGE);
      return toPartyView(await repo.create(toCreatePartyDto(input)));
    },

    async update(id, input) {
      requirePermission(PARTY_PERMISSIONS.MANAGE);
      const partyId = requireId(id);
      const existing = await repo.get(partyId);
      return toPartyView(await repo.update(partyId, toUpdatePartyDto(input, existing.party_type)));
    },

    async setActive(id, isActive) {
      requirePermission(PARTY_PERMISSIONS.MANAGE);
      return toPartyView(await repo.update(requireId(id), { is_active: isActive }));
    },
  };
}
