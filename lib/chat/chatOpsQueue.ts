import type { MainCategory, ClassificationFlags } from '@/lib/chat/classifyMessageCategory';
import type { NotificationTone } from '@/lib/chat/notificationTone';
import { getMessageActionSummary } from '@/lib/chat/getMessageActionSummary';
import { getQueuePriority } from '@/lib/chat/getQueuePriority';

export type QueueItemStatus = 'new' | 'acknowledged' | 'done' | 'deferred';

export type ChatOpsQueueItem = {
  id: string;
  messageId: string;
  createdAt: string;
  text: string;
  roomNumber: string | null;
  mainCategory: MainCategory;
  flags: ClassificationFlags;
  tone: NotificationTone;
  summary: string;
  status: QueueItemStatus;
  source?: 'chat';
  debug?: {
    matchedKeywords: Record<string, string[]>;
    reasons: string[];
  };
};

const STORAGE_KEY = 'chat_ops_queue_v1';

function normalize(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function shouldIgnoreQueueText(text: string): boolean {
  const t = normalize(text).toLowerCase();
  if (!t) return true;
  if (t.startsWith('notify-smoke-')) return true;
  if (t === '테스트' || t.startsWith('test')) return true;
  if (t.length <= 2) return true;
  return false;
}

export function shouldCreateQueueItem(params: {
  mainCategory: MainCategory;
  flags: ClassificationFlags;
  tone: NotificationTone;
  text: string;
}): boolean {
  if (shouldIgnoreQueueText(params.text)) return false;
  if (params.tone === 'silent' && params.mainCategory === 'general' && !params.flags.urgent && !params.flags.request && !params.flags.status) {
    return false;
  }
  return (
    params.flags.urgent ||
    params.flags.request ||
    params.flags.status ||
    params.mainCategory !== 'general'
  );
}

export function toQueueItem(params: {
  messageId: string;
  createdAt: string;
  text: string;
  roomNumber: string | null;
  mainCategory: MainCategory;
  flags: ClassificationFlags;
  tone: NotificationTone;
  debug?: ChatOpsQueueItem['debug'];
}): ChatOpsQueueItem {
  const summary = getMessageActionSummary({
    text: params.text,
    roomNumber: params.roomNumber,
    mainCategory: params.mainCategory,
    flags: params.flags
  });

  return {
    id: `q-${params.messageId}`,
    messageId: params.messageId,
    createdAt: params.createdAt,
    text: normalize(params.text),
    roomNumber: params.roomNumber,
    mainCategory: params.mainCategory,
    flags: params.flags,
    tone: params.tone,
    summary,
    status: 'new',
    source: 'chat',
    debug: params.debug
  };
}

export function findMergeableQueueItem(
  items: ChatOpsQueueItem[],
  incoming: ChatOpsQueueItem
): ChatOpsQueueItem | null {
  return (
    items.find(
      (item) =>
        item.status !== 'done' &&
        Boolean(item.roomNumber) &&
        Boolean(incoming.roomNumber) &&
        item.roomNumber === incoming.roomNumber &&
        item.mainCategory === incoming.mainCategory
    ) ?? null
  );
}

export function mergeQueueItem(existing: ChatOpsQueueItem, incoming: ChatOpsQueueItem): ChatOpsQueueItem {
  return {
    ...existing,
    createdAt: incoming.createdAt, // treat as "last updated" for sorting
    text: incoming.text,
    tone: incoming.tone,
    flags: incoming.flags,
    summary: incoming.summary,
    debug: incoming.debug ?? existing.debug
  };
}

export function sortQueueItems(items: ChatOpsQueueItem[]): ChatOpsQueueItem[] {
  const withMeta = items.map((it) => ({
    it,
    priority: getQueuePriority({ mainCategory: it.mainCategory, flags: it.flags }),
    ts: Date.parse(it.createdAt) || 0
  }));

  return withMeta
    .sort((a, b) => {
      // Keep done at the bottom
      const aDone = a.it.status === 'done';
      const bDone = b.it.status === 'done';
      if (aDone !== bDone) return aDone ? 1 : -1;

      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.ts - a.ts;
    })
    .map((x) => x.it);
}

export function loadQueueFromStorage(): ChatOpsQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ChatOpsQueueItem[] = [];
    for (const v of parsed) {
      if (!v || typeof v !== 'object') continue;
      if (typeof v.messageId !== 'string' || typeof v.id !== 'string') continue;
      if (typeof v.createdAt !== 'string' || typeof v.text !== 'string') continue;
      if (typeof v.mainCategory !== 'string') continue;
      if (typeof v.status !== 'string') continue;
      out.push(v as ChatOpsQueueItem);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveQueueToStorage(items: ChatOpsQueueItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

