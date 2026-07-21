// Phase 1H.11 — per-browser "last viewed" timestamps for staff customer rooms (keyed by
// channel_key). Used to compute unread without any DB read-receipt. The pure map helpers
// (parse / merge, monotonic + validated) are unit-testable; the thin localStorage wrappers are
// SSR-safe and never throw into render.

export type GuestRoomLastViewedMap = Record<string, string>;

export const GUEST_ROOM_LAST_VIEWED_KEY = 'autoflow.guest-room-last-viewed.v1';

/** Parse stored JSON into a {channel_key → ISO} map, dropping anything malformed. */
export function parseLastViewedMap(raw: string | null | undefined): GuestRoomLastViewedMap {
  if (!raw) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return {}; // corrupt JSON → start clean (never crash render)
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: GuestRoomLastViewedMap = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) out[k] = v;
  }
  return out;
}

/**
 * Return a NEW map with channelKey advanced to `latestGuestMessageAt` — but only forward:
 * an equal or older timestamp (or a missing/invalid one) is ignored, so a room never regresses
 * to "unread" after being read. Returns the SAME reference when nothing changes.
 */
export function mergeLastViewed(
  map: GuestRoomLastViewedMap,
  channelKey: string,
  latestGuestMessageAt: string | null | undefined,
): GuestRoomLastViewedMap {
  if (!channelKey || !latestGuestMessageAt) return map;
  const next = Date.parse(latestGuestMessageAt);
  if (Number.isNaN(next)) return map;
  const prev = map[channelKey];
  if (prev) {
    const prevMs = Date.parse(prev);
    if (!Number.isNaN(prevMs) && next <= prevMs) return map; // not newer → no change
  }
  return { ...map, [channelKey]: latestGuestMessageAt };
}

// ── browser wrappers (SSR-safe; swallow storage errors) ──────────────────────────────────
export function readGuestRoomLastViewed(): GuestRoomLastViewedMap {
  if (typeof window === 'undefined') return {};
  try {
    return parseLastViewedMap(window.localStorage.getItem(GUEST_ROOM_LAST_VIEWED_KEY));
  } catch {
    return {};
  }
}

export function writeGuestRoomLastViewed(map: GuestRoomLastViewedMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_ROOM_LAST_VIEWED_KEY, JSON.stringify(map));
  } catch {
    /* storage full/blocked → unread is best-effort */
  }
}
