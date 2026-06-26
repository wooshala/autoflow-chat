# Web Push Plan (Core v0.1 — design only)

## Current limitation

AutoFlow Chat Core v0.1 uses the **in-page Notification API** (`new Notification()` from an open tab).

| State | What works | What fails |
|-------|------------|------------|
| `/chat` or `/staff-chat` tab open + permission granted | OS notification (background-like), toast/beep (foreground) | — |
| Tab backgrounded (Android Chrome) | Sometimes, if JS + Supabase Realtime stay alive | Unreliable; throttled/suspended |
| Tab closed / app killed | Nothing | No code runs → **zero alerts** |
| Screen off / PWA without SW | Same as background | No true push |

**Why Android background is insufficient today**

1. No **Service Worker** → no `push` event handler when the page is dead.
2. Realtime WebSocket depends on the page lifecycle; Chrome throttles background tabs.
3. Watchdog polling helps but cannot replace OS-level push when the process is suspended.

---

## Target flow (next phase)

```text
message inserted (chat_messages)
  → server hook (API post-insert or DB trigger)
  → build push payload { title, body, url, tag }
  → push_subscriptions lookup (by user_id or staff key)
  → web-push library send (VAPID)
  → browser Service Worker receives push
  → SW.showNotification(...)
  → user taps → clients.openWindow('/staff-chat?user=cleaner1')
  → Android notification display
```

---

## Proposed components

### Database

```sql
-- push_subscriptions (draft)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);
```

### Server

| File | Role |
|------|------|
| `app/api/push/subscribe/route.ts` | Save subscription after client `PushManager.subscribe` |
| `app/api/push/unsubscribe/route.ts` | Remove subscription |
| `lib/push/sendWebPush.ts` | VAPID sign + send via `web-push` |
| `app/api/chat/send/route.ts` (or worker) | After insert, enqueue push to other users |

Env:

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client)

### Client

| File | Role |
|------|------|
| `public/sw.js` | `push` + `notificationclick` handlers |
| `lib/push/registerServiceWorker.ts` | Register SW, subscribe, POST to API |
| `app/chat/page.tsx`, `app/staff-chat/StaffChatClient.tsx` | Call register after login + permission |

### Service Worker sketch

```javascript
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'AutoFlow', {
      body: data.body,
      tag: data.tag,
      data: { url: data.url ?? '/staff-chat' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/chat';
  event.waitUntil(clients.openWindow(url));
});
```

---

## Rollout order

1. **Core v0.1** (this phase): instant send, staff-chat receive, realtime + poll fallback, user_id split.
2. **Push v0.2**: SW + subscribe API + send on INSERT for `user_id != sender`.
3. **Push v0.3**: per-device preferences, quiet hours, room-scoped subscriptions.

---

## Success criteria for Push v0.2

- Android Chrome: message sent from `/chat` while `/staff-chat` is **backgrounded 5+ minutes** → OS notification within 10s.
- Tap notification → opens correct staff URL with message visible without manual refresh.
- No dependency on Supabase Realtime for **alert delivery** (realtime still used for in-app list when open).
