import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'supabase_admin_unavailable' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const id = String((body as any).id || '').trim();
  const status = String((body as any).status || '').trim();
  if (!id || !status) {
    return NextResponse.json({ ok: false, error: 'missing_id_or_status' }, { status: 400 });
  }
  if (!['new', 'acknowledged', 'done', 'deferred'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('chat_ops_queue')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

