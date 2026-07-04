import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_CHAT_LIST } from '@/lib/api/timeouts';
import { CHAT_LIST_URL } from '@/lib/chatApi';
import type { ChatMessage } from '@/lib/types';
import { logChatRefetchReason, logChatRefetchResult } from '@/lib/chat/chatRefetchLog';
import {
  latestMessageMeta,
  logChatClientFetchResult,
  logChatClientFetchStart,
  newRequestId,
  parseRefetchReason,
  countVisibleMessages,
  type SyncClient
} from '@/lib/chat/syncTrace';
import { log } from '@/lib/logger';
import { chatTrace, chatTraceContext, callerFromStack } from '@/lib/chat/chatTrace';
import { mergeChatMessageRow, normalizeChatMessageFields, normalizeTranslatedText } from '@/lib/chat/normalizeChatMessage';
import {
  installStaffWebNetworkTrace,
  logStaffWebNetworkTrace,
  recordFetchSuccess
} from '@/lib/chat/networkTrace';

export type ChatLoadFullResult = { ok: boolean; count: number; maxCreatedAt: string | null };

export type ChatLoadFullFn = (source: string, opts?: { limit?: number }) => Promise<ChatLoadFullResult>;

const DEBUG_VERBOSE = process.env.NEXT_PUBLIC_CHAT_DEBUG_VERBOSE === '1';

/** GET /api/chat/list 의 `data` 페이로드 */
export type ChatListData = { messages: ChatMessage[] };

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

/** Diagnostic-only: translation presence flags for [CHAT_MEMORY_ROW]/[CHAT_FULLLOAD_ROW]. */
function translationFlags(m: Partial<ChatMessage> | undefined): { has_ru: boolean; has_ko: boolean } {
  const tt = normalizeTranslatedText(m?.translated_text);
  return {
    has_ru: Boolean(tt?.ru && String(tt.ru).trim()),
    has_ko: Boolean(tt?.ko && String(tt.ko).trim())
  };
}

function applyListMerge(
  prev: ChatMessage[],
  nextMessages: ChatMessage[],
  staffTimelineMode: boolean,
  isFullLoad: boolean
): { merged: ChatMessage[]; added_count: number; removed_count: number } {
  if (staffTimelineMode && isFullLoad) {
    const merged = sortMessagesAsc(
      nextMessages.filter((m) => m?.id).map((m) => normalizeChatMessageFields(m))
    );
    const prevIds = new Set(prev.map((m) => String(m.id)));
    const mergedIds = new Set(merged.map((m) => String(m.id)));
    return {
      merged,
      added_count: merged.filter((m) => !prevIds.has(String(m.id))).length,
      removed_count: prev.filter((m) => !mergedIds.has(String(m.id))).length
    };
  }

  const byId = new Map<string, ChatMessage>();
  const prevIds = new Set<string>();
  const isTmpId = (id: string) => id.startsWith('tmp-') || id.startsWith('tmp_');
  prev.forEach((m) => {
    if (!m?.id) return;
    const id = String(m.id);
    // On a full load the DB snapshot is authoritative for saved messages. Drop the
    // optimistic `tmp-` placeholder here so it can never coexist with its saved real
    // row (duplicate bubble). The real row is (re)added by id via reconcile/realtime;
    // an in-flight tmp not yet in the DB is re-added by the send reconcile.
    if (isFullLoad && isTmpId(id)) return;
    byId.set(id, m);
    prevIds.add(id);
  });
  let added_count = 0;
  nextMessages.forEach((m) => {
    if (!m?.id) return;
    const mid = String(m.id);
    const prevRow = byId.get(mid);
    const normalized = normalizeChatMessageFields(m);
    byId.set(mid, prevRow ? mergeChatMessageRow(prevRow, normalized) : normalized);
    if (!prevIds.has(mid)) added_count += 1;
  });
  const merged = sortMessagesAsc(Array.from(byId.values()));
  const mergedIds = new Set(merged.map((m) => String(m.id)));
  const removed_count = prev.filter((m) => m?.id && !mergedIds.has(String(m.id))).length;
  return { merged, added_count, removed_count };
}

export type UseChatLoaderOptions = {
  /** 페이지/워치독과 공유: in-flight 로딩 여부 (시퀀스 기준으로만 해제) */
  loadingRef?: MutableRefObject<boolean>;
  /** Override default list fetch timeout (ms). Staff-chat uses shorter value. */
  listTimeoutMs?: number;
  /** Full-table list limit (default 50). Staff-chat uses higher value for shared timeline. */
  initialListLimit?: number;
  /** Delta (since) list limit (default 40). */
  deltaListLimit?: number;
  /** Staff-chat: log [STAFF_CHAT_API_MESSAGES] / [STAFF_CHAT_SET_MESSAGES] and replace list on full load. */
  staffTimelineMode?: boolean;
  syncClient?: SyncClient;
  messagesRef?: MutableRefObject<ChatMessage[]>;
  roomFilterRef?: MutableRefObject<string | null>;
  userFilterRef?: MutableRefObject<string | null>;
};

export function useChatLoader(options?: UseChatLoaderOptions) {
  const internalLoadingRef = useRef(false);
  const loadingRef = options?.loadingRef ?? internalLoadingRef;
  const listTimeoutMs = options?.listTimeoutMs ?? TIMEOUT_MS_CHAT_LIST;
  const initialListLimit = options?.initialListLimit ?? 50;
  const deltaListLimit = options?.deltaListLimit ?? 40;
  const staffTimelineMode = options?.staffTimelineMode ?? false;
  const syncClient = options?.syncClient ?? 'pc';
  const messagesRef = options?.messagesRef;
  const roomFilterRef = options?.roomFilterRef;
  const userFilterRef = options?.userFilterRef;

  const isMountedRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadSeqRef = useRef(0);
  const lastLoadSourceRef = useRef<string | null>(null);

  const initialRetryCountRef = useRef(0);
  const initialAttemptIdRef = useRef(0);
  /** 첫 initial/initial_retry 성공 1회만 알림 시드용 */
  const initialHydrationDoneRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initialHydrationComplete, setInitialHydrationComplete] = useState(false);
  const [initialLoadStatus, setInitialLoadStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(
    async (
      source: string = 'manual',
      opts?: { since?: string; mode?: 'full' | 'delta'; limit?: number }
    ): Promise<ChatLoadFullResult> => {
      if (!isMountedRef.current) return { ok: false, count: 0, maxCreatedAt: null };

      const mySeq = ++loadSeqRef.current;
      if (loadAbortRef.current) {
        loadAbortRef.current.abort();
        loadAbortRef.current = null;
      }

      const controller = new AbortController();
      loadAbortRef.current = controller;
      loadingRef.current = true;
      lastLoadSourceRef.current = source;

      const listLimit = opts?.limit ?? (opts?.since ? deltaListLimit : initialListLimit);
      const requestId = newRequestId();
      const fetchReason = parseRefetchReason(source);
      const beforeRows = messagesRef?.current ?? [];
      const beforeMeta = latestMessageMeta(beforeRows);
      const fetchStarted = performance.now();

      logChatClientFetchStart({
        client: syncClient,
        reason: fetchReason,
        request_id: requestId,
        before_count: beforeRows.length,
        latest_before_id: beforeMeta.id,
        selected_room_filter: roomFilterRef?.current ?? null,
        user_filter: userFilterRef?.current ?? 'none',
        limit: listLimit,
        endpoint: CHAT_LIST_URL
      });

      chatTrace('loadfull_start', {
        id: null,
        source,
        room: roomFilterRef?.current ?? null,
        messages: beforeRows.length,
        extra: {
          caller: callerFromStack(),
          reason: fetchReason,
          mode: opts?.mode ?? (opts?.since ? 'delta' : 'full'),
          initial_hydration_done: initialHydrationDoneRef.current,
          visibility: typeof document !== 'undefined' ? document.visibilityState : null,
          reconnect_token: chatTraceContext.reconnectToken,
          ts_ms: Date.now(),
          since: opts?.since ?? null,
          limit: listLimit,
          seq: mySeq
        }
      });

      if (source === 'initial' || source === 'initial_retry') {
        log.debug('[CHAT_LOAD_START]', {
          source,
          since: opts?.since ?? null,
          limit: listLimit,
          seq: mySeq
        });
      }

      try {
        if (staffTimelineMode) installStaffWebNetworkTrace();
        const params = new URLSearchParams();
        params.set('limit', String(listLimit));
        if (opts?.since) params.set('since', opts.since);
        const listUrl = `${CHAT_LIST_URL}?${params.toString()}`;
        const result = await fetchEnvelope<ChatListData>(listUrl, {
          cache: 'no-store',
          signal: controller.signal,
          timeoutMs: listTimeoutMs,
          headers: {
            'X-Chat-Client': syncClient,
            'X-Chat-Request-Id': requestId
          }
        });

        if (!result.ok) {
          throw new Error(result.message || `CHAT_LIST_HTTP_${result.status}`);
        }

        // Diagnostic-only: mark a successful list fetch (network reachable) for
        // [STAFF_WEB_NETWORK_TRACE] "ms_since_last_success".
        if (staffTimelineMode) recordFetchSuccess();

        const nextMessages = Array.isArray(result.data.messages) ? result.data.messages : null;

        if (staffTimelineMode && nextMessages) {
          const mobile = nextMessages.filter((m) => m.sender_side === 'mobile').length;
          const pc = nextMessages.filter((m) => m.sender_side === 'pc').length;
          console.log('[STAFF_CHAT_API_MESSAGES]', {
            source,
            count: nextMessages.length,
            mobile_count: mobile,
            pc_count: pc,
            limit: listLimit,
            since: opts?.since ?? null,
            user_filter: 'none'
          });
        }

        if (DEBUG_VERBOSE && nextMessages) {
          const last5 = nextMessages.slice(-5).map((m: any) => ({
            id: m?.id ?? null,
            created_at: m?.created_at ?? null,
            text: String(m?.message ?? '').slice(0, 40)
          }));
          log.debug('[CHAT_LOADER_INCOMING_LAST5]', {
            source,
            incoming_count: nextMessages.length,
            last5
          });
        }

        if (source === 'initial' || source === 'initial_retry') {
          log.debug('[CHAT_SET_MESSAGES_COUNT]', nextMessages?.length ?? 0);
        }

        const stillCurrent = mySeq === loadSeqRef.current && !controller.signal.aborted && isMountedRef.current;
        let mergeStats = { added_count: 0, removed_count: 0, after_count: beforeRows.length };
        let afterMeta = beforeMeta;

        let mergedForTrace: ChatMessage[] = beforeRows;

        if (stillCurrent) {
          if (nextMessages) {
            const isFullLoad = !opts?.since;
            const { merged, added_count, removed_count } = applyListMerge(
              beforeRows,
              nextMessages,
              staffTimelineMode,
              isFullLoad
            );
            mergeStats = { added_count, removed_count, after_count: merged.length };
            afterMeta = latestMessageMeta(merged);
            mergedForTrace = merged;

            if (staffTimelineMode && isFullLoad) {
              const droppedNoId = nextMessages.length - merged.length;
              console.log('[STAFF_CHAT_SET_MESSAGES]', {
                source,
                mode: 'replace_full',
                count: merged.length,
                api_count: nextMessages.length,
                dropped_missing_id: droppedNoId,
                before_count: beforeRows.length,
                user_filter: 'none'
              });

              // DIAGNOSTIC (measurement-only — REPLACE behavior unchanged): prove whether the
              // staff full-load REPLACE drops in-memory translations. Compare per message_id:
              // memory(prev=beforeRows, realtime-merged) vs full-load(nextMessages=DB snapshot).
              const memById = new Map(
                beforeRows.filter((m) => m?.id).map((m) => [String(m.id), m] as const)
              );
              for (const m of beforeRows) {
                if (!m?.id) continue;
                const f = translationFlags(m);
                console.log(
                  '[CHAT_MEMORY_ROW]',
                  JSON.stringify({
                    source,
                    message_id: String(m.id),
                    has_ru: f.has_ru,
                    has_ko: f.has_ko,
                    original_lang: m.original_lang ?? null,
                    updated_at: (m as { updated_at?: string | null }).updated_at ?? null
                  })
                );
              }
              for (const m of nextMessages) {
                if (!m?.id) continue;
                const f = translationFlags(m);
                const prevRow = memById.get(String(m.id));
                const prevF = prevRow ? translationFlags(prevRow) : null;
                console.log(
                  '[CHAT_FULLLOAD_ROW]',
                  JSON.stringify({
                    source,
                    message_id: String(m.id),
                    has_ru: f.has_ru,
                    has_ko: f.has_ko,
                    original_lang: m.original_lang ?? null,
                    updated_at: (m as { updated_at?: string | null }).updated_at ?? null
                  })
                );
                if (prevF?.has_ru && !f.has_ru) {
                  console.log(
                    '[CHAT_TRANSLATION_REGRESSION_DETECTED]',
                    JSON.stringify({
                      source,
                      message_id: String(m.id),
                      has_ru: false,
                      has_ko: translationFlags(m).has_ko,
                      original_lang: m.original_lang ?? null,
                      updated_at: (m as { updated_at?: string | null }).updated_at ?? null,
                      memory_has_ru: true,
                      fullload_has_ru: false,
                      memory_updated_at: (prevRow as { updated_at?: string | null }).updated_at ?? null
                    })
                  );
                }
              }
            } else if (staffTimelineMode) {
              console.log('[STAFF_CHAT_SET_MESSAGES]', {
                source,
                mode: 'merge',
                count: merged.length,
                api_count: nextMessages.length,
                before_count: beforeRows.length,
                added_count,
                user_filter: 'none'
              });
            }

            chatTrace('set_messages', {
              id: afterMeta.id,
              source: `loader_${isFullLoad ? 'full' : 'delta'}`,
              room: roomFilterRef?.current ?? null,
              messages: merged.length,
              extra: {
                load_source: source,
                api_count: nextMessages.length,
                added_count,
                removed_count
              }
            });
            setMessages(merged);
            if (messagesRef) messagesRef.current = merged;
          } else {
            log.error('[CHAT_LIST_SHAPE_MISMATCH]', { source });
          }
        }

        const first3 = (nextMessages || []).slice(0, 3).map((m: any) => ({
          id: m?.id || null,
          message: m?.message || '',
          created_at: m?.created_at || null
        }));

        if (stillCurrent && nextMessages) {
          const { visible } = countVisibleMessages(mergedForTrace, {
            roomFilter: roomFilterRef?.current,
            userFilter: userFilterRef?.current ?? null
          });
          logChatClientFetchResult({
            client: syncClient,
            reason: fetchReason,
            request_id: requestId,
            before_count: beforeRows.length,
            after_count: mergeStats.after_count,
            latest_before_id: beforeMeta.id,
            latest_after_id: afterMeta.id,
            latest_after_created_at: afterMeta.created_at,
            added_count: mergeStats.added_count,
            removed_count: mergeStats.removed_count,
            duration_ms: Math.round(performance.now() - fetchStarted),
            visible_count: visible.length,
            selected_room_filter: roomFilterRef?.current ?? null,
            user_filter: userFilterRef?.current ?? 'none',
            ok: true
          });
        }

        if (source === 'initial' || source === 'initial_retry') {
          log.info('[CHAT_INITIAL_SUCCESS]', { source, count: nextMessages?.length || 0 });
        }

        if (
          stillCurrent &&
          nextMessages &&
          (source === 'initial' || source === 'initial_retry') &&
          !initialHydrationDoneRef.current
        ) {
          initialHydrationDoneRef.current = true;
          setInitialHydrationComplete(true);
          setInitialLoadStatus('ok');
        }

        chatTrace('loadfull_end', {
          id: afterMeta.id,
          source,
          room: roomFilterRef?.current ?? null,
          messages: mergeStats.after_count,
          extra: {
            reason: fetchReason,
            mode: opts?.mode ?? (opts?.since ? 'delta' : 'full'),
            initial_hydration_done: initialHydrationDoneRef.current,
            visibility: typeof document !== 'undefined' ? document.visibilityState : null,
            reconnect_token: chatTraceContext.reconnectToken,
            ts_ms: Date.now(),
            seq: mySeq,
            still_current: stillCurrent,
            ok: true,
            api_count: nextMessages?.length ?? 0,
            added_count: mergeStats.added_count,
            removed_count: mergeStats.removed_count
          }
        });
        return {
          ok: true,
          count: nextMessages?.length || 0,
          maxCreatedAt: nextMessages ? maxCreatedAt(nextMessages) : null
        };
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          if (source === 'initial' || source === 'initial_retry') {
            log.warn('[CHAT_LIST_LOAD_ABORT]', { source });
            log.debug('[CHAT_INITIAL_ABORT]', {
              source,
              reason: 'abort_signal',
              attempt_id: initialAttemptIdRef.current
            });
          }
          if (source !== 'initial' && source !== 'initial_retry') {
            log.warn('[CHAT_LIST_LOAD_ABORT]', { source });
          }
          return { ok: false, count: 0, maxCreatedAt: null };
        }

        log.error('[CHAT_LIST_LOAD_ERROR]', {
          source,
          error: error?.message || String(error)
        });

        // Diagnostic-only: capture device/WebView network state at the moment the
        // list fetch (Vercel /api/chat/list) failed — pairs with realtime/Supabase
        // failures to flag "device_network_unavailable_likely".
        if (staffTimelineMode) {
          logStaffWebNetworkTrace({ phase: `list_fetch_error:${source}`, target: CHAT_LIST_URL, error });
        }

        if (source === 'initial' || source === 'initial_retry') {
          log.debug('[CHAT_INITIAL_LOAD]', {
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
        if (loadSeqRef.current === mySeq) {
          loadingRef.current = false;
        }
      }
    },
    [loadingRef, listTimeoutMs, initialListLimit, deltaListLimit, staffTimelineMode, syncClient, messagesRef, roomFilterRef, userFilterRef]
  );

  const loadFull = useCallback<ChatLoadFullFn>(
    async (source, opts) => load(source, { mode: 'full', limit: opts?.limit }),
    [load]
  );

  useEffect(() => {
    isMountedRef.current = true;

    initialAttemptIdRef.current += 1;
    initialRetryCountRef.current = 0;
    log.debug('[CHAT_INITIAL_LOAD]', {
      source: 'initial',
      ok: null,
      attempt_id: initialAttemptIdRef.current
    });

    void (async () => {
      const attemptId = initialAttemptIdRef.current;
      const first = await loadFull('initial');
      if (!isMountedRef.current || attemptId !== initialAttemptIdRef.current) return;
      if (first?.ok) {
        logChatRefetchReason('mount');
        logChatRefetchResult('mount', {
          ok: true,
          count: first.count,
          latest_created_at: first.maxCreatedAt
        });
        setInitialLoadStatus('ok');
        return;
      }

      if (initialRetryCountRef.current >= 1) return;
      initialRetryCountRef.current = 1;
      log.info('[CHAT_INITIAL_RETRY]', {
        reason: 'initial_failed_or_aborted',
        hasUser: null,
        isMounted: isMountedRef.current,
        attempt_id: attemptId
      });
      if (loadAbortRef.current) {
        loadAbortRef.current.abort();
        loadAbortRef.current = null;
      }
      loadSeqRef.current += 1;
      loadingRef.current = false;
      await new Promise((r) => setTimeout(r, 200));
      if (!isMountedRef.current || attemptId !== initialAttemptIdRef.current) return;
      const second = await loadFull('initial_retry');
      if (!isMountedRef.current || attemptId !== initialAttemptIdRef.current) return;
      // Allow UI to proceed even when list failed (empty chat + error UI elsewhere).
      if (!initialHydrationDoneRef.current) {
        initialHydrationDoneRef.current = true;
        setInitialHydrationComplete(true);
        setInitialLoadStatus(second?.ok ? 'ok' : 'error');
      }
    })();

    return () => {
      isMountedRef.current = false;
      loadSeqRef.current += 1;
      if (loadAbortRef.current) {
        log.warn('[CHAT_LIST_LOAD_ABORT]', { source: lastLoadSourceRef.current || 'unknown' });
        log.debug('[CHAT_LIST_ABORT_REQUESTED]', {
          reason: 'unmount_cleanup',
          last_load_source: lastLoadSourceRef.current,
          action: 'abort'
        });
        loadAbortRef.current.abort();
        loadAbortRef.current = null;
        loadingRef.current = false;
      }
    };
  }, [loadFull, loadingRef]);

  return {
    messages,
    loadFull,
    setMessages,
    initialHydrationComplete,
    initialLoadStatus
  };
}
