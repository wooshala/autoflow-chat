// IMAGE-CHAT-01A — message POST content validation (import-free for node --test).

export function validateGuestMessageContent(input: {
  trimmedText: string;
  hasImage: boolean;
  sender: 'guest' | 'staff';
}): { ok: true } | { ok: false; error: 'EMPTY' | 'STAFF_IMAGE_FORBIDDEN' } {
  if (input.sender === 'staff' && input.hasImage) {
    return { ok: false, error: 'STAFF_IMAGE_FORBIDDEN' };
  }
  if (input.trimmedText.length === 0 && !input.hasImage) {
    return { ok: false, error: 'EMPTY' };
  }
  return { ok: true };
}

/** Image-only messages skip translation; use session language or en for original_lang. */
export function imageOnlyOriginalLang(preferred: string | null): string {
  return preferred && preferred.trim() ? preferred.trim() : 'en';
}

export type GuestAttachmentInsert = {
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
};
