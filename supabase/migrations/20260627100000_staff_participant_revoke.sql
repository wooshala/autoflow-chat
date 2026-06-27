-- Participant kick / entry QR reissue (MVP — staff_invites based)

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS device_key text;

CREATE INDEX IF NOT EXISTS idx_staff_invites_site_enabled
  ON staff_invites (site_id, enabled);

-- Shared onboarding QR (one active per site)
CREATE TABLE IF NOT EXISTS staff_entry_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_entry_invites_one_active_per_site
  ON staff_entry_invites (site_id)
  WHERE status = 'active';

-- Block re-join via same device after kick (MVP)
CREATE TABLE IF NOT EXISTS staff_revoked_devices (
  site_id text NOT NULL,
  device_key text NOT NULL,
  invite_id uuid REFERENCES staff_invites(id) ON DELETE SET NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, device_key)
);
