'use client';

import type { ChatMessage } from '@/lib/types';
import { formatKSTShort } from '@/lib/formatKST';

export type ParticipantRow = {
  id: string;
  name: string;
  role: string;
  online: boolean;
};

export type RoomRow = {
  roomNo: string;
  preview: string;
  sender: string;
  lastAt: string;
  unread?: number;
};

type Props = {
  participants: ParticipantRow[];
  rooms: RoomRow[];
  selectedRoomNo: string | null;
  onSelectRoom: (roomNo: string) => void;
  /** Phase 1.4: 루트 폭 클래스. 미지정 시 기존 고정폭. 리사이즈 레이아웃 안에서는 'w-full'(wrapper가 폭 소유). */
  widthClassName?: string;
};

const ROLE_TAB: Record<string, string> = {
  admin: '프론트',
  manager: '프론트',
  front: '프론트',
  cleaning: '청소팀'
};

export function buildParticipantsFromMessages(messages: ChatMessage[]): ParticipantRow[] {
  const map = new Map<string, ParticipantRow>();
  for (const m of messages) {
    if (m.is_deleted || !m.user_id) continue;
    if (map.has(m.user_id)) continue;
    map.set(m.user_id, {
      id: m.user_id,
      name: m.sender_name || m.user?.name || '직원',
      role: m.user?.role || 'staff',
      online: m.sender_side === 'mobile'
    });
  }
  return Array.from(map.values());
}

export function buildRoomsFromMessages(messages: ChatMessage[]): RoomRow[] {
  const map = new Map<string, RoomRow>();
  for (const m of messages) {
    if (!m.room_no || m.is_deleted) continue;
    const roomNo = m.room_no;
    const existing = map.get(roomNo);
    if (!existing || m.created_at > existing.lastAt) {
      map.set(roomNo, {
        roomNo,
        lastAt: m.created_at,
        preview: (m.message || (m.image_url ? '사진' : '')).slice(0, 24),
        sender: m.sender_name || m.user?.name || '직원'
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export default function ChatParticipantSidebar({
  participants,
  rooms,
  selectedRoomNo,
  onSelectRoom,
  widthClassName = 'w-52 shrink-0 lg:w-56'
}: Props) {
  const frontCount = participants.filter((p) => ROLE_TAB[p.role] === '프론트').length;
  const cleaningCount = participants.filter((p) => ROLE_TAB[p.role] === '청소팀').length;

  return (
    <aside className={`flex h-full flex-col border-r border-gray-200 bg-white ${widthClassName}`}>
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="text-xs font-bold text-gray-800">참여자 / 방</div>
        <input
          readOnly
          placeholder="참여자·방 검색"
          className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-500"
        />
        <div className="mt-2 flex gap-1 text-[10px]">
          <span className="rounded-full bg-gray-900 px-2 py-0.5 font-bold text-white">
            전체 {participants.length}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">프론트 {frontCount}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">청소 {cleaningCount}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">참여자</div>
        <ul className="space-y-0.5">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-gray-300'}`}
                aria-hidden
              />
              <span className="truncate font-medium">{p.name}</span>
            </li>
          ))}
          {participants.length === 0 ? (
            <li className="px-2 py-1 text-xs text-gray-400">참여자 없음</li>
          ) : null}
        </ul>

        <div className="mb-1 mt-4 px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          최근 채팅방
        </div>
        <ul className="space-y-0.5">
          {rooms.map((r) => {
            const active = selectedRoomNo === r.roomNo;
            return (
              <li key={r.roomNo}>
                <button
                  type="button"
                  onClick={() => onSelectRoom(r.roomNo)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                    active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-gray-900">{r.roomNo}호</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{formatKSTShort(r.lastAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-gray-500">
                    {r.sender} · {r.preview}
                  </div>
                </button>
              </li>
            );
          })}
          {rooms.length === 0 ? (
            <li className="px-2 py-1 text-xs text-gray-400">객실 메시지 없음</li>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-gray-100 p-2">
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-semibold text-gray-400"
        >
          + 새 채팅방
        </button>
      </div>
    </aside>
  );
}
