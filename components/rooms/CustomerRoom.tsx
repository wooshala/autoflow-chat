'use client';

// Phase 1C — customer room center, built from the Phase 1B renderers (CustomerRoomTimeline
// + CustomerReplyComposer) over the shared mock store.
//
// Phase 1H.2 — a room wired to a LIVE guest channel (via channels.ts, the single source of
// truth) renders the Canonical GuestChatPanel instead of the mock stack. The room→channel
// decision is ONLY lookupChannelKey(room.id) — never an `if (room === '308')` branch here.
// Rooms with no mapping keep the existing mock stack byte-for-byte. Reachable only behind
// Room Navigation (flag-gated), so the live operations chat is unaffected.

import { useCallback, useState } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomHeader } from './RoomHeader';
import { CustomerRoomTimeline } from '@/components/customer-service/CustomerRoomTimeline';
import { CustomerReplyComposer } from '@/components/customer-service/CustomerReplyComposer';
import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';
import { StaffAuthModal } from '@/components/guest-spike/StaffAuthModal';
import { useStaffSession } from '@/components/guest-spike/useStaffSession';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { closeGuestSession } from '@/lib/guest-spike/api';
import { isGuestLang, type GuestLang } from '@/lib/guest-spike/languages';
import type { Room } from '@/lib/rooms/roomTypes';

export function CustomerRoom({ room }: { room: Room }) {
  const { customerMessages, appendCustomerMessage, reportChannelLanguage } = useRoomNavigation();
  const channelKey = lookupChannelKey(room.id); // SSOT — no hardcoded room branch
  const lang = room.language ?? 'en';
  // Phase 1H.7 — reading/replying to guest messages requires a REAL staff session (server
  // validates the Bearer token). Only the customer-chat area is gated, not the rest of /chat.
  const { hasSession, refresh } = useStaffSession();
  const [loginOpen, setLoginOpen] = useState(false);
  // Phase 1H.5 — the open room reads its language from its OWN message poll (no extra meta
  // poll) and reports it to the context so the list/header stay in sync.
  const [preferred, setPreferred] = useState<GuestLang | null>(null);
  const onChannelMeta = useCallback(
    (m: { preferred_language: string | null }) => {
      const p = isGuestLang(m.preferred_language) ? m.preferred_language : null;
      setPreferred(p);
      reportChannelLanguage(room.id, p);
    },
    [reportChannelLanguage, room.id],
  );

  const endSession = useCallback(async () => {
    if (!channelKey) return;
    if (!window.confirm('현재 고객과의 대화를 종료합니다. 고객은 더 이상 접근할 수 없습니다. 계속할까요?')) return;
    await closeGuestSession(channelKey);
  }, [channelKey]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#B2C7D9]">
      <RoomHeader room={room} />
      {channelKey ? (
        hasSession ? (
          <>
            <div className="flex shrink-0 items-center justify-end border-b border-gray-300/40 bg-[#B2C7D9] px-3 py-1">
              <button
                type="button"
                onClick={() => void endSession()}
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                대화 종료
              </button>
            </div>
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
              disabledNotice={
                preferred
                  ? undefined
                  : '고객 언어가 선택되지 않았습니다. 고객이 QR에서 언어를 선택한 뒤 답변할 수 있습니다.'
              }
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-sm text-gray-700">고객 채팅을 보려면 직원 인증이 필요합니다.</div>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-bold text-gray-900"
            >
              직원 인증
            </button>
            {loginOpen && (
              <StaffAuthModal
                onClose={() => setLoginOpen(false)}
                onSuccess={() => {
                  refresh();
                  setLoginOpen(false);
                }}
              />
            )}
          </div>
        )
      ) : (
        <>
          <CustomerRoomTimeline guestLang={lang} messages={customerMessages[room.id] ?? []} />
          <CustomerReplyComposer key={room.id} guestLang={lang} onSend={(m) => appendCustomerMessage(room.id, m)} />
        </>
      )}
    </div>
  );
}
