// Guest QR re-entry flow — pure in-memory simulation of session claim + staff close.
// Mirrors GET session / DELETE session policy without hitting production DB.
// Run: node --test lib/guest-spike/__tests__/sessionReentryFlow.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { decideSessionOutcome } from '../sessionPolicy.ts';

type Sess = { id: string; channel_key: string; status: 'open' | 'closed' };

function makeStore() {
  const sessions: Sess[] = [];
  let seq = 0;
  const cookies = new Map<string, string>(); // browserId → session id for channel

  const openOf = (channel: string) => sessions.find((s) => s.channel_key === channel && s.status === 'open') ?? null;
  const byId = (id: string) => sessions.find((s) => s.id === id) ?? null;

  function getSession(browserId: string, channel: string) {
    const sid = cookies.get(`${browserId}:${channel}`);
    const cookieSess = sid ? byId(sid) : null;
    const active = openOf(channel);
    const outcome = decideSessionOutcome({
      cookieSession: cookieSess
        ? { channelMatches: cookieSess.channel_key === channel, status: cookieSess.status }
        : null,
      hasActiveSession: Boolean(active),
    });
    if (outcome.kind === 'reconnect') {
      return { status: 'open' as const, session_id: cookieSess!.id, setCookie: null as string | null };
    }
    if (outcome.kind === 'occupied') {
      return { status: 'occupied' as const, session_id: null, setCookie: null };
    }
    if (outcome.kind === 'create') {
      // Race: unique one-open-per-channel — if someone else created between read and insert:
      if (openOf(channel)) {
        return { status: 'occupied' as const, session_id: null, setCookie: null };
      }
      const id = `S${++seq}`;
      sessions.push({ id, channel_key: channel, status: 'open' });
      cookies.set(`${browserId}:${channel}`, id); // Set-Cookie overwrite
      return { status: 'open' as const, session_id: id, setCookie: id };
    }
    return { status: 'closed' as const, session_id: null, setCookie: null };
  }

  function staffClose(channel: string) {
    const open = sessions.filter((s) => s.channel_key === channel && s.status === 'open');
    for (const s of open) s.status = 'closed';
    return { closed: open.length > 0, closed_count: open.length, closed_session_ids: open.map((s) => s.id) };
  }

  return { sessions, getSession, staffClose, openOf };
}

test('same browser re-entry after staff close → new session S2, cookie overwritten, S1 kept closed', () => {
  const store = makeStore();
  const channel = 'room-706';

  const first = store.getSession('phoneA', channel);
  assert.equal(first.status, 'open');
  const s1 = first.session_id!;
  assert.equal(first.setCookie, s1);

  const close = store.staffClose(channel);
  assert.equal(close.closed, true);
  assert.equal(close.closed_count, 1);
  assert.deepEqual(close.closed_session_ids, [s1]);
  assert.equal(store.sessions.find((s) => s.id === s1)?.status, 'closed');
  assert.equal(store.openOf(channel), null);

  // Same cookie (still points at S1 closed) → create S2 + overwrite cookie
  const second = store.getSession('phoneA', channel);
  assert.equal(second.status, 'open');
  const s2 = second.session_id!;
  assert.notEqual(s2, s1);
  assert.equal(second.setCookie, s2);
  assert.equal(store.openOf(channel)?.id, s2);
  assert.equal(store.sessions.filter((s) => s.channel_key === channel && s.status === 'open').length, 1);
  assert.equal(store.sessions.find((s) => s.id === s1)?.status, 'closed');
});

test('other browser blocked while open session exists → occupied, no new row', () => {
  const store = makeStore();
  const channel = 'room-706';
  const a = store.getSession('phoneA', channel);
  assert.equal(a.status, 'open');
  const before = store.sessions.length;

  const b = store.getSession('phoneB', channel); // no cookie
  assert.equal(b.status, 'occupied');
  assert.equal(b.setCookie, null);
  assert.equal(store.sessions.length, before);
  assert.equal(store.openOf(channel)?.id, a.session_id);
});

test('after staff close, cookieless other browser creates new session', () => {
  const store = makeStore();
  const channel = 'room-706';
  const a = store.getSession('phoneA', channel);
  const s1 = a.session_id!;
  store.staffClose(channel);

  const b = store.getSession('phoneB', channel);
  assert.equal(b.status, 'open');
  assert.notEqual(b.session_id, s1);
  assert.equal(store.openOf(channel)?.id, b.session_id);
  assert.equal(store.sessions.find((s) => s.id === s1)?.status, 'closed');
});

test('closed cookie while another guest holds open → occupied (no join, no create)', () => {
  const store = makeStore();
  const channel = 'room-706';

  const a = store.getSession('phoneA', channel);
  const s1 = a.session_id!;
  store.staffClose(channel);

  // B claims after close
  const b = store.getSession('phoneB', channel);
  assert.equal(b.status, 'open');
  const s2 = b.session_id!;

  // A still has cookie pointing at closed S1 → occupied, does not steal S2
  const aAgain = store.getSession('phoneA', channel);
  assert.equal(aAgain.status, 'occupied');
  assert.equal(aAgain.setCookie, null);
  assert.equal(store.openOf(channel)?.id, s2);
  assert.equal(store.sessions.filter((s) => s.status === 'open').length, 1);
  assert.equal(store.sessions.find((s) => s.id === s1)?.status, 'closed');
});
