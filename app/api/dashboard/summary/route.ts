import { NextResponse } from 'next/server';
import { getDashboardSummary } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const summary = await getDashboardSummary();
  return NextResponse.json(summary);
}

