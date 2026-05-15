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
}): Promise<boolean> {
  if (!canShowBrowserNotification()) return false;
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
    return true;
  } catch {
    return false;
  }
}

