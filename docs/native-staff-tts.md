# Native Staff TTS — 설계 문서 (PR1 MVP)

**상태:** 설계 확정 (코드 미구현)  
**작성 목적:** 웹 Chrome 자동 TTS 본선 중단 후, Android native를 본선 트랙으로 전환하기 위한 PR1 범위 정의  
**관련 웹 문서:** [WEB_PUSH_PLAN.md](./chat/WEB_PUSH_PLAN.md) (웹 푸시 한계 참고)

---

## 0. 제품 결정 요약

### 우선순위 (필수 vs 옵션)

| 우선순위 | 기능 | Native | Web |
|----------|------|--------|-----|
| **필수** | 알림음 (sound) | FCM notification channel sound | `playNotificationTone` beep |
| **필수** | 알림창 (notification / toast) | OS notification + in-app 배너 | toast + OS notification (탭 열림 시) |
| **옵션** | 자동 TTS (러시아어 음성) | foreground + 설정 ON 시만 | 본선 중단 (수동 🔊만) |

**원칙:** TTS 실패·미설치·설정 OFF여도 **알림음 + 알림창은 반드시 동작**해야 한다. 자동 TTS는 이 필수 경로를 막거나 대체하지 않는다.

| 항목 | 결정 |
|------|------|
| 웹 자동 TTS | **옵션 제거 / 본선 중단** — autoplay 한계; 수동 🔊만 |
| 웹 필수 | 알림음 + 배너(toast) + (가능 시) OS notification |
| Native 본선 | **알림음 + notification** — PR1 MVP **B2** |
| Native 자동 TTS | **옵션** — foreground + `auto_tts_enabled` 시에만 |
| B1 (foreground service) | 추후 현장 필요 확인 후 **확장안으로만** 문서화 |

**B2 (PR1) 한 줄 정의**

- **모든 상태:** 메시지 수신 시 **알림음 + 알림창 필수**
- **Foreground (옵션):** `auto_tts_enabled`이면 `translated_text_ru` 자동 읽기
- **Background / 잠금:** 자동 TTS 없음 — 알림음 + 진동 + notification만
- 알림 탭 → 앱 열림 → 메시지 확인 (수동 🔊 유지)

---

## 1. B1 / B2 비교

### B1 — Foreground Service + 지속 알림

| | |
|---|---|
| **동작** | Android `ForegroundService`로 프로세스 상주. Realtime/FCM 수신 후 잠금·주머니 상태에서도 **자동 음성 재생 가능성 높음** |
| **장점** | 화면 꺼짐·앱 백그라운드에서도 연속 음성 알림에 가장 근접 |
| **단점** | 배터리 소모, **상주 알림**(지속 notification) UX 부담, 삼성/샤오미 등 **배터리 최적화 예외 설정** 안내 필요, Play 정책·현장 교육 비용 |
| **PR1** | **미채택** — 문서화만 |

### B2 — 알림 필수 + Foreground 자동 TTS 옵션 (PR1 채택)

| | |
|---|---|
| **필수** | FCM → **notification sound + 알림창** (foreground/background/lock 공통) |
| **옵션** | Foreground + `auto_tts_enabled` → `TextToSpeech`로 `translated_text_ru` 읽기 |
| **Background / Lock** | 자동 TTS 없음 — **알림음 + 진동 + notification**만 |
| **장점** | 필수 경로 단순·안정, TTS 없이도 MVP 출시 가능 |
| **단점** | 자동 음성 OFF/실패 시 언어 장벽은 수동 🔊·알림 본문으로 보완 |
| **PR1** | **채택** |

### B1 확장 트리거 (추후 검토)

현장에서 **알림음+알림창만으로 부족**하고 아래가 반복되면 B1 POC 검토:

- 화면 꺼진 채 **자동 러시아어 음성**이 반드시 필요
- `auto_tts_enabled` foreground 옵션으로도 현장 만족 불가
- 배터리·상주 알림 UX를 현장이 수용

---

## 2. 메시지 / 번역 / FCM 순서

**원칙**

1. **알림음 + 알림창 = 필수** — FCM·notification 경로는 TTS와 독립
2. **자동 TTS = 옵션** — `translated_text_ru`가 있을 때만 foreground에서 시도
3. Native는 TTS용 ru를 payload에서 읽는다. DB fetch 후 번역 race를 **다시 만들지 않는다**

### 서버 파이프라인

```text
1. chat_messages INSERT (original_text, original_lang, room_no, …)
2. ru 번역 작업 (병렬·비동기 가능)
3. translated_text.ru DB 저장
4. FCM 발사 (필수 경로)
   - notification title/body: translated_text_ru 우선, 없으면 original_text
   - data: message_id, room_no, urgency, translated_text_ru (있으면)
5. Native 수신
   a) 필수: notification sound + 알림창 표시
   b) 옵션: foreground + auto_tts_enabled + ru 있음 → TextToSpeech.speak
```

**번역 지연 시:** ru 미완료여도 **original_text로 알림은 발사**한다 (필수 경로 보장). ru 도착 후 별도 FCM/data update는 PR1 범위 외 — 수동 🔊·앱 내 갱신으로 보완.

### 금지 사항

- TTS 실패·ru 누락을 이유로 **notification 미발송**
- FCM에 `message_id`만 보내고 native에서 `translated_text` 재조회 후 TTS (race·지연)
- 웹과 동일한 “INSERT 시점 TTS → UPDATE 번역 재시도” 패턴을 native에 복제

### FCM payload (data, 권장)

| 필드 | 타입 | 설명 |
|------|------|------|
| `room_no` | string | 객실 번호 |
| `message_id` | string (uuid) | 중복 처리·로그 키 |
| `original_text` | string | 원문 — **알림 본문 fallback (필수)** |
| `translated_text_ru` | string | **옵션 TTS SoT** — 있으면 foreground 자동 읽기 + 알림 본문 우선 |
| `tts_lang` | string | `ru` (`spoken_lang`과 일치, TTS 옵션용) |
| `auto_tts_default` | string | optional — invite/device 기본값 힌트 (`true`/`false`) |
| `urgency` | string | `normal` \| `urgent` |
| `category` | string | optional — maintenance, cleaning, … |

### Native 처리

```text
onMessageReceived (모든 상태 — 필수)
  → show notification (sound + vibration + 알림창)
  → body = translated_text_ru || original_text

onMessageReceived (foreground — 옵션)
  → if auto_tts_enabled && translated_text_ru non-empty
       → TextToSpeech.speak(translated_text_ru)
  → else if auto_tts_enabled && ru empty
       → diag: payload_missing_ru_tts_skipped
       → (알림은 이미 표시됨 — 정상)

onMessageReceived (background / lock)
  → 자동 TTS 없음 (옵션 경로 미진입)
```

### 웹과의 역할 분담

| 채널 | 필수 | 옵션 |
|------|------|------|
| 웹 `/staff-chat` | toast + beep | 수동 🔊 |
| Native app | notification sound + 알림창 | foreground 자동 TTS (`auto_tts_enabled`) |

---

## 3. Android Native TTS (옵션)

> 자동 TTS는 **옵션 기능**이다. TTS 엔진·음성 데이터·init 실패는 **알림 필수 경로를 중단시키지 않는다.**

### 엔진

- **Android `TextToSpeech`** (시스템 TTS)
- **언어 SoT:** `staff_invites.spoken_lang` → PR1 MVP는 **ru 고정** (`spoken_lang=ru` 청소 직원)

### Locale

```kotlin
// 예시
val locale = Locale("ru") // 또는 Locale.forLanguageTag("ru-RU")
tts.setLanguage(locale)
```

- `onInit` 콜백에서 `TextToSpeech.LANG_MISSING_DATA` / `LANG_NOT_SUPPORTED` 분기
- ru voice data 없음 → `Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)` 또는 시스템 TTS 설정 화면 안내

### 초기화 패턴

```text
Application 또는 StaffChatActivity onCreate
  → TextToSpeech(context, OnInitListener)
  → onInit SUCCESS
       → setLanguage(ru)
       → 결과 코드 확인
  → 실패 시 diag + 설정 안내 UI (1회)
```

### 재생 규칙 (B2)

| 앱 상태 | 알림음 + 알림창 | 자동 TTS |
|---------|----------------|----------|
| Foreground | **필수** | 옵션 (`auto_tts_enabled`) |
| Background | **필수** | 없음 |
| Lock screen | **필수** | 없음 |

### 설정: `auto_tts_enabled`

- 앱 설정 또는 invite 기본값 — **사용자가 끌 수 있음**
- PR1 기본값: `true` (foreground 자동 읽기 시도) — 단, OFF여도 MVP 충족
- OFF 시: 알림음 + 알림창 + 수동 🔊만

### 수동 다시 읽기

- 메시지 상세/리스트에 **🔊 다시 읽기** 유지 (gesture 불필요, native TTS는 정책 제약 없음)

---

## 4. 운영 UX

### 모든 상태 (필수)

1. FCM 수신
2. **알림음** (notification channel sound)
3. **알림창** 표시 (title: room/urgency, body: ru 또는 original)
4. urgent 시 진동 패턴 강화

### Foreground (옵션 — 자동 TTS)

1. 위 필수 경로 완료 후
2. `auto_tts_enabled`이면 `translated_text_ru` 음성 재생
3. TTS 실패해도 1–3은 이미 완료된 상태

### Background / Lock

1. 필수 경로만 (알림음 + 알림창 + 진동)
2. 자동 TTS 없음

### Notification 탭

1. `PendingIntent` → StaffChatActivity (또는 native 메인)
2. `message_id` / `room_no` deep link
3. 해당 메시지 하이라이트 + 필요 시 수동 🔊

### 온보딩 체크리스트 (현장)

**필수**

- [ ] 알림 권한 허용 (Android 13+ `POST_NOTIFICATIONS`)
- [ ] 알림 채널 sound 동작 확인 (urgent / normal)
- [ ] 배터리 최적화 예외 (알림 누락 방지 — B2에서 권장)

**옵션 (자동 TTS 사용 시)**

- [ ] 러시아어 TTS 음성 데이터 설치
- [ ] 설정에서 “자동 읽기” ON/OFF 안내

---

## 5. 서버 / API 설계

### 기존 유지

- `staff_invites.spoken_lang` — 수신 직원 TTS/읽기 언어 SoT (`ko` \| `ru` \| …)
- PR1 push 대상: `spoken_lang=ru` staff (Cleaner-1/2 등)

### 신규: FCM token 저장

**테이블 초안: `staff_device_tokens`**

```sql
create table staff_device_tokens (
  id uuid primary key default gen_random_uuid(),
  staff_invite_id uuid not null references staff_invites(id) on delete cascade,
  -- 또는 user_id uuid references users(id) — invite와 1:1 매핑 정책에 따름
  fcm_token text not null,
  platform text not null default 'android', -- android | ios (future)
  device_label text,                        -- optional: "Cleaner-1 phone"
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (fcm_token)
);

create index idx_staff_device_tokens_invite
  on staff_device_tokens (staff_invite_id);
```

### API 초안

| Method | Path | 역할 |
|--------|------|------|
| POST | `/api/staff/devices/register` | `{ invite_token \| session, fcm_token, platform, app_version }` → upsert token |
| DELETE | `/api/staff/devices/unregister` | 로그아웃·재설치 시 token 제거 |
| (internal) | `lib/push/sendStaffFcm.ts` | 번역 완료 후 대상 staff에게 push |

### Push 발사 시점

**위치 (권장):** 메시지 INSERT 직후 알림용 FCM (필수). ru 번역 완료 시 payload에 `translated_text_ru` 포함해 **재발송 없이** 첫 push에 넣을 수 있으면 insert+translate 완료 후 1회 발사.

```text
메시지 저장
  → (가능하면) ru 번역 완료
  → FCM 발사 [필수]
       notification: sound + body (ru || original)
       data: message_id, room_no, translated_text_ru?, urgency
  → native: 알림 표시 [필수]
  → native: optional TTS if foreground + enabled + ru
```

### 대상 staff 결정 (PR1)

- 메시지 `token_id` / `user_id` / room 매핑으로 **수신 staff invite** 목록 산출
- 발신자 본인 제외 (self-message no push)
- `spoken_lang=ru` 인 invite에만 ru TTS payload

### 환경 변수

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` (또는 service account JSON)
- 기존 `OPENAI_API_KEY` — 서버 TTS는 웹 fallback용 유지 가능, native PR1은 **기기 TTS** 사용

---

## 6. 실패 / 진단

### 심각도

| 등급 | 대상 | PR1 대응 |
|------|------|----------|
| **P0** | 알림음·알림창 실패 | blocker — 반드시 수정 |
| **P2** | 자동 TTS 실패 | non-blocker — diag + 수동 🔊 |

| 코드 | 심각도 | 의미 | 대응 |
|------|--------|------|------|
| `notification_permission_denied` | P0 | POST_NOTIFICATIONS 거부 | 설정 앱 안내 |
| `fcm_receive_failed` | P0 | onMessage 예외 / token 무효 | token 재등록 |
| `notification_display_failed` | P0 | 알림창 미표시 | 채널·권한 점검 |
| `notification_sound_failed` | P0 | 알림음 미재생 | 채널 sound·DND 점검 |
| `battery_optimization_restricted` | P0 | 백그라운드 FCM 지연/누락 | 배터리 예외 안내 |
| `native_tts_init_failed` | P2 | `TextToSpeech` onInit 실패 | 자동 읽기만 불가 |
| `native_tts_lang_missing_data` | P2 | `LANG_MISSING_DATA` | TTS 데이터 설치 intent |
| `native_tts_lang_not_supported` | P2 | `LANG_NOT_SUPPORTED` | 기기 TTS 엔진 변경 안내 |
| `payload_missing_translated_text_ru` | P2 | ru 없음 — TTS skip | 알림은 original로 이미 표시 |
| `auto_tts_disabled` | — | 사용자 설정 OFF | 정상 |
| `foreground_tts_skipped_background` | — | B2 by design | 정상 |
| `duplicate_message_id` | — | idempotent skip | 정상 |

### 서버 diag

| 코드 | 심각도 | 의미 |
|------|--------|------|
| `fcm_send_failed` | P0 | Firebase API 오류 |
| `fcm_skipped_no_tokens` | P0 | 등록 기기 없음 |
| `fcm_sent_notification_only` | — | ru 없이 original로 알림 발사 (허용) |
| `fcm_sent_with_ru` | — | ru 포함 발사 (TTS 옵션 가능) |

### 현장 확인 시나리오

**P0 완료 기준:** Lock / Background / Foreground 모두 **알림음 + 알림창** 동작. 자동 TTS는 별도 옵션 검증.

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| **A** | PC `/chat` 열림, staff 메시지 수신 | toast + beep |
| **B** | 모바일 `/staff-chat` 열림, manager 메시지 수신 | toast + beep |
| **C** | 모바일 앱 background | 시스템 알림창 + 알림음/진동 |
| **D** | 모바일 lock | 시스템 알림창 + 알림음/진동 |
| **E** | ru 번역 누락 | `original_text`로 알림 표시, TTS만 skip (P2) |
| **F** | `auto_tts_enabled=false` | 알림음 + 알림창 정상, 자동 음성 없음 |

**웹 (A/B) 구현 메모**

- Foreground = `visibilityState === 'visible'` (포커스 불필요)
- `/chat`: `useChatNotifications` — toast + beep
- `/staff-chat`: toast 항상, beep는 `alertsEnabled`(🔊) + foreground
- 자동 TTS: `auto_tts_enabled` (기본 OFF) — `lib/chat/staffAlertPrefs.ts`

**Native (C/D) 구현 메모**

- `lib/push/nativeStaffNotifyHandler.ts` — Kotlin 포팅 참고
- FCM payload: `lib/push/buildStaffFcmPayload.ts`
- 서버: `sendStaffPushAfterMessage` (`/api/chat/send` 후처리)

**필수 (MVP 통과 조건)**

1. Lock: 알림음 + 알림창 + 진동
2. Foreground: 알림음 + 알림창 (TTS 없이도 통과)
3. 알림 탭 → 해당 room 메시지 표시
4. 알림 권한 거부 시 — 설정 안내 (P0 blocker)

**옵션 (자동 TTS)**

5. Foreground + `auto_tts_enabled`: ru 음성 재생
6. TTS 실패: 알림은 정상 (P2)

---

## 7. Appendix — Web Audio (이번 스코프 제외)

### 웹에서 검증된 사실 (2025–2026)

- Android Chrome **autoplay 정책**: 비제스처 `HTMLMediaElement.play()` → `NotAllowedError`
- `serverTtsUnlocked` 앱 플래그 ≠ 브라우저 gesture lock
- Singleton audio element로 unlock/play element 통일해도, **Realtime → async fetch** 경로에서는 transient user activation 소멸
- Foreground Chrome 탭에서 **수동 🔊** (`fromUserGesture=true`)는 동작 가능

### 웹 PR1 유지 범위

| 기능 | 우선순위 | 구현 |
|------|----------|------|
| Realtime toast (알림창) | **P0** | `/chat`, `/staff-chat` |
| `playNotificationTone` (알림음) | **P0** | visible foreground tab |
| OS notification (hidden tab) | **P0** | `showBrowserNotification` |
| 수동 🔊 | 옵션 | gesture / native TTS |
| 자동 TTS (Realtime) | 옵션 OFF | `auto_tts_enabled` 기본 false |

### 웹 자동 TTS를 native로 대체하지 않는 이유

- 잠금/백그라운드/화면 꺼짐이 **청소 직원 핵심 사용 시나리오**
- Chrome 탭 lifecycle + autoplay는 해당 시나리오에 **구조적으로 부적합**
- Native FCM + system TTS가 요구사항에 맞음

---

## 8. PR1 구현 체크리스트 (참고)

### 서버

- [ ] `staff_device_tokens` migration
- [ ] `POST /api/staff/devices/register`
- [ ] 번역 완료 후 FCM 발사 (ru in payload)
- [ ] self-message / sound-off 정책 (필요 시 invite 설정)

### Android

- [ ] Firebase Cloud Messaging 연동
- [ ] Notification channels + **sound 필수** (urgent / normal) — **P0**
- [ ] ForegroundService **없음** (B2)
- [ ] Deep link to message
- [ ] `TextToSpeech` ru + onInit — **옵션**
- [ ] `auto_tts_enabled` 설정 — **옵션**

### 웹 (변경 최소)

- [ ] **알림음 + toast 필수 유지**
- [ ] 자동 TTS 제거 또는 feature flag off
- [ ] 수동 🔊 유지 (옵션)

---

## 9. 문서 이력

| 날짜 | 변경 |
|------|------|
| 2026-06 | 초안 — B2 PR1, FCM+ru payload, 웹 자동 TTS 중단 |
| 2026-06 | **알림음+알림창 P0** — 웹 foreground toast/beep, `auto_tts` 분리, FCM payload 스텁 |
