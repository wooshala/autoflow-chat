import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function kstDateString(d = new Date()): string {
  // KST = UTC+9. Convert by adding 9 hours and taking ISO date part.
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function kstDayStartIso(dateStr: string): string {
  // dateStr is YYYY-MM-DD in KST. Day start in UTC = dateStrT00:00:00+09 => previous day 15:00Z.
  const [y, m, day] = dateStr.split('-').map((x) => Number(x));
  const utcMs = Date.UTC(y, m - 1, day, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function kstNextDayStartIso(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map((x) => Number(x));
  const utcMs = Date.UTC(y, m - 1, day + 1, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export async function GET(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'supabase_admin_unavailable' }, { status: 500 });
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get('date') || kstDateString()).trim();

  const startIso = kstDayStartIso(date);
  const endIso = kstNextDayStartIso(date);

  const { data: rows, error } = await supabaseAdmin
    .from('chat_ops_queue')
    .select('room_number, main_category, urgent, status, created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const byStatus = { new: 0, acknowledged: 0, done: 0, deferred: 0 } as Record<string, number>;
  const byCategory = { repair: 0, environment: 0, cleaning: 0, turnover: 0, general: 0 } as Record<string, number>;
  let urgent = 0;

  const roomCounts = new Map<string, number>();
  for (const r of rows || []) {
    if (r.urgent) urgent += 1;
    const st = String((r as any).status || 'new');
    if (byStatus[st] !== undefined) byStatus[st] += 1;
    const cat = String((r as any).main_category || 'general');
    if (byCategory[cat] !== undefined) byCategory[cat] += 1;
    const room = (r as any).room_number ? String((r as any).room_number) : '';
    if (room) roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
  }

  const topRooms = Array.from(roomCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([roomNumber, count]) => ({ roomNumber, count }));

  const total = (rows || []).length;

  return NextResponse.json({
    ok: true,
    data: {
      date,
      total,
      urgent,
      new: byStatus.new,
      acknowledged: byStatus.acknowledged,
      done: byStatus.done,
      deferred: byStatus.deferred,
      byCategory,
      topRooms
    }
  });
}

