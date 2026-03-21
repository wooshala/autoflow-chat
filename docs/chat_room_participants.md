# 채팅방 참가자 (최소 구조)

## 1. 테이블 설계 / Migration

- 파일: `supabase/migrations/20250323120000_chat_rooms_and_participants.sql`
- 동일 정의: `supabase/schema.sql` (`chat_rooms`, `chat_room_participants`, 부분 인덱스)

요약:

- `chat_rooms`: `id`, `name`, `created_at`
- `chat_room_participants`: `room_id` → `chat_rooms`, `user_id` → `users`, `role` (`owner` | `admin` | `member`), `status` (`active` | `removed`), `joined_at`, `removed_at`, `UNIQUE(room_id, user_id)`

## 2. 수정·추가 파일 목록

| 파일 | 내용 |
|------|------|
| `supabase/migrations/20250323120000_chat_rooms_and_participants.sql` | 신규 migration |
| `supabase/schema.sql` | 동일 테이블·인덱스 반영 |
| `lib/types.ts` | `ChatRoomParticipantRole`, `ChatRoomParticipantStatus`, `ChatRoom`, `ChatRoomParticipant` |
| `components/RoomParticipantsPanel.tsx` | 참가자 패널 UI 자리 |
| `app/chat/page.tsx` | 헤더 아래 `RoomParticipantsPanel` 삽입 |
| `docs/chat_room_participants.md` | 본 문서 |

## 3. 참가자 관리 UI 위치

- **경로**: `app/chat/page.tsx` — 상단 헤더(`AutoFlow 채팅`) **바로 아래**, 메시지 스크롤 영역(`ChatMessages`) **위**.
- **컴포넌트**: `RoomParticipantsPanel` — `👥 참가자` 접기/펼치기, 펼쳤을 때 **초대** 버튼 자리 + **참가자 목록** + 행별 **내보내기** 자리.

## 4. 미구현 권한 TODO

- **RLS**: `chat_rooms` / `chat_room_participants`에 대한 SELECT/INSERT/UPDATE 정책 미적용.
- **역할**: `owner`/`admin`만 초대·내보내기 허용 — **서버 API에서 검증** 필요.
- **내보내기**: 본인 제외, `removed` 처리 및 `removed_at` 기록 — API + 정책.
- **단일 기본 방**: 앱에서 사용할 `room_id` 결정(시드 또는 `NEXT_PUBLIC_…`) — 미연결.
- **메시지와 방 연결**: `chat_messages`에 `room_id` FK 추가 여부는 다음 단계에서 결정.

## 5. 다음 단계에서 붙일 API (제안)

| Method | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/chat/rooms` 또는 `/api/chat/rooms/default` | 기본 방·메타 |
| `GET` | `/api/chat/rooms/:roomId/participants` | `status=active` 참가자 + user 조인 |
| `POST` | `/api/chat/rooms/:roomId/invite` | `user_id` 또는 pin/초대 토큰으로 추가, role 기본 `member` |
| `POST` | `/api/chat/rooms/:roomId/participants/:userId/remove` | soft remove (`status`, `removed_at`) |
| `PATCH` | (선택) `/api/chat/rooms/:roomId/participants/:userId` | `role` 변경 (owner/admin만) |

서비스 롤 또는 세션 검증은 각 라우트에서 TODO 해제 시 적용.
