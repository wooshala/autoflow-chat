/**
 * Phase 1.2.6 D 순수 검증: RPC 오류 분류 + 보안 migration 정적 검사.
 * 실행: npx tsx scripts/verify-chat-rooms-rpc-source-logic.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isChatRoomLastMessagesFunctionMissing } from '../lib/chat/chatRoomsRpcError';

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- 함수 미존재(기대된 폴백) → true ---
eq('missing:PGRST202', isChatRoomLastMessagesFunctionMissing({ code: 'PGRST202' }), true);
eq('missing:42883', isChatRoomLastMessagesFunctionMissing({ code: '42883' }), true);
eq(
  'missing:schema-cache-msg',
  isChatRoomLastMessagesFunctionMissing({
    message: 'Could not find the function public.get_chat_room_last_messages(uuid[]) in the schema cache'
  }),
  true
);
eq(
  'missing:does-not-exist',
  isChatRoomLastMessagesFunctionMissing({
    message: 'function public.get_chat_room_last_messages(uuid[]) does not exist'
  }),
  true
);

// --- 실제 결함(폴백은 하되 error 취급) → false ---
eq('defect:permission-42501', isChatRoomLastMessagesFunctionMissing({ code: '42501', message: 'permission denied for function' }), false);
eq('defect:timeout', isChatRoomLastMessagesFunctionMissing({ message: 'canceling statement due to statement timeout' }), false);
eq('defect:network', isChatRoomLastMessagesFunctionMissing({ message: 'fetch failed' }), false);
eq('defect:null', isChatRoomLastMessagesFunctionMissing(null), false);
eq('defect:string', isChatRoomLastMessagesFunctionMissing('boom'), false);
// "column ... does not exist"는 함수 미존재로 오분류하면 안 됨
eq('defect:column-not-function', isChatRoomLastMessagesFunctionMissing({ message: 'column "foo" does not exist' }), false);

// --- 보안 migration 정적 검사 (item 12) ---
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(here, '..', 'supabase', 'migrations', '20260713130000_secure_chat_room_last_messages_rpc.sql'),
  'utf8'
).toLowerCase();
eq('mig:revoke-public', /revoke execute[\s\S]*from public/.test(sql), true);
eq('mig:revoke-anon', sql.includes('from anon'), true);
eq('mig:revoke-authenticated', sql.includes('from authenticated'), true);
eq('mig:grant-service-role', /grant\s+execute[\s\S]*to service_role/.test(sql), true);
eq('mig:search-path', sql.includes('set search_path'), true);

console.log(JSON.stringify({ phase: '1.2.6', commit: 'D', mode: 'logic', ok: failed === 0, failed }, null, 2));
if (failed > 0) process.exit(1);
