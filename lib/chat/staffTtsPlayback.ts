import { playServerStaffTts } from '@/lib/chat/serverTtsClient';
import { speakStaffTts, type StaffTtsLocale } from '@/lib/chat/staffTts';

export type StaffTtsPlaybackResult =
  | 'spoken'
  | 'server_spoken'
  | 'blocked'
  | 'no_voice'
  | 'server_failed';

/**
 * Browser Web Speech when ru voice is available; otherwise server-side OpenAI TTS mp3.
 */
export async function playStaffTts(
  text: string,
  locale: StaffTtsLocale,
  ruVoiceReady: boolean | null
): Promise<StaffTtsPlaybackResult> {
  const preview = String(text || '').trim().slice(0, 120);
  if (!preview) return 'blocked';

  if (ruVoiceReady !== false) {
    const browserResult = await speakStaffTts(preview, locale);
    if (browserResult === 'spoken') return 'spoken';
    if (ruVoiceReady === true) return browserResult;
  }

  if (locale === 'ru') {
    const ok = await playServerStaffTts(preview, 'ru');
    return ok ? 'server_spoken' : 'server_failed';
  }

  return 'no_voice';
}
