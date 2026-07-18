'use client';

// Phase 1C — shared Room Navigation state (DEV/PoC). Provider wraps the ops-console
// body when the flag is ON; the left <RoomNavigation/> and center <RoomCenter/> both
// consume it. Because the provider only mounts while enabled, turning the flag off
// unmounts it and discards selection — so selectedRoom always returns to '직원 전체'
// on re-enable (Phase 1C.5), with no reset effect needed.
//
// All state here is local/mock: no DB writes, no localStorage, no cross-refresh
// persistence. Exactly one room ('staff-global') is backed by real data downstream.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';
import {
  MOCK_CUSTOMER_MESSAGES,
  MOCK_ROOMS,
  STAFF_GLOBAL_ROOM,
} from '@/lib/rooms/roomsMock';
import {
  STAFF_GLOBAL_ROOM_ID,
  type Room,
  type RoomTab,
  type RoomTeam,
} from '@/lib/rooms/roomTypes';

let createdSeq = 0;

interface RoomNavigationValue {
  rooms: Room[];
  selectedRoom: Room;
  search: string;
  tab: RoomTab;
  favorites: ReadonlySet<string>;
  archived: ReadonlySet<string>;
  customerMessages: Record<string, MockMessage[]>;
  setSearch: (v: string) => void;
  setTab: (t: RoomTab) => void;
  selectRoom: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleArchived: (id: string) => void;
  createRoom: (input: { title: string; team: RoomTeam }) => void;
  appendCustomerMessage: (roomId: string, m: MockMessage) => void;
}

const RoomNavigationContext = createContext<RoomNavigationValue | null>(null);

export function RoomNavigationProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(() => MOCK_ROOMS.map((r) => ({ ...r })));
  const [selectedRoomId, setSelectedRoomId] = useState<string>(STAFF_GLOBAL_ROOM_ID);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<RoomTab>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [customerMessages, setCustomerMessages] = useState<Record<string, MockMessage[]>>(() =>
    JSON.parse(JSON.stringify(MOCK_CUSTOMER_MESSAGES)),
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? STAFF_GLOBAL_ROOM,
    [rooms, selectedRoomId],
  );

  const selectRoom = useCallback((id: string) => {
    const now = new Date().toISOString();
    setSelectedRoomId(id);
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, unread: 0, lastActiveAt: now } : r)));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleArchived = useCallback((id: string) => {
    // The real staff room can never be trashed.
    if (id === STAFF_GLOBAL_ROOM_ID) return;
    setArchived((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Archiving the open room → fall back to the real staff room.
    setSelectedRoomId((cur) => (cur === id && !archived.has(id) ? STAFF_GLOBAL_ROOM_ID : cur));
  }, [archived]);

  const createRoom = useCallback((input: { title: string; team: RoomTeam }) => {
    createdSeq += 1;
    const id = `room-created-${createdSeq}`;
    const now = new Date().toISOString();
    const room: Room = {
      id,
      kind: 'staff-mock',
      title: input.title.trim() || `새 방 ${createdSeq}`,
      team: input.team,
      isMine: true,
      isDev: true,
      lastActiveAt: now,
    };
    setRooms((prev) => [...prev, room]);
    setSelectedRoomId(id);
  }, []);

  const appendCustomerMessage = useCallback((roomId: string, m: MockMessage) => {
    setCustomerMessages((prev) => ({ ...prev, [roomId]: [...(prev[roomId] ?? []), m] }));
  }, []);

  const value = useMemo<RoomNavigationValue>(
    () => ({
      rooms,
      selectedRoom,
      search,
      tab,
      favorites,
      archived,
      customerMessages,
      setSearch,
      setTab,
      selectRoom,
      toggleFavorite,
      toggleArchived,
      createRoom,
      appendCustomerMessage,
    }),
    [
      rooms,
      selectedRoom,
      search,
      tab,
      favorites,
      archived,
      customerMessages,
      selectRoom,
      toggleFavorite,
      toggleArchived,
      createRoom,
      appendCustomerMessage,
    ],
  );

  return <RoomNavigationContext.Provider value={value}>{children}</RoomNavigationContext.Provider>;
}

export function useRoomNavigation(): RoomNavigationValue {
  const ctx = useContext(RoomNavigationContext);
  if (!ctx) throw new Error('useRoomNavigation must be used within RoomNavigationProvider');
  return ctx;
}
