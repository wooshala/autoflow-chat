'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatRoomParticipantListItem } from '@/lib/types';
import { chatRoomParticipantsUrl } from '@/lib/chatApi';
import { fetchEnvelope } from '@/lib/api/envelope';
import { TIMEOUT_MS_PARTICIPANTS } from '@/lib/api/timeouts';
import { createTaggedLogger } from '@/lib/logger';

const tlog = createTaggedLogger('[PARTICIPANTS]');

type Props = {
  /** 조회할 채팅방 UUID. 비어 있으면 API 호출 안 함 (`NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID`) */
  roomId: string;
};

type LoadPhase =
  | { kind: 'no_room' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'success'; items: ChatRoomParticipantListItem[] };

function initialPhase(roomId: string): LoadPhase {
  return roomId?.trim() ? { kind: 'loading' } : { kind: 'no_room' };
}

/**
 * 참가자 목록 (조회만). 초대/내보내기·권한은 후속 단계.
 */
export default function RoomParticipantsPanel({ roomId }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<LoadPhase>(() => initialPhase(roomId));
  const [trackedRoomId, setTrackedRoomId] = useState(roomId);
  if (roomId !== trackedRoomId) {
    setTrackedRoomId(roomId);
    setPhase(initialPhase(roomId));
  }

  const loadGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const id = roomId?.trim();
    if (!id) {
      setPhase({ kind: 'no_room' });
      return;
    }

    const myGen = ++loadGenRef.current;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    let ac: AbortController | null = new AbortController();
    abortRef.current = ac;

    setPhase({ kind: 'loading' });
    try {
      const result = await fetchEnvelope<ChatRoomParticipantListItem[]>(chatRoomParticipantsUrl(id), {
        cache: 'no-store',
        signal: ac.signal,
        timeoutMs: TIMEOUT_MS_PARTICIPANTS
      });

      if (myGen !== loadGenRef.current) return;

      if (!result.ok) {
        tlog.warn({
          event: 'load_failed',
          ok: false,
          error: result.error,
          message: result.message,
          room_id: id
        });
        setPhase({ kind: 'error', message: result.message });
        return;
      }

      const list = result.data;
      if (!Array.isArray(list)) {
        tlog.warn({ event: 'load_failed', ok: false, reason: 'response_shape', room_id: id });
        setPhase({ kind: 'error', message: '응답 형식이 올바르지 않습니다.' });
        return;
      }

      if (myGen !== loadGenRef.current) return;

      if (list.length === 0) {
        tlog.debug({ event: 'load_ok', room_id: id, count: 0 });
        setPhase({ kind: 'empty' });
        return;
      }
      tlog.debug({ event: 'load_ok', room_id: id, count: list.length });
      setPhase({ kind: 'success', items: list });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        tlog.debug({ event: 'load_aborted', room_id: id });
        return;
      }
      const message = e instanceof Error ? e.message : '불러오기 실패';
      if (myGen !== loadGenRef.current) return;
      tlog.warn({ event: 'load_failed', ok: false, error: message });
      setPhase({ kind: 'error', message });
    } finally {
      if (ac && abortRef.current === ac) {
        abortRef.current = null;
      }
    }
  }, [roomId]);

  useEffect(() => {
    void load();
    return () => {
      loadGenRef.current += 1;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [load]);

  const countLabel = (() => {
    if (phase.kind === 'no_room') return '-';
    if (phase.kind === 'loading') return '…';
    if (phase.kind === 'error') return '!';
    if (phase.kind === 'empty') return '0';
    return String(phase.items.length);
  })();

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
          {phase.kind === 'no_room' && (
            <p className="text-center text-xs text-amber-700">
              환경 변수 <code className="rounded bg-amber-50 px-1">NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID</code>에
              방 UUID를 설정하세요.
            </p>
          )}

          {phase.kind === 'loading' && (
            <p className="text-center text-xs text-gray-500">불러오는 중…</p>
          )}

          {phase.kind === 'error' && (
            <p className="text-center text-xs text-red-600" role="alert">
              참가자 목록을 불러오지 못했습니다. {phase.message}
            </p>
          )}

          {phase.kind === 'empty' && (
            <p className="rounded-md bg-gray-50 px-2 py-3 text-center text-xs text-gray-500">
              참가자 없음
            </p>
          )}

          {phase.kind === 'success' && (
            <ul className="space-y-1.5">
              {phase.items.map((p) => (
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
