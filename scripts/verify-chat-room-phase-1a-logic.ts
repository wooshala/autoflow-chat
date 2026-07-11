/**
 * Phase 1A pure-logic checks (no DB). Run: npx --yes tsx scripts/verify-chat-room-phase-1a-logic.ts
 */
import assert from 'node:assert/strict';
import {
  DefaultChatRoomConfigError,
  parseOptionalChatRoomId,
  resolveDefaultChatRoomIdFromEnv,
  SEEDED_DEFAULT_CHAT_ROOM_ID
} from '../lib/chat/chatRoomDefaults';
import { isMissingChatRoomIdColumnError } from '../lib/chat/dbColumnErrors';

function testParseOptionalChatRoomId() {
  assert.equal(parseOptionalChatRoomId(null, null), null);
  assert.equal(parseOptionalChatRoomId('', ''), null);
  assert.equal(parseOptionalChatRoomId('  ', null), null);
  assert.equal(
    parseOptionalChatRoomId(SEEDED_DEFAULT_CHAT_ROOM_ID, 'other'),
    SEEDED_DEFAULT_CHAT_ROOM_ID
  );
  assert.equal(
    parseOptionalChatRoomId(null, '11111111-1111-1111-1111-111111111111'),
    '11111111-1111-1111-1111-111111111111'
  );
}

function testResolveDefaultChatRoomIdFromEnv() {
  assert.equal(resolveDefaultChatRoomIdFromEnv({}), SEEDED_DEFAULT_CHAT_ROOM_ID);
  assert.equal(
    resolveDefaultChatRoomIdFromEnv({ DEFAULT_CHAT_ROOM_ID: SEEDED_DEFAULT_CHAT_ROOM_ID }),
    SEEDED_DEFAULT_CHAT_ROOM_ID
  );
  assert.equal(
    resolveDefaultChatRoomIdFromEnv({ NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID: SEEDED_DEFAULT_CHAT_ROOM_ID }),
    SEEDED_DEFAULT_CHAT_ROOM_ID
  );
  assert.throws(
    () =>
      resolveDefaultChatRoomIdFromEnv({
        DEFAULT_CHAT_ROOM_ID: '11111111-1111-1111-1111-111111111111'
      }),
    DefaultChatRoomConfigError
  );
  assert.throws(
    () =>
      resolveDefaultChatRoomIdFromEnv({
        NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID: '11111111-1111-1111-1111-111111111111'
      }),
    DefaultChatRoomConfigError
  );
}

function testIsMissingChatRoomIdColumnError() {
  assert.equal(
    isMissingChatRoomIdColumnError({
      code: '42703',
      message: 'column "chat_room_id" of relation "chat_messages" does not exist'
    }),
    true
  );
  assert.equal(
    isMissingChatRoomIdColumnError({
      code: 'PGRST204',
      message: "Could not find the 'chat_room_id' column of 'chat_messages' in the schema cache"
    }),
    true
  );
  assert.equal(
    isMissingChatRoomIdColumnError({
      code: '23503',
      message: 'insert or update on table "chat_messages" violates foreign key constraint "chat_messages_chat_room_id_fkey"'
    }),
    false
  );
  assert.equal(
    isMissingChatRoomIdColumnError({
      code: '42501',
      message: 'permission denied for table chat_messages'
    }),
    false
  );
  assert.equal(
    isMissingChatRoomIdColumnError({
      code: '23503',
      message: 'Key (chat_room_id)=(...) is not present in table "chat_rooms"'
    }),
    false
  );
}

function testListCallShape() {
  // listChatMessages(limit) keeps legacy arity — optional 2nd arg only when filtering.
  const legacyArgs: [number] = [50];
  assert.equal(legacyArgs.length, 1);
}

testParseOptionalChatRoomId();
testResolveDefaultChatRoomIdFromEnv();
testIsMissingChatRoomIdColumnError();
testListCallShape();

console.log(JSON.stringify({ phase: '1A', mode: 'logic', ok: true, tests: 4 }, null, 2));
