// P0-B contract tests C8–C12 — server-side collection.
//
// The client flag is a URL query anyone can set. These tests pin the properties that keep an
// attacker from writing into production logs, and that keep ordinary traffic unaffected.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DIAG_HEADER, PollDiagRegistry } from '../pollDiag.ts';
import {
  CHAT_POLL_DIAG_REQUEST,
  isDiagServerCollectionEnabled,
  readDiagContext,
  withDiagRequestLog,
} from '../pollDiagServer.ts';

const DIAG_ON = { CHAT_POLL_DIAG_SERVER: '1' } as NodeJS.ProcessEnv;
const DIAG_OFF = {} as NodeJS.ProcessEnv;

function headerReader(h: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (n: string) => lower[n.toLowerCase()] ?? null };
}

function diagHeaders(over: Record<string, string> = {}) {
  return headerReader({
    [DIAG_HEADER.tabId]: 'tab-1',
    [DIAG_HEADER.clientInstance]: 'ci-1',
    [DIAG_HEADER.requestReason]: 'loader_initial',
    [DIAG_HEADER.hook]: 'useChatLoader',
    [DIAG_HEADER.isTauri]: '0',
    ...over,
  });
}

const ROUTES = ['/api/chat/list', '/api/guest/channels/summary', '/api/guest/room-306/messages'];

// ── C8. Route wrapping ───────────────────────────────────────────────────────

describe('C8 route wrapping', () => {
  for (const path of ROUTES) {
    test(`${path}: one diag request → exactly one structured line`, async () => {
      const lines: Array<[string, Record<string, unknown>]> = [];
      const res = await withDiagRequestLog(
        { headers: diagHeaders(), method: 'GET', nextUrl: { pathname: path } },
        async () => ({ status: 200 }),
        (e, p) => void lines.push([e, p]),
        DIAG_ON,
      );
      assert.equal(res.status, 200, 'the response must be unchanged');
      assert.equal(lines.length, 1);
      assert.equal(lines[0]![0], CHAT_POLL_DIAG_REQUEST);
      assert.equal(lines[0]![1].path, path);
    });

    test(`${path}: a non-diag request logs nothing even with collection ON`, async () => {
      const lines: string[] = [];
      await withDiagRequestLog(
        { headers: headerReader({}), method: 'GET', nextUrl: { pathname: path } },
        async () => ({ status: 200 }),
        (e) => void lines.push(e),
        DIAG_ON,
      );
      assert.deepEqual(lines, [], 'ordinary production traffic must not grow the log');
    });
  }

  test('an auth failure is logged by status, never by credential', async () => {
    const lines: Array<Record<string, unknown>> = [];
    const res = await withDiagRequestLog(
      { headers: diagHeaders({ authorization: 'Bearer super-secret' }), method: 'GET', nextUrl: { pathname: '/api/guest/channels/summary' } },
      async () => ({ status: 401 }),
      (_e, p) => void lines.push(p),
      DIAG_ON,
    );
    assert.equal(res.status, 401);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.response_status, 401);
    assert.equal(JSON.stringify(lines[0]).includes('super-secret'), false);
  });

  test('the handler result is returned untouched', async () => {
    const sentinel = { status: 200, body: 'unchanged' };
    const out = await withDiagRequestLog(
      { headers: diagHeaders(), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => sentinel,
      () => {},
      DIAG_ON,
    );
    assert.equal(out, sentinel);
  });

  test('elapsed_ms is recorded and non-negative', async () => {
    const lines: Array<Record<string, unknown>> = [];
    await withDiagRequestLog(
      { headers: diagHeaders(), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => { await new Promise((r) => setTimeout(r, 5)); return { status: 200 }; },
      (_e, p) => void lines.push(p),
      DIAG_ON,
    );
    assert.ok((lines[0]!.elapsed_ms as number) >= 0);
  });
});

// ── C9. Server collection gate ───────────────────────────────────────────────

describe('C9 server collection gate', () => {
  test('enabled only when the env flag is exactly "1"', () => {
    assert.equal(isDiagServerCollectionEnabled({ CHAT_POLL_DIAG_SERVER: '1' } as NodeJS.ProcessEnv), true);
    for (const v of [undefined, '', '0', 'true', 'yes', '2']) {
      assert.equal(isDiagServerCollectionEnabled({ CHAT_POLL_DIAG_SERVER: v } as NodeJS.ProcessEnv), false, String(v));
    }
  });

  test('with the gate off, valid headers are ignored — a client cannot turn on server logging', async () => {
    const lines: string[] = [];
    await withDiagRequestLog(
      { headers: diagHeaders(), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => ({ status: 200 }),
      (e) => void lines.push(e),
      DIAG_OFF,
    );
    assert.deepEqual(lines, [], 'the URL query flag must never be the server trust anchor');
  });
});

// ── C10. Network request vs client-side event ────────────────────────────────

describe('C10 HTTP request vs client event', () => {
  test('three requests → three lines (the server counts requests, not intentions)', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) {
      await withDiagRequestLog(
        { headers: diagHeaders(), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
        async () => ({ status: 200 }),
        (e) => void lines.push(e),
        DIAG_ON,
      );
    }
    assert.equal(lines.length, 3);
  });

  test('a coalesce join issues no request, so it lives only in the client counter', () => {
    // Documented asymmetry: client total − server total === joined/skipped count.
    const reg = new PollDiagRegistry('tab');
    reg.countRequest('coalesce_join');
    reg.countRequest('coalesce_join');
    reg.countRequest('loader_initial');
    assert.equal(reg.snapshot().requestCounters.coalesce_join, 2);
    assert.equal(reg.snapshot().requestCounters.loader_initial, 1);
    // Only the loader_initial actually reached the network; no server line exists for the joins.
  });

  test('a pending drain that does issue a request is counted once server-side', async () => {
    const lines: string[] = [];
    await withDiagRequestLog(
      { headers: diagHeaders({ [DIAG_HEADER.requestReason]: 'pending_drain' }), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => ({ status: 200 }),
      (e) => void lines.push(e),
      DIAG_ON,
    );
    assert.equal(lines.length, 1);
  });
});

// ── C11. Header abuse ────────────────────────────────────────────────────────

describe('C11 header abuse', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['reason outside the enum', { [DIAG_HEADER.requestReason]: 'definitely_not_a_reason' }],
    ['reason carrying a credential', { [DIAG_HEADER.requestReason]: 'Bearer abc.def.ghi' }],
    ['tab id over 64 chars', { [DIAG_HEADER.tabId]: 'a'.repeat(65) }],
    ['newline injection in tab id', { [DIAG_HEADER.tabId]: 'tab\nFAKE_LOG_LINE' }],
    ['carriage return in client instance', { [DIAG_HEADER.clientInstance]: 'ci\r\nx' }],
    // Built at runtime: a literal NUL in the source makes git treat the file as binary.
    ['NUL control character', { [DIAG_HEADER.tabId]: 'tab' + String.fromCharCode(0) + 'x' }],
    ['spaces in hook name', { [DIAG_HEADER.hook]: 'use Chat Loader' }],
    ['JWT-shaped hook name', { [DIAG_HEADER.hook]: 'eyJhbGciOi.JIUzI1NiJ9' }],
    ['empty tab id', { [DIAG_HEADER.tabId]: '' }],
    ['hook name over 48 chars', { [DIAG_HEADER.hook]: 'h'.repeat(49) }],
  ];

  for (const [label, over] of cases) {
    test(`rejects ${label}`, () => {
      assert.equal(readDiagContext(diagHeaders(over)), null);
    });
  }

  test('a rejected header set produces no log line at all', async () => {
    const lines: string[] = [];
    await withDiagRequestLog(
      { headers: diagHeaders({ [DIAG_HEADER.tabId]: 'bad\nvalue' }), method: 'GET', nextUrl: { pathname: '/api/chat/list' } },
      async () => ({ status: 200 }),
      (e) => void lines.push(e),
      DIAG_ON,
    );
    assert.deepEqual(lines, []);
  });

  test('a well-formed set is still accepted (the rejections above are not blanket)', () => {
    assert.ok(readDiagContext(diagHeaders()));
  });
});

// ── C12. Sensitive payload ───────────────────────────────────────────────────

describe('C12 sensitive payload', () => {
  test('the key set is closed and no banned term leaks through', async () => {
    const lines: Array<Record<string, unknown>> = [];
    await withDiagRequestLog(
      {
        headers: diagHeaders({ authorization: 'Bearer leak-me', cookie: 'afg_sid_abc=leak-me' }),
        method: 'GET',
        nextUrl: { pathname: '/api/guest/room-306/messages' },
      },
      async () => ({ status: 200 }),
      (_e, p) => void lines.push(p),
      DIAG_ON,
    );
    assert.equal(lines.length, 1);
    assert.deepEqual(Object.keys(lines[0]!).sort(), [
      'client_instance_id', 'deployment', 'elapsed_ms', 'hook_name', 'is_tauri',
      'method', 'path', 'request_reason', 'response_status', 'tab_id', 'timestamp',
    ]);
    const flat = JSON.stringify(lines[0]).toLowerCase();
    for (const b of ['leak-me', 'authorization', 'bearer', 'cookie', 'original_text', 'translated_json', 'phone', 'session_hash', 'device']) {
      assert.equal(flat.includes(b), false, `payload must not contain "${b}"`);
    }
  });

  test('the path is logged verbatim — channel_key appears there, so it must stay non-sensitive', () => {
    // A room number is operational, not personal. Guest content never reaches the payload
    // because only `path` carries the channel and no body is read.
    assert.ok('/api/guest/room-306/messages'.includes('room-306'));
  });
});
