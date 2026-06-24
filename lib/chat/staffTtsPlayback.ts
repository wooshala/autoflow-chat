import {
  isServerStaffTtsUnlocked,
  playServerStaffTts
} from '@/lib/chat/serverTtsClient';
import { setStaffTtsError } from '@/lib/chat/staffTtsDiagState';
import { logStaffTtsPlaybackSkip } from '@/lib/chat/staffTtsTriggerCheck';
import { speakStaffTts, type StaffTtsLocale } from '@/lib/chat/staffTts';

export type StaffTtsPlaybackResult =
  | 'spoken'
  | 'server_spoken'
  | 'blocked'
  | 'no_voice'
  | 'server_failed'
  | 'server_not_unlocked';

export type PlayStaffTtsOptions = {
  fromUserGesture?: boolean;
};

/**
 * Browser Web Speech when ru voice is available; otherwise server-side OpenAI TTS mp3.
 */
export async function playStaffTts(
  text: string,
  locale: StaffTtsLocale,
  ruVoiceReady: boolean | null,
  options?: PlayStaffTtsOptions
): Promise<StaffTtsPlaybackResult> {
  const preview = String(text || '').trim().slice(0, 120);
  if (!preview) {
    logStaffTtsPlaybackSkip('skip_empty_text');
    return 'blocked';
  }

  const playOpts = { fromUserGesture: options?.fromUserGesture ?? false };

  if (ruVoiceReady !== false) {
    const browserResult = await speakStaffTts(preview, locale);
    if (browserResult === 'spoken') return 'spoken';
    if (ruVoiceReady === true) {
      logStaffTtsPlaybackSkip('skip_local_voice_path_failed', { browserResult });
      return browserResult;
    }
  } else {
    logStaffTtsPlaybackSkip('skip_local_voice_path_selected', {
      note: 'ruVoiceReady_false_using_server'
    });
  }

  if (locale === 'ru') {
    if (!playOpts.fromUserGesture && !isServerStaffTtsUnlocked()) {
      setStaffTtsError('not_unlocked');
      logStaffTtsPlaybackSkip('skip_server_tts_locked');
      return 'server_not_unlocked';
    }
    const ok = await playServerStaffTts(preview, 'ru', playOpts);
    if (!ok) {
      logStaffTtsPlaybackSkip('skip_server_tts_play_failed');
    }
    return ok ? 'server_spoken' : 'server_failed';
  }

  logStaffTtsPlaybackSkip('skip_no_voice', { locale });
  return 'no_voice';
}
