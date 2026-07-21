// Phase 1H.7 — guest session endpoint. NO PIN: the FIRST browser to scan an idle room
// claims a new session (its id stored in a per-channel HttpOnly cookie). A second cookieless
// browser is 'occupied' — it NEVER receives the current guest's session cookie.
//   GET    → { ok:true, status:'open' }                         (reconnect or fresh claim; sets cookie)
//            { ok:true, status:'closed' }                       (this browser's session was ended)
//            { ok:true, status:'occupied', code:'SESSION_ALREADY_CLAIMED' }  (in use by another browser)
//   DELETE → staff-only ("대화 종료"): close the active session. Requires a valid staff session.
//
// occupied/closed are normal operating states → HTTP 200. Only real faults use 4xx/5xx.

import { NextRequest, NextResponse } from 'next/server';

import { closeActiveSession, createSession, getActiveSession, getSessionById } from '@/lib/guest-spike/store';
import { decideSessionOutcome } from '@/lib/guest-spike/sessionPolicy';
import { channelCookieName, sessionCookieOptions } from '@/lib/guest-spike/sessionCookie';
import { requireStaff } from '@/lib/guest-spike/staffAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  try {
    const cookieName = channelCookieName(channelKey);
    const sid = req.cookies.get(cookieName)?.value;
    const cookieSess = sid ? await getSessionById(sid) : null;
    const active = await getActiveSession(channelKey);

    const outcome = decideSessionOutcome({
      cookieSession: cookieSess ? { channelMatches: cookieSess.channel_key === channelKey, status: cookieSess.status } : null,
      hasActiveSession: Boolean(active),
    });

    switch (outcome.kind) {
      case 'reconnect':
        // Same guest returning: carry THIS session's language so the client can skip selection
        // only when it is already set on the session (never from a stale channel value).
        return NextResponse.json({
          ok: true,
          status: 'open',
          session_id: cookieSess!.id,
          language_code: cookieSess!.language_code,
          language_source: cookieSess!.language_source,
        });
      case 'closed':
        return NextResponse.json({ ok: true, status: 'closed' });
      case 'occupied':
        return NextResponse.json({ ok: true, status: 'occupied', code: 'SESSION_ALREADY_CLAIMED' });
      case 'create': {
        // decideSessionOutcome saw no active session, but a near-simultaneous scan may create
        // one between that read and this insert. The DB one-open-per-channel index is the real
        // arbiter: the loser gets { conflict } → occupied with NO cookie (we never hand it the
        // winner's session). Only a genuine (non-23505) DB error surfaces as 500.
        const result = await createSession(channelKey);
        if ('conflict' in result) {
          return NextResponse.json({ ok: true, status: 'occupied', code: 'SESSION_ALREADY_CLAIMED' });
        }
        // Fresh session: language starts NULL → the client shows the selection screen.
        const res = NextResponse.json({
          ok: true,
          status: 'open',
          session_id: result.created.id,
          language_code: result.created.language_code,
          language_source: result.created.language_source,
        });
        res.cookies.set(cookieName, result.created.id, sessionCookieOptions());
        return res;
      }
    }
  } catch (e) {
    return dbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    await closeActiveSession(params.channel_key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
