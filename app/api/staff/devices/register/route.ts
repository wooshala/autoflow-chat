import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { registerStaffDeviceToken } from '@/lib/services/staffDevices';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const device = await registerStaffDeviceToken({
      inviteToken: body?.invite_token ?? body?.inviteToken ?? null,
      staffInviteId: body?.staff_invite_id ?? body?.staffInviteId ?? null,
      userId: body?.user_id ?? body?.userId ?? null,
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
