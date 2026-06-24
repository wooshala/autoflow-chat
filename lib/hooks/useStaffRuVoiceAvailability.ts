'use client';

import { useEffect, useState } from 'react';
import { isRuVoiceAvailable, logStaffTtsVoicesDebug } from '@/lib/chat/staffTts';

/** null = voices not loaded yet; false = no ru-RU voice on device. */
export function useStaffRuVoiceAvailability(): boolean | null {
  const [ruVoiceReady, setRuVoiceReady] = useState<boolean | null>(null);

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) {
      setRuVoiceReady(false);
      return;
    }

    const refresh = () => {
      logStaffTtsVoicesDebug('voiceschanged');
      setRuVoiceReady(isRuVoiceAvailable(synth.getVoices()));
    };

    refresh();
    synth.addEventListener('voiceschanged', refresh);
    return () => synth.removeEventListener('voiceschanged', refresh);
  }, []);

  return ruVoiceReady;
}
