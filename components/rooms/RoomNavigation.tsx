'use client';

// Phase 1C — left Room Navigation panel. Replaces the message-derived "최근 대화" sidebar
// with a room-centric list: search + tabs (전체/내 대화방/즐겨찾기) + "+ 새 채팅방", then the
// sectioned RoomList. Slots into the same left panel as ChatParticipantSidebar; the page
// swaps between them behind the NEXT_PUBLIC_ROOM_NAVIGATION flag.

import { useState } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomList } from './RoomList';
import { CreateRoomModal } from './CreateRoomModal';
import type { RoomTab } from '@/lib/rooms/roomTypes';

const TABS: { key: RoomTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'mine', label: '내 대화방' },
  { key: 'favorites', label: '즐겨찾기' },
];

export default function RoomNavigation({ widthClassName }: { widthClassName?: string }) {
  const { search, setSearch, tab, setTab, createRoom } = useRoomNavigation();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <aside className={`flex ${widthClassName ?? 'w-64'} min-w-0 shrink-0 flex-col border-r border-gray-200 bg-gray-50`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="font-semibold text-gray-700">대화방</span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          + 새 채팅방
        </button>
      </div>

      <div className="border-b border-gray-200 px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="방 이름 · 객실 · 언어 검색"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        />
        <div className="mt-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <RoomList />

      <div className="border-t border-gray-200 px-3 py-1.5 text-[10px] text-gray-400">
        Room Navigation · DEV/PoC · mock (직원 전체만 실데이터)
      </div>

      {modalOpen && <CreateRoomModal onClose={() => setModalOpen(false)} onCreate={createRoom} />}
    </aside>
  );
}
