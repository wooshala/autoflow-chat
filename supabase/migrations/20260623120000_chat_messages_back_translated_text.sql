-- Staff chat: store OpenAI round-trip back-translation for QA / display fallback
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS back_translated_text jsonb;
