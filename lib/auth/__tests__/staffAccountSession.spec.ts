import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAFF_SESSION_TOKEN_STORAGE_KEY,
  clearStaffSession,
  loadStoredSessionToken,
  saveStaffSession,
  staffSessionAuthHeaders,
} from '../staffAccountSession.ts';

test('staff session helper uses shared storage key', () => {
  assert.equal(STAFF_SESSION_TOKEN_STORAGE_KEY, 'autoflow_staff_session_token_v1');
});

test('saveStaffSession and loadStoredSessionToken share the same storage', () => {
  const originalWindow = (globalThis as any).window;
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    },
  };

  try {
    saveStaffSession('test-token', { accountId: 'a', userId: 'u' });
    assert.equal(loadStoredSessionToken(), 'test-token');
    assert.equal(store.get(STAFF_SESSION_TOKEN_STORAGE_KEY), 'test-token');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('staffSessionAuthHeaders returns Authorization when token exists', () => {
  const originalWindow = (globalThis as any).window;
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
      removeItem(key: string) {
        store.delete(key);
      },
    },
  };

  try {
    store.set(STAFF_SESSION_TOKEN_STORAGE_KEY, 'bearer-test');
    assert.deepEqual(staffSessionAuthHeaders(), { Authorization: 'Bearer bearer-test' });
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('staffSessionAuthHeaders returns empty object when no session token', () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('should not be called');
      },
      removeItem() {
        return;
      },
    },
  };

  try {
    assert.deepEqual(staffSessionAuthHeaders(), {});
  } finally {
    (globalThis as any).window = originalWindow;
  }
});
