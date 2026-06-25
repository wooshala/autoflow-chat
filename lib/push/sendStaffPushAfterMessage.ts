import {
  buildStaffFcmDataPayload,
  buildStaffFcmNotificationPayload
} from '@/lib/push/buildStaffFcmPayload';
import type { ChatMessage } from '@/lib/types';

/**
 * After chat_messages insert — build FCM payload and dispatch when configured.
 * P0: always log payload; send when Firebase + device tokens exist.
 */
export async function sendStaffPushAfterMessage(message: ChatMessage): Promise<void> {
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

  // Device token lookup + Firebase Admin send — wired when staff_device_tokens migration lands.
  console.log('[STAFF_FCM_SEND_PENDING]', {
    message_id: data.message_id,
    notification_title: notification.title,
    android_channel:
      data.urgency === 'urgent' ? 'autoflow_staff_urgent' : 'autoflow_staff_messages',
    data_keys: Object.keys(data),
    doc: 'docs/native-android-fcm-channel.md'
  });
}
