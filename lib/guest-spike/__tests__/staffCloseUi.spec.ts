// Staff UI must surface close failures (not treat DELETE failure as success).
// Run: node --test lib/guest-spike/__tests__/staffCloseUi.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');
const customerRoom = readFileSync(join(root, 'components/rooms/CustomerRoom.tsx'), 'utf8');
const golden = readFileSync(join(root, 'components/guest-spike/GuestStaffClient.tsx'), 'utf8');
const api = readFileSync(join(root, 'lib/guest-spike/api.ts'), 'utf8');

test('CustomerRoom catches closeGuestSession failure and shows safe user message', () => {
  assert.match(customerRoom, /CLOSE_SESSION_FAILED_USER_MESSAGE/);
  assert.match(customerRoom, /setEndError\(CLOSE_SESSION_FAILED_USER_MESSAGE\)/);
  assert.match(customerRoom, /await closeGuestSession\(channelKey\)/);
  // success-only preferred clear
  assert.match(customerRoom, /setPreferred\(null\)/);
  assert.match(customerRoom, /catch\s*\{/);
});

test('GuestStaffClient catches closeGuestSession failure the same way', () => {
  assert.match(golden, /CLOSE_SESSION_FAILED_USER_MESSAGE/);
  assert.match(golden, /setEndError\(CLOSE_SESSION_FAILED_USER_MESSAGE\)/);
  assert.match(golden, /catch\s*\{/);
});

test('closeGuestSession uses parseCloseSessionHttpResult (non-2xx throws)', () => {
  assert.match(api, /parseCloseSessionHttpResult\(res\.status/);
});
