'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatRoomSummary } from '@/lib/types';
import { normalizeChatRoomsResponse } from '@/lib/chat/chatRoomsResponse';

/**
 * disabled: flag OFF 등으로 비활성(네트워크 fetch 없음)
 * loading : 조회 중
 * ready   : 유효 방 ≥1
 * empty   : 정상 빈 목록(방 0개) — error와 구분(가짜 정상 처리 금지)
 * error   : HTTP 실패 / JSON 파싱 실패 / 손상된 응답
 */
export type ChatRoomsState = 'disabled' | 'loading' | 'ready' | 'empty' | 'error';
export type ChatRoomsSummarySource = 'rpc' | 'legacy';

/**
 * 순수 room-list fetch 훅. GET /api/chat/rooms 만 담당한다.
 * 책임에 포함하지 않음: 메시지 state / Realtime / selectedChatRoomId / localStorage / unread / resize / room-mode 판정.
 * @param enabled false면 fetch하지 않고 'disabled'(flag OFF 경로에서 불필요한 네트워크 0).
 */
export function useChatRooms(enabled: boolean = true): {
  rooms: ChatRoomSummary[];
  state: ChatRoomsState;
  reload: () => Promise<void>;
  /** Phase 1.2.6 D: 최근메시지 조회 경로. 'legacy'면 요약 preview가 부정확할 수 있음(관측용). */
  summarySource: ChatRoomsSummarySource;
  /** legacy 강등 여부. 다중방 room-mode 활성 판정에 사용. */
  degraded: boolean;
} {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [state, setState] = useState<ChatRoomsState>(enabled ? 'loading' : 'disabled');
  const [summarySource, setSummarySource] = useState<ChatRoomsSummarySource>('rpc');
  const [degraded, setDegraded] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setRooms([]);
      setState('disabled');
      setSummarySource('rpc');
      setDegraded(false);
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/chat/rooms', { cache: 'no-store' });
      if (!res.ok) {
        setRooms([]);
        setState('error');
        setSummarySource('rpc');
        setDegraded(false);
        return;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        setRooms([]);
        setState('error');
        setSummarySource('rpc');
        setDegraded(false);
        return;
      }
      const norm = normalizeChatRoomsResponse(json);
      setRooms(norm.rooms);
      setState(norm.status);
      const src = (json as { summary_source?: unknown })?.summary_source === 'legacy' ? 'legacy' : 'rpc';
      setSummarySource(src);
      setDegraded((json as { degraded?: unknown })?.degraded === true);
    } catch {
      setRooms([]);
      setState('error');
      setSummarySource('rpc');
      setDegraded(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rooms, state, reload: load, summarySource, degraded };
}
