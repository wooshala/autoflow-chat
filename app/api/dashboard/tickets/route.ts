import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTickets } from '@/lib/dashboard';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') || '80');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 80;

  const status = searchParams.get('status') || undefined;
  const room_no = searchParams.get('room_no') || undefined;
  const category = searchParams.get('category') || undefined;
  const auto_created = searchParams.get('auto_created') || undefined;

  const tickets = await getDashboardTickets({ limit, status, room_no, category, auto_created });
  return NextResponse.json({ tickets });
}

