import { setStaffTtsSkipReason } from '@/lib/chat/staffTtsDiagState';

export type StaffTtsTriggerCheckPayload = {
  messageId: string | null;
  text: string;
  translatedRu: string;
  originalLang: string;
  isSelfMessage: boolean;
  soundEnabled: boolean;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  localRuVoice: boolean | null;
  shouldUseServerTts: boolean;
  skipReason: string;
  /** Extra fields for split-point diagnosis (console only). */
  viewerLang?: string;
  ttsText?: string | null;
  toSpeak?: string | null;
  willCallPlayStaffTts?: boolean;
  willCallPlayServerStaffTts?: boolean;
};

let lastTriggerCheck: StaffTtsTriggerCheckPayload | null = null;

export function peekStaffTtsTriggerCheck(): StaffTtsTriggerCheckPayload | null {
  return lastTriggerCheck;
}

export function logStaffTtsTriggerCheck(payload: StaffTtsTriggerCheckPayload) {
  lastTriggerCheck = payload;
  setStaffTtsSkipReason(payload.skipReason);
  console.log('[STAFF_TTS_TRIGGER_CHECK]', payload);
}

export function logStaffTtsPlaybackSkip(
  skipReason: string,
  extra?: Record<string, unknown>
) {
  setStaffTtsSkipReason(skipReason);
  console.log('[STAFF_TTS_PLAYBACK_SKIP]', { skipReason, ...extra });
}
