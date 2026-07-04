# Rule: App Router API routes using supabase-js must opt out of Next.js Data Cache

## Rule
Any **App Router route handler** (`app/api/**/route.ts`) that reads/writes via
**supabase-js** (`supabaseAdmin` / `createClient`) **must** declare:

```ts
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
```

(Add `export const runtime = 'nodejs';` too when the route uses Node APIs.)

## Why
supabase-js issues its queries with the global `fetch`, which Next.js patches and
**caches in the Data Cache by default**, keyed by the request URL. For a list
query, the key includes the query string (e.g. `...&limit=500`), so a single
limit value can get **stuck on an old snapshot** while other limits look fine.
The cache is separate from the edge/CDN cache, so `x-vercel-cache: MISS` and
URL cache-busters on the *route* do **not** help — the stale read is on the
internal supabase fetch.

## Incident (2026-07-04)
`/api/chat/list` had no cache directives. `staff-chat` calls it with
`limit=500`. That fetch key was cached with a `2026-07-03` window
(`[07-03 05:40 → 2026-04-09]`, exactly 500 rows), so **today's messages were
hidden after every app re-entry** — while `limit=499/501/600/1000` and raw
Supabase REST all returned the newest rows. Deterministic (5/5), env-independent.

- Band-aid: `STAFF_CHAT_LIST_LIMIT 500 → 499` (different, fresh cache key). Not a
  fix — 499 can go stale the same way.
- Real fix: added `dynamic` + `fetchCache='force-no-store'` to `chat/list` and
  `chat/send`; `limit=500` then verified fresh 8/8. Limit restored to 500.

## Precedent
The staff auth routes (`app/api/staff/session|login|logout|devices/register`)
already carry these directives — they were added earlier to fix a stale
session-read (a revoked session still validating). Same class of bug.

## Checklist when adding a supabase-js API route
- [ ] `export const dynamic = 'force-dynamic'`
- [ ] `export const fetchCache = 'force-no-store'`
- [ ] `export const runtime = 'nodejs'` (if using Node APIs)
- [ ] Verify: repeat the exact request several times; the newest row must not be stale.
