'use client';

// Phase 1C.1 — a single room row. Icon comes from room.icon (staff) or the language flag
// (customer, secondary hint); the language NAME is always in the title (§6). 'live' rooms
// show a 실시간 badge, 'mock' rooms a DEV badge. The operations room can't be hidden.

import { OPERATIONS_ROOM_ID, type Room } from '@/lib/rooms/roomTypes';
import { roomColorText } from '@/lib/rooms/roomTheme';
import { LANG_DISPLAY } from '@/lib/customer-service/translationLangs';
import { useRoomNavigation } from './RoomNavigationContext';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { langDisplayName, resolveGuestLanguageBadge } from '@/lib/guest-spike/languages';

const FLAG: Record<string, string> = {
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
  en: '🇬🇧',
  ru: '🇷🇺',
  ko: '🇰🇷',
};

/** Phase 1H.7 — the customer room's language badge. Channel-mapped rooms distinguish "no active
 *  guest" (no badge) from "guest present, no language" (gray 언어 미선택) from a chosen language
 *  (blue); unmapped mock rooms keep their static language badge. */
function useRoomLanguageBadge(room: Room): { text: string; muted: boolean } | null {
  const { channelLanguages, channelSessionStatus } = useRoomNavigation();
  if (room.category !== 'customer') return null;
  if (lookupChannelKey(room.id)) {
    const b = resolveGuestLanguageBadge({
      sessionStatus: channelSessionStatus[room.id] ?? null,
      language: channelLanguages[room.id] ?? null,
    });
    if (b.kind === 'hidden') return null;
    if (b.kind === 'unselected') return { text: '언어 미선택', muted: true };
    return { text: langDisplayName(b.lang), muted: false };
  }
  return room.language ? { text: LANG_DISPLAY[room.language], muted: false } : null;
}

export function RoomListItem({
  room,
  active,
  favorite,
  hidden,
  onSelect,
  onToggleFavorite,
  onToggleHidden,
}: {
  room: Room;
  active: boolean;
  favorite: boolean;
  hidden: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
}) {
  const canHide = room.id !== OPERATIONS_ROOM_ID;
  const icon = room.icon ?? (room.language ? FLAG[room.language] : null);
  const languageBadge = useRoomLanguageBadge(room);
  // Phase 1H.11 — customer rooms show a live unread DOT (from the summary poll), not a fake
  // number. Team/system rooms keep their existing mock numeric badge.
  const { channelUnread } = useRoomNavigation();
  const hasUnread = room.category === 'customer' && !!channelUnread[room.id];

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 hover:bg-white ${
          active ? 'bg-white ring-1 ring-inset ring-blue-300' : ''
        }`}
      >
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col text-left">
          <div className="flex items-center gap-1.5">
            {icon && <span aria-hidden className={roomColorText(room.colorToken)}>{icon}</span>}
            <span className="truncate font-medium text-gray-800">{room.title}</span>
            {languageBadge && (
              <span
                className={
                  languageBadge.muted
                    ? 'shrink-0 rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-500'
                    : 'shrink-0 rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-800'
                }
              >
                {languageBadge.text}
              </span>
            )}
            {room.dataBinding === 'live' ? (
              <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700">실시간</span>
            ) : (
              <span className="rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-500">DEV</span>
            )}
            {room.category === 'customer' ? (
              hasUnread ? (
                <span
                  className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500"
                  aria-label="안읽은 고객 메시지"
                />
              ) : null
            ) : room.unread ? (
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

        {canHide && (
          <button
            type="button"
            onClick={onToggleHidden}
            title={hidden ? '목록에 다시 표시' : '내 목록에서 숨기기'}
            className="shrink-0 text-xs text-gray-300 hover:text-gray-600"
          >
            {hidden ? '↩' : '🗑'}
          </button>
        )}
      </div>
    </li>
  );
}
