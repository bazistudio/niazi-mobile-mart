/**
 * Shared primitive types for the TypeScript business layer.
 *
 * These are transport-agnostic. They carry no knowledge of Tauri, HTTP,
 * SQLite, or PostgreSQL.
 */

/** A function that checks whether the current user holds a named permission. */
export type PermissionChecker = (permission: string) => boolean;

/** Generic paginated result wrapper. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Common pagination query parameters. */
export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

/** ISO-8601 datetime string (e.g. "2024-01-15T10:30:00Z"). */
export type IsoDateTimeString = string;

/** UUID v4 string. */
export type Uuid = string;

/** Monetary amount in whole PKR rupees (integer). */
export type PkrAmount = number;
