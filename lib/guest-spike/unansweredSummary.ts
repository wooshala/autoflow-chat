// Phase 2D — PURE transform: (open sessions + their messages) → per-room UNANSWERED summary
// for the ledger (univer-ops) banner. Import-free so it is unit-testable.
//
// unanswered := within an OPEN session, the newest guest message is newer than the newest
// staff message (or there is no staff message at all).
//
// NO MESSAGE BODIES. This feed carries only room / session / counts / timestamps. Guest text
// (and its translations) never leaves through this API — see guestChannelSummary.ts if a
// staff-facing preview is needed instead.

import { roomNumberFromChannelKey } from './roomAllowlist';

export type GuestChatUnansweredRoom = {
  roomNumber: string;
  channelKey: string;
  conversationId: string;

  /** Guest messages after the last staff reply (all guest messages if staff never replied). */
  guestMessageCount: number;

  firstUnansweredAt: string;
  latestGuestMessageAt: string;
  latestStaffMessageAt: string | null;
  sessionStartedAt: string;

  sessionStatus: 'open';
  unanswered: true;
};

export type GuestChatUnansweredSummaryResponse = {
  rooms: GuestChatUnansweredRoom[];
  totalRooms: number;
  totalMessages: number;
  generatedAt: string;
};

/** guest_chat_sessions row (status='open' only), minimal columns. */
export interface UnansweredSessionRow {
  id: string;
  channel_key: string;
  started_at: string;
}

/** guest_chat_messages row, minimal columns. Text is deliberately absent. */
export interface UnansweredMessageRow {
  id: string;
  session_id: string | null;
  sender: string; // 'guest' | 'staff'
  created_at: string; // ISO 8601 — lexicographic order matches chronological order
}

/**
 * Fold open sessions + their messages into the unanswered rooms feed.
 *
 * Excluded: closed sessions (caller passes open only), sessions whose channel is not a real
 * room, sessions with no guest message, sessions whose newest message is from staff, and
 * legacy messages with a null session_id (they cannot belong to an open session).
 *
 * Ties: when a guest and a staff message share `created_at`, the staff reply wins (treated as
 * answered) — the conservative choice, since a false "unanswered" nags staff about a room they
 * already handled.
 */
export function buildUnansweredSummary(
  openSessions: readonly UnansweredSessionRow[],
  messages: readonly UnansweredMessageRow[],
  generatedAt: string,
): GuestChatUnansweredSummaryResponse {
  const bySession = new Map<string, UnansweredMessageRow[]>();
  for (const m of messages) {
    if (!m.session_id) continue; // legacy row: not part of any open session
    const arr = bySession.get(m.session_id);
    if (arr) arr.push(m);
    else bySession.set(m.session_id, [m]);
  }

  const rooms: GuestChatUnansweredRoom[] = [];

  for (const s of openSessions) {
    const roomNumber = roomNumberFromChannelKey(s.channel_key);
    if (!roomNumber) continue; // test channel or unknown room

    let latestGuestAt: string | null = null;
    let latestStaffAt: string | null = null;
    for (const m of bySession.get(s.id) ?? []) {
      if (m.sender === 'guest') {
        if (!latestGuestAt || m.created_at > latestGuestAt) latestGuestAt = m.created_at;
      } else if (m.sender === 'staff') {
        if (!latestStaffAt || m.created_at > latestStaffAt) latestStaffAt = m.created_at;
      }
    }

    if (!latestGuestAt) continue; // no guest message
    // Tie → answered (staff wins), hence `<=` rather than `<`.
    if (latestStaffAt && latestGuestAt <= latestStaffAt) continue;

    const pending = (bySession.get(s.id) ?? []).filter(
      (m) => m.sender === 'guest' && (!latestStaffAt || m.created_at > latestStaffAt),
    );
    if (pending.length === 0) continue; // defensive: cannot happen given the checks above

    let firstUnansweredAt = pending[0]!.created_at;
    for (const m of pending) if (m.created_at < firstUnansweredAt) firstUnansweredAt = m.created_at;

    rooms.push({
      roomNumber,
      channelKey: s.channel_key,
      conversationId: s.id,
      guestMessageCount: pending.length,
      firstUnansweredAt,
      latestGuestMessageAt: latestGuestAt,
      latestStaffMessageAt: latestStaffAt,
      sessionStartedAt: s.started_at,
      sessionStatus: 'open',
      unanswered: true,
    });
  }

  // Oldest unanswered first; ties broken by room number so the order is stable.
  rooms.sort(
    (a, b) =>
      a.firstUnansweredAt.localeCompare(b.firstUnansweredAt) ||
      a.roomNumber.localeCompare(b.roomNumber),
  );

  return {
    rooms,
    totalRooms: rooms.length,
    totalMessages: rooms.reduce((n, r) => n + r.guestMessageCount, 0),
    generatedAt,
  };
}
