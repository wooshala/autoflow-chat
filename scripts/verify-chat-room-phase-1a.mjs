#!/usr/bin/env node
/**
 * Phase 1A verification: migration SQL checks + optional live API probes.
 *
 * Rollout rules (mandatory):
 * 1. Apply chat_room migrations ONLY via `supabase db push` — never statement-by-statement
 *    in Dashboard SQL Editor.
 * 2. Run `node scripts/verify-chat-room-phase-1a.mjs sql` immediately after migration.
 * 3. Do not merge until API 6-case verification passes (`api` mode below).
 * 4. Do not add NOT NULL migration until sql check reports chat_room_id null count = 0.
 * 5. Do not merge Phase 1A into origin/main until app/chat/page.tsx encoding is fixed there.
 *
 * Usage:
 *   node scripts/verify-chat-room-phase-1a.mjs sql
 *   BASE_URL=http://localhost:3000 node scripts/verify-chat-room-phase-1a.mjs api
 *
 * SQL mode requires DATABASE_URL or STAGING_DATABASE_URL (postgres connection string).
 * API mode requires BASE_URL and NEXT_PUBLIC_CHAT_SEND_USER_ID (valid users.id UUID).
 */

import pg from 'pg';

const DEFAULT_ROOM_ID = '00000000-0000-0000-0000-000000000001';
const INVALID_ROOM_ID = '00000000-0000-0000-0000-000000009999';

function dbUrl() {
  return process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL || '';
}

async function runSqlChecks() {
  const url = dbUrl();
  if (!url) {
    console.error('SKIP sql: set DATABASE_URL or STAGING_DATABASE_URL');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const checks = [];

  const msgCount = await client.query('select count(*)::int as n from chat_messages');
  const nullRoom = await client.query(
    'select count(*)::int as n from chat_messages where chat_room_id is null'
  );
  const byRoom = await client.query(
    'select chat_room_id::text, count(*)::int as n from chat_messages group by chat_room_id order by 1'
  );
  const defaultRoom = await client.query(
    'select count(*)::int as n from chat_rooms where id = $1::uuid',
    [DEFAULT_ROOM_ID]
  );
  const roomCount = await client.query('select count(*)::int as n from chat_rooms');

  checks.push({ name: 'chat_messages total', value: msgCount.rows[0].n });
  checks.push({ name: 'chat_room_id null count', value: nullRoom.rows[0].n, pass: nullRoom.rows[0].n === 0 });
  checks.push({
    name: 'default room exists',
    value: defaultRoom.rows[0].n,
    pass: defaultRoom.rows[0].n === 1
  });
  checks.push({ name: 'chat_rooms total', value: roomCount.rows[0].n });
  checks.push({ name: 'messages by chat_room_id', value: byRoom.rows });

  console.log(JSON.stringify({ phase: '1A', mode: 'sql', checks }, null, 2));

  const failed = checks.some((c) => c.pass === false);
  await client.end();
  process.exit(failed ? 1 : 0);
}

async function postSend(baseUrl, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v != null) form.append(k, String(v));
  }
  const res = await fetch(`${baseUrl}/api/chat/send`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getList(baseUrl, query = '') {
  const res = await fetch(`${baseUrl}/api/chat/list${query}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runApiChecks() {
  const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const userId = process.env.NEXT_PUBLIC_CHAT_SEND_USER_ID || process.env.CHAT_SEND_USER_ID || '';
  if (!userId) {
    console.error('SKIP api: set NEXT_PUBLIC_CHAT_SEND_USER_ID');
    process.exit(2);
  }

  const nonce = `phase1a-${Date.now()}`;
  const results = [];

  // Case 1: legacy send (no chat_room_id)
  const legacySend = await postSend(baseUrl, {
    user_id: userId,
    message: `[phase1a legacy] ${nonce}`,
    sender_side: 'pc',
    client_nonce: `${nonce}-legacy`
  });
  results.push({
    case: 'legacy_send',
    status: legacySend.status,
    pass: legacySend.status === 200 && legacySend.body?.data?.message?.chat_room_id === DEFAULT_ROOM_ID,
    chat_room_id: legacySend.body?.data?.message?.chat_room_id ?? null
  });

  // Case 2: explicit default room
  const explicitSend = await postSend(baseUrl, {
    user_id: userId,
    message: `[phase1a explicit] ${nonce}`,
    sender_side: 'pc',
    chat_room_id: DEFAULT_ROOM_ID,
    client_nonce: `${nonce}-explicit`
  });
  results.push({
    case: 'explicit_room_send',
    status: explicitSend.status,
    pass: explicitSend.status === 200 && explicitSend.body?.data?.message?.chat_room_id === DEFAULT_ROOM_ID
  });

  // Case 3: invalid room
  const invalidSend = await postSend(baseUrl, {
    user_id: userId,
    message: `[phase1a invalid] ${nonce}`,
    chat_room_id: INVALID_ROOM_ID,
    client_nonce: `${nonce}-invalid`
  });
  results.push({
    case: 'invalid_room_send',
    status: invalidSend.status,
    pass: invalidSend.status >= 400 && invalidSend.status < 500
  });

  // Case 4: legacy list
  const legacyList = await getList(baseUrl, '?limit=5');
  const legacyRows = legacyList.body?.data?.messages ?? legacyList.body?.messages ?? [];
  results.push({
    case: 'legacy_list',
    status: legacyList.status,
    pass: legacyList.status === 200 && Array.isArray(legacyRows)
  });

  // Case 5: room-filtered list
  const roomList = await getList(baseUrl, `?limit=5&chat_room_id=${DEFAULT_ROOM_ID}`);
  const roomRows = roomList.body?.data?.messages ?? roomList.body?.messages ?? [];
  results.push({
    case: 'room_filtered_list',
    status: roomList.status,
    pass:
      roomList.status === 200 &&
      Array.isArray(roomRows) &&
      roomRows.every((m) => m?.chat_room_id === DEFAULT_ROOM_ID || m?.chat_room_id == null)
  });

  // Case 6: invalid UUID query
  const badQuery = await getList(baseUrl, '?chat_room_id=not-a-uuid');
  results.push({
    case: 'invalid_room_list_query',
    status: badQuery.status,
    pass: badQuery.status === 400
  });

  console.log(JSON.stringify({ phase: '1A', mode: 'api', results }, null, 2));
  const failed = results.some((r) => !r.pass);
  process.exit(failed ? 1 : 0);
}

const mode = process.argv[2] || 'sql';
if (mode === 'api') {
  await runApiChecks();
} else {
  await runSqlChecks();
}
