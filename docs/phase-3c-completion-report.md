# Phase 3C 완료 보고서 — Android 세션 기반 FCM 디바이스 등록

상태: **완료 (디바이스 등록까지)** · 작성일: 2026-07-04

---

## 1. 목적

Android 직원앱이 **초대 토큰 없이도**, 웹 로그인(staff-account session) 기반으로
FCM device token을 `/api/staff/devices/register`에 등록하게 한다.
세션 토큰이 있으면 Bearer 방식으로 등록하고, 없으면 기존 invite 방식으로 폴백한다.

> 범위: **디바이스 등록까지만.** 실제 푸시 발송(STAFF_FCM_ENABLED=1, Firebase env)은 이번 Phase 밖.

---

## 2. 변경 파일 (android-staff, MainActivity 최종 기준)

| 파일 | 변경 |
|---|---|
| `app/src/main/java/com/autoflow/staff/StaffPrefs.kt` | session token 저장/조회/삭제 (`KEY_SESSION_TOKEN`) |
| `app/src/main/java/com/autoflow/staff/StaffDeviceRegistrar.kt` | 세션 있으면 `Authorization: Bearer`로 등록하고 invite_token 미포함(요청 단위 상호배타). 없으면 기존 invite 경로. fcm+자격증명 없으면 skip |
| `app/src/main/java/com/autoflow/staff/MainActivity.kt` | 로그인 후 세션 토큰 캡처: **onResume→3초 간격 foreground 폴링**, 토큰 발견 시 저장+등록 후 중단, onPause/onDestroy에서 중단, 중복 폴링·중복 등록 방지, 토큰 값 로그 금지 |

웹/백엔드/DB/AndroidManifest/카메라·file chooser/FCM env **무변경**.
(`google-services.json`은 빌드 산출용 비밀파일로 커밋 제외 — Firebase 초기화에 필수.)

---

## 3. 커밋 (로컬 브랜치 `feature/staff-fcm-android-3c`, push 안 함)

| 커밋 | 내용 |
|---|---|
| `728fe6c` | chore(android): 이미 배포된 카메라/파일선택 hotfix를 3C base로 스냅샷 (무기능변경) |
| `7d5cec2` | feat(android): 세션 기반 FCM 디바이스 등록 (StaffPrefs/StaffDeviceRegistrar/MainActivity + register route/staffDevices) |
| `7ef9ded` | fix(android): foreground 폴링으로 로그인 후 세션 캡처 (MainActivity 1개, +52/-2) |

---

## 4. 검증 결과 (실기기 samsung SM-A165N, Cleaner-1)

| 검증 | 결과 |
|---|---|
| ✅ 앱 재시작 없이 로그인 후 자동 등록 | 앱 포그라운드 유지 중 로그인 → 폴링이 ≤3초 내 세션 캡처 → 등록 |
| ✅ staff_invite_id = null | 세션 경로(invite_token 미전송) 확인 |
| ✅ user_id = Cleaner-1 | `f64c5872-6e38-4473-a0bf-a51dba23487b` |
| ✅ last_seen_at 갱신 | `2026-07-04T00:12:23.927Z` (09:12 KST, 등록 시점) |
| ✅ device_key 생성 | `android_e6f6ffa8-8c7e-4638-a807-9b249bba5cf9` (초기화 후 신규) |
| ✅ register HTTP 2xx | SharedPrefs `last_register_ok_at` set (2xx에서만 기록) + 독립 재현 200 |
| ✅ Firebase crash 없음 | `FirebaseInitProvider: initialization successful`, FATAL 0건, 앱 생존 |
| ✅ 토큰 값 로그 비노출 | 로그는 `present=true`/`present=false`만, 토큰 문자열 없음 |

### 진행 중 발견·해결한 이슈
1. **초기 crash** — 격리 워크트리에 `google-services.json` 부재로 빌드돼 Firebase 미초기화
   → `FATAL: Default FirebaseApp is not initialized`. json 배치 후 클린 재빌드로 해소(소스 무관, 빌드 환경 문제).
2. **첫 로그인 미등록** — 유한(18초) 폴링 창이 로그인 前 만료. 로그인은 in-page(리로드 없음)라
   onPageFinished 재발 없음 → **foreground 폴링(onResume~onPause)** 으로 보정. 재검증 통과.

---

## 5. 로그 증거

```
# 앱 실행/재빌드 후 (Firebase 정상)
I FirebaseInitProvider: FirebaseApp initialization successful
# 세션 캡처 (토큰 값 없음, presence만)
D AutoFlowStaff: staff session token: present=true
# FATAL 없음 / 앱 생존(pidof 유효)
```

SharedPrefs (`autoflow_staff_native`, 값 마스킹):
`fcm_token=PRESENT, session_token=PRESENT, device_key=PRESENT, last_register_ok_at=PRESENT, invite_token=ABSENT`

---

## 6. DB 증거 (`staff_device_tokens`)

```json
{
  "device_key": "android_e6f6ffa8-8c7e-4638-a807-9b249bba5cf9",
  "device_label": "samsung SM-A165N",
  "staff_invite_id": null,
  "user_id": "f64c5872-6e38-4473-a0bf-a51dba23487b",
  "enabled": true,
  "last_seen_at": "2026-07-04T00:12:23.927+00:00",
  "app_version": "0.1.0"
}
```

DB 스키마 변경 없음(테이블 기존 존재). REST read-only 검증.

---

## 7. 범위 밖 항목 (이번 Phase 미포함)

- **실제 푸시 발송**: `STAFF_FCM_ENABLED=1` + Vercel `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` 필요 — **OFF 유지**, 별도 Phase.
- **메시지 목록 실패 `CHAT_LIST_LOAD_ABORT`**: 웹(StaffChatClient/useChatLoader/useChatWatchdog) 측 이슈, 3C·FCM 무관. 별도 이슈로 분리(아래 조사 계획).
- **APK 배포/스토어**: debug APK 사이드로드 검증만. 릴리스 서명/배포 미포함.
- **브랜치 push**: 로컬만 유지, origin push 안 함.

---

## 8. 다음 단계

1. `CHAT_LIST_LOAD_ABORT` 별도 이슈 처리(웹 브랜치에서, 이 브랜치 무수정).
2. (승인 시) Push 활성화 Phase: Firebase service-account env + `STAFF_FCM_ENABLED=1` → 실제 알림 도착 검증.
3. (승인 시) 브랜치 push / 릴리스 APK 서명·배포.

---

## 부록: CHAT_LIST_LOAD_ABORT 분리 이슈 (조사만, 이 브랜치 무수정)

메시지 목록 "불러오지 못했습니다" 증상. **웹(StaffChatClient / useChatLoader / useChatWatchdog) 측이며 3C·FCM과 무관.**

### 확보된 증거
- ✅ `/api/chat/list` = **HTTP 200** (서버 / RLS / env 정상)
- ✅ 로그 순서 관찰: `CHAT_WATCHDOG_HIDDEN_POLL` → `CHAT_LIST_LOAD_ABORT`
- ✅ WebView에서 재현
- ✅ 프로덕션 origin/main에도 동일 로직 존재(`useChatLoader.ts` / `useChatWatchdog.ts`, `CHAT_LIST_LOAD_ABORT`×3 / `HIDDEN_POLL`×4)

### 코드상 메커니즘 (관찰된 사실)
- `CHAT_LIST_LOAD_ABORT`는 `useChatLoader.ts`에서 `AbortController.abort()` 경로로 로깅된다 —
  새 로드가 in-flight 로드를 대체(line 158), 언마운트 cleanup(line 570), initial-retry(line 548).
- `useChatWatchdog.ts`는 `document.hidden === true`면 30초마다 HIDDEN_POLL로
  `loadFull('hidden_tab_poll')`를 트리거한다(line 148–156).

### 아직 확보하지 못한 증거
- ❌ `document.hidden = true`를 **직접 측정한 증거 없음**
- ❌ `webView.onResume()` / `onPause()` 미호출과의 **인과관계 미입증**

### 가설 (미확정)
WebView의 visibility 상태(`document.hidden` 또는 `visibilityState`)가 예상과 다르게 유지되어,
watchdog hidden poll이 초기 load와 **경쟁(race)** 하며 이를 abort할 가능성이 있다.
**현재는 가설이며, 다음 Phase에서 `document.hidden` / `visibilityState`를 실측하여 확정한다.**

---

## APK 정보

| 항목 | 값 |
|---|---|
| 경로 | `C:\dev\autoflow-android-3c\android-staff\app\build\outputs\apk\debug\app-debug.apk` |
| 생성 시각 | 2026-07-04 09:10:39 (KST) |
| 크기 | 3,272,970 bytes |
| git commit | `7ef9ded6c513c01371dcf360fe55bd53c194b22f` |
| 브랜치 | `feature/staff-fcm-android-3c` (로컬, push 안 함) |
| versionCode | 1 |
| versionName | 0.1.0 |
| 종류 | debug (debug 키 자동 서명), applicationId `com.autoflow.staff` |
