import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

type AllowedStatus = 'open' | 'in_progress' | 'done' | 'hold';

const FALLBACK_ACTOR_ID = '00000000-0000-0000-0000-000000000001';

function asAllowedStatus(v: unknown): AllowedStatus | null {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'open') return 'open';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'done') return 'done';
  if (s === 'hold') return 'hold';
  return null;
}

function toDbStatus(status: AllowedStatus): string {
  if (status === 'open') return 'OPEN';
  if (status === 'in_progress') return 'IN_PROGRESS';
  if (status === 'done') return 'DONE';
  return 'HOLD';
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: 'Supabase admin client is not configured.' }, { status: 500 });
    }

    const { id } = await ctx.params;
    const ticketId = String(id || '').trim();
    if (!ticketId) {
      return NextResponse.json({ ok: false, error: 'Missing ticket id.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = asAllowedStatus((body as any)?.status);
    if (!status) {
      return NextResponse.json(
        { ok: false, error: 'Invalid status. Use: open | in_progress | done | hold' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const actor_id_raw = (body as any)?.actor_id;
    const actor_id = typeof actor_id_raw === 'string' && actor_id_raw.trim() ? actor_id_raw.trim() : FALLBACK_ACTOR_ID;

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from('tickets')
      .select('id, status')
      .eq('id', ticketId)
      .single();
    if (beforeErr) {
      return NextResponse.json({ ok: false, error: (beforeErr as any)?.message || String(beforeErr) }, { status: 500 });
    }

    const from_status = (before as any)?.status ?? null;
    const to_status = toDbStatus(status);

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .update({
        status: to_status,
        updated_at: now,
        updated_by: actor_id,
        status_changed_at: now
      })
      .eq('id', ticketId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: (error as any)?.message || String(error) }, { status: 500 });
    }

    const { error: evErr } = await supabaseAdmin.from('ticket_events').insert({
      ticket_id: ticketId,
      event_type: 'status_changed',
      from_status,
      to_status,
      actor_id
    });
    if (evErr) {
      // MVP: 상태 변경은 성공으로 처리하되, 이벤트 기록 실패는 함께 반환
      return NextResponse.json({ ok: true, ticket: data, event_log_error: (evErr as any)?.message || String(evErr) });
    }

    return NextResponse.json({ ok: true, ticket: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

