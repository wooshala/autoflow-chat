'use client';

import { useSyncExternalStore } from 'react';
import {
  isNotificationAudioUnlocked,
  subscribeNotificationAudioUnlock
} from '@/lib/chat/playNotificationTone';

export function useNotificationAudioUnlock(): boolean {
  return useSyncExternalStore(
    subscribeNotificationAudioUnlock,
    isNotificationAudioUnlocked,
    () => false
  );
}
