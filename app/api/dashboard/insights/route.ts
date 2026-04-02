import { NextRequest, NextResponse } from 'next/server';
import { getDashboardInsights } from '@/lib/dashboard';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const daysRaw = Number(searchParams.get('days') || '7');
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 365)) : 7;

  const insights = await getDashboardInsights({ days, limit: 5 });
  return NextResponse.json(insights);
}

