-- Chat Ops Queue (server-side)
create table if not exists public.chat_ops_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  room_number text null,
  main_category text not null,
  tone text not null,
  urgent boolean not null default false,
  request boolean not null default false,
  status_flag boolean not null default false,
  status text not null default 'new',
  summary text not null,
  text text not null,
  matched_keywords jsonb null,
  reasons text[] null
);

create index if not exists chat_ops_queue_created_at_idx on public.chat_ops_queue (created_at desc);
create index if not exists chat_ops_queue_status_idx on public.chat_ops_queue (status);
create index if not exists chat_ops_queue_main_category_idx on public.chat_ops_queue (main_category);
create index if not exists chat_ops_queue_room_number_idx on public.chat_ops_queue (room_number);

