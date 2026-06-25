'use client';

import { useCallback, useEffect, useState } from 'react';
import { isBrowserNotificationSupported } from '@/lib/chat/browserNotifications';

export type ChatNotifyPermissionUi = NotificationPermission | 'unsupported';

function readPermission(): ChatNotifyPermissionUi {
  if (typeof window === 'undefined' || !isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

function readVisibility(): DocumentVisibilityState | 'unknown' {
  if (typeof document === 'undefined') return 'unknown';
  return document.visibilityState;
}

/** Live permission + visibility for /chat notify diagnostics. */
export function useChatNotifyDiagState() {
  const [permission, setPermission] = useState<ChatNotifyPermissionUi>('unsupported');
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState | 'unknown'>('unknown');

  const refresh = useCallback(() => {
    setPermission(readPermission());
    setVisibilityState(readVisibility());
  }, []);

  useEffect(() => {
    refresh();
    const onVis = () => refresh();
    window.addEventListener('focus', onVis);
    window.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onVis);
      window.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  return { permission, visibilityState, refresh };
}
