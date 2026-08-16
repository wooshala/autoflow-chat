'use client';

// Phase 1H.2 — MESSAGE LIST. Renders each message through the Canonical pair
// (buildMessageViewModel → MessageBubble). It computes ONLY layout (own/align/label) —
// never text/language selection (that lives in buildMessageViewModel). Language-agnostic.
//
// TODO(canonical-namespace): MessageBubble → GuestMessageBubble, guest-spike → guest-chat.

import { useEffect, useRef, useState } from 'react';

import { buildMessageViewModel } from '@/lib/guest-spike/messageViewModel';
import type { GuestSpikeMsg } from '@/lib/guest-spike/api';
import { formatKSTShort } from '@/lib/formatKST';
import { MessageBubble } from './MessageBubble';

export function GuestMessageList({
  messages,
  viewerLang,
  counterpartLang,
  ownSender,
  ownLabel,
  otherLabel,
  emptyText,
  onDeleteMessage,
  canDeleteMessage,
}: {
  messages: GuestSpikeMsg[];
  viewerLang: string;
  counterpartLang: string;
  ownSender: 'guest' | 'staff';
  ownLabel: string;
  otherLabel: string;
  emptyText: string;
  onDeleteMessage?: (msg: GuestSpikeMsg) => void | Promise<void>;
  /** Extra gate (e.g. admin can delete others). Default: own + not deleted. */
  canDeleteMessage?: (msg: GuestSpikeMsg) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);

  return (
    <div
      ref={ref}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {messages.length === 0 && (
        <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14 }}>{emptyText}</div>
      )}
      {messages.map((m) => {
        const own = m.sender === ownSender; // layout only — NOT text selection
        const deleted = Boolean(m.is_deleted);
        const canDelete =
          !deleted &&
          typeof onDeleteMessage === 'function' &&
          (canDeleteMessage ? canDeleteMessage(m) : own);

        return (
          <MessageBubble
            key={m.id}
            vm={buildMessageViewModel(m, viewerLang, counterpartLang)}
            align={own ? 'right' : 'left'}
            own={own}
            label={own ? ownLabel : otherLabel}
            time={formatKSTShort(m.created_at)}
            canDelete={canDelete}
            deleteBusy={deletingId === m.id}
            onDelete={
              canDelete
                ? async () => {
                    if (!confirm('삭제하시겠습니까?')) return;
                    setDeletingId(m.id);
                    try {
                      await onDeleteMessage!(m);
                    } finally {
                      setDeletingId(null);
                    }
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
