// Phase 1G.4/1H.3/1H.5 — guest message + channel-language API (one route, additive).
//   GET  ?meta=1 → { ok, preferred_language, language_source }        (lightweight, no messages)
//   GET          → { ok, messages, preferred_language, language_source } (backward-compatible)
//   POST         → send a message (guest: LLM detect+translate→ko; staff: ko→preferred)
//   PUT { preferred_language } → set the channel's language
//
// Policy: original preservation > translation. Guest detection: LLM → heuristic → preferred
// (logged). Staff with NO channel language → 409 LANGUAGE_NOT_SELECTED (no room-number
// fallback). OPENAI_API_KEY + service role are server-only. Unauthenticated (spike).

import { NextRequest, NextResponse } from 'next/server';

import { appendMessage, getChannelLanguage, listMessages, setChannelLanguage } from '@/lib/guest-spike/store';
import { detectAndTranslateToKorean, openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { isGuestLang, resolveOriginalLang, type GuestLang } from '@/lib/guest-spike/languages';
import type { CustomerLang } from '@/lib/customer-service/translationLangs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function dbError(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'DB_UNAVAILABLE') return NextResponse.json({ ok: false, error: 'DB_UNAVAILABLE' }, { status: 503 });
  return NextResponse.json({ ok: false, error: 'DB_ERROR' }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  const meta = req.nextUrl.searchParams.get('meta') === '1';
  // meta=1 is the language endpoint → strict. The message LIST degrades gracefully if the
  // channels table/read fails (e.g. pre-migration) so existing messages never regress.
  if (meta) {
    try {
      const { preferred_language, language_source } = await getChannelLanguage(channelKey);
      return NextResponse.json({ ok: true, preferred_language, language_source });
    } catch (e) {
      return dbError(e);
    }
  }
  try {
    let preferred_language: string | null = null;
    let language_source: string | null = null;
    try {
      const ch = await getChannelLanguage(channelKey);
      preferred_language = ch.preferred_language;
      language_source = ch.language_source;
    } catch {
      /* language unavailable (e.g. table not migrated yet) → still list messages */
    }
    const messages = await listMessages(channelKey);
    return NextResponse.json({ ok: true, messages, preferred_language, language_source });
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { channel_key: string } }) {
  const channelKey = params.channel_key;
  let body: { text?: unknown; sender?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_JSON' }, { status: 400 });
  }
  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ ok: false, error: 'EMPTY' }, { status: 400 });
  const sender: 'guest' | 'staff' = body.sender === 'staff' ? 'staff' : 'guest';

  // Channel language read DEGRADES to null on failure (e.g. table not migrated) — guest
  // POST never 500s on this. Only staff (which needs a target language) is blocked, via 409.
  let preferred: GuestLang | null = null;
  try {
    const ch = await getChannelLanguage(channelKey);
    preferred = isGuestLang(ch.preferred_language) ? ch.preferred_language : null;
  } catch {
    preferred = null;
  }

  let originalLang: string;
  const translated: Record<string, string> = {};

  if (sender === 'guest') {
    // ONE LLM call: detect source + translate to Korean. Failures never block the save.
    const { detected, ko } = await detectAndTranslateToKorean(text);
    const resolved = resolveOriginalLang({ llmDetected: detected, text, preferred });
    originalLang = resolved.lang;
    if (resolved.usedFallback) {
      console.warn('[GUEST_LANGUAGE_DETECTION_FALLBACK]', { channelKey, preferredLanguage: preferred, reason: 'llm_and_heuristic_null' });
    }
    if (ko) translated.ko = ko;
    else console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: 'ko', reason: 'no_ko_result' });
  } else {
    // Staff: original is Korean; translate to the channel's chosen language. No language → block.
    if (!preferred) {
      return NextResponse.json({ ok: false, error: 'LANGUAGE_NOT_SELECTED' }, { status: 409 });
    }
    originalLang = 'ko';
    const to = preferred;
    if (to === 'ko') {
      translated[to] = text;
    } else {
      try {
        const out = await openAiCustomerTranslator.translate(text, 'ko' as CustomerLang, to as CustomerLang);
        if (out) translated[to] = out;
        else console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: to, reason: 'empty_result' });
      } catch (e) {
        console.warn('[GUEST_TRANSLATION_FAILED]', { channelKey, sender, originalLang, targetLang: to, errorName: e instanceof Error ? e.name : 'unknown', errorMessage: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  try {
    const message = await appendMessage(channelKey, { sender, original: text, original_lang: originalLang, translated });
    return NextResponse.json({ ok: true, message }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
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
  try {
    const { preferred_language, language_source } = await setChannelLanguage(channelKey, body.preferred_language, 'user_selected');
    return NextResponse.json({ ok: true, preferred_language, language_source });
  } catch (e) {
    return dbError(e);
  }
}
