'use client';

import { useState } from 'react';
import { MOCK_MAINTENANCE_ROWS } from '@/lib/chat/opsConsoleMock';
import ChatLostFoundSection from '@/components/chat/ops-console/ChatLostFoundSection';
import type { LostFoundItem } from '@/lib/ops-events/types';
import type { ChatMessage } from '@/lib/types';

type EventTab = 'lost_found' | 'maintenance' | 'other';

type Props = {
  selectedRoomNo: string | null;
  /** Kept for caller compatibility; recent-photo / quick-register UI removed. */
  recentPhotoMessage: ChatMessage | null;
  lostFoundItems: LostFoundItem[];
  lostFoundEnabled: boolean;
  actorId: string | null;
  /** Kept for caller compatibility; quick-register UI removed. */
  onRegisterLostFound?: (msg: ChatMessage) => void;
  onSelectRoom: (roomNo: string | null) => void;
  onRefreshLostFoundList: () => void;
};

const TABS: { id: EventTab; label: string }[] = [
  { id: 'lost_found', label: '분실물' },
  { id: 'maintenance', label: '시설고장' },
  { id: 'other', label: '기타' }
];

export default function ChatOperationPanel({
  selectedRoomNo,
  lostFoundItems,
  lostFoundEnabled,
  actorId,
  onSelectRoom,
  onRefreshLostFoundList
}: Props) {
  const [tab, setTab] = useState<EventTab>('lost_found');
  const roomLabel = selectedRoomNo ? `${selectedRoomNo}호` : '전체';
  const filteredItems = selectedRoomNo
    ? lostFoundItems.filter((item) => item.snap_room_no === selectedRoomNo)
    : lostFoundItems;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-gray-200 bg-gray-50 lg:w-80">
      <div className="border-b border-gray-200 bg-white px-3 py-2.5">
        <div className="text-xs font-bold text-gray-500">Event Center</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-lg font-extrabold text-gray-900">{roomLabel}</span>
          {selectedRoomNo ? (
            <button
              type="button"
              onClick={() => onSelectRoom(null)}
              className="text-[10px] font-semibold text-blue-600"
            >
              전체
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold ${
                tab === t.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tab === 'lost_found' ? (
          <section id="event-center-lost-found" className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mt-0">
              <ChatLostFoundSection
                items={filteredItems}
                lostFoundEnabled={lostFoundEnabled}
                actorId={actorId}
                onRefreshList={onRefreshLostFoundList}
              />
            </div>
          </section>
        ) : null}

        {tab === 'maintenance' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-3">
            <span className="text-[10px] text-gray-400">(PoC mock)</span>
            <ul className="mt-2 space-y-1.5">
              {MOCK_MAINTENANCE_ROWS.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-2 py-1.5 text-xs"
                >
                  <span className="font-semibold text-gray-800">
                    {row.room_no}호 {row.title}
                  </span>
                  <span className="text-[10px] text-gray-400">{row.time_label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tab === 'other' ? (
          <section className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="py-6 text-center text-xs text-gray-400">등록된 기타 이벤트가 없습니다.</div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
