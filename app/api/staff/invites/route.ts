import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import {
  getActiveStaffEntryInvite,
  rotateStaffEntryInvite,
  staffEntryInviteUrl
} from '@/lib/services/staffEntryInvites';
import {
  createStaffInvite,
  joinStaffViaEntry,
  listStaffInvites,
  resolveInviteUserId,
  resolveStaffInviteByToken,
  resolveStaffInviteByTokenAny,
  revokeStaffInvite,
  rotateStaffInviteToken,
  setStaffInviteEnabled,
  setStaffInviteStatus,
  staffInviteUrl,
  touchStaffInviteSeen
} from '@/lib/services/staffInvites';
import { STAFF_WORK_STATUS_OPTIONS } from '@/lib/chat/staffStatus';
import { getSiteId } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';

async function bindInviteDeviceKey(inviteId: string, deviceKey: string) {
  const key = String(deviceKey || '').trim();
  if (!key || IS_MOCK || !supabaseAdmin) return;
  await supabaseAdmin
    .from('staff_invites')
    .update({ device_key: key })
    .eq('id', inviteId)
    .is('device_key', null);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const siteId = getSiteId();

  if (req.nextUrl.searchParams.get('entry') === 'active') {
    try {
      let entry = await getActiveStaffEntryInvite(siteId);
      if (!entry) {
        entry = await rotateStaffEntryInvite(siteId);
      }
      return jsonOk({
        entry,
        url: staffEntryInviteUrl(entry.token, origin)
      });
    } catch (e: unknown) {
      return jsonErr('ENTRY_INVITE_FAILED', e instanceof Error ? e.message : String(e), 500);
    }
  }

  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (token) {
    const checkAny = req.nextUrl.searchParams.get('check') === 'any';
    try {
      const invite = checkAny
        ? await resolveStaffInviteByTokenAny(token, siteId)
        : await resolveStaffInviteByToken(token, siteId);
      if (!invite) {
        return jsonErr('INVALID_INVITE', '유효하지 않은 초대 링크', 404);
      }
      if (!invite.enabled) {
        return jsonErr('INVITE_REVOKED', '채팅방에서보내졌습니다. 관리자에게 문의하세요.', 403);
      }
      await touchStaffInviteSeen(invite.id);
      const deviceKey = req.nextUrl.searchParams.get('device_key')?.trim();
      if (deviceKey) {
        await bindInviteDeviceKey(invite.id, deviceKey);
      }
      const userId = resolveInviteUserId(invite);
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
    const invites = await listStaffInvites(siteId);
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
    const action = String(body?.action || '').trim();
    const origin = req.nextUrl.origin;

    if (action === 'join') {
      const entry_token = String(body?.entry_token || '').trim();
      const display_name = String(body?.display_name || '').trim();
      const spoken_lang = body?.spoken_lang ? String(body.spoken_lang).trim() : null;
      const device_key = String(body?.device_key || '').trim();
      const role = String(body?.role || 'cleaning').trim();
      if (!entry_token || !display_name || !device_key) {
        return jsonErr('VALIDATION_ERROR', 'entry_token, display_name, device_key 필요', 400);
      }
      try {
        const invite = await joinStaffViaEntry({
          entry_token,
          display_name,
          spoken_lang,
          role,
          device_key
        });
        return jsonOk({
          invite: { ...invite, url: staffInviteUrl(invite.token, origin) },
          userId: resolveInviteUserId(invite)
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'DEVICE_REVOKED') {
          return jsonErr('DEVICE_REVOKED', '이 기기는 채팅방에서보내졌습니다. 관리자에게 문의하세요.', 403);
        }
        if (msg === 'INVALID_ENTRY_TOKEN') {
          return jsonErr('INVALID_ENTRY_TOKEN', '만료되었거나 유효하지 않은 입장 QR입니다.', 404);
        }
        throw e;
      }
    }

    if (action === 'rotate_entry') {
      const entry = await rotateStaffEntryInvite(getSiteId());
      return jsonOk({
        entry,
        url: staffEntryInviteUrl(entry.token, origin)
      });
    }

    const display_name = String(body?.display_name || '').trim();
    const role = String(body?.role || 'cleaning').trim();
    const user_id = body?.user_id ? String(body.user_id).trim() : null;
    const spoken_lang = body?.spoken_lang ? String(body.spoken_lang).trim() : null;
    if (!display_name) return jsonErr('VALIDATION_ERROR', 'display_name 필요', 400);
    const invite = await createStaffInvite({ display_name, role, user_id, spoken_lang });
    return jsonOk({ invite: { ...invite, url: staffInviteUrl(invite.token, origin) } });
  } catch (e: unknown) {
    return jsonErr('INVITE_CREATE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').trim();
    const origin = req.nextUrl.origin;

    if (action === 'revoke') {
      if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
      const invite = await revokeStaffInvite(id);
      return jsonOk({ invite });
    }

    if (action === 'rotate_token') {
      if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
      const invite = await rotateStaffInviteToken(id);
      return jsonOk({ invite: { ...invite, url: staffInviteUrl(invite.token, origin) } });
    }

    if (action === 'set_status') {
      if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
      const status = String(body?.status || '').trim();
      const allowed = STAFF_WORK_STATUS_OPTIONS.some((o) => o.key === status);
      if (!allowed) return jsonErr('VALIDATION_ERROR', '알 수 없는 상태입니다.', 400);
      try {
        const invite = await setStaffInviteStatus(id, status);
        return jsonOk({ invite });
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === 'STATUS_COLUMN_MISSING') {
          return jsonErr(
            'STATUS_COLUMN_MISSING',
            '상태 저장용 DB 컬럼이 아직 없습니다. 마이그레이션(staff_invites_status) 적용이 필요합니다.',
            503
          );
        }
        throw e;
      }
    }

    if (!id) return jsonErr('VALIDATION_ERROR', 'id 필요', 400);
    const enabled = Boolean(body?.enabled);
    const invite = await setStaffInviteEnabled(id, enabled);
    return jsonOk({ invite });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_FOUND') return jsonErr('NOT_FOUND', '참여자를 찾을 수 없습니다', 404);
    return jsonErr('INVITE_UPDATE_FAILED', msg, 500);
  }
}
