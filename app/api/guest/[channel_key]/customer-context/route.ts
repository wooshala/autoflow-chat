// Phase 2A — staff-only, session-scoped Customer Information context for a guest channel.
// GET  reads the session + editable memo. PUT saves the memo for the CURRENT open session.
// Staff-authenticated (Bearer). Failure here must not affect chat send/receive.

import { NextRequest, NextResponse } from 'next/server';

import { buildGuestCustomerContext, saveGuestCustomerContext } from '@/lib/guest-spike/customerContext';
import { normalizeContextInput } from '@/lib/guest-spike/customerContextValidate';
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
    return mapError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const staff = await requireStaff(req);
  if (!staff) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }

  let input;
  try {
    input = normalizeContextInput((body ?? {}) as Record<string, unknown>);
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_DATE' }, { status: 422 });
  }

  try {
    const context = await saveGuestCustomerContext(params.channel_key, input, staff.displayName ?? null);
    if (!context) return NextResponse.json({ ok: false, error: 'NO_OPEN_SESSION' }, { status: 409 });
    return NextResponse.json({ ok: true, context });
  } catch (e) {
    return mapError(e);
  }
}

function mapError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  return NextResponse.json({ ok: false, error: 'CONTEXT_ERROR' }, { status: 500 });
}
