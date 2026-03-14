import { NextRequest, NextResponse } from 'next/server';
import { listTickets } from '@/lib/services/maintenance';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const tickets = await listTickets(status);
  return NextResponse.json({ tickets });
}
