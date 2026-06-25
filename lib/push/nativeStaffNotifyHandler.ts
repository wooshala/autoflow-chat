/**
 * Reference handler for Android native FCM — port to Kotlin.
 * P0: notification sound + system notification always.
 * P2: auto TTS only when foreground + auto_tts_enabled + translated_text_ru.
 */
import type { StaffFcmDataPayload } from '@/lib/push/staffFcmTypes';

export type NativeStaffNotifyContext = {
  appForeground: boolean;
  autoTtsEnabled: boolean;
};

export type NativeStaffNotifyResult = {
  showNotification: true;
  notifyBody: string;
  attemptAutoTts: boolean;
  ttsText: string | null;
  diag:
    | 'p0_notification_only'
    | 'p0_notification_plus_optional_tts'
    | 'p2_tts_skipped_no_ru'
    | 'p2_tts_skipped_background'
    | 'p2_tts_skipped_auto_off';
};

export function resolveNativeNotifyBody(payload: StaffFcmDataPayload): string {
  const ru = String(payload.translated_text_ru || '').trim();
  const original = String(payload.original_text || '').trim();
  return ru || original;
}

export function planNativeStaffNotify(
  payload: StaffFcmDataPayload,
  ctx: NativeStaffNotifyContext
): NativeStaffNotifyResult {
  const notifyBody = resolveNativeNotifyBody(payload);
  const ru = String(payload.translated_text_ru || '').trim();

  if (!ctx.appForeground) {
    return {
      showNotification: true,
      notifyBody,
      attemptAutoTts: false,
      ttsText: null,
      diag: 'p2_tts_skipped_background'
    };
  }

  if (!ctx.autoTtsEnabled) {
    return {
      showNotification: true,
      notifyBody,
      attemptAutoTts: false,
      ttsText: null,
      diag: 'p2_tts_skipped_auto_off'
    };
  }

  if (!ru) {
    return {
      showNotification: true,
      notifyBody,
      attemptAutoTts: false,
      ttsText: null,
      diag: 'p2_tts_skipped_no_ru'
    };
  }

  return {
    showNotification: true,
    notifyBody,
    attemptAutoTts: true,
    ttsText: ru,
    diag: 'p0_notification_plus_optional_tts'
  };
}
