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
  canDelete,
  deleteBusy,
  onDelete,
}: {
  vm: MessageViewModel;
  align: 'left' | 'right';
  label: string;
  own: boolean;
  /** Pre-formatted MM/DD HH:mm (display-only, same as the staff ops chat). Not text/language
   *  logic, so the "frozen" renderer contract (no string/language selection here) is preserved. */
  time?: string;
  canDelete?: boolean;
  deleteBusy?: boolean;
  onDelete?: () => void | Promise<void>;
}) {
  const deleted = Boolean(vm.isDeleted);

  return (
    <div style={{ alignSelf: align === 'right' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
        {canDelete && !deleted ? (
          <button
            type="button"
            disabled={deleteBusy}
            aria-label="메시지 삭제"
            onClick={() => void onDelete?.()}
            style={{
              flexShrink: 0,
              marginTop: 2,
              border: 'none',
              background: 'transparent',
              color: '#6b7280',
              fontSize: 10,
              cursor: deleteBusy ? 'not-allowed' : 'pointer',
              opacity: deleteBusy ? 0.4 : 1,
              padding: '2px 4px',
            }}
          >
            {deleteBusy ? '삭제 중' : '삭제'}
          </button>
        ) : null}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 16,
            background: deleted ? '#f3f4f6' : own ? '#FEE500' : '#fff',
            border: deleted ? '1px solid #e5e7eb' : own ? 'none' : '1px solid #e5e7eb',
            color: deleted ? '#9ca3af' : '#111',
          }}
        >
          <div style={{ fontSize: deleted ? 12 : 15, lineHeight: 1.4, fontWeight: deleted ? 400 : undefined }}>
            {vm.displayText}
          </div>
          {!deleted && vm.showOriginal && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, lineHeight: 1.35 }}>{vm.originalText}</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#9ca3af', textAlign: align, marginTop: 2 }}>
        {label}
        {time ? <span style={{ marginLeft: 6 }}>{time}</span> : null}
      </div>
    </div>
  );
}
