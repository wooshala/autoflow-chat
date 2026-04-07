import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils/json';

/**
 * 워치독 ↔ useChatLoader(Abort + loadSeq) 상호작용 요약
 * - 목록 요청은 새 호출 시 이전 AbortController를 abort 하며, loadSeq로 늦게 도착한 응답은 merge 하지 않음.
 * - `isLoadingRef`가 true면 가시성 복구 시 즉시 loadFull 대신 450ms·1950ms 두 번 지연 재시도(체인당 1세트, 중복 스케줄 방지).
 * - “빠른 방 전환”: 본 MVP는 단일 기본 room 목록만 list로 불러오며 RoomParticipantsPanel만 roomId 전환; 채팅 list는 동일.
 * - realtime 끊김 후: 폴링/가시성 경로가 loadFull을 호출하면 동일 abort/seq 규칙이 적용됨.
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
  isLoadingRef
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
}) {
  const lastRestoreFullLoadAtRef = useRef(0);
  const deferredRetryChainRef = useRef<{
    t1: ReturnType<typeof setTimeout>;
    t2: ReturnType<typeof setTimeout>;
  } | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const pollingStartedRef = useRef(false);
  const lastDisconnectedPollAtRef = useRef(0);
  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const loadFullRef = useRef(loadFull);
  loadFullRef.current = loadFull;
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;
  const pollingEffectMountCountRef = useRef(0);
  const visibilityEffectMountCountRef = useRef(0);

  useEffect(() => {
    visibilityEffectMountCountRef.current += 1;
    console.log('[CHAT_WATCHDOG_VISIBILITY_MOUNT]', { mountCount: visibilityEffectMountCountRef.current });
    // Visibility / BFCache restore: perform a guarded full reload only when we likely missed updates.
    const FULL_RESTORE_THROTTLE_MS = 5000;
    const RESTORE_IF_INACTIVE_MS = 20000;
    const DEFERRED_RETRY_MS_1 = 450;
    const DEFERRED_RETRY_MS_2 = 450 + 1500;

    const requestFullReload = (source: string, reason: string) => {
      const now = Date.now();
      if (now - lastRestoreFullLoadAtRef.current < FULL_RESTORE_THROTTLE_MS) {
        log.debug('[FULL_RELOAD_SKIPPED]', { source, reason: 'restore_throttle' });
        return;
      }
      if (isLoadingRef.current) {
        log.debug('[FULL_RELOAD_SKIPPED]', { source, reason: 'already_loading' });
        if (deferredRetryChainRef.current) {
          return;
        }
        const attempt = (tag: string) => {
          if (!isMountedRef.current) return;
          if (isLoadingRef.current) {
            log.debug('[FULL_RELOAD_RETRY_SKIPPED]', { source, tag, reason: 'still_loading' });
            return;
          }
          const chain = deferredRetryChainRef.current;
          if (chain) {
            clearTimeout(chain.t1);
            clearTimeout(chain.t2);
            deferredRetryChainRef.current = null;
          }
          lastRestoreFullLoadAtRef.current = Date.now();
          log.info('[CHAT_VISIBILITY_RESTORE]', {
            reason: 'deferred_after_already_loading',
            tag,
            source
          });
          void loadFullRef.current(`${source}_${tag}`);
        };
        const t1 = setTimeout(() => attempt('deferred_450ms'), DEFERRED_RETRY_MS_1);
        const t2 = setTimeout(() => attempt('deferred_1950ms'), DEFERRED_RETRY_MS_2);
        deferredRetryChainRef.current = { t1, t2 };
        return;
      }
      lastRestoreFullLoadAtRef.current = now;
      const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
      log.info('[CHAT_VISIBILITY_RESTORE]', {
        reason,
        ms_since_activity: msSinceActivity
      });
      void loadFullRef.current(source);
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const pushEver = lastRealtimeInsertPushAtRef.current != null;
        const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
        const empty = messagesRef.current.length === 0;
        if (!pushEver) {
          requestFullReload('bfcache_pageshow', 'push_ever_false');
        } else if (empty) {
          requestFullReload('bfcache_pageshow', 'messages_empty');
        } else if (msSinceActivity > RESTORE_IF_INACTIVE_MS) {
          requestFullReload('bfcache_pageshow', 'inactive_too_long');
        } else {
          log.debug('[FULL_RELOAD_SKIPPED]', { source: 'bfcache_pageshow', reason: 'recently_active' });
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const pushEver = lastRealtimeInsertPushAtRef.current != null;
      const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
      const empty = messagesRef.current.length === 0;
      if (!pushEver) {
        requestFullReload('visibility_restore', 'push_ever_false');
        return;
      }
      if (empty) {
        requestFullReload('visibility_restore', 'messages_empty');
        return;
      }
      if (msSinceActivity > RESTORE_IF_INACTIVE_MS) {
        requestFullReload('visibility_restore', 'inactive_too_long');
        return;
      }
      log.debug('[FULL_RELOAD_SKIPPED]', { source: 'visibility_restore', reason: 'recently_active' });
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (deferredRetryChainRef.current) {
        clearTimeout(deferredRetryChainRef.current.t1);
        clearTimeout(deferredRetryChainRef.current.t2);
        deferredRetryChainRef.current = null;
      }
    };
    // loadFull은 loadFullRef로 최신 참조 — deps에 넣지 않아 가시성 리스너는 마운트당 1회만 구독.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref 객체·loadFullRef는 안정, 콜백은 ref.current로 최신화
  }, []);

  useEffect(() => {
    pollingEffectMountCountRef.current += 1;
    console.log('[CHAT_WATCHDOG_POLLING_MOUNT]', { mountCount: pollingEffectMountCountRef.current });
    log.debug('[CHAT_WATCHDOG_EFFECT_MOUNT]');
    // Watchdog polling effect (realtime stays in separate hook; this keeps polling/watchdog here).
    const ENABLE_POLLING_WATCHDOG_DELTA = true;

    log.debug('[CHAT_WATCHDOG_EFFECT_STATE]', {
      hasSupabase: !!supabaseRef.current,
      enabled: ENABLE_POLLING_WATCHDOG_DELTA
    });

    if (!ENABLE_POLLING_WATCHDOG_DELTA) {
      log.debug('[CHAT_AUTO_REFRESH_DISABLED]', { feature: 'polling_watchdog_delta' });
    }
    if (ENABLE_POLLING_WATCHDOG_DELTA) {
      log.debug('[CHAT_WATCHDOG_ARMED]', { enabled: true });
    }

    const POLLING_LEADER_KEY = 'autoflow_polling_leader';
    const LEADER_TTL_MS = 45000;

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

    const TICK_MS = 10000;
    const REALTIME_SILENCE_MS_NO_PUSH = 15000;
    const REALTIME_SILENCE_MS_AFTER_PUSH = 90000;
    const DISCONNECTED_POLL_MIN_MS = 30000;

    const tick = () => {
      log.debug('[CHAT_WATCHDOG_INTERVAL_ENTER]');
      if (!ENABLE_POLLING_WATCHDOG_DELTA) {
        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'disabled' });
        return;
      }
      if (!isMountedRef.current) {
        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'not_mounted' });
        return;
      }
      if (document.hidden) {
        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'hidden_tab' });
        return;
      }

      // (Leader election retained to avoid behavior drift, though we currently only use "stale" path.)
      if (!isPollingLeader()) {
        // keep silent (previous code logged other polling skips; this retains leader behavior without adding new logs)
      }

      const connected = realtimeConnectedRef.current;
      const pushEver = lastRealtimeInsertPushAtRef.current != null;
      const silenceLimitMs = pushEver ? REALTIME_SILENCE_MS_AFTER_PUSH : REALTIME_SILENCE_MS_NO_PUSH;
      const stale = connected && Date.now() - lastRealtimeActivityAtRef.current > silenceLimitMs;

      if (!connected) {
        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'not_connected' });
        return;
      }
      if (!stale) {
        log.debug('[CHAT_WATCHDOG_SKIP]', {
          reason: 'not_stale',
          silence_limit_ms: silenceLimitMs,
          push_ever: pushEver,
          ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current
        });
        return;
      }

      const since = safeSinceRef.current;
      log.info('[CHAT_WATCHDOG_TICK]', { reason: 'realtime_stale', since: since || null });
      void (async () => {
        const result = await loadFullRef.current('realtime_quiet_watchdog_full');
        log.debug('[CHAT_WATCHDOG_RESULT]', { ok: Boolean(result?.ok), count: result?.count ?? 0 });
      })();

      // Disconnected polling path retained (currently unused because we return above),
      // but keep the fields to preserve behavior if re-enabled later.
      const now = Date.now();
      if (now - lastDisconnectedPollAtRef.current < DISCONNECTED_POLL_MIN_MS) return;
      lastDisconnectedPollAtRef.current = now;
    };

    if (ENABLE_POLLING_WATCHDOG_DELTA && !pollIntervalRef.current) {
      log.debug('[CHAT_WATCHDOG_ARMING_NOW]');
      pollIntervalRef.current = window.setInterval(tick, TICK_MS);
      pollingStartedRef.current = true;
      log.debug('[POLLING_TICK_STARTED]', {
        interval_ms: TICK_MS,
        realtime_silence_ms_no_push: REALTIME_SILENCE_MS_NO_PUSH,
        realtime_silence_ms_after_push: REALTIME_SILENCE_MS_AFTER_PUSH
      });
    }

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
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollingStartedRef.current = false;
      log.debug('[POLLING_STOP]', { reason: 'effect_cleanup' });
    };
    // loadFull·supabase는 ref로 최신화 — 폴링 interval은 마운트당 1회만 시작.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref 기반; interval 재시작 방지
  }, []);
}

