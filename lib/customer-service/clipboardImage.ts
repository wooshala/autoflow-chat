// Phase 1B — clipboard image paste utilities (customer-service console).
//
// Pure, framework-agnostic helpers so they can be unit-tested in Node with plain
// object shapes (no real DOM required). The React component wires these to the real
// paste event + URL.createObjectURL.
//
// Regression safety: extractClipboardImage returns null when the clipboard has no
// image, so the caller must NOT preventDefault in that case — normal text paste is
// left untouched.

export const CLIPBOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB (matches staff upload limit)

// WebP intentionally left OUT of the default allow-list: the existing staff upload
// path's server acceptance for webp is unconfirmed (see channel-contract / report),
// so Phase 1B only guarantees png/jpeg. Flip this once webp is verified end-to-end.
export const CLIPBOARD_IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg'] as const;
export const CLIPBOARD_IMAGE_KNOWN_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Minimal duck-typed shapes so this file has no DOM dependency (testable in Node). */
export interface ClipboardFileLike {
  type: string;
  size: number;
  name?: string;
}
export interface ClipboardItemLike {
  kind: string; // 'file' | 'string'
  type: string; // MIME
  getAsFile: () => ClipboardFileLike | null;
}
export interface ClipboardEventLike {
  clipboardData: {
    items?: ArrayLike<ClipboardItemLike> | null;
    files?: ArrayLike<ClipboardFileLike> | null;
    getData?: (format: string) => string;
  } | null;
}

function toArray<T>(list: ArrayLike<T> | null | undefined): T[] {
  if (!list) return [];
  return Array.prototype.slice.call(list) as T[];
}

/**
 * Extract the first image File from a paste event, or null if there is none.
 * Checks clipboardData.items (image/*) first, then clipboardData.files (image/*).
 * Never throws; returns null on any malformed input so text paste is unaffected.
 */
export function extractClipboardImage(event: ClipboardEventLike): ClipboardFileLike | null {
  const cd = event?.clipboardData;
  if (!cd) return null;

  for (const item of toArray(cd.items)) {
    if (item && item.kind === 'file' && typeof item.type === 'string' && item.type.startsWith('image/')) {
      const file = item.getAsFile?.();
      if (file && typeof file.type === 'string' && file.type.startsWith('image/')) return file;
    }
  }
  for (const file of toArray(cd.files)) {
    if (file && typeof file.type === 'string' && file.type.startsWith('image/')) return file;
  }
  return null;
}

/** True when the paste also carries selectable text (image+text mixed clipboard). */
export function clipboardHasText(event: ClipboardEventLike): boolean {
  const cd = event?.clipboardData;
  if (!cd) return false;
  const items = toArray(cd.items);
  if (items.some((i) => i && i.kind === 'string' && typeof i.type === 'string' && i.type.startsWith('text/'))) {
    return true;
  }
  try {
    return Boolean(cd.getData?.('text/plain'));
  } catch {
    return false;
  }
}

export type ClipboardImageValidation =
  | { ok: true }
  | { ok: false; reason: 'not_image' | 'unsupported_type' | 'too_large'; message: string };

export function validateClipboardImage(file: ClipboardFileLike | null | undefined): ClipboardImageValidation {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    return { ok: false, reason: 'not_image', message: '이미지 파일이 아닙니다.' };
  }
  if (!(CLIPBOARD_IMAGE_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: 'unsupported_type',
      message: `지원하지 않는 형식입니다 (${file.type}). PNG/JPEG만 지원합니다.`,
    };
  }
  if (typeof file.size === 'number' && file.size > CLIPBOARD_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: `이미지가 너무 큽니다 (최대 ${Math.round(CLIPBOARD_IMAGE_MAX_BYTES / 1024 / 1024)}MB).`,
    };
  }
  return { ok: true };
}

/** Human-friendly size, e.g. "482 KB". */
export function formatImageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface ClipboardImagePreview {
  url: string;
  revoke: () => void;
}

/**
 * Create an object-URL preview for a real browser File. `deps` is injectable so the
 * unit test can verify create/revoke pairing without a DOM. In the browser, call
 * with no args (defaults to URL.createObjectURL / URL.revokeObjectURL).
 */
export function createClipboardImagePreview(
  file: Blob,
  deps?: {
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  },
): ClipboardImagePreview {
  const create =
    deps?.createObjectURL ??
    (typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : undefined);
  const revoke =
    deps?.revokeObjectURL ??
    (typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : undefined);
  if (!create || !revoke) {
    throw new Error('createClipboardImagePreview requires URL.createObjectURL (browser) or injected deps');
  }
  const url = create(file);
  let revoked = false;
  return {
    url,
    revoke: () => {
      if (revoked) return; // idempotent; safe to call on replace/cancel/send/unmount
      revoked = true;
      revoke(url);
    },
  };
}
