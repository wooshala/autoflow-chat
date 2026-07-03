-- Native Android staff push tokens for FCM notification delivery.
-- Additive only: no data deletion. Tokens are disabled on invalid/stale FCM responses.

CREATE TABLE IF NOT EXISTS staff_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_invite_id uuid REFERENCES staff_invites(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  fcm_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  device_key text,
  device_label text,
  app_version text,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_device_tokens_invite_enabled
  ON staff_device_tokens (staff_invite_id)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_staff_device_tokens_user_enabled
  ON staff_device_tokens (user_id)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_staff_device_tokens_seen_enabled
  ON staff_device_tokens (last_seen_at)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION set_staff_device_tokens_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_device_tokens_updated_at ON staff_device_tokens;
CREATE TRIGGER trg_staff_device_tokens_updated_at
BEFORE UPDATE ON staff_device_tokens
FOR EACH ROW
EXECUTE FUNCTION set_staff_device_tokens_updated_at();
