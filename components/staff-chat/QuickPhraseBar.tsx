'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { QUICK_PHRASES_URL } from '@/lib/chatApi';
import { phraseText } from '@/lib/services/quickPhrasesText';
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
  large?: boolean;
  /** Smaller touch chips: one row scroll, less vertical space than `large`. */
  compactMobile?: boolean;
  selectedLabel?: string;
  onEditClick?: () => void;
  editLabel?: string;
  refreshToken?: number;
};

export default function QuickPhraseBar({
  locale,
  sectionLabel,
  onInsert,
  disabled = false,
  large = false,
  compactMobile = false,
  selectedLabel = '',
  onEditClick,
  editLabel = '편집',
  refreshToken = 0
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
  }, [loadPhrases, refreshToken]);

  function handlePhraseTap(phrase: ChatQuickPhrase) {
    if (disabled) return;
    const text = phraseText(phrase, locale);
    onInsert({ phrase_key: phrase.phrase_key, text });
  }

  const chipClass = compactMobile
    ? 'shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold leading-tight min-h-[2.5rem] max-w-[9.5rem] truncate disabled:opacity-40'
    : large
      ? 'shrink-0 rounded-full border px-4 py-2 text-base font-semibold leading-snug min-h-[3rem] max-w-[11rem] whitespace-normal text-center disabled:opacity-40'
      : 'shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800 disabled:opacity-40';
  const wrapClass = compactMobile
    ? 'border-b border-gray-100 bg-white px-2 py-1.5'
    : large
      ? 'border-b border-gray-100 bg-white px-2 py-2.5'
      : 'border-b border-gray-100 bg-white px-2 py-1.5';
  const labelClass = compactMobile || large
    ? 'shrink-0 text-xs font-bold uppercase tracking-wide text-gray-400'
    : 'shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400';
  const scrollMaxClass = compactMobile ? 'max-h-[4.5rem]' : large ? 'max-h-12' : 'max-h-9';

  if (!hydrated) return null;

  return (
    <div className={wrapClass}>
      <div className="mx-auto flex max-w-md items-start gap-2">
        <div className="flex shrink-0 items-center gap-1 pt-2">
          <span className={labelClass}>{sectionLabel}</span>
          {onEditClick ? (
            <button
              type="button"
              onClick={onEditClick}
              disabled={disabled}
              className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-1.5 text-xs font-semibold text-gray-600 active:bg-gray-100 disabled:opacity-40"
              aria-label={editLabel}
              title={editLabel}
            >
              ⚙️
            </button>
          ) : null}
        </div>
        <div className={`min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain ${scrollMaxClass}`}>
          <div
            className={
              compactMobile
                ? 'flex w-max min-w-full max-h-[4.5rem] flex-wrap content-start gap-1.5 pr-1'
                : `flex w-max items-center pr-1 ${large ? 'gap-2' : 'gap-1.5'}`
            }
          >
            {phrases.map((phrase) => {
              const label = phraseText(phrase, locale);
              const selected = Boolean(selectedLabel && selectedLabel === label);
              return (
                <button
                  key={phrase.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePhraseTap(phrase)}
                  className={`${chipClass} ${
                    selected
                      ? 'border-blue-600 bg-blue-100 text-blue-900 ring-2 ring-blue-200'
                      : 'border-gray-200 bg-gray-50 text-gray-800 active:border-blue-300 active:bg-blue-50'
                  }`}
                  title={compactMobile ? label : undefined}
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
