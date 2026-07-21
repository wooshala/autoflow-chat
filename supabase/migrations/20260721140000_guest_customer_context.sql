-- Phase 2A — Guest Customer Context. A SMALL, SESSION-SCOPED operational memo the staff edits
-- while chatting (name / phone / checkout date / vehicle / memo). This is NOT a reservation
-- ledger and NOT a PMS: exactly ONE row per guest_chat_sessions.id (session_id UNIQUE), so a
-- new guest session starts EMPTY and NEVER inherits the previous guest's info. Room number and
-- language are NOT duplicated here — they come from the session. Staff-entered only; no auto
-- matching / estimation from OTA / CRM / stay journal.
--
-- ADDITIVE ONLY. Applied ONCE to the shared remote project via Supabase SQL Editor. Server-only
-- (service role); RLS default-deny.

create table if not exists guest_customer_context (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null unique references guest_chat_sessions(id) on delete cascade,
  guest_name     text not null default '' check (char_length(guest_name)  <= 100),
  guest_phone    text not null default '' check (char_length(guest_phone) <= 50),
  check_out_date date,                    -- nullable; past dates allowed (late/back entry)
  vehicle_no     text not null default '' check (char_length(vehicle_no)  <= 50),
  memo           text not null default '' check (char_length(memo)        <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text check (updated_by is null or char_length(updated_by) <= 100)
);

-- one context per session (also the upsert conflict target)
create index if not exists guest_customer_context_session_idx
  on guest_customer_context (session_id);

alter table guest_customer_context enable row level security;

comment on table guest_customer_context is
  'Phase 2A: session-scoped, staff-edited customer memo (1 row per guest_chat_sessions.id). Not a reservation. New session starts empty; previous guest info is never inherited.';
