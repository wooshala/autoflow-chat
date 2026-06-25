export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function ensureBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function canShowBrowserNotification(): boolean {
  return isBrowserNotificationSupported() && Notification.permission === 'granted';
}

export async function showBrowserNotification(params: {
  title: string;
  body?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  messageId?: string;
  source?: string;
}): Promise<boolean> {
  const permission =
    isBrowserNotificationSupported() && typeof window !== 'undefined'
      ? Notification.permission
      : 'unsupported';

  console.log('[CHAT_BROWSER_NOTIFY_ATTEMPT]', {
    permission,
    title: params.title,
    bodyPreview: String(params.body || '').slice(0, 80),
    tag: params.tag ?? null,
    silent: params.silent ?? false,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    messageId: params.messageId ?? null,
    source: params.source ?? null
  });

  if (!canShowBrowserNotification()) {
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', {
      permission,
      reason: permission === 'denied' ? 'permission_denied' : 'permission_not_granted'
    });
    return false;
  }

  try {
    const n = new Notification(params.title, {
      body: params.body,
      tag: params.tag,
      requireInteraction: params.requireInteraction ?? false,
      silent: params.silent ?? false
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
    console.log('[CHAT_BROWSER_NOTIFY_OK]', { permission, tag: params.tag ?? null });
    return true;
  } catch (err: unknown) {
    const error = err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', { permission, ...error });
    return false;
  }
}
