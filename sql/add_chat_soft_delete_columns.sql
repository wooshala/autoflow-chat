-- Supabase SQL Editor에서 실행: chat_messages soft delete 컬럼 추가
-- (이미 있으면 스킵)

alter table if exists public.chat_messages
  add column if not exists is_deleted boolean not null default false;

alter table if exists public.chat_messages
  add column if not exists deleted_at timestamptz;
