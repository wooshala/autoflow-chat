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
  const { selectedRoom } = useRoomNavigation();
  const channelKey = selectedRoom.category === 'customer' ? lookupChannelKey(selectedRoom.id) : null;
  if (channelKey) {
    return <CustomerInformationPanel channelKey={channelKey} roomNo={selectedRoom.room_no ?? null} />;
  }
  return <>{fallback}</>;
}
