// Phase 1H.7A — guard the customer-room composer visibility fix. The message list can only
// scroll internally (instead of pushing the composer off-screen behind the bottom nav) if EVERY
// flex-col ancestor carries min-h-0. These source guards fail if a future edit drops min-h-0
// from the standard Room-Navigation center section or the CustomerRoom root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url); // repo root from lib/guest-spike/__tests__/
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, root)), 'utf8');

test('standard Room-Navigation center <section> has min-h-0', () => {
  const page = read('app/chat/page.tsx');
  // the section that wraps <RoomCenter staffGlobalSlot={standardChatBody} />
  assert.match(page, /<section className="flex min-h-0 min-w-0 flex-1 flex-col">/);
});

test('CustomerRoom root flex container has min-h-0', () => {
  const cr = read('components/rooms/CustomerRoom.tsx');
  assert.match(cr, /className="flex min-h-0 min-w-0 flex-1 flex-col bg-\[#B2C7D9\]"/);
});

test('GuestChatPanel keeps flex-1 + minHeight:0 (scroll container parent)', () => {
  const gcp = read('components/guest-spike/GuestChatPanel.tsx');
  assert.match(gcp, /flex:\s*1/);
  assert.match(gcp, /minHeight:\s*0/);
});

test('GuestMessageList is the flex-1 min-h-0 overflow scroller', () => {
  const gml = read('components/guest-spike/GuestMessageList.tsx');
  assert.match(gml, /flex:\s*1/);
  assert.match(gml, /minHeight:\s*0/);
  assert.match(gml, /overflowY:\s*'auto'/);
});

test('GuestMessageInput (composer) still renders a textarea — not hidden/removed', () => {
  const gmi = read('components/guest-spike/GuestMessageInput.tsx');
  assert.match(gmi, /export function GuestMessageInput/);
  assert.match(gmi, /<textarea/);
});
