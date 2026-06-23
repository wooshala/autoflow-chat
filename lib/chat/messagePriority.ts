import type { ChatMessage } from '@/lib/types';

export type MessagePriority = 'normal' | 'urgent';

export function normalizeMessagePriority(value: string | null | undefined): MessagePriority {
  return value === 'urgent' ? 'urgent' : 'normal';
}

export function isUrgentMessage(msg: Pick<ChatMessage, 'priority'> | null | undefined): boolean {
  return normalizeMessagePriority(msg?.priority) === 'urgent';
}

export function parseSendPriority(raw: FormDataEntryValue | null | undefined): MessagePriority {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === 'urgent' ? 'urgent' : 'normal';
}
