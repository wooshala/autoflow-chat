export const STORAGE_USER = 'autoflow_user_v1';

export type AutoflowUser = {
  name: string;
  created_at: string;
};

export function loadUser(): AutoflowUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('name' in parsed)) return null;
    const name = String((parsed as { name?: unknown }).name || '').trim();
    if (!name) return null;
    return parsed as AutoflowUser;
  } catch {
    return null;
  }
}

export function saveUser(name: string): AutoflowUser {
  const user: AutoflowUser = {
    name: name.trim(),
    created_at: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  return user;
}

export function clearUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_USER);
}

/** 레거시 키 정리 + 구 `autoflow_user`에 있던 이름을 v1으로 흡수 */
export function runSessionMigration(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('front_ops_staff_session_v1');
  const hasV1 = Boolean(localStorage.getItem(STORAGE_USER));
  if (!hasV1) {
    try {
      const legacyUser = localStorage.getItem('autoflow_user');
      if (legacyUser) {
        const o = JSON.parse(legacyUser) as { name?: unknown };
        if (o && typeof o.name === 'string' && o.name.trim()) {
          saveUser(o.name.trim());
        }
      }
    } catch {
      // ignore
    }
  }
  localStorage.removeItem('autoflow_user');
  localStorage.removeItem('autoflow_staff_user');
}

/** 채팅/유지보수 API용 DB user id (이름 전용 세션과 분리) */
export function resolveChatSendUserId(): string | null {
  const v =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CHAT_SEND_USER_ID
      ? String(process.env.NEXT_PUBLIC_CHAT_SEND_USER_ID).trim()
      : '';
  return v || null;
}

export function logoutAndGoLogin(router: { replace: (href: string) => void }) {
  clearUser();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('front_ops_staff_session_v1');
    localStorage.removeItem('autoflow_user');
    localStorage.removeItem('autoflow_staff_user');
  }
  router.replace('/login');
}
