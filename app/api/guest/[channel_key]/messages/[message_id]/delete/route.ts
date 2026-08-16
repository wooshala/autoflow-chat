// Guest Chat soft-delete — thin adapter (LEVEL B). Does NOT call /api/chat/delete.

import { NextRequest, NextResponse } from 'next/server';

import { softDeleteGuestChatMessage, getSessionById } from '@/lib/guest-spike/store';
import { channelCookieName } from '@/lib/guest-spike/sessionCookie';
import { requireStaff } from '@/lib/guest-spike/staffAuth';
import type { GuestDeleteActor } from '@/lib/guest-spike/guestMessageDelete';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

async function resolveActor(
  req: NextRequest,
  channelKey: string,
): Promise<{ ok: true; actor: GuestDeleteActor } | { ok: false; status: number; error: string }> {
  if (req.nextUrl.searchParams.get('as') === 'staff') {
    const staff = await requireStaff(req);
    if (!staff) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    return {
      ok: true,
      actor: { kind: 'staff', userId: staff.userId, role: staff.role },
    };
  }

  const sid = req.cookies.get(channelCookieName(channelKey))?.value;
  if (!sid) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  const session = await getSessionById(sid);
  if (!session || session.channel_key !== channelKey) {
    return { ok: false, status: 403, error: 'FORBIDDEN' };
  }
  if (session.status !== 'open') {
    return { ok: false, status: 409, error: 'SESSION_CLOSED' };
  }
  // Ensure we don't allow delete against a stale cookie while another session is active on channel —
  // guest may only delete within their cookie session (ownership check uses session id).
  return { ok: true, actor: { kind: 'guest', sessionId: session.id } };
}

/**
 * POST /api/guest/[channel_key]/messages/[message_id]/delete
 * Body unused for auth — actor from cookie or staff Bearer (?as=staff).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { channel_key: string; message_id: string } },
) {
  const channelKey = params.channel_key;
  const messageId = params.message_id;
  if (!channelKey || !messageId) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }

  try {
    const resolved = await resolveActor(req, channelKey);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    // Optional: staff must operate on a channel that has (or had) messages — still allow delete
    // of historical open-session messages even if session later closed? Product: guest needs open
    // session; staff can delete while authenticated regardless of active session as long as
    // message.channel matches. Active session check for staff is not required for delete.

    const result = await softDeleteGuestChatMessage({
      messageId,
      channelKey,
      actor: resolved.actor,
    });

    if (!result.ok) {
      if (result.error === 'NOT_FOUND' || result.error === 'CHANNEL_MISMATCH') {
        return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
      }
      if (result.error === 'NO_SESSION') {
        return NextResponse.json({ ok: false, error: 'NO_SESSION' }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    return NextResponse.json({ ok: true, message: result.message });
  } catch (e) {
    return dbError(e);
  }
}
