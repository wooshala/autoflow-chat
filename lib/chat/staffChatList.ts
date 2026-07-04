/** Staff-chat timeline: load full shared room history (no user filter). */
// TEMP hotfix: 500 hits a stale Next.js data-cache entry on /api/chat/list
// (the route lacks fetchCache='force-no-store'), which serves an old window and
// hides today's messages. 499 uses a different, currently-fresh cache key.
// NOTE: not a real fix — the cache bug can recur on 499 too. Real fix is adding
// dynamic/fetchCache directives to /api/chat/list. See ops notes.
export const STAFF_CHAT_LIST_LIMIT = 499;
export const STAFF_CHAT_DELTA_LIMIT = 80;
