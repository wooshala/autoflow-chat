// Phase 1A — Customer access token primitives.
//
// Rules:
//  - Raw token is a cryptographically secure random value, returned to the caller
//    ONCE (to embed in an opaque URL) and NEVER persisted or logged.
//  - Only the SHA-256 hash is stored (customer_access_tokens.token_hash).
//  - Comparison for lookup is by hash equality (the DB unique index); a timing-safe
//    compare helper is provided for any direct string comparison path.
//  - The token carries no room/hotel information — it is opaque random bytes, so it
//    cannot be used to guess a site_id or room_no.
//
// Runtime: Node.js server only (uses node:crypto). Must not run in the browser/EXE
// bundle. Do not import this from client components.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes → 43-char base64url. ~256 bits of entropy, URL-safe, opaque. */
export function generateRawCustomerToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex of the raw token. Deterministic so the server can re-hash an
 * incoming raw token and look it up by token_hash. Raw token is one-way here.
 */
export function hashCustomerToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/** Constant-time equality for two hex hashes of equal length. */
export function tokensHashEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Redact a raw token for any log line that unavoidably references it. Never log the
 * full value. Prefer logging the token_id (uuid) instead of the token at all.
 */
export function redactToken(rawToken: string): string {
  if (!rawToken) return '(empty)';
  return `${rawToken.slice(0, 3)}…(${rawToken.length})`;
}
