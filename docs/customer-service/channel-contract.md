# Customer Service Channel — Data Contract (Phase 1A)

Status: **data boundary only.** No UI, no landing page, no translation API call, no
image upload, no Realtime wiring. This document is the contract every future phase
(landing page, EXE customer-service mode, translation) must follow.

Final decision from the investigation: **REBUILD CUSTOMER CHANNEL.** The existing
staff `chat_messages` model and `/api/chat/*` routes are NOT reused for guests.

## 1. Physical separation from staff chat

| Concern | Staff chat (existing, unchanged) | Customer channel (new, this phase) |
|---|---|---|
| Messages | `chat_messages` | `customer_messages` |
| Rooms | derived from message stream | `customer_conversations` (first-class) |
| Session | none (room_no only) | `customer_stays` (stay session) |
| Access | anon key + unauthenticated `/api/chat/*` | server service_role only; RLS default-deny |
| Sender | `sender_side` pc/mobile (device) | `sender_type` guest/staff/system (server-forced) |
| Tenant | none | `site_id` on every row |

The customer channel does **not** read or write `chat_messages`, `chat_rooms`,
`staff_*`, storage, or the stay-journal ledger DB.

## 2. Table ownership

| Table | Owner / sole writer | Purpose |
|---|---|---|
| `customer_stays` | customer-service server layer | independent guest stay session (not PMS-linked in 1A) |
| `customer_conversations` | customer-service server layer | one open conversation per stay |
| `customer_messages` | `lib/customer-service/repository.ts` only | guest/staff/system messages |
| `customer_access_tokens` | `lib/customer-service/repository.ts` only | opaque guest tokens (hash only) |
| `customer_conversation_read_state` | repository | per-reader read cursor |

No other module may INSERT/UPDATE these tables. There is **no** generic
`insertMessage({sender_type, visibility})` — writes go through `appendGuestPublicMessage`,
`appendStaffPublicMessage`, `appendStaffInternalMessage`.

## 3. Relationships

```
customer_stays (1) ──< customer_conversations (1 open) ──< customer_messages
                        │                                   customer_conversation_read_state
                        └──< customer_access_tokens (scope = conversation + stay + site)
```

Authorization key chain: **`customer_access_tokens.token_hash` → conversation_id +
stay_id + site_id (server-decided)**. `room_no` is a display snapshot only and is
**never** an authorization key.

## 4. Tenant boundary

`site_id text` on every table (same concept as `staff_accounts.site_id`,
`staff_invites.site_id`). The server decides `site_id`:

- guest: from the token's row (`customer_access_tokens.site_id` → session).
- staff: from a verified `StaffContext.site_id`.

The client's supplied `site_id` / `hotel_id` is **never** trusted. There is no
hard-coded `'hotel-label'`; `site_id` is a real per-row value set at creation time.

## 5. public vs internal

- `visibility='public'`: visible to the guest and staff.
- `visibility='internal'`: staff/system only. **Never** returned by any guest read
  path, enforced in TWO layers:
  1. DB `CHECK (visibility <> 'internal' OR sender_type IN ('staff','system'))` and
     `CHECK (sender_type <> 'guest' OR visibility = 'public')`.
  2. `listCustomerPublicMessages` filters `visibility='public'` + `deleted_at IS NULL`.

Internal memos must never be hidden by UI filtering alone.

## 6. Guest token lifecycle

1. Server generates a 256-bit `base64url` raw token (`generateRawCustomerToken`).
2. Only `SHA-256(raw)` is stored (`customer_access_tokens.token_hash`). **Raw token is
   never persisted or logged** (use `redactToken`/`token_id` in logs).
3. Guest receives the raw token inside an opaque URL (landing page = later phase).
4. On each request the guest submits the raw token; the server re-hashes and looks it
   up by `token_hash`.
5. `validateCustomerAccessToken` accepts only `status='active'`, not revoked, not
   expired, and returns a server-decided `GuestSessionContext`. Any failure → `null`
   (no reason leaked).
6. **Instant revoke** on checkout/explicit end: `revokeCustomerAccessToken`
   (`status='revoked'`, `revoked_at=now`).
7. The token is opaque random bytes — it encodes no room/hotel, so it cannot be used
   to guess a `site_id` or `room_no`.

Runtime notes: hashing uses `node:crypto` (Node server runtime, not Edge; do not
import `token.ts`/`repository.ts` into client/EXE bundles). URL-query tokens can leak
via Referer/analytics — Phase 1B should exchange the URL token for an HttpOnly,
Secure, SameSite session cookie on first landing.

## 7. sender_type trust boundary

- The client **cannot** set `sender_type`. Each write function hard-codes it:
  `appendGuestPublicMessage` → `guest`, `appendStaff*` → `staff`.
- A guest can never author `internal`, `system`, or set `sender_staff_user_id`.
- Staff writes require a verified `StaffContext`; `requireStaffContext` fails closed
  when it is missing (`resolveStaffContextFromRequest` is a Phase 1B stub returning
  `null`, i.e. no staff customer-route may ship until staff auth→tenant is wired).

## 8. Original text & translation

- `original_text` + `original_language` hold the authored text and are **never**
  overwritten by a translation.
- `translated_text jsonb` is a BCP-47-keyed map (e.g. `{ "ko": "…" }`). This is a
  superset of the staff chat 2-letter `TranslatedText` — the customer channel uses
  full BCP-47 (`zh-CN`, `ja`, …). `translation_status`/`provider`/`error`/`translated_at`
  track provenance (the staff chat has none of these).
- `attachMessageTranslation` updates only translation columns; on retry/failure the
  original is guaranteed intact. Phase 1A does not call any translation API.

## 9. Storage / photos

`customer_messages.image_storage_path` stores a **private** storage path only. No
public URL is ever stored. Phase 1B serves images via short-lived signed URLs.

## 10. Non-connection principles (this phase)

- No write to the stay-journal ledger or existing `chat_messages`.
- Sole writer of each table = the customer-service server layer (§2).
- Stay session is independent (no PMS/ledger link); `external_reservation_id` is a
  reserved, unused hook for future linking.

## 11. Forbidden for future phases (landing page / EXE UI / translation)

- ❌ Calling `/api/chat/list` (staff chat) from a customer surface.
- ❌ Subscribing a customer client directly to `chat_messages` Realtime.
- ❌ Authorizing a guest by `room_no` alone.
- ❌ Using the Supabase service role in the browser/EXE bundle or any response.
- ❌ Trusting a client-supplied `sender_type` / `visibility` / `site_id` / `conversation_id`.
- ❌ Hiding `internal` messages with UI filtering only.
- ❌ Storing a public storage URL for a customer photo.

## 12. What the future customer/staff API must do

- Guest routes: validate raw token → `GuestSessionContext`; only
  `listCustomerPublicMessages` / `appendGuestPublicMessage` / `markConversationRead(guest)`.
- Staff routes: authenticate staff → `StaffContext` (Phase 1B: derive `site_id` +
  `staff_user_id` from `staff_sessions`/`staff_invites`); then
  `appendStaffPublicMessage` / `appendStaffInternalMessage` / staff reads scoped to
  `site_id`.
- All of the above use the server service_role client only, never the anon key.
