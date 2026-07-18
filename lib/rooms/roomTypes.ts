// Phase 1C — Room Navigation entity model (DEV/PoC).
//
// A Room is an INDEPENDENT entity, not derived from messages. Exactly ONE room is
// backed by real data (kind 'staff-global' → the existing staff chat stream). Every
// other room is DEV/PoC mock (isDev=true) and never writes to any DB. This shape is
// intentionally close to a future `chat_rooms` / `customer_conversations` row so it
// can be wired to real backing later without a UI rewrite.

import type { CustomerLang } from '@/lib/customer-service/translationLangs';

export type RoomKind = 'staff-global' | 'staff-mock' | 'customer';

export type RoomTeam = 'general' | 'cleaning' | 'maintenance' | 'front';

/** Left-nav grouping. 'recent' is a small secondary section (§10). */
export type RoomSectionKey = 'staff' | 'customer' | 'recent';

export type RoomTab = 'all' | 'mine' | 'favorites';

export interface Room {
  id: string;
  kind: RoomKind;
  title: string;
  /** Team tag for staff rooms; also set on rooms created via the "새 채팅방" modal. */
  team?: RoomTeam;
  /** Customer rooms carry a room number + guest language (language name is shown). */
  room_no?: string;
  language?: CustomerLang;
  /** Mock "내 대화방" filter flag. */
  isMine?: boolean;
  unread?: number;
  /** true = DEV/PoC mock room with NO real backing. Only 'staff-global' is real. */
  isDev?: boolean;
  /** ISO timestamp used only to order the small "최근 대화방" section. */
  lastActiveAt?: string;
}

/** The single real, data-backed room. Its id is stable so page/provider agree. */
export const STAFF_GLOBAL_ROOM_ID = 'staff-global';

export const TEAM_LABEL: Record<RoomTeam, string> = {
  general: '일반',
  cleaning: '청소',
  maintenance: '정비',
  front: '프런트',
};
