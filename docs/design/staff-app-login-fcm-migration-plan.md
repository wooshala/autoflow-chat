# Staff App: 초대 링크 → 로그인/FCM 구조 전환 (Phase 0 설계)

> 상태: **Phase 0 — 조사·설계만.** 코드 수정·DB 마이그레이션·배포·커밋·APK 재빌드 없음.
> 목표: 직원앱이 **아이콘 실행 → 직원 코드/PIN 로그인 → 채팅 진입 → FCM 디바이스 등록 → 앱 종료 상태에서도 알림 수신** 구조로 전환. 단, 회귀 방지를 위해 **기존 invite 흐름을 병렬 유지(fallback)** 하며 단계적으로 이행하고, invite 제거는 **마지막 단계**에서만.

---

## 1. 수정 없음 확인
이 문서 작성 외 **어떤 코드/DB/배포/커밋/APK 변경도 하지 않았다.** 아래는 전부 코드 근거 기반 조사 결과이며, 구현은 **승인 후** 별도 진행한다.

(참고: 직전 긴급 복구로 `android-staff/.../MainActivity.kt`(초대 토큰 재주입), `AndroidManifest.xml`(https deep-link intent-filter)가 **working tree에 미커밋 상태로 존재**. 이 문서의 이행 계획과 별개이며, Phase 5 전까지 유지/조정 대상.)

---

## 2. 현재 구조 요약 (코드 근거)

### 2-1. Invite token 흐름 (배포=HEAD 기준, 현재 운영 중)
- **/staff-chat bootstrap** — `app/staff-chat/StaffChatClient.tsx` `bootstrapInvite()`:
  - `urlToken = readInviteTokenFromUrl()` (URL `?t=`) `||` `storedToken = loadStoredInviteToken()` (localStorage)
  - `token`이 있으면 `GET /api/staff/invites?token=…&check=any&device_key=…` 서버검증 → `INVITE_REVOKED`면 `'revoked'`(+`clearStoredInviteToken`), ok면 `'ready'`(+urlToken일 때 `saveStoredInviteToken`), 실패면 `'invalid'`.
  - **token이 전혀 없으면 즉시 `'invalid'`** ("잘못된 링크 - 초대장").
- **localStorage invite token** — `lib/auth/staffInviteSession.ts`: `STAFF_INVITE_TOKEN_STORAGE_KEY = 'autoflow_staff_invite_token_v1'`, `loadStoredInviteToken()=localStorage.getItem(...)`, `saveStoredInviteToken`, `clearStoredInviteToken`.
- **/api/staff/invites** — `app/api/staff/invites/route.ts`: 토큰 검증, `INVALID_INVITE`(404), `INVITE_REVOKED`. invite = `{id, display_name, role, user_id, enabled, revoked_at, token}` (`staff_invites` 테이블).
- **revoked 처리** — 서버 `INVITE_REVOKED` → 클라 `'revoked'` phase + 저장 토큰 제거.
- **Android MainActivity launch URL** — `resolveLaunchUrl(intent)`: 딥링크(`intent.dataString`, `WEB_BASE_URL` prefix) 또는 `STAFF_CHAT_URL = https://autoflow-mvp.vercel.app/staff-chat`(무토큰). `onPageStarted→captureInviteTokenFromUrl`(URL `?t=`→StaffPrefs), `onPageFinished→captureInviteTokenFromWebStorage`(localStorage→StaffPrefs).
- **FCM device register ↔ invite** — `StaffDeviceRegistrar.tryRegister`는 **fcmToken + inviteToken 둘 다 있어야** 실행. `POST /api/staff/devices/register {invite_token, fcm_token, platform, device_key, device_label, app_version}` → 서버 `resolveActiveInvite` → 디바이스를 `staff_invite_id` + 해석된 `user_id`에 바인딩.

### 2-2. FCM 흐름
- **Android FCM token 획득** — `MainActivity.refreshFcmToken()` → `FirebaseMessaging.token` → `StaffPrefs.setFcmToken` → `StaffDeviceRegistrar.tryRegister`.
- **register 호출 조건** — `fcmToken`·`inviteToken` **둘 다 non-blank일 때만**(없으면 early-return). ⇒ **invite 없으면 등록 자체가 안 됨.**
- **device token 바인딩 대상** — `staff_device_tokens {id, staff_invite_id, user_id, fcm_token, platform, device_key, device_label, app_version, enabled, last_seen_at, …}` (`lib/services/staffDevices.ts`). invite로부터 `user_id` 해석해 함께 저장.
- **발송 대상** — `sendStaffPushAfterMessage(message)` → `listEnabledStaffPushTargets()` → `sendStaffFcm`. `STAFF_FCM_ENABLED='1'` 가드.
  - `listEnabledStaffPushTargets`: `staff_device_tokens` enabled=true, `staff_invites` join. **필터: `if (!row.staff_invite_id) return true;`** (=**invite 없는 user_id-only 디바이스도 타깃 포함**), invite 있는 경우만 `enabled && !revoked_at` 요구.
  - 발신자 제외: `excludeSenderDeviceTokens`가 `t.user_id === senderUserId` 디바이스 제외.
  - > **핵심 함의**: 발송 타깃팅은 **user_id 기준으로도 정상 동작**. 로그인/account 기반 디바이스(`staff_invite_id=null`, `user_id=계정user`)를 등록해도 **발송 로직 변경 불필요.**

### 2-3. 미완성 로그인 WIP (working tree 전용, 미커밋, 빌드 깨짐)
- **StaffChatClient.tsx (working tree)** — `InvitePhase`에 `'login'|'deactivated'` 추가. `handleLogin`이 `POST STAFF_LOGIN_URL {account_id, login_code, device_key}` → `{sessionToken, account: StaffAccountPublic}` → `saveStaffSession`. roster `STAFF_LOGIN_ROSTER_URL`, 세션검증 `STAFF_SESSION_URL`. 무토큰·무세션 폴백 → `'login'`.
- **lib/chatApi.ts (미커밋 상수)** — `STAFF_LOGIN_URL='/api/staff/login'`, `STAFF_LOGIN_ROSTER_URL='/api/staff/login/roster'`, `STAFF_LOGOUT_URL='/api/staff/logout'`, `STAFF_SESSION_URL='/api/staff/session'`. HEAD엔 없음.
- **존재하지 않는 모듈 (import 대상)**:
  - `lib/auth/staffAccountSession.ts` — `saveStaffSession/loadStoredSessionToken/clearStaffSession/staffSessionAuthHeaders/accountPublicToInviteSession/clearLegacyInviteStorageOnce`
  - `lib/services/staffAccounts.ts` — `StaffAccountPublic` 타입 + 계정 서비스
- **없는 API 라우트**: `/api/staff/login`, `/api/staff/login/roster`, `/api/staff/session`, `/api/staff/logout` (디스크·전 브랜치·전 커밋 모두 없음).
- **빌드 깨지는 원인**: `StaffChatClient.tsx`가 위 **없는 모듈 2개를 import** → `next build` = `Module not found: @/lib/auth/staffAccountSession` (+ `@/lib/services/staffAccounts`). 라우트 4개는 런타임 404(빌드는 모듈에서 먼저 실패).
- **기존 인증 모델**: `lib/auth/staffUsers.ts` = "Core v0.1: minimal multi-user identity without full auth" — **env 기반 user key**(`manager|cleaner1|cleaner2`, `NEXT_PUBLIC_STAFF_USER_*_ID`)뿐. **login_code/PIN·계정 테이블·세션 발급 없음** → 로그인 백엔드는 **신규 구축 필요.**

---

## 3. 회귀 위험 영역 (기존 운영 기능 영향)

| 기능 | 관련 파일 | 이번 전환의 접점 | 영향 | 회귀 방지 |
|---|---|---|---|---|
| 관리자 `/chat` | `app/chat/*`, `app/api/chat/*` | 없음(로그인은 `/staff-chat` 한정) | **없음** | `/chat`·`/api/chat/send`·`/api/chat/list` **수정 금지** |
| 모바일 `/staff-chat` 송수신 | `StaffChatClient.tsx`, `CHAT_SEND_URL` | phase 결정부만 손댐, 송수신 로직 불변 | **낮음** | 메시지 송수신 코드 hunk 미변경, phase 게이팅만 |
| 사진 업로드 | `MainActivity`(file chooser/카메라), send route | 로그인은 진입 게이트, 업로드 무관 | **낮음** | 카메라 hotfix·업로드 코드 미변경 |
| FCM 알림 | `StaffDeviceRegistrar`, `staffDevices`, `sendStaffPushAfterMessage` | 등록 바인딩(invite→account) 추가 | **중간** | user_id-only 타깃 이미 지원 → **발송 로직 불변**, 등록 경로만 병렬 추가 |
| 러시아어 TTS/번역 | `lib/chat/*Tts*`, `openAiChatTranslate`, `/api/staff/tts/*` | 없음 | **없음** | 관련 파일 **수정 금지** |
| 상용구(quick phrases) | `app/api/chat/quick-phrases/*`, `components/.../QuickPhrase*` | 없음 | **없음** | **수정 금지** |
| 읽음 표시 | `useChatReadState`, `chat_read_state` | 없음 | **없음** | 스키마·로직 **수정 금지** |

> 최대 위험 = **FCM 등록 경로**와 **StaffChatClient phase 게이팅**. 둘 다 "병렬 추가 + invite fallback 유지"로 회귀 최소화.

---

## 4. 필요한 신규/수정 파일 (수정 금지 파일과 분리)

### 4-A. 신규 생성 (없어서 만들어야 함)
- `lib/services/staffAccounts.ts` — `StaffAccountPublic` 타입 + 계정 조회/인증(login_code 검증) + 세션 발급/검증
- `lib/auth/staffAccountSession.ts` — 클라 세션 helper (localStorage session token 저장/조회/삭제, auth 헤더)
- `app/api/staff/login/route.ts` — `{account_id, login_code, device_key}` → 세션 토큰 + `StaffAccountPublic`
- `app/api/staff/session/route.ts` — `Bearer` 세션 검증 → `StaffAccountPublic` (or `ACCOUNT_DEACTIVATED`)
- `app/api/staff/logout/route.ts` — 세션 무효화
- `app/api/staff/login/roster/route.ts` — (선택) `{roster:[{accountId, displayName}]}` — **필요 여부 결정 대상**(코드 선택 UI에 쓰임; 미채택 시 코드 직접 입력 방식)
- (DB) `staff_accounts`, `staff_sessions` 마이그레이션 SQL — **설계만, 적용은 승인 후**

### 4-B. 수정 (병렬 이행 — 최소 diff)
- `app/staff-chat/StaffChatClient.tsx` — 로그인 WIP를 **완성**(없는 import 해소) + 무토큰→`login`, invite fallback 유지. **메시지 송수신 hunk 불변.**
- `lib/chatApi.ts` — 로그인/세션 상수(이미 working tree에 존재) 확정.
- `android-staff/.../StaffDeviceRegistrar.kt` — 세션/계정 기반 등록 경로 추가(**invite_token 경로 fallback 유지**). 등록 조건을 "session 있으면 session, 없으면 invite"로.
- `android-staff/.../MainActivity.kt` — 로그인 성공 후 FCM 등록 트리거 bridge(웹→네이티브) 필요 시. (딥링크/토큰 재주입은 fallback 기간 유지)

### 4-C. 수정 금지 (7절 참조)

---

## 5. DB 변경 필요 여부 — **필요(신규 테이블), 단 Phase 0에선 설계만**
기존엔 login_code/PIN 인증·세션 테이블이 **없음**. 최소 스키마(승인 후 마이그레이션):
- `staff_accounts` — `{id, display_name, login_code(or pin_hash), user_id, role, enabled, created_at}`
  - **결정 필요**: 신규 `staff_accounts` vs 기존 `staff_invites`(이미 `user_id/display_name/role` 보유)에 `login_code` 컬럼 추가 재활용. **권장: 신규 `staff_accounts`**(invite와 생명주기 분리, 회귀 위험↓).
- `staff_sessions` — `{session_token, account_id, device_key, expires_at, created_at, revoked_at}`
- **기존 테이블 변경 금지**: `chat_messages`, `chat_read_state`, `quick_phrases`, `translations`, `staff_device_tokens`(컬럼 추가는 신규 nullable만, 기존 무영향 — 필요 시 별도 승인), `staff_invites`(재활용 택하지 않는 한 불변).

---

## 6. 최소 구현 순서 (승인 후, 단계별 검증)
- **Phase 1 — 최소 로그인 백엔드**: `staff_accounts`/`staff_sessions` 결정·마이그레이션, `login_code` 인증, 세션 발급, `/api/staff/{login,session,logout}` (+roster 필요 시). **invite API 불변.**
- **Phase 2 — /staff-chat login phase 연결**: 없는 import 해소, 무토큰→`login`, 로그인 성공 시 세션 저장·검증→`ready`, **기존 invite token 있으면 임시 허용**. **메시지 송수신 로직 불변.**
- **Phase 3 — FCM 등록 연결**: 로그인 성공 후 device token을 **account/user_id**에 바인딩(`staff_invite_id=null`). invite 기반 등록은 fallback 유지. **발송 타깃 로직 불변(이미 user_id 지원).**
- **Phase 4 — APK 검증**: 설치→아이콘→로그인→코드입력→진입→FCM 등록 로그→**앱 종료 상태 PC 메시지→알림 도착**→알림 탭 진입→사진 촬영/전송 회귀.
- **Phase 5 — invite 제거(최후)**: 신규 로그인+FCM 실기기 검증 후에만 invite bootstrap 제거, revoked 화면 축소/관리자용, localStorage invite token 제거, Android 초대링크 의존 제거.

---

## 7. 절대 건드리면 안 되는 파일/영역
- `app/chat/**` (관리자 화면), `app/api/chat/send/**`, `app/api/chat/list/**`
- `app/api/chat/quick-phrases/**`, `components/chat/QuickPhrase*`, `components/staff-chat/*QuickPhrase*`, `lib/services/quickPhrases.ts`
- 번역/TTS: `lib/chat/openAiChatTranslate.ts`, `lib/chat/serverTts*`, `app/api/staff/tts/**`
- 읽음: `lib/hooks/useChatReadState.ts` 및 `chat_read_state`
- DB 스키마: `chat_messages`, `chat_read_state`, `quick_phrases`, `translations`
- 숙박일지/Univer/상용구/카메라 기능 파일 전반
- **운영 데이터 삭제 금지**, **Vercel 배포/커밋/APK 재빌드 금지**(별도 승인)

---

## 8. 테스트 체크리스트
- [ ] `next build` 성공(없는 모듈 해소 후)
- [ ] 무토큰 `/staff-chat` → **login 화면**(‘invalid’ 아님)
- [ ] 잘못된 login_code → 오류, 정상 코드 → 세션 발급·`ready`
- [ ] 세션 저장 후 아이콘 재실행 → 세션 검증 → 자동 진입
- [ ] 기존 invite `?t=` 진입 여전히 동작(fallback)
- [ ] 로그인 후 FCM device 등록 로그(account/user_id 바인딩)
- [ ] **앱 종료 상태에서 PC→모바일 메시지 → 알림 도착**, 발신자 자기 제외 유지
- [ ] 알림 탭 → 해당 채팅 진입
- [ ] 사진 촬영/전송 회귀 없음
- [ ] 관리자 `/chat` 송수신·읽음·상용구·TTS 회귀 없음

---

## 9. 구현 전 승인 요청 (결정 필요 항목)
1. **계정 저장소**: 신규 `staff_accounts`(권장) vs 기존 `staff_invites` 재활용?
2. **인증 방식**: login_code(공유코드) vs 개인 PIN(계정별)?
3. **roster 화면 채택 여부**(계정 목록 선택 UI) vs 코드 직접 입력?
4. **세션 만료 정책**(만료 시간·기기당 다중 세션 허용?)
5. **DB 마이그레이션 적용 시점**(Phase 1 승인 시)
6. **FCM 등록 트리거**: 웹 로그인 성공 → 네이티브 bridge로 등록 vs 네이티브가 세션 토큰 보관 후 등록?
7. **fallback 기간**: invite 흐름 병행 유지 기간·제거(Phase 5) 조건.

> 위 7개 결정 후 **Phase 1부터** 구현 착수. Phase 0 산출물은 이 문서뿐이며 코드/DB/배포 변경 없음.
