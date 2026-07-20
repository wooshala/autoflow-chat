'use client';

// Phase 1H.2 — COMPOSER. Owns only the draft/sending UI + Enter/IME handling. It does
// NOT know channels, senders, translation or the API — it just calls onSend(text).
//
// TODO(canonical-namespace): guest-spike → guest-chat (later refactor step).

import { useCallback, useState } from 'react';

export function GuestMessageInput({
  onSend,
  placeholder,
  sendLabel,
}: {
  onSend: (text: string) => Promise<void>;
  placeholder: string;
  sendLabel: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return; // send lock: blocks button + Enter re-send while in flight
    setSending(true);
    try {
      await onSend(body);
      setText(''); // clear ONLY on success
    } catch {
      // send failed → keep the draft so the message is not lost
    } finally {
      setSending(false); // re-enable after the request settles
    }
  }, [text, sending, onSend]);

  return (
    <div style={{ display: 'flex', gap: 8, padding: 12, background: '#fff', borderTop: '1px solid #e5e7eb' }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        style={{ flex: 1, resize: 'none', borderRadius: 20, border: '1px solid #d1d5db', padding: '10px 14px', fontSize: 15, outline: 'none' }}
      />
      <button
        onClick={() => void submit()}
        disabled={!text.trim() || sending}
        style={{ borderRadius: 20, border: 'none', background: '#FEE500', fontWeight: 700, padding: '0 18px', fontSize: 15, opacity: !text.trim() || sending ? 0.5 : 1 }}
      >
        {sending ? '…' : sendLabel}
      </button>
    </div>
  );
}
