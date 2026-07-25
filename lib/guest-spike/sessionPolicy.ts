// Phase 1H.7 — pure guest-session claim state machine (no DB/crypto), unit-testable.
// The route computes the inputs (cookie session + whether an active session exists) and
// this function decides the outcome. NO PIN: the FIRST browser claims the room; a second
// cookieless browser is 'occupied' (never auto-joins the current guest's session).
//
// Closed-cookie re-entry: a cookie that points at a CLOSED session is NOT ownership of the
// room. If the channel is idle → create a new session (Set-Cookie overwrites the stale id).
// If another guest already holds an OPEN session → occupied (never join that session).

export type SessionOutcome =
  | { kind: 'reconnect' } // valid cookie for THIS channel, session open → same session
  | { kind: 'closed' } //     retained for exhaustiveness; claim path no longer returns this
  | { kind: 'occupied' } //   no open-session ownership here, but an active session exists → blocked
  | { kind: 'create' }; //    channel idle → new session + claim (cookie Set-Cookie)

export function decideSessionOutcome(input: {
  /** The session named by THIS channel's cookie, or null (missing / other channel / not found). */
  cookieSession: { channelMatches: boolean; status: 'open' | 'closed' } | null;
  hasActiveSession: boolean;
}): SessionOutcome {
  const cs = input.cookieSession;
  // Only an OPEN session cookie for THIS channel is ownership → reconnect.
  if (cs && cs.channelMatches && cs.status === 'open') {
    return { kind: 'reconnect' };
  }
  // Missing / wrong-channel / unknown / CLOSED cookie: never auto-join an existing open session.
  // Closed cookie + idle channel → create (QR must be reusable after staff end).
  return input.hasActiveSession ? { kind: 'occupied' } : { kind: 'create' };
}

// ── guest entry phase (Phase 1H.7 language-on-session fix) ────────────────────────────────
// Decides the FIRST screen the guest sees, from the SESSION response alone (no channel meta).
// Language now lives on the session, so a fresh session (language_code = NULL) ALWAYS shows the
// selection screen, and a stale channel language can never skip it. Only a reconnecting guest
// whose OWN open session already has a language goes straight to chatting.
export type GuestEntryPhase = 'closed' | 'occupied' | 'selecting' | 'chatting';

const SUPPORTED = new Set(['ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es']);

export function decideGuestEntryPhase(session: {
  status: 'open' | 'closed' | 'occupied';
  languageCode: string | null;
}): GuestEntryPhase {
  if (session.status === 'closed') return 'closed';
  if (session.status === 'occupied') return 'occupied';
  // open: chat only if THIS session already has a valid language; otherwise select.
  return session.languageCode && SUPPORTED.has(session.languageCode) ? 'chatting' : 'selecting';
}
