/**
 * JWT Service — TypeScript implementation of RS256 JWT issuance and verification.
 *
 * COMPATIBILITY CONTRACT (Phase 1 Migration):
 *   - Algorithm:  RS256 (RSA-2048, same as Rust token_service.rs)
 *   - Claims:     sub, username, role, access_profile, branch_id, iat, exp
 *   - Expiry:     86400 seconds (24 hours) — same as Rust
 *   - Key:        JWT_PRIVATE_KEY env var (same key as Rust; NOT ROTATED in Phase 1)
 *   - Public key: JWT_PUBLIC_KEY env var (same key as Rust)
 *
 * Existing tokens issued by Rust remain valid because the same key is used.
 * Existing desktop clients (v1.3.13) will be able to continue without re-login.
 *
 * Mirrors: src-tauri/src/services/token_service.rs
 */

import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { AccessProfile } from '../repositories/auth.repo';

// ---------------------------------------------------------------------------
// JWT Claims — must exactly match Rust Claims struct in token_service.rs
// ---------------------------------------------------------------------------

export interface JwtClaims {
  sub: string;             // user UUID
  username: string;
  role: string;
  access_profile: AccessProfile;
  branch_id: string | null | undefined;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Key Loading
// ---------------------------------------------------------------------------

function loadPrivateKey(): string {
  const raw = process.env['JWT_PRIVATE_KEY'];
  if (raw && raw.trim()) {
    return raw.trim().replace(/\\n/g, '\n');
  }
  // Fallback: look for local file (dev only — not available in production)
  const candidates = [
    path.join(process.cwd(), 'jwt_private.pem'),
    path.join(process.cwd(), '..', 'jwt_private.pem'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').trim();
      }
    } catch { /* skip */ }
  }
  throw new Error('FATAL: JWT_PRIVATE_KEY environment variable is required for token issuance');
}

function loadPublicKey(): string {
  const raw = process.env['JWT_PUBLIC_KEY'];
  if (raw && raw.trim()) {
    return raw.trim().replace(/\\n/g, '\n');
  }
  // Fallback: check embedded public key (same path as auth.ts)
  const candidates = [
    path.join(process.cwd(), 'jwt_pub.pem'),
    path.join(process.cwd(), '..', 'jwt_pub.pem'),
    path.join(process.cwd(), 'src-tauri', 'src', 'services', 'jwt_public_key.pem'),
    path.join(process.cwd(), '..', 'src-tauri', 'src', 'services', 'jwt_public_key.pem'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').trim();
      }
    } catch { /* skip */ }
  }
  throw new Error('FATAL: JWT_PUBLIC_KEY environment variable is required');
}

// ---------------------------------------------------------------------------
// JWT Service
// ---------------------------------------------------------------------------

/** Token expiry in seconds — must match Rust: let exp = now + 86400 */
const TOKEN_EXPIRY_SECS = 86400;

/**
 * Issue a signed RS256 JWT for a user.
 * Claims structure exactly mirrors Rust token_service.rs::Claims.
 *
 * Do NOT call this in routes — only call from the auth service after
 * successful credential verification.
 */
export function issueToken(params: {
  userId: string;
  username: string;
  role: string;
  accessProfile: AccessProfile;
  branchId: string | null;
}): string {
  const privateKey = loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const claims: JwtClaims = {
    sub: params.userId,
    username: params.username,
    role: params.role,
    access_profile: params.accessProfile,
    branch_id: params.branchId,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECS,
  };

  return jwt.sign(claims, privateKey, { algorithm: 'RS256' });
}

/**
 * Verify and decode an RS256 JWT.
 * Returns the decoded claims or throws on invalid/expired token.
 */
export function verifyToken(token: string): JwtClaims {
  const publicKey = loadPublicKey();
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as JwtClaims;
}
