import { NextRequest } from 'next/server';
import { jsonOk, jsonErr } from '@/lib/api/envelope';
import { applyTranslationFallback, createChatMessage, listChatMessages, updateChatMessage } from '@/lib/services/chat';
import { uploadImage } from '@/lib/services/upload';
import { mapIntentIssueTypeToKo, parseMessage } from '@/lib/aiParser';
import { createTicket, findActiveTicketByRoomAndIssue } from '@/lib/services/maintenance';
import { ChatMessage, IssueType } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase';
import { createMessageIntent, updateMessageIntentById } from '@/lib/services/messageIntents';

type AutoTicketSkipReason = 'duplicate' | 'not_ticketable' | 'no_room' | 'ai_error';

const DEBUG_VERBOSE = process.env.CHAT_DEBUG_VERBOSE === '1';

function isUuid(v: string) {
  // RFC4122-ish: 8-4-4-4-12 hex
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function urlHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function getAdminChosenUrlHost(): string | null {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const primaryUrl = process.env.SUPABASE_PRIMARY_URL || null;
  const chosenAdminUrl = primaryUrl || publicUrl;
  return urlHost(chosenAdminUrl);
}

function logSupabaseEnvCtx(tag: string) {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const primaryUrl = process.env.SUPABASE_PRIMARY_URL || null;
  const chosenAdminUrl = primaryUrl || publicUrl;
  console.log(tag, {
    public_url_host: urlHost(publicUrl),
    primary_url_host: urlHost(primaryUrl),
    admin_chosen_url_host: urlHost(chosenAdminUrl),
    has_primary_url_env: Boolean(primaryUrl),
    has_service_role_key_env: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    has_anon_key_env: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  });
}

function extractRoom(message: string) {
  const match = message.match(/\d{3,4}/);
  return match ? match[0] : null;
}

function logAutoTicketSkip(messageId: string, reason: AutoTicketSkipReason, detail?: Record<string, unknown>) {
  console.log('[AUTO_TICKET_SKIP]', {
    message_id: messageId,
    reason,
    ...(detail || {})
  });
}

async function runAiPostProcess(input: {
  saved: ChatMessage;
  user_id: string;
  ticket_id: string | null;
  message: string;
}) {
  const started = Date.now();
  const { saved, user_id, ticket_id, message } = input;
  if (ticket_id || !message.trim()) return;

  console.log('[AI_ASYNC_PROCESS_START]', {
    message_id: saved.id
  });

  try {
    const listStarted = Date.now();
    const recent = await listChatMessages(10);
    console.log('[AI_ASYNC_STEP]', {
      message_id: saved.id,
      step: 'list_recent_messages',
      duration_ms: Date.now() - listStarted
    });
    const recentMessages = recent.map((m) => m.message).filter(Boolean);

    const parseStarted = Date.now();
    const aiResult = await parseMessage(message, recentMessages);
    console.log('[AI_ASYNC_STEP]', {
      message_id: saved.id,
      step: 'ai_parse',
      duration_ms: Date.now() - parseStarted
    });

    const fallbackRoom = extractRoom(message);

    if (!aiResult) {
      await updateChatMessage({ messageId: saved.id, ai_action: 'skip_ai_error' });
      logAutoTicketSkip(saved.id, 'ai_error', { detail: 'no_result' });
      return;
    }

    const resolvedRoom = aiResult.room || fallbackRoom;
    const summary = aiResult.summary || message.trim();
    const confidence = aiResult.confidence ?? null;

    const sensitiveReviewOnly =
      aiResult.issue_type === 'frontdesk' || aiResult.issue_type === 'checkout' || aiResult.issue_type === 'payment';
    const isMemoOnly = aiResult.issue_type === 'ops_note';
    const autoTicketable = aiResult.issue_type === 'maintenance' || aiResult.issue_type === 'housekeeping';
    const isTicketable = autoTicketable || sensitiveReviewOnly;

    let intentId: string | null = null;
    try {
      const intent = await createMessageIntent({
        message_id: saved.id,
        room_no: resolvedRoom,
        issue_type: aiResult.issue_type,
        summary,
        is_ticketable: isTicketable,
        is_new_issue: Boolean(aiResult.is_new_issue),
        matched_ticket_id: null,
        confidence,
        raw_ai_result: aiResult
      });
      intentId = intent?.id || null;
    } catch (e: any) {
      console.error('[MESSAGE_INTENT_SAVE_ERROR]', { message_id: saved.id, error: e?.message || String(e) });
    }

    if (!resolvedRoom) {
      await updateChatMessage({ messageId: saved.id, ai_action: 'skip_no_room' });
      return;
    }

    if (sensitiveReviewOnly) {
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_review_required' });
      return;
    }

    if (isMemoOnly) {
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'note_saved' });
      return;
    }

    if (!autoTicketable) {
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_not_ticketable' });
      return;
    }

    const mappedIssueType = mapIntentIssueTypeToKo(aiResult.issue_type);
    if (mappedIssueType !== '설비' && mappedIssueType !== '청소') {
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_not_ticketable' });
      return;
    }

    const active = await findActiveTicketByRoomAndIssue({ room_no: resolvedRoom, issue_type: mappedIssueType as IssueType });
    if (active?.id) {
      await updateChatMessage({
        messageId: saved.id,
        room_no: resolvedRoom,
        ticket_id: active.id,
        ai_action: 'ticket_linked_existing'
      });
      if (intentId) {
        try {
          await updateMessageIntentById(intentId, { matched_ticket_id: active.id });
        } catch {}
      }
      return;
    }

    const ticket = await createTicket({
      room_no: resolvedRoom,
      issue_type: mappedIssueType as IssueType,
      description: summary,
      created_by: user_id
    });
    await updateChatMessage({
      messageId: saved.id,
      ticket_id: ticket.id,
      room_no: resolvedRoom,
      ai_action: 'ticket_created'
    });
    if (intentId) {
      try {
        await updateMessageIntentById(intentId, { matched_ticket_id: ticket.id });
      } catch {}
    }
  } catch (error: any) {
    console.error('[AUTO_TICKET_ERROR]', {
      message_id: saved.id,
      error: error?.message || String(error)
    });
    try {
      const updateStarted = Date.now();
      await updateChatMessage({ messageId: saved.id, ai_action: 'skip_ai_error' });
      console.log('[AI_ASYNC_STEP]', {
        message_id: saved.id,
        step: 'message_update',
        duration_ms: Date.now() - updateStarted
      });
    } catch {}
    logAutoTicketSkip(saved.id, 'ai_error', {
      error: error?.message || String(error)
    });
  } finally {
    console.log('[AI_ASYNC_PROCESS_DONE]', {
      message_id: saved.id,
      duration_ms: Date.now() - started
    });
  }
}

export async function POST(req: NextRequest) {
  const requestStarted = Date.now();
  console.log('[CHAT_SEND_START]');
  logSupabaseEnvCtx('[DIAG_SUPABASE_CTX_SEND]');
  try {
    const formData = await req.formData();

    const ticket_id = String(formData.get('ticket_id') || '') || null;
    const room_no = String(formData.get('room_no') || '') || null;
    const message = String(formData.get('message') || '');
    const user_id = String(formData.get('user_id') || '');
    const actor_name = String(formData.get('actor_name') || '').trim() || null;
    const sender_side_raw = String(formData.get('sender_side') || '').toLowerCase();
    const sender_side = sender_side_raw === 'mobile' ? 'mobile' : sender_side_raw === 'pc' ? 'pc' : null;
    if (actor_name) {
      console.log('[CHAT_SEND_ACTOR_NAME]', { actor_name, user_id: user_id || null });
    }
    const image = formData.get('image');
    console.log('[CHAT_FILE_RECEIVED]', {
      exists: image instanceof File,
      name: image instanceof File ? image.name : null,
      size: image instanceof File ? image.size : null,
      type: image instanceof File ? image.type : null
    });

    let image_url: string | null = null;
    let image_storage_path: string | null = null;

    // 파일이 있으면 업로드 (단일 업로드 플로우)
    if (image instanceof File) {
      if (!image.type.startsWith('image/')) {
        return jsonErr('INVALID_IMAGE_TYPE', '이미지 파일만 업로드할 수 있습니다.', 400);
      }
      if (image.size > 10 * 1024 * 1024) {
        return jsonErr('FILE_TOO_LARGE', '10MB 이하만 가능합니다.', 400);
      }

      try {
        console.log('[CHAT_FILE_UPLOAD_START]', {
          image_name: image.name,
          image_size: image.size,
          image_type: image.type
        });
        const uploaded = await uploadImage(image);
        image_url = uploaded.image_url;
        image_storage_path = uploaded.storage_path;
        console.log('[CHAT_FILE_UPLOAD_OK]', {
          image_url,
          image_storage_path
        });
      } catch (uploadError: any) {
        console.error('[CHAT_FILE_UPLOAD_ERROR]', {
          error: uploadError?.message || String(uploadError)
        });
        throw uploadError;
      }
    }

    if (!user_id || (!message && !(image instanceof File))) {
      return jsonErr('VALIDATION_ERROR', '전송에 실패했습니다. 관리자 설정이 필요합니다.', 400);
    }
    if (!isUuid(user_id)) {
      console.log('[CHAT_SEND_INVALID_USER_ID]', { user_id });
      return jsonErr('INVALID_USER_ID', '전송에 실패했습니다. 관리자 설정이 필요합니다.', 400);
    }

    const insertStarted = Date.now();
    const saved = await createChatMessage({
      ticket_id,
      room_no,
      message: message || '',
      user_id,
      sender_side,
      message_type: image instanceof File ? 'image' : 'text',
      image_url: image_url || null,
      image_storage_path: image_storage_path || null
    });
    if (DEBUG_VERBOSE) {
      console.log('[CHAT_MESSAGE_INSERTED]', {
        id: saved.id,
        created_at: saved.created_at,
        room_no: (saved as any)?.room_no ?? null,
        ticket_id: (saved as any)?.ticket_id ?? null,
        sender_side: (saved as any)?.sender_side ?? null,
        message_type: (saved as any)?.message_type ?? null,
        text: String((saved as any)?.message ?? '').slice(0, 60)
      });
    }

    // DB time probe (diagnostic only)
    try {
      const { data, error } = await supabaseAdmin!.rpc('diag_db_now');
      console.log('[DB_NOW_SEND]', {
        db_now: data ?? null,
        admin_chosen_url_host: getAdminChosenUrlHost(),
        message_id: saved.id,
        ok: !error,
        error: error ? (error as any).message || String(error) : null
      });
    } catch (e: any) {
      console.log('[DB_NOW_SEND]', {
        db_now: null,
        admin_chosen_url_host: getAdminChosenUrlHost(),
        message_id: saved.id,
        ok: false,
        error: e?.message || String(e)
      });
    }
    console.log('[SEND_ROW_PERSISTED_KEYS]', {
      id: saved.id,
      created_at: saved.created_at,
      user_id: saved.user_id,
      room_no: saved.room_no ?? null,
      ticket_id: saved.ticket_id ?? null,
      message_type: saved.message_type,
      sender_side: saved.sender_side ?? null,
      duplicate_ticket_id: saved.duplicate_ticket_id ?? null,
      ai_action: saved.ai_action ?? null,
      note: 'no conversation_id in schema; scope is global chat_messages + room_no'
    });

    // Diagnostics only: allow list route to probe the exact id next.
    (globalThis as any).__autoflowLastSentChatMessage = {
      id: saved.id,
      created_at: saved.created_at,
      at_ms: Date.now()
    };
    console.log('[DIAG_LAST_SENT_MESSAGE_SET]', {
      ok: true,
      message_id: saved.id,
      created_at: saved.created_at
    });

    // Temporary defense: keep a small in-memory buffer of recently saved messages (server-side source of truth)
    // so list responses can be patched when list reads are stale.
    try {
      const key = '__autoflowRecentSavedChatMessages';
      const existing = (globalThis as any)[key] as { at_ms: number; message: any }[] | undefined;
      const next = Array.isArray(existing) ? [...existing] : [];
      next.push({ at_ms: Date.now(), message: saved });
      // keep last 20
      (globalThis as any)[key] = next.slice(-20);
      console.log('[DIAG_RECENT_SAVED_BUFFER]', { ok: true, size: (globalThis as any)[key].length });
    } catch (e: any) {
      console.log('[DIAG_RECENT_SAVED_BUFFER]', { ok: false, error: e?.message || String(e) });
    }
    console.log('[CHAT_SAVE_ONLY_DONE]', {
      message_id: saved.id,
      db_insert_ms: Date.now() - insertStarted
    });
    if (saved.message_type === 'image') {
      console.log('[CHAT_MESSAGE_IMAGE_SAVED]', {
        message_id: saved.id,
        image_url: saved.image_url,
        image_storage_path: saved.image_storage_path
      });
    }
    console.log('[CHAT_SAVED]', {
      message_id: saved.id,
      user_id,
      room_no: saved.room_no,
      has_ticket_id: Boolean(saved.ticket_id),
      has_message: Boolean(message.trim())
    });

    void runAiPostProcess({
      saved,
      user_id,
      ticket_id,
      message
    });
    void applyTranslationFallback({
      messageId: saved.id,
      message
    }).catch((error: any) => {
      console.error('[CHAT_TRANSLATION_FALLBACK_ERROR]', {
        message_id: saved.id,
        error: error?.message || String(error)
      });
    });

    console.log('[CHAT_SEND_RESPONSE_RETURNED]', {
      message_id: saved.id,
      api_total_ms: Date.now() - requestStarted
    });
    const responsePayload = { ok: true as const, data: { message: saved } };
    console.log('[CHAT_SEND_RESPONSE_BODY]', JSON.stringify(responsePayload, null, 2));
    console.log('[CHAT_SEND_RESPONSE_SHAPE]', {
      ok: responsePayload.ok,
      hasData: responsePayload.data != null,
      dataKeys: Object.keys(responsePayload.data),
      nestedMessageId: saved?.id ?? null,
      nestedMessageHasId: Boolean(saved?.id)
    });
    return jsonOk({ message: saved });
  } catch (error: any) {
    console.error('[CHAT_SEND_ERROR]', error);
    console.error('[CHAT_SEND_ERROR]', {
      error: error?.message || String(error)
    });
    const message = error?.message || '메시지 저장 실패';
    return jsonErr('CHAT_SEND_FAILED', message, 500);
  }
}