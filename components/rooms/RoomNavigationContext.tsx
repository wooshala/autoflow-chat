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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';
import type { RoomChannelLanguages, RoomChannelSessionStatus } from '@/lib/guest-spike/useChannelLanguages';
import { useGuestChannelSummaries } from '@/lib/guest-spike/useGuestChannelSummaries';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { canShowBrowserNotification, showBrowserNotification } from '@/lib/chat/browserNotifications';
import { playNotificationTone } from '@/lib/chat/playNotificationTone';
import { normalizeNotifyBody } from '@/lib/chat/normalizeNotifyBody';
import { GUEST_NOTIFY_TITLE, shouldNotifyGuestMessage } from '@/lib/guest-spike/guestNotify';
import { isGuestChannelUnread } from '@/lib/guest-spike/guestChannelUnread';
import {
  mergeLastViewed,
  readGuestRoomLastViewed,
  writeGuestRoomLastViewed,
  type GuestRoomLastViewedMap,
} from '@/lib/guest-spike/guestRoomLastViewed';
import { isGuestLang, type GuestLang } from '@/lib/guest-spike/languages';
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
  /** Phase 1H.5 — live guest-selected language per channel-mapped customer room (roomId → lang|null). */
  channelLanguages: RoomChannelLanguages;
  /** Phase 1H.7 — active-session state per room (roomId → 'open'|'none'|null). Lets the UI tell
   *  "guest present, no language" from "no active guest". */
  channelSessionStatus: RoomChannelSessionStatus;
  /** Phase 1H.5/1H.7 — the open room reports its language + session_status (from its own poll). */
  reportChannelLanguage: (roomId: string, lang: GuestLang | null, sessionStatus: 'open' | 'none' | null) => void;
  /** Phase 1H.11 — per-browser unread (roomId → boolean) for channel-mapped customer rooms. */
  channelUnread: Record<string, boolean>;
  /** Phase 1H.12 — latest guest message time per room (roomId → ISO|null) for unread-group sort. */
  channelLatestGuestAt: Record<string, string | null>;
  /** Phase 2A.3 — active guest session id per room (roomId → session_id|null), from the SAME
   *  /channels/summary poll. Lets the Customer Information panel re-fetch when a NEW guest session
   *  appears (the previous one closed) without an F5 or room re-select. Stable within a session
   *  (does NOT change per message), so an in-progress edit is not disrupted by chat traffic. */
  channelActiveSessionId: Record<string, string | null>;
  /** Phase 1H.11 — mark a channel read up to its latest guest message (called when the open
   *  room's messages load). Monotonic + persisted to localStorage. */
  markChannelViewed: (channelKey: string, latestGuestMessageAt: string | null) => void;
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

  // Phase 1H.11 — ONE /channels/summary poll for the whole nav (replaces the per-room language
  // meta fan-out). Language + session_status per room derive from the open-session summary; the
  // OPEN room additionally reports from its own message poll (reportChannelLanguage), which wins
  // because it is the most up-to-date.
  const summaryByChannel = useGuestChannelSummaries();
  const [reportedLanguages, setReportedLanguages] = useState<RoomChannelLanguages>({});
  const [reportedSessionStatus, setReportedSessionStatus] = useState<RoomChannelSessionStatus>({});
  const reportChannelLanguage = useCallback(
    (roomId: string, lang: GuestLang | null, sessionStatus: 'open' | 'none' | null) => {
      setReportedLanguages((prev) => (prev[roomId] === lang ? prev : { ...prev, [roomId]: lang }));
      setReportedSessionStatus((prev) => (prev[roomId] === sessionStatus ? prev : { ...prev, [roomId]: sessionStatus }));
    },
    [],
  );

  const summaryLanguages = useMemo<RoomChannelLanguages>(() => {
    const out: RoomChannelLanguages = {};
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue;
      const lang = summaryByChannel[ck]?.language_code ?? null;
      out[r.id] = isGuestLang(lang) ? lang : null; // language is session-owned; absent channel → null
    }
    return out;
  }, [rooms, summaryByChannel]);
  const summarySessionStatus = useMemo<RoomChannelSessionStatus>(() => {
    const out: RoomChannelSessionStatus = {};
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue;
      out[r.id] = summaryByChannel[ck] ? 'open' : 'none'; // summary only lists OPEN channels
    }
    return out;
  }, [rooms, summaryByChannel]);

  const channelLanguages = useMemo<RoomChannelLanguages>(
    () => ({ ...summaryLanguages, ...reportedLanguages }),
    [summaryLanguages, reportedLanguages],
  );
  const channelSessionStatus = useMemo<RoomChannelSessionStatus>(
    () => ({ ...summarySessionStatus, ...reportedSessionStatus }),
    [summarySessionStatus, reportedSessionStatus],
  );

  // Phase 1H.11 — per-browser unread. lastViewed[channel_key] advances (monotonically) when the
  // OPEN room's messages load (markChannelViewed). Unread = a newer GUEST message exists and the
  // room is not the one currently open.
  const [lastViewed, setLastViewed] = useState<GuestRoomLastViewedMap>({});
  useEffect(() => {
    setLastViewed(readGuestRoomLastViewed());
  }, []);
  const markChannelViewed = useCallback((channelKey: string, latestGuestMessageAt: string | null) => {
    setLastViewed((prev) => {
      const next = mergeLastViewed(prev, channelKey, latestGuestMessageAt);
      if (next !== prev) writeGuestRoomLastViewed(next);
      return next;
    });
  }, []);
  const channelUnread = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue;
      out[r.id] = isGuestChannelUnread({
        latestGuestMessageAt: summaryByChannel[ck]?.latest_guest_message_at ?? null,
        lastViewedAt: lastViewed[ck] ?? null,
        isSelected: r.id === selectedRoomId,
      });
    }
    return out;
  }, [rooms, summaryByChannel, lastViewed, selectedRoomId]);
  // Phase 1H.12 — latest guest message time per room (from the SAME summary) so the "안읽은 대화"
  // group can sort newest-first. No extra request.
  const channelLatestGuestAt = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue;
      out[r.id] = summaryByChannel[ck]?.latest_guest_message_at ?? null;
    }
    return out;
  }, [rooms, summaryByChannel]);
  // Phase 2A.3 — active session id per room (from the SAME summary). Changes only when the open
  // session identity changes (A closed → B opened), never per message → a safe re-fetch trigger.
  const channelActiveSessionId = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue;
      out[r.id] = summaryByChannel[ck]?.session_id ?? null;
    }
    return out;
  }, [rooms, summaryByChannel]);

  const selectRoom = useCallback((id: string) => {
    const now = new Date().toISOString();
    setSelectedRoomId(id);
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, unread: 0, lastActiveAt: now } : r)));
  }, []);

  // Phase 2D — Windows notification for a NEW guest message, driven off the SAME summary poll
  // (no new poll / realtime / DB). Reuses the staff notification primitives verbatim
  // (playNotificationTone + showBrowserNotification + normalizeNotifyBody). This provider mounts
  // only in room-navigation mode, i.e. exactly where guest chat is worked, so no extra gating is
  // needed. Known limit (accepted): the summary carries only the latest guest message per channel,
  // so a burst inside one 5s interval notifies only the last one.
  const notifySeenRef = useRef<Map<string, string>>(new Map()); // roomId → last handled guest msg id
  const notifySeededRef = useRef(false);
  useEffect(() => {
    // Seed a baseline on the first summary so pre-existing messages never notify (behavior 2).
    if (!notifySeededRef.current) {
      for (const r of rooms) {
        const ck = lookupChannelKey(r.id);
        const id = ck ? summaryByChannel[ck]?.latest_guest_message_id ?? null : null;
        if (id) notifySeenRef.current.set(r.id, id);
      }
      notifySeededRef.current = true;
      return;
    }
    const focused =
      typeof document === 'undefined' || typeof document.hasFocus !== 'function' ? false : document.hasFocus();
    const isBackground = !focused;
    for (const r of rooms) {
      const ck = lookupChannelKey(r.id);
      if (!ck) continue; // channel-mapped customer rooms only
      const latestId = summaryByChannel[ck]?.latest_guest_message_id ?? null;
      const seenId = notifySeenRef.current.get(r.id) ?? null;
      const isNew = Boolean(latestId) && latestId !== seenId;
      if (latestId) notifySeenRef.current.set(r.id, latestId); // dedup: mark handled (behavior 3)
      // Sound fires for every NEW guest message even while the staff is viewing that room
      // (operations requirement). The OS notification below stays background-only.
      if (!shouldNotifyGuestMessage({ latestId, isNew, seeded: true })) continue;

      const roomNo = ck.replace(/^room-/, '') || null;
      const preview = summaryByChannel[ck]?.latest_guest_message_preview || '새 메시지가 도착했습니다';
      void playNotificationTone('info', { allowHidden: isBackground });
      if (isBackground && canShowBrowserNotification()) {
        void showBrowserNotification({
          title: GUEST_NOTIFY_TITLE,
          body: normalizeNotifyBody(roomNo, preview),
          silent: true, // AutoFlow plays its own tone above — same policy as staff notifications
          messageId: latestId ?? undefined,
          source: 'guest_message_os',
          onClick: () => selectRoom(r.id), // click → open the room (behavior 5)
        });
      }
    }
  }, [summaryByChannel, rooms, selectRoom]);

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
      channelLanguages,
      channelSessionStatus,
      reportChannelLanguage,
      channelUnread,
      channelLatestGuestAt,
      channelActiveSessionId,
      markChannelViewed,
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
      channelLanguages,
      channelSessionStatus,
      reportChannelLanguage,
      channelUnread,
      channelLatestGuestAt,
      channelActiveSessionId,
      markChannelViewed,
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
