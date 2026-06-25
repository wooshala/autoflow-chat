import { setStaffTtsSkipReason } from '@/lib/chat/staffTtsDiagState';
import type { StaffTtsLang } from '@/lib/chat/staffTtsLang';

export type StaffTtsTriggerCheckPayload = {
  messageId: string | null;
  text: string;
  ttsLang: StaffTtsLang | string;
  translatedTts: string;
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
  ttsTextSource?: string;
  toSpeak?: string | null;
  willCallPlayStaffTts?: boolean;
  willCallPlayServerStaffTts?: boolean;
  /** @deprecated use translatedTts */
  translatedRu?: string;
};

let lastTriggerCheck: StaffTtsTriggerCheckPayload | null = null;

export function peekStaffTtsTriggerCheck(): StaffTtsTriggerCheckPayload | null {
  return lastTriggerCheck;
}

export function logStaffTtsTriggerCheck(payload: StaffTtsTriggerCheckPayload) {
  lastTriggerCheck = {
    ...payload,
    translatedRu: payload.translatedTts ?? payload.translatedRu ?? ''
  };
  setStaffTtsSkipReason(payload.skipReason);
  console.log('[STAFF_TTS_TRIGGER_CHECK]', lastTriggerCheck);
}

export function logStaffTtsPlaybackSkip(
  skipReason: string,
  extra?: Record<string, unknown>
) {
  setStaffTtsSkipReason(skipReason);
  console.log('[STAFF_TTS_PLAYBACK_SKIP]', { skipReason, ...extra });
}
