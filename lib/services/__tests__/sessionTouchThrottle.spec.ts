/**
 * AUTOFLOW-DB-LOAD-FIX-05 — staff_sessions.last_seen_at write throttle.
 *
 * Every authenticated request used to write this row. Measured at ~214 writes per
 * hour per client with nobody chatting, and each write produced WAL for Supabase
 * Realtime to decode. The throttle skips the write while the stored value is fresh.
 *
 * These are clock-injected pure-function tests — no sleeping, no DB.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_TOUCH_THROTTLE_MS, isSessionTouchFresh } from '../staffAccounts.ts';

const NOW = Date.parse('2026-09-09T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('AUTOFLOW-DB-LOAD-FIX-05 session touch throttle', () => {
  it('T1 throttle window is 60 seconds', () => {
    assert.equal(SESSION_TOUCH_THROTTLE_MS, 60_000);
  });

  it('T2 a session never touched before is written', () => {
    assert.equal(isSessionTouchFresh(null, NOW), false);
    assert.equal(isSessionTouchFresh(undefined, NOW), false);
    assert.equal(isSessionTouchFresh('', NOW), false);
  });

  it('T3 a request under 60s after the last touch does NOT write', () => {
    assert.equal(isSessionTouchFresh(at(0), NOW), true);
    assert.equal(isSessionTouchFresh(at(1_000), NOW), true);
    assert.equal(isSessionTouchFresh(at(30_000), NOW), true);
    assert.equal(isSessionTouchFresh(at(59_999), NOW), true);
  });

  it('T4 a request at or over 60s DOES write', () => {
    assert.equal(isSessionTouchFresh(at(60_000), NOW), false);
    assert.equal(isSessionTouchFresh(at(60_001), NOW), false);
    assert.equal(isSessionTouchFresh(at(3_600_000), NOW), false);
  });

  it('T5 an unparseable timestamp falls back to writing', () => {
    assert.equal(isSessionTouchFresh('not-a-date', NOW), false);
  });

  it('T6 clock skew (row stamped in the future) still writes', () => {
    // Skipping here would freeze the timestamp forever, so the safe default is to write.
    assert.equal(isSessionTouchFresh(new Date(NOW + 5_000).toISOString(), NOW), false);
  });

  it('T7 steady polling collapses to at most one write per minute', () => {
    // Replay one hour of the real cadence: an authenticated request every ~17s
    // (the measured mix of the 12s / 15s / 20s pollers).
    const REQUEST_EVERY_MS = 17_000;
    const HOUR_MS = 3_600_000;
    let lastSeen: string | null = null;
    let writes = 0;
    for (let t = 0; t < HOUR_MS; t += REQUEST_EVERY_MS) {
      const now = NOW + t;
      if (!isSessionTouchFresh(lastSeen, now)) {
        writes += 1;
        lastSeen = new Date(now).toISOString();
      }
    }
    const requests = Math.ceil(HOUR_MS / REQUEST_EVERY_MS);
    assert.equal(requests, 212, 'baseline request count for the hour');
    assert.ok(writes <= 60, `expected <=60 writes/hour, got ${writes}`);
    assert.ok(
      writes <= requests * 0.3,
      `expected >=70% write reduction, got ${writes}/${requests}`,
    );
  });
});
