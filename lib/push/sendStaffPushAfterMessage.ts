import {
  buildStaffFcmDataPayload,
  buildStaffFcmNotificationPayload
} from '@/lib/push/buildStaffFcmPayload';
import { sendStaffFcm } from '@/lib/push/sendStaffFcm';
import { listEnabledStaffPushTargets } from '@/lib/services/staffDevices';
import type { ChatMessage } from '@/lib/types';

/**
 * After chat_messages INSERT, notify native staff devices.
 * This is called as a best-effort side effect from /api/chat/send; errors must
 * never fail the chat send response.
 */
export async function sendStaffPushAfterMessage(message: ChatMessage): Promise<void> {
  if ((message as any)?.is_deleted) {
    console.log('[STAFF_FCM_SKIPPED]', { reason: 'deleted_message', message_id: message.id });
    return;
  }

  const data = buildStaffFcmDataPayload(message);
  const notification = buildStaffFcmNotificationPayload(message);

  const hasRu = Boolean(data.translated_text_ru);
  const notifyBody = notification.body;

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
      hint: 'Set STAFF_FCM_ENABLED=1 and configure Firebase to send'
    });
    return;
  }

  const targets = await listEnabledStaffPushTargets();
  const messageTokenId = message.token_id ? String(message.token_id) : null;
  const messageUserId = message.user_id ? String(message.user_id) : null;
  const tokens = targets
    .filter((target) => {
      const sameInvite = Boolean(
        messageTokenId && target.staff_invite_id && String(target.staff_invite_id) === messageTokenId
      );
      const sameUser = Boolean(
        messageUserId && target.user_id && String(target.user_id) === messageUserId
      );
      if (sameInvite || sameUser) {
        console.log('[STAFF_FCM_TARGET_SKIPPED]', {
          reason: 'self_message',
          message_id: data.message_id,
          target_id: target.id,
          sameInvite,
          sameUser
        });
        return false;
      }
      return true;
    })
    .map((target) => target.fcm_token);

  console.log('[STAFF_FCM_SEND_START]', {
    message_id: data.message_id,
    notification_title: notification.title,
    android_channel:
      data.urgency === 'urgent' ? 'autoflow_staff_urgent' : 'autoflow_staff_messages',
    target_count: tokens.length,
    data_keys: Object.keys(data)
  });

  const result = await sendStaffFcm({ tokens, notification, data });
  console.log('[STAFF_FCM_SEND_DONE]', {
    message_id: data.message_id,
    ...result
  });
}
