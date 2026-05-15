import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_CHAT_LIST } from '@/lib/api/timeouts';
import { CHAT_LIST_URL } from '@/lib/chatApi';
import type { ChatMessage } from '@/lib/types';
import { log } from '@/lib/logger';

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
};

export function useChatLoader(options?: UseChatLoaderOptions) {
  const internalLoadingRef = useRef(false);
  const loadingRef = options?.loadingRef ?? internalLoadingRef;

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

  const load = useCallback(
    async (
      source: string = 'manual',
      opts?: { since?: string; mode?: 'full' | 'delta' }
    ): Promise<{ ok: boolean; count: number; maxCreatedAt: string | null }> => {
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

      if (source === 'initial' || source === 'initial_retry') {
        log.debug('[CHAT_LOAD_START]', {
          source,
          since: opts?.since ?? null,
          limit: opts?.since ? 40 : 50,
          seq: mySeq
        });
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', opts?.since ? '40' : '50');
        if (opts?.since) params.set('since', opts.since);
        const listUrl = `${CHAT_LIST_URL}?${params.toString()}`;
        const result = await fetchEnvelope<ChatListData>(listUrl, {
          cache: 'no-store',
          signal: controller.signal,
          timeoutMs: TIMEOUT_MS_CHAT_LIST
        });

        if (!result.ok) {
          throw new Error(result.message || `CHAT_LIST_HTTP_${result.status}`);
        }

        const nextMessages = Array.isArray(result.data.messages) ? result.data.messages : null;
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
            setMessages((prev) => {
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
                const prevRow = byId.get(String(m.id));
                byId.set(String(m.id), prevRow ? { ...prevRow, ...m } : m);
                if (!prevIds.has(mid)) {
                  added.push(m);
                } else {
                  skippedExisting += 1;
                }
              });
              const merged = sortMessagesAsc(Array.from(byId.values()));
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
    [loadingRef]
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
      if (first?.ok) return;

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
      await loadFull('initial_retry');
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
    initialHydrationComplete
  };
}
