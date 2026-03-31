import { NextRequest, NextResponse } from 'next/server';
import { getMinSupabaseAdmin } from '@/lib/supabaseMin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;

    const supabase = getMinSupabaseAdmin();
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as any[];
    console.log('[MIN_LIST_RESULT]', {
      count: rows.length,
      newest_created_at: rows[0]?.created_at ?? null,
      ids: rows.map((r) => r?.id ?? null)
    });

    return NextResponse.json({ messages: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

