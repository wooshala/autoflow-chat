import { NextRequest, NextResponse } from 'next/server';
import { getTicket, updateTicket } from '@/lib/services/maintenance';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const ticket = await getTicket(params.id);
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ticket });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const ticket = await updateTicket(params.id, body);
    if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '업데이트 실패' }, { status: 500 });
  }
}
