-- Guest Chat soft-delete (LEVEL B). Additive only — does not touch chat_messages / ops chat.

alter table if exists public.guest_chat_messages
  add column if not exists is_deleted boolean not null default false;

alter table if exists public.guest_chat_messages
  add column if not exists deleted_at timestamptz;

alter table if exists public.guest_chat_messages
  add column if not exists deleted_by text;

alter table if exists public.guest_chat_messages
  add column if not exists deleted_reason text
    check (deleted_reason is null or deleted_reason in ('owner', 'admin'));

-- Staff sender identity for ownership checks on delete (null = legacy rows before this migration).
alter table if exists public.guest_chat_messages
  add column if not exists staff_user_id uuid;

comment on column public.guest_chat_messages.is_deleted is
  'Soft-delete flag. Physical DELETE forbidden; keep original_text.';
comment on column public.guest_chat_messages.staff_user_id is
  'users.id of staff sender when sender=staff; used for delete ownership.';

create index if not exists guest_chat_messages_session_alive_idx
  on public.guest_chat_messages (session_id, created_at, id)
  where is_deleted = false;
