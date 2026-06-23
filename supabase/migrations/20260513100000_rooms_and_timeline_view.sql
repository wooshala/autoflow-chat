-- rooms: minimal lookup table (room_no is the operational key everywhere else)
create table if not exists public.rooms (
  id         uuid        primary key default gen_random_uuid(),
  room_no    text        not null unique,
  floor      text        null,
  status     text        not null default 'vacant'
               check (status in ('vacant', 'occupied', 'cleaning')),
  notes      text        null,
  created_at timestamptz not null default now()
);

create index if not exists rooms_room_no_idx on public.rooms (room_no);

-- room_timeline: composed read-only view over existing event sources.
-- No new write authority — source tables keep their own ownership.
-- Canonical shape: room_no / occurred_at / source_type / event_type / summary / severity / reference_id / meta
create or replace view public.room_timeline as

-- message_intents: AI-classified chat events
select
  mi.room_no,
  mi.created_at                                      as occurred_at,
  'intent'::text                                     as source_type,
  mi.issue_type                                      as event_type,
  coalesce(mi.summary, mi.issue_type)                as summary,
  'normal'::text                                     as severity,
  mi.id::text                                        as reference_id,
  jsonb_build_object(
    'is_ticketable', mi.is_ticketable,
    'confidence',    mi.confidence
  )                                                  as meta
from public.message_intents mi
where mi.room_no is not null

union all

-- tickets: maintenance events (status uppercase in DB: OPEN / IN_PROGRESS / DONE)
select
  t.room_no,
  t.created_at                                       as occurred_at,
  'ticket'::text                                     as source_type,
  t.issue_type::text                                 as event_type,
  coalesce(t.description, t.issue_type::text)        as summary,
  case when t.status = 'OPEN' then 'high' else 'normal' end as severity,
  t.id::text                                         as reference_id,
  jsonb_build_object('status', t.status)             as meta
from public.tickets t

union all

-- chat_ops_queue: ops-classified items (uses room_number, not room_no)
select
  coq.room_number                                    as room_no,
  coq.created_at                                     as occurred_at,
  'queue'::text                                      as source_type,
  coq.main_category                                  as event_type,
  coq.summary                                        as summary,
  case when coq.urgent then 'urgent' else 'normal' end as severity,
  coq.id::text                                       as reference_id,
  jsonb_build_object(
    'status', coq.status,
    'tone',   coq.tone
  )                                                  as meta
from public.chat_ops_queue coq
where coq.room_number is not null;
