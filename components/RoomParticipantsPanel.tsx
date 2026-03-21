'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChatRoomParticipantListItem } from '@/lib/types';
import { chatRoomParticipantsUrl } from '@/lib/chatApi';

type Props = {
  /** 조회할 채팅방 UUID. 비어 있으면 API 호출 안 함 (`NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID`) */
  roomId: string;
};

/**
 * 참가자 목록 (조회만). 초대/내보내기·권한은 후속 단계.
 */
export default function RoomParticipantsPanel({ roomId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ChatRoomParticipantListItem[]>([]);

  const load = useCallback(async () => {
    const id = roomId?.trim();
    if (!id) {
      setParticipants([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(chatRoomParticipantsUrl(id), { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = (await res.json()) as ChatRoomParticipantListItem[];
      setParticipants(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = !roomId?.trim()
    ? '-'
    : loading
      ? '…'
      : String(participants.length);

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-100"
        aria-expanded={open}
      >
        <span>
          👥 참가자 ({countLabel}명)
        </span>
        <span className="text-xs text-gray-500">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-gray-300 bg-white p-3">
          {!roomId?.trim() && (
            <p className="text-center text-xs text-amber-700">
              환경 변수 <code className="rounded bg-amber-50 px-1">NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID</code>에
              방 UUID를 설정하세요.
            </p>
          )}

          {roomId?.trim() && loading && (
            <p className="text-center text-xs text-gray-500">불러오는 중…</p>
          )}

          {roomId?.trim() && !loading && error && (
            <p className="text-center text-xs text-red-600">{error}</p>
          )}

          {roomId?.trim() && !loading && !error && participants.length === 0 && (
            <p className="rounded-md bg-gray-50 px-2 py-3 text-center text-xs text-gray-500">
              참가자 없음
            </p>
          )}

          {roomId?.trim() && !loading && !error && participants.length > 0 && (
            <ul className="space-y-1.5">
              {participants.map((p) => (
                <li
                  key={p.user_id}
                  className="rounded-md border border-gray-100 bg-gray-50/80 px-2.5 py-1.5 text-sm text-gray-800"
                >
                  {p.name} ({p.role})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
