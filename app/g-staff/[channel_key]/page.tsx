'use client';

// Phase 1G.4/1H.2 — minimal STAFF view (PC). GOLDEN REFERENCE: kept alongside the /chat
// integration so a broken round trip can be isolated (/chat vs GuestChatPanel vs API).
// Now a thin shell around the shared GuestChatPanel — same code path as /g and /chat.
// Not deleted until the 308 pilot is stable (separate cleanup step).

import { useParams } from 'next/navigation';

import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';

const VIEWER_LANG = 'ko'; // staff reads Korean
const COUNTERPART_LANG = 'ja'; // counterpart (guest) language — secondary line

export default function GuestStaffPage() {
  const params = useParams();
  const channelKey = decodeURIComponent(String(params.channel_key ?? ''));

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#B2C7D9', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '12px 16px', background: '#1f2937', color: '#fff', fontWeight: 700 }}>
        [직원·Golden Reference] 고객 채팅 · {channelKey} · 한국어로 답변
      </header>
      <GuestChatPanel
        channelKey={channelKey}
        viewerLang={VIEWER_LANG}
        counterpartLang={COUNTERPART_LANG}
        ownSender="staff"
        ownLabel="직원(나)"
        otherLabel="고객"
        emptyText="고객 메시지를 기다리는 중…"
        inputPlaceholder="한국어로 답변 입력 (Enter 전송)"
        sendLabel="전송"
      />
    </main>
  );
}
