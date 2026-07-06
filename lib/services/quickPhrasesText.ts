import type { ChatQuickPhrase } from '@/lib/types';

/** Pure display helper — safe for client bundles (no Supabase imports). */
export function phraseText(phrase: ChatQuickPhrase, locale: 'ko' | 'ru'): string {
  return locale === 'ru' ? phrase.ru : phrase.ko;
}
