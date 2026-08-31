// IMAGE-CHAT-01B — import-free client attachment validation (file picker + clipboard).
// Aligned with guestAttachmentLimits / guestAttachmentValidation policy.

/** Duplicated for import-free node --test (see guestAttachmentValidation.ts). */
export const GUEST_COMPOSER_MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type GuestComposerFileValidation =
  | { ok: true }
  | { ok: false; message: string };

/** Shared policy for file picker and clipboard paste (4MB, JPEG/PNG/WebP). */
export function validateGuestComposerFile(file: {
  type: string;
  size: number;
  name?: string;
}): GuestComposerFileValidation {
  if (file.size > GUEST_COMPOSER_MAX_BYTES) {
    return { ok: false, message: '사진 크기는 4MB 이하여야 합니다.' };
  }
  const mime = file.type || '';
  if (
    mime.includes('heic') ||
    mime.includes('heif') ||
    (file.name?.toLowerCase().endsWith('.heic') ?? false)
  ) {
    return {
      ok: false,
      message: 'HEIC 형식은 지원하지 않습니다. JPEG/PNG/WebP 사진을 선택해 주세요.',
    };
  }
  if (!mime.startsWith('image/') || mime === 'image/svg+xml') {
    return { ok: false, message: 'JPEG, PNG, WebP 이미지만 보낼 수 있습니다.' };
  }
  if (!(ALLOWED_MIMES as readonly string[]).includes(mime)) {
    return { ok: false, message: 'JPEG, PNG, WebP 이미지만 보낼 수 있습니다.' };
  }
  return { ok: true };
}
