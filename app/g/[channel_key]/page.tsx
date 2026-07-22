'use client';

// Phase 1G.4/1H.5 — guest mobile chat. Language is chosen by the guest, not hardcoded.
// Priority (server is SoT): server preferred_language → else language-selection screen.
// A stale localStorage value is NEVER auto-applied when the server is empty (room QR is
// reused across guests) — it only pre-highlights a suggestion. Selection persists to the
// server (PUT) BEFORE entering chat.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { GuestChatPanel } from '@/components/guest-spike/GuestChatPanel';
import { fetchGuestSession, setGuestLanguage } from '@/lib/guest-spike/api';
import { decideGuestEntryPhase } from '@/lib/guest-spike/sessionPolicy';
import { guestStatusText, isGuestLang, langDisplayName, SUPPORTED_LANGS, uiTextFor, type GuestLang } from '@/lib/guest-spike/languages';

const STAFF_LANG = 'ko';
const lsKey = (channelKey: string) => `guest-chat-language:${channelKey}`;

export default function GuestChatPage() {
  const params = useParams();
  const channelKey = decodeURIComponent(String(params.channel_key ?? ''));

  const [phase, setPhase] = useState<'resolving' | 'selecting' | 'chatting' | 'closed' | 'occupied'>('resolving');
  const [preferred, setPreferred] = useState<GuestLang | null>(null);
  const [suggested, setSuggested] = useState<GuestLang | null>(null); // from localStorage, highlight only
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve on mount: server is authoritative. localStorage is only a suggestion.
  useEffect(() => {
    let alive = true;
    let ls: GuestLang | null = null;
    try {
      const v = localStorage.getItem(lsKey(channelKey));
      if (isGuestLang(v)) ls = v;
    } catch {}
    setSuggested(ls);
    (async () => {
      // Phase 1H.7 — establish the guest session (sets HttpOnly cookie) AND read THIS session's
      // language in one response. The entry screen is decided from the session alone — never a
      // stale channel value — so a fresh session ALWAYS shows the language selection screen and
      // only a reconnecting guest whose own session already has a language skips it.
      const session = await fetchGuestSession(channelKey);
      if (!alive) return;
      const entry = decideGuestEntryPhase({ status: session.status, languageCode: session.language_code });
      if (entry === 'chatting' && isGuestLang(session.language_code)) {
        setPreferred(session.language_code);
        try {
          localStorage.setItem(lsKey(channelKey), session.language_code);
        } catch {}
      }
      setPhase(entry);
    })();
    return () => {
      alive = false;
    };
  }, [channelKey]);

  const choose = useCallback(
    async (lang: GuestLang) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      try {
        await setGuestLanguage(channelKey, lang); // server PUT must succeed first
        try {
          localStorage.setItem(lsKey(channelKey), lang);
        } catch {}
        setPreferred(lang);
        setPhase('chatting');
      } catch {
        setError(uiTextFor(suggested).errorLanguageSave);
      } finally {
        setSaving(false);
      }
    },
    [channelKey, saving, suggested],
  );

  const roomLabel = channelKey.replace(/[^0-9]/g, '') || channelKey;

  if (phase === 'resolving') {
    return (
      <main style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>
        …
      </main>
    );
  }

  // 'closed' / 'occupied' appear before the guest has (or after they lost) a chosen language, so
  // every supported language is shown at once — a fr/es guest must understand these too.
  if (phase === 'closed') {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f2f4f7', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center', overflowY: 'auto' }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>💬</div>
        {SUPPORTED_LANGS.map((l) => (
          <div key={l} style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{guestStatusText[l].endedTitle}</div>
        ))}
      </main>
    );
  }

  if (phase === 'occupied') {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#f2f4f7', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center', overflowY: 'auto' }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        {SUPPORTED_LANGS.map((l) => (
          <div key={l}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', lineHeight: 1.4 }}>{guestStatusText[l].occupiedTitle}</div>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{guestStatusText[l].occupiedHelp}</div>
          </div>
        ))}
      </main>
    );
  }

  if (phase === 'selecting') {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#f2f4f7', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>{roomLabel} · 고객 채팅</div>
          <div style={{ marginTop: 16, fontSize: 16, color: '#111' }}>언어를 선택해 주세요</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Please select your language</div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SUPPORTED_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              disabled={saving}
              onClick={() => void choose(lang)}
              style={{
                padding: '14px 16px', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer',
                border: suggested === lang ? '2px solid #FEE500' : '1px solid #d1d5db',
                background: '#fff', color: '#111', opacity: saving ? 0.6 : 1,
              }}
            >
              {langDisplayName(lang)}
              {suggested === lang ? ' ·' : ''}
            </button>
          ))}
        </div>
        {error && <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#dc2626' }}>{error}</div>}
      </main>
    );
  }

  // chatting
  const t = uiTextFor(preferred);
  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f2f4f7', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#1f2937', color: '#fff' }}>
        <span style={{ fontWeight: 700 }}>{roomLabel} · {t.title}</span>
        <button
          type="button"
          onClick={() => setPhase('selecting')}
          style={{ marginLeft: 'auto', fontSize: 12, borderRadius: 999, border: '1px solid #4b5563', background: 'transparent', color: '#e5e7eb', padding: '4px 10px', cursor: 'pointer' }}
        >
          🌐 {t.changeLanguage}
        </button>
      </header>
      <GuestChatPanel
        channelKey={channelKey}
        viewerLang={preferred ?? 'en'}
        counterpartLang={STAFF_LANG}
        ownSender="guest"
        ownLabel={t.guestSelfLabel}
        otherLabel={t.staffLabel}
        emptyText={t.placeholder}
        inputPlaceholder={t.placeholder}
        sendLabel={t.send}
      />
    </main>
  );
}
