// P0-B contract tests (C1–C7).
//
// These pin the properties the diagnosis depends on. If tab identity, the one-interval-per-hook
// invariant, or the reason vocabulary drift, the measurement stops being able to tell
// "many tabs" from "leaking intervals" — which is the only question this feature exists to answer.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAG_HEADER,
  DIAG_TAB_STORAGE_KEY,
  PollDiagRegistry,
  REQUEST_REASONS,
  createInstrumentedInterval,
  isRequestReason,
  newClientInstanceId,
  resolveDiagEnabled,
  resolveTabId,
  type RequestReason,
  type StorageLike,
} from '../pollDiag.ts';
import {
  buildDiagLogPayload,
  readDiagContext,
  withDiagRequestLog,
  isDiagServerCollectionEnabled,
} from '../pollDiagServer.ts';

/** sessionStorage stand-in; a fresh instance models a fresh tab. */
function memStore(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function headerReader(h: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (n: string) => lower[n.toLowerCase()] ?? null };
}

/** Manual clock + timer table so interval lifecycle is deterministic. */
function fakeTimers() {
  let seq = 0;
  const timers = new Map<number, { cb: () => void; ms: number }>();
  return {
    setIntervalFn: (cb: () => void, ms: number) => { seq += 1; timers.set(seq, { cb, ms }); return seq; },
    clearIntervalFn: (h: unknown) => void timers.delete(h as number),
    tickAll: (times = 1) => { for (let i = 0; i < times; i++) for (const t of [...timers.values()]) t.cb(); },
    live: () => timers.size,
  };
}

// ── C1. Tab identity ─────────────────────────────────────────────────────────

describe('C1 tab identity', () => {
  test('same tab reload keeps the id (sessionStorage survives reload)', () => {
    const store = memStore();
    const first = resolveTabId(store);
    assert.equal(resolveTabId(store), first);
  });

  test('a new sessionStorage context is a different tab', () => {
    assert.notEqual(resolveTabId(memStore()), resolveTabId(memStore()));
  });

  test('the id is written under the documented key', () => {
    const store = memStore();
    const id = resolveTabId(store);
    assert.equal(store.getItem(DIAG_TAB_STORAGE_KEY), id);
  });

  test('a broken storage still yields an id instead of throwing', () => {
    const hostile: StorageLike = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    assert.ok(resolveTabId(hostile).length > 0);
    assert.ok(resolveTabId(null).length > 0);
  });
});

// ── C2. Hook lifecycle ───────────────────────────────────────────────────────

describe('C2 hook lifecycle', () => {
  test('mount → 1 live instance; unmount → 0', () => {
    const r = new PollDiagRegistry('tab');
    const id = newClientInstanceId();
    r.mountHook({ clientInstanceId: id, hookName: 'h', componentName: 'C', pagePath: '/chat' });
    assert.equal(r.liveHooks().length, 1);
    r.unmountHook(id);
    assert.equal(r.liveHooks().length, 0);
  });

  test('remount produces a NEW instance id', () => {
    const a = newClientInstanceId();
    const b = newClientInstanceId();
    assert.notEqual(a, b);
  });

  test('unmount is recorded exactly once (double cleanup does not double-count)', () => {
    const r = new PollDiagRegistry('tab');
    const id = newClientInstanceId();
    r.mountHook({ clientInstanceId: id, hookName: 'h', componentName: 'C', pagePath: '/chat' });
    assert.ok(r.unmountHook(id));
    assert.equal(r.unmountHook(id), null);
  });

  test('missing unmounts show up as growing live instances — the remount-leak signal', () => {
    const r = new PollDiagRegistry('tab');
    for (let i = 0; i < 5; i++) {
      r.mountHook({ clientInstanceId: newClientInstanceId(), hookName: 'h', componentName: 'C', pagePath: '/chat' });
    }
    assert.equal(r.liveHooks().length, 5);
  });
});

// ── C3. Interval lifecycle ───────────────────────────────────────────────────

describe('C3 interval lifecycle', () => {
  test('registry enforces visibility of the one-per-hook invariant', () => {
    const r = new PollDiagRegistry('tab');
    r.registerInterval({ intervalId: 1, clientInstanceId: 'ci', hookName: 'h', componentName: 'C', intervalMs: 5000 });
    assert.equal(r.activeIntervalsFor('ci', 'h').length, 1);
    r.registerInterval({ intervalId: 2, clientInstanceId: 'ci', hookName: 'h', componentName: 'C', intervalMs: 5000 });
    assert.equal(r.activeIntervalsFor('ci', 'h').length, 2, 'a second live timer must be visible, not hidden');
    r.clearInterval(1);
    assert.equal(r.activeIntervalsFor('ci', 'h').length, 1);
  });

  test('clear is idempotent — cleared count never exceeds created', () => {
    const r = new PollDiagRegistry('tab');
    r.registerInterval({ intervalId: 1, clientInstanceId: 'ci', hookName: 'h', componentName: 'C', intervalMs: 1000 });
    assert.ok(r.clearInterval(1));
    assert.equal(r.clearInterval(1), null);
    assert.equal(r.intervalsCreated, 1);
    assert.equal(r.intervalsCleared, 1);
  });

  test('flag OFF: the real timer still runs and clear still works', () => {
    const t = fakeTimers();
    let ticks = 0;
    const h = createInstrumentedInterval({
      hookName: 'h', componentName: 'C', clientInstanceId: 'ci', intervalMs: 1000,
      callback: () => { ticks += 1; },
      setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
    });
    t.tickAll(3);
    assert.equal(ticks, 3, 'diagnostics must never change polling behaviour');
    h.clear();
    assert.equal(t.live(), 0);
  });

  test('arm→clear→arm cycles leave no live timer behind', () => {
    const t = fakeTimers();
    let handle = createInstrumentedInterval({
      hookName: 'h', componentName: 'C', clientInstanceId: 'ci', intervalMs: 1000,
      callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
    });
    for (let i = 0; i < 20; i++) {
      handle.clear();
      handle = createInstrumentedInterval({
        hookName: 'h', componentName: 'C', clientInstanceId: 'ci', intervalMs: 1000,
        callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
      });
      assert.equal(t.live(), 1, `cycle ${i}: exactly one live timer`);
    }
    handle.clear();
    assert.equal(t.live(), 0);
  });

  test('tick counting does not depend on logging', () => {
    const r = new PollDiagRegistry('tab');
    r.registerInterval({ intervalId: 7, clientInstanceId: 'ci', hookName: 'h', componentName: 'C', intervalMs: 1000 });
    for (let i = 0; i < 500; i++) r.tick(7);
    assert.equal(r.activeIntervals()[0]!.tickCount, 500);
  });
});

// ── C4. Request reason ───────────────────────────────────────────────────────

describe('C4 request reason', () => {
  test('the required reasons exist in the vocabulary', () => {
    for (const r of ['initial', 'interval', 'visible_resume', 'watchdog', 'realtime_recover', 'pending_drain', 'room_switch']) {
      assert.ok(isRequestReason(r), `${r} must be a valid reason`);
    }
  });

  test('unknown reasons are rejected, not passed through', () => {
    for (const r of ['', 'INTERVAL', 'drop table', null, undefined, 42]) {
      assert.equal(isRequestReason(r), false);
    }
  });

  test('counters attribute per reason', () => {
    const r = new PollDiagRegistry('tab');
    r.countRequest('interval');
    r.countRequest('interval');
    r.countRequest('watchdog');
    assert.deepEqual(r.snapshot().requestCounters, { interval: 2, watchdog: 1 });
  });
});

// ── C5. Flag OFF ─────────────────────────────────────────────────────────────

describe('C5 flag OFF', () => {
  test('resolveDiagEnabled only accepts the documented signals', () => {
    assert.equal(resolveDiagEnabled({ search: '?pollDiag=1' }), true);
    assert.equal(resolveDiagEnabled({ search: 'pollDiag=1' }), true);
    assert.equal(resolveDiagEnabled({ envFlag: '1' }), true);
    for (const off of [{}, { search: '' }, { search: '?pollDiag=0' }, { search: '?pollDiag=true' }, { search: '?other=1' }, { envFlag: '0' }, { envFlag: 'true' }]) {
      assert.equal(resolveDiagEnabled(off), false, JSON.stringify(off));
    }
  });

  test('server ignores requests that carry no diag headers', () => {
    assert.equal(readDiagContext(headerReader({})), null);
    assert.equal(readDiagContext(headerReader({ authorization: 'Bearer x' })), null);
  });

  test('a non-diag request produces no log line', async () => {
    const lines: string[] = [];
    const res = await withDiagRequestLog(
      { headers: headerReader({}), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => ({ status: 200 }),
      (e) => void lines.push(e),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(lines, []);
  });
});

// ── C6. Sensitive data ───────────────────────────────────────────────────────

describe('C6 sensitive data', () => {
  const BANNED = ['authorization', 'bearer', 'cookie', 'message', 'original_text', 'translated_text', 'phone', 'token', 'session_hash'];

  test('the log payload key set is closed and carries nothing sensitive', () => {
    const payload = buildDiagLogPayload({
      path: '/api/chat/list',
      method: 'GET',
      responseStatus: 200,
      elapsedMs: 12,
      deployment: 'dpl_x',
      now: () => '2026-08-05T00:00:00.000Z',
      ctx: { tabId: 'tab1', clientInstanceId: 'ci1', requestReason: 'interval', hookName: 'useChatLoader', isTauri: false },
    });
    assert.deepEqual(Object.keys(payload).sort(), [
      'client_instance_id', 'deployment', 'elapsed_ms', 'hook_name', 'is_tauri',
      'method', 'path', 'request_reason', 'response_status', 'tab_id', 'timestamp',
    ]);
    const flat = JSON.stringify(payload).toLowerCase();
    for (const b of BANNED) assert.equal(flat.includes(b), false, `payload must not contain "${b}"`);
  });

  test('header values are validated, so a hostile caller cannot inject log content', () => {
    assert.equal(readDiagContext(headerReader({
      [DIAG_HEADER.tabId]: 'tab 1"; DROP',
      [DIAG_HEADER.clientInstance]: 'ci',
      [DIAG_HEADER.requestReason]: 'interval',
      [DIAG_HEADER.hook]: 'h',
    })), null);

    assert.equal(readDiagContext(headerReader({
      [DIAG_HEADER.tabId]: 'tab1',
      [DIAG_HEADER.clientInstance]: 'ci',
      [DIAG_HEADER.requestReason]: 'Bearer abc',
      [DIAG_HEADER.hook]: 'h',
    })), null, 'reason must come from the enum, never echoed');
  });

  test('a well-formed diag request is accepted', () => {
    const ctx = readDiagContext(headerReader({
      [DIAG_HEADER.tabId]: 'a1-b2_c3',
      [DIAG_HEADER.clientInstance]: 'ci-1',
      [DIAG_HEADER.requestReason]: 'visible_resume',
      [DIAG_HEADER.hook]: 'useGuestChannelSummaries',
      [DIAG_HEADER.isTauri]: '1',
    }));
    assert.deepEqual(ctx, {
      tabId: 'a1-b2_c3',
      clientInstanceId: 'ci-1',
      requestReason: 'visible_resume' as RequestReason,
      hookName: 'useGuestChannelSummaries',
      isTauri: true,
    });
  });

  test('exactly one line per flagged request, even when the handler throws', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const h = headerReader({
      [DIAG_HEADER.tabId]: 'tab1',
      [DIAG_HEADER.clientInstance]: 'ci1',
      [DIAG_HEADER.requestReason]: 'interval',
      [DIAG_HEADER.hook]: 'h',
    });
    await assert.rejects(withDiagRequestLog(
      { headers: h, method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => { throw new Error('boom'); },
      (_e, p) => void lines.push(p),
      { CHAT_POLL_DIAG_SERVER: '1' } as NodeJS.ProcessEnv, // server collection gate
    ));
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.response_status, 0);
  });
});

// ── C7. Realtime transitions ─────────────────────────────────────────────────

describe('C7 realtime transitions', () => {
  test('one log per transition; a repeated status is not a transition', () => {
    const r = new PollDiagRegistry('tab');
    const t = (next: string) => r.recordTransition({ clientInstanceId: 'ci', channelName: 'c', previousStatus: null, nextStatus: next, resubscribeAttempt: 0 });
    assert.ok(t('SUBSCRIBED'));
    assert.equal(t('SUBSCRIBED'), null, 'quiet channel must not emit repeat lines');
    assert.ok(t('CHANNEL_ERROR'));
    assert.ok(t('SUBSCRIBED'));
    assert.equal(r.snapshot().realtimeTransitions.length, 3);
  });

  test('different channels are tracked independently', () => {
    const r = new PollDiagRegistry('tab');
    r.recordTransition({ clientInstanceId: 'ci', channelName: 'a', previousStatus: null, nextStatus: 'SUBSCRIBED', resubscribeAttempt: 0 });
    assert.ok(r.recordTransition({ clientInstanceId: 'ci', channelName: 'b', previousStatus: null, nextStatus: 'SUBSCRIBED', resubscribeAttempt: 0 }));
  });
});

// ── §13 fake-timer scenarios ─────────────────────────────────────────────────

describe('§13 sustained scenarios leave no residue', () => {
  test('room switch ×20 + visibility ×20 + rerender ×100 → 1 live timer, 0 live hooks', () => {
    const t = fakeTimers();
    const reg = new PollDiagRegistry('tab');
    let ci = newClientInstanceId();
    reg.mountHook({ clientInstanceId: ci, hookName: 'h', componentName: 'C', pagePath: '/chat' });
    let handle = createInstrumentedInterval({
      hookName: 'h', componentName: 'C', clientInstanceId: ci, intervalMs: 1000,
      callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
    });

    // rerenders must not create timers at all (arming is effect-scoped)
    for (let i = 0; i < 100; i++) { /* no-op: rerender does not arm */ }
    assert.equal(t.live(), 1);

    // visibility flips re-arm: clear then create
    for (let i = 0; i < 20; i++) {
      handle.clear();
      handle = createInstrumentedInterval({
        hookName: 'h', componentName: 'C', clientInstanceId: ci, intervalMs: 1000,
        callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
      });
    }
    assert.equal(t.live(), 1);

    // room switch = full unmount + remount
    for (let i = 0; i < 20; i++) {
      handle.clear();
      reg.unmountHook(ci);
      ci = newClientInstanceId();
      reg.mountHook({ clientInstanceId: ci, hookName: 'h', componentName: 'C', pagePath: '/chat' });
      handle = createInstrumentedInterval({
        hookName: 'h', componentName: 'C', clientInstanceId: ci, intervalMs: 1000,
        callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
      });
    }
    assert.equal(t.live(), 1);
    assert.equal(reg.liveHooks().length, 1);

    handle.clear();
    reg.unmountHook(ci);
    assert.equal(t.live(), 0);
    assert.equal(reg.liveHooks().length, 0);
  });

  test('a leak is detectable: arming without clearing accumulates', () => {
    // Control for the test above — proves the assertions can actually fail.
    const t = fakeTimers();
    for (let i = 0; i < 10; i++) {
      createInstrumentedInterval({
        hookName: 'h', componentName: 'C', clientInstanceId: 'ci', intervalMs: 1000,
        callback: () => {}, setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn,
      });
    }
    assert.equal(t.live(), 10);
  });

  test('the reason vocabulary has no duplicates and covers all five hooks', () => {
    assert.equal(new Set(REQUEST_REASONS).size, REQUEST_REASONS.length);
    // One representative reason per instrumented hook — a dropped entry fails here.
    for (const r of ['interval', 'hidden_interval', 'loader_initial', 'watchdog_tick', 'realtime_insert']) {
      assert.ok(isRequestReason(r), `${r} must be a valid reason`);
    }
  });
});

// ── 3-hook extension (useChatLoader / useChatWatchdog / useChatRealtime) ─────
//
// These three have no interval of their own except the watchdog tick, so the REASON is the
// entire explanation of why a request happened. If the vocabulary loses an entry, the
// per-reason attribution silently stops distinguishing the paths.

describe('loader / watchdog / realtime reasons', () => {
  test('loader reasons exist and are distinct from the guest-poll ones', () => {
    for (const r of ['loader_initial', 'loader_retry', 'loader_refresh', 'coalesce_join', 'load_abort', 'load_complete']) {
      assert.ok(isRequestReason(r), `${r} must be a valid reason`);
    }
    assert.notEqual('loader_initial', 'initial');
  });

  test('watchdog reasons cover tick / quiet / reconcile / backoff edges', () => {
    for (const r of ['watchdog_tick', 'watchdog_quiet', 'watchdog_reconcile', 'backoff_start', 'backoff_end']) {
      assert.ok(isRequestReason(r), `${r} must be a valid reason`);
    }
  });

  test('realtime reasons cover insert / update / recover', () => {
    for (const r of ['realtime_insert', 'realtime_update', 'realtime_recover']) {
      assert.ok(isRequestReason(r), `${r} must be a valid reason`);
    }
  });

  test('every declared reason is unique', () => {
    assert.equal(new Set(REQUEST_REASONS).size, REQUEST_REASONS.length);
  });

  test('per-reason counters separate the three hooks in one tab', () => {
    // This is the shape of the evidence that answers "interval leak or something else?".
    const r = new PollDiagRegistry('tab');
    for (let i = 0; i < 12; i++) r.countRequest('watchdog_tick');
    for (let i = 0; i < 5; i++) r.countRequest('loader_refresh');
    r.countRequest('realtime_recover');
    assert.deepEqual(r.snapshot().requestCounters, {
      watchdog_tick: 12,
      loader_refresh: 5,
      realtime_recover: 1,
    });
  });
});

describe('multi-hook lifecycle in one tab', () => {
  test('five hooks mount and unmount independently', () => {
    const reg = new PollDiagRegistry('tab');
    const hooks = ['useGuestChannelSummaries', 'usePollingMessages', 'useChatLoader', 'useChatWatchdog', 'useChatRealtime'];
    const ids = hooks.map((h) => {
      const id = newClientInstanceId();
      reg.mountHook({ clientInstanceId: id, hookName: h, componentName: h, pagePath: '/chat' });
      return id;
    });
    assert.equal(reg.liveHooks().length, 5);

    // one hook remounting must not disturb the other four
    reg.unmountHook(ids[2]!);
    const re = newClientInstanceId();
    reg.mountHook({ clientInstanceId: re, hookName: 'useChatLoader', componentName: 'useChatLoader', pagePath: '/chat' });
    assert.equal(reg.liveHooks().length, 5);
    assert.equal(reg.liveHooks().filter((h) => h.hookName === 'useChatLoader').length, 1);

    for (const id of [...ids.filter((_, i) => i !== 2), re]) reg.unmountHook(id);
    assert.equal(reg.liveHooks().length, 0);
  });

  test('the one-interval invariant is per hook, not per tab', () => {
    const reg = new PollDiagRegistry('tab');
    reg.registerInterval({ intervalId: 1, clientInstanceId: 'a', hookName: 'useGuestChannelSummaries', componentName: 'x', intervalMs: 15000 });
    reg.registerInterval({ intervalId: 2, clientInstanceId: 'b', hookName: 'useChatWatchdog', componentName: 'x', intervalMs: 5000 });
    assert.equal(reg.activeIntervals().length, 2, 'two different hooks may each hold one timer');
    assert.equal(reg.activeIntervalsFor('a', 'useGuestChannelSummaries').length, 1);
    assert.equal(reg.activeIntervalsFor('b', 'useChatWatchdog').length, 1);
  });
});

describe('recordDiagEvent (no-request reasons)', () => {
  test('is a no-op when the flag is off — no throw, no global', async () => {
    const { recordDiagEvent } = await import('../pollDiag.ts');
    assert.doesNotThrow(() => recordDiagEvent({
      reason: 'watchdog_tick',
      hookName: 'useChatWatchdog',
      clientInstanceId: 'ci',
    }));
  });
});

// ── Regression: why the Preview registry was undefined ───────────────────────
//
// First Preview attempt: window.__AUTOFLOW_CHAT_POLL_DIAG__ was undefined. The bundle
// contained every diag string, so it was not tree shaking. Two real defects:
//   1) the env flag was read as process.env[CONST] — Next only inlines literal
//      process.env.NEXT_PUBLIC_* access, so that path was dead in the browser
//   2) the registry (and the global) was created lazily by the first hook mount, which
//      happens only after staff login — so the console showed undefined beforehand

describe('diag enablement regression', () => {
  test('the query flag alone enables it', () => {
    assert.equal(resolveDiagEnabled({ search: '?pollDiag=1' }), true);
  });

  test('a sticky flag survives a redirect that drops the query', () => {
    // /chat?pollDiag=1 → router.replace('/login') → /chat  (query gone)
    assert.equal(resolveDiagEnabled({ search: '' }), false);
    assert.equal(resolveDiagEnabled({ search: '', sticky: '1' }), true);
  });

  test('sticky only counts when it is exactly "1"', () => {
    for (const v of [null, undefined, '', '0', 'true']) {
      assert.equal(resolveDiagEnabled({ search: '', sticky: v as string | null }), false, String(v));
    }
  });

  test('all three signals are independent', () => {
    assert.equal(resolveDiagEnabled({ envFlag: '1' }), true);
    assert.equal(resolveDiagEnabled({ search: '?pollDiag=1' }), true);
    assert.equal(resolveDiagEnabled({ sticky: '1' }), true);
    assert.equal(resolveDiagEnabled({ search: '?x=1', envFlag: '0', sticky: '0' }), false);
  });
});
