'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatRoomSummary } from '@/lib/types';

type RoomsState = 'loading' | 'ready' | 'error';

/**
 * 순수 room-list fetch 훅. GET /api/chat/rooms 만 담당한다.
 * 책임에 포함하지 않음: 메시지 state / Realtime / selectedChatRoomId / localStorage / unread / resize.
 */
export function useChatRooms(): {
  rooms: ChatRoomSummary[];
  state: RoomsState;
  reload: () => Promise<void>;
} {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [state, setState] = useState<RoomsState>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/chat/rooms', { cache: 'no-store' });
      if (!res.ok) throw new Error(`chat rooms ${res.status}`);
      const json = (await res.json()) as { rooms?: ChatRoomSummary[] };
      setRooms(Array.isArray(json?.rooms) ? json.rooms : []);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { rooms, state, reload: load };
}
