-- Phase 1H.7 — Guest Session foundation. Room (channel) → Session → Messages, so a new
-- guest is fully separated from the previous one. ADDITIVE ONLY. No message deletion.
--
-- Applied ONCE to the shared remote project via Supabase SQL Editor. Server-only
-- (service role); RLS default-deny.

create table if not exists guest_chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  channel_key text not null,
  status      text not null default 'open' check (status in ('open','closed')),
  started_at  timestamptz not null default now(),
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- At most ONE open session per room.
create unique index if not exists guest_chat_sessions_one_open_per_channel
  on guest_chat_sessions (channel_key) where status = 'open';
create index if not exists guest_chat_sessions_channel_idx
  on guest_chat_sessions (channel_key, status);

alter table guest_chat_sessions enable row level security;

-- Messages gain a session pointer (nullable; backfilled below). Existing rows preserved.
alter table guest_chat_messages add column if not exists session_id uuid;
create index if not exists guest_chat_messages_session_idx
  on guest_chat_messages (session_id, created_at, id);

-- Backfill (Method A — safe): one CLOSED "legacy" session per channel that still has
-- orphan (session_id IS NULL) messages. Existing messages are PRESERVED in that closed legacy
-- session. They are NOT shown in the active chat UI and are NEVER auto-claimed by a new guest.
-- NOTE: there is no past-conversation view yet — a UI/API to read closed legacy sessions is
-- OUT OF SCOPE for this phase, so these rows are retained-but-not-surfaced (not "staff history").
-- Idempotent: only NULL-session rows are touched, so after the first run there are no orphans
-- and a re-run inserts/updates nothing.
insert into guest_chat_sessions (channel_key, status, closed_at)
select distinct channel_key, 'closed', now()
from guest_chat_messages
where session_id is null;

update guest_chat_messages m
set session_id = s.id
from guest_chat_sessions s
where m.session_id is null and m.channel_key = s.channel_key and s.status = 'closed';

comment on table guest_chat_sessions is
  'Phase 1H.7: per-guest session (auto-created on scan, staff-closed). Cookie afg_sid = session id.';
