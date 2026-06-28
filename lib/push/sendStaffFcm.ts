import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type TokenMessage } from 'firebase-admin/messaging';
import { disableStaffDeviceTokens } from '@/lib/services/staffDevices';
import type { StaffFcmDataPayload, StaffFcmNotificationPayload } from '@/lib/push/staffFcmTypes';

const FCM_BATCH_SIZE = 500;

function normalizePrivateKey(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n');
  try {
    return Buffer.from(raw, 'base64').toString('utf8').replace(/\\n/g, '\n');
  } catch {
    return raw.replace(/\\n/g, '\n');
  }
}

function getFirebaseAppReady(): boolean {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) {
    console.log('[STAFF_FCM_SKIPPED]', {
      reason: 'firebase_env_missing',
      has_project_id: Boolean(projectId),
      has_client_email: Boolean(clientEmail),
      has_private_key: Boolean(privateKey)
    });
    return false;
  }

  if (getApps().length > 0) return true;

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey)
    })
  });
  return true;
}

function androidChannelId(urgency: StaffFcmDataPayload['urgency']): string {
  return urgency === 'urgent' ? 'autoflow_staff_urgent' : 'autoflow_staff_messages';
}

function makeMessage(
  token: string,
  notification: StaffFcmNotificationPayload,
  data: StaffFcmDataPayload
): TokenMessage {
  const channelId = androidChannelId(data.urgency);
  return {
    token,
    notification,
    data,
    android: {
      priority: 'high',
      notification: {
        channelId,
        sound: 'default',
        defaultVibrateTimings: false,
        visibility: 'public',
        tag: data.message_id
      }
    }
  };
}

function isInvalidTokenError(code: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

export async function sendStaffFcm(input: {
  tokens: string[];
  notification: StaffFcmNotificationPayload;
  data: StaffFcmDataPayload;
}): Promise<{ attempted: number; success: number; failure: number; disabled: number }> {
  const tokens = Array.from(new Set(input.tokens.map((t) => String(t || '').trim()).filter(Boolean)));
  if (tokens.length === 0) return { attempted: 0, success: 0, failure: 0, disabled: 0 };
  if (!getFirebaseAppReady()) return { attempted: 0, success: 0, failure: 0, disabled: 0 };

  const messaging = getMessaging();
  let success = 0;
  let failure = 0;
  const invalidTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    const messages = batch.map((token) => makeMessage(token, input.notification, input.data));
    const result = await messaging.sendEach(messages);
    success += result.successCount;
    failure += result.failureCount;

    result.responses.forEach((response, idx) => {
      if (response.success) return;
      const token = batch[idx];
      const code = response.error?.code || 'unknown';
      console.log('[STAFF_FCM_TOKEN_SEND_FAILED]', {
        message_id: input.data.message_id,
        code,
        token_preview: `${token.slice(0, 8)}...${token.slice(-6)}`
      });
      if (isInvalidTokenError(code)) invalidTokens.push(token);
    });
  }

  if (invalidTokens.length > 0) {
    await disableStaffDeviceTokens(invalidTokens, 'fcm_invalid_or_unregistered');
  }

  return {
    attempted: tokens.length,
    success,
    failure,
    disabled: invalidTokens.length
  };
}
