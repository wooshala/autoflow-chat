'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  messages,
  STAFF_LOCALE_STORAGE_KEY,
  type MessageKey,
  type StaffLocale,
  translate
} from '@/lib/i18n/messages';

export function useI18n(defaultLocale: StaffLocale = 'ru') {
  const [locale, setLocaleState] = useState<StaffLocale>(defaultLocale);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STAFF_LOCALE_STORAGE_KEY);
      if (stored === 'ko' || stored === 'ru') {
        setLocaleState(stored);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setLocale = useCallback((next: StaffLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STAFF_LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);

  return { t, locale, setLocale, hydrated, messages: messages[locale] };
}
