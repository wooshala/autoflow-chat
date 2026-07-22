// TEMPORARY on-screen debug store for the QR guest NOTIFICATION DECISION path (not the sound
// output layer). Active ONLY when the URL has ?sounddebug=1 — otherwise every function no-ops and
// nothing renders, so UI/behavior are unchanged. Keeps the last 30 decisions in memory.
//
// PRIVACY: NEVER stores message body / customer name / phone. Only truncated ids (first 6 chars)
// and decision flags. To be removed by a follow-up PR once the root cause is confirmed.

export type GuestSoundSkipReason =
  | 'no_new_message'
  | 'dedupe'
  | 'initial_baseline'
  | 'active_room_suppression'
  | 'notification_permission'
  | 'foreground'
  | 'sound_locked'
  | 'unknown'
  | null; // null = fired with no skip

export interface GuestSoundDebugEntry {
  ts: string; // HH:MM:SS (local)
  detectedNew: boolean; // summary poll saw a NEW guest message id for this room
  roomId6: string;
  sessionId6: string;
  messageId6: string;
  shouldNotify: boolean;
  reason: GuestSoundSkipReason;
  visibilityState: string | null;
  hasFocus: boolean | null;
  isBackground: boolean;
  canShowBrowserNotification: boolean;
  playToneCalled: boolean;
  playToneResult: boolean | null; // null until the promise resolves
  showNotifCalled: boolean;
  showNotifResult: boolean | null;
}

const MAX_ENTRIES = 30;

let entries: GuestSoundDebugEntry[] = [];
const listeners = new Set<() => void>();
// Per-room signature of the last recorded decision, so a stable state (e.g. repeated dedupe every
// 5s poll) is collapsed instead of flooding the 30-line buffer.
const lastSigByRoom = new Map<string, string>();

const SESSION_KEY = 'sounddebug';

/** Enabled when EITHER ?sounddebug=1 (browser verify) OR sessionStorage.sounddebug==='1' (the
 *  Ctrl+Shift+D toggle, the only path that works in the address-bar-less operational EXE). Both
 *  reads are exception-safe and return false under SSR / no window. */
export function isGuestSoundDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('sounddebug') === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Toggle the sessionStorage debug flag (persists across refresh for this WebView session, gone on
 *  EXE exit). Notifies subscribers so the panel shows/hides immediately. Returns the new state. */
export function toggleGuestSoundDebug(): boolean {
  if (typeof window === 'undefined') return false;
  let next = false;
  try {
    const on = window.sessionStorage.getItem(SESSION_KEY) === '1';
    if (on) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, '1');
    next = !on;
  } catch {
    return isGuestSoundDebugEnabled();
  }
  emit();
  return next;
}

function emit(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

function first6(v: string | null | undefined): string {
  const s = String(v ?? '');
  return s ? s.slice(0, 6) : '—';
}

function nowHms(): string {
  try {
    return new Date().toTimeString().slice(0, 8);
  } catch {
    return '--:--:--';
  }
}

/**
 * Record one guest notification decision. No-op (returns null) unless ?sounddebug=1. Consecutive
 * identical decisions for the same room are collapsed. Returns the stored entry so the caller can
 * attach async results (playTone / showNotif) via updateGuestSoundResult.
 */
export function recordGuestSoundDecision(input: {
  roomId: string;
  sessionId: string | null;
  messageId: string | null;
  detectedNew: boolean;
  shouldNotify: boolean;
  reason: GuestSoundSkipReason;
  visibilityState: string | null;
  hasFocus: boolean | null;
  isBackground: boolean;
  canShowBrowserNotification: boolean;
  playToneCalled: boolean;
  showNotifCalled: boolean;
}): GuestSoundDebugEntry | null {
  if (!isGuestSoundDebugEnabled()) return null;

  const sig = [
    input.messageId ?? 'none',
    input.shouldNotify ? '1' : '0',
    input.reason ?? 'fired',
    input.playToneCalled ? 'pt' : '-',
    input.showNotifCalled ? 'os' : '-',
  ].join('|');
  if (lastSigByRoom.get(input.roomId) === sig) return null; // collapse stable repeats
  lastSigByRoom.set(input.roomId, sig);

  const entry: GuestSoundDebugEntry = {
    ts: nowHms(),
    detectedNew: input.detectedNew,
    roomId6: first6(input.roomId),
    sessionId6: first6(input.sessionId),
    messageId6: first6(input.messageId),
    shouldNotify: input.shouldNotify,
    reason: input.reason,
    visibilityState: input.visibilityState,
    hasFocus: input.hasFocus,
    isBackground: input.isBackground,
    canShowBrowserNotification: input.canShowBrowserNotification,
    playToneCalled: input.playToneCalled,
    playToneResult: null,
    showNotifCalled: input.showNotifCalled,
    showNotifResult: null,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  return entry;
}

/** Patch async results onto an entry from recordGuestSoundDecision. No-op for null. */
export function updateGuestSoundResult(
  entry: GuestSoundDebugEntry | null,
  patch: Partial<Pick<GuestSoundDebugEntry, 'playToneResult' | 'showNotifResult' | 'reason'>>,
): void {
  if (!entry) return;
  Object.assign(entry, patch);
  emit();
}

export function getGuestSoundDebugEntries(): GuestSoundDebugEntry[] {
  return entries;
}

export function subscribeGuestSoundDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
