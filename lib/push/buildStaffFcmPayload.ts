import type { ChatMessage } from '@/lib/types';
import type { StaffFcmDataPayload, StaffFcmNotificationPayload } from '@/lib/push/staffFcmTypes';

function pickRuText(message: ChatMessage): string {
  const tt = message.translated_text;
  if (tt && typeof tt === 'object' && typeof (tt as Record<string, unknown>).ru === 'string') {
    return String((tt as Record<string, string>).ru).trim();
  }
  return '';
}

function pickOriginalText(message: ChatMessage): string {
  return String(message.message || '').trim();
}

function isUrgent(message: ChatMessage): boolean {
  const p = String(message.priority || '').toLowerCase();
  return p === 'urgent' || p === 'high';
}

/** Notification body: ru preferred, original fallback (P0 — scenario E). */
export function resolveStaffNotifyBody(message: ChatMessage): string {
  const ru = pickRuText(message);
  const original = pickOriginalText(message);
  return ru || original;
}

export function buildStaffFcmDataPayload(message: ChatMessage): StaffFcmDataPayload {
  const original = pickOriginalText(message);
  const ru = pickRuText(message);
  return {
    room_no: String(message.room_no || '').trim(),
    message_id: String(message.id),
    original_text: original,
    translated_text_ru: ru,
    tts_lang: 'ru',
    urgency: isUrgent(message) ? 'urgent' : 'normal',
    auto_tts_default: 'false'
  };
}

export function buildStaffFcmNotificationPayload(message: ChatMessage): StaffFcmNotificationPayload {
  const body = resolveStaffNotifyBody(message);
  const room = String(message.room_no || '').trim();
  const urgent = isUrgent(message);
  const title = urgent ? `🚨 ${room ? `${room}호` : '긴급'}` : room ? `${room}호` : 'AutoFlow';
  return { title, body: body.slice(0, 200) };
}
