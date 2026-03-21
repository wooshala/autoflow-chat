-- 최소 대화방 + 참가자 구조 (권한/RLS는 후속 작업)
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default '기본 대화방',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (room_id, user_id)
);

create index if not exists chat_room_participants_room_active_idx
  on public.chat_room_participants (room_id)
  where status = 'active';

comment on table public.chat_rooms is '채팅방(추후 메시지 room_id FK 등과 연결)';
comment on table public.chat_room_participants is '방 참가자; status=removed 는 soft leave';
