import { NextRequest, NextResponse } from 'next/server';
import { detectAndTranslate } from '@/lib/services/translation';

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const result = await detectAndTranslate(text);
  return NextResponse.json(result);
}
