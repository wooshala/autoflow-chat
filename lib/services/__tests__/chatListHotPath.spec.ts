/**
 * AUTOFLOW-DB-LOAD-FIX-05 — /api/chat/list must cost one DB query on the normal path.
 *
 * The chat list is polled continuously by every open tab, so anything extra on this
 * route is multiplied by every client for every tick. Source-level contract: the
 * diagnostics still exist and can be switched back on, they just no longer run by
 * default in production.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const route = read('../../../app/api/chat/list/route.ts');
const staffAccounts = read('../staffAccounts.ts');

describe('AUTOFLOW-DB-LOAD-FIX-05 chat list hot path', () => {
  it('L1 the diagnostic gate is off unless CHAT_DEBUG_VERBOSE=1', () => {
    assert.match(route, /const DEBUG_VERBOSE = process\.env\.CHAT_DEBUG_VERBOSE === '1'/);
  });

  it('L2 diag_db_now no longer runs on every request', () => {
    const idx = route.indexOf("rpc('diag_db_now')");
    assert.ok(idx > 0, 'diag_db_now should still exist behind the gate');
    // The nearest gate above the call must be the DEBUG_VERBOSE one.
    const before = route.slice(0, idx);
    const lastGate = before.lastIndexOf('if (DEBUG_VERBOSE)');
    const lastTry = before.lastIndexOf('try {');
    assert.ok(lastGate > 0 && lastGate < lastTry, 'diag_db_now must sit inside a DEBUG_VERBOSE block');
  });

  it('L3 the post-send probe cascade is gated too', () => {
    assert.match(route, /if \(DEBUG_VERBOSE && probeId && probeRecent && supabaseAdmin\)/);
  });

  it('L4 the actual list query is untouched', () => {
    assert.match(route, /await listChatMessagesByTicket\(ticketId, limit\)/);
    assert.match(route, /await listChatMessagesSince\(since, limit\)/);
    assert.match(route, /await listChatMessages\(limit\)/);
  });

  it('L5 the route stays opted out of the Next.js Data Cache', () => {
    // a06991c fixed the staleness the probe cascade was compensating for; if this
    // regressed, the cascade would need to come back.
    assert.match(route, /export const dynamic = 'force-dynamic'/);
    assert.match(route, /export const fetchCache = 'force-no-store'/);
  });

  it('L6 authentication semantics are unchanged', () => {
    // Throttling touches the timestamp only. Authority is still revoked_at + is_active,
    // both re-read on every request; nothing is cached across requests.
    assert.match(staffAccounts, /const session = await findActiveSession\(sessionHashOf\(token\)\)/);
    assert.match(staffAccounts, /if \(!session\) throw new StaffAccountError\('SESSION_INVALID'\)/);
    assert.match(staffAccounts, /if \(!account\) throw new StaffAccountError\('SESSION_INVALID'\)/);
    assert.match(
      staffAccounts,
      /if \(!account\.is_active\) throw new StaffAccountError\('ACCOUNT_DEACTIVATED'\)/,
    );
    assert.ok(
      !/sessionCache|authCache|memoizeSession/i.test(staffAccounts),
      'no auth cache was introduced in this change',
    );
  });

  it('L7 the throttle reuses the row already read — no extra query', () => {
    assert.match(staffAccounts, /await touchSession\(session\.session_hash, session\.last_seen_at\)/);
  });
});
