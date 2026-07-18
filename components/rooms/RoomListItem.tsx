'use client';

// Phase 1C — a single room row in the left navigation. Language name is always shown
// for customer rooms (via the title, e.g. "503호 · 中文(简体)"); the flag emoji is only
// a secondary hint (§6). The real staff room ('staff-global') cannot be trashed.

import { STAFF_GLOBAL_ROOM_ID, type Room } from '@/lib/rooms/roomTypes';

const FLAG: Record<string, string> = {
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
  en: '🇬🇧',
  ru: '🇷🇺',
  ko: '🇰🇷',
};

export function RoomListItem({
  room,
  active,
  favorite,
  archived,
  onSelect,
  onToggleFavorite,
  onToggleArchived,
}: {
  room: Room;
  active: boolean;
  favorite: boolean;
  archived: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleArchived: () => void;
}) {
  const canArchive = room.id !== STAFF_GLOBAL_ROOM_ID;
  const flag = room.language ? FLAG[room.language] : null;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 hover:bg-white ${
          active ? 'bg-white ring-1 ring-inset ring-blue-300' : ''
        }`}
      >
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col text-left">
          <div className="flex items-center gap-1.5">
            {flag && <span aria-hidden>{flag}</span>}
            <span className="truncate font-medium text-gray-800">{room.title}</span>
            {room.kind === 'staff-global' && (
              <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">실시간</span>
            )}
            {room.isDev && (
              <span className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-500">DEV</span>
            )}
            {room.unread ? (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {room.unread}
              </span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={onToggleFavorite}
          title={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          aria-pressed={favorite}
          className={`shrink-0 text-sm ${favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
        >
          {favorite ? '★' : '☆'}
        </button>

        {canArchive && (
          <button
            type="button"
            onClick={onToggleArchived}
            title={archived ? '복원' : '휴지통으로 이동'}
            className="shrink-0 text-xs text-gray-300 hover:text-gray-600"
          >
            {archived ? '↩' : '🗑'}
          </button>
        )}
      </div>
    </li>
  );
}
