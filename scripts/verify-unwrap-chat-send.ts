/**
 * 수동 검증: `npx --yes tsx scripts/verify-unwrap-chat-send.ts` (저장소 루트에서)
 */
import { unwrapChatSendEnvelopeData } from '../lib/api/unwrapChatSendResponse';

function assert(name: string, cond: boolean) {
  console.log(cond ? `OK   ${name}` : `FAIL ${name}`);
  if (!cond) process.exitCode = 1;
}

const std = {
  data: {
    message: {
      id: 'uuid-1',
      user_id: 'u1',
      message: 'hello body',
      message_type: 'text',
      room_no: null,
      image_url: null,
      image_storage_path: null,
      original_lang: '',
      translated_text: null,
      ticket_id: null,
      created_at: new Date().toISOString()
    }
  }
};

const stdNumId = {
  data: {
    message: {
      id: 42,
      user_id: 'u1',
      message: 'n',
      message_type: 'text',
      room_no: null,
      image_url: null,
      image_storage_path: null,
      original_lang: '',
      translated_text: null,
      ticket_id: null,
      created_at: new Date().toISOString()
    }
  }
};

const wrongStringMessage = { data: { message: 'not a row' } };
const flat = {
  id: 'f1',
  user_id: 'u1',
  message: 'x',
  message_type: 'text',
  room_no: null,
  image_url: null,
  image_storage_path: null,
  original_lang: '',
  translated_text: null,
  ticket_id: null,
  created_at: new Date().toISOString()
};

const r1 = unwrapChatSendEnvelopeData(std.data);
assert('nested string id', r1 !== null && r1.id === 'uuid-1' && r1.message === 'hello body');

const r2 = unwrapChatSendEnvelopeData(stdNumId.data);
assert('nested numeric id coerced', r2 !== null && r2.id === '42');

assert('string message rejected', unwrapChatSendEnvelopeData(wrongStringMessage.data) === null);

const r4 = unwrapChatSendEnvelopeData(flat);
assert('flat row', r4 !== null && r4.id === 'f1');

assert('no id rejected', unwrapChatSendEnvelopeData({ message: { user_id: 'x', message: 'y' } }) === null);

console.log('done');
