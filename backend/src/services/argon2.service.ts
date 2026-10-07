/**
 * Argon2 Service — delegates credential hashing/verification to the Rust sidecar.
 *
 * In the Docker production container, TypeScript Express runs on $PORT (8080)
 * and the Rust Axum server runs on RUST_SIDECAR_PORT (default 8081).
 * The Rust server exposes two localhost-only internal endpoints:
 *
 *   POST /internal/argon2/verify  { hash, plaintext } → { valid: boolean }
 *   POST /internal/argon2/hash    { plaintext }        → { hash: string }
 *
 * These endpoints are NOT forwarded by the TypeScript reverse-proxy, so they
 * remain inaccessible from the public internet.
 *
 * This design:
 *   - Avoids adding native Node.js argon2 bindings (which require build tooling)
 *   - Reuses the existing Rust argon2 implementation (zero divergence risk)
 *   - Keeps TypeScript as the complete auth flow owner (logic, JWT, users)
 *   - Delegating only the hash computation to the co-located Rust process
 *
 * Phase 2: Once the npm argon2 package is available in the build environment,
 * this can be replaced with a direct Node.js implementation and the
 * /internal/* Rust endpoints retired.
 */

import http from 'http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Port that the Rust Axum sidecar listens on (internal only). */
function getRustSidecarPort(): number {
  const env = process.env['RUST_SIDECAR_PORT'] || process.env['RUST_INTERNAL_PORT'];
  if (env) {
    const p = parseInt(env, 10);
    if (!isNaN(p)) return p;
  }
  // Default: Rust sidecar runs on 8081 in Docker.
  // In local dev without the sidecar, RUST_SIDECAR_PORT can be set to 8080
  // to call the same-port Rust server (but then TypeScript would need a
  // different port — see docker-entrypoint.sh).
  return 8081;
}

function getRustSidecarBase(): string {
  return `http://127.0.0.1:${getRustSidecarPort()}`;
}

// ---------------------------------------------------------------------------
// HTTP helper (no external dependencies — uses Node built-in http)
// ---------------------------------------------------------------------------

async function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: parseInt(urlObj.port, 10) || 80,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as Record<string, unknown>);
          } catch {
            reject(new Error(`Argon2 sidecar returned non-JSON: ${data}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(new Error(`Argon2 sidecar connection error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Argon2 sidecar request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a plaintext credential against an Argon2id PHC hash.
 *
 * Calls the Rust sidecar's /internal/argon2/verify endpoint.
 * This is timing-safe (argon2 is constant-time by design).
 *
 * @throws Error if the sidecar is unreachable (treated as auth failure)
 */
export async function verifyArgon2(plaintext: string, hash: string): Promise<boolean> {
  try {
    const base = getRustSidecarBase();
    const result = await postJson(`${base}/internal/argon2/verify`, { hash, plaintext });
    return result['valid'] === true;
  } catch (err) {
    // If the sidecar is not running (e.g., local dev without Rust), return false
    // rather than crashing. Auth will fail, which is the safe behavior.
    console.error('[argon2] Sidecar unavailable — credential verification failed:', (err as Error).message);
    return false;
  }
}

/**
 * Hash a plaintext credential using Argon2id.
 *
 * Calls the Rust sidecar's /internal/argon2/hash endpoint.
 *
 * @throws Error if the sidecar is unreachable
 */
export async function hashArgon2(plaintext: string): Promise<string> {
  const base = getRustSidecarBase();
  const result = await postJson(`${base}/internal/argon2/hash`, { plaintext });
  if (typeof result['hash'] !== 'string' || !result['hash']) {
    throw new Error(`Argon2 sidecar returned invalid hash response: ${JSON.stringify(result)}`);
  }
  return result['hash'] as string;
}
