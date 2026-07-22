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
  /** Phase 2D — latest GUEST message id + short staff-facing preview (Korean translation preferred,
   *  else original). Lets the EXISTING summary poll drive a Windows notification. Only the latest
   *  guest message's preview is exposed (not history). */
  latest_guest_message_id: string | null;
  latest_guest_message_preview: string | null;
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
}

const PREVIEW_MAX = 60;

/** Staff-facing preview of a guest message: Korean translation if present, else the original. */
function guestPreview(m: SummaryMessageRow): string {
  const ko = m.translated_json?.ko;
  const text = ((ko && ko.trim()) || (m.original_text ?? '').trim()).replace(/\s+/g, ' ');
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
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
      latest_guest_message_id: latestGuest?.id ?? null,
      latest_guest_message_preview: latestGuest ? guestPreview(latestGuest) : null,
    };
  });
}
