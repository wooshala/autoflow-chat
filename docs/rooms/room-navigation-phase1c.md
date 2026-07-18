# Room Navigation — Phase 1C (message-centric → room-centric console)

Status: **Room-centric left navigation on the existing `/chat` 3-panel ops console**,
behind a new flag. Mock rooms, no DB, no deploy. Builds on Phase 1A (`customer_*` data
boundary) + Phase 1B (customer console) at base `c0417da`. The one goal: replace the
message-derived "최근 대화" sidebar with a Room-centric list so an operator moves
청소팀 → 고객방 → 프런트 → 정비팀 instantly (§1, §16).

## 1. Flag + fail-safe

`isRoomNavigationEnabled()` = `NEXT_PUBLIC_ROOM_NAVIGATION === '1'` (OFF by default),
**separate** from `NEXT_PUBLIC_CHAT_OPS_CONSOLE` (which turns on the 3-panel layout).
Room Navigation only activates **inside** the 3-panel branch (`showOpsConsole`), so:

| CHAT_OPS_CONSOLE | ROOM_NAVIGATION | Result |
|---|---|---|
| 0 | 0/1 | plain `/chat` (mobile/legacy) — untouched |
| 1 | 0 | current 3-panel + existing ChatParticipantSidebar |
| 1 | 1 | current 3-panel + new RoomNavigation |

If the 3-panel is off, Room Navigation is inert (fail-safe fallback to existing UI).

## 2. `/chat` wiring is minimal (no large refactor)

`app/chat/page.tsx` changes: 5 imports + `roomNavigationEnabled` + two ternaries
(`leftSidebar`, `centerColumn`) + a `layoutBody` hoist wrapped in `RoomNavigationProvider`
when on. `sendMessage`, the chat hooks (`useChatRealtime`/`useChatWatchdog`/`useChatLoader`),
all ticket/lost-found/maintenance handlers, `chatMessageList`, `chatComposer`, the right
`ChatOperationPanel` (Event Center) and `ResizableChatLayout` are **unchanged**.

## 3. Center renderer — shell shared, renderers separate (Q3=b)

`RoomCenter` switches by `room.kind`:

- **staff-global (real)** → the existing staff center tree (`staffGlobalSlot`) returned
  **as-is, no added wrapper/scroll/padding** (1C.1). It is kept **always mounted**:
  `display:contents` when active (zero layout box → identical to the original tree),
  `hidden` when not. Because the page never unmounts and the draft/subscription/loader
  live on the page, and the timeline DOM is never destroyed, **scroll position,
  in-progress draft, realtime subscription and message loader all survive room switches**
  (1C.2). See the ownership table below.
- **staff-mock (DEV)** → `MockStaffRoom` (local-state timeline + input, no translation,
  no DB; a banner marks it DEV so it is never mistaken for the real staff chat).
- **customer** → `CustomerRoom` = Phase 1B `CustomerRoomTimeline` + `CustomerReplyComposer`,
  keyed by `room.id`.

### Chat-state ownership (pre-coding investigation)

| State | Owner | On room switch |
|---|---|---|
| draft (`text`/`photo`/`preview`/`roomNo`/`urgentMode`) | `ChatPage` useState | preserved (page never unmounts) |
| realtime / watchdog / loader | `ChatPage` top-level hooks | not re-run → no duplicate subscription, no re-fetch |
| timeline scroll position | DOM `<section ref=listRef>` | preserved because staff center is never unmounted (display:contents/hidden toggle) |

## 4. Room entity (independent, mock)

`lib/rooms/roomTypes.ts` `Room` is an independent entity, **not** derived from messages
(§7), shaped close to a future `chat_rooms` / `customer_conversations` row. Exactly one
room is real: `kind: 'staff-global'` ('직원 전체'). Everything else is `isDev: true` mock.

Seed (`roomsMock.ts`): 직원 전체(real) · 청소팀/프런트/정비팀(DEV mock) · 5 customer rooms
503 中文 / 308 日本語 / 606 English / 701 Русский / 502 中文 (§9). Customer message bodies
reuse the Phase 1B mock. Team rooms are **not** wired to real `chat_messages` (no team
backing exists yet — §2); real per-team rooms are a follow-up needing `chat_rooms` +
`room_id` on messages.

## 5. Left navigation behavior (mock/local state — §4/§8)

`RoomNavigation` = 대화방 header + `+ 새 채팅방` + search + tabs (전체/내 대화방/즐겨찾기)
+ sectioned `RoomList` (직원 채팅 / 고객 채팅방 / 최근 대화방 / 휴지통). All backed by pure
functions in `roomsQuery.ts` (unit-tested, 7/7):

- **search**: title / room number / language code (title embeds the language name).
- **tabs**: 전체 = all active, 내 대화방 = `isMine`, 즐겨찾기 = favorites set.
- **즐겨찾기**: local toggle. **새 채팅방**: modal → local room (일반/청소/정비/프런트), auto-selected.
- **휴지통**: archived rooms (the real staff room can never be trashed; archiving the open
  room falls back to 직원 전체). **최근 대화방**: small section (§10), most-recently-selected.

No refresh persistence, no localStorage, no DB writes.

## 6. Draft-leak policy on room switch (1C.3)

`CustomerReplyComposer` is mounted with `key={room.id}`, and `CustomerRoom` itself is keyed
by room id in `RoomCenter`. Switching customer rooms unmounts the composer → its unmount
effect **revokes any pending preview object URL** and the new room starts with an empty
draft. A half-typed reply or attached image can never be silently sent to another room.
No confirm dialog / draft persistence (out of scope, per brief).

## 7. Phase 1B extraction (behavior-preserving)

`CustomerConsole` (Phase 1B) was split so Room Navigation can reuse it:
`CustomerRoomTimeline` (+ `MessageBubble`, `fmtTime`) and `CustomerReplyComposer`.
`CustomerConsole` now only assembles the left list + center + right shell. Translation
adapter and `clipboardImage` are **unchanged** (§13). Render order, paste handling,
internal-memo toggle and mock send are identical.

**One intentional lifecycle change (safer):** in Phase 1B, switching conversations kept a
pending pasted image alive; now the composer is keyed per room/conversation, so switching
revokes that pending preview and clears the draft. This removes a cross-room image-leak
and matches the 1C anti-leak requirement. It is the only behavior delta from the 1B console.

## 8. Verification

- tsc `--noEmit`: **0 errors** (whole project).
- Unit tests: `roomsQuery` **7/7**, `clipboardImage` **7/7** (regression) — `node --test`.
- Existing tracked files changed: **only 2** — `app/chat/page.tsx` (minimal wiring,
  +47/−12) and `components/customer-service/CustomerConsole.tsx` (extraction, −276/+12).
  ChatMessages, ChatInput(composer), sendMessage, chat hooks, ChatParticipantSidebar,
  ResizableChatLayout, ChatOperationPanel (Event Center), `/api/chat`, `src-tauri`,
  translation modules, `clipboardImage`: **0 changes**.
- `next build`: not run (tsc is the type gate).

### 실기 체크리스트 (user — BLOCKED, agent cannot drive the browser/EXE)

Enable `NEXT_PUBLIC_CHAT_OPS_CONSOLE=1` + `NEXT_PUBLIC_ROOM_NAVIGATION=1`, `npm run dev`,
open `/chat`. The §16 sequence:

1. 직원 전체 선택 → 실제 직원 채팅 정상(메시지/전송/번역/사진/분실물/시설고장 그대로).
2. 청소팀(mock) → mock 팀 대화 + DEV 배너.
3. 503호 중국어 고객방 → 고객 번역 UI(원문/ko/펼침), Ctrl+V 붙여넣기 미리보기.
4. **직원 전체 복귀 → 스크롤 위치·작성 중 문장·실시간 연결 유지 확인** (display:contents 토글의 실효 검증; 만약 스크롤/레이아웃 이상 시 hidden-only로 강등하고 상태유실을 재검증).
5. Event Center(우) + 좌우 리사이즈 유지 확인.
6. 새 mock 방 생성 → 즉시 선택 가능.
7. 검색/내 대화방/즐겨찾기/휴지통 동작, 방 이동 시 고객 draft·이미지 미누출 확인.
8. 방 전환 지연 체감 0 (§16).

`display:contents`/room switching는 EXE WebView(Chromium)에서도 재확인. 미실행 항목은 BLOCKED.
