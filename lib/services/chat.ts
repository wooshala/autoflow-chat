import { getMockStore } from '@/lib/mock';
import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { ChatMessage, MessageType } from '@/lib/types';
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

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*, user:users(id,name,role,language)')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as ChatMessage[];
}

export async function createChatMessage(input: {
  user_id: string;
  message: string;
  message_type?: MessageType;
  room_no?: string | null;
  image_url?: string | null;
  image_storage_path?: string | null;
  ticket_id?: string | null;
}): Promise<ChatMessage> {
  const translation = await detectAndTranslate(input.message);
  const row: ChatMessage = {
    id: `m-${Date.now()}`,
    user_id: input.user_id,
    message: input.message,
    message_type: input.message_type || 'text',
    room_no: input.room_no || null,
    image_url: input.image_url || null,
    image_storage_path: input.image_storage_path || null,
    original_lang: translation.detected_lang,
    translated_text: translation.translations,
    ticket_id: input.ticket_id || null,
    created_at: new Date().toISOString()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const store = getMockStore();
    store.messages.push(row);
    return withUser(row);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      user_id: row.user_id,
      message: row.message,
      message_type: row.message_type,
      room_no: row.room_no,
      image_url: row.image_url,
      image_storage_path: row.image_storage_path,
      original_lang: row.original_lang,
      translated_text: row.translated_text,
      ticket_id: row.ticket_id
    })
    .select('*, user:users(id,name,role,language)')
    .single();

  if (error) throw error;
  return data as ChatMessage;
}
