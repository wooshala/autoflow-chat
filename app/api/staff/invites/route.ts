import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import {
  createStaffInvite,
  listStaffInvites,
  resolveInviteUserId,
  resolveStaffInviteByToken,
  setStaffInviteEnabled,
  staffInviteUrl,
  touchStaffInviteSeen
} from '@/lib/services/staffInvites';
import { getSiteId } from '@/lib/site';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (token) {
    try {
      const invite = await resolveStaffInviteByToken(token, getSiteId());
      if (!invite) {
        return jsonErr('INVALID_INVITE', '유효하지 않은 초대 링크', 404);
      }
      await touchStaffInviteSeen(invite.id);
      const userId = resolveInviteUserId(invite);
      const origin = req.nextUrl.origin;
      return jsonOk({
        invite,
        userId,
        url: staffInviteUrl(invite.token, origin)
      });
    } catch (e: unknown) {
      return jsonErr('INVITE_RESOLVE_FAILED', e instanceof Error ? e.message : String(e), 500);
    }
  }

  try {
    const invites = await listStaffInvites(getSiteId());
    const origin = req.nextUrl.origin;
    return jsonOk({
      invites: invites.map((i) => ({ ...i, url: staffInviteUrl(i.token, origin) }))
    });
  } catch (e: unknown) {
    return jsonErr('INVITE_LIST_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const display_name = String(body?.display_name || '').trim();
    const role = String(body?.role || 'cleaning').trim();
    const user_id = body?.user_id ? String(body.user_id).trim() : null;
    if (!display_name) return jsonErr('VALIDATION_ERROR', 'display_name 필요', 400);
    const invite = await createStaffInvite({ display_name, role, user_id });
    const origin = req.nextUrl.origin;
    return jsonOk({ invite: { ...invite, url: staffInviteUrl(invite.token, origin) } });
  } catch (e: unknown) {
    return jsonErr('INVITE_CREATE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || '').trim();
    if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
    const enabled = Boolean(body?.enabled);
    const invite = await setStaffInviteEnabled(id, enabled);
    return jsonOk({ invite });
  } catch (e: unknown) {
    return jsonErr('INVITE_UPDATE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}
