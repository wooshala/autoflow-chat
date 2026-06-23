create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('admin','front','cleaning')),
  language text not null default 'ko',
  pin text not null,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  message text not null,
  message_type text not null default 'text',
  room_no text,
  image_url text,
  image_storage_path text,
  original_lang text,
  translated_text jsonb,
  back_translated_text jsonb,
  ticket_id uuid,
  ai_action text,
  created_at timestamptz not null default now()
);

alter table if exists chat_messages
  add column if not exists ai_action text;

alter table if exists chat_messages
  add column if not exists duplicate_ticket_id uuid;

alter table if exists chat_messages
  add column if not exists sender_side text;

alter table if exists chat_messages
  add column if not exists is_deleted boolean not null default false;

alter table if exists chat_messages
  add column if not exists deleted_at timestamptz;

alter table if exists chat_messages
  add column if not exists priority text default 'normal';

create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default '기본 대화방',
  created_at timestamptz not null default now()
);

create table if not exists chat_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (room_id, user_id)
);

create index if not exists chat_room_participants_room_active_idx
  on chat_room_participants (room_id)
  where status = 'active';

create table if not exists maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  room_no text not null,
  issue_type text not null,
  description text not null,
  status text not null default 'open',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists maintenance_photos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references maintenance_tickets(id) on delete cascade,
  image_url text not null,
  storage_path text,
  photo_type text not null default 'before',
  created_at timestamptz not null default now()
);
