import {
  isServerStaffTtsUnlocked,
  playServerStaffTts
} from '@/lib/chat/serverTtsClient';
import { setStaffTtsError } from '@/lib/chat/staffTtsDiagState';
import {
  isServerTtsLangSupported,
  type StaffTtsLang
} from '@/lib/chat/staffTtsLang';
import { logStaffTtsPlaybackSkip } from '@/lib/chat/staffTtsTriggerCheck';
import { isVoiceAvailableForLocale, speakStaffTts } from '@/lib/chat/staffTts';

export type StaffTtsPlaybackResult =
  | 'spoken'
  | 'server_spoken'
  | 'blocked'
  | 'no_voice'
  | 'server_failed'
  | 'server_not_unlocked'
  | 'lang_unsupported';

export type PlayStaffTtsOptions = {
  fromUserGesture?: boolean;
};

/**
 * Browser Web Speech when a local voice exists; otherwise server OpenAI TTS when supported.
 */
export async function playStaffTts(
  text: string,
  ttsLang: StaffTtsLang,
  options?: PlayStaffTtsOptions
): Promise<StaffTtsPlaybackResult> {
  const preview = String(text || '').trim().slice(0, 120);
  if (!preview) {
    logStaffTtsPlaybackSkip('skip_empty_text', { ttsLang });
    return 'blocked';
  }

  const playOpts = { fromUserGesture: options?.fromUserGesture ?? false };
  const serverSupported = isServerTtsLangSupported(ttsLang);
  const localVoiceReady = isVoiceAvailableForLocale(ttsLang);

  if (localVoiceReady) {
    const browserResult = await speakStaffTts(preview, ttsLang);
    if (browserResult === 'spoken') return 'spoken';
    logStaffTtsPlaybackSkip('skip_local_voice_path_failed', { ttsLang, browserResult });
    if (!serverSupported) {
      logStaffTtsPlaybackSkip('skip_tts_lang_unsupported', { ttsLang });
      return 'lang_unsupported';
    }
  }

  if (!serverSupported) {
    logStaffTtsPlaybackSkip('skip_tts_lang_unsupported', { ttsLang, localVoiceReady });
    return 'lang_unsupported';
  }

  if (!playOpts.fromUserGesture && !isServerStaffTtsUnlocked()) {
    setStaffTtsError('not_unlocked');
    logStaffTtsPlaybackSkip('skip_server_tts_locked', { ttsLang });
    return 'server_not_unlocked';
  }

  const ok = await playServerStaffTts(preview, ttsLang, playOpts);
  if (!ok) {
    logStaffTtsPlaybackSkip('skip_server_tts_play_failed', { ttsLang });
  }
  return ok ? 'server_spoken' : 'server_failed';
}
