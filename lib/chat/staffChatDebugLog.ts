export type StaffChatDebugEntry = {
  id: string;
  at: string;
  tag: string;
  payload: string;
};

const MAX_ENTRIES = 50;

/** Tags captured when ?debug=1 (FAILED aliases user-facing ERROR label). */
export const STAFF_CHAT_DEBUG_LOG_TAGS = new Set([
  'CHAT_SELF_CHECK',
  'STAFF_CHAT_SOUND_PLAY',
  'STAFF_SERVER_TTS_CLIENT_START',
  'STAFF_SERVER_TTS_CLIENT_PLAYING',
  'STAFF_SERVER_TTS_CLIENT_ERROR',
  'STAFF_SERVER_TTS_CLIENT_FAILED',
  'STAFF_TTS_VOICE_SELECTED'
]);

const TAG_DISPLAY: Record<string, string> = {
  STAFF_SERVER_TTS_CLIENT_FAILED: 'STAFF_SERVER_TTS_CLIENT_ERROR'
};

let entries: StaffChatDebugEntry[] = [];
const listeners = new Set<(next: StaffChatDebugEntry[]) => void>();

let originalConsoleLog: typeof console.log | null = null;
let hookInstalled = false;

export function isStaffChatDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

export function subscribeStaffChatDebugLog(listener: (next: StaffChatDebugEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    listener(entries);
  }
}

export function pushStaffChatDebugLog(tag: string, data: unknown) {
  if (!STAFF_CHAT_DEBUG_LOG_TAGS.has(tag)) return;
  const displayTag = TAG_DISPLAY[tag] ?? tag;
  let payload = '';
  try {
    payload =
      data === undefined
        ? ''
        : typeof data === 'string'
          ? data
          : JSON.stringify(data);
  } catch {
    payload = String(data);
  }

  const entry: StaffChatDebugEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString().slice(11, 23),
    tag: displayTag,
    payload
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  notify();
}

function parseConsoleLogArgs(args: unknown[]): { tag: string; data: unknown } | null {
  if (!args.length || typeof args[0] !== 'string') return null;
  const match = args[0].match(/^\[([A-Z0-9_]+)\]$/);
  if (!match) return null;
  const tag = match[1];
  if (!STAFF_CHAT_DEBUG_LOG_TAGS.has(tag)) return null;
  return { tag, data: args.length > 1 ? args[1] : undefined };
}

export function installStaffChatDebugConsoleHook(enable: boolean) {
  if (typeof window === 'undefined') return;

  if (enable && !hookInstalled) {
    originalConsoleLog = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      originalConsoleLog?.(...args);
      const parsed = parseConsoleLogArgs(args);
      if (parsed) pushStaffChatDebugLog(parsed.tag, parsed.data);
    };
    hookInstalled = true;
    return;
  }

  if (!enable && hookInstalled && originalConsoleLog) {
    console.log = originalConsoleLog;
    originalConsoleLog = null;
    hookInstalled = false;
  }
}

export function formatStaffChatDebugLogsForCopy(logs: StaffChatDebugEntry[]): string {
  return logs
    .map((e) => `[${e.at}] [${e.tag}]${e.payload ? ` ${e.payload}` : ''}`)
    .join('\n');
}
