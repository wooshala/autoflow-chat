// Phase 2D — server-to-server authentication for the internal guest-chat feeds.
//
// This is NOT the staff session auth (staffAuth.ts). The ledger backend (univer-ops) is a
// service, not a logged-in staff member, so copying a staff Bearer into another deployment
// would hand it a human's session. It gets its own secret instead.
//
// Deliberately NOT reused / NOT fallen back to:
//   INTERNAL_EVENTS_SECRET      — different owner and blast radius (call-event push)
//   SUPABASE_SERVICE_ROLE_KEY   — a database credential must never double as an API key
//
// fail-closed: no secret configured → every request is rejected.

import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const GUEST_CHAT_INTERNAL_SECRET_ENV = 'GUEST_CHAT_INTERNAL_SECRET';

function configuredSecret(): string {
  return (process.env[GUEST_CHAT_INTERNAL_SECRET_ENV] ?? '').trim();
}

/** Length-safe constant-time compare. Returns false for any empty input. */
function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch; hash-free equalization keeps it constant-time
  // with respect to content while still rejecting different lengths.
  if (ab.length !== bb.length) {
    // Compare against itself so the work done does not depend on which side is longer.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export type InternalAuthResult =
  | { ok: true }
  /** Secret is not configured on this deployment — operator error, not a caller error. */
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'unauthorized' };

/**
 * Authorize an internal service call.
 *
 * Bearer only — never a query string, which would land the secret in access logs,
 * browser history and Referer headers.
 */
export function authorizeInternalRequest(req: NextRequest): InternalAuthResult {
  const expected = configuredSecret();
  if (!expected) return { ok: false, reason: 'not_configured' };

  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return { ok: false, reason: 'unauthorized' };
  const presented = header.slice(7).trim();

  return secretsMatch(presented, expected) ? { ok: true } : { ok: false, reason: 'unauthorized' };
}
