'use client';

// Phase 2A — Customer Information panel (right slot, customer rooms). Shows the read-only SESSION
// header (room / connection / start / language) and an EDITABLE, session-scoped memo the staff
// fills in while chatting: 고객명 / 전화번호 / 체크아웃 예정 / 차량번호 / 메모. No reservation, no PII
// estimation. The memo is bound to the current guest session — a new session starts empty (the
// form remounts on session change via `key`). Panel failure never affects chat. No auto-overwrite.

import { useState } from 'react';

import { useCustomerContext, saveCustomerContext } from '@/lib/guest-spike/customerContextApi';
import { langDisplayName, isGuestLang } from '@/lib/guest-spike/languages';
import type { GuestCustomerContext } from '@/lib/guest-spike/customerContextTypes';

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={value ? 'text-right text-gray-900' : 'text-right text-gray-400'}>{value ?? '—'}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: 'text' | 'tel' | 'numeric';
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs font-medium text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
    </label>
  );
}

type Draft = { guestName: string; guestPhone: string; checkOutDate: string; vehicleNo: string; memo: string };

function toDraft(c: NonNullable<GuestCustomerContext['customer']>): Draft {
  return {
    guestName: c.guestName,
    guestPhone: c.guestPhone,
    checkOutDate: c.checkOutDate ?? '',
    vehicleNo: c.vehicleNo,
    memo: c.memo,
  };
}

function CustomerForm({
  channelKey,
  initial,
}: {
  channelKey: string;
  initial: NonNullable<GuestCustomerContext['customer']>;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
  const [saved, setSaved] = useState<Draft>(toDraft(initial));
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({
    updatedAt: initial.updatedAt,
    updatedBy: initial.updatedBy,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<'idle' | 'saved' | 'no_session' | 'invalid' | 'failed'>('idle');

  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== saved[k]);
  const set = (k: keyof Draft) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setMsg('idle');
  };

  async function onSave() {
    setSaving(true);
    setMsg('idle');
    const res = await saveCustomerContext(channelKey, {
      guestName: draft.guestName.trim(),
      guestPhone: draft.guestPhone.trim(),
      checkOutDate: draft.checkOutDate ? draft.checkOutDate : null,
      vehicleNo: draft.vehicleNo.trim(),
      memo: draft.memo.trim(),
    });
    setSaving(false);
    if (res.ok && res.context.customer) {
      setSaved(toDraft(res.context.customer));
      setDraft(toDraft(res.context.customer));
      setMeta({ updatedAt: res.context.customer.updatedAt, updatedBy: res.context.customer.updatedBy });
      setMsg('saved');
    } else {
      setMsg(res.ok ? 'failed' : res.error);
    }
  }

  const updatedLabel = meta.updatedAt
    ? `${meta.updatedAt.replace('T', ' ').slice(0, 16)}${meta.updatedBy ? ` · ${meta.updatedBy}` : ''}`
    : null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-bold text-gray-700">고객 정보</h3>
      <div className="flex flex-col gap-2.5">
        <Field label="고객명" value={draft.guestName} onChange={set('guestName')} placeholder="이름" />
        <Field label="전화번호" value={draft.guestPhone} onChange={set('guestPhone')} inputMode="tel" placeholder="010-0000-0000" />
        <Field label="체크아웃 예정" value={draft.checkOutDate} onChange={set('checkOutDate')} type="date" />
        <Field label="차량번호" value={draft.vehicleNo} onChange={set('vehicleNo')} placeholder="00가0000" />
        <label className="block">
          <span className="mb-0.5 block text-xs font-medium text-gray-500">메모</span>
          <textarea
            value={draft.memo}
            onChange={(e) => set('memo')(e.target.value)}
            rows={3}
            placeholder="응대 특이사항"
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[11px] text-gray-400">
          {msg === 'saved' && <span className="text-green-600">저장됨</span>}
          {msg === 'no_session' && <span className="text-amber-600">활성 고객 세션이 없어 저장할 수 없습니다.</span>}
          {msg === 'invalid' && <span className="text-red-600">날짜 형식을 확인해 주세요.</span>}
          {msg === 'failed' && <span className="text-red-600">저장에 실패했습니다. 다시 시도해 주세요.</span>}
          {msg === 'idle' && updatedLabel && <span className="truncate">최근 저장 {updatedLabel}</span>}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </section>
  );
}

function Panel({ ctx }: { ctx: GuestCustomerContext }) {
  const s = ctx.session;
  const lang = isGuestLang(s.languageCode) ? langDisplayName(s.languageCode) : null;
  return (
    <div className="flex flex-col gap-3 p-3">
      <header>
        <div className="text-sm font-bold text-gray-800">고객 정보</div>
        <div className="text-lg font-extrabold text-gray-900">{s.roomNo ? `${s.roomNo}호` : ctx.session.channelKey}</div>
        <div className="text-xs text-gray-500">{s.status === 'open' ? '현재 고객 세션' : '현재 활성 고객 없음'}</div>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-bold text-gray-700">세션</h3>
        <Row label="객실번호" value={s.roomNo} />
        <Row label="연결 상태" value={s.status === 'open' ? '진행 중' : '없음'} />
        <Row label="세션 시작" value={s.startedAt ? s.startedAt.replace('T', ' ').slice(0, 19) : null} />
        <Row label="선택 언어" value={lang} />
      </section>

      {ctx.customer ? (
        // Remount the form when the session changes (start time is unique per session) so a new
        // guest never sees the previous guest's draft.
        <CustomerForm key={s.startedAt ?? s.channelKey} channelKey={s.channelKey} initial={ctx.customer} />
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-600">활성 고객 세션이 없어 고객 정보를 기록할 수 없습니다.</p>
        </section>
      )}
    </div>
  );
}

export function CustomerInformationPanel({
  channelKey,
  activeSessionId = null,
  // Right-panel width contract — MUST match ChatOperationPanel (Event Center) so the center chat
  // keeps its width. In the non-resizable layout the caller passes undefined → this fixed default;
  // in the resizable layout the caller passes 'w-full' to fill the wrapper's bounded slot.
  widthClassName = 'w-72 shrink-0 lg:w-80',
}: {
  channelKey: string;
  roomNo?: string | null;
  /** The room's current open session id (from the shared summary poll). When it changes — a new
   *  guest opened a fresh session after the previous one closed — the context re-fetches with no
   *  F5. It is stable within a session (never per message), so it does not disrupt an active edit. */
  activeSessionId?: string | null;
  widthClassName?: string;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  // Re-fetch on active-session change OR manual reload. useCustomerContext sets 'loading' on any
  // change, so the previous guest's data is never shown during the transition (loading, then empty).
  const state = useCustomerContext(channelKey, `${activeSessionId ?? 'none'}#${reloadKey}`);

  return (
    <aside className={`flex h-full min-h-0 flex-col bg-gray-50 ${widthClassName}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === 'loading' && <div className="p-4 text-sm text-gray-500">고객 정보를 불러오는 중…</div>}
        {state.status === 'error' && (
          <div className="p-4">
            <p className="text-sm text-gray-700">고객 정보를 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              다시 시도
            </button>
          </div>
        )}
        {state.status === 'success' && <Panel ctx={state.context} />}
      </div>
    </aside>
  );
}
