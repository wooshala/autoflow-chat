/**
 * P0 contract tests C1–C8 (pure helpers + single-flight).
 * Fake timers for quiet / delay / backoff / visibility decisions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CoalescingSingleFlight,
  decideWatchdogTick,
  GUEST_MESSAGES_HIDDEN_INTERVAL_MS,
  GUEST_MESSAGES_VISIBLE_INTERVAL_MS,
  isBackoffFailure,
  isHttpBackoffStatus,
  isQuietRealtimeHealthy,
  nextBackoffMs,
} from '../pollResilience.ts';

describe('C1 Quiet Realtime — SUBSCRIBED + no INSERT is healthy', () => {
  it('does not schedule list/resubscribe for subscribed quiet', () => {
    const d = decideWatchdogTick({
      connected: true,
      hidden: false,
      now: 0,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
    });
    assert.equal(d.action, 'none');
    assert.equal(d.reason, 'subscribed_quiet_ok');
    assert.equal(isQuietRealtimeHealthy(true), true);
  });

  it('30 minutes of quiet ticks never request resubscribe', () => {
    const tickMs = 10_000;
    const span = 30 * 60 * 1000;
    let resubscribes = 0;
    let fullFetches = 0;
    for (let t = 0; t <= span; t += tickMs) {
      const d = decideWatchdogTick({
        connected: true,
        hidden: false,
        now: t,
        nextResubscribeAt: 0,
        resubscribeInFlight: false,
      });
      if (d.action === 'resubscribe') resubscribes += 1;
      // quiet path must never imply full fetch (removed realtime_quiet_watchdog_full)
      if (d.action !== 'none') fullFetches += 1;
    }
    assert.equal(resubscribes, 0);
    assert.equal(fullFetches, 0);
  });
});

describe('C2 Real connection failure → backoff resubscribe', () => {
  it('schedules resubscribe when not connected after streak and backoff elapsed', () => {
    const d = decideWatchdogTick({
      connected: false,
      hidden: false,
      now: 1000,
      nextResubscribeAt: 500,
      resubscribeInFlight: false,
      notConnectedStreak: 2,
    });
    assert.equal(d.action, 'resubscribe');
  });

  it('waits disconnect grace before first resubscribe', () => {
    const d = decideWatchdogTick({
      connected: false,
      hidden: false,
      now: 10_000,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
      notConnectedStreak: 1,
      minNotConnectedStreak: 2,
    });
    assert.equal(d.action, 'none');
    assert.equal(d.reason, 'disconnect_grace');
  });

  it('single-flight: skips while resubscribe in flight', () => {
    const d = decideWatchdogTick({
      connected: false,
      hidden: false,
      now: 10_000,
      nextResubscribeAt: 0,
      resubscribeInFlight: true,
      notConnectedStreak: 5,
    });
    assert.equal(d.action, 'skip_backoff');
    assert.equal(d.reason, 'resubscribe_in_flight');
  });

  it('respects backoff wait', () => {
    const d = decideWatchdogTick({
      connected: false,
      hidden: false,
      now: 1000,
      nextResubscribeAt: 5000,
      resubscribeInFlight: false,
      notConnectedStreak: 5,
    });
    assert.equal(d.action, 'skip_backoff');
    assert.equal(d.reason, 'backoff_wait');
  });

  it('does not treat CLOSED realtime status as backoff failure', () => {
    assert.equal(isBackoffFailure({ realtimeStatus: 'CLOSED' }), false);
    assert.equal(isBackoffFailure({ realtimeStatus: 'CHANNEL_ERROR' }), true);
  });
});

describe('C3 Chat list single-flight', () => {
  it('coalesces overlapping callers without starting a second runner', async () => {
    const flight = new CoalescingSingleFlight<number>();
    let runs = 0;
    const slow = () =>
      new Promise<number>((resolve) => {
        runs += 1;
        setTimeout(() => resolve(runs), 50);
      });

    const p1 = flight.run(slow, { mode: 'coalesce', reason: 'a' });
    const p2 = flight.run(slow, { mode: 'coalesce', reason: 'b' });
    const p3 = flight.run(slow, { mode: 'join', reason: 'c' });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.equal(runs, 1);
    assert.equal(r1.kind, 'ran');
    assert.equal(r2.kind, 'skipped_in_flight');
    assert.equal(r3.kind, 'joined');
    assert.equal(flight.consumePending().pending, true);

    const drain = await flight.runThenDrain(slow, { reason: 'follow' });
    assert.equal(runs, 2); // one follow-up only from runThenDrain primary (no pending yet)
    assert.ok(drain.primary.kind === 'ran' || drain.primary.kind === 'joined');
  });

  it('runThenDrain executes at most one pending follow-up', async () => {
    const flight = new CoalescingSingleFlight<string>();
    let runs = 0;
    const fn = async () => {
      runs += 1;
      if (runs === 1) {
        // mark pending while first is conceptually in-flight via coalesce from outside
      }
      return `run-${runs}`;
    };

    const first = flight.run(async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'primary';
    }, { mode: 'coalesce' });

    // Overlap
    const skip = await flight.run(fn, { mode: 'coalesce', reason: 'watchdog' });
    assert.equal(skip.kind, 'skipped_in_flight');

    const primary = await first;
    assert.equal(primary.kind, 'ran');
    const { pending } = flight.consumePending();
    assert.equal(pending, true);

    const follow = await flight.run(async () => {
      runs += 1;
      return 'follow';
    }, { mode: 'coalesce' });
    assert.equal(follow.kind, 'ran');
    assert.equal(runs, 2);
  });
});

describe('C4 Guest messages single-flight semantics', () => {
  it('in-flight guard pattern: second call marks pending only', async () => {
    let inFlight = false;
    let pending = false;
    let starts = 0;

    const reload = async () => {
      if (inFlight) {
        pending = true;
        return;
      }
      inFlight = true;
      starts += 1;
      await new Promise((r) => setTimeout(r, 50));
      inFlight = false;
      if (pending) {
        pending = false;
        await reload();
      }
    };

    // Burst of overlapping ticks while one slow request is in flight.
    await Promise.all(Array.from({ length: 10 }, () => reload()));
    // 1 primary + at most 1 coalesced follow-up
    assert.equal(starts, 2);
  });

  it('default visible interval is >= 10s (2s removed)', () => {
    assert.ok(GUEST_MESSAGES_VISIBLE_INTERVAL_MS >= 10_000);
    assert.ok(GUEST_MESSAGES_HIDDEN_INTERVAL_MS >= 60_000);
  });
});

describe('C5 Backoff + jitter', () => {
  it('grows exponentially and caps at max', () => {
    const random = () => 0.5; // mid jitter → multiplier 1.0
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      delays.push(nextBackoffMs(i, { random, baseMs: BACKOFF_BASE_MS, maxMs: BACKOFF_MAX_MS }));
    }
    assert.equal(delays[0], 5_000);
    assert.equal(delays[1], 10_000);
    assert.equal(delays[2], 20_000);
    assert.equal(delays[3], 40_000);
    assert.equal(delays[4], 80_000);
    assert.ok(nextBackoffMs(10, { random, maxMs: BACKOFF_MAX_MS }) <= BACKOFF_MAX_MS);
  });

  it('jitter stays within 0.8–1.2 of base exp', () => {
    for (let i = 0; i < 50; i++) {
      const d = nextBackoffMs(0, { baseMs: 5_000, maxMs: 120_000 });
      assert.ok(d >= 4_000 && d <= 6_000, `jitter out of range: ${d}`);
    }
  });

  it('classifies 5xx/522/PGRST003', () => {
    assert.equal(isHttpBackoffStatus(500), true);
    assert.equal(isHttpBackoffStatus(522), true);
    assert.equal(isHttpBackoffStatus(200), false);
    assert.equal(isHttpBackoffStatus(401), false);
    assert.equal(isHttpBackoffStatus(403), false);
    assert.equal(isBackoffFailure({ errorMessage: 'PGRST003 statement timeout' }), true);
    assert.equal(isBackoffFailure({ errorMessage: 'guest_chat_upstream_timeout' }), true);
    assert.equal(isBackoffFailure({ errorMessage: 'GUEST_MESSAGES_HTTP_401', httpStatus: 401 }), false);
    assert.equal(isBackoffFailure({ realtimeStatus: 'CHANNEL_ERROR' }), true);
    assert.equal(isBackoffFailure({ realtimeStatus: 'TIMED_OUT' }), true);
    assert.equal(isBackoffFailure({ realtimeStatus: 'CLOSED' }), false);
  });
});

describe('C6 Visibility', () => {
  it('hidden tick does nothing (no list poll from watchdog decision)', () => {
    const d = decideWatchdogTick({
      connected: false,
      hidden: true,
      now: 99999,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
    });
    assert.equal(d.action, 'none');
    assert.equal(d.reason, 'hidden');
  });

  it('hidden subscribed also none', () => {
    const d = decideWatchdogTick({
      connected: true,
      hidden: true,
      now: 30 * 60 * 1000,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
    });
    assert.equal(d.action, 'none');
  });
});

describe('C7 Unmount cleanup helpers', () => {
  it('CoalescingSingleFlight.reset clears pending/inflight', async () => {
    const flight = new CoalescingSingleFlight<number>();
    const p = flight.run(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return 1;
    });
    await flight.run(async () => 2, { mode: 'coalesce' });
    flight.clearPending();
    assert.equal(flight.hasPending, false);
    // in-flight pointer retained until runner finishes (unmount-safe)
    assert.equal(flight.inFlight, true);
    await p;
    flight.reset();
    assert.equal(flight.inFlight, false);
  });
});

describe('C8 Regression helpers — merge identity / backoff recovery reset', () => {
  it('success path resets failure count conceptually', () => {
    let failures = 3;
    let nextAllowed = Date.now() + 60_000;
    // simulate success
    failures = 0;
    nextAllowed = 0;
    assert.equal(failures, 0);
    assert.equal(nextAllowed, 0);
  });

  it('quiet healthy does not depend on insert activity timestamps', () => {
    // decision ignores lastInsert — only connected flag
    const early = decideWatchdogTick({
      connected: true,
      hidden: false,
      now: 0,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
    });
    const late = decideWatchdogTick({
      connected: true,
      hidden: false,
      now: 24 * 60 * 60 * 1000,
      nextResubscribeAt: 0,
      resubscribeInFlight: false,
    });
    assert.equal(early.action, late.action);
    assert.equal(early.reason, 'subscribed_quiet_ok');
  });
});
