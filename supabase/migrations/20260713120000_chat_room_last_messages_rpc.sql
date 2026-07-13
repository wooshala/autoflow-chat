-- Phase 1.2.5 Commit C: 방별 최신 메시지 1건 계산 RPC (DISTINCT ON).
--
-- 문제: 기존 listChatRoomSummaries는 `.in(chat_room_id).order(created_at desc).limit(N*20)`로
--   "전체 방 합산 최신 N건"을 가져온 뒤 방별 첫 건을 취한다. 방이 여러 개이고 활동량 차이가 크면
--   조용한 방의 최근 메시지가 상위 N건에서 밀려나 목록에서 누락될 수 있다(방 1개면 증상 없음).
--
-- 해결: 방별 최신 1건을 DB에서 DISTINCT ON으로 계산 → 방 수와 무관하게 단일 쿼리, 조용한 방 누락 없음.
--   인덱스 chat_messages_chat_room_id_created_at_idx (chat_room_id, created_at desc)를 그대로 활용.
--
-- 안전성 원칙:
--   - Additive only. 기존 table/column/RLS/publication/realtime 변경 없음.
--   - Idempotent: CREATE OR REPLACE 로 재실행 안전.
--   - Production 적용 금지(이 저장소 정책). staging 적용 후 Runtime Gate 통과 전 PASS 판정 금지.
--   - 기본방 1개 환경에서도 동일 결과.
--   - RPC 미적용(마이그레이션 전) 환경에서도 API가 죽지 않도록 서비스 코드가 기존 쿼리로 폴백한다.

create or replace function public.get_chat_room_last_messages(p_room_ids uuid[])
returns table (
  chat_room_id uuid,
  id text,
  message text,
  message_type text,
  image_url text,
  is_deleted boolean,
  created_at timestamptz,
  sender_name text
)
language sql
stable
as $$
  select distinct on (m.chat_room_id)
    m.chat_room_id,
    m.id::text,
    m.message::text,
    m.message_type::text,
    m.image_url::text,
    m.is_deleted,
    m.created_at,
    u.name::text as sender_name
  from public.chat_messages m
  left join public.users u on u.id = m.user_id
  where m.chat_room_id = any(p_room_ids)
  order by m.chat_room_id, m.created_at desc
$$;

comment on function public.get_chat_room_last_messages(uuid[]) is
  'Phase 1.2.5: 방별 최신 메시지 1건(DISTINCT ON). 방 수와 무관하게 단일 쿼리, 조용한 방 누락 없음.';
