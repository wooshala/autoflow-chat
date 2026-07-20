'use client';

// Phase 1G.4/1H.5 — minimal STAFF view (PC). GOLDEN REFERENCE for the guest round trip.
// Reply target = the guest's chosen language; replying is blocked until the guest selects
// one. The language comes from the panel's OWN message poll (onChannelMeta) — no extra poll.

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';

import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';
import { isGuestLang, langDisplayName, type GuestLang } from '@/lib/guest-spike/languages';

export default function GuestStaffPage() {
  const params = useParams();
  const channelKey = decodeURIComponent(String(params.channel_key ?? ''));
  const [preferred, setPreferred] = useState<GuestLang | null>(null);
  const onChannelMeta = useCallback((m: { preferred_language: string | null }) => {
    setPreferred(isGuestLang(m.preferred_language) ? m.preferred_language : null);
  }, []);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#B2C7D9', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '12px 16px', background: '#1f2937', color: '#fff', fontWeight: 700 }}>
        [직원·Golden Reference] {channelKey} · {preferred ? langDisplayName(preferred) : '언어 미선택'}
      </header>
      <GuestChatPanel
        channelKey={channelKey}
        viewerLang="ko"
        counterpartLang={preferred ?? 'ko'}
        ownSender="staff"
        ownLabel="직원(나)"
        otherLabel="고객"
        emptyText="고객 메시지를 기다리는 중…"
        inputPlaceholder="한국어로 답변 입력 (Enter 전송)"
        sendLabel="전송"
        onChannelMeta={onChannelMeta}
        disabledNotice={
          preferred ? undefined : '고객 언어가 선택되지 않았습니다. 고객이 QR에서 언어를 선택한 뒤 답변할 수 있습니다.'
        }
      />
    </main>
  );
}
