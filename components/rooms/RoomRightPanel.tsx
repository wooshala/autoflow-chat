'use client';

// Phase 1I.1-B — provider-scoped chooser for the /chat RIGHT slot. For a CUSTOMER room it renders
// the read-only Customer Information panel; for every other room it renders the existing Event
// Center (passed as `fallback`). Must run UNDER RoomNavigationProvider (mirrors RoomCenter), since
// the rightPanel const in app/chat/page.tsx is built above the provider and can't read selection.

import type { ReactNode } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { lookupChannelKey } from '@/lib/guest-spike/channels';
import { CustomerInformationPanel } from '@/components/chat/customer-info/CustomerInformationPanel';

export function RoomRightPanel({ fallback }: { fallback: ReactNode }) {
  const { selectedRoom, channelActiveSessionId } = useRoomNavigation();
  const channelKey = selectedRoom.category === 'customer' ? lookupChannelKey(selectedRoom.id) : null;
  if (channelKey) {
    // Pass the room's live active session id (from the shared summary poll) so the panel re-fetches
    // when a NEW guest session opens after the previous one closed — no F5, no room re-select.
    return (
      <CustomerInformationPanel
        channelKey={channelKey}
        roomNo={selectedRoom.room_no ?? null}
        activeSessionId={channelActiveSessionId[selectedRoom.id] ?? null}
      />
    );
  }
  return <>{fallback}</>;
}
