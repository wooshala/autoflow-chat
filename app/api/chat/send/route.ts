import { NextRequest } from 'next/server';
import { sendStaffPushAfterMessage } from '@/lib/push/sendStaffPushAfterMessage';
import { buildChatTranslations } from '@/lib/chat/translateMessageForChat';
import { parseSendPriority } from '@/lib/chat/messagePriority';
import { emitLatency } from '@/lib/chat/latencyTrace';
import { waitUntil } from '@vercel/functions';
import { jsonOk, jsonErr } from '@/lib/api/envelope';
import { createChatMessage, listChatMessages, updateChatMessage } from '@/lib/services/chat';
import { assertStaffInviteCanSend } from '@/lib/services/staffInvites';
import { uploadImage } from '@/lib/services/upload';
import { mapIntentIssueTypeToKo, parseMessage } from '@/lib/aiParser';
import { createTicket, findActiveTicketByRoomAndIssue } from '@/lib/services/maintenance';
import { ChatMessage, IssueType } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase';
import { createMessageIntent, updateMessageIntentById } from '@/lib/services/messageIntents';

type AutoTicketSkipReason = 'duplicate' | 'not_ticketable' | 'no_room' | 'ai_error';

const DEBUG_VERBOSE = process.env.CHAT_DEBUG_VERBOSE === '1';
/** Core v0.1: AI/번역 후처리는 기본 OFF. 명시적으로 1일 때만 실행. */
const ENABLE_AI_POSTPROCESS = process.env.CHAT_ENABLE_AI_POSTPROCESS === '1';

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
  console.log('[AUTO_TICKET_PIPELINE_START]', {
    enabled: Boolean(process.env.OPENAI_API_KEY),
    has_openai_key: Boolean(process.env.OPENAI_API_KEY),
    app_mode: process.env.NEXT_PUBLIC_APP_MODE ?? null,
    messageId: saved.id,
  });
  if (ticket_id || !message.trim()) {
    console.log('[AUTO_TICKET_SKIPPED]', { reason: 'empty_message', has_ticket_id: Boolean(ticket_id) });
    return;
  }

  console.log('[AI_ASYNC_PROCESS_START]', { message_id: saved.id });
  console.log('[OPENAI_KEY_EXISTS]', !!process.env.OPENAI_API_KEY);
  if (!process.env.OPENAI_API_KEY) {
    console.log('[AUTO_TICKET_SKIPPED]', { reason: 'missing_openai_key' });
    try { await updateChatMessage({ messageId: saved.id, ai_action: 'skip_ai_error' }); } catch {}
    return;
  }

  try {
    const listStarted = Date.now();
    const recent = await listChatMessages(10);
    console.log('[AI_ASYNC_STEP]', {
      message_id: saved.id,
      step: 'list_recent_messages',
      duration_ms: Date.now() - listStarted
    });
    const recentMessages = recent.map((m) => m.message).filter(Boolean);

    console.log('[AUTO_TICKET_AI_START]', {
      messageId: saved.id,
      text: message,
    });
    console.log('[AUTO_TICKET_FETCH_START]', {
      route: 'openai/responses.create',
      payload: { model: 'gpt-4.1-mini', text_preview: message.slice(0, 80) },
    });
    const parseStarted = Date.now();
    let aiResult: Awaited<ReturnType<typeof parseMessage>>;
    try {
      aiResult = await parseMessage(message, recentMessages);
    } catch (err: any) {
      console.log('[AUTO_TICKET_FETCH_ERROR]', {
        error: err?.message ?? String(err),
      });
      console.error('[AI_PARSE_FATAL]', {
        message_id: saved.id,
        message: err?.message ?? null,
        stack: err?.stack ?? null,
        status: err?.status ?? null,
        code: err?.code ?? null,
        type: err?.type ?? null,
      });
      console.log('[AUTO_TICKET_FETCH_RESULT]', null);
      throw err;
    }
    console.log('[AUTO_TICKET_FETCH_RESULT]', aiResult);
    console.log('[AI_ASYNC_STEP]', {
      message_id: saved.id,
      step: 'ai_parse',
      duration_ms: Date.now() - parseStarted
    });

    const fallbackRoom = extractRoom(message);

    const autoTicketable = aiResult
      ? aiResult.issue_type === 'maintenance' || aiResult.issue_type === 'housekeeping'
      : false;
    const sensitiveReviewOnly = aiResult
      ? aiResult.issue_type === 'frontdesk' || aiResult.issue_type === 'checkout' || aiResult.issue_type === 'payment'
      : false;
    const isMemoOnly = aiResult ? aiResult.issue_type === 'ops_note' : false;
    const isTicketable = autoTicketable || sensitiveReviewOnly;

    console.log('[AI_PARSE_RESULT]', {
      message_id: saved.id,
      ok: !!aiResult,
      room: aiResult?.room ?? null,
      fallback_room: fallbackRoom,
      issue_type: aiResult?.issue_type ?? null,
      summary: aiResult?.summary?.slice(0, 80) ?? null,
      is_new_issue: aiResult?.is_new_issue ?? null,
      confidence: aiResult?.confidence ?? null,
      autoTicketable,
      sensitiveReviewOnly,
      isMemoOnly,
      isTicketable,
    });
    console.log('[AUTO_TICKET_AI_RESULT]', {
      parsed: aiResult,
      should_create: autoTicketable,
      room_no: aiResult?.room ?? fallbackRoom ?? null,
      category: aiResult?.issue_type ?? null,
    });

    if (!aiResult) {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'ai_unavailable' });
      await updateChatMessage({ messageId: saved.id, ai_action: 'skip_ai_error' });
      logAutoTicketSkip(saved.id, 'ai_error', { detail: 'no_result' });
      return;
    }

    const resolvedRoom = aiResult.room || fallbackRoom;
    const summary = aiResult.summary || message.trim();
    const confidence = aiResult.confidence ?? null;

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
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'invalid_room_format', raw_room: aiResult.room, fallback: fallbackRoom });
      await updateChatMessage({ messageId: saved.id, ai_action: 'skip_no_room' });
      return;
    }

    if (sensitiveReviewOnly) {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'sensitive_review_only', issue_type: aiResult.issue_type });
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_review_required' });
      return;
    }

    if (isMemoOnly) {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'memo_only' });
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'note_saved' });
      return;
    }

    if (!autoTicketable) {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'not_ticketable', issue_type: aiResult.issue_type });
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_not_ticketable' });
      return;
    }

    const mappedIssueType = mapIntentIssueTypeToKo(aiResult.issue_type);
    console.log('[TICKET_ISSUE_TYPE_MAPPED]', {
      message_id: saved.id,
      raw_issue_type: aiResult.issue_type,
      mapped: mappedIssueType,
      passes_filter: mappedIssueType === '설비' || mappedIssueType === '청소',
    });

    if (mappedIssueType !== '설비' && mappedIssueType !== '청소') {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'not_ticketable', mapped: mappedIssueType });
      await updateChatMessage({ messageId: saved.id, room_no: resolvedRoom, ai_action: 'skip_not_ticketable' });
      return;
    }

    const active = await findActiveTicketByRoomAndIssue({ room_no: resolvedRoom, issue_type: mappedIssueType as IssueType });
    console.log('[TICKET_DEDUP_CHECK]', {
      message_id: saved.id,
      room_no: resolvedRoom,
      issue_type: mappedIssueType,
      existing_ticket_id: active?.id ?? null,
    });

    if (active?.id) {
      console.log('[AUTO_TICKET_SKIPPED]', { reason: 'duplicate', existing_ticket_id: active.id });
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

    console.log('[AUTO_TICKET_INSERT_START]', {
      payload: {
        room_no: resolvedRoom,
        issue_type: mappedIssueType,
        description: summary.slice(0, 80),
        created_by: user_id,
      },
    });

    let ticket;
    try {
      ticket = await createTicket({
        room_no: resolvedRoom,
        issue_type: mappedIssueType as IssueType,
        description: summary,
        created_by: user_id
      });
      console.log('[AUTO_TICKET_INSERT_RESULT]', {
        data: ticket,
        error: null,
      });
    } catch (err: any) {
      console.log('[AUTO_TICKET_INSERT_RESULT]', {
        data: null,
        error: { message: err?.message ?? String(err), code: err?.code ?? null, hint: err?.hint ?? null },
      });
      console.error('[CREATE_TICKET_FATAL]', {
        message_id: saved.id,
        error: err?.message || String(err),
        code: err?.code ?? null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
      });
      throw err;
    }

    console.log('[CREATE_TICKET_RESULT]', {
      message_id: saved.id,
      ok: !!ticket,
      ticket_id: ticket?.id ?? null,
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
    console.log('[AUTO_TICKET_FINAL]', {
      ok: true,
      created_ticket_id: ticket.id,
      skipped: false,
      reason: null,
    });
  } catch (error: any) {
    console.log('[AUTO_TICKET_PIPELINE_FATAL]', {
      error: String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    console.error('[AUTO_TICKET_ERROR]', {
      message_id: saved.id,
      error: error?.message || String(error),
      code: (error as any)?.code ?? null,
    });
    console.log('[AUTO_TICKET_FINAL]', {
      ok: false,
      created_ticket_id: null,
      skipped: true,
      reason: error?.message ?? 'error',
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
    const aiDoneAt = Date.now();
    console.log('[AI_ASYNC_PROCESS_DONE]', {
      message_id: saved.id,
      duration_ms: aiDoneAt - started
    });
    emitLatency('AI_DONE', {
      message_id: saved.id,
      sender_side: (saved as any)?.sender_side ?? null,
      room: (saved as any)?.room_no ?? null,
      source: (saved as any)?.sender_side === 'pc' ? 'pc' : 'staff',
      has_translation: Boolean((saved as any)?.translated_text),
      // async post-process duration (does NOT block send/response)
      elapsed_ms: aiDoneAt - started,
      ts: aiDoneAt
    });
  }
}

/**
 * Translate AFTER the original message is already inserted + responded. UPDATEs
 * the row so receivers merge the translation into the existing message via
 * realtime UPDATE (no duplicate row). Never blocks the send path.
 */
async function runTranslationPostProcess(input: {
  messageId: string;
  message: string;
  sender_side: 'pc' | 'mobile' | null;
  room_no: string | null;
  client_nonce: string | null;
  source: string;
  requestStarted: number;
}) {
  const { messageId, message, sender_side, room_no, client_nonce, source, requestStarted } = input;
  if (!message.trim()) return;
  const started = Date.now();
  try {
    const translation = await buildChatTranslations(message, sender_side);
    const translationDoneAt = Date.now();
    const has_translation = Boolean(translation.translated_text);
    emitLatency('TRANSLATION_DONE', {
      message_id: messageId,
      client_nonce,
      sender_side,
      room: room_no,
      source,
      has_translation,
      elapsed_ms: translationDoneAt - started,
      since_request_ms: translationDoneAt - requestStarted,
      ts: translationDoneAt
    });
    await updateChatMessage({
      messageId,
      original_lang: translation.original_lang,
      translated_text: translation.translated_text,
      back_translated_text: translation.back_translated_text
    });
    const updatedAt = Date.now();
    console.log('[CHAT_TRANSLATION_SAVED]', {
      message_id: messageId,
      original_lang: translation.original_lang,
      has_translated_ru: Boolean(translation.translated_text?.ru),
      has_translated_ko: Boolean(translation.translated_text?.ko),
      has_back_ko: Boolean(translation.back_translated_text?.ko),
      has_back_ru: Boolean(translation.back_translated_text?.ru)
    });
    emitLatency('TRANSLATION_UPDATED', {
      message_id: messageId,
      client_nonce,
      sender_side,
      room: room_no,
      source,
      has_translation,
      elapsed_ms: updatedAt - started,
      update_ms: updatedAt - translationDoneAt,
      ts: updatedAt
    });
  } catch (e: any) {
    emitLatency('TRANSLATION_FAILED', {
      message_id: messageId,
      client_nonce,
      sender_side,
      room: room_no,
      source,
      has_translation: false,
      elapsed_ms: Date.now() - started,
      error: e?.message ?? String(e),
      ts: Date.now()
    });
    console.error('[CHAT_TRANSLATION_POSTPROCESS_FAILED]', {
      message_id: messageId,
      error: e?.message ?? String(e)
    });
  }
}

export async function POST(req: NextRequest) {
  const requestStarted = Date.now();
  const apiReceivedAt = requestStarted;
  console.log('[CHAT_SEND_START]');
  logSupabaseEnvCtx('[DIAG_SUPABASE_CTX_SEND]');
  try {
    const formData = await req.formData();

    const client_nonce = String(formData.get('client_nonce') || formData.get('client_request_id') || '').trim() || null;
    const client_send_ts_raw = Number(formData.get('client_send_ts'));
    const client_send_ts = Number.isFinite(client_send_ts_raw) && client_send_ts_raw > 0 ? client_send_ts_raw : null;
    if (client_nonce) {
      console.log('[CHAT_SEND_API_RECEIVED]', { client_nonce, ts: apiReceivedAt });
    }

    const ticket_id = String(formData.get('ticket_id') || '') || null;
    const room_no = String(formData.get('room_no') || '') || null;
    const message = String(formData.get('message') || '');
    const user_id = String(formData.get('user_id') || '');
    const actor_name = String(formData.get('actor_name') || '').trim() || null;
    const sender_side_raw = String(formData.get('sender_side') || '').toLowerCase();
    const sender_side = sender_side_raw === 'mobile' ? 'mobile' : sender_side_raw === 'pc' ? 'pc' : null;
    const priority = parseSendPriority(formData.get('priority'));
    const phrase_key = String(formData.get('phrase_key') || '').trim() || null;
    const token_id = String(formData.get('token_id') || '').trim() || null;
    const sender_name =
      String(formData.get('sender_name') || formData.get('actor_name') || '').trim() || null;
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

    console.log('[CHAT_ROUTE_START]', {
      room_no: room_no || null,
      message: message.slice(0, 80) || null,
      user_id: user_id || null,
    });

    console.log('[CHAT_SEND_INPUT]', {
      client_nonce,
      user_id: user_id || null,
      user_id_valid: isUuid(user_id),
      room_no: room_no || null,
      message_preview: message.slice(0, 60) || null,
      priority,
      has_image: image instanceof File,
      ticket_id: ticket_id || null,
    });

    if (!user_id || (!message && !(image instanceof File))) {
      return jsonErr('VALIDATION_ERROR', '전송에 실패했습니다. 관리자 설정이 필요합니다.', 400);
    }
    if (!isUuid(user_id)) {
      console.log('[CHAT_SEND_INVALID_USER_ID]', { user_id });
      return jsonErr('INVALID_USER_ID', '전송에 실패했습니다. 관리자 설정이 필요합니다.', 400);
    }

    const inviteGuard = await assertStaffInviteCanSend(token_id);
    if (!inviteGuard.ok) {
      console.log('[CHAT_SEND_INVITE_REVOKED]', { token_id, reason: inviteGuard.reason });
      return jsonErr(
        'INVITE_REVOKED',
        '채팅방에서보내졌습니다. 관리자에게 문의하세요.',
        403
      );
    }

    const latSource = sender_side === 'pc' ? 'pc' : 'staff';
    // ── Latency fix: insert the ORIGINAL message immediately (NO translation) so
    // the realtime INSERT reaches the receiver right away. Translation (two
    // sequential OpenAI calls, ~2-4s) is moved to an async post-process that
    // UPDATEs the row; receivers merge it into the same message via realtime
    // UPDATE (mergeChatMessageRow). This unblocks both the API response and the
    // receiver's realtime arrival.
    const insertStarted = Date.now();
    const saved = await createChatMessage({
      ticket_id,
      room_no,
      message: message || '',
      user_id,
      sender_side,
      priority,
      phrase_key,
      sender_name,
      token_id,
      message_type: image instanceof File ? 'image' : 'text',
      image_url: image_url || null,
      image_storage_path: image_storage_path || null,
      original_lang: '',
      translated_text: null,
      back_translated_text: null
    });
    const has_translation = false; // translation arrives later via async UPDATE
    const dbInsertedAt = Date.now();
    console.log('[CHAT_SEND_DB_INSERTED]', {
      client_nonce,
      message_id: saved.id,
      ts: dbInsertedAt,
      db_insert_ms: dbInsertedAt - insertStarted
    });
    emitLatency('DB_INSERTED', {
      message_id: saved.id,
      client_nonce,
      sender_side,
      room: room_no,
      source: latSource,
      has_translation,
      // server-local cumulative from request arrival (no longer includes translation)
      elapsed_ms: dbInsertedAt - requestStarted,
      db_insert_ms: dbInsertedAt - insertStarted,
      // cross-machine cumulative from the user's click (skew caveat)
      since_click_ms: client_send_ts ? dbInsertedAt - client_send_ts : null,
      ts: dbInsertedAt
    });

    // Async translation (non-blocking): UPDATEs the row after response; receivers
    // merge it into the same message via realtime UPDATE. Does NOT block send.
    if (message.trim()) {
      emitLatency('TRANSLATION_QUEUED', {
        message_id: saved.id,
        client_nonce,
        sender_side,
        room: room_no,
        source: latSource,
        has_translation: false,
        elapsed_ms: Date.now() - requestStarted,
        ts: Date.now()
      });
      // waitUntil keeps the serverless function alive until translation finishes
      // (AFTER the response is sent) so the UPDATE reliably lands on Vercel.
      waitUntil(
        runTranslationPostProcess({
          messageId: saved.id,
          message,
          sender_side,
          room_no,
          client_nonce,
          source: latSource,
          requestStarted
        }).catch((e: any) => {
          console.error('[CHAT_TRANSLATION_POSTPROCESS_FATAL]', {
            message_id: saved.id,
            error: e?.message ?? String(e)
          });
        })
      );
    }

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

    // Core v0.1: skip heavy diagnostics before response (target <500ms).
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

    void sendStaffPushAfterMessage(saved).catch((e: unknown) => {
      console.log('[STAFF_FCM_ENQUEUE_FAILED]', {
        message_id: saved.id,
        error: e instanceof Error ? e.message : String(e)
      });
    });

    console.log('[CHAT_AFTER_SEND]', {
      messageId: saved.id,
      text: message,
    });

    // Core v0.1: respond immediately after DB insert. AI ticket pipeline must not block send.
    if (ENABLE_AI_POSTPROCESS) {
      void runAiPostProcess({
        saved,
        user_id,
        ticket_id,
        message
      }).catch((e: any) => {
        console.log('[AUTO_TICKET_PIPELINE_FATAL]', {
          error: String(e),
          stack: e instanceof Error ? e.stack : null,
        });
      });
    } else {
      console.log('[CHAT_AI_POSTPROCESS_SKIPPED]', {
        reason: 'core_v0.1_disabled',
        message_id: saved.id,
        hint: 'Set CHAT_ENABLE_AI_POSTPROCESS=1 to re-enable'
      });
    }

    const apiRespondedAt = Date.now();
    console.log('[CHAT_SEND_API_RESPONDED]', {
      client_nonce,
      message_id: saved.id,
      elapsed_ms: apiRespondedAt - requestStarted,
      ts: apiRespondedAt
    });
    emitLatency('API_RESPONDED', {
      message_id: saved.id,
      client_nonce,
      sender_side,
      room: room_no,
      source: latSource,
      has_translation,
      // total server processing time (insert + bookkeeping; translation is async now)
      elapsed_ms: apiRespondedAt - requestStarted,
      since_click_ms: client_send_ts ? apiRespondedAt - client_send_ts : null,
      ts: apiRespondedAt
    });
    console.log('[CHAT_SEND_RESPONSE_RETURNED]', {
      message_id: saved.id,
      api_total_ms: apiRespondedAt - requestStarted
    });
    const responseData = {
      message: saved,
      ...(client_nonce ? { client_nonce } : {})
    };
    const responsePayload = { ok: true as const, data: responseData };
    console.log('[CHAT_SEND_RESPONSE_BODY]', JSON.stringify(responsePayload, null, 2));
    console.log('[CHAT_SEND_RESPONSE_SHAPE]', {
      ok: responsePayload.ok,
      hasData: responsePayload.data != null,
      dataKeys: Object.keys(responsePayload.data),
      nestedMessageId: saved?.id ?? null,
      nestedMessageHasId: Boolean(saved?.id),
      client_nonce: client_nonce ?? null
    });
    return jsonOk(responseData);
  } catch (error: any) {
    console.error('[CHAT_SEND_ERROR]', error);
    console.error('[CHAT_SEND_ERROR]', {
      error: error?.message || String(error)
    });
    const message = error?.message || '메시지 저장 실패';
    return jsonErr('CHAT_SEND_FAILED', message, 500);
  }
}