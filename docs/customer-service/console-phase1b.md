# Customer Service Console — Phase 1B (translation UX + clipboard image PoC)

Status: **UX PoC on an isolated flag-gated route.** Mock data, mock translation, no
DB, no real customer, no deploy. Builds on the Phase 1A `customer_*` data boundary
(commit `4281818`). Does not touch staff chat, `chat_messages`, `/api/chat/*`, the
existing translation modules, or `src-tauri`.

## 1. Reuse boundary — translation

The staff chat translator (`lib/chat/openAiChatTranslate.ts` `openAiTranslateHotelChat`)
is **language-locked to ko/ru** (its `LANG_LABEL` only has ko/ru), so it cannot serve
zh-CN/ja/en guests. It is **not modified** (no staff-chat regression).

Reuse is via a boundary, not a rewrite:
- `lib/customer-service/translation.ts` (`openAiCustomerTranslator`) keeps the SAME
  contract (returns `null` on missing key / API error / timeout / empty → original
  preserved) and **reuses the exported, language-agnostic helpers**
  `maskOpenAiKey` + `formatOpenAiApiErrorDetail` from the staff module. Same model
  (`gpt-4o-mini`), same 20s timeout. The system prompt is extended for guest-facing
  hotel context: room numbers, dates, times, numbers, prices/amounts, and
  place/line/station names are preserved verbatim.
- `lib/customer-service/translationLangs.ts` is client-safe (no `openai` import):
  `CustomerLang` (`ko | zh-CN | ja | en | ru`, BCP-47), `LANG_DISPLAY`,
  `mockCustomerTranslator`, `buildCustomerTranslations`.

Failure policy (mirrors staff): a null translation never overwrites the original.
For a staff→guest reply, a translation failure **blocks auto-send** — the Korean is
not sent to the guest as-is (§2B of the brief); the UI surfaces a retry.

## 2. Translation display rules (mock timeline)

- Guest message → **Korean translation primary**, original expandable ("고객 원문 보기").
  On failure → original shown with a "번역 실패 — 원문 표시" badge (message never hidden).
- Staff message → **Korean original primary**, guest-language translation expandable
  ("고객에게 전달된 번역 보기").
- Internal memo → amber "직원 전용" styling, Korean only, never rendered to a guest.

## 3. Clipboard image paste (`lib/customer-service/clipboardImage.ts`)

Pure, DOM-free helpers (unit-tested in Node):
- `extractClipboardImage(event)` — first image from `clipboardData.items` then `.files`;
  **returns null when there is no image**, so the component must not `preventDefault`
  and normal text paste is untouched.
- `clipboardHasText(event)` — detect mixed image+text.
- `validateClipboardImage(file)` — PNG/JPEG only (WebP intentionally excluded until the
  upload path's webp acceptance is confirmed), ≤10MB.
- `createClipboardImagePreview(blob, deps?)` — object-URL preview with an **idempotent
  `revoke()`**; the component revokes on replace / cancel / send / unmount.

Minimum success path (EXE): Win+Shift+S → click input → Ctrl+V → preview → optional
Korean description → send/cancel. One image per message in this MVP.

## 4. Image storage (Phase 1A principle held)

PoC uses only `File` + object URL + mock send state. **No** real upload, **no**
`autoflow-photos` public bucket, **no** `getPublicUrl`, **no** public URL stored on a
customer message. Real storage = a private bucket + signed URLs, designed and
security-reviewed before connection — **BLOCKED / follow-up**.

## 5. Feature flag & isolation

`isCustomerServiceConsoleEnabled()` = `NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE === '1'`
(OFF by default; production must not expose the PoC). Reachable only at the isolated
route `app/customer-console/page.tsx`.

**/chat mode-toggle integration is intentionally deferred.** The brief asks for a
"직원 채팅 / 고객 서비스" toggle inside the 1200-line `app/chat/page.tsx`. To honor the
hard "no staff-chat regression" constraint (which cannot be browser-verified here), the
PoC ships on an isolated route that carries zero `/chat` risk. Wiring the flag-gated
toggle into `/chat` is a small, well-scoped follow-up once the UX + clipboard are
accepted.

## 6. Mock scenarios (`lib/customer-service/mock/customerConsoleMock.ts`)

zh-CN/503 (연장·가격 + internal memo), ja/308 (아침 택시), en/606 (버스정류장 + 고객
지도 이미지 + 직원 붙여넣기 답변), ru/205 (식당 위치, **번역 실패**). Never written to
any DB, never mixed into the staff chat stream.

## 7. Verification status

- tsc `--noEmit`: **0 errors** (whole project).
- Clipboard unit tests: **7/7 PASS** (`node --test`).
- Existing chat/translation/EXE: **0 changes** (git).
- Browser (Chrome) & EXE WebView clipboard 실기: **BLOCKED** (requires a human at the
  app; agent cannot drive paste). Procedure below.
- `next build`: not run (avoids a heavy build; tsc is the type gate). Marked pending.

## 8. 실기 procedure (user)

Enable `NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE=1`, `npm run dev`, open `/customer-console`.
Test: Win+Shift+S capture → Ctrl+V (preview appears) → remove → re-paste (previous URL
revoked) → type Korean → 전송 (mock translated bubble) → plain text Ctrl+V (unaffected)
→ non-image/oversize (rejected with message) → 내부 메모 mode (not sent to guest). Then
repeat inside the installed AutoFlow EXE WebView (Win+Shift+S → Ctrl+V). If the EXE
WebView does not deliver the clipboard image to the web `paste` event, THEN (and only
then) investigate a Tauri clipboard bridge — do not add a Tauri plugin before that.
