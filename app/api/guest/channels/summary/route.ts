// Phase 1H.11 — staff-only channel summary. ONE request replaces the per-room language meta
// fan-out (was ~N requests / poll for N customer rooms). Returns, per OPEN channel, the language
// (session-owned) + latest / latest-guest message timestamps so the client can compute unread.
// No message bodies. Reuses the same staff Bearer auth as the staff messages GET.

import { NextRequest, NextResponse } from 'next/server';

import { listOpenChannelSummaryData } from '@/lib/guest-spike/store';
import { buildChannelSummaries } from '@/lib/guest-spike/guestChannelSummary';
import { requireStaff } from '@/lib/guest-spike/staffAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const { sessions, messages } = await listOpenChannelSummaryData();
    const channels = buildChannelSummaries(sessions, messages);
    return NextResponse.json({ ok: true, channels, generated_at: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
  }
}
