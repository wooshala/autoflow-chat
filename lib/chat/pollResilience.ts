/**
 * P0 poll / reconnect resilience helpers (pure + coalescing single-flight).
 * No message bodies or secrets — callers log only structural fields.
 */

export const CHAT_LIST_FLIGHT_KEY = 'chat-list' as const;

export const GUEST_MESSAGES_VISIBLE_INTERVAL_MS = 12_000;
export const GUEST_MESSAGES_HIDDEN_INTERVAL_MS = 60_000;
export const GUEST_SUMMARY_VISIBLE_INTERVAL_MS = 15_000;
export const GUEST_SUMMARY_HIDDEN_INTERVAL_MS = 60_000;

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 120_000;

export type BackoffOpts = {
  baseMs?: number;
  maxMs?: number;
  /** Inject for tests; default Math.random */
  random?: () => number;
};

/** Exponential backoff with ±20% jitter. attempt is 0-based failure count. */
export function nextBackoffMs(failureCount: number, opts?: BackoffOpts): number {
  const baseMs = opts?.baseMs ?? BACKOFF_BASE_MS;
  const maxMs = opts?.maxMs ?? BACKOFF_MAX_MS;
  const random = opts?.random ?? Math.random;
  const exp = Math.max(0, failureCount);
  let delayMs = Math.min(maxMs, baseMs * 2 ** exp);
  delayMs *= 0.8 + random() * 0.4;
  return Math.round(delayMs);
}

export function isHttpBackoffStatus(status: number | null | undefined): boolean {
  if (status == null || !Number.isFinite(status)) return false;
  if (status === 522) return true;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/** Classify fetch/network/realtime failures that should back off. */
export function isBackoffFailure(input: {
  httpStatus?: number | null;
  errorMessage?: string | null;
  realtimeStatus?: string | null;
}): boolean {
  if (isHttpBackoffStatus(input.httpStatus ?? null)) return true;
  const msg = (input.errorMessage ?? '').toLowerCase();
  if (
    msg.includes('pgrst003')
    || msg.includes('timed out')
    || msg.includes('timeout')
    || msg.includes('network')
    || msg.includes('failed to fetch')
    || msg.includes('522')
  ) {
    return true;
  }
  const rt = (input.realtimeStatus ?? '').toUpperCase();
  if (rt === 'CHANNEL_ERROR' || rt === 'TIMED_OUT' || rt === 'CLOSED') return true;
  return false;
}

/**
 * Quiet Realtime health: SUBSCRIBED (connected=true) must NOT be treated as stale
 * merely because no INSERT arrived.
 */
export function isQuietRealtimeHealthy(connected: boolean): boolean {
  return connected === true;
}

export type WatchdogTickDecision =
  | { action: 'none'; reason: string }
  | { action: 'resubscribe'; reason: string }
  | { action: 'skip_backoff'; reason: string; delayMs: number };

/**
 * Decide watchdog tick action. Never schedules full-list for quiet SUBSCRIBED.
 * Hidden tabs do not schedule list polls here (visibility reconcile is separate).
 */
export function decideWatchdogTick(input: {
  connected: boolean;
  hidden: boolean;
  now: number;
  nextResubscribeAt: number;
  resubscribeInFlight: boolean;
}): WatchdogTickDecision {
  if (input.hidden) {
    return { action: 'none', reason: 'hidden' };
  }
  if (isQuietRealtimeHealthy(input.connected)) {
    return { action: 'none', reason: 'subscribed_quiet_ok' };
  }
  if (input.resubscribeInFlight) {
    return { action: 'skip_backoff', reason: 'resubscribe_in_flight', delayMs: 0 };
  }
  if (input.now < input.nextResubscribeAt) {
    return {
      action: 'skip_backoff',
      reason: 'backoff_wait',
      delayMs: input.nextResubscribeAt - input.now,
    };
  }
  return { action: 'resubscribe', reason: 'realtime_not_subscribed' };
}

export type SingleFlightResult<T> =
  | { kind: 'ran'; value: T }
  | { kind: 'joined'; value: T }
  | { kind: 'skipped_in_flight' };

/**
 * Coalescing single-flight: at most one runner; overlapping callers join the
 * same Promise (or mark pending for one follow-up). Does NOT abort in-flight work.
 */
export class CoalescingSingleFlight<T> {
  private inflight: Promise<T> | null = null;
  private pending = false;
  private pendingReason: string | null = null;

  get inFlight(): boolean {
    return this.inflight != null;
  }

  get hasPending(): boolean {
    return this.pending;
  }

  /**
   * @param mode
   *  - 'join': await the same in-flight promise
   *  - 'coalesce': skip now; set pending so caller can drain once after
   */
  async run(
    fn: () => Promise<T>,
    opts?: { mode?: 'join' | 'coalesce'; reason?: string },
  ): Promise<SingleFlightResult<T>> {
    const mode = opts?.mode ?? 'coalesce';
    if (this.inflight) {
      if (mode === 'join') {
        const value = await this.inflight;
        return { kind: 'joined', value };
      }
      this.pending = true;
      this.pendingReason = opts?.reason ?? 'coalesce';
      return { kind: 'skipped_in_flight' };
    }

    const runOnce = async (): Promise<T> => {
      try {
        return await fn();
      } finally {
        this.inflight = null;
      }
    };

    this.inflight = runOnce();
    const value = await this.inflight;
    return { kind: 'ran', value };
  }

  /** If a coalesce happened during flight, clear pending and return true once. */
  consumePending(): { pending: boolean; reason: string | null } {
    if (!this.pending) return { pending: false, reason: null };
    const reason = this.pendingReason;
    this.pending = false;
    this.pendingReason = null;
    return { pending: true, reason };
  }

  /**
   * Run with coalesce mode, then drain at most one pending follow-up.
   * Never aborts in-flight work.
   */
  async runThenDrain(
    fn: () => Promise<T>,
    opts?: { reason?: string },
  ): Promise<{ primary: SingleFlightResult<T>; drained: boolean }> {
    const primary = await this.run(fn, { mode: 'coalesce', reason: opts?.reason });
    if (primary.kind === 'skipped_in_flight') {
      return { primary, drained: false };
    }
    const { pending } = this.consumePending();
    if (!pending) return { primary, drained: false };
    const follow = await this.run(fn, { mode: 'join', reason: 'coalesced_followup' });
    return { primary: follow.kind === 'ran' || follow.kind === 'joined' ? follow : primary, drained: true };
  }

  reset(): void {
    this.inflight = null;
    this.pending = false;
    this.pendingReason = null;
  }
}

/** Structured poll/realtime log (no PII). */
export function logChatPollEvent(
  event:
    | 'CHAT_POLL_STARTED'
    | 'CHAT_POLL_SKIPPED_IN_FLIGHT'
    | 'CHAT_POLL_BACKOFF'
    | 'CHAT_POLL_RECOVERED'
    | 'CHAT_REALTIME_STATUS'
    | 'CHAT_REALTIME_RESUBSCRIBE_SCHEDULED'
    | 'CHAT_REALTIME_RESUBSCRIBED'
    | 'CHAT_RECONCILE_STARTED'
    | 'CHAT_RECONCILE_COALESCED',
  fields: Record<string, unknown>,
): void {
  // eslint-disable-next-line no-console
  console.info(`[${event}]`, fields);
}
