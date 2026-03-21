-- Run in Supabase SQL Editor (Dashboard → SQL) to verify Realtime delivery for chat_messages.
-- 1) Publication: table must be in supabase_realtime publication (Supabase often adds this via UI:
--    Database → Replication → supabase_realtime → enable chat_messages).

-- List tables in realtime publication (Postgres 15+ / Supabase)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'chat_messages';

-- If no rows: enable replication for chat_messages in Dashboard, or:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- 2) RLS: anon must be able to SELECT rows you expect to receive over Realtime (same rules as read).
-- Check policies on chat_messages:
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.chat_messages'::regclass;

-- 3) Project Realtime: Dashboard → Project Settings → API / Realtime — ensure not disabled for plan.
-- 4) Same env: PC/모바일 앱 빌드에 동일 NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY 배포됐는지 확인.
--    (브라우저 콘솔에서 location.origin과 무관 — 클라이언트 번들에 박힌 값이 같아야 함.)
