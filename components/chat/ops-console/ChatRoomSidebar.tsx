'use client';

import { formatChatRoomTime } from '@/lib/chat/chatRoomSummaryFormat';
import type { ParticipantRow } from '@/components/chat/ops-console/ChatParticipantSidebar';
import type { ChatRoomSummary } from '@/lib/types';
import type { ChatRoomsState } from '@/lib/hooks/useChatRooms';

type Props = {
  /** 기존 참여자 섹션 유지용(메시지 파생). room summary participant_count와 혼용하지 않는다. */
  participants: ParticipantRow[];
  /** 방 목록(page/controller가 소유). 이 컴포넌트는 fetch/room-mode 판정을 하지 않는다. */
  rooms: ChatRoomSummary[];
  /** 방 목록 상태(page가 판정한 값). */
  status: ChatRoomsState;
  /** 현재 선택된 방 UUID(chat_room_id). null이면 미선택. */
  selectedChatRoomId: string | null;
  /** 방 클릭/키보드 선택 시 호출. */
  onSelectRoom: (roomId: string) => void;
  /** 오류 상태에서 재조회 요청. */
  onRetry: () => void;
};

/**
 * 카카오톡형 왼쪽 채팅방 목록 (Phase 1.2.5, presentational).
 * - 데이터 fetch / fail-open 판정은 하지 않는다(page/controller 책임). props만 렌더.
 * - 방 클릭/Enter·Space로 선택. aria-current + 배경 강조. unread badge 없음(가짜 0 금지).
 * - error/empty는 page가 legacy 사이드바로 fail-open하므로 보통 여기 도달하지 않지만, 방어적으로 처리.
 */
export default function ChatRoomSidebar({
  participants,
  rooms,
  status,
  selectedChatRoomId,
  onSelectRoom,
  onRetry
}: Props) {
  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-gray-200 bg-white lg:w-56">
      <div className="shrink-0 border-b border-gray-200 px-3 py-2.5">
        <div className="text-sm font-extrabold text-gray-900">채팅</div>
      </div>

      {/* 채팅방 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400">채팅방을 불러오는 중…</p>
        ) : status === 'error' ? (
          <div className="px-3 py-6 text-center text-xs text-gray-500">
            <p>채팅방을 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => onRetry()}
              className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-50"
            >
              다시 시도
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-gray-400">사용 가능한 채팅방이 없습니다.</p>
        ) : (
          <ul>
            {rooms.map((r) => {
              const lm = r.last_message;
              const preview = lm
                ? `${lm.sender_name ? `${lm.sender_name}: ` : ''}${lm.preview}`
                : '아직 메시지가 없습니다.';
              const selected = selectedChatRoomId === r.id;
              return (
                <li key={r.id} className="border-b border-gray-100">
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelectRoom(r.id)}
                    className={`block w-full cursor-pointer px-3 py-2.5 text-left transition-colors ${
                      selected ? 'bg-yellow-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-900">{r.name}</span>
                      {lm ? (
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {formatChatRoomTime(lm.created_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-600">{preview}</div>
                    <div className="mt-0.5 text-[10px] text-gray-400">참여자 {r.participant_count}명</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 기존 참여자 섹션 유지(메시지 파생). 후속 Phase에서 DB participants로 전환 예정. */}
      <div className="shrink-0 border-t border-gray-200 px-3 py-2">
        <div className="text-[10px] font-bold text-gray-500">참여자 {participants.length}</div>
        <ul className="mt-1 space-y-0.5">
          {participants.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-gray-700">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.online ? 'bg-green-500' : 'bg-gray-300'}`}
              />
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
