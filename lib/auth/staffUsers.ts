/**

 * Core v0.1: minimal multi-user identity without full auth.

 * PC /chat → manager (NEXT_PUBLIC_CHAT_SEND_USER_ID)

 * /staff-chat?user=cleaner1 → NEXT_PUBLIC_STAFF_USER_CLEANER1_ID (fallback: env map)

 *

 * IMPORTANT: use literal `process.env.NEXT_PUBLIC_*` access only.

 * Dynamic `process.env[key]` is NOT inlined by Next.js on the client bundle.

 */



export type StaffUserKey = 'manager' | 'cleaner1' | 'cleaner2';



const STORAGE_STAFF_KEY = 'autoflow_staff_user_key_v1';



function trimEnv(value: string | undefined): string | null {

  if (!value) return null;

  const s = String(value).trim();

  return s || null;

}



/** Manager UUID — literal env reads for Next.js client inlining */

function readManagerUserId(): string | null {

  return (

    trimEnv(process.env.NEXT_PUBLIC_CHAT_SEND_USER_ID) ||

    trimEnv(process.env.NEXT_PUBLIC_STAFF_USER_MANAGER_ID)

  );

}



function readCleaner1UserId(): string | null {

  return trimEnv(process.env.NEXT_PUBLIC_STAFF_USER_CLEANER1_ID);

}



function readCleaner2UserId(): string | null {

  return trimEnv(process.env.NEXT_PUBLIC_STAFF_USER_CLEANER2_ID);

}



export function normalizeStaffUserKey(raw: string | null | undefined): StaffUserKey {

  const p = String(raw || '')

    .trim()

    .toLowerCase();

  if (p === 'manager' || p === 'admin' || p === 'pc') return 'manager';

  if (p === 'cleaner2' || p === 'cleaner-2' || p === 'staff2') return 'cleaner2';

  // Legacy mobile aliases → cleaner1
  if (p === 'cleaner1' || p === 'cleaner-1' || p === 'staff' || p === 'staff1' || p === 'mobile') {
    return 'cleaner1';
  }

  return 'cleaner1';

}



export function resolveUserIdForStaffKey(key: StaffUserKey): string | null {

  switch (key) {

    case 'manager':

      return readManagerUserId();

    case 'cleaner1':

      return readCleaner1UserId();

    case 'cleaner2':

      return readCleaner2UserId();

    default:

      return null;

  }

}



/** `/chat` — always manager/admin UUID */

export function resolveChatPageUserId(): string | null {

  return resolveUserIdForStaffKey('manager');

}



/** `/staff-chat` — URL param or persisted key */

export function resolveStaffChatUserId(urlParam: string | null | undefined): {

  key: StaffUserKey;

  userId: string | null;

} {

  if (typeof window !== 'undefined') {

    const fromUrl = urlParam != null && String(urlParam).trim() ? normalizeStaffUserKey(urlParam) : null;

    if (fromUrl) {

      try {

        localStorage.setItem(STORAGE_STAFF_KEY, fromUrl);

      } catch {

        /* ignore */

      }

    }

    let key: StaffUserKey = 'cleaner1';

    try {

      const stored = localStorage.getItem(STORAGE_STAFF_KEY);

      if (stored) key = normalizeStaffUserKey(stored);

    } catch {

      /* ignore */

    }

    if (fromUrl) key = fromUrl;

    return { key, userId: resolveUserIdForStaffKey(key) };

  }

  const key = normalizeStaffUserKey(urlParam);

  return { key, userId: resolveUserIdForStaffKey(key) };

}



export function staffKeyLabel(key: StaffUserKey): string {

  switch (key) {

    case 'manager':

      return 'Manager';

    case 'cleaner1':

      return 'Cleaner-1';

    case 'cleaner2':

      return 'Cleaner-2';

    default:

      return key;

  }

}


