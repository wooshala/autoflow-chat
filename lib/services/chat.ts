import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { AiAction, ChatMessage, MessagePriority, MessageType, SenderSide } from '@/lib/types';
import { detectAndTranslate } from '@/lib/services/translation';

function withUser(msg: ChatMessage) {
  const store = getMockStore();
  const user = store.users.find(u => u.id === msg.user_id);
  return { ...msg, user: user ? { id: user.id, name: user.name, role: user.role, language: user.language } : undefined };
}

export async function listChatMessages(limit = 50): Promise<ChatMessage[]> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    return store.messages.slice(-limit).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(withUser);
  }

  console.log('[CHAT_LIST_QUERY_ORDER]', {
    scope: 'all_messages',
    order: 'created_at_desc',
    limit,
    filters: 'none (entire chat_messages)',
    limit_applies_after_order: true
  });
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*, user:users(id,name,role,language)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ChatMessage[];
}

/** Rows with created_at strictly after `sinceIso` (for delta sync). */
export async function listChatMessagesSince(sinceIso: string, limit = 40): Promise<ChatMessage[]> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    return store.messages
      .filter((m) => m.created_at > sinceIso)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit)
      .map(withUser);
  }

  console.log('[CHAT_LIST_QUERY_ORDER]', {
    scope: 'all_messages_since',
    order: 'created_at_desc',
    since: sinceIso,
    limit
  });
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*, user:users(id,name,role,language)')
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ChatMessage[];
}

export async function listChatMessagesByTicket(ticketId: string, limit = 50): Promise<ChatMessage[]> {
  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    return store.messages
      .filter(m => String(m.ticket_id) === String(ticketId))
      .slice(-limit)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(withUser);
  }

  console.log('[CHAT_LIST_QUERY_ORDER]', {
    scope: 'ticket_messages',
    ticket_id: ticketId,
    order: 'created_at_desc',
    limit
  });
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*, user:users(id,name,role,language)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ChatMessage[];
}

export async function createChatMessage(input: {
  user_id: string;
  message: string;
  message_type?: MessageType;
  priority?: MessagePriority;
  phrase_key?: string | null;
  sender_name?: string | null;
  token_id?: string | null;
  sender_side?: SenderSide | null;
  room_no?: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  ticket_id?: string | null;
  duplicate_ticket_id?: string | null;
  ai_action?: AiAction;
  original_lang?: string;
  translated_text?: ChatMessage['translated_text'];
  back_translated_text?: ChatMessage['back_translated_text'];
}): Promise<ChatMessage> {
  const insertPayload = {
    user_id: input.user_id,
    message: input.message,
    message_type: input.message_type || 'text',
    priority: (input.priority === 'urgent' ? 'urgent' : 'normal') as MessagePriority,
    phrase_key: input.phrase_key || null,
    sender_name: input.sender_name || null,
    token_id: input.token_id || null,
    sender_side: input.sender_side || null,
    room_no: input.room_no || null,
    image_url: input.image_url || null,
    image_storage_path: input.image_storage_path || null,
    original_lang: input.original_lang ?? '',
    translated_text: input.translated_text ?? null,
    back_translated_text: input.back_translated_text ?? null,
    ticket_id: input.ticket_id || null,
    duplicate_ticket_id: input.duplicate_ticket_id || null,
    ai_action: input.ai_action || null
  };
  const row: ChatMessage = {
    id: `m-${Date.now()}`,
    user_id: insertPayload.user_id,
    message: insertPayload.message,
    message_type: insertPayload.message_type,
    priority: insertPayload.priority,
    phrase_key: insertPayload.phrase_key,
    sender_name: insertPayload.sender_name,
    token_id: insertPayload.token_id,
    sender_side: insertPayload.sender_side,
    room_no: insertPayload.room_no,
    image_url: insertPayload.image_url,
    image_storage_path: insertPayload.image_storage_path,
    original_lang: insertPayload.original_lang,
    translated_text: insertPayload.translated_text,
    back_translated_text: insertPayload.back_translated_text,
    ticket_id: insertPayload.ticket_id,
    duplicate_ticket_id: insertPayload.duplicate_ticket_id,
    ai_action: insertPayload.ai_action,
    created_at: new Date().toISOString()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    store.messages.push(row);
    return withUser(row);
  }

  const insertStarted = Date.now();
  console.log('[CHAT_INSERT_START]', {
    has_message: Boolean(insertPayload.message?.trim()),
    has_image: Boolean(insertPayload.image_url),
    message_type: insertPayload.message_type
  });
  console.log('[CHAT_INSERT_SUPABASE_PAYLOAD]', insertPayload);
  let data: any = null;
  let error: any = null;
  ({ data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert(insertPayload)
    .select('id, created_at')
    .single());

  if (error && String(error?.message || '').includes('sender_side')) {
    const { sender_side: _ignored, ...fallbackPayload } = insertPayload as any;
    console.log('[CHAT_INSERT_SUPABASE_PAYLOAD_FALLBACK_NO_SENDER_SIDE]', fallbackPayload);
    ({ data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert(fallbackPayload)
      .select('id, created_at')
      .single());
  }
  if (error && String(error?.message || '').includes('back_translated_text')) {
    const { back_translated_text: _ignored, ...fallbackPayload } = insertPayload as any;
    console.log('[CHAT_INSERT_SUPABASE_PAYLOAD_FALLBACK_NO_BACK_TRANSLATED]', fallbackPayload);
    ({ data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert(fallbackPayload)
      .select('id, created_at')
      .single());
  }
  if (error && String(error?.message || '').includes('priority')) {
    const { priority: _ignored, ...fallbackPayload } = insertPayload as any;
    console.log('[CHAT_INSERT_SUPABASE_PAYLOAD_FALLBACK_NO_PRIORITY]', fallbackPayload);
    ({ data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert(fallbackPayload)
      .select('id, created_at')
      .single());
  }
  if (error && (String(error?.message || '').includes('phrase_key') || String(error?.message || '').includes('sender_name') || String(error?.message || '').includes('token_id'))) {
    const { phrase_key: _p, sender_name: _s, token_id: _t, ...fallbackPayload } = insertPayload as any;
    console.log('[CHAT_INSERT_SUPABASE_PAYLOAD_FALLBACK_NO_STAFF_META]', fallbackPayload);
    ({ data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert(fallbackPayload)
      .select('id, created_at')
      .single());
  }
  console.log('[CHAT_INSERT_RESULT]', {
    ok: !error,
    data_id: data?.id ?? null,
    error_code: (error as any)?.code ?? null,
    error_message: (error as any)?.message ?? null,
    error_details: (error as any)?.details ?? null,
    error_hint: (error as any)?.hint ?? null,
  });
  if (error) throw error;
  console.log('[CHAT_INSERT_DONE]', {
    message_id: data.id,
    duration_ms: Date.now() - insertStarted
  });
  return {
    ...row,
    id: data.id,
    created_at: data.created_at || row.created_at
  };
}

export async function applyTranslationFallback(input: {
  messageId: string;
  message: string;
}): Promise<void> {
  const { messageId, message } = input;
  if (!messageId || !message.trim()) return;

  const started = Date.now();
  console.log('[CHAT_TRANSLATION_FALLBACK_START]', {
    message_id: messageId
  });

  const translation = await detectAndTranslate(message);
  const patch = {
    original_lang: translation.detected_lang || '',
    translated_text: translation.translations || null
  };

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      store.messages[idx] = { ...store.messages[idx], ...patch };
    }
    console.log('[CHAT_TRANSLATION_FALLBACK_DONE]', {
      message_id: messageId,
      duration_ms: Date.now() - started
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update(patch)
    .eq('id', messageId);
  if (error) throw error;

  console.log('[CHAT_TRANSLATION_FALLBACK_DONE]', {
    message_id: messageId,
    duration_ms: Date.now() - started
  });
}

export async function linkMessageToTicket(messageId: string, ticketId: string): Promise<void> {
  if (!messageId || !ticketId) return;

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      store.messages[idx] = { ...store.messages[idx], ticket_id: ticketId };
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update({ ticket_id: ticketId })
    .eq('id', messageId);

  if (error) throw error;
}

export async function setMessageAiAction(messageId: string, aiAction: AiAction): Promise<void> {
  if (!messageId) return;

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      store.messages[idx] = { ...store.messages[idx], ai_action: aiAction };
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update({ ai_action: aiAction })
    .eq('id', messageId);

  if (error) throw error;
}

export async function updateChatMessage(input: {
  messageId: string;
  room_no?: string | null;
  ticket_id?: string | null;
  duplicate_ticket_id?: string | null;
  ai_action?: AiAction;
}): Promise<void> {
  const { messageId, room_no, ticket_id, duplicate_ticket_id, ai_action } = input;
  if (!messageId) return;

  const patch: Partial<ChatMessage> = {};
  if (room_no !== undefined) patch.room_no = room_no;
  if (ticket_id !== undefined) patch.ticket_id = ticket_id;
  if (duplicate_ticket_id !== undefined) patch.duplicate_ticket_id = duplicate_ticket_id;
  if (ai_action !== undefined) patch.ai_action = ai_action;
  if (Object.keys(patch).length === 0) return;

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      store.messages[idx] = { ...store.messages[idx], ...patch };
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update(patch)
    .eq('id', messageId);

  if (!error) return;
  if (
    duplicate_ticket_id !== undefined &&
    String(error.message || '').includes('duplicate_ticket_id')
  ) {
    const { duplicate_ticket_id: _omit, ...retryPatch } = patch as any;
    const { error: retryError } = await supabaseAdmin
      .from('chat_messages')
      .update(retryPatch)
      .eq('id', messageId);
    if (retryError) throw retryError;
    return;
  }
  throw error;
}

/** 추후 제거 가능: soft delete 디버그 (개발에서만 상세 로그) */
const logSoftDeleteDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export async function softDeleteChatMessage(input: { messageId: string; userId: string }): Promise<ChatMessage> {
  const { messageId, userId } = input;
  if (!messageId || !userId) throw new Error('messageId and userId required');

  const deletedAt = new Date().toISOString();
  const patch = { is_deleted: true as const, deleted_at: deletedAt };

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    const idx = store.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx === -1) throw new Error('메시지를 찾을 수 없습니다.');
    if (String(store.messages[idx].user_id) !== String(userId)) throw new Error('권한이 없습니다.');
    // [DEBUG] 추후 제거 가능 — 이미 삭제된 경우 재삭제 무시
    if (store.messages[idx].is_deleted) {
      logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', { messageId, note: 'already_deleted_mock' });
      return withUser(store.messages[idx]);
    }
    store.messages[idx] = { ...store.messages[idx], ...patch };
    const out = withUser(store.messages[idx]);
    // [DEBUG] 추후 제거 가능
    logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', {
      messageId,
      userId,
      mock: true,
      data: out,
      error: null,
      affected_rows: 1
    });
    logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', 'result.data', out);
    logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', 'result.error', null);
    return out;
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('chat_messages')
    .select('id, user_id, is_deleted')
    .eq('id', messageId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error('메시지를 찾을 수 없습니다.');
  if (String(existing.user_id) !== String(userId)) throw new Error('권한이 없습니다.');

  // [DEBUG] 추후 제거 가능 — 이미 삭제된 경우 update 생략(멱등)
  if (existing.is_deleted === true) {
    const { data: full, error: fullErr } = await supabaseAdmin
      .from('chat_messages')
      .select('*, user:users(id,name,role,language)')
      .eq('id', messageId)
      .single();
    if (fullErr) throw fullErr;
    logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', { messageId, note: 'already_deleted', affected_rows: 0 });
    return full as ChatMessage;
  }

  const result = await supabaseAdmin
    .from('chat_messages')
    .update(patch)
    .eq('id', messageId)
    .eq('user_id', userId)
    .select('*, user:users(id,name,role,language)')
    .single();

  const { data, error } = result;
  const affectedRows = error ? 0 : data ? 1 : 0;
  // [DEBUG] 추후 제거 가능
  logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', {
    messageId,
    userId,
    data: data ?? null,
    error: error ?? null,
    affected_rows: affectedRows
  });
  logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', 'result.data', data ?? null);
  logSoftDeleteDebug('[CHAT_SOFT_DELETE_UPDATE]', 'result.error', error ?? null);

  if (error) throw error;
  return data as ChatMessage;
}