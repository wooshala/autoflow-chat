-- Phase 1A — Customer Service Channel: isolated foreign-guest chat data boundary.
--
-- Goal: an untrusted foreign guest MUST NOT be able to reach existing staff chat,
-- other rooms, other stays, or internal memos. This migration adds ONLY new tables,
-- indexes and RLS. It does NOT touch chat_messages, chat_rooms, staff_* , storage,
-- or the stay-journal DB.
--
-- Authorization model (defense in depth):
--   * RLS is ENABLED + FORCED on every table here, with NO permissive policy for the
--     anon / authenticated roles, and an explicit REVOKE from those roles. Result:
--     the browser/EXE anon key CANNOT read or write these tables directly (default deny).
--   * All legitimate access goes through server routes using the service_role key
--     (which bypasses RLS). The server data-access layer (lib/customer-service/*)
--     enforces: guest-token validation, server-forced sender_type, tenant (site_id),
--     conversation scoping, and public/internal visibility.
--   * site_id is the tenant boundary from day one (consistent with staff_* tables).
--   * room_no is a display snapshot only, NEVER an authorization key.
--
-- Forward-only. New tables only; safe to roll back by dropping them (no prod data yet).

-- ─────────────────────────────────────────────────────────────────────────────
-- shared updated_at trigger (scoped name to avoid clashing with existing funcs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION customer_service_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. customer_stays — minimal, independent stay session (NOT linked to PMS/ledger)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE customer_stays (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                text NOT NULL,                         -- tenant boundary
  room_no                text NOT NULL,                         -- display snapshot, not auth key
  guest_language         text NOT NULL DEFAULT 'en',            -- BCP-47 primary code
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','checked_out','revoked')),
  checkin_at             timestamptz NOT NULL DEFAULT now(),
  checkout_at            timestamptz,
  external_reservation_id text,                                 -- future PMS/ledger link only; unused in 1A
  guest_display_name     text,
  guest_phone_masked     text,                                  -- masked only; raw phone never stored here
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_stays_site_room ON customer_stays (site_id, room_no);
CREATE INDEX idx_customer_stays_status    ON customer_stays (site_id, status);
CREATE TRIGGER trg_customer_stays_updated
  BEFORE UPDATE ON customer_stays
  FOR EACH ROW EXECUTE FUNCTION customer_service_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. customer_conversations — one open conversation per stay
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE customer_conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          text NOT NULL,
  stay_id          uuid NOT NULL REFERENCES customer_stays(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  guest_language   text NOT NULL DEFAULT 'en',
  room_no_snapshot text,                                        -- display only, not auth key
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- MVP invariant: at most ONE open conversation per stay.
CREATE UNIQUE INDEX uq_customer_conversations_one_open_per_stay
  ON customer_conversations (stay_id) WHERE status = 'open';
CREATE INDEX idx_customer_conversations_site_stay ON customer_conversations (site_id, stay_id);
CREATE INDEX idx_customer_conversations_recent    ON customer_conversations (site_id, last_message_at DESC);
CREATE TRIGGER trg_customer_conversations_updated
  BEFORE UPDATE ON customer_conversations
  FOR EACH ROW EXECUTE FUNCTION customer_service_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. customer_messages — original preserved; translation kept separately
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE customer_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              text NOT NULL,
  conversation_id      uuid NOT NULL REFERENCES customer_conversations(id) ON DELETE CASCADE,
  sender_type          text NOT NULL CHECK (sender_type IN ('guest','staff','system')),
  sender_staff_user_id uuid,                                    -- set only for staff/system; loose ref (no FK, channel isolation)
  visibility           text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  message_type         text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','system')),
  original_text        text,                                    -- authored text; never overwritten by a translation
  original_language    text,                                    -- BCP-47
  translated_text      jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { "<bcp47>": "<text>", ... }; separate from original
  translation_status   text NOT NULL DEFAULT 'not_requested'
                         CHECK (translation_status IN ('not_requested','pending','completed','failed')),
  translation_provider text,
  translation_error    text,
  translated_at        timestamptz,
  image_storage_path   text,                                    -- private-bucket path only; NO public URL stored
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  -- A guest can only ever author public messages.
  CONSTRAINT chk_guest_public_only CHECK (sender_type <> 'guest' OR visibility = 'public'),
  -- Internal memos may only come from staff/system.
  CONSTRAINT chk_internal_staff_only CHECK (visibility <> 'internal' OR sender_type IN ('staff','system'))
);
CREATE INDEX idx_customer_messages_conversation ON customer_messages (conversation_id, created_at);
CREATE INDEX idx_customer_messages_site         ON customer_messages (site_id);
-- Fast path for the guest read query (public, not deleted).
CREATE INDEX idx_customer_messages_public
  ON customer_messages (conversation_id, created_at)
  WHERE visibility = 'public' AND deleted_at IS NULL;
CREATE TRIGGER trg_customer_messages_updated
  BEFORE UPDATE ON customer_messages
  FOR EACH ROW EXECUTE FUNCTION customer_service_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. customer_access_tokens — hash only; instant revoke; server-decided scope
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE customer_access_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         text NOT NULL,
  stay_id         uuid NOT NULL REFERENCES customer_stays(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES customer_conversations(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,                         -- SHA-256 hex of raw token; raw NEVER stored/logged
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_access_tokens_stay   ON customer_access_tokens (stay_id);
CREATE INDEX idx_customer_access_tokens_status ON customer_access_tokens (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. customer_conversation_read_state — per-reader conversation cursor
--    (chosen over per-message receipts: supports multiple staff readers without a
--     row-per-message-per-reader explosion; guest is a single reader per conversation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE customer_conversation_read_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES customer_conversations(id) ON DELETE CASCADE,
  reader_type     text NOT NULL CHECK (reader_type IN ('guest','staff')),
  staff_user_id   uuid,                                          -- null for guest; set per staff reader
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_staff_reader_has_id CHECK (reader_type <> 'staff' OR staff_user_id IS NOT NULL),
  CONSTRAINT chk_guest_reader_no_id  CHECK (reader_type <> 'guest' OR staff_user_id IS NULL)
);
CREATE UNIQUE INDEX uq_read_state_guest ON customer_conversation_read_state (conversation_id)
  WHERE reader_type = 'guest';
CREATE UNIQUE INDEX uq_read_state_staff ON customer_conversation_read_state (conversation_id, staff_user_id)
  WHERE reader_type = 'staff';
CREATE TRIGGER trg_customer_read_state_updated
  BEFORE UPDATE ON customer_conversation_read_state
  FOR EACH ROW EXECUTE FUNCTION customer_service_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — default deny for anon/authenticated; server service_role only
-- ─────────────────────────────────────────────────────────────────────────────
-- Enable + FORCE (so even the table owner is subject to RLS) and REVOKE the client
-- roles. With RLS enabled and NO permissive policy, anon/authenticated are denied
-- even if a default SELECT grant exists. service_role bypasses RLS entirely and is
-- used only by server routes. No guest/staff RLS policy is added in 1A because
-- neither guest nor staff authenticates via Supabase Auth (no auth.uid()); identity
-- is established server-side (see docs/customer-service/channel-contract.md).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_stays',
    'customer_conversations',
    'customer_messages',
    'customer_access_tokens',
    'customer_conversation_read_state'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated;', t);
  END LOOP;
END $$;

COMMENT ON TABLE customer_stays IS 'Phase 1A customer-service channel: independent guest stay session. Isolated from staff chat_messages and the stay-journal ledger.';
COMMENT ON TABLE customer_conversations IS 'One open conversation per stay. Authorization keyed by id + stay_id + site_id, never room_no.';
COMMENT ON TABLE customer_messages IS 'Guest/staff/system messages. Guests may only author public; internal only from staff/system. Original text preserved separately from translated_text.';
COMMENT ON TABLE customer_access_tokens IS 'Opaque guest access tokens. Only SHA-256 hash stored; raw token never persisted or logged. Instant revoke on checkout.';
COMMENT ON COLUMN customer_messages.image_storage_path IS 'Private storage path only. Public URLs must NOT be stored here (Phase 1B uses signed URLs).';
