import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_CHAT_LIST } from '@/lib/api/timeouts';
import { CHAT_LIST_URL } from '@/lib/chatApi';
import type { ChatMessage } from '@/lib/types';
import { log } from '@/lib/logger';
import { mergeChatMessageRow, normalizeChatMessageFields } from '@/lib/chat/normalizeChatMessage';

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
  /**
   * Phase 1.2: 선택된 채팅방 UUID(chat_room_id). 지정 시 GET /api/chat/list?chat_room_id=<id>로
   * 서버 필터. 값이 바뀌면(방 전환) 이전 방 메시지를 비우고 새로 로드한다.
   * - `undefined`: 기능 미사용(기존 전역 타임라인 동작 유지, flag OFF 경로).
   * - `null`: flag ON이지만 아직 방 미선택 → 필터 없이 로드(기존 동작).
   * 개념 분리: room_no(객실번호)와 절대 혼용 금지.
   */
  chatRoomId?: string | null;
};

export function useChatLoader(options?: UseChatLoaderOptions) {
  const internalLoadingRef = useRef(false);
  const loadingRef = options?.loadingRef ?? internalLoadingRef;
  const listTimeoutMs = options?.listTimeoutMs ?? TIMEOUT_MS_CHAT_LIST;
  const initialListLimit = options?.initialListLimit ?? 50;
  const deltaListLimit = options?.deltaListLimit ?? 40;
  const staffTimelineMode = options?.staffTimelineMode ?? false;

  const isMountedRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadSeqRef = useRef(0);
  const lastLoadSourceRef = useRef<string | null>(null);

  // Phase 1.2: chatRoomId를 ref로 읽어 load/loadFull 아이덴티티를 안정적으로 유지한다.
  // (deps에 넣으면 loadFull이 매 선택마다 바뀌어 initial-load effect가 재발화되므로 금지)
  const chatRoomIdRef = useRef<string | null | undefined>(options?.chatRoomId);
  chatRoomIdRef.current = options?.chatRoomId;
  const chatRoomId = options?.chatRoomId;

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
      opts?: { since?: string; mode?: 'full' | 'delta' }
    ): Promise<{ ok: boolean; count: number; maxCreatedAt: string | null }> => {
      if (!isMountedRef.current) return { ok: false, count: 0, maxCreatedAt: null };

      // Phase 4 guard: while the initial full-load is in flight and hydration has
      // not completed, skip non-initial (watchdog hidden-poll / delta) loads so
      // they cannot abort the initial load. Otherwise the initial CHAT_LIST_LOAD
      // gets aborted (CHAT_LIST_LOAD_ABORT) and the timeline stays empty after
      // app re-entry. Watchdog loads are full loads, so they still backfill once
      // hydration is done.
      const isInitialLoad = source === 'initial' || source === 'initial_retry';
      if (!isInitialLoad && loadingRef.current && !initialHydrationDoneRef.current) {
        return { ok: false, count: 0, maxCreatedAt: null };
      }

      const mySeq = ++loadSeqRef.current;
      if (loadAbortRef.current) {
        loadAbortRef.current.abort();
        loadAbortRef.current = null;
      }

      const controller = new AbortController();
      loadAbortRef.current = controller;
      loadingRef.current = true;
      lastLoadSourceRef.current = source;

      if (source === 'initial' || source === 'initial_retry') {
        log.debug('[CHAT_LOAD_START]', {
          source,
          since: opts?.since ?? null,
          limit: opts?.since ? deltaListLimit : initialListLimit,
          seq: mySeq
        });
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', String(opts?.since ? deltaListLimit : initialListLimit));
        if (opts?.since) params.set('since', opts.since);
        // Phase 1.2: 선택된 방이 있으면 서버에서 chat_room_id로 필터(클라 room_no 필터 금지).
        const activeChatRoomId = chatRoomIdRef.current;
        if (activeChatRoomId) params.set('chat_room_id', activeChatRoomId);
        const listUrl = `${CHAT_LIST_URL}?${params.toString()}`;
        const result = await fetchEnvelope<ChatListData>(listUrl, {
          cache: 'no-store',
          signal: controller.signal,
          timeoutMs: listTimeoutMs
        });

        if (!result.ok) {
          throw new Error(result.message || `CHAT_LIST_HTTP_${result.status}`);
        }

        const nextMessages = Array.isArray(result.data.messages) ? result.data.messages : null;

        if (staffTimelineMode && nextMessages) {
          const mobile = nextMessages.filter((m) => m.sender_side === 'mobile').length;
          const pc = nextMessages.filter((m) => m.sender_side === 'pc').length;
          console.log('[STAFF_CHAT_API_MESSAGES]', {
            source,
            count: nextMessages.length,
            mobile_count: mobile,
            pc_count: pc,
            limit: opts?.since ? deltaListLimit : initialListLimit,
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
        if (stillCurrent) {
          if (nextMessages) {
            const isFullLoad = !opts?.since;
            setMessages((prev) => {
              if (staffTimelineMode && isFullLoad) {
                const replaced = sortMessagesAsc(
                  nextMessages
                    .filter((m) => m?.id)
                    .map((m) => normalizeChatMessageFields(m))
                );
                const droppedNoId = nextMessages.length - replaced.length;
                console.log('[STAFF_CHAT_SET_MESSAGES]', {
                  source,
                  mode: 'replace_full',
                  count: replaced.length,
                  api_count: nextMessages.length,
                  dropped_missing_id: droppedNoId,
                  before_count: prev.length,
                  user_filter: 'none'
                });
                return replaced;
              }

              const byId = new Map<string, ChatMessage>();
              const prevIds = new Set<string>();
              prev.forEach((m) => {
                if (!m?.id) return;
                byId.set(String(m.id), m);
                prevIds.add(String(m.id));
              });
              const added: ChatMessage[] = [];
              let skippedExisting = 0;
              nextMessages.forEach((m) => {
                if (!m?.id) return;
                const mid = String(m.id);
                const prevRow = byId.get(mid);
                const normalized = normalizeChatMessageFields(m);
                byId.set(mid, prevRow ? mergeChatMessageRow(prevRow, normalized) : normalized);
                if (!prevIds.has(mid)) {
                  added.push(normalized);
                } else {
                  skippedExisting += 1;
                }
              });
              const merged = sortMessagesAsc(Array.from(byId.values()));
              if (staffTimelineMode) {
                console.log('[STAFF_CHAT_SET_MESSAGES]', {
                  source,
                  mode: 'merge',
                  count: merged.length,
                  api_count: nextMessages.length,
                  before_count: prev.length,
                  added_count: added.length,
                  user_filter: 'none'
                });
              }
              log.debug('[SET_MESSAGES_MERGED_LAST_IDS]', {
                source,
                before_count: prev.length,
                incoming_count: nextMessages.length,
                merged_count: merged.length,
                merged_last5_ids: merged.slice(-5).map((m) => m?.id).filter(Boolean)
              });
              if (DEBUG_VERBOSE) {
                log.info('[CHAT_LOADER_MERGE_DIFF]', {
                  source,
                  before_count: prev.length,
                  incoming_count: nextMessages.length,
                  merged_count: merged.length,
                  added_count: added.length,
                  skipped_existing_count: skippedExisting,
                  added_last5: added.slice(-5).map((m: any) => ({
                    id: m?.id ?? null,
                    created_at: m?.created_at ?? null,
                    text: String(m?.message ?? '').slice(0, 40)
                  }))
                });
              }
              return merged;
            });
          } else {
            log.error('[CHAT_LIST_SHAPE_MISMATCH]', { source });
          }
        }

        const first3 = (nextMessages || []).slice(0, 3).map((m: any) => ({
          id: m?.id || null,
          message: m?.message || '',
          created_at: m?.created_at || null
        }));

        if (source === 'initial' || source === 'initial_retry') {
          log.debug('[CHAT_LIST_RESPONSE]', {
            source,
            count: nextMessages?.length || 0,
            first3
          });
          log.debug('[CHAT_LIST_LOAD_OK]', {
            source,
            count: nextMessages?.length || 0
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
    [loadingRef, listTimeoutMs, initialListLimit, deltaListLimit, staffTimelineMode]
  );

  const loadFull = useCallback(async (source: string) => load(source, { mode: 'full' }), [load]);

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

  // Phase 1.2: 방 전환 재조회.
  // - chatRoomId === undefined(기능 미사용/flag OFF): 아무 것도 하지 않음(기존 동작 보존).
  // - 첫 non-undefined 값은 mount의 initial load가 이미 처리 → skip.
  // - 이후 chatRoomId가 바뀌면 이전 방 메시지를 즉시 비우고 새 방을 full 로드한다.
  //   레이스(A조회→B선택→A늦게도착)는 load()의 loadSeqRef/AbortController가 처리(최신만 반영).
  const prevChatRoomRef = useRef<string | null | undefined>(undefined);
  const switchInitializedRef = useRef(false);
  useEffect(() => {
    if (chatRoomId === undefined) return;
    if (!switchInitializedRef.current) {
      switchInitializedRef.current = true;
      prevChatRoomRef.current = chatRoomId;
      return;
    }
    if (prevChatRoomRef.current === chatRoomId) return;
    prevChatRoomRef.current = chatRoomId;
    setMessages([]);
    void loadFull('room_switch');
  }, [chatRoomId, loadFull]);

  return {
    messages,
    loadFull,
    setMessages,
    initialHydrationComplete,
    initialLoadStatus
  };
}
