'use client';

// Phase 1C — customer room center, built entirely from the Phase 1B renderers
// (CustomerRoomTimeline + CustomerReplyComposer). Messages come from the shared mock
// store; the composer is keyed by room id so a pending draft/image never leaks across
// rooms (Phase 1C.3). Mock only — no DB, no real guest.

import { useRoomNavigation } from './RoomNavigationContext';
import { RoomHeader } from './RoomHeader';
import { CustomerRoomTimeline } from '@/components/customer-service/CustomerRoomTimeline';
import { CustomerReplyComposer } from '@/components/customer-service/CustomerReplyComposer';
import type { Room } from '@/lib/rooms/roomTypes';

export function CustomerRoom({ room }: { room: Room }) {
  const { customerMessages, appendCustomerMessage } = useRoomNavigation();
  const messages = customerMessages[room.id] ?? [];
  const lang = room.language ?? 'en';

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-white">
      <RoomHeader room={room} />
      <CustomerRoomTimeline guestLang={lang} messages={messages} />
      <CustomerReplyComposer key={room.id} guestLang={lang} onSend={(m) => appendCustomerMessage(room.id, m)} />
    </div>
  );
}
