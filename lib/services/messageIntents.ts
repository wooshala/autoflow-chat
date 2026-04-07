import { getMockStore } from '@/lib/mock';
import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import type { MessageIntent, MessageIntentIssueType } from '@/lib/types';

export async function createMessageIntent(input: {
  message_id: string;
  room_no: string | null;
  issue_type: MessageIntentIssueType;
  summary: string | null;
  is_ticketable: boolean;
  is_new_issue: boolean;
  matched_ticket_id: string | null;
  confidence: number | null;
  raw_ai_result: unknown | null;
}): Promise<MessageIntent | null> {
  if (!input.message_id) return null;

  const row: MessageIntent = {
    id: `mi-${Date.now()}`,
    message_id: input.message_id,
    room_no: input.room_no,
    issue_type: input.issue_type,
    summary: input.summary,
    is_ticketable: input.is_ticketable,
    is_new_issue: input.is_new_issue,
    matched_ticket_id: input.matched_ticket_id,
    confidence: input.confidence,
    raw_ai_result: input.raw_ai_result,
    created_at: new Date().toISOString()
  };

  if (IS_MOCK || !supabaseAdmin) {
    // mock store에는 아직 intents 컬렉션이 없어 side-effect 없이 반환만.
    // (추후 dashboard에서 mock 지원 시 확장)
    void getMockStore();
    return row;
  }

  const { data, error } = await supabaseAdmin
    .from('message_intents')
    .insert({
      message_id: input.message_id,
      room_no: input.room_no,
      issue_type: input.issue_type,
      summary: input.summary,
      is_ticketable: input.is_ticketable,
      is_new_issue: input.is_new_issue,
      matched_ticket_id: input.matched_ticket_id,
      confidence: input.confidence,
      raw_ai_result: input.raw_ai_result
    })
    .select('*')
    .single();

  if (error) throw error;
  return data ? (data as MessageIntent) : row;
}

export async function updateMessageIntentById(
  id: string,
  patch: Partial<Pick<MessageIntent, 'matched_ticket_id' | 'is_ticketable' | 'is_new_issue' | 'confidence' | 'raw_ai_result' | 'summary' | 'room_no'>>
): Promise<void> {
  if (!id) return;
  const normalized: Record<string, unknown> = {};
  if (patch.matched_ticket_id !== undefined) normalized.matched_ticket_id = patch.matched_ticket_id;
  if (patch.is_ticketable !== undefined) normalized.is_ticketable = patch.is_ticketable;
  if (patch.is_new_issue !== undefined) normalized.is_new_issue = patch.is_new_issue;
  if (patch.confidence !== undefined) normalized.confidence = patch.confidence;
  if (patch.raw_ai_result !== undefined) normalized.raw_ai_result = patch.raw_ai_result;
  if (patch.summary !== undefined) normalized.summary = patch.summary;
  if (patch.room_no !== undefined) normalized.room_no = patch.room_no;
  if (Object.keys(normalized).length === 0) return;

  if (IS_MOCK || !supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('message_intents').update(normalized).eq('id', id);
  if (error) throw error;
}

