'use client';

// TEMPORARY bottom-right overlay listing the most recent QR guest notification decisions.
// - Always mounted; the Ctrl+Alt+F12 keydown listener is always registered (works in the
//   address-bar-less operational EXE, no Rust rebuild).
// - UI renders ONLY when enabled (?sounddebug=1 OR sessionStorage.sounddebug==='1') → null otherwise.
// - Observation only: container is pointer-events:none, has NO focusable/interactive elements, so it
//   cannot steal clicks/focus or change document.hasFocus()/visibilityState.
// - Shows truncated ids + decision flags only — never message body / customer name / phone.
// To be removed by a follow-up PR once the guest-sound root cause is confirmed.

import { useEffect, useState } from 'react';

import {
  getGuestSoundDebugEntries,
  isGuestSoundDebugEnabled,
  subscribeGuestSoundDebug,
  toggleGuestSoundDebug,
  type GuestSoundDebugEntry,
} from '@/lib/guest-spike/guestSoundDebug';

function b(v: boolean | null): string {
  return v === null ? '·' : v ? '✓' : '✗';
}

function rowColor(e: GuestSoundDebugEntry): string {
  if (e.shouldNotify && e.playToneResult === true) return '#7CFF9B'; // fired + sound ok
  if (e.shouldNotify && e.playToneResult === false) return '#FF8A8A'; // fired but sound failed
  if (e.shouldNotify) return '#FFD479'; // fired, result pending
  return '#9BB4FF'; // skipped
}

export function GuestSoundDebugPanel() {
  const [mounted, setMounted] = useState(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-render on any store change: record()/updateResult() add rows, toggle() flips enabled.
  useEffect(() => subscribeGuestSoundDebug(() => forceRender((n) => n + 1)), []);

  // Always-on Ctrl+Alt+F12 toggle — registered even while the panel UI is hidden (OFF).
  // (Was Ctrl+Shift+D, which collided with the operator PC's global AlCapture hotkey.)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.altKey && e.code === 'F12')) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      // Do not hijack typing in text fields / selects / rich editors.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t?.isContentEditable ?? false)) return;
      e.preventDefault();
      toggleGuestSoundDebug();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const enabled = mounted && isGuestSoundDebugEnabled();
  if (!enabled) return null;

  const entries = getGuestSoundDebugEntries();

  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        width: 460,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: '46vh',
        overflow: 'hidden',
        background: 'rgba(10,14,20,0.92)',
        color: '#E6EDF3',
        border: '1px solid #2b3644',
        borderRadius: 8,
        padding: '8px 10px',
        font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        pointerEvents: 'none', // observation only — never intercept clicks/focus/scroll
        userSelect: 'none',
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ color: '#7CFF9B' }}>Guest Sound Debug ON</strong>
        <span style={{ color: '#8FA3B8' }}>Ctrl+Alt+F12: OFF · {entries.length}/30</span>
      </div>
      {entries.length === 0 ? (
        <div style={{ color: '#8FA3B8' }}>대기 중 — 게스트 메시지 수신 시 판정이 기록됩니다.</div>
      ) : (
        entries.map((e, i) => (
          <div
            key={i}
            style={{
              color: rowColor(e),
              whiteSpace: 'nowrap',
              borderTop: i ? '1px solid #1b2430' : undefined,
              paddingTop: i ? 3 : 0,
              marginTop: i ? 3 : 0,
            }}
          >
            <span style={{ color: '#8FA3B8' }}>{e.ts}</span> room={e.roomId6} sess={e.sessionId6} msg={e.messageId6}
            {' '}new={b(e.detectedNew)} should={b(e.shouldNotify)}{' '}
            <span style={{ color: '#E6EDF3' }}>reason={e.reason ?? 'fired'}</span>
            <div style={{ color: '#8FA3B8', whiteSpace: 'nowrap' }}>
              &nbsp;&nbsp;vis={e.visibilityState ?? '·'} focus={b(e.hasFocus)} bg={b(e.isBackground)} perm={b(e.canShowBrowserNotification)}{' '}
              pt={b(e.playToneCalled)}/{b(e.playToneResult)} os={b(e.showNotifCalled)}/{b(e.showNotifResult)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
