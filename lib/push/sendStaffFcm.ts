import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type TokenMessage } from 'firebase-admin/messaging';
import { disableStaffDeviceTokens } from '@/lib/services/staffDevices';
import type { StaffFcmDataPayload } from '@/lib/push/staffFcmTypes';

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

/** Diagnostic only — env presence without initializing Firebase Admin. */
export function logFirebaseAdminEnvStatus(): {
  ready: boolean;
  has_project_id: boolean;
  has_client_email: boolean;
  has_private_key: boolean;
  apps_initialized: number;
} {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  return {
    ready: Boolean(projectId && clientEmail && privateKey),
    has_project_id: Boolean(projectId),
    has_client_email: Boolean(clientEmail),
    has_private_key: Boolean(privateKey),
    apps_initialized: getApps().length
  };
}

function androidChannelId(urgency: StaffFcmDataPayload['urgency']): string {
  return urgency === 'urgent' ? 'autoflow_staff_urgent_v4' : 'autoflow_staff_messages_v4';
}

/** FCM data payload values must be strings. */
function toFcmDataRecord(data: StaffFcmDataPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (!s) continue;
    out[key] = s;
  }
  return out;
}

function makeMessage(token: string, data: StaffFcmDataPayload): TokenMessage {
  const fcmData = toFcmDataRecord({
    ...data,
    android_channel_id: androidChannelId(data.urgency)
  });
  return {
    token,
    data: fcmData,
    android: {
      priority: 'high'
    }
  };
}

/**
 * Permanent token errors — the token is genuinely dead and must be disabled.
 * Ambiguous errors (e.g. invalid-argument, which can stem from payload/transient
 * issues) are intentionally excluded so a live device token is not killed by a
 * one-off failure; those are logged only and left enabled for retry.
 */
function isPermanentlyInvalidToken(code: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

function isAmbiguousTokenError(code: string): boolean {
  return (
    code === 'messaging/invalid-argument' ||
    code === 'messaging/internal-error' ||
    code === 'messaging/server-unavailable' ||
    code === 'messaging/unavailable' ||
    code === 'messaging/quota-exceeded'
  );
}

export async function sendStaffFcm(input: {
  tokens: string[];
  data: StaffFcmDataPayload;
}): Promise<{ attempted: number; success: number; failure: number; disabled: number }> {
  const tokens = Array.from(new Set(input.tokens.map((t) => String(t || '').trim()).filter(Boolean)));
  console.log('[STAFF_FCM_SEND_START]', {
    message_id: input.data.message_id,
    room_no: input.data.room_no,
    urgency: input.data.urgency,
    data_only: true,
    token_count: tokens.length,
    tokens: tokens.map((t) => ({ prefix: t.slice(0, 12), length: t.length })),
    multicast: false,
    api: 'sendEach'
  });

  if (tokens.length === 0) {
    console.log('[STAFF_FCM_SEND_DONE]', {
      message_id: input.data.message_id,
      attempted: 0,
      success: 0,
      failure: 0,
      disabled: 0,
      reason: 'no_tokens'
    });
    return { attempted: 0, success: 0, failure: 0, disabled: 0 };
  }
  if (!getFirebaseAppReady()) {
    console.log('[STAFF_FCM_SEND_DONE]', {
      message_id: input.data.message_id,
      attempted: 0,
      success: 0,
      failure: 0,
      disabled: 0,
      reason: 'firebase_not_ready'
    });
    return { attempted: 0, success: 0, failure: 0, disabled: 0 };
  }

  const messaging = getMessaging();
  let success = 0;
  let failure = 0;
  const invalidTokens: string[] = [];
  const ambiguousTokens: Array<{ code: string; token_prefix: string }> = [];
  const failures: Array<{ code: string; message: string; token_prefix: string }> = [];

  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    const messages = batch.map((token) => makeMessage(token, input.data));
    console.log('[STAFF_FCM_SEND_EACH_CALL]', {
      message_id: input.data.message_id,
      batch_index: Math.floor(i / FCM_BATCH_SIZE),
      batch_size: batch.length
    });
    const result = await messaging.sendEach(messages);
    success += result.successCount;
    failure += result.failureCount;

    result.responses.forEach((response, idx) => {
      if (response.success) return;
      const token = batch[idx];
      const code = response.error?.code || 'unknown';
      const errMessage = response.error?.message || 'unknown';
      failures.push({ code, message: errMessage, token_prefix: token.slice(0, 12) });
      const permanent = isPermanentlyInvalidToken(code);
      console.log('[STAFF_FCM_TOKEN_SEND_FAILED]', {
        message_id: input.data.message_id,
        code,
        message: errMessage,
        token_prefix: token.slice(0, 12),
        token_length: token.length,
        classification: permanent ? 'permanent_disable' : 'ambiguous_keep'
      });
      if (permanent) {
        invalidTokens.push(token);
      } else if (isAmbiguousTokenError(code)) {
        ambiguousTokens.push({ code, token_prefix: token.slice(0, 12) });
      }
    });
  }

  if (ambiguousTokens.length > 0) {
    console.log('[STAFF_FCM_TOKEN_AMBIGUOUS_KEPT]', {
      message_id: input.data.message_id,
      count: ambiguousTokens.length,
      note: 'not disabled — left enabled for retry',
      samples: ambiguousTokens.slice(0, 5)
    });
  }

  if (invalidTokens.length > 0) {
    const disabledCodes = Array.from(
      new Set(
        failures
          .filter((f) => isPermanentlyInvalidToken(f.code))
          .map((f) => f.code)
      )
    );
    console.log('[STAFF_FCM_TOKEN_DISABLE_REQUEST]', {
      message_id: input.data.message_id,
      count: invalidTokens.length,
      codes: disabledCodes,
      reason: 'permanent_invalid_or_unregistered'
    });
    await disableStaffDeviceTokens(
      invalidTokens,
      `fcm_permanent:${disabledCodes.join(',') || 'unknown'}`
    );
  }

  const summary = {
    message_id: input.data.message_id,
    attempted: tokens.length,
    success,
    failure,
    disabled: invalidTokens.length,
    ambiguous_kept: ambiguousTokens.length,
    failure_samples: failures.slice(0, 5)
  };
  console.log('[STAFF_FCM_SEND_DONE]', summary);

  return {
    attempted: tokens.length,
    success,
    failure,
    disabled: invalidTokens.length
  };
}
