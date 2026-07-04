/** Staff-chat timeline: load full shared room history (no user filter). */
// Restored to 500 after the real fix: /api/chat/list now opts out of Next.js
// Data Cache (dynamic + fetchCache='force-no-store'), so the limit=500 read is no
// longer served from a stale cached fetch. (The temporary 499 band-aid is removed.)
export const STAFF_CHAT_LIST_LIMIT = 500;
export const STAFF_CHAT_DELTA_LIMIT = 80;
