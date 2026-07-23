// Phase 1H.1 — the ONE bubble both guest & staff screens use. It never selects a string
// or branches on language: it draws displayText (line 1) and, only when showOriginal,
// originalText (line 2, gray/smaller/no italics). Text logic lives in buildMessageViewModel.

import type { MessageViewModel } from '@/lib/guest-spike/messageViewModel';

export function MessageBubble({
  vm,
  align,
  label,
  own,
  time,
}: {
  vm: MessageViewModel;
  align: 'left' | 'right';
  label: string;
  own: boolean;
  /** Pre-formatted MM/DD HH:mm (display-only, same as the staff ops chat). Not text/language
   *  logic, so the "frozen" renderer contract (no string/language selection here) is preserved. */
  time?: string;
}) {
  return (
    <div style={{ alignSelf: align === 'right' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 16,
          background: own ? '#FEE500' : '#fff',
          border: own ? 'none' : '1px solid #e5e7eb',
          color: '#111',
        }}
      >
        {/* line 1 — display (viewer's language) */}
        <div style={{ fontSize: 15, lineHeight: 1.4 }}>{vm.displayText}</div>
        {/* line 2 — original, shown only when it differs (single condition) */}
        {vm.showOriginal && (
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, lineHeight: 1.35 }}>{vm.originalText}</div>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', textAlign: align, marginTop: 2 }}>
        {label}
        {time ? <span style={{ marginLeft: 6 }}>{time}</span> : null}
      </div>
    </div>
  );
}
