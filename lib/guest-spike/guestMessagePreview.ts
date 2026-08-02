// Phase 4A — staff-facing one-line preview for unanswered summary (ledger banner).
// Server-only. Never log the raw original / translation / preview text.

export const GUEST_MESSAGE_PREVIEW_MAX = 80;
export const GUEST_MESSAGE_PREVIEW_EMPTY = '새 고객 메시지';

export type GuestPreviewSource = {
  original_text?: string | null;
  translated_json?: Record<string, string> | null;
};

/** Strip C0/C1 controls (keep TAB/LF/CR for whitespace normalize step). */
function stripControls(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Mask common PII shapes before truncation so partial cuts cannot evade detection.
 * Conservative: only clear phone / card / RRN / email / plate-like patterns.
 */
export function maskGuestPreviewPii(s: string): string {
  let out = s;

  // Email first (avoids digit rules eating local parts oddly)
  out = out.replace(
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    '$1***$2',
  );

  // Korean mobile / phone with optional separators
  out = out.replace(
    /(01[016789])(?:[-\s.]?)(\d{3,4})(?:[-\s.]?)(\d{4})\b/g,
    '$1-****-$3',
  );

  // Card-like 16 digits
  out = out.replace(
    /\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g,
    '****-****-****-$4',
  );

  // Resident registration-like
  out = out.replace(/\b(\d{6})[-\s]?(\d{7})\b/g, '******-*******');

  // Vehicle plate-ish: 12가3456 / 서울12가3456 — keep region/type, mask serial
  out = out.replace(
    /((?:[가-힣]{2,4})?\d{2,3}[가-힣])\s?(\d{4})\b/g,
    '$1****',
  );

  return out;
}

function truncatePreview(s: string): string {
  if (s.length <= GUEST_MESSAGE_PREVIEW_MAX) return s;
  return `${s.slice(0, GUEST_MESSAGE_PREVIEW_MAX)}…`;
}

/**
 * Build `latestGuestMessagePreview`.
 *
 * Order (locked):
 *   ko → original → "새 고객 메시지"
 *   → strip controls → normalize whitespace → mask PII → truncate 80
 *
 * Always returns a non-empty string (null forbidden by API contract).
 */
export function buildGuestMessagePreview(source: GuestPreviewSource): string {
  const ko = source.translated_json?.ko;
  const picked =
    (typeof ko === 'string' && ko.trim()) ||
    (typeof source.original_text === 'string' && source.original_text.trim()) ||
    GUEST_MESSAGE_PREVIEW_EMPTY;

  const normalized = normalizeWhitespace(stripControls(picked));
  const base = normalized.length > 0 ? normalized : GUEST_MESSAGE_PREVIEW_EMPTY;
  return truncatePreview(maskGuestPreviewPii(base));
}
