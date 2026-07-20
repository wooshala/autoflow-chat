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

import { useCallback, useEffect } from 'react';

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
  disabledNotice,
  onChannelMeta,
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
  /** Phase 1H.5 — when set, the composer is replaced by this notice (e.g. staff cannot
   *  reply until the guest has chosen a language). Messages still render + poll. */
  disabledNotice?: string;
  /** Phase 1H.5 — the channel language from THIS panel's own message poll. Lets the open
   *  room reuse a single poll (no separate meta poll). Fired whenever the value changes. */
  onChannelMeta?: (meta: { preferred_language: string | null; language_source: string | null }) => void;
}) {
  const { messages, preferred_language, language_source, reload } = usePollingMessages(channelKey);

  useEffect(() => {
    onChannelMeta?.({ preferred_language, language_source });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferred_language, language_source]);

  const handleSend = useCallback(
    async (text: string) => {
      // The server decides language: guest → LLM detect+translate→ko; staff → ko→preferred.
      // The panel only forwards the text (a 409/failed send throws → the input keeps the draft).
      await sendGuestMessage(channelKey, { text, sender: ownSender });
      await reload();
    },
    [channelKey, ownSender, reload],
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
      {disabledNotice ? (
        <div style={{ padding: 14, background: '#fff', borderTop: '1px solid #e5e7eb', color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
          {disabledNotice}
        </div>
      ) : (
        <GuestMessageInput onSend={handleSend} placeholder={inputPlaceholder} sendLabel={sendLabel} />
      )}
    </div>
  );
}
