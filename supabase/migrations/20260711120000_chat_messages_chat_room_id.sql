-- Phase 1A: nullable chat_messages.chat_room_id FK, default group room seed, backfill.
-- Idempotent: safe to re-run. Does not change RLS, publication, or realtime settings.
--
-- Transaction note: Supabase CLI (`migration up` / `db push`) wraps each migration file in a
-- single BEGIN/COMMIT (see supabase/cli#5156, PR #5671). This file has no explicit BEGIN/COMMIT.
-- Manual statement-by-statement execution in the SQL editor is NOT atomic — avoid for production.

do $$
declare
  default_uuid uuid := '00000000-0000-0000-0000-000000000001';
  default_name text := '청소팀 단체방';
  existing_name text;
begin
  select name into existing_name
  from public.chat_rooms
  where id = default_uuid;

  if existing_name is null then
    insert into public.chat_rooms (id, name)
    values (default_uuid, default_name);
  elsif existing_name <> default_name then
    raise exception 'DEFAULT_CHAT_ROOM_ID_CONFLICT: id=% name=%', default_uuid, existing_name;
  end if;
end $$;

alter table public.chat_messages
  add column if not exists chat_room_id uuid null
  default '00000000-0000-0000-0000-000000000001';

-- Re-run safe: ensure column default even if column already existed without default.
alter table public.chat_messages
  alter column chat_room_id set default '00000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_chat_room_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_chat_room_id_fkey
      foreign key (chat_room_id) references public.chat_rooms (id);
  end if;
end $$;

update public.chat_messages
set chat_room_id = '00000000-0000-0000-0000-000000000001'
where chat_room_id is null;

create index if not exists chat_messages_chat_room_id_created_at_idx
  on public.chat_messages (chat_room_id, created_at desc);

comment on column public.chat_messages.chat_room_id is
  '메신저 채팅방 FK. room_no는 호텔 객실번호 메타데이터.';
