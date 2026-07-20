// Phase 1G.4/1H.3 — guest message API. Persists to Supabase (guest_chat_messages) so the
// mobile↔EXE round trip survives across serverless instances. GET lists a channel's
// messages; POST translates (sync, best-effort) then INSERTs original + translated.
//
// Policy (1H.3): original preservation > translation success.
//   translate OK   → INSERT original + translated → 201
//   translate FAIL → INSERT original + translated={} (logged) → 201  (message NOT lost)
//   INSERT FAIL    → 500 DB_ERROR   (message genuinely not saved → client keeps draft)
//   no DB config   → 503 DB_UNAVAILABLE
//
// SECURITY: OPENAI_API_KEY + service role are server-only. This route is UNAUTHENTICATED
// (spike) — do NOT open to real customers before PIN/HttpOnly session are added.

import { NextRequest, NextResponse } from 'next/server';

import { appendMessage, guestLangForChannel, listMessages } from '@/lib/guest-spike/store';
import { openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { isCustomerLang, type CustomerLang } from '@/lib/customer-service/translationLangs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') {
    return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: { channel_key: string } }) {
  try {
    return NextResponse.json({ ok: true, messages: await listMessages(params.channel_key) });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;

  let body: { text?: unknown; sender?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }
  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ ok: false, error: 'EMPTY' }, { status: 400 });

  const sender: 'guest' | 'staff' = body.sender === 'staff' ? 'staff' : 'guest';
  const guestLang = guestLangForChannel(channelKey);
  const from: CustomerLang =
    sender === 'guest' ? (isCustomerLang(body.lang) ? body.lang : (guestLang as CustomerLang)) : 'ko';
  const to: CustomerLang = sender === 'guest' ? 'ko' : (guestLang as CustomerLang);

  // Translate (sync, best-effort). Failure NEVER blocks the save — original is preserved.
  const translated: Record<string, string> = {};
  if (from === to) {
    translated[to] = text;
  } else {
    try {
      const out = await openAiCustomerTranslator.translate(text, from, to);
      if (out) {
        translated[to] = out;
      } else {
        console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang: from, targetLang: to, reason: 'empty_result' });
      }
    } catch (e) {
      // Never log the original text or the API key — only codes/ids.
      console.warn('[GUEST_TRANSLATION_FAILED]', {
        channelKey,
        sender,
        originalLang: from,
        targetLang: to,
        errorName: e instanceof Error ? e.name : 'unknown',
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    const message = await appendMessage(channelKey, { sender, original: text, original_lang: from, translated });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}
