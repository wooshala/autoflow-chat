import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { registerStaffDeviceToken } from '@/lib/services/staffDevices';
import { validateSessionToken } from '@/lib/services/staffAccounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Phase 3A: if a valid staff-account session (Bearer) is present, register the
 *  device under that account's user_id. Invite-token path is unchanged and used
 *  as fallback (or when no Bearer). An invalid Bearer is ignored (falls back). */
async function resolveSessionUserId(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('authorization') || '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  try {
    const account = await validateSessionToken(token);
    return account.userId;
  } catch {
    return null; // invalid/revoked session → fall back to body params
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionUserId = await resolveSessionUserId(req);
    const device = await registerStaffDeviceToken({
      inviteToken: body?.invite_token ?? body?.inviteToken ?? null,
      staffInviteId: body?.staff_invite_id ?? body?.staffInviteId ?? null,
      userId: sessionUserId ?? body?.user_id ?? body?.userId ?? null,
      fcmToken: String(body?.fcm_token ?? body?.fcmToken ?? ''),
      platform: body?.platform ?? 'android',
      deviceKey: body?.device_key ?? body?.deviceKey ?? null,
      deviceLabel: body?.device_label ?? body?.deviceLabel ?? null,
      appVersion: body?.app_version ?? body?.appVersion ?? null,
      userAgent: req.headers.get('user-agent')
    });

    return jsonOk({
      device: {
        id: device.id,
        staff_invite_id: device.staff_invite_id,
        user_id: device.user_id,
        platform: device.platform,
        enabled: device.enabled,
        last_seen_at: device.last_seen_at
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INVITE_REVOKED') {
      return jsonErr('INVITE_REVOKED', 'Staff invite is revoked.', 403);
    }
    if (msg === 'STAFF_IDENTITY_REQUIRED') {
      return jsonErr('STAFF_IDENTITY_REQUIRED', 'invite_token, staff_invite_id, or user_id is required.', 400);
    }
    if (msg === 'FCM_TOKEN_REQUIRED' || msg === 'FCM_TOKEN_INVALID') {
      return jsonErr(msg, 'Valid fcm_token is required.', 400);
    }
    console.error('[STAFF_DEVICE_REGISTER_FAILED]', { error: msg });
    return jsonErr('STAFF_DEVICE_REGISTER_FAILED', msg, 500);
  }
}
