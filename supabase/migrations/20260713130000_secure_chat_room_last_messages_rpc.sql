-- Phase 1.2.6 Commit D: get_chat_room_last_messages RPC 접근 차단(P0-A).
--
-- 배경: Supabase는 public 스키마 함수를 PostgREST /rest/v1/rpc/<name>로 자동 노출하고,
--   함수 EXECUTE는 기본적으로 PUBLIC(anon/authenticated 포함)에 부여된다. anon key는 배포된
--   APK/웹 번들에 존재하므로, 권한을 차단하지 않으면 접근권 없는 방의 마지막 메시지 본문/발신자/
--   시각을 임의 room UUID로 직접 조회할 수 있다(방 1개면 피해 0, 방 늘리는 순간 실증 가능).
--
-- 조치: EXECUTE를 public/anon/authenticated에서 revoke, service_role에만 grant. search_path 고정.
--   함수는 서버(service_role) listChatRoomSummaries 경로에서만 호출되므로 클라 영향 없음.
--
-- 안전성:
--   - 기존 create migration(20260713120000)은 이미 적용됐을 수 있어 수정하지 않고 별도 additive.
--   - Idempotent: revoke/grant/alter 재실행 안전. 함수 부재 시 no-op(존재 가드).
--   - table/column/RLS/publication/realtime 변경 없음. Production 적용 금지(사용자 staging 적용).

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_chat_room_last_messages'
      and pg_get_function_identity_arguments(p.oid) = 'uuid[]'
  ) then
    revoke execute on function public.get_chat_room_last_messages(uuid[]) from public;
    revoke execute on function public.get_chat_room_last_messages(uuid[]) from anon;
    revoke execute on function public.get_chat_room_last_messages(uuid[]) from authenticated;
    grant  execute on function public.get_chat_room_last_messages(uuid[]) to service_role;
    -- INVOKER 기본이지만 hygiene(및 향후 DEFINER 전환 대비) 차원에서 search_path 고정.
    alter function public.get_chat_room_last_messages(uuid[]) set search_path = public, pg_temp;
  end if;
end $$;

comment on function public.get_chat_room_last_messages(uuid[]) is
  'Phase 1.2.5/1.2.6: 방별 최신 메시지 1건(DISTINCT ON). service_role 전용(anon/authenticated EXECUTE 차단).';
