'use client';

import { useEffect, useRef } from 'react';

import { customerRoomIdFromGuestRoom } from '@/lib/rooms/guestRoomDeepLink';
import { useRoomNavigation } from '@/components/rooms/RoomNavigationContext';

/**
 * Apply /chat?guestRoom=802 once per room value under RoomNavigationProvider.
 * Does not re-force selection when the staff later picks another room (avoids render loops).
 */
export function GuestRoomDeepLinkApplier({ roomNumber }: { roomNumber: string }) {
  const { selectRoom } = useRoomNavigation();
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    const id = customerRoomIdFromGuestRoom(roomNumber);
    if (appliedRef.current === id) return;
    appliedRef.current = id;
    selectRoom(id);
  }, [roomNumber, selectRoom]);

  return null;
}
