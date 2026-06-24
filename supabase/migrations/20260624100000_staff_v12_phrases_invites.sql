-- Staff Chat v1.2: Quick Phrases (DB) + Staff Invites + message metadata

CREATE TABLE IF NOT EXISTS chat_quick_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  phrase_key text NOT NULL,
  ko text NOT NULL,
  ru text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, phrase_key)
);

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  token text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL,
  user_id uuid REFERENCES users(id),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS phrase_key text;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS sender_name text;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES staff_invites(id);

CREATE INDEX IF NOT EXISTS idx_chat_quick_phrases_site ON chat_quick_phrases (site_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_staff_invites_site ON staff_invites (site_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_token_id ON chat_messages (token_id);

-- Default quick phrases (site: default)
INSERT INTO chat_quick_phrases (site_id, phrase_key, ko, ru, sort_order) VALUES
  ('default', 'clean_done', '청소완료', 'Уборка завершена', 0),
  ('default', 'luggage', '짐있음', 'Есть багаж', 1),
  ('default', 'lost_item', '분실물', 'Потерянная вещь', 2),
  ('default', 'cigarette_smell', '담배냄새', 'Запах сигарет', 3),
  ('default', 'need_towel', '수건부족', 'Нужны полотенца', 4),
  ('default', 'supply_shortage', '비품부족', 'Не хватает расходников', 5)
ON CONFLICT (site_id, phrase_key) DO NOTHING;
