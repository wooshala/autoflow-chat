import { NextRequest, NextResponse } from 'next/server';
import { listTickets } from '@/lib/services/maintenance';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;

  console.log('[MAINTENANCE_LIST_ROUTE]', { status: status || null });

  try {
    const tickets = await listTickets(status);
    console.log('[MAINTENANCE_LIST_ROUTE_DONE]', { count: tickets.length });
    console.log('[MAINTENANCE_LIST_ROUTE_RESULT_JSON]', JSON.stringify({
      count: tickets.length,
      room_nos: tickets.slice(0, 20).map(r => r.room_no),
      ids: tickets.slice(0, 20).map(r => r.id),
      statuses: tickets.slice(0, 20).map(r => r.status),
    }, null, 2));
    return NextResponse.json({ tickets });
  } catch (err: any) {
    console.error('[MAINTENANCE_LIST_ROUTE_ERROR]', {
      message: err?.message ?? String(err),
      code: err?.code ?? null,
      hint: err?.hint ?? null,
    });
    return NextResponse.json({ tickets: [], error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
