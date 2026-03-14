import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { createChatMessage } from '@/lib/services/chat';
import { IssueType, MaintenancePhoto, MaintenanceTicket, TicketStatus } from '@/lib/types';

function hydrateTicket(ticket: MaintenanceTicket): MaintenanceTicket {
  const store = getMockStore();
  return {
    ...ticket,
    creator: ticket.creator || (() => {
      const user = store.users.find(u => u.id === ticket.created_by);
      return user ? { id: user.id, name: user.name, role: user.role, language: user.language } : undefined;
    })(),
    photos: store.photos.filter(p => p.ticket_id === ticket.id)
  };
}

export async function listTickets(status?: string): Promise<MaintenanceTicket[]> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    let tickets = store.tickets;
    if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);
    return tickets.map(hydrateTicket);
  }

  let query = supabaseAdmin
    .from('maintenance_tickets')
    .select('*, creator:users(id,name,role,language), photos:maintenance_photos(*)')
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as MaintenanceTicket[];
}

export async function getTicket(id: string): Promise<MaintenanceTicket | null> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const found = store.tickets.find(t => t.id === id);
    return found ? hydrateTicket(found) : null;
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance_tickets')
    .select('*, creator:users(id,name,role,language), photos:maintenance_photos(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as MaintenanceTicket;
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
    if (input.image_url) {
      const photo: MaintenancePhoto = {
        id: `p-${Date.now()}`,
        ticket_id: base.id,
        image_url: input.image_url,
        storage_path: input.storage_path || null,
        photo_type: 'before',
        created_at: new Date().toISOString()
      };
      store.photos.unshift(photo);
    }
    await createChatMessage({
      user_id: input.created_by,
      message: `🔧 ${input.room_no}호 ${input.issue_type} 접수됨`,
      message_type: 'maintenance',
      room_no: input.room_no,
      image_url: input.image_url || null,
      image_storage_path: input.storage_path || null,
      ticket_id: base.id
    });
    return hydrateTicket(base);
  }

  const { data, error } = await supabaseAdmin
    .from('maintenance_tickets')
    .insert({
      room_no: input.room_no,
      issue_type: input.issue_type,
      description: input.description,
      status: 'open',
      created_by: input.created_by
    })
    .select('*, creator:users(id,name,role,language), photos:maintenance_photos(*)')
    .single();
  if (error) throw error;

  const ticket = data as MaintenanceTicket;
  if (input.image_url) {
    await supabaseAdmin.from('maintenance_photos').insert({
      ticket_id: ticket.id,
      image_url: input.image_url,
      storage_path: input.storage_path || null,
      photo_type: 'before'
    });
  }

  await createChatMessage({
    user_id: input.created_by,
    message: `🔧 ${input.room_no}호 ${input.issue_type} 접수됨`,
    message_type: 'maintenance',
    room_no: input.room_no,
    image_url: input.image_url || null,
    image_storage_path: input.storage_path || null,
    ticket_id: ticket.id
  });

  return (await getTicket(ticket.id))!;
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
    if (input.status === 'done' && input.complete_photo_url) {
      store.photos.unshift({
        id: `p-${Date.now()}`,
        ticket_id: id,
        image_url: input.complete_photo_url,
        storage_path: input.complete_storage_path || null,
        photo_type: 'after',
        created_at: new Date().toISOString()
      });
    }
    return hydrateTicket(store.tickets[idx]);
  }

  const { error } = await supabaseAdmin
    .from('maintenance_tickets')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  if (input.status === 'done' && input.complete_photo_url) {
    await supabaseAdmin.from('maintenance_photos').insert({
      ticket_id: id,
      image_url: input.complete_photo_url,
      storage_path: input.complete_storage_path || null,
      photo_type: 'after'
    });
  }

  return getTicket(id);
}
