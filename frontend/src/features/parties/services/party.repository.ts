// Party repository (Phase 1.1): the only place the Parties feature touches the typed
// Tauri bridge. Keeps the service testable with an in-memory implementation.

import {
  tauriClient,
  type CreatePartyDto,
  type PartyFilter,
  type PartySummaryDto,
  type UpdatePartyDto,
} from '@/lib/tauri/tauriClient';

export interface PartyRepository {
  list(filter?: PartyFilter): Promise<PartySummaryDto[]>;
  get(id: string): Promise<PartySummaryDto>;
  create(dto: CreatePartyDto): Promise<PartySummaryDto>;
  update(id: string, dto: UpdatePartyDto): Promise<PartySummaryDto>;
}

export const tauriPartyRepository: PartyRepository = {
  list: (filter) => tauriClient.partyList(filter),
  get: (id) => tauriClient.partyGet(id),
  create: (dto) => tauriClient.partyCreate(dto),
  update: (id, dto) => tauriClient.partyUpdate(id, dto),
};
