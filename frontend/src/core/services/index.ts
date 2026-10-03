/**
 * Service layer contract.
 *
 * Business services live here in future phases. Each service:
 *   - accepts a Repository interface (never a concrete transport)
 *   - accepts a PermissionChecker
 *   - throws only errors from @/core/errors
 *   - is ignorant of Tauri, HTTP, SQLite, and PostgreSQL
 *
 * Example (added in a future phase):
 *
 *   import { createProductService } from '@/core/services/product.service';
 *   import { tauriProductRepository } from '@/features/inventory/repositories/product.repository';
 *   import { usePermissions } from '@/lib/auth/usePermissions';
 *
 *   const productService = createProductService(tauriProductRepository, can);
 */

export {};
