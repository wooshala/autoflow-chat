'use client';

import * as React from 'react';

export type InsightsCardsProps = {
  insights: {
    top_categories: { category: string; count: number }[];
    top_rooms: { room_no: string; count: number }[];
  } | null;
  loading?: boolean;
  days?: number;
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-gray-900">{title}</div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function InsightsCards({ insights, loading, days = 7 }: InsightsCardsProps) {
  const dim = loading ? 'opacity-70' : '';
  const topCategories = insights?.top_categories || [];
  const topRooms = insights?.top_rooms || [];

  return (
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-12 ${dim}`}>
      <div className="lg:col-span-6">
        <Card title={`반복 이슈 TOP 5 (최근 ${days}일)`}>
          {topCategories.length === 0 ? (
            <div className="text-sm text-gray-500">{loading ? '불러오는 중…' : '데이터가 없습니다.'}</div>
          ) : (
            <ul className="space-y-2">
              {topCategories.map((x) => (
                <li key={x.category} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-sm text-gray-900">{x.category}</div>
                  <div className="text-xs font-semibold text-gray-600">{x.count}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="lg:col-span-6">
        <Card title={`객실별 이슈 TOP 5 (최근 ${days}일)`}>
          {topRooms.length === 0 ? (
            <div className="text-sm text-gray-500">{loading ? '불러오는 중…' : '데이터가 없습니다.'}</div>
          ) : (
            <ul className="space-y-2">
              {topRooms.map((x) => (
                <li key={x.room_no} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="text-sm text-gray-900">{x.room_no}호</div>
                  <div className="text-xs font-semibold text-gray-600">{x.count}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

