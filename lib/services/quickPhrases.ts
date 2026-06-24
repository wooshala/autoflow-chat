import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { getSiteId } from '@/lib/site';
import type { ChatQuickPhrase } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var __autoflowQuickPhrases: ChatQuickPhrase[] | undefined;
}

function mockPhrases(): ChatQuickPhrase[] {
  if (!globalThis.__autoflowQuickPhrases) {
    const now = new Date().toISOString();
    globalThis.__autoflowQuickPhrases = [
      { id: 'qp-1', site_id: 'default', phrase_key: 'clean_done', ko: '청소완료', ru: 'Уборка завершена', sort_order: 0, enabled: true, created_at: now, updated_at: now },
      { id: 'qp-2', site_id: 'default', phrase_key: 'luggage', ko: '짐있음', ru: 'Есть багаж', sort_order: 1, enabled: true, created_at: now, updated_at: now },
      { id: 'qp-3', site_id: 'default', phrase_key: 'lost_item', ko: '분실물', ru: 'Потерянная вещь', sort_order: 2, enabled: true, created_at: now, updated_at: now },
      { id: 'qp-4', site_id: 'default', phrase_key: 'cigarette_smell', ko: '담배냄새', ru: 'Запах сигарет', sort_order: 3, enabled: true, created_at: now, updated_at: now },
      { id: 'qp-5', site_id: 'default', phrase_key: 'need_towel', ko: '수건부족', ru: 'Нужны полотенца', sort_order: 4, enabled: true, created_at: now, updated_at: now },
      { id: 'qp-6', site_id: 'default', phrase_key: 'supply_shortage', ko: '비품부족', ru: 'Не хватает расходников', sort_order: 5, enabled: true, created_at: now, updated_at: now }
    ];
  }
  return globalThis.__autoflowQuickPhrases!;
}

export async function listQuickPhrases(siteId = getSiteId()): Promise<ChatQuickPhrase[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases()
      .filter((p) => p.site_id === siteId && p.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function listQuickPhrasesAdmin(siteId = getSiteId()): Promise<ChatQuickPhrase[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases().filter((p) => p.site_id === siteId).sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function createQuickPhrase(input: {
  site_id?: string;
  phrase_key: string;
  ko: string;
  ru: string;
  sort_order?: number;
}): Promise<ChatQuickPhrase> {
  const site_id = input.site_id || getSiteId();
  const row = {
    site_id,
    phrase_key: input.phrase_key.trim(),
    ko: input.ko.trim(),
    ru: input.ru.trim(),
    sort_order: input.sort_order ?? 0,
    enabled: true,
    updated_at: new Date().toISOString()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const created: ChatQuickPhrase = {
      id: `qp-${Date.now()}`,
      ...row,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: row.updated_at
    };
    mockPhrases().push(created);
    return created;
  }

  const { data, error } = await supabaseAdmin.from('chat_quick_phrases').insert(row).select('*').single();
  if (error) throw error;
  return data as ChatQuickPhrase;
}

export async function updateQuickPhrase(
  id: string,
  patch: Partial<Pick<ChatQuickPhrase, 'phrase_key' | 'ko' | 'ru' | 'sort_order' | 'enabled'>>
): Promise<ChatQuickPhrase> {
  if (IS_MOCK || !supabaseAdmin) {
    const list = mockPhrases();
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error('NOT_FOUND');
    list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() };
    return list[idx];
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ChatQuickPhrase;
}

export async function deleteQuickPhrase(id: string): Promise<void> {
  if (IS_MOCK || !supabaseAdmin) {
    globalThis.__autoflowQuickPhrases = mockPhrases().filter((p) => p.id !== id);
    return;
  }
  const { error } = await supabaseAdmin.from('chat_quick_phrases').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderQuickPhrases(ids: string[], siteId = getSiteId()): Promise<void> {
  if (IS_MOCK || !supabaseAdmin) {
    const list = mockPhrases().filter((p) => p.site_id === siteId);
    ids.forEach((id, sort_order) => {
      const p = list.find((x) => x.id === id);
      if (p) p.sort_order = sort_order;
    });
    return;
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabaseAdmin
      .from('chat_quick_phrases')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', ids[i])
      .eq('site_id', siteId);
    if (error) throw error;
  }
}

export function phraseText(phrase: ChatQuickPhrase, locale: 'ko' | 'ru'): string {
  return locale === 'ru' ? phrase.ru : phrase.ko;
}
