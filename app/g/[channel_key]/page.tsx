'use client';

// Phase 1G.4/1H.2 — guest mobile chat page. Reached by scanning the room QR
// (/g/<channel_key>). Now a thin shell around the shared GuestChatPanel (Composition
// Root) — identical code path to /g-staff and /chat's customer room.

import { useParams } from 'next/navigation';

import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';

const GUEST_LANG = 'ja'; // spike: 308 = Japanese (viewer reads this)
const STAFF_LANG = 'ko'; // counterpart (staff) language — secondary line

export default function GuestChatPage() {
  const params = useParams();
  const channelKey = decodeURIComponent(String(params.channel_key ?? ''));

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f2f4f7', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '12px 16px', background: '#1f2937', color: '#fff', fontWeight: 700 }}>
        AutoFlow · ルーム {channelKey.replace(/[^0-9]/g, '') || channelKey} · スタッフとチャット
      </header>
      <GuestChatPanel
        channelKey={channelKey}
        viewerLang={GUEST_LANG}
        counterpartLang={STAFF_LANG}
        ownSender="guest"
        ownLabel="あなた"
        otherLabel="スタッフ"
        emptyText="メッセージを送ってください（日本語でOK）"
        inputPlaceholder="メッセージを入力"
        sendLabel="送信"
      />
    </main>
  );
}
