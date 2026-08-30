// Phase 1G.4/1H.3/1H.5/1H.7 — guest message + channel-language API (one route, additive).
//   GET ?meta=1 → { ok, preferred_language, language_source }
//   GET         → { ok, messages, preferred_language, language_source }  (session-scoped internally)
//   POST        → send a message into the ACTIVE session (guest: LLM detect+translate→ko; staff: ko→preferred)
//   PUT { preferred_language } → set the GUEST SESSION's language (Phase 1H.7; not the channel)
//
// IMAGE-CHAT-01A-SIMPLIFY — POST accepts:
//   application/json        → legacy text-only path (unchanged)
//   multipart/form-data     → guest image path (text + optional image)

import { NextRequest, NextResponse } from 'next/server';

import {
  appendGuestMessageWithAttachments,
  appendMessage,
  getActiveSession,
  getSessionById,
  listMessagesBySession,
  setGuestSessionLanguage,
  type GuestSession,
} from '@/lib/guest-spike/store';
import { detectAndTranslateToKorean, openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { isGuestLang, resolveOriginalLang, type GuestLang } from '@/lib/guest-spike/languages';
import { channelCookieName } from '@/lib/guest-spike/sessionCookie';
import { requireStaff } from '@/lib/guest-spike/staffAuth';
import {
  imageOnlyOriginalLang,
  validateGuestMessageContent,
  type GuestAttachmentInsert,
} from '@/lib/guest-spike/guestMessagePost';
import { validateGuestAttachmentFile } from '@/lib/guest-spike/guestAttachmentValidation';
import {
  deleteGuestAttachmentObjectBestEffort,
  uploadGuestAttachmentObject,
} from '@/lib/guest-spike/guestAttachmentStorage';
import type { CustomerLang } from '@/lib/customer-service/translationLangs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  if (msg.startsWith('STORAGE_UPLOAD_FAILED')) {
    return NextResponse.json({ ok: false, error: 'STORAGE_UPLOAD_FAILED' }, { status: 502 });
  }
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

type Resolved =
  | { ok: true; session: GuestSession | null }
  | { ok: false; kind: 'unauthorized' | 'closed' | 'occupied' };

async function resolveSession(req: NextRequest, channelKey: string): Promise<Resolved> {
  if (req.nextUrl.searchParams.get('as') === 'staff') {
    const staff = await requireStaff(req);
    if (!staff) return { ok: false, kind: 'unauthorized' };
    return { ok: true, session: await getActiveSession(channelKey) };
  }
  const sid = req.cookies.get(channelCookieName(channelKey))?.value;
  if (sid) {
    const s = await getSessionById(sid);
    if (s && s.channel_key === channelKey) {
      if (s.status === 'open') return { ok: true, session: s };
      return { ok: false, kind: 'closed' };
    }
  }
  const active = await getActiveSession(channelKey);
  return active ? { ok: false, kind: 'occupied' } : { ok: true, session: null };
}

function sessionLanguage(session: GuestSession | null): { preferred: GuestLang | null; source: string | null } {
  const preferred = session && isGuestLang(session.language_code) ? session.language_code : null;
  return { preferred, source: session?.language_source ?? null };
}

async function resolvePostContext(req: NextRequest, channelKey: string) {
  const r = await resolveSession(req, channelKey);
  if (!r.ok) {
    if (r.kind === 'unauthorized') return { ok: false as const, response: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }) };
    if (r.kind === 'closed') return { ok: false as const, response: NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 }) };
    return { ok: false as const, response: NextResponse.json({ ok: false, error: 'SESSION_OCCUPIED' }, { status: 409 }) };
  }
  if (!r.session) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 }) };
  }
  const sender = req.nextUrl.searchParams.get('as') === 'staff' ? ('staff' as const) : ('guest' as const);
  let staffUserId: string | null = null;
  if (sender === 'staff') {
    const staff = await requireStaff(req);
    if (!staff) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 }) };
    staffUserId = staff.userId;
  }
  return { ok: true as const, session: r.session, sender, staffUserId };
}

async function translateMessage(input: {
  channelKey: string;
  sender: 'guest' | 'staff';
  text: string;
  hasImage: boolean;
  preferred: GuestLang | null;
}): Promise<{ originalLang: string; translated: Record<string, string> } | { error: 'LANGUAGE_NOT_SELECTED' }> {
  const { channelKey, sender, text, hasImage, preferred } = input;
  const isImageOnly = hasImage && text.length === 0;
  let originalLang: string;
  const translated: Record<string, string> = {};

  if (sender === 'guest') {
    if (isImageOnly) {
      originalLang = imageOnlyOriginalLang(preferred);
    } else {
      const { detected, ko } = await detectAndTranslateToKorean(text);
      const resolved = resolveOriginalLang({ llmDetected: detected, text, preferred });
      originalLang = resolved.lang;
      if (resolved.usedFallback) {
        console.warn('[GUEST_LANGUAGE_DETECTION_FALLBACK]', {
          channelKey,
          preferredLanguage: preferred,
          reason: 'llm_and_heuristic_null',
        });
      }
      if (ko) translated.ko = ko;
      else {
        console.warn('[GUEST_TRANSLATION_FAILED]', {
          channelKey,
          sender,
          originalLang,
          targetLang: 'ko',
          reason: 'no_ko_result',
        });
      }
    }
  } else {
    if (!preferred) return { error: 'LANGUAGE_NOT_SELECTED' };
    originalLang = 'ko';
    const to = preferred;
    if (to === 'ko') translated[to] = text;
    else {
      try {
        const out = await openAiCustomerTranslator.translate(text, 'ko' as CustomerLang, to as CustomerLang);
        if (out) translated[to] = out;
        else console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: to, reason: 'empty_result' });
      } catch (e) {
        console.warn('[GUEST_TRANSLATION_FAILED]', {
          channelKey,
          sender,
          originalLang,
          targetLang: to,
          errorName: e instanceof Error ? e.name : 'unknown',
          errorMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { originalLang, translated };
}

export async function GET(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  const meta = req.nextUrl.searchParams.get('meta') === '1';
  const isStaff = req.nextUrl.searchParams.get('as') === 'staff';
  try {
    const r = await resolveSession(req, channelKey);
    if (!r.ok) {
      if (r.kind === 'unauthorized') return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      return meta
        ? NextResponse.json({ ok: true, preferred_language: null, language_source: null })
        : NextResponse.json({ ok: true, messages: [], preferred_language: null, language_source: null });
    }
    const { preferred, source } = sessionLanguage(r.session);
    const staffState = isStaff ? { session_status: (r.session ? 'open' : 'none') as 'open' | 'none' } : {};
    if (meta) return NextResponse.json({ ok: true, ...staffState, preferred_language: preferred, language_source: source });
    const messages = r.session
      ? await listMessagesBySession(r.session.id, { skipDeletedAttachments: true })
      : [];
    return NextResponse.json({ ok: true, ...staffState, messages, preferred_language: preferred, language_source: source });
  } catch (e) {
    return dbError(e);
  }
}

async function postJsonMessage(
  req: NextRequest,
  channelKey: string,
  body: { text?: unknown; sender?: unknown },
) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  let ctx;
  try {
    ctx = await resolvePostContext(req, channelKey);
  } catch (e) {
    return dbError(e);
  }
  if (!ctx.ok) return ctx.response;

  const { session, sender, staffUserId } = ctx;
  const contentCheck = validateGuestMessageContent({ trimmedText: text, hasImage: false, sender });
  if (!contentCheck.ok) {
    if (contentCheck.error === 'STAFF_IMAGE_FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'EMPTY' }, { status: 400 });
  }

  const { preferred } = sessionLanguage(session);
  const translation = await translateMessage({ channelKey, sender, text, hasImage: false, preferred });
  if ('error' in translation) {
    return NextResponse.json({ ok: false, error: translation.error }, { status: 409 });
  }

  try {
    const message = await appendMessage({
      channelKey,
      sessionId: session.id,
      sender,
      original: text,
      original_lang: translation.originalLang,
      translated: translation.translated,
      staff_user_id: staffUserId,
    });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

async function postMultipartMessage(req: NextRequest, channelKey: string) {
  let ctx;
  try {
    ctx = await resolvePostContext(req, channelKey);
  } catch (e) {
    return dbError(e);
  }
  if (!ctx.ok) return ctx.response;

  const { session, sender, staffUserId } = ctx;

  if (sender === 'staff') {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_FORM' }, { status: 400 });
  }

  const textRaw = form.get('text');
  const text = typeof textRaw === 'string' ? textRaw.trim() : '';
  const imageField = form.get('image');
  const hasImage = imageField instanceof File && imageField.size > 0;

  const contentCheck = validateGuestMessageContent({ trimmedText: text, hasImage, sender });
  if (!contentCheck.ok) {
    return NextResponse.json({ ok: false, error: 'EMPTY' }, { status: 400 });
  }

  let attachmentInserts: GuestAttachmentInsert[] = [];
  let uploadedStoragePath: string | null = null;

  if (hasImage) {
    const file = imageField as File;
    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = validateGuestAttachmentFile({
      bytes,
      declaredMime: file.type || 'application/octet-stream',
      declaredSize: file.size,
    });
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    }

    try {
      const { storagePath } = await uploadGuestAttachmentObject({
        sessionId: session.id,
        mime: validated.mime,
        bytes,
      });
      uploadedStoragePath = storagePath;
      attachmentInserts = [
        {
          storage_path: storagePath,
          mime_type: validated.mime,
          size_bytes: bytes.length,
          sort_order: 0,
        },
      ];
    } catch (e) {
      return dbError(e);
    }
  }

  const { preferred } = sessionLanguage(session);
  const translation = await translateMessage({ channelKey, sender, text, hasImage, preferred });
  if ('error' in translation) {
    if (uploadedStoragePath) await deleteGuestAttachmentObjectBestEffort(uploadedStoragePath);
    return NextResponse.json({ ok: false, error: translation.error }, { status: 409 });
  }

  try {
    if (attachmentInserts.length === 0) {
      const message = await appendMessage({
        channelKey,
        sessionId: session.id,
        sender,
        original: text,
        original_lang: translation.originalLang,
        translated: translation.translated,
        staff_user_id: staffUserId,
      });
      return NextResponse.json({ ok: true, message }, { status: 201 });
    }

    const message = await appendGuestMessageWithAttachments({
      channelKey,
      sessionId: session.id,
      sender,
      original: text,
      original_lang: translation.originalLang,
      translated: translation.translated,
      staff_user_id: staffUserId,
      attachments: attachmentInserts,
    });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    if (uploadedStoragePath) await deleteGuestAttachmentObjectBestEffort(uploadedStoragePath);
    return dbError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    return postMultipartMessage(req, channelKey);
  }

  let body: { text?: unknown; sender?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }

  return postJsonMessage(req, channelKey, body);
}

export async function PUT(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  let body: { preferred_language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }
  if (!isGuestLang(body.preferred_language)) {
    return NextResponse.json({ ok: false, error: 'INVALID_LANGUAGE' }, { status: 400 });
  }
  const lang = body.preferred_language;
  try {
    const r = await resolveSession(req, channelKey);
    if (!r.ok) {
      if (r.kind === 'unauthorized') return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (r.kind === 'closed') return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 });
      return NextResponse.json({ ok: false, error: 'SESSION_OCCUPIED' }, { status: 409 });
    }
    if (!r.session) return NextResponse.json({ ok: false, error: 'NO_ACTIVE_SESSION' }, { status: 409 });
    const updated = await setGuestSessionLanguage(r.session.id, lang, 'user_selected');
    if (!updated) return NextResponse.json({ ok: false, error: 'SESSION_CLOSED' }, { status: 409 });
    return NextResponse.json({ ok: true, preferred_language: updated.language_code, language_source: updated.language_source });
  } catch (e) {
    return dbError(e);
  }
}
