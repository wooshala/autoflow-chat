'use client';

// Phase 1H.7 — Golden Reference staff client (dev/QA). Same staff-auth gate as the real
// /chat CustomerRoom: a valid staff session is required (server validates the Bearer token).
// NO auth bypass, NO fixed dev token. Production visibility is gated at the server page.

import { useCallback, useState } from 'react';

import { GuestChatPanel } from './GuestChatPanel';
import { StaffAuthModal } from './StaffAuthModal';
import { useStaffSession } from './useStaffSession';
import { closeGuestSession } from '@/lib/guest-spike/api';
import { isGuestLang, langDisplayName, type GuestLang } from '@/lib/guest-spike/languages';

export function GuestStaffClient({ channelKey }: { channelKey: string }) {
  const { hasSession, refresh } = useStaffSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [preferred, setPreferred] = useState<GuestLang | null>(null);
  const onChannelMeta = useCallback((m: { preferred_language: string | null }) => {
    setPreferred(isGuestLang(m.preferred_language) ? m.preferred_language : null);
  }, []);
  const endSession = useCallback(async () => {
    if (!window.confirm('현재 고객과의 대화를 종료합니다. 계속할까요?')) return;
    await closeGuestSession(channelKey);
  }, [channelKey]);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#B2C7D9', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#1f2937', color: '#fff', fontWeight: 700 }}>
        <span>[직원·Golden Reference] {channelKey} · {preferred ? langDisplayName(preferred) : '언어 미선택'}</span>
        {hasSession && (
          <button type="button" onClick={() => void endSession()} style={{ marginLeft: 'auto', borderRadius: 6, border: '1px solid #ef4444', background: '#7f1d1d', color: '#fecaca', padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            대화 종료
          </button>
        )}
      </header>
      {hasSession ? (
        <GuestChatPanel
          channelKey={channelKey}
          viewerLang="ko"
          counterpartLang={preferred ?? 'ko'}
          ownSender="staff"
          asStaff
          ownLabel="직원(나)"
          otherLabel="고객"
          emptyText="고객 메시지를 기다리는 중…"
          inputPlaceholder="한국어로 답변 입력 (Enter 전송)"
          sendLabel="전송"
          onChannelMeta={onChannelMeta}
          disabledNotice={preferred ? undefined : '고객 언어가 선택되지 않았습니다. 고객이 QR에서 언어를 선택한 뒤 답변할 수 있습니다.'}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#1f2937' }}>고객 채팅을 보려면 직원 인증이 필요합니다.</div>
          <button type="button" onClick={() => setLoginOpen(true)} style={{ borderRadius: 8, background: '#FEE500', fontWeight: 700, padding: '8px 16px', fontSize: 14 }}>직원 인증</button>
          {loginOpen && <StaffAuthModal onClose={() => setLoginOpen(false)} onSuccess={() => { refresh(); setLoginOpen(false); }} />}
        </div>
      )}
    </main>
  );
}
