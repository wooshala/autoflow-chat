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

  const messageId = String((body as any).messageId || '').trim();
  const createdAt = String((body as any).createdAt || '').trim();
  const text = String((body as any).text || '').trim();
  const summary = String((body as any).summary || '').trim();

  const roomNumber = (body as any).roomNumber ? String((body as any).roomNumber).trim() : null;
  const mainCategory = String((body as any).mainCategory || 'general').trim();
  const tone = String((body as any).tone || 'silent').trim();
  const flags = (body as any).flags || {};
  const urgent = Boolean(flags.urgent);
  const request = Boolean(flags.request);
  const statusFlag = Boolean(flags.status);
  const debug = (body as any).debug || null;

  if (!messageId || !text) {
    return NextResponse.json({ ok: false, error: 'missing_messageId_or_text' }, { status: 400 });
  }

  const payload: any = {
    message_id: messageId,
    created_at: createdAt || undefined,
    updated_at: new Date().toISOString(),
    room_number: roomNumber,
    main_category: mainCategory,
    tone,
    urgent,
    request,
    status_flag: statusFlag,
    status: 'new',
    summary: summary || text.slice(0, 120),
    text
  };

  if (debug) {
    payload.matched_keywords = (debug as any).matchedKeywords || null;
    payload.reasons = (debug as any).reasons || null;
  }

  const { data, error } = await supabaseAdmin
    .from('chat_ops_queue')
    .upsert(payload, { onConflict: 'message_id' })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

