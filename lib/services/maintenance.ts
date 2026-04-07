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
    // real tickets 테이블에 description 컬럼이 없으므로 안전하게 빈 문자열로 유지
    description: '',
    status: toAppStatus(row.status),
    created_by: String(row.created_by || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString())
  };
}

export async function listTickets(status?: string): Promise<MaintenanceTicket[]> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    let tickets = store.tickets;
    if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);
    return tickets.map(hydrateTicket);
  }

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  let tickets = (data || []).map(mapRowToTicket);
  if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);
  return tickets;
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
