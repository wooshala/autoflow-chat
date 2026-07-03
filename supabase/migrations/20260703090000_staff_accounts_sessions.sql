-- Phase 1: Staff account login backend (NOT wired to UI).
-- Additive ONLY. Does NOT modify/touch: staff_invites, staff_device_tokens,
-- chat_messages, chat_read_state, quick_phrases, translations, users.
-- Invite-based auth remains the operational path (fallback) and is untouched.
-- NOTE: `supabase db push` / production apply is intentionally deferred (out of Phase 1 scope).

-- ── staff_accounts ─────────────────────────────────────────────────────────
-- Login policy: name-select + 4-digit login_code (hashed via scrypt).
-- user_id links to existing users(id) for sender_name / FCM target / read-receipt
-- identity continuity (avoids later regression when FCM/read state is wired).
-- failed_attempts + locked_until implement per-account brute-force lockout
-- (handled entirely inside the new login API — no existing code touched).
CREATE TABLE IF NOT EXISTS staff_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  login_code_hash text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  -- baked in now to avoid re-migrating for multi-site / Russian TTS later:
  site_id text NOT NULL DEFAULT 'default',
  spoken_lang text NOT NULL DEFAULT 'ru',
  is_active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_accounts_active
  ON staff_accounts (is_active)
  WHERE is_active = true;

-- ── staff_sessions ─────────────────────────────────────────────────────────
-- No time-based expiry. A session ends ONLY on: manager device unbind,
-- account deactivation, app-data clear, or explicit logout (revoked_at set).
-- Only the SHA-256 hash of the session token is stored; the raw token never persists.
CREATE TABLE IF NOT EXISTS staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id uuid NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_account
  ON staff_sessions (staff_account_id);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_active
  ON staff_sessions (session_hash)
  WHERE revoked_at IS NULL;

-- ── updated_at trigger (mirrors staff_device_tokens convention) ──────────────
CREATE OR REPLACE FUNCTION set_staff_accounts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_accounts_updated_at ON staff_accounts;
CREATE TRIGGER trg_staff_accounts_updated_at
BEFORE UPDATE ON staff_accounts
FOR EACH ROW
EXECUTE FUNCTION set_staff_accounts_updated_at();
