-- IMAGE-CHAT-01A — Guest → Staff image attachments (additive only).
-- Does NOT alter guest_chat_messages columns (original_text stays NOT NULL).

create table if not exists public.guest_chat_pending_uploads (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.guest_chat_sessions(id) on delete cascade,
  channel_key     text not null,
  storage_path    text not null,
  mime_type       text not null,
  size_bytes      integer not null check (size_bytes > 0),
  created_at      timestamptz not null default now(),
  consumed_at     timestamptz null,
  constraint guest_chat_pending_uploads_storage_path_unique unique (storage_path)
);

create index if not exists guest_chat_pending_uploads_session_idx
  on public.guest_chat_pending_uploads (session_id);

create index if not exists guest_chat_pending_uploads_session_unconsumed_idx
  on public.guest_chat_pending_uploads (session_id)
  where consumed_at is null;

alter table public.guest_chat_pending_uploads enable row level security;

comment on table public.guest_chat_pending_uploads is
  'Pre-message guest image uploads (opaque upload_token = id). Consumed when linked to a message.';

create table if not exists public.guest_chat_attachments (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.guest_chat_messages(id) on delete cascade,
  session_id      uuid not null references public.guest_chat_sessions(id) on delete cascade,
  storage_path    text not null,
  mime_type       text not null,
  size_bytes      integer not null check (size_bytes > 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint guest_chat_attachments_storage_path_unique unique (storage_path)
);

create index if not exists guest_chat_attachments_message_idx
  on public.guest_chat_attachments (message_id);

create index if not exists guest_chat_attachments_session_idx
  on public.guest_chat_attachments (session_id);

alter table public.guest_chat_attachments enable row level security;

comment on table public.guest_chat_attachments is
  'Guest chat image attachments (Guest→Staff Phase A). storage_path only — signed URLs minted at read time.';
