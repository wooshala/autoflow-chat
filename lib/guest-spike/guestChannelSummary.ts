// Phase 1H.11 — PURE transform: (open sessions + their messages) → per-channel summary for the
// staff Room Navigation. Import-free so it is unit-testable. Only the CURRENT open session is
// summarized (language + latest message are scoped to that session), so a previous guest's
// closed-session history can never resurface as language or unread. Channels with no open
// session are simply absent (the client treats them as no-language / not-unread).

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
};

/** guest_chat_sessions row (status='open' only), minimal columns. */
export interface OpenSessionRow {
  id: string;
  channel_key: string;
  language_code: string | null;
  language_source: string | null;
}

/** guest_chat_messages row, minimal columns (NO body — summary never returns message text). */
export interface SummaryMessageRow {
  id: string;
  session_id: string;
  sender: string; // 'guest' | 'staff'
  created_at: string; // ISO 8601 (lexicographically ordered)
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
    let latest: SummaryMessageRow | null = null;
    let latestGuest: SummaryMessageRow | null = null;
    for (const m of bySession.get(s.id) ?? []) {
      if (!latest || m.created_at > latest.created_at) latest = m;
      if (m.sender === 'guest' && (!latestGuest || m.created_at > latestGuest.created_at)) latestGuest = m;
    }
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
    };
  });
}
