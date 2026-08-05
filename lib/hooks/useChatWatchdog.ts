import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils/json';
import {
  decideWatchdogTick,
  logChatPollEvent,
  nextBackoffMs,
} from '@/lib/chat/pollResilience';
// P0-B: no-ops unless the diag flag is on.
import {
  createInstrumentedInterval,
  newClientInstanceId,
  recordDiagEvent,
  recordHookMount,
  recordHookUnmount,
} from '@/lib/chat/pollDiag';

const HOOK_NAME = 'useChatWatchdog';

/**
 * Watchdog: Realtime health + visibility reconcile only.
 * SUBSCRIBED + quiet (no INSERT) is healthy — never triggers full list fetch.
 * CHANNEL_ERROR / TIMED_OUT / not connected → backoff resubscribe, then 1× reconcile.
 */

export function useChatWatchdog({
  supabase,
  loadFull,
  messagesRef,
  realtimeConnectedRef,
  lastRealtimeActivityAtRef,
  lastRealtimeInsertPushAtRef,
  safeSinceRef,
  isMountedRef,
  isLoadingRef,
  onConnectionStatus,
  onRequestResubscribe
}: {
  supabase: any;
  loadFull: (source: string) => Promise<any>;
  messagesRef: React.MutableRefObject<any[]>;
  realtimeConnectedRef: React.MutableRefObject<boolean>;
  lastRealtimeActivityAtRef: React.MutableRefObject<number>;
  lastRealtimeInsertPushAtRef: React.MutableRefObject<number | null>;
  safeSinceRef: React.MutableRefObject<string | null>;
  isMountedRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  onConnectionStatus?: (s: 'connected' | 'degraded' | 'reconnecting') => void;
  onRequestResubscribe?: () => Promise<boolean> | boolean;
}) {
  const lastRestoreFullLoadAtRef = useRef(0);
  const reconcileInFlightRef = useRef(false);
  const clientInstanceIdRef = useRef<string>('');
  if (!clientInstanceIdRef.current) clientInstanceIdRef.current = newClientInstanceId();
  const watchdogIntervalRef = useRef<{ clear: () => void } | null>(null);
  const pendingVisibleReconcileRef = useRef(false);
  const pollIntervalRef = useRef<number | null>(null);
  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const loadFullRef = useRef(loadFull);
  loadFullRef.current = loadFull;
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;
  const notConnectedStreakRef = useRef(0);
  const resubscribeInFlightRef = useRef(false);
  const nextResubscribeAtRef = useRef(0);
  const resubscribeFailuresRef = useRef(0);
  const lastRealtimeStatusRef = useRef<string | null>(null);
  const wasConnectedRef = useRef(false);

  const DEBUG_VERBOSE = process.env.NEXT_PUBLIC_CHAT_DEBUG_VERBOSE === '1';

  useEffect(() => {
    const FULL_RESTORE_THROTTLE_MS = 5000;
    const RESTORE_IF_INACTIVE_MS = 20000;

    const runVisibleReconcile = (source: string, reason: string) => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      const now = Date.now();
      if (now - lastRestoreFullLoadAtRef.current < FULL_RESTORE_THROTTLE_MS) {
        logChatPollEvent('CHAT_RECONCILE_COALESCED', {
          endpointKey: 'chat-list',
          reason: 'restore_throttle',
          source,
        });
        return;
      }
      if (reconcileInFlightRef.current || isLoadingRef.current) {
        pendingVisibleReconcileRef.current = true;
        logChatPollEvent('CHAT_RECONCILE_COALESCED', {
          endpointKey: 'chat-list',
          reason: 'in_flight',
          source,
        });
        return;
      }

      lastRestoreFullLoadAtRef.current = now;
      reconcileInFlightRef.current = true;
      logChatPollEvent('CHAT_RECONCILE_STARTED', {
        endpointKey: 'chat-list',
        reason,
        source,
        visibilityState: document.visibilityState,
        ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current,
      });
      log.info('[CHAT_VISIBILITY_RESTORE]', {
        reason,
        ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current,
      });

      void (async () => {
        try {
          await loadFullRef.current(source);
        } finally {
          reconcileInFlightRef.current = false;
          if (pendingVisibleReconcileRef.current && isMountedRef.current) {
            pendingVisibleReconcileRef.current = false;
            // At most one follow-up after overlapping visibility/pageshow.
            const followNow = Date.now();
            if (followNow - lastRestoreFullLoadAtRef.current >= FULL_RESTORE_THROTTLE_MS) {
              lastRestoreFullLoadAtRef.current = followNow;
              logChatPollEvent('CHAT_RECONCILE_STARTED', {
                endpointKey: 'chat-list',
                reason: 'coalesced_followup',
                source: `${source}_coalesced`,
              });
              void loadFullRef.current(`${source}_coalesced`);
            }
          }
        }
      })();
    };

    const maybeRequestVisibleReconcile = (source: string) => {
      const pushEver = lastRealtimeInsertPushAtRef.current != null;
      const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
      const empty = messagesRef.current.length === 0;
      if (!pushEver) {
        runVisibleReconcile(source, 'push_ever_false');
        return;
      }
      if (empty) {
        runVisibleReconcile(source, 'messages_empty');
        return;
      }
      if (msSinceActivity > RESTORE_IF_INACTIVE_MS) {
        runVisibleReconcile(source, 'inactive_too_long');
        return;
      }
      log.debug('[FULL_RELOAD_SKIPPED]', { source, reason: 'recently_active' });
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        maybeRequestVisibleReconcile('bfcache_pageshow');
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      maybeRequestVisibleReconcile('visibility_restore');
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      pendingVisibleReconcileRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
  }, []);

  useEffect(() => {
    log.debug('[CHAT_WATCHDOG_EFFECT_MOUNT]');

    const POLLING_LEADER_KEY = 'autoflow_polling_leader';
    const LEADER_TTL_MS = 45000;
    const TICK_MS = 10000;

    const isPollingLeader = (): boolean => {
      const now = Date.now();
      let leader: { id?: string; ts?: number } | null = null;
      try {
        const raw = localStorage.getItem(POLLING_LEADER_KEY);
        const parsed = safeParseJson(raw);
        leader =
          parsed && typeof parsed === 'object' && parsed !== null ? (parsed as { id?: string; ts?: number }) : null;
      } catch {
        leader = null;
      }
      const leaderId = String(leader?.id || '');
      const leaderTs = Number(leader?.ts || 0);
      const expired = !leaderId || !Number.isFinite(leaderTs) || now - leaderTs > LEADER_TTL_MS;
      const mine = leaderId === tabIdRef.current;
      if (expired || mine) {
        localStorage.setItem(POLLING_LEADER_KEY, JSON.stringify({ id: tabIdRef.current, ts: now }));
        return true;
      }
      return false;
    };

    const scheduleResubscribe = () => {
      if (!onRequestResubscribe) return;
      if (resubscribeInFlightRef.current) {
        logChatPollEvent('CHAT_REALTIME_RESUBSCRIBE_SCHEDULED', {
          reason: 'already_in_flight',
          attempt: resubscribeFailuresRef.current,
        });
        return;
      }

      const now = Date.now();
      if (now < nextResubscribeAtRef.current) {
        logChatPollEvent('CHAT_POLL_BACKOFF', {
          endpointKey: 'realtime-resubscribe',
          reason: 'backoff_wait',
          attempt: resubscribeFailuresRef.current,
          delayMs: nextResubscribeAtRef.current - now,
        });
        return;
      }

      resubscribeInFlightRef.current = true;
      onConnectionStatus?.('reconnecting');
      logChatPollEvent('CHAT_REALTIME_RESUBSCRIBE_SCHEDULED', {
        reason: 'realtime_not_subscribed',
        attempt: resubscribeFailuresRef.current,
      });

      void (async () => {
        try {
          const ok = await onRequestResubscribe();
          if (ok) {
            resubscribeFailuresRef.current = 0;
            // Grace: wait for SUBSCRIBED after remount; avoid immediate re-bump of reconnectToken.
            nextResubscribeAtRef.current = Date.now() + 15_000;
            logChatPollEvent('CHAT_REALTIME_RESUBSCRIBED', {
              reason: 'resubscribe_ok',
              attempt: 0,
            });
            // Exactly one reconciliation; loader single-flight coalesces if list already in flight.
            if (typeof document === 'undefined' || !document.hidden) {
              logChatPollEvent('CHAT_RECONCILE_STARTED', {
                endpointKey: 'chat-list',
                reason: 'post_resubscribe',
              });
              recordDiagEvent({
                reason: 'watchdog_reconcile',
                hookName: HOOK_NAME,
                clientInstanceId: clientInstanceIdRef.current,
              });
              await loadFullRef.current('realtime_resubscribe_reconcile');
            }
          } else {
            resubscribeFailuresRef.current += 1;
            const delayMs = nextBackoffMs(resubscribeFailuresRef.current - 1);
            nextResubscribeAtRef.current = Date.now() + delayMs;
            logChatPollEvent('CHAT_POLL_BACKOFF', {
              endpointKey: 'realtime-resubscribe',
              reason: 'resubscribe_failed',
              attempt: resubscribeFailuresRef.current,
              delayMs,
            });
          }
        } catch (e) {
          resubscribeFailuresRef.current += 1;
          const delayMs = nextBackoffMs(resubscribeFailuresRef.current - 1);
          nextResubscribeAtRef.current = Date.now() + delayMs;
          log.warn('[CHAT_CONNECTION_RESUBSCRIBE_FAILED]', { error: String(e) });
          logChatPollEvent('CHAT_POLL_BACKOFF', {
            endpointKey: 'realtime-resubscribe',
            reason: 'resubscribe_throw',
            attempt: resubscribeFailuresRef.current,
            delayMs,
          });
        } finally {
          resubscribeInFlightRef.current = false;
        }
      })();
    };

    const tick = () => {
      log.debug('[CHAT_WATCHDOG_INTERVAL_ENTER]');
      recordDiagEvent({
        reason: 'watchdog_tick',
        hookName: HOOK_NAME,
        clientInstanceId: clientInstanceIdRef.current,
      });
      if (!isMountedRef.current) {
        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'not_mounted' });
        return;
      }

      void isPollingLeader();

      const hidden = typeof document !== 'undefined' ? document.hidden : false;
      const connected = realtimeConnectedRef.current;

      if (connected !== wasConnectedRef.current) {
        const status = connected ? 'SUBSCRIBED' : 'NOT_SUBSCRIBED';
        if (lastRealtimeStatusRef.current !== status) {
          lastRealtimeStatusRef.current = status;
          logChatPollEvent('CHAT_REALTIME_STATUS', {
            realtimeStatus: status,
            visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
          });
        }
        wasConnectedRef.current = connected;
      }

      if (connected) {
        if (notConnectedStreakRef.current > 0 && DEBUG_VERBOSE) {
          log.info('[CHAT_CONNECTION_STATE]', { connected, not_connected_streak: 0 });
        }
        notConnectedStreakRef.current = 0;
        onConnectionStatus?.('connected');
      } else {
        notConnectedStreakRef.current += 1;
        if (DEBUG_VERBOSE) {
          log.info('[CHAT_CONNECTION_STATE]', {
            connected,
            not_connected_streak: notConnectedStreakRef.current,
            ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current
          });
        }
        onConnectionStatus?.(notConnectedStreakRef.current >= 3 ? 'degraded' : 'reconnecting');
      }

      const decision = decideWatchdogTick({
        connected,
        hidden,
        now: Date.now(),
        nextResubscribeAt: nextResubscribeAtRef.current,
        resubscribeInFlight: resubscribeInFlightRef.current,
        notConnectedStreak: notConnectedStreakRef.current,
        minNotConnectedStreak: 2,
      });

      if (decision.action === 'none') {
        // SUBSCRIBED + quiet → no full fetch (realtime_quiet_watchdog_full removed).
        log.debug('[CHAT_WATCHDOG_SKIP]', {
          reason: decision.reason,
          silence_ms: Date.now() - lastRealtimeActivityAtRef.current,
        });
        recordDiagEvent({
          reason: 'watchdog_quiet',
          hookName: HOOK_NAME,
          clientInstanceId: clientInstanceIdRef.current,
          detail: { decision: decision.reason },
        });
        return;
      }

      if (decision.action === 'skip_backoff') {
        log.debug('[CHAT_WATCHDOG_SKIP]', {
          reason: decision.reason,
          delayMs: decision.delayMs,
        });
        recordDiagEvent({
          reason: 'backoff_start',
          hookName: HOOK_NAME,
          clientInstanceId: clientInstanceIdRef.current,
          detail: { delay_ms: decision.delayMs },
        });
        return;
      }

      // action === 'resubscribe' — never pair with forced full list every tick.
      scheduleResubscribe();
    };

    recordHookMount({
      clientInstanceId: clientInstanceIdRef.current,
      hookName: HOOK_NAME,
      componentName: HOOK_NAME,
    });
    watchdogIntervalRef.current = createInstrumentedInterval({
      hookName: HOOK_NAME,
      componentName: HOOK_NAME,
      clientInstanceId: clientInstanceIdRef.current,
      intervalMs: TICK_MS,
      callback: tick,
      setIntervalFn: (cb, ms) => window.setInterval(cb, ms),
      clearIntervalFn: (h) => window.clearInterval(h as number),
    });
    log.debug('[POLLING_TICK_STARTED]', { interval_ms: TICK_MS, quiet_watchdog_full: false });

    return () => {
      try {
        const raw = localStorage.getItem(POLLING_LEADER_KEY);
        const parsed = safeParseJson(raw);
        const leader =
          parsed && typeof parsed === 'object' && parsed !== null ? (parsed as { id?: string }) : null;
        if (String(leader?.id || '') === tabIdRef.current) {
          localStorage.removeItem(POLLING_LEADER_KEY);
        }
      } catch {}
      if (watchdogIntervalRef.current) {
        watchdogIntervalRef.current.clear();
        watchdogIntervalRef.current = null;
      }
      recordHookUnmount({ clientInstanceId: clientInstanceIdRef.current, hookName: HOOK_NAME });
      resubscribeInFlightRef.current = false;
      pendingVisibleReconcileRef.current = false;
      log.debug('[POLLING_STOP]', { reason: 'effect_cleanup' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs only
  }, []);
}
