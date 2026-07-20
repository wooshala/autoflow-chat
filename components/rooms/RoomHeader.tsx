'use client';

// Phase 1C.1 — shared center header for mock/customer rooms. The live operations room
// keeps its own existing header (staffGlobalSlot). Customer rooms always show the
// language name (§6).

import { LANG_DISPLAY } from '@/lib/customer-service/translationLangs';
import { roomColorText } from '@/lib/rooms/roomTheme';
import type { Room } from '@/lib/rooms/roomTypes';
import { useRoomNavigation } from './RoomNavigationContext';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { langDisplayName } from '@/lib/guest-spike/languages';

export function RoomHeader({ room }: { room: Room }) {
  const { channelLanguages } = useRoomNavigation();
  // Phase 1H.5 — channel-mapped rooms show the live guest-selected language ("언어 미선택"
  // until chosen); unmapped mock rooms keep their static language.
  const languageLabel =
    room.category !== 'customer'
      ? null
      : lookupChannelKey(room.id)
        ? (channelLanguages[room.id] ? langDisplayName(channelLanguages[room.id]!) : '언어 미선택')
        : room.language
          ? LANG_DISPLAY[room.language]
          : null;

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-gray-300/50 bg-[#B2C7D9] px-4 py-2">
      {room.icon && <span aria-hidden className={roomColorText(room.colorToken)}>{room.icon}</span>}
      <span className="font-semibold text-gray-800">{room.title}</span>
      {languageLabel && (
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">{languageLabel}</span>
      )}
      {room.dataBinding === 'mock' && (
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">DEV · mock</span>
      )}
      <span className="ml-auto text-xs text-gray-400">대화 타임라인</span>
    </header>
  );
}
