export const STAFF_QUICK_PHRASES_STORAGE_KEY = 'autoflow_staff_quick_phrases_v1';

export type QuickPhrase = {
  id: string;
  label: string;
  useCount: number;
};

const DEFAULT_LABELS = ['청소완료', '짐있음', '분실물', '담배냄새', '수건부족', '비품부족'] as const;

function newPhraseId(): string {
  return `qp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultQuickPhrases(): QuickPhrase[] {
  return DEFAULT_LABELS.map((label) => ({
    id: newPhraseId(),
    label,
    useCount: 0
  }));
}

function normalizePhrase(raw: unknown): QuickPhrase | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  if (!label) return null;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newPhraseId();
  const useCount = typeof o.useCount === 'number' && Number.isFinite(o.useCount) ? Math.max(0, o.useCount) : 0;
  return { id, label, useCount };
}

export function loadQuickPhrases(): QuickPhrase[] {
  if (typeof window === 'undefined') return createDefaultQuickPhrases();
  try {
    const raw = localStorage.getItem(STAFF_QUICK_PHRASES_STORAGE_KEY);
    if (!raw) {
      const defaults = createDefaultQuickPhrases();
      saveQuickPhrases(defaults);
      return defaults;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = createDefaultQuickPhrases();
      saveQuickPhrases(defaults);
      return defaults;
    }
    const phrases = parsed.map(normalizePhrase).filter((p): p is QuickPhrase => p !== null);
    if (phrases.length === 0) {
      const defaults = createDefaultQuickPhrases();
      saveQuickPhrases(defaults);
      return defaults;
    }
    return phrases;
  } catch {
    const defaults = createDefaultQuickPhrases();
    saveQuickPhrases(defaults);
    return defaults;
  }
}

export function saveQuickPhrases(phrases: QuickPhrase[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STAFF_QUICK_PHRASES_STORAGE_KEY, JSON.stringify(phrases));
  } catch {
    // ignore quota / private mode
  }
}

export function bumpPhraseUseCount(phrases: QuickPhrase[], id: string): QuickPhrase[] {
  return phrases.map((p) => (p.id === id ? { ...p, useCount: p.useCount + 1 } : p));
}

export function movePhrase(phrases: QuickPhrase[], id: string, direction: 'up' | 'down'): QuickPhrase[] {
  const idx = phrases.findIndex((p) => p.id === id);
  if (idx < 0) return phrases;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= phrases.length) return phrases;
  const next = [...phrases];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next;
}
