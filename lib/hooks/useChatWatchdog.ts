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
  const notConnectedStreakRef = useRef(0);
  const lastRecoverAtRef = useRef(0);
  const lastHiddenPollAtRef = useRef(0);
  /** Cooldown for realtime_quiet_watchdog_full: cap idle stale polls to once/60s. */
  const lastQuietFullAtRef = useRef(0);

  const DEBUG_VERBOSE = process.env.NEXT_PUBLIC_CHAT_DEBUG_VERBOSE === '1';

  useEffect(() => {
    visibilityEffectMountCountRef.current += 1;
    console.log('[CHAT_WATCHDOG_VISIBILITY_MOUNT]', { mountCount: visibilityEffectMountCountRef.current });
    // visibility / focus refetch: useChatRefetchFallback (shared PC + staff-chat).

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const pushEver = lastRealtimeInsertPushAtRef.current != null;
      const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
      const empty = messagesRef.current.length === 0;
      if (!pushEver || empty || msSinceActivity > 20000) {
        log.info('[CHAT_BFCache_PAGESHOW]', {
          push_ever: pushEver,
          empty,
          ms_since_activity: msSinceActivity
        });
      }
    };

    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
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
    const HIDDEN_POLL_MIN_MS = 30000;
    const QUIET_FULL_COOLDOWN_MS = 60000;

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

      const hidden = document.hidden;

      // Core v0.1: hidden tab also polls at least every 30s to catch missed messages.
      if (hidden) {
        const nowHidden = Date.now();
        if (nowHidden - lastHiddenPollAtRef.current >= HIDDEN_POLL_MIN_MS) {
          lastHiddenPollAtRef.current = nowHidden;
          log.info('[CHAT_WATCHDOG_HIDDEN_POLL]', { reason: 'hidden_tab_fallback' });
          void (async () => {
            const result = await loadFullRef.current('hidden_tab_poll');
            log.debug('[CHAT_WATCHDOG_HIDDEN_POLL_DONE]', { ok: Boolean(result?.ok), count: result?.count ?? 0 });
          })();
        }
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
        notConnectedStreakRef.current += 1;
        if (DEBUG_VERBOSE) {
          log.info('[CHAT_CONNECTION_STATE]', {
            connected,
            not_connected_streak: notConnectedStreakRef.current,
            ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current
          });
        }
        onConnectionStatus?.(notConnectedStreakRef.current >= 3 ? 'degraded' : 'reconnecting');

        // Auto-recover: if not_connected persists, force a full reload fetch (visible or hidden).
        const now = Date.now();
        const RECOVER_MIN_INTERVAL_MS = 30_000;
        if (notConnectedStreakRef.current >= 2 && now - lastRecoverAtRef.current > RECOVER_MIN_INTERVAL_MS) {
          lastRecoverAtRef.current = now;
          log.warn('[CHAT_CONNECTION_DEGRADED]', {
            reason: 'not_connected_streak',
            streak: notConnectedStreakRef.current,
            ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current
          });
          log.info('[CHAT_CONNECTION_RECOVER_START]', { source: 'not_connected_full_reload' });
          void (async () => {
            const result = await loadFullRef.current('not_connected_recover_full');
            log.info('[CHAT_CONNECTION_RECOVER_FULL_DONE]', { ok: Boolean(result?.ok), count: result?.count ?? 0 });

            if (onRequestResubscribe) {
              log.info('[CHAT_CONNECTION_RESUBSCRIBE_START]', { reason: 'post_full_recover' });
              try {
                const ok = await onRequestResubscribe();
                log.info('[CHAT_CONNECTION_RESUBSCRIBE_DONE]', { ok: Boolean(ok) });
              } catch (e) {
                log.warn('[CHAT_CONNECTION_RESUBSCRIBE_FAILED]', { error: String(e) });
              }
            }
          })();
        }

        log.debug('[CHAT_WATCHDOG_SKIP]', { reason: 'not_connected' });
        return;
      } else {
        if (notConnectedStreakRef.current > 0 && DEBUG_VERBOSE) {
          log.info('[CHAT_CONNECTION_STATE]', { connected, not_connected_streak: 0 });
        }
        notConnectedStreakRef.current = 0;
        onConnectionStatus?.('connected');
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

      // Cooldown: once realtime is idle-stale, `stale` stays true every 10s tick
      // (loadFull does not touch lastRealtimeActivityAtRef by design). Cap the quiet
      // full-load to once per 60s so it stays a safety net, not a per-tick poll.
      const nowQuiet = Date.now();
      if (nowQuiet - lastQuietFullAtRef.current < QUIET_FULL_COOLDOWN_MS) {
        log.debug('[CHAT_WATCHDOG_SKIP]', {
          reason: 'quiet_full_cooldown',
          cooldown_ms: QUIET_FULL_COOLDOWN_MS,
          ms_since_last_quiet_full: nowQuiet - lastQuietFullAtRef.current
        });
        return;
      }
      lastQuietFullAtRef.current = nowQuiet;

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

