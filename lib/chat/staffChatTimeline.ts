import type { ChatMessage } from '@/lib/types';

export type StaffTimelineDropCounts = {
  missing_id: number;
  is_deleted: number;
};

function sortMessagesAsc(items: ChatMessage[]): ChatMessage[] {
  return [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

/**
 * Staff-chat shared timeline: only drop deleted + rows without id.
 * user=cleaner1 is NOT used here — sender identity is handled at render (isStaffChatSelfMessage).
 */
export function buildStaffChatVisibleTimeline(messages: ChatMessage[]): {
  visible: ChatMessage[];
  drops: StaffTimelineDropCounts;
} {
  const drops: StaffTimelineDropCounts = {
    missing_id: 0,
    is_deleted: 0
  };

  const visible: ChatMessage[] = [];
  for (const m of messages) {
    if (!m?.id) {
      drops.missing_id += 1;
      continue;
    }
    if (m.is_deleted) {
      drops.is_deleted += 1;
      continue;
    }
    visible.push(m);
  }

  return { visible: sortMessagesAsc(visible), drops };
}

export function logStaffChatVisibleMessages(
  messages: ChatMessage[],
  extra?: Record<string, unknown>
): ChatMessage[] {
  const { visible, drops } = buildStaffChatVisibleTimeline(messages);
  const mobile = visible.filter((m) => m.sender_side === 'mobile').length;
  const pc = visible.filter((m) => m.sender_side === 'pc').length;

  console.log('[STAFF_CHAT_VISIBLE_MESSAGES]', {
    count: visible.length,
    mobile_count: mobile,
    pc_count: pc,
    input_count: messages.length,
    drops,
    user_filter: 'none',
    room_id_filter: 'none',
    token_filter: 'none',
    sender_side_filter: 'none',
    ...extra
  });

  return visible;
}
