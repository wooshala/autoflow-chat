// Phase 1H.7 — Golden Reference staff page. SERVER component: gated so it is NOT exposed in
// production unless explicitly enabled. dev/local → allowed; Preview/Production (production
// build) → 404 unless GUEST_STAFF_REFERENCE_ENABLED=1 (server-only env, NOT NEXT_PUBLIC).
// URL access — not just links — is blocked. Staff auth is still enforced inside the client.

import { notFound } from 'next/navigation';

import { GuestStaffClient } from '@/components/guest-spike/GuestStaffClient';

export const dynamic = 'force-dynamic';

export default function GuestStaffPage({ params }: { params: { channel_key: string } }) {
  const isProdBuild = process.env.NODE_ENV === 'production';
  const enabled = process.env.GUEST_STAFF_REFERENCE_ENABLED === '1';
  if (isProdBuild && !enabled) {
    notFound();
  }
  return <GuestStaffClient channelKey={decodeURIComponent(params.channel_key)} />;
}
