// guestRoomUrl SoT. Run: node --test lib/guest-spike/__tests__/guestRoomUrl.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUEST_QR_DEFAULT_BASE_URL,
  guestChannelUrl,
  guestRoomChannelKey,
  guestRoomUrl,
  resolveGuestChannelKey,
  resolveGuestQrBaseUrl,
} from '../guestRoomUrl.ts';

test('default base URL is production canonical', () => {
  assert.equal(GUEST_QR_DEFAULT_BASE_URL, 'https://autoflow-mvp.vercel.app');
  assert.equal(resolveGuestQrBaseUrl({ env: {} }), GUEST_QR_DEFAULT_BASE_URL);
});

test('base URL precedence: explicit > NEXT_PUBLIC > QR_BASE_URL > default', () => {
  assert.equal(resolveGuestQrBaseUrl({ baseUrl: 'https://a.example/', env: {} }), 'https://a.example');
  assert.equal(
    resolveGuestQrBaseUrl({
      env: { NEXT_PUBLIC_QR_BASE_URL: 'https://next.example/', QR_BASE_URL: 'https://qr.example/' },
    }),
    'https://next.example',
  );
  assert.equal(resolveGuestQrBaseUrl({ env: { QR_BASE_URL: 'https://qr.example/' } }), 'https://qr.example');
});

test('room channel key and URL match print pipeline (/g/room-{n})', () => {
  assert.equal(guestRoomChannelKey('201'), 'room-201');
  assert.equal(guestRoomChannelKey('305호'), 'room-305');
  assert.equal(guestRoomUrl('201'), 'https://autoflow-mvp.vercel.app/g/room-201');
  assert.equal(guestChannelUrl('room-305'), 'https://autoflow-mvp.vercel.app/g/room-305');
  assert.equal(guestChannelUrl('room-201'), 'https://autoflow-mvp.vercel.app/g/room-201');
  assert.doesNotMatch(guestChannelUrl('room-201'), /room-room-/);
});

test('resolveGuestChannelKey maps cust-* via lookupChannelKey; rejects junk', () => {
  assert.equal(resolveGuestChannelKey('room-201'), 'room-201');
  assert.equal(resolveGuestChannelKey('room-305'), 'room-305');
  assert.equal(resolveGuestChannelKey('cust-201'), 'room-201');
  assert.equal(resolveGuestChannelKey('cust-305'), 'room-305');
  assert.equal(resolveGuestChannelKey('201'), 'room-201');
  assert.equal(resolveGuestChannelKey(''), null);
  assert.equal(resolveGuestChannelKey(undefined), null);
  assert.equal(resolveGuestChannelKey('undefined'), null);
  assert.equal(resolveGuestChannelKey('room-room-201'), null);
  assert.equal(guestChannelUrl('cust-201'), 'https://autoflow-mvp.vercel.app/g/room-201');
  assert.throws(() => guestChannelUrl(''), /Invalid guest channel key/);
  assert.throws(() => guestChannelUrl('undefined'), /Invalid guest channel key/);
  assert.doesNotMatch(guestChannelUrl('cust-201'), /\/g\/cust-/);
  assert.doesNotMatch(guestChannelUrl('cust-201'), /undefined/);
});

test('guestRoomUrl.ts has no third-party QR HTTP service', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const src = readFileSync(join(process.cwd(), 'lib/guest-spike/guestRoomUrl.ts'), 'utf8');
  assert.doesNotMatch(src, /api\.qrserver\.com/);
  assert.doesNotMatch(src, /guestQrImageUrl/);
});
