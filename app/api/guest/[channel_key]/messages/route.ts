// Phase 1G.4/1H.3/1H.5/1H.7 — guest message + channel-language API (one route, additive).
//   GET ?meta=1 → { ok, preferred_language, language_source }
//   GET         → { ok, messages, preferred_language, language_source }  (session-scoped internally)
//   POST        → send a message into the ACTIVE session (guest: LLM detect+translate→ko; staff: ko→preferred)
//   PUT { preferred_language } → set the GUEST SESSION's language (Phase 1H.7; not the channel)
//
// Phase 1H.7 — messages are session-scoped. Guest uses its afg_sid cookie's session; staff
// uses the channel's active session (?as=staff). A closed guest session → empty (GET) / 409
// (POST). Response shape is UNCHANGED. No PIN/auth yet.

import { NextRequest, NextResponse } from 'next/server';

import {
  appendMessage,
  getActiveSession,
  getSessionById,
  listMessagesBySession,
  setGuestSessionLanguage,
  type GuestSession,
} from '@/lib/guest-spike/store';
import { detectAndTranslateToKorean, openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { isGuestLang, resolveOriginalLang, type GuestLang } from '@/lib/guest-spike/languages';
import { channelCookieName } from '@/lib/guest-spike/sessionCookie';
import { requireStaff } from '@/lib/guest-spike/staffAuth';
import type { CustomerLang } from '@/lib/customer-service/translationLangs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

type Resolved =
  | { ok: true; session: GuestSession | null } // session may be null (staff with no active)
  | { ok: false; kind: 'unauthorized' | 'closed' | 'occupied' };

/**
 * Resolve which session this request operates on.
 *  - staff (?as=staff): REQUIRES a valid staff Bearer session → the channel's active session.
 *  - guest: ONLY its own per-channel cookie session (open). NO active-session fallback — a
 *    cookieless guest can never read the current session; an active session → 'occupied'.
 */
async function resolveSession(req: NextRequest, channelKey: string): Promise<Resolved> {
  if (req.nextUrl.searchParams.get('as') === 'staff') {
    const staff = await requireStaff(req);
    if (!staff) return { ok: false, kind: 'unauthorized' };
    return { ok: true, session: await getActiveSession(channelKey) };
  }
  const sid = req.cookies.get(channelCookieName(channelKey))?.value;
  if (sid) {
    const s = await getSessionById(sid);
    if (s && s.channel_key === channelKey) {
      if (s.status === 'open') return { ok: true, session: s };
      return { ok: false, kind: 'closed' };
    }
  }
  // No valid channel cookie: block reading/joining any active session.
  const active = await getActiveSession(channelKey);
  return active ? { ok: false, kind: 'occupied' } : { ok: true, session: null };
}

// Phase 1H.7 — language is a SESSION property now. The preferred language for translation and
// display comes ONLY from the resolved session (never the channel), so a stale channel value can
// never leak into an active chat. No session (cookieless guest / no active) → no language.
function sessionLanguage(session: GuestSession | null): { preferred: GuestLang | null; source: string | null } {
  const preferred = session && isGuestLang(session.language_code) ? session.language_code : null;
  return { preferred, source: session?.language_source ?? null };
}

export async function GET(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  const meta = req.nextUrl.searchParams.get('meta') === '1';
  // Phase 1H.7 — staff-resolved responses carry session_status so the staff UI can tell
  // "guest present, no language yet" (open) from "no active guest" (none). Derived ONLY from
  // getActiveSession (open sessions); closed sessions are never read/reflected. Guest responses
  // do NOT include it (not needed on the guest side).
  const isStaff = req.nextUrl.searchParams.get('as') === 'staff';
  try {
    // The language comes from the RESOLVED session (guest cookie or staff active) — not the channel.
    const r = await resolveSession(req, channelKey);
    if (!r.ok) {
      if (r.kind === 'unauthorized') return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      // closed / occupied → no active session → no messages, no language (response shape preserved).
      return meta
        ? NextResponse.json({ ok: true, preferred_language: null, language_source: null })
        : NextResponse.json({ ok: true, messages: [], preferred_language: null, language_source: null });
    }
    const { preferred, source } = sessionLanguage(r.session);
    const staffState = isStaff ? { session_status: (r.session ? 'open' : 'none') as 'open' | 'none' } : {};
    if (meta) return NextResponse.json({ ok: true, ...staffState, preferred_language: preferred, language_source: source });
    const messages = r.session ? await listMessagesBySession(r.session.id) : [];
    return NextResponse.json({ ok: true, ...staffState, messages, preferred_language: preferred, language_source: source });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  let body: { text?: unknown; sender?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }
  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ ok: false, error: 'EMPTY' }, { status: 400 });
  const sender: 'guest' | 'staff' = body.sender === 'staff' ? 'staff' : 'guest';

  let session: GuestSession;
  try {
    const r = await resolveSession(req, channelKey);
    if (!r.ok) {
      if (r.kind === 'unauthorized') return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (r.kind === 'closed') return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 });
      return NextResponse.json({ ok: false, error: 'SESSION_OCCUPIED' }, { status: 409 });
    }
    if (!r.session) return NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 });
    session = r.session;
  } catch (e) {
    return dbError(e);
  }

  // Translation language comes from THIS session (staff → active session; guest → own session).
  const { preferred } = sessionLanguage(session);

  let originalLang: string;
  const translated: Record<string, string> = {};

  if (sender === 'guest') {
    const { detected, ko } = await detectAndTranslateToKorean(text);
    const resolved = resolveOriginalLang({ llmDetected: detected, text, preferred });
    originalLang = resolved.lang;
    if (resolved.usedFallback) console.warn('[GUEST_LANGUAGE_DETECTION_FALLBACK]', { channelKey, preferredLanguage: preferred, reason: 'llm_and_heuristic_null' });
    if (ko) translated.ko = ko;
    else console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: 'ko', reason: 'no_ko_result' });
  } else {
    if (!preferred) return NextResponse.json({ ok: false, error: 'LANGUAGE_NOT_SELECTED' }, { status: 409 });
    originalLang = 'ko';
    const to = preferred;
    if (to === 'ko') translated[to] = text;
    else {
      try {
        const out = await openAiCustomerTranslator.translate(text, 'ko' as CustomerLang, to as CustomerLang);
        if (out) translated[to] = out;
        else console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: to, reason: 'empty_result' });
      } catch (e) {
        console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: to, errorName: e instanceof Error ? e.name : 'unknown', errorMessage: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  try {
    const message = await appendMessage({ channelKey, sessionId: session.id, sender, original: text, original_lang: originalLang, translated });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  let body: { preferred_language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }
  if (!isGuestLang(body.preferred_language)) {
    return NextResponse.json({ ok: false, error: 'INVALID_LANGUAGE' }, { status: 400 });
  }
  const lang = body.preferred_language;
  try {
    // The guest sets the language on their OWN session (resolved from the cookie), never the
    // channel. Requires a valid channel cookie + OPEN session; closed/occupied/cookieless → 409.
    const r = await resolveSession(req, channelKey);
    if (!r.ok) {
      if (r.kind === 'unauthorized') return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (r.kind === 'closed') return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 });
      return NextResponse.json({ ok: false, error: 'SESSION_OCCUPIED' }, { status: 409 });
    }
    if (!r.session) return NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 });
    const updated = await setGuestSessionLanguage(r.session.id, lang, 'user_selected');
    if (!updated) return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 }); // raced to closed
    return NextResponse.json({ ok: true, preferred_language: updated.language_code, language_source: updated.language_source });
  } catch (e) {
    return dbError(e);
  }
}
