'use client';

// Phase 1H.5/1H.7 — resolves the language for channel-mapped customer rooms (staff side).
// Uses the LIGHTWEIGHT ?meta=1 read (no message arrays) so it never duplicates the open
// GuestChatPanel's full-message polling. Phase 1H.7: language is per-session, so this STAFF
// poll runs as=staff to read each room's ACTIVE session language (null when none / not logged
// in). Returns { roomId → GuestLang | null }.

import { useEffect, useRef, useState } from 'react';

import { fetchChannelMeta } from './api';
import { isGuestLang, type GuestLang } from './languages';
import { lookupChannelKey } from './channels';

export type RoomChannelLanguages = Record<string, GuestLang | null>;
// Phase 1H.7 — per-room active-session state, so the list can distinguish "no guest" from
// "guest present, no language". null = unknown (pre-auth / error).
export type RoomChannelSessionStatus = Record<string, 'open' | 'none' | null>;

export function useChannelLanguages(
  roomIds: string[],
  excludeRoomId?: string | null,
  intervalMs = 5000,
): { languages: RoomChannelLanguages; sessionStatus: RoomChannelSessionStatus } {
  const [map, setMap] = useState<RoomChannelLanguages>({});
  const [statusMap, setStatusMap] = useState<RoomChannelSessionStatus>({});

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
          const meta = await fetchChannelMeta(channelKey, true); // staff poll → active session language + status
          return [roomId, isGuestLang(meta.preferred_language) ? meta.preferred_language : null, meta.session_status] as const;
        }),
      );
      if (!alive) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const [id, lang] of entries) next[id] = lang;
        return next;
      });
      setStatusMap((prev) => {
        const next = { ...prev };
        for (const [id, , status] of entries) next[id] = status;
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

  return { languages: map, sessionStatus: statusMap };
}
