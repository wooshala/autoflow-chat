-- Device side for chat bubble alignment (pc | mobile)
alter table if exists public.chat_messages
  add column if not exists sender_side text;

comment on column public.chat_messages.sender_side is 'Sender device: pc or mobile';
