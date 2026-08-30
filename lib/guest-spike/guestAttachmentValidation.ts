// IMAGE-CHAT-01A — pure validation for guest image attachments (import-free for node --test).

export const GUEST_CHAT_ATTACHMENTS_BUCKET = 'guest-chat';

export const GUEST_ATTACHMENT_MAX_COUNT = 5;
export const GUEST_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export const GUEST_ATTACHMENT_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type GuestAttachmentMime = (typeof GUEST_ATTACHMENT_ALLOWED_MIMES)[number];

const EXT_BY_MIME: Record<GuestAttachmentMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForMime(mime: GuestAttachmentMime): string {
  return EXT_BY_MIME[mime];
}

export function isAllowedGuestAttachmentMime(mime: string): mime is GuestAttachmentMime {
  return (GUEST_ATTACHMENT_ALLOWED_MIMES as readonly string[]).includes(mime);
}

/** Reject SVG and other non-raster types even when mislabeled. */
export function detectGuestImageMime(bytes: Uint8Array): GuestAttachmentMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // HEIC/HEIF — Phase A non-goal; detect common ftyp brands for a clear reject.
  if (bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (brand === 'ftyp') {
      const minor = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (minor.startsWith('heic') || minor.startsWith('heif') || minor.startsWith('mif1')) {
        return null;
      }
    }
  }
  // SVG sniff (text/xml mislabeled as image)
  const head = Buffer.from(bytes.slice(0, Math.min(bytes.length, 256))).toString('utf8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return null;
  return null;
}

export type GuestAttachmentValidationError =
  | 'MISSING_FILE'
  | 'TOO_MANY'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'MIME_MISMATCH'
  | 'SVG_DENIED'
  | 'HEIC_DENIED'
  | 'NOT_IMAGE';

export function validateGuestAttachmentFile(input: {
  bytes: Uint8Array;
  declaredMime: string;
  declaredSize: number;
}): { ok: true; mime: GuestAttachmentMime } | { ok: false; error: GuestAttachmentValidationError } {
  const { bytes, declaredMime, declaredSize } = input;
  if (!bytes.length) return { ok: false, error: 'MISSING_FILE' };
  if (declaredSize > GUEST_ATTACHMENT_MAX_BYTES || bytes.length > GUEST_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'TOO_LARGE' };
  }

  const head = Buffer.from(bytes.slice(0, Math.min(bytes.length, 256))).toString('utf8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || declaredMime === 'image/svg+xml') {
    return { ok: false, error: 'SVG_DENIED' };
  }

  const detected = detectGuestImageMime(bytes);
  if (!detected) {
    if (declaredMime.includes('heic') || declaredMime.includes('heif')) {
      return { ok: false, error: 'HEIC_DENIED' };
    }
    return { ok: false, error: 'NOT_IMAGE' };
  }

  if (!isAllowedGuestAttachmentMime(declaredMime)) {
    return { ok: false, error: 'UNSUPPORTED_MIME' };
  }

  if (detected !== declaredMime) {
    return { ok: false, error: 'MIME_MISMATCH' };
  }

  return { ok: true, mime: detected };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-controlled storage path: {session_id}/{upload_uuid}.{ext} */
export function buildGuestAttachmentStoragePath(sessionId: string, uploadId: string, ext: string): string {
  if (!UUID_RE.test(sessionId) || !UUID_RE.test(uploadId)) {
    throw new Error('INVALID_PATH_INPUT');
  }
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `${sessionId}/${uploadId}.${safeExt || 'bin'}`;
}

export function isGuestAttachmentStoragePathForSession(storagePath: string, sessionId: string): boolean {
  if (!UUID_RE.test(sessionId)) return false;
  const prefix = `${sessionId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return UUID_RE.test(rest.split('.')[0] ?? '');
}

export function normalizeAttachmentCount(count: number): { ok: true } | { ok: false; error: 'TOO_MANY' } {
  if (count < 1 || count > GUEST_ATTACHMENT_MAX_COUNT) return { ok: false, error: 'TOO_MANY' };
  return { ok: true };
}
