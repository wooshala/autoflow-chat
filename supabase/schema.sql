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
  ticket_id uuid,
  created_at timestamptz not null default now()
);

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
