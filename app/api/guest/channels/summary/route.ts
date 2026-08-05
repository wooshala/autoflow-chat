// Phase 1H.11 — staff-only channel summary. ONE request replaces the per-room language meta
// fan-out (was ~N requests / poll for N customer rooms). Returns, per OPEN channel, the language
// (session-owned) + latest / latest-guest message timestamps so the client can compute unread.
// Phase GC-Notification — additive unanswered_count / first_unanswered_at (ledger-identical).
// No full message bodies beyond the existing latest-guest preview. Reuses staff Bearer auth.

import { NextRequest, NextResponse } from 'next/server';

import { listOpenChannelSummaryData } from '@/lib/guest-spike/store';
import { buildChannelSummaries } from '@/lib/guest-spike/guestChannelSummary';
import { requireStaff } from '@/lib/guest-spike/staffAuth';
import { withDiagRequestLog } from '@/lib/chat/pollDiagServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  // P0-B: pass-through unless CHAT_POLL_DIAG_SERVER=1 AND the request carries valid diag headers.
  return withDiagRequestLog(req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
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
