// Source of Truth for guest-room entry URLs (print QR pipeline + staff UI).
// Precedence: explicit baseUrl → NEXT_PUBLIC_QR_BASE_URL → QR_BASE_URL → production default.
// Path rule: /g/room-{roomNo} (channel_key = room-{roomNo}). Never put session/token in the URL.

import { lookupChannelKey } from './channels';

export const GUEST_QR_DEFAULT_BASE_URL = 'https://autoflow-mvp.vercel.app';

export function resolveGuestQrBaseUrl(input?: {
  /** CLI `--base-url=` override (print pipeline). */
  baseUrl?: string | null;
  env?: Record<string, string | undefined>;
}): string {
  const env = input?.env ?? (typeof process !== 'undefined' ? process.env : {});
  const raw =
    (input?.baseUrl != null && String(input.baseUrl).trim()) ||
    env.NEXT_PUBLIC_QR_BASE_URL ||
    env.QR_BASE_URL ||
    GUEST_QR_DEFAULT_BASE_URL;
  return String(raw).trim().replace(/\/+$/, '');
}

/** channel_key for a hotel room number — same rule as lookupChannelKey / door QR print. */
export function guestRoomChannelKey(roomNo: string): string {
  const digits = String(roomNo).replace(/[^\d]/g, '');
  return `room-${digits || roomNo}`;
}

/**
 * Normalize any staff/guest room identifier to a guest channel_key (`room-NNN`).
 * Reuses `lookupChannelKey` for `cust-*`. Rejects empty / undefined / double-prefix junk.
 */
export function resolveGuestChannelKey(input: string | null | undefined): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;

  // Room Navigation id → guest channel (SoT in channels.ts)
  const fromCust = lookupChannelKey(raw);
  if (fromCust) return fromCust;

  // Canonical guest channel (incl. optional QA suffix like room-308-live)
  if (/^room-\d{3,4}(?:-[a-z0-9]+)?$/i.test(raw)) return raw;

  // Bare room number / "201호" — never prepend room- onto an already-prefixed key
  if (/^room-/i.test(raw)) return null; // e.g. room-room-201
  const digits = raw.replace(/[^\d]/g, '');
  if (/^\d{3,4}$/.test(digits)) return `room-${digits}`;

  return null;
}

export function guestChannelPath(channelKey: string): string {
  return `/g/${channelKey}`;
}

export function guestChannelUrl(channelKey: string, baseUrl?: string): string {
  const key = resolveGuestChannelKey(channelKey);
  if (!key) {
    throw new Error(`Invalid guest channel key: ${String(channelKey)}`);
  }
  return `${resolveGuestQrBaseUrl({ baseUrl })}${guestChannelPath(key)}`;
}

export function guestRoomUrl(roomNo: string, baseUrl?: string): string {
  return guestChannelUrl(guestRoomChannelKey(roomNo), baseUrl);
}
