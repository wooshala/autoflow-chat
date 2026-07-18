'use client';

// Phase 1C.1 — shared Room Navigation state (DEV/PoC). Provider wraps the ops-console
// body when the flag is ON; the left <RoomNavigation/> and center <RoomCenter/> both
// consume it. Because the provider only mounts while enabled, turning the flag off
// unmounts it and discards selection — so selectedRoom always returns to 운영 채팅 on
// re-enable (Phase 1C.5), with no reset effect needed.
//
// Per-user state (favorites / hidden / membership / section collapse) is modeled
// separately from the shared Room definition (Q2=A). It lives in provider local state
// only: no DB writes, no localStorage, no cross-refresh persistence.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';
import { MOCK_CUSTOMER_MESSAGES, MOCK_MEMBERSHIP, MOCK_ROOMS, OPERATIONS_ROOM } from '@/lib/rooms/roomsMock';
import {
  OPERATIONS_ROOM_ID,
  type Room,
  type RoomColorToken,
  type RoomSectionId,
  type RoomTab,
  type RoomTeam,
  type SectionCollapseState,
} from '@/lib/rooms/roomTypes';

let createdSeq = 0;

const TEAM_ICON: Record<RoomTeam, string> = {
  general: '💬',
  cleaning: '🧹',
  maintenance: '🛠',
  front: '👨‍💼',
};
const TEAM_COLOR: Partial<Record<RoomTeam, RoomColorToken>> = {
  cleaning: 'housekeeping',
  maintenance: 'maintenance',
  front: 'front',
};

interface RoomNavigationValue {
  rooms: Room[];
  selectedRoom: Room;
  search: string;
  tab: RoomTab;
  favorites: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
  membership: ReadonlySet<string>;
  sectionCollapse: SectionCollapseState;
  customerMessages: Record<string, MockMessage[]>;
  setSearch: (v: string) => void;
  setTab: (t: RoomTab) => void;
  selectRoom: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleHidden: (id: string) => void;
  toggleSectionCollapse: (id: RoomSectionId) => void;
  createRoom: (input: { title: string; team: RoomTeam }) => void;
  appendCustomerMessage: (roomId: string, m: MockMessage) => void;
}

const RoomNavigationContext = createContext<RoomNavigationValue | null>(null);

export function RoomNavigationProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(() => MOCK_ROOMS.map((r) => ({ ...r })));
  const [selectedRoomId, setSelectedRoomId] = useState<string>(OPERATIONS_ROOM_ID);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<RoomTab>('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [membership, setMembershipState] = useState<Set<string>>(() => new Set(MOCK_MEMBERSHIP));
  const [sectionCollapse, setSectionCollapse] = useState<SectionCollapseState>({});
  const [customerMessages, setCustomerMessages] = useState<Record<string, MockMessage[]>>(() =>
    JSON.parse(JSON.stringify(MOCK_CUSTOMER_MESSAGES)),
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? OPERATIONS_ROOM,
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

  const toggleHidden = useCallback((id: string) => {
    // The live operations room can never be hidden from the list.
    if (id === OPERATIONS_ROOM_ID) return;
    setHidden((prev) => {
      const next = new Set(prev);
      const wasHidden = next.has(id);
      wasHidden ? next.delete(id) : next.add(id);
      if (!wasHidden) setSelectedRoomId((cur) => (cur === id ? OPERATIONS_ROOM_ID : cur));
      return next;
    });
  }, []);

  const toggleSectionCollapse = useCallback((id: RoomSectionId) => {
    setSectionCollapse((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const createRoom = useCallback((input: { title: string; team: RoomTeam }) => {
    createdSeq += 1;
    const id = `room-created-${createdSeq}`;
    const now = new Date().toISOString();
    const room: Room = {
      id,
      category: 'team',
      dataBinding: 'mock',
      title: input.title.trim() || `새 방 ${createdSeq}`,
      icon: TEAM_ICON[input.team],
      colorToken: TEAM_COLOR[input.team],
      defaultOrder: 100 + createdSeq,
      team: input.team,
      status: 'active',
      lastActiveAt: now,
    };
    setRooms((prev) => [...prev, room]);
    // a room I create is one I'm a member of ("내 대화방").
    setMembershipState((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
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
      hidden,
      membership,
      sectionCollapse,
      customerMessages,
      setSearch,
      setTab,
      selectRoom,
      toggleFavorite,
      toggleHidden,
      toggleSectionCollapse,
      createRoom,
      appendCustomerMessage,
    }),
    [
      rooms,
      selectedRoom,
      search,
      tab,
      favorites,
      hidden,
      membership,
      sectionCollapse,
      customerMessages,
      selectRoom,
      toggleFavorite,
      toggleHidden,
      toggleSectionCollapse,
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
