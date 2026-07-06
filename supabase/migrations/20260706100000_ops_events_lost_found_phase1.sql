-- Phase 1: lost_found_items vertical slice (apply Staging first; Production gated separately)

create table if not exists public.ops_event_number_counters (
  site_id    text not null,
  category   text not null check (category in ('lost_found', 'maintenance', 'ops_note')),
  last_value integer not null default 0,
  primary key (site_id, category)
);

create or replace function public.assign_ops_event_number(
  p_site_id text,
  p_category text,
  p_prefix text
)
returns text
language plpgsql
as $$
declare
  v int;
begin
  insert into public.ops_event_number_counters (site_id, category, last_value)
  values (p_site_id, p_category, 1)
  on conflict (site_id, category) do update
    set last_value = public.ops_event_number_counters.last_value + 1
  returning last_value into v;
  return p_prefix || lpad(v::text, 6, '0');
end;
$$;

create table if not exists public.ops_event_history (
  id                uuid        primary key default gen_random_uuid(),
  site_id           text        not null default 'default',
  ref_table         text        not null
    check (ref_table in ('lost_found_items', 'maintenance_tickets', 'ops_notes')),
  ref_id            uuid        not null,
  action            text        not null
    check (action in ('created', 'status_changed', 'reopened', 'note_added', 'soft_deleted')),
  from_status       text        null,
  to_status         text        null,
  actor_id          uuid        not null references public.users(id),
  actor_name        text        not null,
  actor_role        text        null,
  transition_note   text        null,
  meta              jsonb       null,
  idempotency_key   text        null,
  created_at        timestamptz not null default now()
);

create index if not exists ops_event_history_ref_idx
  on public.ops_event_history (ref_table, ref_id, created_at asc);

create unique index if not exists ops_event_history_idempotency_uidx
  on public.ops_event_history (site_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.storage_protected_paths (
  id            uuid        primary key default gen_random_uuid(),
  site_id       text        not null default 'default',
  path          text        not null,
  bucket        text        not null default 'autoflow-photos',
  reason        text        not null check (reason in ('ops_event', 'legal_hold')),
  ref_table     text        not null,
  ref_id        uuid        not null,
  created_at    timestamptz not null default now(),
  unique (bucket, path)
);

create index if not exists storage_protected_paths_ref_idx
  on public.storage_protected_paths (ref_table, ref_id);

create table if not exists public.lost_found_items (
  id                      uuid        primary key default gen_random_uuid(),
  event_no                text        not null,
  site_id                 text        not null default 'default',
  source                  text        not null default 'autoflow'
    check (source = 'autoflow'),
  snap_room_no            text        null,
  snap_sender             text        null,
  snap_sender_role        text        null,
  snap_image_url          text        null,
  snap_storage_path       text        null,
  snap_message_text       text        null,
  snap_message_created_at timestamptz null,
  origin_message_id       uuid        null,
  idempotency_key         text        null,
  item_description        text        not null,
  found_location          text        null,
  locker_code             text        null,
  status                  text        not null default 'registered'
    check (status in (
      'registered', 'stored', 'owner_notified',
      'returned', 'disposed', 'cancelled'
    )),
  status_changed_at       timestamptz null,
  status_changed_by       uuid        null references public.users(id),
  created_by              uuid        not null references public.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  is_deleted              boolean     not null default false,
  deleted_at              timestamptz null,
  constraint lost_found_items_event_no_format
    check (event_no ~ '^LF-\d{6}$')
);

create unique index if not exists lost_found_items_event_no_uidx
  on public.lost_found_items (site_id, event_no);

create unique index if not exists lost_found_items_message_category_uidx
  on public.lost_found_items (site_id, origin_message_id)
  where origin_message_id is not null and is_deleted = false;

create unique index if not exists lost_found_items_idempotency_uidx
  on public.lost_found_items (site_id, idempotency_key)
  where idempotency_key is not null and is_deleted = false;

create index if not exists lost_found_items_room_idx
  on public.lost_found_items (snap_room_no, created_at desc);

create index if not exists lost_found_items_status_idx
  on public.lost_found_items (status, created_at desc);

alter table public.lost_found_items      enable row level security;
alter table public.ops_event_history     enable row level security;
alter table public.storage_protected_paths enable row level security;
alter table public.ops_event_number_counters enable row level security;
