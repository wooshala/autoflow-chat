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

import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePollingMessages } from '@/lib/guest-spike/usePollingMessages';
import { deleteGuestMessage, sendGuestMessage, type GuestSpikeMsg } from '@/lib/guest-spike/api';
import { loadStoredSessionMeta } from '@/lib/auth/staffAccountSession';
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
  asStaff,
}: {
  channelKey: string;
  viewerLang: string;
  counterpartLang: string;
  ownSender: 'guest' | 'staff';
  /** Phase 1H.7 — staff operates on the channel's ACTIVE session (ignores guest cookie). */
  asStaff?: boolean;
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
  onChannelMeta?: (meta: {
    preferred_language: string | null;
    language_source: string | null;
    session_status: 'open' | 'none' | null;
    /** Phase 1H.11 — created_at of the newest alive GUEST message (for read-marking). */
    latest_guest_message_at: string | null;
  }) => void;
}) {
  const { messages, preferred_language, language_source, session_status, reload } = usePollingMessages(
    channelKey,
    asStaff,
  );
  const [localMessages, setLocalMessages] = useState<GuestSpikeMsg[] | null>(null);

  const displayMessages = localMessages ?? messages;
  useEffect(() => {
    // Server poll is source of truth; clear optimistic overlay when poll updates.
    setLocalMessages(null);
  }, [messages]);

  // Newest non-deleted guest message (unanswered / unread must recalculate after delete).
  const latestGuestMessageAt = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const m = displayMessages[i];
      if (m.sender === 'guest' && !m.is_deleted) return m.created_at;
    }
    return null;
  }, [displayMessages]);

  useEffect(() => {
    onChannelMeta?.({
      preferred_language,
      language_source,
      session_status,
      latest_guest_message_at: latestGuestMessageAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferred_language, language_source, session_status, latestGuestMessageAt]);

  const handleSend = useCallback(
    async (text: string) => {
      await sendGuestMessage(channelKey, { text, sender: ownSender }, asStaff);
      await reload();
    },
    [channelKey, ownSender, asStaff, reload],
  );

  const canDeleteMessage = useCallback(
    (msg: GuestSpikeMsg) => {
      if (msg.is_deleted) return false;
      if (msg.sender !== ownSender) return false;
      if (ownSender === 'guest') return true;
      // staff: only messages stamped with this staff userId (legacy null → no client delete button)
      const meta = loadStoredSessionMeta();
      if (!meta?.userId || !msg.staff_user_id) return false;
      return String(msg.staff_user_id) === String(meta.userId);
    },
    [ownSender],
  );

  const handleDelete = useCallback(
    async (msg: GuestSpikeMsg) => {
      setLocalMessages((prev) => {
        const base = prev ?? messages;
        return base.map((m) =>
          m.id === msg.id ? { ...m, is_deleted: true, deleted_at: new Date().toISOString() } : m,
        );
      });
      try {
        const updated = await deleteGuestMessage(channelKey, msg.id, asStaff);
        setLocalMessages((prev) => {
          const base = prev ?? messages;
          return base.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
        });
      } catch {
        setLocalMessages(null);
        await reload();
        alert('메시지 삭제에 실패했습니다.');
      }
    },
    [channelKey, asStaff, messages, reload],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <GuestMessageList
        messages={displayMessages}
        viewerLang={viewerLang}
        counterpartLang={counterpartLang}
        ownSender={ownSender}
        ownLabel={ownLabel}
        otherLabel={otherLabel}
        emptyText={emptyText}
        onDeleteMessage={handleDelete}
        canDeleteMessage={canDeleteMessage}
      />
      {disabledNotice ? (
        <div
          style={{
            padding: 14,
            background: '#fff',
            borderTop: '1px solid #e5e7eb',
            color: '#6b7280',
            fontSize: 13,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {disabledNotice}
        </div>
      ) : (
        <GuestMessageInput onSend={handleSend} placeholder={inputPlaceholder} sendLabel={sendLabel} />
      )}
    </div>
  );
}
