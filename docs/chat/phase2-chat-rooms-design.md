# Phase 2 — 채팅방 생성 설계 (구현 보류)

> Phase 1은 UI/UX만 변경. 본 문서는 조사·제안만 포함하며 **코드/스키마 변경 없음**.

## 현재 구조 조사

### 1. 대화방 (`chat_rooms`) — 멀티 유저 채팅

| 항목 | 상태 |
|------|------|
| Migration | `supabase/migrations/20250323120000_chat_rooms_and_participants.sql` |
| 테이블 | `chat_rooms(id, name, created_at)`, `chat_room_participants(room_id, user_id, role, status, …)` |
| API | `GET /api/chat/rooms/[roomId]/participants` |
| UI | `RoomParticipantsPanel` on `/chat` |
| Gap | `chat_messages`는 **`room_no`(호텔 객실)** 텍스트만 사용, `chat_rooms.id` FK **미연결** |

### 2. 운영 객실 (`rooms`) — 호텔 층/상태

| 항목 | 상태 |
|------|------|
| Migration | `supabase/migrations/20260513100000_rooms_and_timeline_view.sql` |
| 테이블 | `rooms(room_no, floor, status, notes)` |
| View | `room_timeline` (message_intents + tickets + ops_queue) |
| Staff | `staffRoomOptions.ts` — 객실 선택은 **메시지 메타**로만 사용 |

### 3. 메시지 (`chat_messages`)

- 단일 글로벌 타임라인 + `room_no` 태그 (필터는 클라이언트/쿼리 파라미터)
- `sender_side`: `pc` | `mobile`
- Realtime: `chat_messages` publication 활성 (`20260623100000_…`)

**결론:** 앱은 **단일 기본 채팅방** + `room_no` 라벨 구조. `chat_rooms`는 참가자 관리 POC 수준이며 메시지와 미통합.

---

## Phase 2 최소 제안

### 목표

- 새 채팅방 생성·참여 without breaking `/chat`, `/staff-chat`
- 기본방 fallback 필수

### DB (제안만)

```sql
-- chat_messages에 nullable FK 추가 (기존 row는 NULL = 기본방)
alter table chat_messages
  add column if not exists chat_room_id uuid references chat_rooms(id);

-- 기본방 시드 (이미 있으면 skip)
insert into chat_rooms (id, name) values ('00000000-0000-0000-0000-000000000001', '전체 채팅')
  on conflict do nothing;
```

- 기존 메시지: `chat_room_id IS NULL` → 클라이언트/API에서 **기본방 ID로 해석**
- 신규 메시지: 명시적 `chat_room_id` (없으면 env `NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID`)

### API (제안만)

| Endpoint | 역할 |
|----------|------|
| `POST /api/chat/rooms` | 방 생성 (name, initial participants) |
| `GET /api/chat/rooms` | 내가 참여 중인 방 목록 |
| `GET /api/chat/list?room_id=` | 방별 메시지 (없으면 기본방) |

**변경 금지 (Phase 2 초기):** 기존 `GET /api/chat/list` 시그니처 — `room_id` optional 추가만.

### 클라이언트 fallback

```text
effectiveRoomId = selectedRoomId ?? env.DEFAULT_CHAT_ROOM_ID ?? LEGACY_GLOBAL
```

- `/chat`: 사이드바 방 목록 + 선택; 미선택 시 현재와 동일한 전체 타임라인
- `/staff-chat`: 변경 없음 (기본방만) until Phase 3

### Phase 2 / 3 분리

| Phase | 범위 |
|-------|------|
| **2** | 방 CRUD, `chat_room_id` on messages, list filter, 기본방 fallback |
| **3** | unread count, pin, push per-room, 관리자 삭제 권한 |

---

## 리스크

1. **Realtime filter** — room별 subscribe 필요 시 채널 설계 변경
2. **staff-chat** — 모바일은 단일방 유지 권장 (Phase 2)
3. **room_no vs chat_room_id** — 호텔 객실 번호와 대화방 ID 혼동 방지 (UI 라벨 분리)

---

## Phase 1과의 경계

Phase 1 (알림음, emoji UI, 삭제 UI)은 **메시지 렌더/사운드 레이어**만 수정.  
본 Phase 2 설계는 **승인 후 별도 브랜치**에서 migration + API + UI 순으로 진행.
