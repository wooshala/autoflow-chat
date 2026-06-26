-- Staff work status (operational state: 근무 가능 / 청소 중 / 휴식 / 외출 / 퇴근),
-- independent of the online/offline app-connection state.

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS current_status text NOT NULL DEFAULT 'available';

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT now();

ALTER TABLE staff_invites
  DROP CONSTRAINT IF EXISTS staff_invites_current_status_check;

ALTER TABLE staff_invites
  ADD CONSTRAINT staff_invites_current_status_check
  CHECK (current_status IN ('available', 'cleaning', 'break', 'outside', 'off_duty', 'revoked'));
