// Phase GC-Notification-Completion — thin bridge to Staff EXE native APIs (injected AutoFlowNative).

type AutoFlowNativeApi = {
  openGuestRoom?: (room: string) => Promise<unknown> | unknown;
  setUnansweredBadge?: (count: number) => Promise<unknown> | unknown;
  focus?: () => Promise<unknown> | unknown;
};

function nativeApi(): AutoFlowNativeApi | null {
  if (typeof window === 'undefined') return null;
  const n = (window as unknown as { AutoFlowNative?: AutoFlowNativeApi }).AutoFlowNative;
  return n && typeof n === 'object' ? n : null;
}

/** EXE: navigate webview like `autoflow://chat?guestRoom=N`. Browser: no-op. */
export function nativeOpenGuestRoom(roomNumber: string): boolean {
  const room = String(roomNumber || '').trim();
  if (!room) return false;
  const api = nativeApi();
  if (!api?.openGuestRoom) return false;
  try {
    void api.openGuestRoom(room);
    return true;
  } catch {
    return false;
  }
}

/** EXE: taskbar overlay + tray alert from unanswered total. Browser: no-op. */
export function nativeSetUnansweredBadge(count: number): void {
  const api = nativeApi();
  if (!api?.setUnansweredBadge) return;
  try {
    void api.setUnansweredBadge(Math.max(0, Math.floor(count) || 0));
  } catch {
    /* ignore */
  }
}

/**
 * Toast / notify click → open guest room.
 * Prefer native deep-link navigation; fall back to in-app select + URL sync.
 */
export function openGuestRoomFromNotify(
  roomNumber: string,
  selectRoom: (roomId: string) => void,
): void {
  const room = String(roomNumber || '').trim();
  if (!room) return;
  if (nativeOpenGuestRoom(room)) return;
  selectRoom(`cust-${room}`);
  try {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.pathname = '/chat';
    url.searchParams.set('guestRoom', room);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  } catch {
    /* ignore */
  }
}
