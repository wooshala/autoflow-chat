// Phase 2C — staff "room move": notify the CURRENT guest to rescan the new room's QR, then close
// the session. NOT a session transfer/merge/carry-over — the guest starts a fresh session on the
// new room's channel by scanning its QR. Message-then-close are TWO separate DB writes (Supabase
// has no single client transaction here), so partial success is returned EXPLICITLY:
//   { message_sent, session_closed, error_code } — the client never re-sends the message on a
//   close failure (avoids a duplicate notice; it only retries the close).
//
// Concurrency: the active OPEN session is resolved server-side; the client's expected_session_id is
// checked so a move meant for guest A is never applied to a NEW guest B who just claimed the room.

import { NextRequest, NextResponse } from 'next/server';

import { appendMessage, closeActiveSession, getActiveSession } from '@/lib/guest-spike/store';
import { requireStaff } from '@/lib/guest-spike/staffAuth';
import { STAFF_VALID_ROOM_SET } from '@/lib/chat/staffRoomOptions';
import { roomNoFromChannelKey } from '@/lib/guest-spike/customerContextView';
import { buildRoomMoveMessage, normalizeMoveTarget } from '@/lib/guest-spike/roomMoveMessage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  const channelKey = params.channel_key;
  let body: { new_room_no?: unknown; expected_session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }

  const current = roomNoFromChannelKey(channelKey);
  const target = normalizeMoveTarget(body.new_room_no, current, STAFF_VALID_ROOM_SET);
  if (!target.ok) return NextResponse.json({ ok: false, error: target.code }, { status: 400 });

  try {
    // Server is authoritative about which session is active — never trust the client's id to target.
    const session = await getActiveSession(channelKey);
    if (!session) return NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 });
    // Optimistic concurrency: if the active session is not the one the client was looking at (e.g. a
    // new guest claimed the room in the meantime), abort — do NOT message the wrong guest.
    const expected = typeof body.expected_session_id === 'string' ? body.expected_session_id : null;
    if (expected && expected !== session.id) {
      return NextResponse.json({ ok: false, error: 'SESSION_CHANGED' }, { status: 409 });
    }

    const msg = buildRoomMoveMessage(session.language_code, target.roomNo);

    // Step 1 — send the notice. On failure the session stays OPEN (nothing to undo).
    try {
      await appendMessage({
        channelKey,
        sessionId: session.id,
        sender: 'staff',
        original: msg.original,
        original_lang: msg.originalLang,
        translated: msg.translated,
      });
    } catch {
      return NextResponse.json(
        { ok: false, message_sent: false, session_closed: false, error_code: 'MESSAGE_SEND_FAILED' },
        { status: 502 },
      );
    }

    // Step 2 — close. If this fails the notice was already sent, so the client retries ONLY the
    // close (via DELETE /session), never this endpoint, so the notice is never duplicated.
    try {
      await closeActiveSession(channelKey);
    } catch {
      return NextResponse.json(
        { ok: false, message_sent: true, session_closed: false, error_code: 'SESSION_CLOSE_FAILED' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, message_sent: true, session_closed: true }, { status: 200 });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
  }
}
