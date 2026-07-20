'use client';

// Phase 1H.5 — resolves preferred language for channel-mapped customer rooms (staff side).
// Uses the LIGHTWEIGHT ?meta=1 read (no message arrays) so it never duplicates the open
// GuestChatPanel's full-message polling. Returns { roomId → GuestLang | null }.

import { useEffect, useRef, useState } from 'react';

import { fetchChannelMeta } from './api';
import { isGuestLang, type GuestLang } from './languages';
import { lookupChannelKey } from './channels';

export type RoomChannelLanguages = Record<string, GuestLang | null>;

export function useChannelLanguages(
  roomIds: string[],
  excludeRoomId?: string | null,
  intervalMs = 5000,
): RoomChannelLanguages {
  const [map, setMap] = useState<RoomChannelLanguages>({});

  // Mapped rooms EXCEPT the open one — the open room reuses its GuestChatPanel message
  // poll (reported via context), so we never meta-poll it in parallel.
  const mapped = roomIds
    .filter((id) => id !== excludeRoomId)
    .map((id) => [id, lookupChannelKey(id)] as const)
    .filter((x): x is readonly [string, string] => x[1] !== null);
  const signature = mapped.map(([id, ch]) => `${id}:${ch}`).sort().join('|');
  const mappedRef = useRef(mapped);
  mappedRef.current = mapped;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const entries = await Promise.all(
        mappedRef.current.map(async ([roomId, channelKey]) => {
          const meta = await fetchChannelMeta(channelKey);
          return [roomId, isGuestLang(meta.preferred_language) ? meta.preferred_language : null] as const;
        }),
      );
      if (!alive) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const [id, lang] of entries) next[id] = lang;
        return next;
      });
    };
    void poll();
    const t = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, intervalMs]);

  return map;
}
