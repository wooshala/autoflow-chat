import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { IssueType, TicketStatus } from '@/lib/types';

export type DashboardSummary = {
  today_count: number;
  open_count: number;
  in_progress_count: number;
  auto_create_rate: number; // 0~1
};

export type DashboardInsights = {
  top_categories: { category: string; count: number }[];
  top_rooms: { room_no: string; count: number }[];
};

export type DashboardTicket = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  room_no: string;
  category: IssueType | string;
  summary: string;
  status: TicketStatus | 'in_progress' | 'hold' | string;
  auto_created: boolean | null;

  // detail
  original: string;
  source_message_id?: string | null;

  // ops
  is_delayed: boolean;
  delay_minutes: number;
};

function startOfTodaySeoulUtcIso(now = new Date()): string {
  // "오늘"은 운영 기준(한국)으로 보는 편이 자연스럽기 때문에 KST 기준 자정(00:00)을 UTC ISO로 변환
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const kstMidnightUtcMs = Date.UTC(y, m, d, 0, 0, 0) - KST_OFFSET_MS;
  return new Date(kstMidnightUtcMs).toISOString();
}

function toAppStatus(status: unknown): TicketStatus {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'open';
  if (s === 'progress') return 'progress';
  if (s === 'done') return 'done';
  if (s === 'in_progress') return 'progress';
  if (s === 'in progress') return 'progress';
  return 'open';
}

function normalizeDashboardStatus(status: unknown): 'open' | 'in_progress' | 'done' | 'hold' {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'open' || s === 'o' || s === 'opened') return 'open';
  if (s === 'in_progress' || s === 'progress' || s === 'in progress') return 'in_progress';
  if (s === 'done' || s === 'closed' || s === 'complete' || s === 'completed') return 'done';
  if (s === 'hold' || s === 'paused' || s === 'pending') return 'hold';
  // DB enum-like
  if (s === 'open'.toLowerCase()) return 'open';
  if (s === 'in_progress'.toLowerCase()) return 'in_progress';
  if (s === 'done'.toLowerCase()) return 'done';
  if (s === 'hold'.toLowerCase()) return 'hold';
  return 'open';
}

function computeDelay(status: string, created_at: string): { is_delayed: boolean; delay_minutes: number } {
  const st = String(status || '').toLowerCase().trim();
  if (st === 'done' || st === 'hold') return { is_delayed: false, delay_minutes: 0 };

  const createdMs = Date.parse(String(created_at || ''));
  if (!Number.isFinite(createdMs)) return { is_delayed: false, delay_minutes: 0 };

  const ageMin = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
  const threshold =
    st === 'open' ? 5 :
    st === 'in_progress' ? 30 :
    null;

  if (threshold === null) return { is_delayed: false, delay_minutes: ageMin };
  return { is_delayed: ageMin > threshold, delay_minutes: ageMin };
}

function pickTextSummary(text: string, max = 40): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function subtractDaysIso(days: number): string {
  const d = Math.max(0, Math.floor(days));
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

function inc(map: Map<string, number>, key: string) {
  const k = String(key || '').trim();
  if (!k) return;
  map.set(k, (map.get(k) || 0) + 1);
}

function topN(map: Map<string, number>, n: number): { key: string; count: number }[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, Math.max(1, n));
}

export async function getDashboardTickets(input?: {
  limit?: number;
  status?: string;
  room_no?: string;
  category?: string;
  auto_created?: string;
}): Promise<DashboardTicket[]> {
  const limit = Math.max(1, Math.min(Number(input?.limit || 80), 200));
  if (IS_MOCK || !supabaseAdmin) return [];

  const statusFilter = String(input?.status || '').trim();
  const roomFilter = String(input?.room_no || '').trim();
  const categoryFilter = String(input?.category || '').trim();
  const autoFilterRaw = String(input?.auto_created || '').trim().toLowerCase();
  const autoFilter: boolean | null =
    autoFilterRaw === 'true' ? true : autoFilterRaw === 'false' ? false : null;

  // NOTE: 현재 코드베이스는 `tickets` 테이블을 사용 중(maintenance_tickets와 병행 가능성 있음)
  let q = supabaseAdmin.from('tickets').select('*');

  // DB-level filters (best-effort)
  if (roomFilter) {
    // partial match is more practical for ops (e.g. 60 -> 601/602)
    q = q.ilike('room_no', `%${roomFilter}%`);
  }

  if (categoryFilter && categoryFilter !== 'all') {
    // schema may have category OR issue_type
    q = q.or(`category.eq.${categoryFilter},issue_type.eq.${categoryFilter}`);
  }

  if (statusFilter && statusFilter !== 'all') {
    const s = statusFilter.toLowerCase();
    if (s === 'open') {
      q = q.in('status', ['OPEN', 'open']);
    } else if (s === 'in_progress' || s === 'progress') {
      q = q.in('status', ['IN_PROGRESS', 'in_progress', 'progress', 'PROGRESS']);
    } else if (s === 'done') {
      q = q.in('status', ['DONE', 'done']);
    } else if (s === 'hold') {
      q = q.in('status', ['HOLD', 'hold']);
    }
  }

  const { data: rows, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;

  const raw = (rows || []) as any[];
  const tickets: DashboardTicket[] = raw.map((r) => {
    const created_at = String(r?.created_at || new Date().toISOString());
    const updated_at = r?.updated_at ? String(r.updated_at) : null;
    const room_no = String(r?.room_no || '');
    const category =
      (r?.category as IssueType) ||
      (r?.issue_type as IssueType) ||
      String(r?.category || r?.issue_type || '기타');
    const status = normalizeDashboardStatus(r?.status);
    const source_message_id = r?.source_message_id ? String(r.source_message_id) : null;
    const summaryRaw = typeof r?.summary === 'string' ? String(r.summary) : '';
    const descriptionRaw = typeof r?.description === 'string' ? String(r.description) : '';
    const original = String(descriptionRaw || '');
    const summary = pickTextSummary(summaryRaw || original || `${room_no ? `${room_no}호` : ''} ${String(category || '')}`.trim(), 44);
    const { is_delayed, delay_minutes } = computeDelay(status, created_at);
    return {
      id: String(r?.id || ''),
      created_at,
      updated_at,
      room_no,
      category,
      summary,
      status,
      auto_created: null,
      original,
      source_message_id,
      is_delayed,
      delay_minutes
    };
  });

  const ids = tickets.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return tickets;

  // Fill original/summary from chat_messages if tickets table doesn't carry description/summary yet.
  // Priority:
  // - original: tickets.description -> tickets.source_message_id(chat_messages.message) -> chat_messages.message(where ticket_id = ticket.id)
  // - summary: tickets.summary -> original head
  const sourceIds = tickets.map((t) => t.source_message_id).filter((x): x is string => Boolean(x));
  const sourceMsgMap = new Map<string, string>();
  if (sourceIds.length) {
    const { data: sourceMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, message')
      .in('id', sourceIds.slice(0, 200));
    for (const r of (sourceMsgs || []) as any[]) {
      const id = String(r?.id || '');
      const msg = typeof r?.message === 'string' ? String(r.message) : '';
      if (id && msg) sourceMsgMap.set(id, msg);
    }
  }

  const needByTicketId = tickets.filter((t) => !String(t.original || '').trim()).map((t) => t.id);
  const msgByTicketId = new Map<string, { message: string; created_at: string; id: string }>();
  if (needByTicketId.length) {
    const { data: msgRows } = await supabaseAdmin
      .from('chat_messages')
      .select('ticket_id, id, message, created_at')
      .in('ticket_id', needByTicketId.slice(0, 200))
      .order('created_at', { ascending: true })
      .limit(1000);

    for (const r of (msgRows || []) as any[]) {
      const tid = String(r?.ticket_id || '');
      const msg = typeof r?.message === 'string' ? String(r.message) : '';
      if (!tid || !msg) continue;
      if (!msgByTicketId.has(tid)) {
        msgByTicketId.set(tid, {
          id: String(r?.id || ''),
          created_at: String(r?.created_at || ''),
          message: msg
        });
      }
    }
  }

  // auto_created: 해당 ticket_id를 가진 chat_messages 중 ai_action이 ticket_created 계열인 것이 있으면 true
  const { data: msgRows, error: msgError } = await supabaseAdmin
    .from('chat_messages')
    .select('ticket_id, ai_action')
    .in('ticket_id', ids)
    .in('ai_action', ['ticket_created', 'ticket_created_manual']);
  if (msgError) {
    // MVP: 실패해도 페이지는 뜨게 (auto_created만 null 유지)
    const merged = tickets.map((t) => {
      const fromSource = t.source_message_id ? sourceMsgMap.get(String(t.source_message_id)) || '' : '';
      const fromTicket = msgByTicketId.get(t.id)?.message || '';
      const original = String(t.original || fromSource || fromTicket || '').trim();
      const summary = pickTextSummary(String(t.summary || '') || original, 44);
      return { ...t, original, summary };
    });
    const filtered = autoFilter !== null ? merged.filter((t) => t.auto_created === autoFilter) : merged;
    return filtered.sort((a, b) => {
      if (a.is_delayed !== b.is_delayed) return a.is_delayed ? -1 : 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }

  const autoIds = new Set<string>();
  for (const r of (msgRows || []) as any[]) {
    const tid = String(r?.ticket_id || '');
    const action = String(r?.ai_action || '');
    if (!tid) continue;
    if (action === 'ticket_created' || action === 'ticket_created_manual') autoIds.add(tid);
  }

  const merged = tickets.map((t) => {
    const fromSource = t.source_message_id ? sourceMsgMap.get(String(t.source_message_id)) || '' : '';
    const fromTicket = msgByTicketId.get(t.id)?.message || '';
    const original = String(t.original || fromSource || fromTicket || '').trim();
    const summary = pickTextSummary(String(t.summary || '') || original, 44);
    return { ...t, auto_created: autoIds.has(t.id), original, summary };
  });

  const filtered = autoFilter !== null ? merged.filter((t) => t.auto_created === autoFilter) : merged;
  return filtered.sort((a, b) => {
    if (a.is_delayed !== b.is_delayed) return a.is_delayed ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

export async function getDashboardInsights(input?: { days?: number; limit?: number }): Promise<DashboardInsights> {
  const days = Number.isFinite(Number(input?.days)) ? Math.max(1, Math.min(Number(input?.days), 365)) : 7;
  const limit = Number.isFinite(Number(input?.limit)) ? Math.max(1, Math.min(Number(input?.limit), 10)) : 5;

  if (IS_MOCK || !supabaseAdmin) {
    return { top_categories: [], top_rooms: [] };
  }

  const sinceIso = subtractDaysIso(days);
  const { data: rows, error } = await supabaseAdmin
    .from('tickets')
    .select('room_no, category, issue_type, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const categoryMap = new Map<string, number>();
  const roomMap = new Map<string, number>();

  for (const r of (rows || []) as any[]) {
    const room_no = String(r?.room_no || '').trim();
    const category = String(r?.category || r?.issue_type || '기타').trim() || '기타';
    inc(categoryMap, category);
    if (room_no) inc(roomMap, room_no);
  }

  const top_categories = topN(categoryMap, limit).map((x) => ({ category: x.key, count: x.count }));
  const top_rooms = topN(roomMap, limit).map((x) => ({ room_no: x.key, count: x.count }));
  return { top_categories, top_rooms };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (IS_MOCK || !supabaseAdmin) {
    return { today_count: 0, open_count: 0, in_progress_count: 0, auto_create_rate: 0 };
  }

  const todayStartIso = startOfTodaySeoulUtcIso();

  const [{ count: todayCount, error: todayErr }, { count: openCount, error: openErr }, { count: progressCount, error: progErr }] =
    await Promise.all([
      supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).gte('created_at', todayStartIso),
      supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['OPEN', 'open']),
      supabaseAdmin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['IN_PROGRESS', 'in_progress', 'progress', 'PROGRESS'])
    ]);

  if (todayErr) throw todayErr;
  if (openErr) throw openErr;
  if (progErr) throw progErr;

  const today_count = Number(todayCount || 0);
  const open_count = Number(openCount || 0);
  const in_progress_count = Number(progressCount || 0);

  let auto_create_rate = 0;
  if (today_count > 0) {
    const { data: todayRows, error } = await supabaseAdmin
      .from('tickets')
      .select('id, created_at')
      .gte('created_at', todayStartIso)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) {
      const ids = ((todayRows || []) as any[]).map((r) => String(r?.id || '')).filter(Boolean);
      if (ids.length) {
        const { data: msgRows } = await supabaseAdmin
          .from('chat_messages')
          .select('ticket_id, ai_action')
          .in('ticket_id', ids)
          .in('ai_action', ['ticket_created', 'ticket_created_manual']);
        const autoIds = new Set<string>();
        for (const r of (msgRows || []) as any[]) {
          const tid = String(r?.ticket_id || '');
          const action = String(r?.ai_action || '');
          if (!tid) continue;
          if (action === 'ticket_created' || action === 'ticket_created_manual') autoIds.add(tid);
        }
        auto_create_rate = autoIds.size / Math.max(1, ids.length);
      }
    }
  }

  return { today_count, open_count, in_progress_count, auto_create_rate };
}

