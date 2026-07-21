// Phase 1I.1-B — staff-only Customer Information context for a guest channel. READ-ONLY.
// One request builds the whole panel (session + best-effort reservation) server-side so the
// client never assembles multiple sources. Failure here must not affect chat send/receive.

import { NextRequest, NextResponse } from 'next/server';

import { buildGuestCustomerContext } from '@/lib/guest-spike/customerContext';
import { requireStaff } from '@/lib/guest-spike/staffAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const context = await buildGuestCustomerContext(params.channel_key);
    return NextResponse.json({ ok: true, context });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ ok: false, error: 'CONTEXT_ERROR' }, { status: 500 });
  }
}
