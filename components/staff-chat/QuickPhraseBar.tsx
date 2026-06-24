'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { QUICK_PHRASES_URL } from '@/lib/chatApi';
import { phraseText } from '@/lib/services/quickPhrases';
import type { StaffLocale } from '@/lib/i18n/messages';
import type { ChatQuickPhrase } from '@/lib/types';

export type QuickPhraseInsertPayload = {
  phrase_key: string;
  text: string;
};

type Props = {
  locale: StaffLocale;
  sectionLabel: string;
  onInsert: (payload: QuickPhraseInsertPayload) => void;
  disabled?: boolean;
};

export default function QuickPhraseBar({
  locale,
  sectionLabel,
  onInsert,
  disabled = false
}: Props) {
  const [phrases, setPhrases] = useState<ChatQuickPhrase[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const loadPhrases = useCallback(async () => {
    const res = await fetchEnvelope<{ phrases: ChatQuickPhrase[] }>(QUICK_PHRASES_URL);
    if (res.ok && Array.isArray(res.data?.phrases)) {
      setPhrases(res.data.phrases);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void loadPhrases();
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadPhrases();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadPhrases]);

  function handlePhraseTap(phrase: ChatQuickPhrase) {
    if (disabled) return;
    const text = phraseText(phrase, locale);
    onInsert({ phrase_key: phrase.phrase_key, text });
  }

  if (!hydrated) return null;

  return (
    <div className="border-b border-gray-100 bg-white px-2 py-1.5">
      <div className="mx-auto flex max-w-md items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {sectionLabel}
        </span>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
          <div className="flex w-max items-center gap-1.5 pr-1">
            {phrases.map((phrase) => {
              const label = phraseText(phrase, locale);
              return (
                <button
                  key={phrase.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePhraseTap(phrase)}
                  className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800 disabled:opacity-40 active:border-blue-300 active:bg-blue-50"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
