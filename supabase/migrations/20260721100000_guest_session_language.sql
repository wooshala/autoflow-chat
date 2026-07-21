-- Phase 1H.7 (fix) — move language ownership from CHANNEL to GUEST SESSION, so a new guest is
-- NEVER handed the previous guest's language. ADDITIVE ONLY.
--
-- guest_chat_channels.preferred_language / language_source are KEPT (compat + rollback) but are
-- no longer the source of truth for an active chat — active reads/writes use the session below.
--
-- NO backfill (deliberate): every session — existing closed, existing open, and all future ones
-- — starts with language_code = NULL. Copying the channel value would re-introduce the exact
-- stale-language leak this fixes. A fresh guest simply re-selects; the source of truth is always
-- the current OPEN session. (CHECK allows NULL, so NULL rows are valid.)
--
-- language_source uses the SAME allowed set as guest_chat_channels (20260720140000).

alter table guest_chat_sessions
  add column if not exists language_code text
    check (language_code in ('ko','en','ja','zh-CN','ru')),
  add column if not exists language_source text
    check (language_source in ('user_selected','staff_selected','system_default'));

comment on column guest_chat_sessions.language_code is
  'Phase 1H.7: the CURRENT guest session''s language. Source of truth for an active chat; NULL until the guest selects. NOT inherited across sessions.';
