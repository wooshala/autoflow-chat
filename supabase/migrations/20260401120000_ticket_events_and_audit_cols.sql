-- Dashboard MVP audit trail (tickets status changes)

alter table public.tickets
  add column if not exists updated_by uuid null,
  add column if not exists status_changed_at timestamptz null;

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  event_type text not null check (event_type in ('status_changed')),
  from_status text null,
  to_status text null,
  actor_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_id_created_at_idx
  on public.ticket_events (ticket_id, created_at desc);

