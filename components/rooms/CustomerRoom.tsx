'use client';

// Phase 1C — customer room center, built from the Phase 1B renderers (CustomerRoomTimeline
// + CustomerReplyComposer) over the shared mock store.
//
// Phase 1H.2 — a room wired to a LIVE guest channel (via channels.ts, the single source of
// truth) renders the Canonical GuestChatPanel instead of the mock stack. The room→channel
// decision is ONLY lookupChannelKey(room.id) — never an `if (room === '308')` branch here.
// Rooms with no mapping keep the existing mock stack byte-for-byte. Reachable only behind
// Room Navigation (flag-gated), so the live operations chat is unaffected.

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomHeader } from './RoomHeader';
import { CustomerRoomTimeline } from '@/components/customer-service/CustomerRoomTimeline';
import { CustomerReplyComposer } from '@/components/customer-service/CustomerReplyComposer';
import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import type { Room } from '@/lib/rooms/roomTypes';

export function CustomerRoom({ room }: { room: Room }) {
  const { customerMessages, appendCustomerMessage } = useRoomNavigation();
  const channelKey = lookupChannelKey(room.id); // SSOT — no hardcoded room branch
  const lang = room.language ?? 'en';

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#B2C7D9]">
      <RoomHeader room={room} />
      {channelKey ? (
        <GuestChatPanel
          channelKey={channelKey}
          viewerLang="ko"
          counterpartLang={room.language ?? 'ja'}
          ownSender="staff"
          ownLabel="직원(나)"
          otherLabel="고객"
          emptyText="고객 메시지를 기다리는 중…"
          inputPlaceholder="한국어로 답변 입력 (Enter 전송)"
          sendLabel="전송"
        />
      ) : (
        <>
          <CustomerRoomTimeline guestLang={lang} messages={customerMessages[room.id] ?? []} />
          <CustomerReplyComposer key={room.id} guestLang={lang} onSend={(m) => appendCustomerMessage(room.id, m)} />
        </>
      )}
    </div>
  );
}
