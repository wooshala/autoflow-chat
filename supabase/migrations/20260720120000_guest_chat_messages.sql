-- Phase 1H.3 — Guest Chat persistence (spike bridge). ADDITIVE ONLY: does not touch
-- chat_messages, staff_*, customer_*, or any existing table. Replaces the in-memory guest
-- store so the mobile↔EXE round trip survives across Vercel serverless instances.
--
-- Applied ONCE to the shared remote project (zraynckvincilfbekbld) via Supabase SQL Editor.
-- Access is server-only (service role); RLS is enabled with NO anon policy (default deny),
-- since all reads/writes go through the server route, never the browser directly.
--
-- Forward-compatible with the frozen Guest Chat design: this is a subset of customer_messages;
-- later phases add conversation_id / visibility / translation_status columns (additive).

create table if not exists guest_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  channel_key     text not null,
  sender          text not null check (sender in ('guest', 'staff')),
  original_text   text not null,
  original_lang   text not null,
  translated_json jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Stable ordering for reads: by channel, then time, then id tiebreak.
create index if not exists guest_chat_messages_channel_created_idx
  on guest_chat_messages (channel_key, created_at, id);

-- Default-deny: enable RLS and add NO policy → only the service role (server) can access.
alter table guest_chat_messages enable row level security;

comment on table guest_chat_messages is
  'Phase 1H.3 spike: guest<->staff chat persistence (unauthenticated; server service-role only). Not for real customers until PIN/session.';
