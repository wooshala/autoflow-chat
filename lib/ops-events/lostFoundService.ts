import { supabaseAdmin } from '@/lib/supabase';
import { getSiteId, LOST_FOUND_BUCKET } from '@/lib/ops-events/flags';
import {
  isLostFoundTerminal,
  isLostFoundTransitionAllowed,
  lostFoundTransitionAction
} from '@/lib/ops-events/lostFoundFsm';
import type { LostFoundItem, LostFoundStatus, OpsEventHistoryRow } from '@/lib/ops-events/types';

type Actor = { id: string; name: string; role: string | null };

export class LostFoundConflictError extends Error {
  constructor(message = 'Already registered for this message') {
    super(message);
    this.name = 'LostFoundConflictError';
  }
}

export class LostFoundNotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'LostFoundNotFoundError';
  }
}

export class LostFoundValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LostFoundValidationError';
  }
}

async function loadActor(actorId: string): Promise<Actor> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');
  const { data, error } = await supabaseAdmin.from('users').select('id, name, role').eq('id', actorId).single();
  if (error || !data) throw new LostFoundValidationError('Invalid actor_id');
  return { id: data.id, name: data.name, role: data.role ?? null };
}

async function assignEventNo(siteId: string): Promise<string> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');
  const { data, error } = await supabaseAdmin.rpc('assign_ops_event_number', {
    p_site_id: siteId,
    p_category: 'lost_found',
    p_prefix: 'LF-'
  });
  if (error || !data) throw new Error(error?.message || 'Failed to assign event_no');
  return String(data);
}

function isDuplicateKeyError(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export async function createLostFoundFromMessage(input: {
  origin_message_id: string;
  item_description: string;
  found_location?: string | null;
  locker_code?: string | null;
  actor_id: string;
  idempotency_key?: string | null;
}): Promise<LostFoundItem> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');

  const siteId = getSiteId();
  const actor = await loadActor(input.actor_id);

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('chat_messages')
    .select(
      'id, message, room_no, image_url, image_storage_path, created_at, sender_name, user_id, user:users(name, role)'
    )
    .eq('id', input.origin_message_id)
    .single();

  if (msgErr || !msg) throw new LostFoundValidationError('origin_message_id not found');
  if (!msg.image_url && !msg.image_storage_path) {
    throw new LostFoundValidationError('Photo message required for lost_found registration');
  }

  const userJoin = (msg as any).user;
  const snapSender = msg.sender_name || userJoin?.name || null;
  const snapSenderRole = userJoin?.role ?? null;

  const eventNo = await assignEventNo(siteId);
  const now = new Date().toISOString();

  const row = {
    event_no: eventNo,
    site_id: siteId,
    source: 'autoflow',
    snap_room_no: msg.room_no,
    snap_sender: snapSender,
    snap_sender_role: snapSenderRole,
    snap_image_url: msg.image_url,
    snap_storage_path: msg.image_storage_path,
    snap_message_text: msg.message,
    snap_message_created_at: msg.created_at,
    origin_message_id: msg.id,
    idempotency_key: input.idempotency_key ?? null,
    item_description: input.item_description.trim(),
    found_location: input.found_location?.trim() || null,
    locker_code: input.locker_code?.trim() || null,
    status: 'registered' as LostFoundStatus,
    created_by: actor.id,
    created_at: now,
    updated_at: now
  };

  const { data: created, error: createErr } = await supabaseAdmin
    .from('lost_found_items')
    .insert(row)
    .select('*')
    .single();

  if (createErr) {
    if (isDuplicateKeyError(createErr)) throw new LostFoundConflictError();
    throw new Error(createErr.message);
  }

  const { error: histErr } = await supabaseAdmin.from('ops_event_history').insert({
    site_id: siteId,
    ref_table: 'lost_found_items',
    ref_id: created.id,
    action: 'created',
    from_status: null,
    to_status: 'registered',
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    idempotency_key: input.idempotency_key ?? null
  });
  if (histErr) throw new Error(histErr.message);

  if (msg.image_storage_path) {
    const { error: protErr } = await supabaseAdmin.from('storage_protected_paths').insert({
      site_id: siteId,
      path: msg.image_storage_path,
      bucket: LOST_FOUND_BUCKET,
      reason: 'ops_event',
      ref_table: 'lost_found_items',
      ref_id: created.id
    });
    if (protErr && !isDuplicateKeyError(protErr)) throw new Error(protErr.message);
  }

  return created as LostFoundItem;
}

export async function listLostFoundItems(input?: {
  status?: LostFoundStatus;
  limit?: number;
}): Promise<LostFoundItem[]> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');
  const siteId = getSiteId();
  let q = supabaseAdmin
    .from('lost_found_items')
    .select('*')
    .eq('site_id', siteId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(input?.limit ?? 100);
  if (input?.status) q = q.eq('status', input.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as LostFoundItem[];
}

export async function getLostFoundItem(id: string): Promise<LostFoundItem> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');
  const siteId = getSiteId();
  const { data, error } = await supabaseAdmin
    .from('lost_found_items')
    .select('*')
    .eq('id', id)
    .eq('site_id', siteId)
    .eq('is_deleted', false)
    .single();
  if (error || !data) throw new LostFoundNotFoundError();
  return data as LostFoundItem;
}

export async function transitionLostFoundItem(input: {
  id: string;
  to_status: LostFoundStatus;
  actor_id: string;
  transition_note?: string | null;
  idempotency_key?: string | null;
}): Promise<{ item: LostFoundItem; history: OpsEventHistoryRow }> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');

  const siteId = getSiteId();
  const actor = await loadActor(input.actor_id);
  const item = await getLostFoundItem(input.id);
  const fromStatus = item.status;

  if (!isLostFoundTransitionAllowed(fromStatus, input.to_status)) {
    throw new LostFoundValidationError(`Transition not allowed: ${fromStatus} → ${input.to_status}`);
  }

  const isReopen = isLostFoundTerminal(fromStatus);
  if (isReopen && !input.transition_note?.trim()) {
    throw new LostFoundValidationError('transition_note required for reopen');
  }

  if (input.idempotency_key) {
    const { data: existing } = await supabaseAdmin
      .from('ops_event_history')
      .select('*')
      .eq('site_id', siteId)
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (existing) {
      const fresh = await getLostFoundItem(input.id);
      return { item: fresh, history: existing as OpsEventHistoryRow };
    }
  }

  const now = new Date().toISOString();
  const action = lostFoundTransitionAction(fromStatus, input.to_status);

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('lost_found_items')
    .update({
      status: input.to_status,
      status_changed_at: now,
      status_changed_by: actor.id,
      updated_at: now
    })
    .eq('id', input.id)
    .select('*')
    .single();

  if (updErr || !updated) throw new Error(updErr?.message || 'Update failed');

  const { data: history, error: histErr } = await supabaseAdmin
    .from('ops_event_history')
    .insert({
      site_id: siteId,
      ref_table: 'lost_found_items',
      ref_id: input.id,
      action,
      from_status: fromStatus,
      to_status: input.to_status,
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      transition_note: input.transition_note?.trim() || null,
      idempotency_key: input.idempotency_key ?? null
    })
    .select('*')
    .single();

  if (histErr) throw new Error(histErr.message);

  return { item: updated as LostFoundItem, history: history as OpsEventHistoryRow };
}

export async function getLostFoundHistory(id: string): Promise<OpsEventHistoryRow[]> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');
  await getLostFoundItem(id);
  const { data, error } = await supabaseAdmin
    .from('ops_event_history')
    .select('*')
    .eq('ref_table', 'lost_found_items')
    .eq('ref_id', id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as OpsEventHistoryRow[];
}

/** Soft-delete: set is_deleted=true. No physical delete. */
export async function softDeleteLostFoundItem(input: {
  id: string;
  actor_id: string;
}): Promise<LostFoundItem> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');

  const siteId = getSiteId();
  const actor = await loadActor(input.actor_id);
  const item = await getLostFoundItem(input.id);
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('lost_found_items')
    .update({
      is_deleted: true,
      deleted_at: now,
      updated_at: now
    })
    .eq('id', input.id)
    .eq('site_id', siteId)
    .select('*')
    .single();

  if (updErr || !updated) throw new Error(updErr?.message || 'Soft delete failed');

  const { error: histErr } = await supabaseAdmin.from('ops_event_history').insert({
    site_id: siteId,
    ref_table: 'lost_found_items',
    ref_id: input.id,
    action: 'soft_deleted',
    from_status: item.status,
    to_status: item.status,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role
  });
  if (histErr) throw new Error(histErr.message);

  return updated as LostFoundItem;
}

export type LostFoundFieldPatch = {
  snap_room_no?: string | null;
  item_description?: string;
  found_location?: string | null;
};

function normRoomNo(v: string | null | undefined): string | null {
  const s = String(v ?? '')
    .replace(/[^\d]/g, '')
    .slice(0, 4);
  return s || null;
}

/** Staff manual edit (Phase A): room, description, memo — history meta before/after. */
export async function updateLostFoundItem(input: {
  id: string;
  actor_id: string;
  patch: LostFoundFieldPatch;
}): Promise<{ item: LostFoundItem; history: OpsEventHistoryRow }> {
  if (!supabaseAdmin) throw new Error('Supabase admin client is not configured');

  const siteId = getSiteId();
  const actor = await loadActor(input.actor_id);
  const item = await getLostFoundItem(input.id);

  const before = {
    snap_room_no: item.snap_room_no,
    item_description: item.item_description,
    found_location: item.found_location
  };

  const updates: Record<string, string | null> = {};
  const patch = input.patch;

  if (patch.snap_room_no !== undefined) {
    updates.snap_room_no = normRoomNo(patch.snap_room_no);
  }
  if (patch.item_description !== undefined) {
    const desc = String(patch.item_description).trim();
    if (!desc) throw new LostFoundValidationError('item_description required');
    updates.item_description = desc;
  }
  if (patch.found_location !== undefined) {
    const loc = String(patch.found_location ?? '').trim();
    updates.found_location = loc || null;
  }

  if (Object.keys(updates).length === 0) {
    throw new LostFoundValidationError('No fields to update');
  }

  const after = {
    snap_room_no:
      updates.snap_room_no !== undefined ? updates.snap_room_no : item.snap_room_no,
    item_description:
      updates.item_description !== undefined ? updates.item_description : item.item_description,
    found_location:
      updates.found_location !== undefined ? updates.found_location : item.found_location
  };

  const unchanged =
    after.snap_room_no === before.snap_room_no &&
    after.item_description === before.item_description &&
    after.found_location === before.found_location;
  if (unchanged) {
    throw new LostFoundValidationError('No changes');
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('lost_found_items')
    .update({ ...updates, updated_at: now })
    .eq('id', input.id)
    .eq('site_id', siteId)
    .select('*')
    .single();

  if (updErr || !updated) throw new Error(updErr?.message || 'Update failed');

  const { data: history, error: histErr } = await supabaseAdmin
    .from('ops_event_history')
    .insert({
      site_id: siteId,
      ref_table: 'lost_found_items',
      ref_id: input.id,
      action: 'note_added',
      from_status: item.status,
      to_status: item.status,
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      transition_note: '필드 수정',
      meta: { edit: 'field_update', before, after }
    })
    .select('*')
    .single();

  if (histErr) throw new Error(histErr.message);

  return { item: updated as LostFoundItem, history: history as OpsEventHistoryRow };
}
