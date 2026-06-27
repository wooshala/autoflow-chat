-- Phase 2B (Call): per-message call timestamp + caller. Additive only — no DROP /
-- DELETE / TRUNCATE. No RLS change. No realtime publication change (chat_messages is
-- already published; the new columns flow in existing UPDATE payloads automatically).
--
-- last_called_at: when the message was last "called" (재호출) — drives 30s cooldown + UI.
-- last_called_by: caller's canonical reader_id (user:<users.id>).

alter table if exists chat_messages
  add column if not exists last_called_at timestamptz;

alter table if exists chat_messages
  add column if not exists last_called_by text;
