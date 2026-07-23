'use client';

// Phase 1H.2 — MESSAGE LIST. Renders each message through the Canonical pair
// (buildMessageViewModel → MessageBubble). It computes ONLY layout (own/align/label) —
// never text/language selection (that lives in buildMessageViewModel). Language-agnostic.
//
// TODO(canonical-namespace): MessageBubble → GuestMessageBubble, guest-spike → guest-chat.

import { useEffect, useRef } from 'react';

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
}: {
  messages: GuestSpikeMsg[];
  viewerLang: string;
  counterpartLang: string;
  ownSender: 'guest' | 'staff';
  ownLabel: string;
  otherLabel: string;
  emptyText: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
        return (
          <MessageBubble
            key={m.id}
            vm={buildMessageViewModel(m, viewerLang, counterpartLang)}
            align={own ? 'right' : 'left'}
            own={own}
            label={own ? ownLabel : otherLabel}
            time={formatKSTShort(m.created_at)} // same MM/DD HH:mm formatter as the staff ops chat
          />
        );
      })}
    </div>
  );
}
