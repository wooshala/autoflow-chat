-- Chat → ticket automation step 1
-- - Keep chat_messages as immutable source-of-truth
-- - Store AI intent results separately in message_intents

create table if not exists public.message_intents (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  room_no text null,
  issue_type text not null check (issue_type in ('housekeeping', 'maintenance', 'frontdesk', 'checkout', 'payment', 'ops_note')),
  summary text null,
  is_ticketable boolean not null default false,
  is_new_issue boolean not null default false,
  matched_ticket_id text null,
  confidence numeric null,
  raw_ai_result jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists message_intents_message_id_idx
  on public.message_intents (message_id);

create index if not exists message_intents_room_issue_created_at_idx
  on public.message_intents (room_no, issue_type, created_at desc);

