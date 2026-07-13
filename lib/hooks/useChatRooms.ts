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

/**
 * 순수 room-list fetch 훅. GET /api/chat/rooms 만 담당한다.
 * 책임에 포함하지 않음: 메시지 state / Realtime / selectedChatRoomId / localStorage / unread / resize / room-mode 판정.
 * @param enabled false면 fetch하지 않고 'disabled'(flag OFF 경로에서 불필요한 네트워크 0).
 */
export function useChatRooms(enabled: boolean = true): {
  rooms: ChatRoomSummary[];
  state: ChatRoomsState;
  reload: () => Promise<void>;
} {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [state, setState] = useState<ChatRoomsState>(enabled ? 'loading' : 'disabled');

  const load = useCallback(async () => {
    if (!enabled) {
      setRooms([]);
      setState('disabled');
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/chat/rooms', { cache: 'no-store' });
      if (!res.ok) {
        setRooms([]);
        setState('error');
        return;
      }
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        setRooms([]);
        setState('error');
        return;
      }
      const norm = normalizeChatRoomsResponse(json);
      setRooms(norm.rooms);
      setState(norm.status);
    } catch {
      setRooms([]);
      setState('error');
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rooms, state, reload: load };
}
