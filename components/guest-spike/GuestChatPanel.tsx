'use client';

// Phase 1H.2 — COMPOSITION ROOT for the guest chat. This is the ONE panel reused by
// /g (mobile guest), /g-staff (Golden Reference) and /chat (real staff surface).
//
// RESPONSIBILITY: assembly ONLY. It wires
//   PollingController (usePollingMessages) · API adapter (sendGuestMessage)
//   · MessageList (GuestMessageList) · Composer (GuestMessageInput)
// and holds NO business logic — display logic is in buildMessageViewModel, network in
// api.ts, polling in usePollingMessages, input in GuestMessageInput.
//
// It NEVER maps a room to a channel: callers pass channelKey (resolved via channels.ts,
// the single source of truth). No `if (room === ...)` anywhere.
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import { useCallback } from 'react';

import { usePollingMessages } from '@/lib/guest-spike/usePollingMessages';
import { sendGuestMessage } from '@/lib/guest-spike/api';
import { GuestMessageList } from './GuestMessageList';
import { GuestMessageInput } from './GuestMessageInput';

export function GuestChatPanel({
  channelKey,
  viewerLang,
  counterpartLang,
  ownSender,
  ownLabel,
  otherLabel,
  emptyText,
  inputPlaceholder,
  sendLabel,
}: {
  channelKey: string;
  viewerLang: string;
  counterpartLang: string;
  ownSender: 'guest' | 'staff';
  ownLabel: string;
  otherLabel: string;
  emptyText: string;
  inputPlaceholder: string;
  sendLabel: string;
}) {
  const { messages, reload } = usePollingMessages(channelKey);

  const handleSend = useCallback(
    async (text: string) => {
      // guest sends in its own language; staff sends Korean (server default). Direction
      // of translation is decided server-side — the panel only forwards the text.
      await sendGuestMessage(channelKey, {
        text,
        sender: ownSender,
        lang: ownSender === 'guest' ? viewerLang : undefined,
      });
      await reload();
    },
    [channelKey, ownSender, viewerLang, reload],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <GuestMessageList
        messages={messages}
        viewerLang={viewerLang}
        counterpartLang={counterpartLang}
        ownSender={ownSender}
        ownLabel={ownLabel}
        otherLabel={otherLabel}
        emptyText={emptyText}
      />
      <GuestMessageInput onSend={handleSend} placeholder={inputPlaceholder} sendLabel={sendLabel} />
    </div>
  );
}
