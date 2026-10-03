/**
 * Application boundary interface.
 *
 * This is the contract between the TypeScript business layer and the
 * underlying backend — whether that backend is reached via:
 *   - Tauri IPC  (tauriClient.ts)   — desktop mode
 *   - HTTP fetch (httpClient.ts)    — online / browser mode
 *
 * Future domain repositories extend this interface. The TypeScript service
 * layer depends ONLY on these interfaces; it never imports tauriClient,
 * httpClient, or any transport detail directly.
 *
 * Example (added in a future phase):
 *
 *   import type { ProductRepository } from '@/core/repositories';
 *
 *   export class ProductService {
 *     constructor(private readonly repo: ProductRepository) {}
 *   }
 */

/**
 * Marker interface that all repository contracts extend.
 * Provides a uniform base so generic tooling can reference "any repository".
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Repository {}
