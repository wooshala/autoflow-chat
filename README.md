# AutoFlow MVP (ChatGPT build)

## 핵심
- Next.js App Router
- 채팅 1개 방 구조
- 객실번호 키패드 입력
- 사진 업로드
- 유지보수 티켓 생성
- 채팅 ↔ 유지보수 자동 연결
- mock / production 모드 분리

## 빠른 시작
1. `.env.local.example` 를 `.env.local` 로 복사
2. 개발은 우선 `NEXT_PUBLIC_APP_MODE=mock`
3. `npm install`
4. `npm run dev`

## 기본 PIN
- 관리자: 0000
- 프론트: 1111
- 베트남 청소팀: 2222
- 러시아 청소팀: 3333

## 현재 구현 범위
- PIN 로그인
- 채팅 목록 조회
- 메시지 전송
- 사진 업로드(mock/prod)
- 유지보수 생성
- 유지보수 목록/상세
- 완료 처리 + 완료 사진

## 자동 티켓 정책 (chat/send)
- AI 파싱 결과 `issue_type` 이 `maintenance` 또는 `cleaning` 이면 자동 티켓 생성 대상
- 객실번호는 `aiResult.room` 우선, 없으면 메시지 정규식 추출값(`fallbackRoom`) 사용
- 최종 객실번호(`resolvedRoom`)가 없으면 티켓 생성 스킵
- 중복 방지(기본): 최근 10분 내 같은 객실 + 같은 `issue_type` 티켓이 있으면 생성 스킵
- 중복 예외: `is_new_issue === true` 이고, 기존 최근 요약과 현재 `summary`가 다르면 생성 허용
- 재발 키워드 예외: `또`, `아직`, `다시`가 `summary`에 포함되고 `is_new_issue === true`면 중복이어도 생성 허용
- 생성 성공 시 채팅 메시지 `ticket_id`를 업데이트하여 메시지-티켓 연결
- 자동판단 결과는 `chat_messages.ai_action` 에 기록
  - `ticket_created`
  - `skip_duplicate`
  - `skip_not_ticketable`
  - `skip_no_room`
  - `skip_ai_error`

## 자동 티켓 스킵 사유 로그
- `duplicate`: 중복 규칙으로 스킵
- `not_ticketable`: `issue_type` 이 티켓 대상이 아님 (예: `lost_found`)
- `no_room`: `resolvedRoom`을 만들 수 없음
- `ai_error`: AI 호출/파싱 과정 예외
- 공통 포맷: `[AUTO_TICKET_SKIP] { message_id, reason, ...detail }`

## 채팅 UI ai_action 뱃지
- `ticket_created` → `✅ 티켓 생성`
- `skip_duplicate` → `⚠️ 중복 스킵` + 안내 문구
- `skip_not_ticketable` → `⛔ 티켓 대상 아님`
- `skip_no_room` → `❓ 객실번호 없음`
- `skip_ai_error` → `🔥 AI 오류`

## 다음 단계 추천
- Supabase Realtime 연결
- 인증 JWT화
- 역할별 권한 분리
