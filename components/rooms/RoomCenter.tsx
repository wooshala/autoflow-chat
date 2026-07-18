'use client';

// Phase 1C — center renderer switch by room kind (Q3=b: renderers are separate; the
// shell is shared, the staff renderer is NOT replaced).
//
// staff-global: the EXISTING staff center tree (staffGlobalSlot) is returned as-is —
// RoomCenter adds NO wrapper box, scroll container, or padding around it (Phase 1C.1).
// It is kept ALWAYS MOUNTED (never unmounted on room switch) so the real chat's scroll
// position, in-progress draft, realtime subscription and message loader are preserved
// (Phase 1C.2). When active the toggle uses `display:contents` (zero layout box → the
// tree lays out exactly as the original); when inactive it is `hidden` (display:none),
// which keeps DOM scrollTop intact until the operator returns.

import type { ReactNode } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { MockStaffRoom } from './MockStaffRoom';
import { CustomerRoom } from './CustomerRoom';

export function RoomCenter({ staffGlobalSlot }: { staffGlobalSlot: ReactNode }) {
  const { selectedRoom } = useRoomNavigation();
  const kind = selectedRoom.kind;

  return (
    <>
      <div className={kind === 'staff-global' ? 'contents' : 'hidden'}>{staffGlobalSlot}</div>
      {kind === 'staff-mock' && <MockStaffRoom room={selectedRoom} />}
      {kind === 'customer' && <CustomerRoom key={selectedRoom.id} room={selectedRoom} />}
    </>
  );
}
