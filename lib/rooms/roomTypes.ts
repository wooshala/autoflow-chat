// Phase 1C.1 — generalized Room entity model (DEV/PoC).
//
// A Room is an INDEPENDENT entity, not derived from messages. Two orthogonal axes
// replace the old `kind`:
//   - category    : what the room IS (operations/team/customer/system/bot/notice)
//   - dataBinding : whether it is backed by real data ('live') or PoC mock ('mock')
// Exactly one room is 'live' today (category 'operations' → the existing staff chat).
//
// Per-user display state (favorite / hidden / manual order / section collapse) is NOT a
// property of the shared room — it is modeled separately (RoomUserPreference /
// SectionCollapseState) so that in a real multi-tenant product one operator's favorites
// never leak to everyone. Only a room's OWN lifecycle (`status`) is shared.

import type { CustomerLang } from '@/lib/customer-service/translationLangs';

export type RoomCategory = 'operations' | 'team' | 'customer' | 'system' | 'bot' | 'notice';

export type RoomDataBinding = 'live' | 'mock';

/** Semantic color token — NOT a Tailwind class or hex, so the design system can change
 *  without touching stored data. Mapped to concrete classes in the UI layer (roomTheme). */
export type RoomColorToken = 'operations' | 'housekeeping' | 'maintenance' | 'front' | 'customer';

export type RoomTeam = 'general' | 'cleaning' | 'maintenance' | 'front';

export type RoomTab = 'all' | 'mine' | 'favorites';

/** Left-nav section ids (collapse target is the SECTION, not an individual room). */
export type RoomSectionId = 'staff' | 'customer' | 'recent' | 'trash';

export type SectionCollapseState = Partial<Record<RoomSectionId, boolean>>;

/** Shared room definition. Same for every user. */
export interface Room {
  id: string;
  category: RoomCategory;
  dataBinding: RoomDataBinding;
  title: string;

  icon?: string;
  colorToken?: RoomColorToken;
  defaultOrder?: number;

  team?: RoomTeam;
  room_no?: string;
  language?: CustomerLang;

  unread?: number;
  lastActiveAt?: string;
  /** Room lifecycle, shared across all users. 'archived' = the room itself is closed. */
  status?: 'active' | 'archived';
}

/** Per-user display preferences. In Phase 1C.1 this lives in provider state only (no DB).
 *  `isHidden` = hide from MY list (distinct from the shared room.status='archived'). */
export interface RoomUserPreference {
  roomId: string;
  isFavorite: boolean;
  isHidden: boolean;
  orderOverride?: number;
}

/** The single real, data-backed room. Selecting it renders the existing staff chat. */
export const OPERATIONS_ROOM_ID = 'operations';

export const TEAM_LABEL: Record<RoomTeam, string> = {
  general: '일반',
  cleaning: '청소',
  maintenance: '정비',
  front: '프런트',
};
