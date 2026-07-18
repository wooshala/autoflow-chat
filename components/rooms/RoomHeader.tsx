'use client';

// Phase 1C — shared center header for mock/customer rooms. The real staff room keeps
// its own existing header (staffGlobalSlot), so this is only used by MockStaffRoom /
// CustomerRoom. Customer rooms always show the language name (§6).

import { LANG_DISPLAY } from '@/lib/customer-service/translationLangs';
import type { Room } from '@/lib/rooms/roomTypes';

export function RoomHeader({ room }: { room: Room }) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
      <span className="font-semibold text-gray-800">{room.title}</span>
      {room.kind === 'customer' && room.language && (
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
          {LANG_DISPLAY[room.language]}
        </span>
      )}
      {room.isDev && (
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">DEV · mock</span>
      )}
      <span className="ml-auto text-xs text-gray-400">대화 타임라인</span>
    </header>
  );
}
