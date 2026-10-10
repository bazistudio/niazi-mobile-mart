/**
 * Argon2 Service — Native Node.js Argon2id password and PIN hashing/verification.
 *
 * Replaces the former Rust sidecar HTTP delegation with the native `argon2` npm package.
 * Fully compatible with existing stored Argon2id PHC hashes in PostgreSQL.
 */

import argon2 from 'argon2';

/**
 * Verify a plaintext credential against an Argon2id PHC hash.
 * Automatically parses hash parameters ($argon2id$v=19$...) from existing database hashes.
 */
export async function verifyArgon2(plaintext: string, hash: string): Promise<boolean> {
  if (!hash || !plaintext) return false;
  try {
    return await argon2.verify(hash, plaintext);
  } catch (err) {
    console.error('[argon2] Verification error:', (err as Error).message);
    return false;
  }
}

/**
 * Hash a plaintext credential using standard Argon2id.
 * Produces PHC-formatted Argon2id hash compatible with the Rust backend output.
 */
export async function hashArgon2(plaintext: string): Promise<string> {
  if (!plaintext) {
    throw new Error('Cannot hash empty credential');
  }
  return await argon2.hash(plaintext, {
    type: argon2.argon2id,
  });
}

