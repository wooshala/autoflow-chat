'use client';

// Phase 1C.1 — center renderer switch (Q3=b: renderers are separate; the shell is
// shared, the staff renderer is NOT replaced). Selection derives from the two Room axes:
//   dataBinding 'live' + category 'operations' → the real staff center (staffGlobalSlot)
//   category 'customer'                        → CustomerRoom
//   otherwise (mock team/other)                → MockStaffRoom
//
// The live operations center is returned AS-IS (no added wrapper/scroll/padding — 1C.1)
// and kept ALWAYS MOUNTED so its scroll position, in-progress draft, realtime
// subscription and message loader survive room switches (1C.2): display:contents when
// active (zero layout box → identical to the original tree), hidden otherwise.

import type { ReactNode } from 'react';

import { useRoomNavigation } from './RoomNavigationContext';
import { MockStaffRoom } from './MockStaffRoom';
import { CustomerRoom } from './CustomerRoom';

export function RoomCenter({ staffGlobalSlot }: { staffGlobalSlot: ReactNode }) {
  const { selectedRoom } = useRoomNavigation();
  const isLiveOps = selectedRoom.dataBinding === 'live' && selectedRoom.category === 'operations';

  return (
    <>
      <div className={isLiveOps ? 'contents' : 'hidden'}>{staffGlobalSlot}</div>
      {!isLiveOps && selectedRoom.category === 'customer' && (
        <CustomerRoom key={selectedRoom.id} room={selectedRoom} />
      )}
      {!isLiveOps && selectedRoom.category !== 'customer' && <MockStaffRoom room={selectedRoom} />}
    </>
  );
}
