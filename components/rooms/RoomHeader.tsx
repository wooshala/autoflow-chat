'use client';

// Phase 1C.1 — shared center header for mock/customer rooms. The live operations room
// keeps its own existing header (staffGlobalSlot). Customer rooms always show the
// language name (§6).

import { LANG_DISPLAY } from '@/lib/customer-service/translationLangs';
import { roomColorText } from '@/lib/rooms/roomTheme';
import type { Room } from '@/lib/rooms/roomTypes';
import { useRoomNavigation } from './RoomNavigationContext';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { langDisplayName, resolveGuestLanguageBadge } from '@/lib/guest-spike/languages';

export function RoomHeader({ room }: { room: Room }) {
  const { channelLanguages, channelSessionStatus } = useRoomNavigation();
  // Phase 1H.7 — channel-mapped rooms: distinguish "no active guest" (no badge) from
  // "guest present, no language" (gray 언어 미선택) from a chosen language (blue). Unmapped mock
  // rooms keep their static language badge.
  const badge: { text: string; muted: boolean } | null = (() => {
    if (room.category !== 'customer') return null;
    if (lookupChannelKey(room.id)) {
      const b = resolveGuestLanguageBadge({
        sessionStatus: channelSessionStatus[room.id] ?? null,
        language: channelLanguages[room.id] ?? null,
      });
      if (b.kind === 'hidden') return null; // no active guest → no badge
      if (b.kind === 'unselected') return { text: '언어 미선택', muted: true };
      return { text: langDisplayName(b.lang), muted: false };
    }
    return room.language ? { text: LANG_DISPLAY[room.language], muted: false } : null;
  })();

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-gray-300/50 bg-[#B2C7D9] px-4 py-2">
      {room.icon && <span aria-hidden className={roomColorText(room.colorToken)}>{room.icon}</span>}
      <span className="font-semibold text-gray-800">{room.title}</span>
      {badge && (
        <span
          className={
            badge.muted
              ? 'rounded bg-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500'
              : 'rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800'
          }
        >
          {badge.text}
        </span>
      )}
      {room.dataBinding === 'mock' && (
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">DEV · mock</span>
      )}
      <span className="ml-auto text-xs text-gray-400">대화 타임라인</span>
    </header>
  );
}
