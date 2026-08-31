// IMAGE-CHAT-01B — clipboard paste wiring for guest chat composer (browser / Next.js).

import {
  extractClipboardImage,
  type ClipboardEventLike,
  type ClipboardFileLike,
} from '@/lib/customer-service/clipboardImage';
import { validateGuestComposerFile } from '@/lib/guest-spike/guestComposerFileValidation';

export { validateGuestComposerFile } from '@/lib/guest-spike/guestComposerFileValidation';

export type GuestComposerPasteResult =
  | { action: 'none' }
  | { action: 'image'; file: ClipboardFileLike }
  | { action: 'error'; message: string };

/**
 * Inspect a paste event for an image attachment. Returns `none` when no image is present so
 * callers must NOT preventDefault — normal text paste proceeds unchanged.
 */
export function handleGuestComposerPaste(event: ClipboardEventLike): GuestComposerPasteResult {
  const img = extractClipboardImage(event);
  if (!img) return { action: 'none' };
  const v = validateGuestComposerFile(img);
  if (!v.ok) return { action: 'error', message: v.message };
  return { action: 'image', file: img };
}
