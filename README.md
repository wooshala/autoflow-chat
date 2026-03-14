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

## 다음 단계 추천
- Supabase Realtime 연결
- 인증 JWT화
- 역할별 권한 분리
