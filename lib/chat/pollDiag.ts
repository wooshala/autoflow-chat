/**
 * P0-B — request-source diagnostics.
 *
 * WHY: two authenticated staff devices produce ~48 polling-loop-equivalents of traffic.
 * Request rate alone cannot tell apart (a) many tabs/WebViews on one device, (b) intervals
 * that are never cleared, and (c) non-interval callers (watchdog / realtime recovery /
 * visibility) firing repeatedly. This module tags every request with the tab, the hook
 * instance and the reason, so the three can be separated from server logs.
 *
 * OFF BY DEFAULT. With the flag off nothing here allocates, wraps a timer, adds a header,
 * writes a log line, or exposes a global — see `isChatPollDiagEnabled`.
 *
 * NEVER records: staff/session tokens, cookies, guest message bodies, raw device ids,
 * room guest data. Only structural identifiers generated here.
 */

export const DIAG_QUERY_PARAM = 'pollDiag';
export const DIAG_ENV_FLAG = 'NEXT_PUBLIC_CHAT_POLL_DIAG';
export const DIAG_TAB_STORAGE_KEY = 'autoflow_chat_poll_diag_tab_id';
export const DIAG_GLOBAL_KEY = '__AUTOFLOW_CHAT_POLL_DIAG__';

export const DIAG_HEADER = {
  tabId: 'x-autoflow-diag-tab-id',
  clientInstance: 'x-autoflow-diag-client-instance',
  requestReason: 'x-autoflow-diag-request-reason',
  hook: 'x-autoflow-diag-hook',
  isTauri: 'x-autoflow-diag-is-tauri',
} as const;

/** Fixed vocabulary — a free-form reason would defeat the per-reason attribution. */
export const REQUEST_REASONS = [
  'initial',
  'interval',
  'hidden_interval',
  'visible_resume',
  'realtime_insert',
  'realtime_update',
  'realtime_recover',
  'watchdog',
  'manual_retry',
  'send_reconcile',
  'pending_drain',
  'room_switch',
  'pageshow',
  'online_recover',
  // useChatLoader — /api/chat/list has no interval, so the reason IS the whole explanation
  // of why the request happened. These must stay distinct from the guest-poll reasons.
  'loader_initial',
  'loader_retry',
  'loader_refresh',
  'coalesce_join',
  'load_abort',
  'load_complete',
  // useChatWatchdog
  'watchdog_tick',
  'watchdog_quiet',
  'watchdog_reconcile',
  'backoff_start',
  'backoff_end',
  'other',
] as const;
export type RequestReason = (typeof REQUEST_REASONS)[number];

export function isRequestReason(v: unknown): v is RequestReason {
  return typeof v === 'string' && (REQUEST_REASONS as readonly string[]).includes(v);
}

export const REALTIME_STATUSES = [
  'SUBSCRIBED',
  'CHANNEL_ERROR',
  'TIMED_OUT',
  'CLOSED',
  'UNSUBSCRIBED',
] as const;
export type RealtimeStatus = (typeof REALTIME_STATUSES)[number];

// ── enablement ───────────────────────────────────────────────────────────────

export interface DiagEnv {
  search?: string;
  envFlag?: string | undefined;
  /** Sticky flag from a previous page in this tab — see `isChatPollDiagEnabled`. */
  sticky?: string | null;
}

/**
 * Pure predicate so tests do not need a browser. `?pollDiag=1` (manual, production) or
 * NEXT_PUBLIC_CHAT_POLL_DIAG=1 (automatic, preview). Any other value is off.
 */
export function resolveDiagEnabled(env: DiagEnv): boolean {
  if (env.envFlag === '1') return true;
  if (env.sticky === '1') return true;
  if (!env.search) return false;
  const q = new URLSearchParams(env.search.startsWith('?') ? env.search.slice(1) : env.search);
  return q.get(DIAG_QUERY_PARAM) === '1';
}

/** Survives the /chat → /login → /chat redirect, which drops the query string. */
const DIAG_STICKY_KEY = 'autoflow_chat_poll_diag_on';

let cachedEnabled: boolean | null = null;

export function isChatPollDiagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (cachedEnabled === null) {
    let sticky: string | null = null;
    try {
      sticky = window.sessionStorage.getItem(DIAG_STICKY_KEY);
    } catch {
      /* storage blocked — query/env still work */
    }
    cachedEnabled = resolveDiagEnabled({
      search: window.location?.search,
      // MUST be a literal member access: Next only inlines `process.env.NEXT_PUBLIC_*`
      // when it can see the property name statically. `process.env[SOME_CONST]` is left
      // alone and evaluates to undefined in the browser, silently killing the env path.
      envFlag: process.env.NEXT_PUBLIC_CHAT_POLL_DIAG,
      sticky,
    });
    if (cachedEnabled) {
      try {
        window.sessionStorage.setItem(DIAG_STICKY_KEY, '1');
      } catch {
        /* best effort */
      }
    }
  }
  return cachedEnabled;
}

/** Tests only — the flag is read once per page load in real use. */
export function __resetDiagEnabledCache(): void {
  cachedEnabled = null;
}

// ── identity ─────────────────────────────────────────────────────────────────

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback keeps the id unique-enough for one session; never used for security.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Tab identity. sessionStorage (NOT localStorage) is the whole point: it survives a reload
 * of THIS tab and is absent in a new tab or a new WebView, which is exactly the axis that
 * separates "many tabs" from "one leaking tab".
 */
export function resolveTabId(store: StorageLike | null | undefined): string {
  if (!store) return randomId();
  try {
    const existing = store.getItem(DIAG_TAB_STORAGE_KEY);
    if (existing) return existing;
    const fresh = randomId();
    store.setItem(DIAG_TAB_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

/** A raw device id must never reach a log. Truncated one-way digest only. */
export async function deviceHash(deviceId: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return '';
  const bytes = new TextEncoder().encode(deviceId);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

export function newClientInstanceId(): string {
  return randomId();
}

// ── in-memory registry ───────────────────────────────────────────────────────

export interface HookInstanceRecord {
  clientInstanceId: string;
  hookName: string;
  componentName: string;
  pagePath: string;
  mountedAt: number;
  unmountedAt: number | null;
}

export interface IntervalRecord {
  intervalId: number;
  clientInstanceId: string;
  hookName: string;
  componentName: string;
  intervalMs: number;
  createdAt: number;
  clearedAt: number | null;
  tickCount: number;
}

export interface RealtimeTransition {
  clientInstanceId: string;
  channelName: string;
  previousStatus: string | null;
  nextStatus: string;
  resubscribeAttempt: number;
  at: number;
}

export interface DiagSnapshot {
  tabId: string;
  isTauri: boolean;
  hookInstances: HookInstanceRecord[];
  activeIntervals: IntervalRecord[];
  intervalsCreated: number;
  intervalsCleared: number;
  requestCounters: Record<string, number>;
  realtimeTransitions: RealtimeTransition[];
}

export class PollDiagRegistry {
  readonly tabId: string;
  isTauri = false;
  private hooks = new Map<string, HookInstanceRecord>();
  private intervals = new Map<number, IntervalRecord>();
  private counters: Record<string, number> = {};
  private transitions: RealtimeTransition[] = [];
  intervalsCreated = 0;
  intervalsCleared = 0;
  private seq = 0;
  // Plain field, not a parameter property — node's strip-only TS mode rejects those.
  private now: () => number;

  constructor(tabId: string, now: () => number = () => Date.now()) {
    this.tabId = tabId;
    this.now = now;
  }

  nextIntervalId(): number {
    this.seq += 1;
    return this.seq;
  }

  mountHook(r: Omit<HookInstanceRecord, 'mountedAt' | 'unmountedAt'>): HookInstanceRecord {
    const rec: HookInstanceRecord = { ...r, mountedAt: this.now(), unmountedAt: null };
    this.hooks.set(r.clientInstanceId, rec);
    return rec;
  }

  unmountHook(clientInstanceId: string): HookInstanceRecord | null {
    const rec = this.hooks.get(clientInstanceId);
    if (!rec || rec.unmountedAt !== null) return null; // never double-count an unmount
    rec.unmountedAt = this.now();
    return rec;
  }

  /** Live hook instances — a growing count with no matching unmounts is a remount leak. */
  liveHooks(): HookInstanceRecord[] {
    return [...this.hooks.values()].filter((h) => h.unmountedAt === null);
  }

  registerInterval(r: Omit<IntervalRecord, 'createdAt' | 'clearedAt' | 'tickCount'>): IntervalRecord {
    const rec: IntervalRecord = { ...r, createdAt: this.now(), clearedAt: null, tickCount: 0 };
    this.intervals.set(r.intervalId, rec);
    this.intervalsCreated += 1;
    return rec;
  }

  clearInterval(intervalId: number): IntervalRecord | null {
    const rec = this.intervals.get(intervalId);
    if (!rec || rec.clearedAt !== null) return null;
    rec.clearedAt = this.now();
    this.intervalsCleared += 1;
    return rec;
  }

  tick(intervalId: number): number {
    const rec = this.intervals.get(intervalId);
    if (!rec) return 0;
    rec.tickCount += 1;
    return rec.tickCount;
  }

  activeIntervals(): IntervalRecord[] {
    return [...this.intervals.values()].filter((i) => i.clearedAt === null);
  }

  /** The core invariant: one hook instance must never hold two live timers. */
  activeIntervalsFor(clientInstanceId: string, hookName: string): IntervalRecord[] {
    return this.activeIntervals().filter(
      (i) => i.clientInstanceId === clientInstanceId && i.hookName === hookName,
    );
  }

  countRequest(reason: RequestReason): void {
    this.counters[reason] = (this.counters[reason] ?? 0) + 1;
  }

  recordTransition(t: Omit<RealtimeTransition, 'at'>): RealtimeTransition | null {
    const last = this.transitions[this.transitions.length - 1];
    // Only transitions are interesting; a quiet channel repeating SUBSCRIBED is noise.
    if (last && last.channelName === t.channelName && last.nextStatus === t.nextStatus) return null;
    const rec: RealtimeTransition = { ...t, at: this.now() };
    this.transitions.push(rec);
    return rec;
  }

  snapshot(): DiagSnapshot {
    return {
      tabId: this.tabId,
      isTauri: this.isTauri,
      hookInstances: [...this.hooks.values()],
      activeIntervals: this.activeIntervals(),
      intervalsCreated: this.intervalsCreated,
      intervalsCleared: this.intervalsCleared,
      requestCounters: { ...this.counters },
      realtimeTransitions: [...this.transitions],
    };
  }
}

let registry: PollDiagRegistry | null = null;

export function getDiagRegistry(): PollDiagRegistry | null {
  if (!isChatPollDiagEnabled()) return null;
  if (!registry) {
    const store = typeof window !== 'undefined' ? window.sessionStorage : null;
    registry = new PollDiagRegistry(resolveTabId(store));
    registry.isTauri = typeof window !== 'undefined'
      && Boolean((window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__
        ?? (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
    // Read-only view for the operator; absent when the flag is off.
    Object.defineProperty(window, DIAG_GLOBAL_KEY, {
      configurable: true,
      get: () => registry?.snapshot(),
    });
  }
  return registry;
}

export function __resetDiagRegistry(): void {
  registry = null;
}

// Eager init on module load.
//
// Without this the registry — and therefore `window.__AUTOFLOW_CHAT_POLL_DIAG__` — only
// appears once an instrumented hook mounts. The chat hooks mount after staff login, so an
// operator who opens the page and checks the console immediately sees `undefined` and
// concludes the instrumentation is dead. It is not: it just has not been touched yet.
//
// Creating it at load costs one object and one sessionStorage read, and only when the flag
// is already on. With the flag off this is a single boolean check and nothing is defined.
if (typeof window !== 'undefined') {
  try {
    getDiagRegistry();
  } catch {
    /* diagnostics must never break page load */
  }
}

// ── request headers ──────────────────────────────────────────────────────────

export interface DiagHeaderInput {
  reason: RequestReason;
  hookName: string;
  clientInstanceId: string;
}

/**
 * Headers for one outgoing request. Empty object when the flag is off, so callers can
 * spread unconditionally without changing production traffic.
 */
export function buildDiagHeaders(input: DiagHeaderInput): Record<string, string> {
  const reg = getDiagRegistry();
  if (!reg) return {};
  reg.countRequest(input.reason);
  return {
    [DIAG_HEADER.tabId]: reg.tabId,
    [DIAG_HEADER.clientInstance]: input.clientInstanceId,
    [DIAG_HEADER.requestReason]: input.reason,
    [DIAG_HEADER.hook]: input.hookName,
    [DIAG_HEADER.isTauri]: reg.isTauri ? '1' : '0',
  };
}

/**
 * Record a reason WITHOUT an outgoing request.
 *
 * `/api/chat/list` is not driven by an interval, so counting timers explains nothing there.
 * Watchdog ticks, quiet decisions, coalesce joins and backoff edges are counted here instead,
 * which is what makes "non-interval request multiplication" measurable at all.
 */
export function recordDiagEvent(input: {
  reason: RequestReason;
  hookName: string;
  clientInstanceId: string;
  detail?: Record<string, unknown>;
  log?: (event: string, payload: Record<string, unknown>) => void;
}): void {
  const reg = getDiagRegistry();
  if (!reg) return;
  reg.countRequest(input.reason);
  (input.log ?? defaultLog)('CHAT_POLL_DIAG_EVENT', {
    tab_id: reg.tabId,
    client_instance_id: input.clientInstanceId,
    hook_name: input.hookName,
    request_reason: input.reason,
    visibility_state: visibility(),
    ...(input.detail ?? {}),
  });
}

// ── instrumented interval ────────────────────────────────────────────────────

export interface InstrumentedIntervalInput {
  hookName: string;
  componentName: string;
  clientInstanceId: string;
  intervalMs: number;
  callback: () => void;
  /** Injected in tests. */
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  log?: (event: string, payload: Record<string, unknown>) => void;
}

export interface InstrumentedInterval {
  clear: () => void;
  /** Registry id, not the platform timer handle. */
  diagId: number;
}

/**
 * Timers are created through this instead of monkey-patching window.setInterval —
 * a global patch would also capture unrelated app timers and mislead the attribution.
 *
 * Ticks are counted, not logged one-by-one: at 5s a single loop would emit 720 lines/hour.
 * The first three ticks and then one per minute are logged; the rest live in `tickCount`.
 */
export function createInstrumentedInterval(input: InstrumentedIntervalInput): InstrumentedInterval {
  const setFn = input.setIntervalFn ?? ((cb: () => void, ms: number) => setInterval(cb, ms));
  const clearFn = input.clearIntervalFn ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const reg = getDiagRegistry();

  if (!reg) {
    const handle = setFn(input.callback, input.intervalMs);
    return { clear: () => clearFn(handle), diagId: 0 };
  }

  const diagId = reg.nextIntervalId();
  const log = input.log ?? defaultLog;

  const existing = reg.activeIntervalsFor(input.clientInstanceId, input.hookName);
  if (existing.length > 0) {
    // The invariant is broken at creation time — record it where the stack is still useful.
    log('CHAT_POLL_DIAG_INTERVAL_DUPLICATE', {
      tab_id: reg.tabId,
      client_instance_id: input.clientInstanceId,
      hook_name: input.hookName,
      existing_active: existing.length,
      creation_stack: shortStack(),
    });
  }

  reg.registerInterval({
    intervalId: diagId,
    clientInstanceId: input.clientInstanceId,
    hookName: input.hookName,
    componentName: input.componentName,
    intervalMs: input.intervalMs,
  });

  log('CHAT_POLL_DIAG_INTERVAL_CREATED', {
    tab_id: reg.tabId,
    client_instance_id: input.clientInstanceId,
    hook_name: input.hookName,
    component_name: input.componentName,
    interval_id: diagId,
    interval_ms: input.intervalMs,
    visibility_state: visibility(),
    page_path: pagePath(),
    creation_stack: shortStack(),
  });

  let lastTickLogAt = 0;
  const handle = setFn(() => {
    const n = reg.tick(diagId);
    const now = Date.now();
    if (n <= 3 || now - lastTickLogAt >= 60_000) {
      lastTickLogAt = now;
      log('CHAT_POLL_DIAG_INTERVAL_TICK', {
        tab_id: reg.tabId,
        client_instance_id: input.clientInstanceId,
        hook_name: input.hookName,
        interval_id: diagId,
        tick_count: n,
        visibility_state: visibility(),
      });
    }
    input.callback();
  }, input.intervalMs);

  return {
    diagId,
    clear: () => {
      clearFn(handle);
      const rec = reg.clearInterval(diagId);
      if (rec) {
        log('CHAT_POLL_DIAG_INTERVAL_CLEARED', {
          tab_id: reg.tabId,
          client_instance_id: input.clientInstanceId,
          hook_name: input.hookName,
          interval_id: diagId,
          tick_count: rec.tickCount,
          lived_ms: (rec.clearedAt ?? 0) - rec.createdAt,
        });
      }
    },
  };
}

// ── hook lifecycle / realtime ────────────────────────────────────────────────

export function recordHookMount(input: {
  clientInstanceId: string;
  hookName: string;
  componentName: string;
  log?: (event: string, payload: Record<string, unknown>) => void;
}): void {
  const reg = getDiagRegistry();
  if (!reg) return;
  const rec = reg.mountHook({
    clientInstanceId: input.clientInstanceId,
    hookName: input.hookName,
    componentName: input.componentName,
    pagePath: pagePath(),
  });
  (input.log ?? defaultLog)('CHAT_POLL_DIAG_HOOK_MOUNT', {
    tab_id: reg.tabId,
    client_instance_id: rec.clientInstanceId,
    hook_name: rec.hookName,
    component_name: rec.componentName,
    page_path: rec.pagePath,
    live_instances: reg.liveHooks().length,
  });
}

export function recordHookUnmount(input: {
  clientInstanceId: string;
  hookName: string;
  log?: (event: string, payload: Record<string, unknown>) => void;
}): void {
  const reg = getDiagRegistry();
  if (!reg) return;
  const rec = reg.unmountHook(input.clientInstanceId);
  if (!rec) return; // already unmounted — exactly one log per instance
  (input.log ?? defaultLog)('CHAT_POLL_DIAG_HOOK_UNMOUNT', {
    tab_id: reg.tabId,
    client_instance_id: rec.clientInstanceId,
    hook_name: rec.hookName,
    lived_ms: (rec.unmountedAt ?? 0) - rec.mountedAt,
    live_instances: reg.liveHooks().length,
  });
}

export function recordRealtimeTransition(input: {
  clientInstanceId: string;
  channelName: string;
  previousStatus: string | null;
  nextStatus: string;
  resubscribeAttempt?: number;
  reconnectToken?: string | null;
  log?: (event: string, payload: Record<string, unknown>) => void;
}): void {
  const reg = getDiagRegistry();
  if (!reg) return;
  const rec = reg.recordTransition({
    clientInstanceId: input.clientInstanceId,
    channelName: input.channelName,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    resubscribeAttempt: input.resubscribeAttempt ?? 0,
  });
  if (!rec) return; // same status repeated — not a transition
  (input.log ?? defaultLog)('CHAT_REALTIME_DIAG_STATUS', {
    tab_id: reg.tabId,
    client_instance_id: rec.clientInstanceId,
    channel_name: rec.channelName,
    previous_status: rec.previousStatus,
    next_status: rec.nextStatus,
    resubscribe_attempt: rec.resubscribeAttempt,
    reconnect_token: input.reconnectToken ?? null,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function defaultLog(event: string, payload: Record<string, unknown>): void {
  console.info(`[${event}]`, payload);
}

function visibility(): string {
  return typeof document !== 'undefined' ? document.visibilityState : 'unknown';
}

function pagePath(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

/** Creation site without the full trace — enough to name the caller, small enough to log. */
function shortStack(): string {
  const raw = new Error().stack ?? '';
  return raw.split('\n').slice(2, 6).map((l) => l.trim()).join(' | ').slice(0, 400);
}
