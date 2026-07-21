'use client';

// Phase 1C.1 — the scrollable, sectioned room list. Groups filtered rooms into
// 직원 채팅 / 고객 채팅방 / 최근 대화방 / 휴지통. Sections are collapsible (per-user UI state).
// Recent (§10) is a small shortcut section, so a room can appear both in its home
// section and in Recent.

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomSection } from './RoomSection';
import { RoomListItem } from './RoomListItem';
import {
  byDefaultOrder,
  hiddenRooms,
  recentRooms,
  splitCustomerRoomsByUnread,
  visibleRooms,
} from '@/lib/rooms/roomsQuery';
import type { Room, RoomSectionId } from '@/lib/rooms/roomTypes';

export function RoomList() {
  const {
    rooms,
    selectedRoom,
    search,
    tab,
    favorites,
    hidden,
    membership,
    sectionCollapse,
    channelUnread,
    channelLatestGuestAt,
    selectRoom,
    toggleFavorite,
    toggleHidden,
    toggleSectionCollapse,
  } = useRoomNavigation();

  const filter = { search, tab, favorites, hidden, membership };
  const active = visibleRooms(rooms, filter);
  const staffRooms = active.filter((r) => r.category !== 'customer').sort(byDefaultOrder);
  const customerRooms = active.filter((r) => r.category === 'customer').sort(byDefaultOrder);
  // Phase 1H.12 — unread customer rooms float to a top "안읽은 대화" group (newest guest first);
  // the rest stay in numeric order under "전체 객실". A room is in exactly one group (no dupes).
  const { unread: unreadCustomerRooms, others: otherCustomerRooms } = splitCustomerRoomsByUnread(
    customerRooms,
    channelUnread,
    channelLatestGuestAt,
  );
  const recent = recentRooms(rooms, filter, 3);
  const trash = hiddenRooms(rooms, { search, hidden });

  const renderItem = (room: Room) => (
    <RoomListItem
      key={room.id}
      room={room}
      active={room.id === selectedRoom.id}
      favorite={favorites.has(room.id)}
      hidden={hidden.has(room.id)}
      onSelect={() => selectRoom(room.id)}
      onToggleFavorite={() => toggleFavorite(room.id)}
      onToggleHidden={() => toggleHidden(room.id)}
    />
  );

  const section = (id: RoomSectionId, title: string, list: Room[], showCount = true) =>
    list.length > 0 && (
      <RoomSection
        title={title}
        count={showCount ? list.length : undefined}
        collapsed={sectionCollapse[id]}
        onToggle={() => toggleSectionCollapse(id)}
      >
        {list.map(renderItem)}
      </RoomSection>
    );

  const nothing = staffRooms.length + customerRooms.length + trash.length === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {section('staff', '직원 채팅', staffRooms)}
      {section('customer-unread', '안읽은 대화', unreadCustomerRooms)}
      {section('customer', '전체 객실', otherCustomerRooms)}
      {section('recent', '최근 대화방', recent, false)}
      {section('trash', '휴지통', trash)}
      {nothing && <div className="px-3 py-6 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>}
    </div>
  );
}
