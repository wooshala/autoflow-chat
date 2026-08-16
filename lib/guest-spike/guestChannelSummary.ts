// Phase 1H.11 — PURE transform: (open sessions + their messages) → per-channel summary for the
// staff Room Navigation. Import-free so it is unit-testable. Only the CURRENT open session is
// summarized (language + latest message are scoped to that session), so a previous guest's
// closed-session history can never resurface as language or unread. Channels with no open
// session are simply absent (the client treats them as no-language / not-unread).
//
// Phase GC-Notification — additive unanswered_count / first_unanswered_at match ledger
// buildUnansweredSummary (latest guest > latest staff → count pending guest messages).

export type GuestChannelSummary = {
  channel_key: string;
  session_id: string | null;
  session_status: 'open' | 'closed' | null;
  language_code: string | null;
  language_source: string | null;
  latest_message_id: string | null;
  latest_message_at: string | null;
  latest_sender_type: string | null;
  latest_guest_message_at: string | null;
  /** Phase 2D — latest GUEST message id + short staff-facing preview (Korean translation preferred,
   *  else original). Lets the EXISTING summary poll drive a Windows notification. Only the latest
   *  guest message's preview is exposed (not history). */
  latest_guest_message_id: string | null;
  latest_guest_message_preview: string | null;
  /**
   * Phase GC-Notification — pending guest messages after the latest staff reply in this open
   * session (0 when answered / no guest). Same definition as ledger `guestMessageCount`.
   */
  unanswered_count: number;
  /** ISO of the oldest pending guest message; null when unanswered_count === 0. */
  first_unanswered_at: string | null;
};

/** guest_chat_sessions row (status='open' only), minimal columns. */
export interface OpenSessionRow {
  id: string;
  channel_key: string;
  language_code: string | null;
  language_source: string | null;
}

/** guest_chat_messages row. Phase 2D adds the latest GUEST message's text for the notification body;
 *  staff-message text is never surfaced. */
export interface SummaryMessageRow {
  id: string;
  session_id: string;
  sender: string; // 'guest' | 'staff'
  created_at: string; // ISO 8601 (lexicographically ordered)
  original_text?: string | null;
  translated_json?: Record<string, string> | null;
  /** Soft-deleted rows are excluded from latest / latest-guest / unread / unanswered. */
  is_deleted?: boolean | null;
}

const PREVIEW_MAX = 60;

/** Staff-facing preview of a guest message: Korean translation if present, else the original. */
function guestPreview(m: SummaryMessageRow): string {
  const ko = m.translated_json?.ko;
  const text = ((ko && ko.trim()) || (m.original_text ?? '').trim()).replace(/\s+/g, ' ');
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}

/** Ledger-identical pending fold for one open session's messages. */
export function computeUnansweredForSession(messages: readonly SummaryMessageRow[]): {
  unanswered_count: number;
  first_unanswered_at: string | null;
} {
  const alive = messages.filter((m) => !m.is_deleted);
  let latestGuestAt: string | null = null;
  let latestStaffAt: string | null = null;
  for (const m of alive) {
    if (m.sender === 'guest') {
      if (!latestGuestAt || m.created_at > latestGuestAt) latestGuestAt = m.created_at;
    } else if (m.sender === 'staff') {
      if (!latestStaffAt || m.created_at > latestStaffAt) latestStaffAt = m.created_at;
    }
  }
  if (!latestGuestAt) return { unanswered_count: 0, first_unanswered_at: null };
  // Tie → answered (staff wins), same as buildUnansweredSummary (`<=`).
  if (latestStaffAt && latestGuestAt <= latestStaffAt) {
    return { unanswered_count: 0, first_unanswered_at: null };
  }
  const pending = alive.filter(
    (m) => m.sender === 'guest' && (!latestStaffAt || m.created_at > latestStaffAt),
  );
  if (pending.length === 0) return { unanswered_count: 0, first_unanswered_at: null };
  let first = pending[0]!.created_at;
  for (const m of pending) if (m.created_at < first) first = m.created_at;
  return { unanswered_count: pending.length, first_unanswered_at: first };
}

export function buildChannelSummaries(
  openSessions: readonly OpenSessionRow[],
  messages: readonly SummaryMessageRow[],
): GuestChannelSummary[] {
  const bySession = new Map<string, SummaryMessageRow[]>();
  for (const m of messages) {
    const arr = bySession.get(m.session_id);
    if (arr) arr.push(m);
    else bySession.set(m.session_id, [m]);
  }

  return openSessions.map((s) => {
    const sessionMessages = bySession.get(s.id) ?? [];
    let latest: SummaryMessageRow | null = null;
    let latestGuest: SummaryMessageRow | null = null;
    for (const m of sessionMessages) {
      if (m.is_deleted) continue; // recalculate latest* on alive messages only
      if (!latest || m.created_at > latest.created_at) latest = m;
      if (m.sender === 'guest' && (!latestGuest || m.created_at > latestGuest.created_at)) latestGuest = m;
    }
    const unanswered = computeUnansweredForSession(sessionMessages);
    return {
      channel_key: s.channel_key,
      session_id: s.id,
      session_status: 'open',
      language_code: s.language_code,
      language_source: s.language_source,
      latest_message_id: latest?.id ?? null,
      latest_message_at: latest?.created_at ?? null,
      latest_sender_type: latest?.sender ?? null,
      latest_guest_message_at: latestGuest?.created_at ?? null,
      latest_guest_message_id: latestGuest?.id ?? null,
      latest_guest_message_preview: latestGuest ? guestPreview(latestGuest) : null,
      unanswered_count: unanswered.unanswered_count,
      first_unanswered_at: unanswered.first_unanswered_at,
    };
  });
}
