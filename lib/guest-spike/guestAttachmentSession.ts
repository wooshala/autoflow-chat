// IMAGE-CHAT-01A — shared session resolution for guest attachment routes (mirrors messages route).

import { NextRequest } from 'next/server';

import { getActiveSession, getSessionById, type GuestSession } from './store';
import { channelCookieName } from './sessionCookie';
import { requireStaff } from './staffAuth';

export type GuestAttachmentSessionResolved =
  | { ok: true; session: GuestSession; kind: 'guest' | 'staff' }
  | { ok: false; kind: 'unauthorized' | 'closed' | 'occupied' | 'no_session' };

export async function resolveGuestAttachmentSession(
  req: NextRequest,
  channelKey: string,
  opts?: { staffRead?: boolean },
): Promise<GuestAttachmentSessionResolved> {
  const asStaff = req.nextUrl.searchParams.get('as') === 'staff';
  if (asStaff || opts?.staffRead) {
    const staff = await requireStaff(req);
    if (!staff) return { ok: false, kind: 'unauthorized' };
    const session = await getActiveSession(channelKey);
    if (!session) return { ok: false, kind: 'no_session' };
    return { ok: true, session, kind: 'staff' };
  }

  const sid = req.cookies.get(channelCookieName(channelKey))?.value;
  if (sid) {
    const s = await getSessionById(sid);
    if (s && s.channel_key === channelKey) {
      if (s.status === 'open') return { ok: true, session: s, kind: 'guest' };
      return { ok: false, kind: 'closed' };
    }
  }

  const active = await getActiveSession(channelKey);
  return active ? { ok: false, kind: 'occupied' } : { ok: false, kind: 'no_session' };
}
