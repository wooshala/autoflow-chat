'use client';

import * as React from 'react';

export type KpiCardsProps = {
  summary: {
    today_count: number;
    open_count: number;
    in_progress_count: number;
    auto_create_rate: number;
  } | null;
  loading?: boolean;
};

function formatRate(rate: number) {
  const r = Number.isFinite(rate) ? rate : 0;
  return `${Math.round(r * 100)}%`;
}

function Card({ title, value, sub }: { title: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

export function KpiCards({ summary, loading }: KpiCardsProps) {
  const s = summary || { today_count: 0, open_count: 0, in_progress_count: 0, auto_create_rate: 0 };
  const dim = loading ? 'opacity-70' : '';

  return (
    <section className={`grid grid-cols-1 gap-3 md:grid-cols-4 ${dim}`}>
      <Card title="오늘 티켓 수" value={s.today_count} sub="KST 기준" />
      <Card title="미처리 수" value={s.open_count} sub="상태: 대기중" />
      <Card title="진행 중 수" value={s.in_progress_count} sub="상태: 처리중" />
      <Card title="자동 생성 비율" value={formatRate(s.auto_create_rate)} sub="오늘 생성 중" />
    </section>
  );
}

