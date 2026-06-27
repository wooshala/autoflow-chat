-- Phase 2A: read receipts (watermark model). Additive only — no DROP / DELETE / TRUNCATE.
-- No RLS change. No realtime publication change (live updates use a broadcast channel,
-- chat_read_state is intentionally NOT added to supabase_realtime).
--
-- Model: one watermark row per (room, reader). room_id NULL = 기본방 (message convention).
-- A plain unique(room_id, reader_id) would NOT collide on NULL room_id (NULLs are distinct
-- in unique constraints), so uniqueness is enforced via a coalesce expression index, and
-- the chat_read_advance() rpc upserts against the same expression (atomic, no-retreat).

create table if not exists chat_read_state (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  reader_id text not null,
  last_read_at timestamptz not null,
  last_read_message_id uuid,
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_read_state_room_reader_uidx
  on chat_read_state (coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid), reader_id);

create index if not exists chat_read_state_reader_idx
  on chat_read_state (reader_id);

-- Monotonic watermark advance: insert-or-advance, never retreat. NULL-room safe.
create or replace function chat_read_advance(
  p_room uuid,
  p_reader text,
  p_at timestamptz,
  p_msg uuid
) returns void
language sql
security definer
set search_path = public
as $$
  insert into chat_read_state (room_id, reader_id, last_read_at, last_read_message_id, updated_at)
  values (p_room, p_reader, p_at, p_msg, now())
  on conflict (coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid), reader_id)
  do update set
    last_read_at = excluded.last_read_at,
    last_read_message_id = excluded.last_read_message_id,
    updated_at = now()
  where excluded.last_read_at > chat_read_state.last_read_at;
$$;
