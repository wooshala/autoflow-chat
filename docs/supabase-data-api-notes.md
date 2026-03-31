## Supabase Data API / schema cache notes (field report)

This document records observed behavior in this project (no root-cause claims).

### Observed symptoms

- `GET /api/chat/send` inserts a row, and the inserted row is immediately readable by `SELECT ... WHERE id = <probe_id>` via Supabase client.
- Shortly after the write, **top-N list** style reads (equivalent to `ORDER BY created_at DESC LIMIT N`) can temporarily return an older snapshot.
- For room participants, PostgREST relationship/embed lookups can error with schema cache/relationship messages (suggesting a Data API layer issue rather than SQL semantics).

### What we tried

- Compare behaviors using:
  - Single-row read by `id`
  - Raw list (order by + limit)
  - RPC top-N (SQL executed inside Postgres)
- Add minimal diagnostics (`DB now()` via RPC, url host logs).

### Current mitigation (temporary)

- Server keeps a small in-memory buffer of recently saved chat messages from `/api/chat/send`.
- `/api/chat/list` merges buffered rows into `full_table` responses when missing, to reduce refresh misses.

### Follow-ups

- Confirm whether the project URL used by server reads is a Primary endpoint.
- Check Supabase logs (API/PostgREST) and schema cache refresh patterns.
- Treat room participants relationship/embed errors as a separate issue.

