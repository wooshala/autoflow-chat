# Phase 4 — CHAT_LIST_LOAD_ABORT 원인 조사

상태: **조사 예정 (원인 확정 목표)** · 분리 출처: Phase 3C

> 이 문서는 **조사·원인 확정만** 다룬다. **수정안 작성은 금지.**

---

## 목적

WebView에서 발생하는 `CHAT_LIST_LOAD_ABORT`(메시지 목록 "불러오지 못했습니다")의
원인을 **증거 기반으로 확정**한다.

Phase 3C에서 다음까지 확인됨(사실):
- `/api/chat/list` = HTTP 200 정상 (서버 / RLS / env 문제 아님)
- `CHAT_WATCHDOG_HIDDEN_POLL` 이후 `CHAT_LIST_LOAD_ABORT` 발생
- WebView 환경에서 재현
- 프로덕션 origin/main에도 동일 로직 존재(`useChatLoader.ts` / `useChatWatchdog.ts`)

현재까지 증명된 것: **watchdog와 list load가 경쟁(race)하여 AbortController가 load를 취소한다.**
아직 미확정: `document.hidden` / `visibilityState` / `onResume()`·`onPause()`와의 인과관계.

---

## 조사 항목

- `document.hidden` — WebView 런타임 실측값
- `document.visibilityState` — WebView 런타임 실측값
- Page Visibility API — WebView에서의 실제 동작/이벤트 발생 여부
- WebView `onResume` / `onPause` — 호출 여부와 visibility 전파 관계
- `AbortController` — 어느 경로(신규 로드 대체 / 언마운트 / initial-retry)에서 abort되는지
- hidden poll — `HIDDEN_POLL`이 initial load와 겹치는 타이밍
- reconnect — `not_connected_recover_full` 재로드가 abort에 관여하는지
- initial load — initial 로드가 완료 전 취소되는지, 재시도 성공 여부
- race 여부 — watchdog 재로드와 initial load의 실제 경쟁 타이밍 계측
- PC 재현 여부 — 포커스된 데스크톱 브라우저 탭에서 재현되는지
- WebView 전용 여부 — WebView에서만 발생하는지

---

## 조사 방식 (계측 중심, read-only)

- WebView 런타임에서 `document.hidden` / `document.visibilityState`를 실측 로깅으로 확보
- `CHAT_LIST_LOAD_ABORT`의 `source` 값(initial / hidden_tab_poll / reconnect / unmount)을 로그로 분리
- PC 브라우저와 WebView 각각에서 initial load ~ 첫 watchdog tick 타이밍 비교
- abort 이후 재시도 결과(성공/지속실패)와 화면 표시 상관관계 확인

---

## 산출물

- 원인 확정문 (증거 링크 포함)
- 재현 조건 (WebView 전용 여부, PC 재현 여부 포함)

> 수정안·코드 변경은 이 문서 범위 밖. 원인 확정 후 별도 Phase에서 다룬다.
