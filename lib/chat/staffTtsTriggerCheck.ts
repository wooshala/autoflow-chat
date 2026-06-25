import { setStaffTtsSkipReason } from '@/lib/chat/staffTtsDiagState';
import type { StaffTtsLang, StaffTtsLangSource } from '@/lib/chat/staffTtsLang';

export type StaffTtsTextOrigin = 'insert' | 'update';

export type StaffTtsTriggerCheckPayload = {
  messageId: string | null;
  text: string;
  ttsLang: StaffTtsLang | string;
  ttsLangSource: StaffTtsLangSource | string;
  translatedTts: string;
  translatedTtsExists: boolean;
  ttsTextLength: number;
  ttsTextOrigin: StaffTtsTextOrigin | string;
  originalLang: string;
  isSelfMessage: boolean;
  soundEnabled: boolean;
  serverTtsAvailable: boolean | null;
  serverTtsUnlocked: boolean;
  localRuVoice: boolean | null;
  shouldUseServerTts: boolean;
  skipReason: string;
  viewerLang?: string;
  ttsText?: string | null;
  ttsTextSource?: string;
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
