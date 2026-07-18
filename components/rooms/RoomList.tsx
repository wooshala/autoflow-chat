'use client';

// Phase 1C — the scrollable, sectioned room list. Groups the filtered rooms into
// 직원 채팅 / 고객 채팅방 / 최근 대화방 / 휴지통. Recent (§10) is a small shortcut section,
// so a room can appear both in its home section and in Recent.

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomSection } from './RoomSection';
import { RoomListItem } from './RoomListItem';
import { archivedRooms, recentRooms, visibleRooms } from '@/lib/rooms/roomsQuery';
import type { Room } from '@/lib/rooms/roomTypes';

export function RoomList() {
  const {
    rooms,
    selectedRoom,
    search,
    tab,
    favorites,
    archived,
    selectRoom,
    toggleFavorite,
    toggleArchived,
  } = useRoomNavigation();

  const filter = { search, tab, favorites, archived };
  const active = visibleRooms(rooms, filter);
  const staffRooms = active.filter((r) => r.kind !== 'customer');
  const customerRooms = active.filter((r) => r.kind === 'customer');
  const recent = recentRooms(rooms, filter, 3);
  const trash = archivedRooms(rooms, { search, archived });

  const renderItem = (room: Room) => (
    <RoomListItem
      key={room.id}
      room={room}
      active={room.id === selectedRoom.id}
      favorite={favorites.has(room.id)}
      archived={archived.has(room.id)}
      onSelect={() => selectRoom(room.id)}
      onToggleFavorite={() => toggleFavorite(room.id)}
      onToggleArchived={() => toggleArchived(room.id)}
    />
  );

  const nothing = staffRooms.length + customerRooms.length + trash.length === 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {staffRooms.length > 0 && (
        <RoomSection title="직원 채팅" count={staffRooms.length}>
          {staffRooms.map(renderItem)}
        </RoomSection>
      )}
      {customerRooms.length > 0 && (
        <RoomSection title="고객 채팅방" count={customerRooms.length}>
          {customerRooms.map(renderItem)}
        </RoomSection>
      )}
      {recent.length > 0 && <RoomSection title="최근 대화방">{recent.map(renderItem)}</RoomSection>}
      {trash.length > 0 && (
        <RoomSection title="휴지통" count={trash.length}>
          {trash.map(renderItem)}
        </RoomSection>
      )}
      {nothing && <div className="px-3 py-6 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>}
    </div>
  );
}
