// Source of Truth for guest-room entry URLs (print QR pipeline + staff UI).
// Precedence: explicit baseUrl → NEXT_PUBLIC_QR_BASE_URL → QR_BASE_URL → production default.
// Path rule: /g/room-{roomNo} (channel_key = room-{roomNo}). Never put session/token in the URL.

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

export function guestChannelPath(channelKey: string): string {
  return `/g/${channelKey}`;
}

export function guestChannelUrl(channelKey: string, baseUrl?: string): string {
  return `${resolveGuestQrBaseUrl({ baseUrl })}${guestChannelPath(channelKey)}`;
}

export function guestRoomUrl(roomNo: string, baseUrl?: string): string {
  return guestChannelUrl(guestRoomChannelKey(roomNo), baseUrl);
}
