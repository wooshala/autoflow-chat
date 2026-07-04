import { supabaseAdmin } from '@/lib/supabase';
import { IS_MOCK } from '@/lib/env';
import { getSiteId } from '@/lib/site';
import type { ChatQuickPhrase } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var __autoflowQuickPhrases: ChatQuickPhrase[] | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function mockPhrases(): ChatQuickPhrase[] {
  if (!globalThis.__autoflowQuickPhrases) {
    const now = nowIso();
    globalThis.__autoflowQuickPhrases = [
      {
        id: 'qp-1',
        site_id: 'default',
        user_id: null,
        phrase_key: 'clean_done',
        ko: '청소완료',
        ru: 'Уборка завершена',
        sort_order: 0,
        enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'qp-2',
        site_id: 'default',
        user_id: null,
        phrase_key: 'luggage',
        ko: '짐있음',
        ru: 'Есть багаж',
        sort_order: 1,
        enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'qp-3',
        site_id: 'default',
        user_id: null,
        phrase_key: 'lost_item',
        ko: '분실물',
        ru: 'Потерянная вещь',
        sort_order: 2,
        enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'qp-4',
        site_id: 'default',
        user_id: null,
        phrase_key: 'cigarette_smell',
        ko: '담배냄새',
        ru: 'Запах сигарет',
        sort_order: 3,
        enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'qp-5',
        site_id: 'default',
        user_id: null,
        phrase_key: 'need_towel',
        ko: '수건부족',
        ru: 'Нужны полотенца',
        sort_order: 4,
        enabled: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 'qp-6',
        site_id: 'default',
        user_id: null,
        phrase_key: 'supply_shortage',
        ko: '비품부족',
        ru: 'Не хватает расходников',
        sort_order: 5,
        enabled: true,
        created_at: now,
        updated_at: now
      }
    ];
  }
  return globalThis.__autoflowQuickPhrases!;
}

function sortPhrases(list: ChatQuickPhrase[]): ChatQuickPhrase[] {
  return [...list].sort((a, b) => {
    const aPersonal = a.user_id ? 1 : 0;
    const bPersonal = b.user_id ? 1 : 0;
    if (aPersonal !== bPersonal) return aPersonal - bPersonal;
    return a.sort_order - b.sort_order;
  });
}

export async function listSharedQuickPhrases(siteId = getSiteId()): Promise<ChatQuickPhrase[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases()
      .filter((p) => p.site_id === siteId && !p.user_id && p.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .is('user_id', null)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function listPersonalQuickPhrases(
  userId: string,
  siteId = getSiteId()
): Promise<ChatQuickPhrase[]> {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases()
      .filter((p) => p.site_id === siteId && p.user_id === uid && p.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .eq('user_id', uid)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function listMergedQuickPhrases(
  userId: string | null | undefined,
  siteId = getSiteId()
): Promise<ChatQuickPhrase[]> {
  const shared = await listSharedQuickPhrases(siteId);
  if (!userId) return shared;
  const personal = await listPersonalQuickPhrases(userId, siteId);
  return sortPhrases([...shared, ...personal]);
}

/** @deprecated Use listMergedQuickPhrases */
export async function listQuickPhrases(siteId = getSiteId()): Promise<ChatQuickPhrase[]> {
  return listSharedQuickPhrases(siteId);
}

export async function listQuickPhrasesAdmin(siteId = getSiteId()): Promise<ChatQuickPhrase[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases()
      .filter((p) => p.site_id === siteId && !p.user_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .is('user_id', null)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function listPersonalQuickPhrasesAdmin(
  userId: string,
  siteId = getSiteId()
): Promise<ChatQuickPhrase[]> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases()
      .filter((p) => p.site_id === siteId && p.user_id === userId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .select('*')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as ChatQuickPhrase[];
}

export async function getQuickPhraseById(id: string): Promise<ChatQuickPhrase | null> {
  if (IS_MOCK || !supabaseAdmin) {
    return mockPhrases().find((p) => p.id === id) || null;
  }
  const { data, error } = await supabaseAdmin.from('chat_quick_phrases').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ChatQuickPhrase) || null;
}

export async function createQuickPhrase(input: {
  site_id?: string;
  user_id?: string | null;
  phrase_key: string;
  ko: string;
  ru: string;
  sort_order?: number;
}): Promise<ChatQuickPhrase> {
  const site_id = input.site_id || getSiteId();
  const user_id = input.user_id ? String(input.user_id).trim() : null;
  const row = {
    site_id,
    user_id,
    phrase_key: input.phrase_key.trim(),
    ko: input.ko.trim(),
    ru: input.ru.trim(),
    sort_order: input.sort_order ?? 0,
    enabled: true,
    updated_at: nowIso()
  };

  if (IS_MOCK || !supabaseAdmin) {
    const created: ChatQuickPhrase = {
      id: `qp-${Date.now()}`,
      ...row,
      enabled: true,
      created_at: nowIso(),
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
    list[idx] = { ...list[idx], ...patch, updated_at: nowIso() };
    return list[idx];
  }

  const { data, error } = await supabaseAdmin
    .from('chat_quick_phrases')
    .update({ ...patch, updated_at: nowIso() })
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

export async function reorderQuickPhrases(ids: string[], siteId = getSiteId(), userId?: string | null): Promise<void> {
  if (IS_MOCK || !supabaseAdmin) {
    const list = mockPhrases().filter((p) => p.site_id === siteId && (userId ? p.user_id === userId : !p.user_id));
    ids.forEach((id, sort_order) => {
      const p = list.find((x) => x.id === id);
      if (p) p.sort_order = sort_order;
    });
    return;
  }

  for (let i = 0; i < ids.length; i++) {
    let q = supabaseAdmin
      .from('chat_quick_phrases')
      .update({ sort_order: i, updated_at: nowIso() })
      .eq('id', ids[i])
      .eq('site_id', siteId);
    if (userId) q = q.eq('user_id', userId);
    else q = q.is('user_id', null);
    const { error } = await q;
    if (error) throw error;
  }
}

export function phraseText(phrase: ChatQuickPhrase, locale: 'ko' | 'ru'): string {
  return locale === 'ru' ? phrase.ru : phrase.ko;
}

export function personalPhraseKeySuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
