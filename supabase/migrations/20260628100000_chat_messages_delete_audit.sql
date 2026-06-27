-- Phase 1 (message delete): audit columns for who deleted a message and why.
-- Additive only — no DROP / DELETE / TRUNCATE. Existing rows get NULLs.
-- deleted_reason: 'owner' (sender removed own message) | 'admin' (PC/관리자 override).
-- deleted_by: the requester's users.id who performed the soft delete.

alter table if exists chat_messages
  add column if not exists deleted_by uuid;

alter table if exists chat_messages
  add column if not exists deleted_reason text;
