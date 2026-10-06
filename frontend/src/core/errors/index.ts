/**
 * Core error types for the TypeScript business layer.
 *
 * These are the only error classes the business layer should throw.
 * Infrastructure-specific errors (Tauri IPC errors, HTTP errors, etc.)
 * must be caught at the repository adapter boundary and re-thrown as one
 * of these types so the service layer stays ignorant of the transport.
 */

/** Raised when user input fails validation rules. */
export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

/** Raised when the caller lacks the required permission. */
export class DomainPermissionError extends Error {
  readonly permission: string;
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = 'DomainPermissionError';
    this.permission = permission;
  }
}

/** Raised when a requested entity does not exist. */
export class DomainNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'DomainNotFoundError';
  }
}

/** Raised when the backend / application boundary returns an error. */
export class ApplicationBoundaryError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ApplicationBoundaryError';
    this.cause = cause;
  }
}
