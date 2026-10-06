/**
 * @/core — TypeScript Business Layer Foundation
 *
 * Architecture:
 *
 *   React UI  (frontend/src/features/ or frontend/src/pages/)
 *      ↓  imports service instances
 *   TypeScript Business Layer  (@/core/services/)
 *      ↓  depends on interfaces only
 *   Application Boundary  (@/core/repositories/)
 *      ↓  implemented by adapters in each feature
 *   Tauri IPC adapter  (@/lib/tauri/tauriClient.ts)   — desktop
 *   HTTP adapter       (@/lib/http/httpClient.ts)      — online / browser
 *      ↓
 *   Rust / Axum backend
 *
 * Sub-modules:
 *   @/core/types       — shared primitive types (Uuid, PkrAmount, Page<T>, …)
 *   @/core/errors      — domain error classes (DomainValidationError, …)
 *   @/core/repositories — Repository marker interface; domain repos extend it
 *   @/core/services    — service factories (empty until Phase 2+)
 *   @/core/domain      — pure business rules, validation, mappers (empty until Phase 2+)
 *
 * Phase 1 Rule: this file and its sub-modules contain NO business logic.
 *               All existing Rust business logic remains untouched.
 */

export * from './types';
export * from './errors';
export * from './repositories';
