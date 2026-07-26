// Reference flyer art for Guest Chat hero (exact visual from hotel guide).
// Client-safe constants only — never import node:fs here.
// Live Guest Chat QR is overlaid on the left QR slot.

/** Public URL for staff UI / same-document print (Next serves /public). */
export const GUEST_NOTICE_GUIDE_REF_SRC = '/guest-notice/hero-guide-ref.jpg';

/**
 * Percent positions of the live QR overlay on the reference art (1024×676).
 * Tuned to cover the decorative QR square only (not the navy scan CTA bar).
 */
export const GUEST_NOTICE_GUIDE_REF_QR_BOX = {
  leftPct: 4.1,
  topPct: 26.8,
  widthPct: 21.6,
} as const;
