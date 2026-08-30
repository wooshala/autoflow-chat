// IMAGE-CHAT-01A — pure POST /messages validation (node --test friendly).

export type GuestMessagePostBody = {
  text?: unknown;
  attachments?: unknown;
  sender?: unknown;
};

export type ParsedGuestAttachmentRef = {
  upload_token: string;
};

export function parseGuestMessagePostBody(body: GuestMessagePostBody): {
  trimmedText: string;
  attachmentRefs: ParsedGuestAttachmentRef[];
} {
  const trimmedText = String(body.text ?? '').trim();
  const raw = Array.isArray(body.attachments) ? body.attachments : [];
  const attachmentRefs: ParsedGuestAttachmentRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const token = String((item as { upload_token?: unknown }).upload_token ?? '').trim();
    if (token) attachmentRefs.push({ upload_token: token });
  }
  return { trimmedText, attachmentRefs };
}

export function validateGuestMessagePostContent(input: {
  trimmedText: string;
  attachmentCount: number;
  sender: 'guest' | 'staff';
}): { ok: true } | { ok: false; error: 'EMPTY' | 'STAFF_ATTACHMENTS_FORBIDDEN' } {
  if (input.sender === 'staff' && input.attachmentCount > 0) {
    return { ok: false, error: 'STAFF_ATTACHMENTS_FORBIDDEN' };
  }
  if (input.trimmedText.length === 0 && input.attachmentCount === 0) {
    return { ok: false, error: 'EMPTY' };
  }
  return { ok: true };
}

/** Image-only messages skip translation; use session language or en for original_lang. */
export function imageOnlyOriginalLang(preferred: string | null): string {
  return preferred && preferred.trim() ? preferred.trim() : 'en';
}
