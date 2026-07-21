'use client';

// Phase 1I.1-B (option 2) — READ-ONLY Customer Information panel, shown in the right slot for
// CUSTOMER rooms (staff /chat ops-console layout). Shows ONLY the authoritative SESSION skeleton
// (room, session status, start time, selected language). There is NO reservation/customer/payment
// data: Phase 1I.1-C found no authoritative current-stay source, so the reservation area is a plain
// "권위 예약 데이터 준비 중" placeholder — never a derived guest name/phone/proximity match. The panel
// scrolls internally (min-h-0) and its failure never affects chat. No writes.

import { useState } from 'react';

import { useCustomerContext } from '@/lib/guest-spike/customerContextApi';
import { langDisplayName, isGuestLang } from '@/lib/guest-spike/languages';
import type { GuestCustomerContext } from '@/lib/guest-spike/customerContextTypes';

const UNKNOWN = '확인되지 않음';

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={value ? 'text-right text-gray-900' : 'text-right text-gray-400'}>{value ?? UNKNOWN}</span>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-700">{title}</h3>
        {badge ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{badge}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Panel({ ctx, onReload }: { ctx: GuestCustomerContext; onReload: () => void }) {
  const s = ctx.session;
  const lang = isGuestLang(s.languageCode) ? langDisplayName(s.languageCode) : null;
  return (
    <div className="flex flex-col gap-3 p-3">
      <header>
        <div className="text-sm font-bold text-gray-800">고객 정보</div>
        <div className="text-lg font-extrabold text-gray-900">{s.roomNo ? `${s.roomNo}호` : ctx.session.channelKey}</div>
        <div className="text-xs text-gray-500">{s.status === 'open' ? '현재 고객 세션' : '현재 활성 고객 없음'}</div>
      </header>

      <Card title="세션">
        <Row label="객실번호" value={s.roomNo} />
        <Row label="연결 상태" value={s.status === 'open' ? '진행 중' : '없음'} />
        <Row label="세션 시작" value={s.startedAt ? s.startedAt.replace('T', ' ').slice(0, 19) : null} />
        <Row label="선택 언어" value={lang} />
      </Card>

      <Card title="현재 예약 정보" badge="준비 중">
        <p className="text-sm font-medium text-gray-700">권위 예약 데이터 준비 중</p>
        <p className="mt-1 text-xs text-gray-500">
          예약·투숙·결제 정보는 아직 권위 있는 데이터 소스와 연결되지 않았습니다. 추정 정보를 표시하지 않으며, 채팅 기능은
          정상적으로 사용할 수 있습니다.
        </p>
      </Card>

      <button
        type="button"
        onClick={onReload}
        className="self-start rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        새로고침
      </button>
    </div>
  );
}

export function CustomerInformationPanel({ channelKey }: { channelKey: string; roomNo?: string | null }) {
  const [reloadKey, setReloadKey] = useState(0);
  const state = useCustomerContext(channelKey, reloadKey);

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full flex-col bg-gray-50">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === 'loading' && (
          <div className="p-4 text-sm text-gray-500">고객 세션 정보를 불러오는 중…</div>
        )}
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
        {state.status === 'success' && <Panel ctx={state.context} onReload={() => setReloadKey((k) => k + 1)} />}
      </div>
    </aside>
  );
}
