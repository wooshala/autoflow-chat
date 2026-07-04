import {
  buildStaffFcmDataPayload,
  buildStaffFcmNotificationPayload
} from '@/lib/push/buildStaffFcmPayload';
import { logFirebaseAdminEnvStatus, sendStaffFcm } from '@/lib/push/sendStaffFcm';
import { listEnabledStaffPushTargets } from '@/lib/services/staffDevices';
import type { ChatMessage } from '@/lib/types';

function tokenPreview(token: string): { prefix: string; length: number } {
  const t = String(token || '').trim();
  return { prefix: t.slice(0, 12), length: t.length };
}

/** chat_messages.user_id — sender (no sender_user_id column on ChatMessage). */
function resolveSenderUserId(message: ChatMessage): string | null {
  const id = message.user_id != null ? String(message.user_id).trim() : '';
  return id || null;
}

function excludeSenderDeviceTokens(
  targets: Awaited<ReturnType<typeof listEnabledStaffPushTargets>>,
  senderUserId: string | null
) {
  if (!senderUserId) {
    return { filtered: targets, excludedSelfTokenCount: 0 };
  }
  let excludedSelfTokenCount = 0;
  const filtered = targets.filter((t) => {
    const tokenUserId = t.user_id != null ? String(t.user_id).trim() : '';
    if (tokenUserId && tokenUserId === senderUserId) {
      excludedSelfTokenCount += 1;
      return false;
    }
    return true;
  });
  return { filtered, excludedSelfTokenCount };
}

/**
 * After chat_messages insert — build FCM payload and dispatch when configured.
 * P0: always log payload; send when Firebase + device tokens exist.
 */
export async function sendStaffPushAfterMessage(message: ChatMessage): Promise<void> {
  const data = buildStaffFcmDataPayload(message);
  const notification = buildStaffFcmNotificationPayload(message);

  const hasRu = Boolean(data.translated_text_ru);
  const notifyBody = notification.body;

  const senderUserId = resolveSenderUserId(message);

  console.log('[STAFF_FCM_DISPATCH_START]', {
    message_id: data.message_id,
    room_no: data.room_no,
    sender_side: message.sender_side ?? null,
    sender_user_id: senderUserId,
    user_id: message.user_id ?? null,
    message_type: message.message_type ?? null,
    urgency: data.urgency,
    target_condition:
      'enabled staff_device_tokens excluding sender user_id (invite enabled+not revoked when staff_invite_id set)'
  });

  console.log('[STAFF_FCM_PAYLOAD]', {
    message_id: data.message_id,
    room_no: data.room_no,
    urgency: data.urgency,
    has_translated_text_ru: hasRu,
    notify_body_preview: notifyBody.slice(0, 80),
    tts_optional: true,
    p0_notify: Boolean(notifyBody)
  });

  if (!notifyBody) {
    console.log('[STAFF_FCM_SKIPPED]', { reason: 'empty_notify_body', message_id: data.message_id });
    return;
  }

  if (process.env.STAFF_FCM_ENABLED !== '1') {
    console.log('[STAFF_FCM_SKIPPED]', {
      reason: 'staff_fcm_disabled',
      message_id: data.message_id,
      staff_fcm_enabled: process.env.STAFF_FCM_ENABLED ?? null,
      hint: 'Set STAFF_FCM_ENABLED=1 and configure Firebase to send'
    });
    return;
  }

  const firebaseEnv = logFirebaseAdminEnvStatus();
  console.log('[STAFF_FCM_FIREBASE_ADMIN]', {
    message_id: data.message_id,
    ...firebaseEnv
  });

  let targets;
  try {
    targets = await listEnabledStaffPushTargets();
  } catch (e: unknown) {
    console.log('[STAFF_FCM_TARGETS_QUERY_FAILED]', {
      message_id: data.message_id,
      error: e instanceof Error ? e.message : String(e)
    });
    return;
  }

  const totalEnabledTokens = targets.length;
  const { filtered: pushTargets, excludedSelfTokenCount } = excludeSenderDeviceTokens(
    targets,
    senderUserId
  );
  const tokens = pushTargets.map((t) => String(t.fcm_token || '').trim()).filter(Boolean);
  const finalTargetCount = tokens.length;

  console.log('[STAFF_FCM_TARGETS]', {
    message_id: data.message_id,
    sender_user_id: senderUserId,
    total_enabled_tokens: totalEnabledTokens,
    excluded_self_token_count: excludedSelfTokenCount,
    final_target_count: finalTargetCount,
    distinct_token_count: new Set(tokens).size,
    devices: pushTargets.map((t) => ({
      platform: t.platform,
      staff_invite_id_prefix: t.staff_invite_id ? String(t.staff_invite_id).slice(0, 8) : null,
      user_id_prefix: t.user_id ? String(t.user_id).slice(0, 8) : null,
      fcm_token: tokenPreview(t.fcm_token),
      invite_enabled: t.staff_invite?.enabled ?? null,
      invite_revoked: Boolean(t.staff_invite?.revoked_at)
    }))
  });

  if (tokens.length === 0) {
    console.log('[STAFF_FCM_SKIPPED]', {
      reason:
        totalEnabledTokens > 0 && excludedSelfTokenCount > 0
          ? 'self_only_no_targets'
          : 'no_enabled_device_tokens',
      message_id: data.message_id,
      sender_user_id: senderUserId,
      total_enabled_tokens: totalEnabledTokens,
      excluded_self_token_count: excludedSelfTokenCount,
      final_target_count: 0
    });
    return;
  }

  if (!firebaseEnv.ready) {
    console.log('[STAFF_FCM_SKIPPED]', {
      reason: 'firebase_env_missing',
      message_id: data.message_id,
      enabled_device_count: tokens.length
    });
    return;
  }

  console.log('[STAFF_FCM_SEND_PENDING]', {
    message_id: data.message_id,
    notification_title: notification.title,
    data_only: true,
    android_channel:
      data.urgency === 'urgent' ? 'autoflow_staff_urgent_v4' : 'autoflow_staff_messages_v4',
    data_keys: Object.keys(data),
    sender_user_id: senderUserId,
    total_enabled_tokens: totalEnabledTokens,
    excluded_self_token_count: excludedSelfTokenCount,
    final_target_count: finalTargetCount,
    send_token_count: finalTargetCount,
    doc: 'docs/native-android-fcm-channel.md'
  });

  await sendStaffFcm({
    tokens,
    data: {
      ...data,
      notify_title: notification.title,
      notify_body: notification.body
    }
  });
}
