import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { createChatMessage } from '@/lib/services/chat';
import { IssueType, MaintenanceTicket, TicketStatus } from '@/lib/types';

function toAppStatus(status: any): TicketStatus {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'open';
  if (s === 'progress') return 'progress';
  if (s === 'done') return 'done';
  if (s === 'in_progress') return 'progress';
  return 'open';
}

function toDbStatus(status: TicketStatus): string {
  if (status === 'open') return 'OPEN';
  if (status === 'progress') return 'IN_PROGRESS';
  return 'DONE';
}

function hydrateTicket(ticket: MaintenanceTicket): MaintenanceTicket {
  // 실제 tickets 스키마에는 photos/creator join이 없으므로 그대로 반환
  return ticket;
}

function mapRowToTicket(row: any): MaintenanceTicket {
  return {
    id: String(row.id),
    room_no: String(row.room_no || ''),
    issue_type: row.issue_type as IssueType,
    description: String(row.description || ''),
    status: toAppStatus(row.status),
    created_by: String(row.created_by || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString())
  };
}

/** 목록 응답 전용 타입: 기존 MaintenanceTicket에 image_url만 additive. 공통 타입/매퍼는 불변. */
export type MaintenanceTicketWithPhoto = MaintenanceTicket & { image_url: string | null };

/**
 * 시설고장 사진은 tickets가 아니라 티켓에 연결된 maintenance chat_message의 증거다.
 * ticket_id 목록으로 chat_messages를 한 번에(배치) 조회하고, 티켓당 최신 1장을 매핑한다.
 * 조건: message_type='maintenance' AND image_url 존재. (카드별 개별 요청 없음 = N+1 방지)
 */
async function fetchNewestMaintenancePhotos(ticketIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ticketIds.length === 0) return map;

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idSet = new Set(ticketIds.map(String));
    const msgs = (store.messages as any[])
      .filter((m) => m?.message_type === 'maintenance' && m?.image_url && idSet.has(String(m?.ticket_id)))
      .sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at)));
    for (const m of msgs) {
      const tid = String(m.ticket_id);
      if (!map.has(tid)) map.set(tid, String(m.image_url)); // 정렬 DESC → 첫 건 = 최신
    }
    return map;
  }

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('ticket_id, image_url, created_at')
    .in('ticket_id', ticketIds)
    .eq('message_type', 'maintenance')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    // 사진 조회 실패는 목록을 막지 않는다(사진만 없음으로 폴백).
    console.error('[MAINTENANCE_LIST_PHOTO_ERROR]', { message: error.message });
    return map;
  }
  for (const row of (data || []) as any[]) {
    const tid = String(row?.ticket_id || '');
    const url = row?.image_url;
    if (tid && url && !map.has(tid)) map.set(tid, String(url)); // DESC → 첫 건 = 최신
  }
  return map;
}

export async function listTickets(status?: string): Promise<MaintenanceTicketWithPhoto[]> {
  console.log('[MAINTENANCE_LIST_QUERY_START]', {
    is_mock: IS_MOCK,
    has_supabase_admin: !!supabaseAdmin,
    status_filter: status || null,
  });

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    let tickets = store.tickets;
    if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);
    console.log('[MAINTENANCE_LIST_MOCK]', { count: tickets.length });
    const hydrated = tickets.map(hydrateTicket);
    const photos = await fetchNewestMaintenancePhotos(hydrated.map(t => String(t.id)));
    return hydrated.map(t => ({ ...t, image_url: photos.get(String(t.id)) ?? null }));
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  console.log('[MAINTENANCE_LIST_RESULT]', {
    count: data?.length ?? 0,
    error: error ? { message: error.message, code: (error as any).code, hint: (error as any).hint } : null,
    ids: data?.slice(0, 10).map((r: any) => r.id) ?? [],
    room_nos: data?.slice(0, 10).map((r: any) => r.room_no) ?? [],
    statuses: data?.slice(0, 10).map((r: any) => r.status) ?? [],
  });

  if (error) throw error;

  let tickets = (data || []).map(mapRowToTicket);
  if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);

  console.log('[MAINTENANCE_LIST_SERVICE_RESULT_JSON]', JSON.stringify({
    count: tickets.length,
    room_nos: tickets.slice(0, 20).map(r => r.room_no),
    ids: tickets.slice(0, 20).map(r => r.id),
    statuses: tickets.slice(0, 20).map(r => r.status),
  }, null, 2));

  // 사진(image_url) additive 부착: ticket_id 목록으로 chat_messages 배치 1회 조회 → 티켓당 최신 1장.
  const photos = await fetchNewestMaintenancePhotos(tickets.map(t => String(t.id)));
  return tickets.map(t => ({ ...t, image_url: photos.get(String(t.id)) ?? null }));
}

export async function getTicket(id: string): Promise<MaintenanceTicket | null> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const found = store.tickets.find(t => t.id === id);
    return found ? hydrateTicket(found) : null;
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data ? mapRowToTicket(data) : null;
}

export async function findActiveTicketByRoomAndIssue(input: {
  room_no: string;
  issue_type: IssueType;
}): Promise<MaintenanceTicket | null> {
  if (!input.room_no || !input.issue_type) return null;

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const found = store.tickets.find(
      (t) =>
        String(t.room_no) === String(input.room_no) &&
        t.issue_type === input.issue_type &&
        (t.status === 'open' || t.status === 'progress')
    );
    return found ? hydrateTicket(found) : null;
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .eq('room_no', input.room_no)
    .eq('issue_type', input.issue_type)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRowToTicket(data) : null;
}

export async function createTicket(input: {
  room_no: string;
  issue_type: IssueType;
  description: string;
  created_by: string;
  image_url?: string | null;
  storage_path?: string | null;
}): Promise<MaintenanceTicket> {
  const base: MaintenanceTicket = {
    id: `t-${Date.now()}`,
    room_no: input.room_no,
    issue_type: input.issue_type,
    description: input.description,
    status: 'open',
    created_by: input.created_by,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    store.tickets.unshift(base);
    await createChatMessage({
      user_id: input.created_by,
      message: `🔧 ${input.room_no}호 유지보수 접수됨`,
      message_type: 'maintenance',
      room_no: input.room_no,
      image_url: input.image_url || null,
      image_storage_path: input.storage_path || null,
      ticket_id: base.id
    });
    return hydrateTicket(base);
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      room_no: input.room_no,
      issue_type: input.issue_type,
      description: input.description || null,
      status: toDbStatus('open'),
      created_by: input.created_by,
      created_at: now
    })
    .select('*')
    .single();
  if (error) throw error;

  const ticket = data ? mapRowToTicket(data) : base;

  await createChatMessage({
    user_id: input.created_by,
    message: `🔧 ${input.room_no}호 유지보수 접수됨`,
    message_type: 'maintenance',
    room_no: input.room_no,
    image_url: input.image_url || null,
    image_storage_path: input.storage_path || null,
    ticket_id: String((data as any)?.id || ticket.id)
  });

  const createdId = String((data as any)?.id || '');
  if (createdId) {
    return (await getTicket(createdId)) || ticket;
  }
  return ticket;
}

export async function updateTicket(id: string, input: {
  status: TicketStatus;
  complete_photo_url?: string | null;
  complete_storage_path?: string | null;
}): Promise<MaintenanceTicket | null> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    store.tickets[idx] = { ...store.tickets[idx], status: input.status, updated_at: new Date().toISOString() };
    return hydrateTicket(store.tickets[idx]);
  }

  const { error } = await supabaseAdmin
    .from('tickets')
    .update({ status: toDbStatus(input.status), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  return getTicket(id);
}
