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

function notifyContext() {
  return {
    permission:
      isBrowserNotificationSupported() && typeof window !== 'undefined'
        ? Notification.permission
        : 'unsupported',
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    hasFocus:
      typeof document !== 'undefined' && typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : null
  };
}

export async function showBrowserNotification(params: {
  title: string;
  body?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  messageId?: string;
  source?: string;
  /** Phase 2D — optional click handler (e.g. select the room). Runs after window.focus(). */
  onClick?: () => void;
}): Promise<boolean> {
  const ctx = notifyContext();

  console.log('[NOTIFY_CREATE_ATTEMPT]', {
    source: params.source ?? null,
    messageId: params.messageId ?? null,
    silent: params.silent ?? true
  });
  console.log('[CHAT_BROWSER_NOTIFY_ATTEMPT]', {
    channel: 'os_notification',
    ...ctx,
    title: params.title,
    bodyPreview: String(params.body || '').slice(0, 80),
    tag: params.tag ?? null,
    tagOmitted: params.tag == null || params.tag === '',
    silent: params.silent ?? false,
    requireInteraction: params.requireInteraction ?? false,
    messageId: params.messageId ?? null,
    source: params.source ?? null
  });

  if (!canShowBrowserNotification()) {
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', {
      channel: 'os_notification',
      ...ctx,
      reason: ctx.permission === 'denied' ? 'permission_denied' : 'permission_not_granted'
    });
    return false;
  }

  try {
    // Default to SILENT: AutoFlow plays its own (picker-respecting) sound. A
    // non-silent OS notification would add the Windows default beep on top,
    // causing the duplicate / mute-still-beeps bugs.
    const silent = params.silent ?? true;
    const options: NotificationOptions = {
      body: params.body,
      requireInteraction: params.requireInteraction ?? false,
      silent
    };
    if (params.tag != null && params.tag !== '') {
      options.tag = params.tag;
    }

    const n = new Notification(params.title, options);

    console.log('[NOTIFY_CREATE_DONE]', {
      source: params.source ?? null,
      messageId: params.messageId ?? null,
      silent
    });
    console.log('[NOTIFY_SOUND_BROWSER]', {
      source: params.source ?? null,
      messageId: params.messageId ?? null,
      silent,
      note: silent ? 'os_sound_suppressed' : 'os_default_sound_will_play'
    });

    console.log('[CHAT_BROWSER_NOTIFY_CREATED]', {
      channel: 'os_notification',
      ...ctx,
      title: params.title,
      tag: options.tag ?? null,
      messageId: params.messageId ?? null,
      source: params.source ?? null
    });

    n.onshow = () => {
      console.log('[CHAT_BROWSER_NOTIFY_SHOW]', {
        channel: 'os_notification',
        ...notifyContext(),
        title: params.title,
        tag: options.tag ?? null,
        messageId: params.messageId ?? null,
        source: params.source ?? null
      });
    };

    n.onclose = () => {
      console.log('[CHAT_BROWSER_NOTIFY_CLOSE]', {
        channel: 'os_notification',
        title: params.title,
        tag: options.tag ?? null,
        messageId: params.messageId ?? null,
        source: params.source ?? null
      });
    };

    n.onerror = (event: Event) => {
      console.log('[CHAT_BROWSER_NOTIFY_ERROR]', {
        channel: 'os_notification',
        title: params.title,
        tag: options.tag ?? null,
        messageId: params.messageId ?? null,
        source: params.source ?? null,
        eventType: event?.type ?? 'error'
      });
    };

    n.onclick = () => {
      console.log('[CHAT_BROWSER_NOTIFY_CLICK]', {
        channel: 'os_notification',
        title: params.title,
        tag: options.tag ?? null,
        messageId: params.messageId ?? null,
        source: params.source ?? null
      });
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
      try {
        params.onClick?.();
      } catch {
        /* ignore */
      }
    };

    console.log('[CHAT_BROWSER_NOTIFY_OK]', {
      channel: 'os_notification',
      ...ctx,
      tag: options.tag ?? null,
      messageId: params.messageId ?? null,
      source: params.source ?? null,
      note: 'constructor_ok; await NOTIFY_SHOW for OS display'
    });
    return true;
  } catch (err: unknown) {
    const error = err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
    console.log('[CHAT_BROWSER_NOTIFY_FAILED]', {
      channel: 'os_notification',
      ...ctx,
      ...error
    });
    return false;
  }
}
