'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ChatMessage, ISSUE_TYPES, ISSUE_UI, IssueType, SenderSide, User } from '@/lib/types';
import ChatMessages from '@/components/ChatMessages';
import RoomParticipantsPanel from '@/components/RoomParticipantsPanel';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import { CHAT_DELETE_URL, CHAT_LIST_URL, CHAT_MANUAL_TICKET_URL, CHAT_SEND_URL } from '@/lib/chatApi';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function sortMessagesAsc(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function maxCreatedAt(msgs: ChatMessage[]): string | null {
  if (!msgs?.length) return null;
  let max = '';
  for (const m of msgs) {
    const t = m?.created_at;
    if (!t) continue;
    const s = String(t);
    if (!max || s.localeCompare(max) > 0) max = s;
  }
  return max || null;
}

function getDeviceSide(): SenderSide {
  if (typeof navigator === 'undefined') return 'pc';
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(ua) ? 'mobile' : 'pc';
}

export default function ChatPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const realtimeConnectedRef = useRef(false);
  const isMountedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const lastLoadSourceRef = useRef<string | null>(null);
  const initialRetryCountRef = useRef(0);
  const initialAttemptIdRef = useRef(0);
  const pollIntervalRef = useRef<number | null>(null);
  const pollingStartedRef = useRef(false);
  const lastRealtimeActivityAtRef = useRef(Date.now());
  /** full_table 성공 후에만 갱신되는 안전 since (stale since/delta-only 방지) */
  const safeSinceRef = useRef<string | null>(null);
  const hasSuccessfulFullLoadRef = useRef(false);
  /** BFCache/visibility restore 등에서 다음 watchdog은 full_table 강제 */
  const forceFullReloadRef = useRef(false);
  const lastRestoreFullLoadAtRef = useRef(0);
  const lastDoubleFullLoadAtRef = useRef(0);
  /** INSERT postgres_changes만 기록 — SUBSCRIBED/UPDATE와 구분해 push 실패 확정용 */
  const lastRealtimeInsertPushAtRef = useRef<number | null>(null);
  /** 동일 since로 delta가 연속 0건일 때 백오프 (임시 안전망 과호출 방지) */
  const lastQuietWatchdogSinceKeyRef = useRef<string | null>(null);
  const quietWatchdogEmptyStreakRef = useRef(0);
  const quietWatchdogBackoffUntilRef = useRef(0);
  const lastDisconnectedPollAtRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const tabIdRef = useRef(`tab-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const loadAbortRef = useRef<AbortController | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadNum, setKeypadNum] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>('설비');
  const [submitting, setSubmitting] = useState(false);
  /** soft delete 진행 중 message id — 중복 요청 방지 */
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const buildTag = process.env.NEXT_PUBLIC_BUILD_TAG || 'dev-local';

  function getOrCreateDeviceId(): string {
    try {
      const key = 'autoflow_device_id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated = `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return 'dev-fallback';
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem('autoflow_user');
    if (!raw) {
      console.log('[LOGIN_REDIRECT]', {
        from: '/chat',
        to: '/',
        reason: 'missing_autoflow_user',
        has_mounted: isMountedRef.current,
        last_load_source: lastLoadSourceRef.current
      });
      router.push('/');
      return;
    }
    try {
      const parsed = JSON.parse(raw) as User | null;
      if (!parsed?.id) {
        localStorage.removeItem('autoflow_user');
        console.log('[LOGIN_REDIRECT]', {
          from: '/chat',
          to: '/',
          reason: 'missing_user_id',
          has_mounted: isMountedRef.current,
          last_load_source: lastLoadSourceRef.current
        });
        router.push('/');
        return;
      }
      setUser(parsed);
    } catch {
      localStorage.removeItem('autoflow_user');
      console.log('[LOGIN_REDIRECT]', {
        from: '/chat',
        to: '/',
        reason: 'invalid_json_removed',
        has_mounted: isMountedRef.current,
        last_load_source: lastLoadSourceRef.current
      });
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  async function load(
    source: string = 'manual',
    opts?: { since?: string; mode?: 'full' | 'delta' }
  ): Promise<{ ok: boolean; count: number; maxCreatedAt: string | null }> {
    if (!isMountedRef.current) {
      console.log('[CHAT_LOAD_SKIPPED]', {
        source,
        reason: 'not_mounted',
        has_user_state: Boolean(user?.id),
        user_id: user?.id ?? null
      });
      return;
    }
    if (isLoadingRef.current) {
      console.log('[CHAT_LOAD_SKIPPED]', {
        source,
        reason: 'already_loading',
        last_load_source: lastLoadSourceRef.current,
        has_user_state: Boolean(user?.id),
        user_id: user?.id ?? null
      });
      return;
    }

    const controller = new AbortController();
    loadAbortRef.current = controller;
    isLoadingRef.current = true;
    lastLoadSourceRef.current = source;
    if (source === 'initial' || source === 'initial_retry') {
      console.log('[CHAT_LOAD_START]', {
        source,
        since: opts?.since ?? null,
        limit: opts?.since ? 40 : 50
      });
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', opts?.since ? '40' : '50');
      if (opts?.since) params.set('since', opts.since);
      const listUrl = `${CHAT_LIST_URL}?${params.toString()}`;
      const res = await fetch(listUrl, {
        cache: 'no-store',
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`CHAT_LIST_HTTP_${res.status}`);
      }

      const data = await res.json();
      const nextMessages = Array.isArray(data?.messages) ? data.messages : null;
      if (source === 'initial' || source === 'initial_retry') {
        console.log('[CHAT_SET_MESSAGES_COUNT]', nextMessages?.length ?? 0);
      }
      if (!controller.signal.aborted && isMountedRef.current) {
        if (nextMessages) {
          const thisMax = maxCreatedAt(nextMessages as ChatMessage[]);
          const effectiveMode: 'full' | 'delta' =
            opts?.mode || (opts?.since ? 'delta' : 'full');
          if (effectiveMode === 'full') {
            // 초기/복귀는 full_table 성공 후에만 since 갱신
            safeSinceRef.current = thisMax;
            hasSuccessfulFullLoadRef.current = true;
            console.log('[SAFE_SINCE_UPDATED_AFTER_FULL]', { source, safeSince: safeSinceRef.current });
          }
          setMessages((prev) => {
            const byId = new Map<string, ChatMessage>();
            prev.forEach((m) => {
              if (!m?.id) return;
              byId.set(String(m.id), m);
            });
            nextMessages.forEach((m: ChatMessage) => {
              if (!m?.id) return;
              const prevRow = byId.get(String(m.id));
              byId.set(String(m.id), prevRow ? { ...prevRow, ...m } : m);
            });
            const merged = sortMessagesAsc(Array.from(byId.values()));
            console.log('[SET_MESSAGES_MERGED_LAST_IDS]', {
              source,
              before_count: prev.length,
              incoming_count: nextMessages.length,
              merged_count: merged.length,
              merged_last5_ids: merged.slice(-5).map((m) => m?.id).filter(Boolean)
            });
            return merged;
          });
          if (source === 'realtime_quiet_watchdog' && nextMessages.length > 0) {
            lastRealtimeActivityAtRef.current = Date.now();
            quietWatchdogEmptyStreakRef.current = 0;
            lastQuietWatchdogSinceKeyRef.current = null;
            quietWatchdogBackoffUntilRef.current = 0;
            console.log('[REALTIME_STALE_RECOVERED]', { fetched: nextMessages.length });
          } else if (source === 'realtime_quiet_watchdog' && nextMessages.length === 0) {
            const sinceKey = opts?.since ?? '__full__';
            if (sinceKey === lastQuietWatchdogSinceKeyRef.current) {
              quietWatchdogEmptyStreakRef.current += 1;
            } else {
              lastQuietWatchdogSinceKeyRef.current = sinceKey;
              quietWatchdogEmptyStreakRef.current = 1;
            }
            const streak = quietWatchdogEmptyStreakRef.current;
            const backoffMs = Math.min(120000, 4000 * Math.pow(2, Math.min(streak - 1, 5)));
            quietWatchdogBackoffUntilRef.current = Date.now() + backoffMs;
            console.log('[WATCHDOG_DELTA_EMPTY]', { since: sinceKey, streak, backoff_ms: backoffMs });
          }
        } else {
          console.error('[CHAT_LIST_SHAPE_MISMATCH]', { source });
        }
      }
      const first3 = (nextMessages || []).slice(0, 3).map((m: any) => ({
        id: m?.id || null,
        message: m?.message || '',
        created_at: m?.created_at || null
      }));
      if (source === 'initial' || source === 'initial_retry') {
        console.log('[CHAT_LIST_RESPONSE]', {
          source,
          count: nextMessages?.length || 0,
          first3
        });
        console.log('[CHAT_LIST_LOAD_OK]', {
          source,
          count: nextMessages?.length || 0
        });
      }
      if (source === 'initial' || source === 'initial_retry') {
        console.log('[CHAT_INITIAL_SUCCESS]', { source, count: nextMessages?.length || 0 });
      }
      return {
        ok: true,
        count: nextMessages?.length || 0,
        maxCreatedAt: nextMessages ? maxCreatedAt(nextMessages as ChatMessage[]) : null
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (source === 'initial' || source === 'initial_retry') {
          console.log('[CHAT_INITIAL_ABORT]', {
            source,
            reason: 'abort_signal',
            attempt_id: initialAttemptIdRef.current
          });
        }
        console.log('[CHAT_LIST_LOAD_ABORT]', { source });
        return { ok: false, count: 0, maxCreatedAt: null };
      }
      console.error('[CHAT_LIST_LOAD_ERROR]', {
        source,
        error: error?.message || String(error)
      });
      // 실패해도 기존 messages 유지 (UI 크래시 방지)
      if (source === 'initial' || source === 'initial_retry') {
        console.log('[CHAT_INITIAL_LOAD]', {
          source,
          ok: false,
          reason: 'error',
          error: error?.message || String(error),
          attempt_id: initialAttemptIdRef.current
        });
      }
      return { ok: false, count: 0, maxCreatedAt: null };
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
      }
      isLoadingRef.current = false;
    }
  }

  async function loadFull(source: string) {
    return await load(source, { mode: 'full' });
  }

  async function loadDelta(source: string, since: string) {
    return await load(source, { since, mode: 'delta' });
  }

  const logUpsertDebug = (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  };

  function upsertMessageRow(row: Partial<ChatMessage> & { id?: string }) {
    const id = row?.id != null ? String(row.id) : '';
    if (!id) {
      console.warn('[REALTIME_SKIP]', { reason: 'missing_row_id', row });
      return;
    }
    const hadInRef = messagesRef.current.some((m) => String(m?.id) === id);
    // [DEBUG] 추후 제거 가능 — Realtime 병합 추적
    logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
      id,
      had_existing_in_messagesRef: hadInRef,
      is_deleted: row?.is_deleted ?? null
    });
    setMessages((prev) => {
      const idx = prev.findIndex((m) => String(m?.id) === id);
      logUpsertDebug('[UPSERT_MESSAGE_ROW]', {
        id,
        had_existing_in_prev: idx !== -1,
        merge_index: idx === -1 ? null : idx
      });
      if (idx === -1) {
        const next = sortMessagesAsc([...prev, { ...row, id } as ChatMessage]);
        console.log('[SET_MESSAGES_COUNT]', {
          source: 'realtime_upsert_insert',
          prev_count: prev.length,
          next_count: next.length
        });
        return next;
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...row, id };
      console.log('[REALTIME_DEDUPE_HIT]', {
        message_id: id,
        index: idx
      });
      console.log('[SET_MESSAGES_COUNT]', {
        source: 'realtime_upsert_update',
        prev_count: prev.length,
        next_count: next.length
      });
      return next;
    });
  }

  useEffect(() => {
    isMountedRef.current = true;
    initialAttemptIdRef.current += 1;
    initialRetryCountRef.current = 0;
    console.log('[CHAT_INITIAL_LOAD]', {
      source: 'initial',
      ok: null,
      attempt_id: initialAttemptIdRef.current
    });

    void (async () => {
      const attemptId = initialAttemptIdRef.current;
      const first = await loadFull('initial');
      if (!isMountedRef.current || attemptId !== initialAttemptIdRef.current) return;
      if (first?.ok) return;

      if (initialRetryCountRef.current >= 1) return;
      initialRetryCountRef.current = 1;
      console.log('[CHAT_INITIAL_RETRY]', {
        reason: 'initial_failed_or_aborted',
        hasUser: Boolean(user?.id),
        isMounted: isMountedRef.current,
        attempt_id: attemptId
      });
      // Ensure in-flight flags are cleared before retry.
      isLoadingRef.current = false;
      loadAbortRef.current = null;
      await sleep(200);
      if (!isMountedRef.current || attemptId !== initialAttemptIdRef.current) return;
      await loadFull('initial_retry');
    })();

    return () => {
      isMountedRef.current = false;
      if (loadAbortRef.current) {
        console.log('[CHAT_LIST_ABORT_REQUESTED]', {
          reason: 'unmount_cleanup',
          last_load_source: lastLoadSourceRef.current,
          action: 'abort'
        });
        loadAbortRef.current.abort();
        // Ensure next mount can load again.
        loadAbortRef.current = null;
        isLoadingRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    // Visibility / BFCache restore: perform a guarded full reload only when we likely missed updates.
    const FULL_RESTORE_THROTTLE_MS = 5000;
    const RESTORE_IF_INACTIVE_MS = 20000;

    const requestFullReload = (source: string, reason: string) => {
      const now = Date.now();
      if (now - lastRestoreFullLoadAtRef.current < FULL_RESTORE_THROTTLE_MS) {
        console.log('[FULL_RELOAD_SKIPPED]', { source, reason: 'restore_throttle' });
        return;
      }
      if (isLoadingRef.current) {
        console.log('[FULL_RELOAD_SKIPPED]', { source, reason: 'already_loading' });
        return;
      }
      lastRestoreFullLoadAtRef.current = now;
      const msSinceActivity = Date.now() - lastRealtimeActivityAtRef.current;
      console.log('[CHAT_VISIBILITY_RESTORE]', {
        reason,
        ms_since_activity: msSinceActivity
      });
      void loadFull(source);
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
          console.log('[FULL_RELOAD_SKIPPED]', { source: 'bfcache_pageshow', reason: 'recently_active' });
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
      console.log('[FULL_RELOAD_SKIPPED]', { source: 'visibility_restore', reason: 'recently_active' });
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  useEffect(() => {
    console.log('[CHAT_WATCHDOG_EFFECT_MOUNT]');
    // Stabilization step: re-enable realtime subscribe reflection only.
    // Keep polling/watchdog/delta disabled.
    const ENABLE_REALTIME = true;
    const ENABLE_POLLING_WATCHDOG_DELTA = true;
    const ENABLE_FULL_SYNC_ON_SUBSCRIBED = false;

    console.log('[CHAT_WATCHDOG_EFFECT_STATE]', {
      hasSupabase: !!supabase,
      enabled: ENABLE_POLLING_WATCHDOG_DELTA
    });

    if (!ENABLE_POLLING_WATCHDOG_DELTA) {
      console.log('[CHAT_AUTO_REFRESH_DISABLED]', { feature: 'polling_watchdog_delta' });
    }
    if (ENABLE_POLLING_WATCHDOG_DELTA) {
      console.log('[CHAT_WATCHDOG_ARMED]', { enabled: true });
    }
    const POLLING_LEADER_KEY = 'autoflow_polling_leader';
    const LEADER_TTL_MS = 45000;

    const isPollingLeader = (): boolean => {
      const now = Date.now();
      let leader: { id?: string; ts?: number } | null = null;
      try {
        const raw = localStorage.getItem(POLLING_LEADER_KEY);
        leader = raw ? JSON.parse(raw) : null;
      } catch {
        leader = null;
      }
      const leaderId = String(leader?.id || '');
      const leaderTs = Number(leader?.ts || 0);
      const expired = !leaderId || !Number.isFinite(leaderTs) || now - leaderTs > LEADER_TTL_MS;
      const mine = leaderId === tabIdRef.current;
      if (expired || mine) {
        localStorage.setItem(
          POLLING_LEADER_KEY,
          JSON.stringify({ id: tabIdRef.current, ts: now })
        );
        return true;
      }
      return false;
    };

    const TICK_MS = 10000;
    /** INSERT push 미수신 시 빠른 안전망 */
    const REALTIME_SILENCE_MS_NO_PUSH = 15000;
    /** push 1회 이상 확인된 뒤에는 무음 구간을 길게(불필요 delta 감소) */
    const REALTIME_SILENCE_MS_AFTER_PUSH = 90000;
    const DISCONNECTED_POLL_MIN_MS = 30000;

    const tick = () => {
      console.log('[CHAT_WATCHDOG_INTERVAL_ENTER]');
      if (!ENABLE_POLLING_WATCHDOG_DELTA) {
        console.log('[CHAT_WATCHDOG_SKIP]', { reason: 'disabled' });
        return;
      }
      if (!isMountedRef.current) {
        console.log('[CHAT_WATCHDOG_SKIP]', { reason: 'not_mounted' });
        return;
      }
      if (document.hidden) {
        console.log('[CHAT_WATCHDOG_SKIP]', { reason: 'hidden_tab' });
        return;
      }
      const connected = realtimeConnectedRef.current;
      const pushEver = lastRealtimeInsertPushAtRef.current != null;
      const silenceLimitMs = pushEver ? REALTIME_SILENCE_MS_AFTER_PUSH : REALTIME_SILENCE_MS_NO_PUSH;
      const stale =
        connected && Date.now() - lastRealtimeActivityAtRef.current > silenceLimitMs;

      if (!connected) {
        console.log('[CHAT_WATCHDOG_SKIP]', { reason: 'not_connected' });
        return;
      }
      if (!stale) {
        console.log('[CHAT_WATCHDOG_SKIP]', {
          reason: 'not_stale',
          silence_limit_ms: silenceLimitMs,
          push_ever: pushEver,
          ms_since_activity: Date.now() - lastRealtimeActivityAtRef.current
        });
        return;
      }

      // Watchdog only: when realtime appears stale, do a full refresh.
      // (Keep general delta fetch / visibility restore disabled in this step.)
      const since = safeSinceRef.current;
      console.log('[CHAT_WATCHDOG_TICK]', { reason: 'realtime_stale', since: since || null });
      void (async () => {
        const result = await loadFull('realtime_quiet_watchdog_full');
        console.log('[CHAT_WATCHDOG_RESULT]', { ok: Boolean(result?.ok), count: result?.count ?? 0 });
      })();
    };

    if (ENABLE_POLLING_WATCHDOG_DELTA && !pollIntervalRef.current) {
      console.log('[CHAT_WATCHDOG_ARMING_NOW]');
      pollIntervalRef.current = window.setInterval(tick, TICK_MS);
      pollingStartedRef.current = true;
      console.log('[POLLING_TICK_STARTED]', {
        interval_ms: TICK_MS,
        realtime_silence_ms_no_push: REALTIME_SILENCE_MS_NO_PUSH,
        realtime_silence_ms_after_push: REALTIME_SILENCE_MS_AFTER_PUSH
      });
    }

    const PG_INSERT_FILTER = { event: 'INSERT' as const, schema: 'public', table: 'chat_messages' };
    const PG_UPDATE_FILTER = { event: 'UPDATE' as const, schema: 'public', table: 'chat_messages' };

    if (ENABLE_REALTIME) {
      console.log('[CHAT_REALTIME_SUBSCRIBE_START]', {
        channel: 'chat_messages_realtime',
        postgres_changes: [PG_INSERT_FILTER, PG_UPDATE_FILTER]
      });
    }

    const channel = ENABLE_REALTIME
      ? supabase
          .channel('chat_messages_realtime')
          .on('postgres_changes', PG_INSERT_FILTER, (payload) => {
            const row = payload?.new as ChatMessage | undefined;
            if (!row?.id) return;
            lastRealtimeActivityAtRef.current = Date.now();
            lastRealtimeInsertPushAtRef.current = Date.now();
            console.log('[CHAT_REALTIME_EVENT]', { type: 'INSERT', messageId: row.id });
            upsertMessageRow(row);
          })
          .on('postgres_changes', PG_UPDATE_FILTER, (payload) => {
            const row = payload?.new as ChatMessage | undefined;
            if (!row?.id) return;
            lastRealtimeActivityAtRef.current = Date.now();
            console.log('[CHAT_REALTIME_EVENT]', { type: 'UPDATE', messageId: row.id });
            upsertMessageRow(row);
          })
          .subscribe((status) => {
            realtimeConnectedRef.current = status === 'SUBSCRIBED';
            console.log('[CHAT_REALTIME_STATUS]', { status, connected: realtimeConnectedRef.current });
            if (realtimeConnectedRef.current) {
              lastRealtimeActivityAtRef.current = Date.now();
              if (ENABLE_FULL_SYNC_ON_SUBSCRIBED) {
                void loadFull('realtime_subscribed');
              }
            }
          })
      : null;

    return () => {
      try {
        const raw = localStorage.getItem(POLLING_LEADER_KEY);
        const leader = raw ? JSON.parse(raw) : null;
        if (String(leader?.id || '') === tabIdRef.current) {
          localStorage.removeItem(POLLING_LEADER_KEY);
        }
      } catch {}
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollingStartedRef.current = false;
      console.log('[POLLING_STOP]', { reason: 'effect_cleanup' });
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  const canSend = useMemo(() => Boolean(text.trim() || photo), [text, photo]);

  async function sendMessage() {
    console.log('[SEND_SUBMIT_START]', { hasUser: Boolean(user), canSend, submitting });
    if (submitting) {
      console.log('[SEND_SUBMIT_BLOCKED_ALREADY_SUBMITTING]');
      return;
    }
    if (!user || !canSend) return;
    setSubmitting(true);
    const optimisticId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      user_id: user.id,
      message: text.trim(),
      message_type: photo ? 'image' : 'text',
      sender_side: getDeviceSide(),
      room_no: roomNo || null,
      image_url: photo ? preview || null : null,
      image_storage_path: null,
      original_lang: '',
      translated_text: null,
      ticket_id: null,
      duplicate_ticket_id: null,
      ai_action: null,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    try {
      const clientRequestId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
      const deviceId = getOrCreateDeviceId();
      const fd = new FormData();
      fd.append('user_id', user.id);
      fd.append('message', text.trim());
      fd.append('client_request_id', clientRequestId);
      fd.append('client_device_id', deviceId);
      fd.append('sender_side', getDeviceSide());
      if (roomNo) fd.append('room_no', roomNo);
      if (photo) {
        console.log('[CHAT_FILE_APPEND]', {
          name: photo.name,
          size: photo.size,
          type: photo.type
        });
        fd.append('image', photo);
      }

      const res = await fetch(CHAT_SEND_URL, {
        method: 'POST',
        body: fd
      });

const data = await res.json();

if (!res.ok) {
  console.error('[CHAT_SEND_CLIENT_ERROR]', data);
  alert(data?.error || '채팅 전송 실패');
  return;
}

if (!data?.message) {
  alert('채팅 응답이 비정상입니다.');
  return;
}

console.log('[SEND_RESPONSE_OK]', { message_id: data?.message?.id || null, ai_action: data?.message?.ai_action || null, ticket_id: data?.message?.ticket_id || null });
setMessages((prev) => prev.map((m) => (m.id === optimisticId ? ({ ...m, ...data.message } as ChatMessage) : m)));
clearInput();
// TEMP (root-cause isolation): after send success, do a full reload once.
await loadFull('send_success_full_reload');
    } catch (error: any) {
      console.error('[CHAT_SEND_CLIENT_ERROR]', {
        error: error?.message || String(error)
      });
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      alert('채팅 전송 실패');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMaintenance() {
    if (!user || !roomNo || submitting) return;
    setSubmitting(true);
    try {
      const desc = text.trim() || `${issueType} 문제 발생`;

      const fd = new FormData();
      fd.append('room_no', roomNo);
      fd.append('issue_type', issueType);
      fd.append('description', desc);
      fd.append('created_by', user.id);
      if (photo) fd.append('image', photo);

      const res = await fetch('/api/maintenance/create', {
        method: 'POST',
        body: fd
      });
const data = await res.json();

if (!res.ok) {
  console.error('[MAINTENANCE_CREATE_CLIENT_ERROR]', data);
  alert(data?.error || '유지보수 등록 실패');
  return;
}

if (data?.chat_message) await load('maintenance_success');

setShowMaintenance(false);
resetComposer();
    } finally {
      setSubmitting(false);
    }
  }

  async function createManualTicket(msg: ChatMessage) {
    if (!user || !msg?.id) return;
    const roomInput = window.prompt('객실번호를 입력하세요 (예: 607)', msg.room_no || '');
    if (!roomInput) return;
    const roomNo = roomInput.replace(/[^\d]/g, '').slice(0, 4);
    if (!roomNo) return;
    const issueInput = window.prompt('이슈 유형 입력 (설비/청소/전기/가전/침구/기타)', '설비') || '설비';
    const issueType = (ISSUE_TYPES.includes(issueInput as IssueType) ? issueInput : '설비') as IssueType;

    const fd = new FormData();
    fd.append('room_no', roomNo);
    fd.append('issue_type', issueType);
    fd.append('description', msg.message || `${roomNo}호 수동 티켓 생성`);
    fd.append('created_by', user.id);
    const created = await fetch('/api/maintenance/create', { method: 'POST', body: fd });
    const createdData = await created.json();
    if (!created.ok || !createdData?.ticket?.id) {
      console.error('[MANUAL_TICKET_CREATE_CLIENT_ERROR]', createdData);
      alert(createdData?.error || '수동 티켓 생성 실패');
      return;
    }

    const linkRes = await fetch(CHAT_MANUAL_TICKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: msg.id,
        ticket_id: createdData.ticket.id,
        room_no: roomNo
      })
    });
    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}));
      console.error('[MANUAL_TICKET_LINK_CLIENT_ERROR]', err);
      alert(err?.error || '메시지-티켓 연결 실패');
      return;
    }
    const linked = await linkRes.json();
    console.log('[SET_MESSAGES_COUNT]', {
      source: 'manual_ticket_link',
      message_id: msg.id
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, ticket_id: createdData.ticket.id, room_no: roomNo, ai_action: linked?.message?.ai_action || 'ticket_created_manual' } : m))
    );
  }

  function clearInput() {
    setText('');
    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {}
    setPhoto(null);
    setPreview(null);
  }

  function resetComposer() {
    setText('');
    setPhoto(null);
    setPreview(null);
    setRoomNo('');
    setKeypadNum('');
    setShowMaintenance(false);
  }

  const logDeleteClientDebug = (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  };

  async function handleDeleteMessage(msg: ChatMessage) {
    if (!user?.id || !msg?.id) return;
    if (msg.is_deleted) return;
    if (deletingMessageId) return;
    setDeletingMessageId(String(msg.id));
    try {
      const res = await fetch(CHAT_DELETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: msg.id, user_id: user.id })
      });
      const data = await res.json().catch(() => ({}));
      // [DEBUG] 추후 제거 가능
      logDeleteClientDebug('[CHAT_DELETE_CLIENT]', 'API 응답 전체', data);
      logDeleteClientDebug('[CHAT_DELETE_CLIENT]', 'message.is_deleted', data?.message?.is_deleted ?? null);
      if (!res.ok) {
        const errPayload = data as { error?: string } | undefined;
        const serverMsg = typeof errPayload?.error === 'string' ? errPayload.error : '';
        alert(serverMsg || `메시지 삭제에 실패했습니다. (${res.status})`);
        return;
      }
      const updated = data?.message as ChatMessage | undefined;
      if (updated?.id) {
        setMessages((prev) => prev.map((m) => (String(m.id) === String(updated.id) ? { ...m, ...updated } : m)));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            String(m.id) === String(msg.id)
              ? { ...m, is_deleted: true, deleted_at: new Date().toISOString() }
              : m
          )
        );
      }
    } catch (e: any) {
      console.error('[CHAT_DELETE_CLIENT_ERROR]', e);
      alert(e?.message ? `메시지 삭제에 실패했습니다.\n${e.message}` : '메시지 삭제에 실패했습니다.');
    } finally {
      setDeletingMessageId(null);
    }
  }

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold">AutoFlow 채팅</div>
            <div className="text-xs text-green-600">직원 협업 + 유지보수 등록</div>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('autoflow_user');
              console.log('[LOGIN_REDIRECT]', { from: '/chat', to: '/', reason: 'manual_logout' });
              router.push('/');
            }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600"
          >
            로그아웃
          </button>
        </div>
      </header>

      <RoomParticipantsPanel roomId={process.env.NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID || ''} />

      <section className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        <ChatMessages
          messages={messages}
          currentUserId={user?.id || null}
          deletingMessageId={deletingMessageId}
          onDeleteMessage={handleDeleteMessage}
          onCreateManualTicket={createManualTicket}
        />
      </section>

      {showMaintenance && (
        <div className="border-t border-gray-200 bg-white px-3 pt-3 pb-2">
          <div className="mb-2 text-xs font-bold text-gray-500">문제 유형</div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {ISSUE_TYPES.map((type) => (
              <button key={type} onClick={() => setIssueType(type)} className={`rounded-xl p-2 text-xs font-bold ${issueType === type ? ISSUE_UI[type].badge + ' ring-2 ring-blue-300' : 'bg-gray-100 text-gray-700'}`}>
                <div>{ISSUE_UI[type].emoji}</div>
                <div>{type}</div>
              </button>
            ))}
          </div>
          <button onClick={submitMaintenance} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">유지보수 등록</button>
        </div>
      )}

      <div className="bg-white border-t border-gray-200 px-3 py-3 shrink-0">
        <div className="mb-2 flex items-center gap-2">
          <button onClick={() => setKeypadOpen(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${roomNo ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-500 border border-dashed border-gray-300'}`}>
            {roomNo ? `🏠 ${roomNo}호` : '🏠 객실 선택'}
          </button>
          {roomNo && <button onClick={() => setRoomNo('')} className="text-xs text-gray-400">초기화</button>}
          {photo && <span className="text-xs rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">사진 선택됨</span>}
          {!showMaintenance && (roomNo || photo) && <button onClick={() => setShowMaintenance(true)} className="ml-auto rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">🔧 유지보수</button>}
        </div>
        {preview && <img src={preview} alt="preview" className="mb-2 h-20 w-20 rounded-xl object-cover" />}
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="h-11 w-11 shrink-0 rounded-full bg-gray-100 text-xl">
            📷
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            enterKeyHint="send"
            placeholder="메시지를 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
            rows={1}
            className="input min-h-[44px] max-h-24 flex-1 resize-none"
          />
          <button
            type="button"
            disabled={!canSend || submitting}
            onClick={() => clearInput()}
            className="h-11 shrink-0 rounded-lg border border-gray-200 px-2 text-xs text-gray-600 disabled:opacity-40 disabled:pointer-events-none"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSend || submitting}
            onClick={() => {
              console.log('[SEND_CLICK]', { canSend, submitting });
              void sendMessage();
            }}
            className="h-11 w-11 shrink-0 rounded-full bg-blue-600 text-white disabled:opacity-40"
          >
            ➤
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhoto(file);
            setPreview(URL.createObjectURL(file));
          }} />
        </div>
      </div>

      {keypadOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-end">
          <div className="w-full rounded-t-3xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="mb-3 text-sm font-bold">객실 번호 입력</div>
            <div className="mb-3 rounded-2xl bg-gray-100 px-4 py-3 text-3xl font-extrabold text-blue-700">{keypadNum || '-'}</div>
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map((n) => <button key={n} onClick={() => setKeypadNum((p) => (p + n).slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">{n}</button>)}
              <button onClick={() => setKeypadOpen(false)} className="h-14 rounded-2xl text-sm font-semibold text-gray-500">닫기</button>
              <button onClick={() => setKeypadNum((p) => (p + '0').slice(0, 4))} className="h-14 rounded-2xl bg-gray-100 text-2xl font-semibold">0</button>
              <button onClick={() => setKeypadNum((p) => p.slice(0, -1))} className="h-14 rounded-2xl text-xl">⌫</button>
            </div>
            <button onClick={() => { setRoomNo(keypadNum); setKeypadOpen(false); }} className="mt-3 w-full rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white">확인</button>
          </div>
        </div>
      )}

      <div className="px-3 pb-1 text-right text-[10px] text-gray-400">build: {buildTag}</div>
      <Navigation active="chat" />
    </main>
  );
}
