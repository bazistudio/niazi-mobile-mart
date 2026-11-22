// src/features/inventory/services/masterDataCacheHelper.ts
//
// PACKAGE 3B-C: Master data cache envelope, organization scoping,
// safe expiration validation, and conservative legacy key cleanup.

import { useOrganizationStore } from '@/store/useOrganizationStore';

export const MASTER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours maximum cache age

export interface MasterCacheEnvelope<T> {
  organizationId: string;
  savedAt: number;
  ttlMs: number;
  data: T[];
}

/**
 * Returns current active organization ID or null if unauthenticated / unselected.
 */
export function getActiveOrganizationId(): string | null {
  try {
    const store = useOrganizationStore.getState();
    return store.activeOrganization?._id || store.activeOrganizationId || null;
  } catch {
    return null;
  }
}

/**
 * Build an organization-scoped storage key.
 */
export function buildScopedKey(domain: string, orgId: string): string {
  return `niazi_master_${orgId}_${domain}`;
}

/**
 * Read cached master data with strict organization ownership and expiration checks.
 */
export function readScopedMasterData<T>(domain: string, defaultFallback: T[] = []): T[] {
  if (typeof window === 'undefined') return defaultFallback;

  const orgId = getActiveOrganizationId();
  if (!orgId) {
    // When no organization is selected, never return cached data from another organization
    return defaultFallback;
  }

  const key = buildScopedKey(domain, orgId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultFallback;

    const envelope: MasterCacheEnvelope<T> = JSON.parse(raw);
    if (!envelope || typeof envelope !== 'object') {
      localStorage.removeItem(key);
      return defaultFallback;
    }

    // Tenant identity validation
    if (envelope.organizationId !== orgId) {
      console.warn(`[masterCacheHelper] Mismatched organization ID in cache key ${key}`);
      localStorage.removeItem(key);
      return defaultFallback;
    }

    // Expiration check (24-hour TTL)
    const now = Date.now();
    const age = now - (envelope.savedAt || 0);
    const maxAge = envelope.ttlMs || MASTER_CACHE_TTL_MS;
    if (age > maxAge || age < 0) {
      console.info(`[masterCacheHelper] Expired cache entry for ${key} (age: ${age}ms). Discarding.`);
      localStorage.removeItem(key);
      return defaultFallback;
    }

    if (Array.isArray(envelope.data) && envelope.data.length > 0) {
      return envelope.data;
    }
  } catch (err) {
    console.warn(`[masterCacheHelper] Failed to read cached ${domain}:`, err);
    try { localStorage.removeItem(key); } catch {}
  }

  return defaultFallback;
}

/**
 * Write cached master data with organization envelope and timestamp.
 */
export function writeScopedMasterData<T>(domain: string, data: T[]): void {
  if (typeof window === 'undefined') return;

  const orgId = getActiveOrganizationId();
  if (!orgId) {
    // Cannot cache without authenticated tenant context
    return;
  }

  const key = buildScopedKey(domain, orgId);
  try {
    const envelope: MasterCacheEnvelope<T> = {
      organizationId: orgId,
      savedAt: Date.now(),
      ttlMs: MASTER_CACHE_TTL_MS,
      data,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch (err) {
    console.warn(`[masterCacheHelper] Failed to persist ${domain} cache:`, err);
  }
}

/**
 * Remove legacy unscoped keys and volatile master caches safely.
 * Preserves durable offline transactions, auth sessions, and sync queues.
 */
export function purgeVolatileMasterDataCaches(): void {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Match unscoped legacy keys: niazi_master_categories, etc.
      // Match scoped keys: niazi_master_<orgId>_<domain>
      if (k.startsWith('niazi_master_')) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    if (keysToRemove.length > 0) {
      console.info(`[masterCacheHelper] Purged ${keysToRemove.length} volatile master data cache keys.`);
    }
  } catch (err) {
    console.warn('[masterCacheHelper] Error purging volatile master caches:', err);
  }
}
