-- Phase 1H.5 — per-channel preferred language (guest-selected). ADDITIVE ONLY: does not
-- touch guest_chat_messages or any existing table. Removes room-number → language
-- hardcoding by making the channel's language a first-class, guest-chosen value.
--
-- Applied ONCE to the shared remote project via Supabase SQL Editor. Server-only
-- (service role); RLS enabled with NO policy (default deny) — all access via server routes.

create table if not exists guest_chat_channels (
  channel_key        text primary key,
  preferred_language text not null
                     check (preferred_language in ('ko','en','ja','zh-CN','ru')),
  language_source    text not null default 'user_selected'
                     check (language_source in ('user_selected','staff_selected','system_default')),
  updated_at         timestamptz not null default now()
);

alter table guest_chat_channels enable row level security;

comment on table guest_chat_channels is
  'Phase 1H.5: per-channel guest-preferred language. preferred_language ≠ per-message original_lang.';
