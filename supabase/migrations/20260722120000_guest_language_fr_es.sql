-- Phase 2B hotfix — allow fr/es on the guest language columns.
--
-- Phase 2B added French (fr) and Spanish (es) to the app + validation, but NOT to these two DB
-- CHECK constraints, so a guest selecting Français/Español failed the UPDATE with a PostgreSQL
-- 23514 CHECK violation (guest_chat_sessions_language_code_check / guest_chat_channels_
-- preferred_language_check). This widens the allowed set from ('ko','en','ja','zh-CN','ru') to
-- include 'fr','es'.
--
-- ADDITIVE / SAFE: no data is read, updated or deleted; column names and types are unchanged;
-- only the allowed-value list is widened. NULL stays valid (an IN (...) check passes NULL, matching
-- the original behaviour — language_code / preferred_language are NULL until the guest selects).
-- Constraint names are the existing auto-generated ones (verified against the live DB), and are
-- dropped with IF EXISTS then re-created with the SAME explicit name — no orphan, re-runnable.

alter table guest_chat_sessions
  drop constraint if exists guest_chat_sessions_language_code_check;
alter table guest_chat_sessions
  add constraint guest_chat_sessions_language_code_check
  check (language_code in ('ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es'));

alter table guest_chat_channels
  drop constraint if exists guest_chat_channels_preferred_language_check;
alter table guest_chat_channels
  add constraint guest_chat_channels_preferred_language_check
  check (preferred_language in ('ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es'));
