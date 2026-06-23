-- Manual urgent flag for PC → staff mobile messages (v1.1)
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';

COMMENT ON COLUMN chat_messages.priority IS 'normal | urgent — null treated as normal in app';
